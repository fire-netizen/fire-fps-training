// 사다리 오르내리기 · 로프 등반/하강 전용 조작 (Player.control 로 사용)
// path: A(아래 끝) → B(위 끝) 를 s(0~1)로 오르내림. W/↑ = 위, S/↓ = 아래. lat 옵션이 있으면 A/D 로 좌우 이동(로프 하강 시 화점 회피)
import * as THREE from 'three';
import { clamp } from './util.js';

export class Climb {
  constructor(G, o) {
    this.G = G;
    this.A = o.A.clone(); this.B = o.B.clone();
    this.s = o.s ?? 0;
    this.speed = o.speed ?? 1.5;
    this.face = o.face ?? Math.PI; // 벽을 바라보는 방향(yaw)
    this.lat = o.lat || 0; // 좌우 이동 허용 폭
    this.x0 = o.A.x; this.dx = 0;
    this.onTop = o.onTop; this.onBottom = o.onBottom; this.onTick = o.onTick;
    this.label = o.label || '';
    this.len = this.A.distanceTo(this.B);
    this.done = false;
    this._moving = 0;
  }

  start() {
    const G = this.G, P = G.player;
    P.control = this;
    P.crouch = false; P.firing = false; P.tool && P.equip(null);
    this.place();
    P.heading = this.face; P.root.rotation.y = this.face;
    G.camRig.yaw = this.face; G.camRig.pitch = 0.18; G.camRig.dist = 4.2; G.camRig.pitchBack = null;
    G.ui.setPrompt(null);
    G.ui.toast(this.label || 'W/S 또는 조이스틱 위·아래로 이동', 'info');
  }

  place() {
    const P = this.G.player, s = this.s;
    P.pos.set(this.A.x + (this.B.x - this.A.x) * s + this.dx, this.A.y + (this.B.y - this.A.y) * s, this.A.z + (this.B.z - this.A.z) * s);
  }

  update(dt) {
    const G = this.G, P = G.player, inp = G.input, st = inp.stick;
    const v = st.analog ? -st.y : (inp.isDown('KeyW') || inp.isDown('ArrowUp') ? 1 : 0) - (inp.isDown('KeyS') || inp.isDown('ArrowDown') ? 1 : 0);
    const h = st.analog ? st.x : (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
    const k = clamp(v, -1, 1);
    this._moving = Math.abs(k);
    this.s = clamp(this.s + (k * this.speed * dt) / Math.max(0.5, this.len), 0, 1);
    if (this.lat && Math.abs(h) > 0.2) this.dx = clamp(this.dx + h * 1.7 * dt, -this.lat, this.lat);
    this.place();
    P.heading = this.face; P.root.rotation.y = this.face;
    P.human.update(dt, { speed: this._moving * 1.9, carry: !!P.carry });
    P.updateHazards(dt);
    if (P.hurtFlash > 0) P.hurtFlash = Math.max(0, P.hurtFlash - dt * 1.6);
    this.onTick && this.onTick(this);
    if (!this.done) {
      if (this.s >= 0.999 && k > 0.3 && this.onTop) { this.done = true; this.finish(); this.onTop(this); }
      else if (this.s <= 0.001 && k < -0.3 && this.onBottom) { this.done = true; this.finish(); this.onBottom(this); }
    }
  }

  finish() { const P = this.G.player; if (P.control === this) P.control = null; }
  get height() { return this.A.y + (this.B.y - this.A.y) * this.s; }
}

// 사다리 3D 모델 (A→B 로 기대어 있음)
export function makeLadder(A, B, width = 0.56) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(B, A);
  const len = dir.length();
  const mat = new THREE.MeshStandardMaterial({ color: '#d9a21e', roughness: 0.45, metalness: 0.5 });
  const rung = new THREE.MeshStandardMaterial({ color: '#c8cdd2', roughness: 0.4, metalness: 0.7 });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.05), mat);
    r.position.set(s * width / 2, len / 2, 0);
    r.castShadow = true;
    g.add(r);
  }
  const n = Math.floor(len / 0.3);
  for (let i = 1; i < n; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, width, 8), rung);
    r.rotation.z = Math.PI / 2; r.position.set(0, i * 0.3, 0.0);
    g.add(r);
  }
  g.position.copy(A);
  // +y 를 dir 방향으로 회전
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return g;
}

// 소방관이 어깨에 멘 사다리 (운반 중 표시)
export function makeCarriedLadder() {
  const g = makeLadder(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.6, 0));
  const w = new THREE.Group();
  g.rotation.set(0, 0, 0);
  g.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // 눕힘: 몸 앞뒤 방향
  g.position.set(0.2, 1.45, -1.3);
  w.add(g);
  return w;
}

export function makeRope(A, B) {
  const dir = new THREE.Vector3().subVectors(B, A), len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), new THREE.MeshStandardMaterial({ color: '#e0442a', roughness: 0.8 }));
  m.position.copy(A).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
