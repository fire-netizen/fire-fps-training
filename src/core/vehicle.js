// 소방차 자유 운전 — Player.control 로 연결되어 플레이어 대신 소방차를 조종합니다.
// PC: W/S 가속·후진, A/D 조향, Space 브레이크, R 사이렌, E 하차 / 모바일: 이동 조이스틱(좌우=조향, 위아래=가속), 오른쪽 버튼(브레이크·하차)
import * as THREE from 'three';
import { clamp, damp, dampAngle } from './util.js';

const MAX_FWD = 17, MAX_REV = 6;

export class TruckDriver {
  /**
   * opts.target  : { pos:Vector3, radius, label } 목적지(출동 운전). 도착하면 onArrive() 호출
   * opts.canExit : 하차 가능 여부(출동 운전 중에는 false)
   * opts.siren   : 사이렌 기본값
   */
  constructor(G, opts = {}) {
    this.G = G;
    this.opts = opts;
    this.truck = G.world.truck;
    this.v = 0;
    this.siren = !!opts.siren;
    this.skip = !!opts.target; // 목적지가 있으면 '자동 출동(G/💡)'으로 건너뛸 수 있음
    this.prompt = null;
    this._idle = 0;
    this.arrived = false;
    this._tmp = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  start() {
    const G = this.G, P = G.player;
    P.control = this;
    P.root.visible = false;
    P.crouch = false; P.firing = false;
    G.world.truckSolid.active = false; // 운전 중엔 직접 충돌 처리
    G.camRig.dist = 12.5;
    G.camRig.pitch = 0.3;
    G.camRig.pitchBack = null;
    G.camRig.yaw = this.headingYaw();
    G.camRig.snap();
    this.syncPlayer();
    G.ui.toast(this.opts.target ? '🚒 W/S 가속·후진 · A/D 조향 · Space 브레이크 · R 사이렌 · G 자동 출동' : '🚒 W/S 가속·후진 · A/D 조향 · Space 브레이크 · R 사이렌 · E 하차', 'info');
  }

  headingYaw() { const th = this.truck.rotation.y; return Math.atan2(Math.cos(th), -Math.sin(th)); }

  syncPlayer() {
    const P = this.G.player;
    P.pos.set(this.truck.position.x, 0, this.truck.position.z);
    P.heading = this.headingYaw();
    P.root.rotation.y = P.heading;
  }

  update(dt) {
    const G = this.G, inp = G.input, T = this.truck, W = G.world;
    const st = inp.stick;
    const th = st.analog ? -st.y : (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
    const steer = st.analog ? st.x : (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
    const brake = inp.isDown('Space');
    if (inp.pressed('KeyR')) { this.siren = !this.siren; G.sfx.click(); }

    // ── 속도
    let a = 0;
    if (brake) a = this.v > 0 ? -22 : 22;
    else if (th > 0.08) a = this.v < -0.5 ? 16 : 8.5 * th;
    else if (th < -0.08) a = this.v > 0.5 ? -16 : -5.5 * -th;
    else a = -Math.sign(this.v) * Math.min(Math.abs(this.v) / Math.max(dt, 1e-3), 3.2);
    this.v = clamp(this.v + a * dt, -MAX_REV, MAX_FWD * (st.analog ? Math.max(0.35, Math.abs(th)) : 1));
    if (brake && Math.abs(this.v) < 0.3) this.v = 0;

    // ── 조향 (속도가 있어야 방향이 바뀜)
    const k = clamp(this.v / 4, -1, 1) * (1 - 0.4 * Math.abs(this.v) / MAX_FWD);
    T.rotation.y -= steer * 0.95 * k * dt; // D(오른쪽)=시계 방향
    const th2 = T.rotation.y;
    const fx = Math.cos(th2), fz = -Math.sin(th2);

    // ── 이동 + 충돌 (앞·중앙·뒤 3개 원으로 건물·나무·울타리를 비켜 감)
    const pos = T.position;
    pos.x += fx * this.v * dt; pos.z += fz * this.v * dt;
    let push = 0;
    for (const [off, r] of [[3.3, 1.25], [0, 1.6], [-3.3, 1.25]]) {
      const p = this._p.set(pos.x + fx * off, 0, pos.z + fz * off);
      const before = this._b.copy(p);
      W.move(p, r, 0, 0);
      const dx = p.x - before.x, dz = p.z - before.z;
      pos.x += dx; pos.z += dz; push += Math.hypot(dx, dz);
    }
    if (push > 0.03) {
      if (Math.abs(this.v) > 6 && (!this._bump || performance.now() - this._bump > 700)) { this._bump = performance.now(); G.shake = Math.max(G.shake || 0, 0.5); G.sfx.hurt && G.sfx.hurt(); }
      this.v *= 0.55;
    }
    T.position.y = 0;
    this.syncPlayer();

    // ── 카메라: 입력이 없으면 차 뒤쪽으로 천천히 정렬
    if (inp.dx || inp.dy) this._idle = 0; else this._idle += dt;
    if (this._idle > 1.0 && Math.abs(this.v) > 0.5) {
      const hy = this.headingYaw() + (this.v < 0 ? Math.PI : 0);
      G.camRig.yaw = dampAngle(G.camRig.yaw, hy, 1.8, dt);
    }

    // ── 목적지 / 하차
    const tg = this.opts.target;
    if (tg) {
      const d = Math.hypot(pos.x - tg.pos.x, pos.z - tg.pos.z);
      this.dist = d;
      this.prompt = null;
      if (d < (tg.radius || 7) && !this.arrived) {
        this.arrived = true;
        this.v = 0;
        this.opts.onArrive && this.opts.onArrive('arrive');
      }
      if (inp.pressed('KeyH') || inp.pressed('KeyG')) { if (!this.arrived) { this.arrived = true; this.opts.onArrive && this.opts.onArrive('skip'); } }
    } else {
      this.prompt = { label: '소방차에서 내리기 — E (정지 상태에서)', ratio: null };
      this.canExitNow = Math.abs(this.v) < 2.5;
      if (inp.pressed('KeyE')) this.onE();
    }
    G.ui.setPrompt(this.prompt ? this.prompt.label : null, null);
    G.player.human.update(dt, { speed: 0 });
  }

  onE() {
    if (this.opts.target) return;
    if (Math.abs(this.v) >= 2.5) { this.G.ui.toast('정차한 뒤 내리세요 (Space 브레이크)', 'warn'); return; }
    this.G.input.hit.delete('KeyE'); // 같은 E 입력으로 곧바로 다시 탑승되는 것 방지
    this.stop();
  }

  // 운전 종료 — 플레이어를 소방차 옆에 내려 줌
  stop(placePlayer = true) {
    const G = this.G, P = G.player, T = this.truck;
    P.control = null;
    P.root.visible = true;
    G.camRig.dist = 4.4;
    G.camRig.pitch = 0.4;
    const th = T.rotation.y;
    const rx = Math.sin(th), rz = Math.cos(th); // 차량 오른쪽(+z 방향 회전)
    if (placePlayer) {
      const p = new THREE.Vector3(T.position.x + rx * 3.4, 0, T.position.z + rz * 3.4);
      G.world.move(p, P.radius, 0, 0);
      P.teleport(p, this.headingYaw());
    }
    G.world.placeTruck(T.position.x, T.position.z, th); // 정차 위치에 충돌 상자 복원
    G.world.truckSolid.active = true;
    G.ui.setPrompt(null);
    this.v = 0;
  }
}
