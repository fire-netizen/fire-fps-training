// 플레이어(소방관) 컨트롤러 + 3인칭 카메라
import * as THREE from 'three';
import { Human } from '../character/human.js';
import { clamp, damp, dampAngle, wrapAngle } from './util.js';

export class CameraRig {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.25;
    this.dist = 4.4;
    this.fov = 58;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.pivot = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  update(dt, player, input, { aiming = false, free = true } = {}) {
    if (free && input) {
      this.yaw -= input.dx * 0.0026;
      this.pitch = clamp(this.pitch + input.dy * 0.0021, -0.75, 1.05);
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const right = this._d.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const crouchDrop = 0.55 * player.human.cr;
    this.pivot.set(player.pos.x, player.pos.y + 1.55 - crouchDrop, player.pos.z);
    const dist = aiming ? 3.3 : this.dist;
    const shoulder = aiming ? 0.62 : 0.45;
    const desired = new THREE.Vector3().copy(this.pivot).addScaledVector(this.dir, -dist).addScaledVector(right, shoulder);
    desired.y += 0.15;
    // 벽 충돌: 피벗에서 목표 위치로 레이캐스트
    const toCam = desired.clone().sub(this.pivot);
    const len = toCam.length();
    toCam.normalize();
    const hit = this.world.raycast(this.pivot, toCam, len);
    const use = Math.max(0.7, Math.min(len, hit.dist - 0.3));
    desired.copy(this.pivot).addScaledVector(toCam, use);
    desired.y = Math.max(0.35, desired.y);
    this.pos.lerp(desired, 1 - Math.exp(-18 * dt));
    if (dt === 0) this.pos.copy(desired);
    const cam = this.engine.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.pos.x + this.dir.x, this.pos.y + this.dir.y, this.pos.z + this.dir.z);
    const tf = aiming ? 50 : 58;
    this.fov = damp(this.fov, tf, 10, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

export class Player {
  constructor(G) {
    this.G = G;
    this.human = new Human({ skin: '#c99472', hair: '#1b1511' });
    this.root = this.human.root;
    G.engine.scene.add(this.root);
    this.pos = this.root.position;
    this.heading = 0;
    this.radius = 0.38;
    this.speed = 0;
    this.crouch = false;
    this.sprint = false;
    this.mask = false;
    this.tool = null;
    this.allowed = { hose: false, ext: false, tic: false };
    this.hoseReady = false;
    this.tic = false;
    this.mode = 'jet';
    this.pin = true; // 소화기 안전핀이 꽂혀 있음
    this.firing = false;
    this.aiming = false;
    this.carry = null;
    this.frozen = false;
    this.tether = null;
    this.hurtFlash = 0;
    this.sweepAccum = 0;
    this.lastAimYaw = 0;
    this.stats = { hp: 100, maxHp: 100, air: 100, water: 100, ext: 100 };
    this.log = { hot: 0, smoke: 0 };
    this.onHurt = null;
    this.aimPoint = new THREE.Vector3();
    this.aimDist = 20;
    this._m = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  setGear(g) { this.human.setGear({ ...g, mask: this.mask && g.hood }); this.gear = g; }
  get gearOn() { return this.gear || {}; }

  setMask(v) { this.mask = v; this.human.setGear({ ...this.gearOn, mask: v }); }

  teleport(p, yaw = 0) {
    this.pos.set(p.x, p.y || 0, p.z);
    this.heading = yaw;
    this.root.rotation.y = yaw;
    this.G.cam.yaw = yaw;
    this.G.cam.pitch = 0.28;
    this.speed = 0;
  }

  resetStats(progress) {
    this.stats.hp = this.stats.maxHp = progress.maxHp;
    this.stats.air = 100;
    this.stats.water = 100;
    this.stats.ext = 100;
    this.hurtFlash = 0;
    this.crouch = false;
    this.pin = true;
    this.firing = false;
  }

  equip(tool) {
    if (tool && !this.allowed[tool]) return false;
    if (tool === 'hose' && !this.hoseReady) return false;
    this.tool = tool;
    this.human.setTool(tool);
    this.human.setPin(this.pin);
    return true;
  }

  hurt(amount, reason = '') {
    if (amount <= 0) return;
    this.stats.hp = Math.max(0, this.stats.hp - amount);
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 30);
    this.onHurt && this.onHurt(amount, reason);
  }

  get alive() { return this.stats.hp > 0; }

  // 카메라 중앙을 기준으로 한 조준점
  computeAim() {
    const cam = this.G.engine.camera;
    const o = this.G.camRig.pos, d = this.G.camRig.dir;
    const hit = this.G.world.raycast(o, d, 45);
    this.aimDist = Math.max(2.5, hit.dist);
    this.aimPoint.copy(o).addScaledVector(d, this.aimDist);
    return this.aimPoint;
  }

  update(dt) {
    const G = this.G, inp = G.input, st = this.stats, human = this.human;
    if (this.frozen) { human.update(dt, { speed: 0 }); return; }

    // ── 입력
    const fireKey = inp.mouse(0) || inp.isDown('Space');
    const wantAim = !!this.tool && this.tool !== 'tic' && (fireKey || inp.mouse(2));
    this.aiming = wantAim;
    if (inp.pressed('KeyC')) this.crouch = !this.crouch;
    if (inp.pressed('Digit1')) { if (this.equip(this.tool === 'hose' ? null : 'hose')) G.ui.toast(this.tool ? '관창(방수)' : '장비 해제', 'info'); else if (this.allowed.hose) G.ui.toast('호스를 먼저 전개하세요', 'warn'); }
    if (inp.pressed('Digit2')) { if (this.equip(this.tool === 'ext' ? null : 'ext')) G.ui.toast(this.tool ? '소화기' : '장비 해제', 'info'); }
    if (inp.pressed('KeyT') && this.allowed.tic) { this.tic = !this.tic; G.sfx.click(); }
    if (inp.pressed('KeyQ') && this.tool === 'hose') { this.mode = this.mode === 'jet' ? 'fog' : 'jet'; G.ui.toast(this.mode === 'jet' ? '직사 방수 (원거리·강한 압력)' : '분무 방수 (넓은 범위·복사열 차단)', 'info'); G.sfx.click(); }

    // ── 이동
    const ix = (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
    const iz = (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
    const yaw = G.camRig.yaw;
    const fwd = this._d.set(Math.sin(yaw), 0, Math.cos(yaw));
    let mx = fwd.x * iz + -Math.cos(yaw) * ix, mz = fwd.z * iz + Math.sin(yaw) * ix;
    const len = Math.hypot(mx, mz);
    this.sprint = (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight')) && !this.crouch && !this.carry;
    let spd = 2.9;
    if (this.sprint) spd = 5.4;
    if (this.crouch) spd = 1.6;
    if (this.carry) spd = this.sprint ? 2.2 : 1.9;
    if (this.aiming) spd = Math.min(spd, 2.1);
    let moved = 0;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const before = this._m.copy(this.pos);
      G.world.move(this.pos, this.radius, mx * spd * dt, mz * spd * dt);
      moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
      if (!this.aiming) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 14, dt);
    }
    if (this.aiming || this.tool === 'tic') this.heading = dampAngle(this.heading, yaw, 16, dt);
    // 호스 길이 제한
    if (this.tether) {
      const dx = this.pos.x - this.tether.pos.x, dz = this.pos.z - this.tether.pos.z, d = Math.hypot(dx, dz);
      if (d > this.tether.max) {
        const k = this.tether.max / d;
        this.pos.x = this.tether.pos.x + dx * k; this.pos.z = this.tether.pos.z + dz * k;
        if (!this._tetherWarn || performance.now() - this._tetherWarn > 3000) { G.ui.toast('호스 길이의 한계입니다', 'warn'); this._tetherWarn = performance.now(); }
      }
    }
    this.speed = moved;
    this.root.rotation.y = this.heading;

    // ── 호흡/공기/열/연기
    this.updateHazards(dt);

    // ── 애니메이션
    human.update(dt, {
      speed: this.speed, crouch: this.crouch, aim: this.aiming, carry: !!this.carry, aimPitch: -G.camRig.pitch,
    });
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);

    // ── 방수/소화
    this.updateTool(dt, fireKey);
  }

  updateHazards(dt) {
    const G = this.G, st = this.stats, fx = G.fx;
    // 화염 열기
    let heat = 0;
    for (const f of fx.fires) {
      if (!f.alive) continue;
      const dx = this.pos.x - f.pos.x, dz = this.pos.z - f.pos.z, dy = this.pos.y + 1.0 - f.pos.y;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.3);
      if (d < f.heat) heat = Math.max(heat, Math.pow(1 - d / f.heat, 1.2));
    }
    this.heatLevel = damp(this.heatLevel || 0, heat, 6, dt);
    if (heat > 0) {
      const protect = this.gearOn.coat ? 0.5 : 1;
      this.hurt(heat * 13 * protect * dt * (this.crouch ? 0.8 : 1), 'heat');
      if (!this._heatWarn || performance.now() - this._heatWarn > 4000) { G.ui.toast('복사열 경고! 화점에서 거리를 두세요', 'warn'); this._heatWarn = performance.now(); }
    }
    // 연기 구역
    if (G.world.zone === 'smoky') {
      if (!this.mask) {
        this.hurt(6.5 * dt, 'smoke');
        if (!this._smokeWarn || performance.now() - this._smokeWarn > 4000) { G.ui.toast('유독가스 흡입 중! 면체를 착용하세요', 'warn'); this._smokeWarn = performance.now(); }
      } else {
        const rate = (0.42 + (this.sprint ? 0.5 : 0) + (this.carry ? 0.35 : 0) + (this.firing ? 0.3 : 0)) / G.progress.airEff;
        st.air = Math.max(0, st.air - rate * dt);
        if (st.air <= 0) this.hurt(9 * dt, 'air');
      }
      if (!this.crouch) this.hurt(0.9 * dt * (this.gearOn.coat ? 0.6 : 1), 'hotlayer');
    }
  }

  muzzle(out) {
    this.root.updateWorldMatrix(true, true);
    return this.human.muzzleWorld(out);
  }

  updateTool(dt, fireKey) {
    const G = this.G, st = this.stats, fx = G.fx;
    this.firing = false;
    let water = 0, powder = 0;
    if (this.tool === 'hose' && this.hoseReady && fireKey && st.water > 0) {
      this.firing = true;
      this.computeAim();
      const m = this.muzzle(this._m);
      const speed = this.mode === 'jet' ? 21 : 13;
      const target = this._d.copy(this.aimPoint);
      const d = target.distanceTo(m);
      const t = d / speed;
      target.y += 0.5 * 4.2 * t * t;
      const dir = target.sub(m).normalize();
      if (dir.dot(G.camRig.dir) < 0.2) dir.copy(G.camRig.dir);
      fx.waterMult = G.progress.waterEff;
      fx.sprayWater(m, dir, this.mode, dt);
      st.water = Math.max(0, st.water - (this.mode === 'jet' ? 6.5 : 8) * dt);
      water = this.mode === 'jet' ? 0.2 : 0.14;
      if (st.water <= 0) G.ui.toast('용수 소진! 소화전/소방차에서 보충하세요', 'warn');
    } else if (this.tool === 'ext' && fireKey && !this.pin && st.ext > 0) {
      this.firing = true;
      this.computeAim();
      const m = this.muzzle(this._m);
      const dir = this._d.copy(this.aimPoint).sub(m).normalize();
      if (dir.dot(G.camRig.dir) < 0.2) dir.copy(G.camRig.dir);
      fx.sprayPowder(m, dir, dt);
      st.ext = Math.max(0, st.ext - 6 * dt);
      powder = 0.16;
      // 쓸어 뿌리기 감지
      const dy = Math.abs(wrapAngle(G.camRig.yaw - this.lastAimYaw));
      this.sweepAccum += dy;
      G.passState && G.passState(dt, this);
      if (st.ext <= 0) G.ui.toast('소화기 방사 종료', 'warn');
    } else if (this.tool === 'ext' && fireKey && this.pin && !this._pinWarn) {
      G.ui.toast('안전핀을 먼저 뽑으세요 (E)', 'warn'); this._pinWarn = true; setTimeout(() => (this._pinWarn = false), 2000);
    }
    this.lastAimYaw = G.camRig.yaw;
    this.audio = { water, powder };
  }

  pickUp(human) {
    this.carry = human;
    human.carriedBy(this.human);
    this.human.play('pickup', 0.9);
  }

  drop(pos, yaw) {
    if (!this.carry) return null;
    const h = this.carry;
    h.dropAt(this.G.engine.scene, pos, yaw);
    this.carry = null;
    return h;
  }
}
