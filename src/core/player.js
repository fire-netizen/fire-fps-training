// 플레이어(소방관) 컨트롤러 + 3인칭 카메라
import * as THREE from 'three';
import { Human } from '../character/human.js';
import { clamp, damp, dampAngle, wrapAngle } from './util.js';
import { AGENTS } from '../data/agents.js';

export const DEFAULT_PITCH = 0.40; // 지면 기준 약 23° 아래로 내려다봄

export class CameraRig {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.yaw = 0;
    this.pitch = DEFAULT_PITCH;
    this.dist = 4.4;
    this.fov = 58;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.pivot = new THREE.Vector3();
    this.follow = new THREE.Vector3(); // 관성으로 따라오는 추적점
    this.curDist = this.dist;
    this.shoulder = 0.45;
    this.pitchBack = null; // 분사 종료 후 되돌아갈 시점
    this._d = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this._tc = new THREE.Vector3();
    this._snap = true;
  }

  snap() { this._snap = true; }

  // opts.spray: 소화약제 분사 중(어깨 너머 시점 · 조준은 스틱) / opts.aimIn: {yaw, pitch} 변화량(스틱)
  update(dt, player, input, { aiming = false, free = true, spray = false, aimYaw = 0, aimPitch = 0 } = {}) {
    let dragged = false;
    if (free && input && (input.dx || input.dy)) {
      this.yaw -= input.dx * 0.0026;
      this.pitch = clamp(this.pitch + input.dy * 0.0021, -0.75, 1.05); // 놓아도 원래 각도로 되돌아가지 않음
      dragged = true;
    }
    if (spray && free) { // 이동 스틱으로 조준(좌우·상하)
      this.yaw -= aimYaw * dt;
      this.pitch = clamp(this.pitch + aimPitch * dt, -0.2, 0.95);
      this.pitchBack = this.pitchBack ?? null;
    }
    if (dragged) this.pitchBack = null;
    // 분사를 멈추면 분사 전 시점으로 부드럽게 복귀
    if (!spray && this.pitchBack != null) {
      this.pitch = damp(this.pitch, this.pitchBack, 5, dt);
      if (Math.abs(this.pitch - this.pitchBack) < 0.01) this.pitchBack = null;
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const right = this._d.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    // 추적점: 앞뒤·좌우는 늦게, 높이는 더 천천히
    const tx = player.pos.x, ty = player.pos.y, tz = player.pos.z;
    if (this._snap || dt === 0) { this.follow.set(tx, ty, tz); this._snap = false; }
    else {
      this.follow.x = damp(this.follow.x, tx, 7, dt);
      this.follow.z = damp(this.follow.z, tz, 7, dt);
      this.follow.y = damp(this.follow.y, ty, 3, dt);
    }
    const crouchDrop = 0.55 * player.human.cr;
    this.pivot.set(this.follow.x, this.follow.y + 1.55 - crouchDrop, this.follow.z);
    // 분사 중에도 거리는 평상시와 같게(높이가 갑자기 변하지 않도록), 어깨 위치만 살짝 이동
    this.shoulder = damp(this.shoulder, spray ? 0.6 : 0.45, 8, dt);
    const want = this._want.copy(this.pivot).addScaledVector(this.dir, -this.dist).addScaledVector(right, this.shoulder);
    want.y += 0.15;
    // 벽 충돌: 플레이어 '머리' 위치에서 카메라 쪽으로 레이캐스트해 벽 앞으로 당김
    const head = this.pivot.clone(); head.x = player.pos.x; head.z = player.pos.z; // 머리는 실제 플레이어 위 (추적점 지연과 무관)
    head.y = this.pivot.y;
    const toCam = this._tc.copy(want).sub(head);
    const len = toCam.length();
    toCam.normalize();
    const hit = this.world.raycast(head, toCam, len);
    const allowed = Math.max(0.6, Math.min(len, hit.dist - 0.3));
    // 벽에 닿으면 즉시 당기고, 공간이 생기면 천천히 원위치
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 6, dt);
    if (dt === 0) this.curDist = allowed;
    const desired = head.addScaledVector(toCam, this.curDist);
    desired.y = Math.max(0.35, desired.y);
    this.pos.copy(desired);
    const cam = this.engine.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.pos.x + this.dir.x, this.pos.y + this.dir.y, this.pos.z + this.dir.z);
    const tf = aiming ? 52 : 58;
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
    this.allowed = { hose: false, ext: false, tic: false, agent: false };
    this.agentSel = null;
    this.agentAmt = {};
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
    this.G.cam.pitch = DEFAULT_PITCH;
    this.G.cam.pitchBack = null;
    this.G.cam.snap();
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
    this.agentSel = null;
    for (const a of AGENTS) this.agentAmt[a.id] = 100;
  }

  selectAgent(i) {
    const a = AGENTS[i];
    if (!a || !this.allowed.agent) return;
    this.agentSel = a.id;
    this.equip('agent');
    this.stats.ext = this.agentAmt[a.id] ?? 100;
    this.G.ui.toast(`소화약제 선택 — ${a.name} (${a.info})`, 'info');
    this.G.sfx.click();
  }

  equip(tool) {
    if (tool && !this.allowed[tool]) return false;
    if (tool === 'hose' && !this.hoseReady) return false;
    this.tool = tool;
    const ag = tool === 'agent' && AGENTS.find((a) => a.id === this.agentSel);
    this.human.setTool(tool === 'agent' ? (ag ? ag.visual : 'ext') : tool);
    if (tool === 'agent') this.pin = false;
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
    let dist = hit.dist;
    // 화염도 조준 대상: 불꽃(구)과 교차하면 그 거리로 포물선을 보정
    for (const f of this.G.fx.fires) {
      if (!f.alive) continue;
      const cx = f.pos.x - o.x, cy = f.pos.y + 0.55 * f.size - o.y, cz = f.pos.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t <= 0 || t >= dist) continue;
      const r = 0.85 * f.size + 0.25;
      if (cx * cx + cy * cy + cz * cz - t * t < r * r) dist = t;
    }
    this.aimDist = Math.max(2.5, dist);
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
    if (this.allowed.agent) { for (let n = 0; n < AGENTS.length; n++) if (inp.pressed('Digit' + (n + 1))) this.selectAgent(n); }
    if (!this.allowed.agent && inp.pressed('Digit1')) { if (this.equip(this.tool === 'hose' ? null : 'hose')) G.ui.toast(this.tool ? '관창(방수)' : '장비 해제', 'info'); else if (this.allowed.hose) G.ui.toast('호스를 먼저 전개하세요', 'warn'); }
    if (!this.allowed.agent && inp.pressed('Digit2')) { if (this.equip(this.tool === 'ext' ? null : 'ext')) G.ui.toast(this.tool ? '소화기' : '장비 해제', 'info'); }
    if (inp.pressed('KeyT') && this.allowed.tic) { this.tic = !this.tic; G.sfx.click(); }
    if (inp.pressed('KeyQ') && this.tool === 'hose') { this.mode = this.mode === 'jet' ? 'fog' : 'jet'; G.ui.toast(this.mode === 'jet' ? '직사 방수 (원거리·강한 압력)' : '분무 방수 (넓은 범위·복사열 차단)', 'info'); G.sfx.click(); }

    // ── 소화약제 분사 중: 플레이어·카메라 고정, 이동 스틱(WASD)은 조준 전용
    const agentAmt = this.tool === 'agent' && this.agentSel ? this.agentAmt[this.agentSel] ?? 0 : 0;
    const sprayWant = this.tool === 'agent' && agentAmt > 0 && fireKey;
    if (sprayWant && !this._sprayOn) { this._sprayOn = true; this.sprayT = 0; G.camRig.pitchBack = G.camRig.pitch; }
    if (!sprayWant) { this._sprayOn = false; this.sprayT = 0; }
    this.spray = sprayWant;
    this.aimCmd = { yaw: 0, pitch: 0 };

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
    if (sprayWant) {
      const st0 = inp.stick;
      const sx = st0.analog ? st0.x : ix, sy = st0.analog ? st0.y : -iz; // y: 위가 -
      const curve = (v) => (Math.abs(v) < 0.12 ? 0 : Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 1.7)); // 약한 입력은 천천히
      this.aimCmd.yaw = curve(sx) * 1.7;
      this.aimCmd.pitch = curve(sy) * 1.0;
    }
    let moved = 0;
    if (len > 0.01 && !sprayWant) {
      mx /= len; mz /= len;
      const before = this._m.copy(this.pos);
      G.world.move(this.pos, this.radius, mx * spd * dt, mz * spd * dt);
      moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
      if (!this.aiming) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 14, dt);
    }
    if (this.aiming || this.tool === 'tic') this.heading = dampAngle(this.heading, yaw, 16, dt);
    // 카메라가 어깨 뒤에 자리잡은 뒤(몸이 정면을 향함)에 분사 시작
    if (sprayWant) {
      this.sprayT += dt;
      this.sprayReady = (this.sprayT > 0.22 && Math.abs(wrapAngle(this.heading - yaw)) < 0.16) || this.sprayT > 0.6;
    } else this.sprayReady = false;
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
    } else if (this.tool === 'agent' && fireKey) {
      const id = this.agentSel, amt = id ? this.agentAmt[id] ?? 0 : 0;
      if (id && amt > 0) {
        if (!this.sprayReady) { this.lastAimYaw = G.camRig.yaw; this.audio = { water: 0, powder: 0 }; return; }
        this.firing = true;
        this.computeAim();
        const m = this.muzzle(this._m);
        const target = this._d.copy(this.aimPoint);
        const sp = id === 'water' ? 21 : id === 'sand' ? 11 : 0, gr = id === 'water' ? 4.2 : id === 'sand' ? 9 : 0;
        if (sp) { const t = target.distanceTo(m) / sp; target.y += 0.5 * gr * t * t; }
        const dir = target.sub(m).normalize();
        if (dir.dot(G.camRig.dir) < 0.2) dir.copy(G.camRig.dir);
        fx.sprayAgent(m, dir, id, dt);
        const a = AGENTS.find((x) => x.id === id);
        this.agentAmt[id] = Math.max(0, amt - a.rate * dt);
        st.ext = this.agentAmt[id];
        if (id === 'water') water = 0.2; else powder = id === 'sand' ? 0.1 : 0.16;
        if (this.agentAmt[id] <= 0) G.ui.toast(`${a.name} 소진 — 보급대(E)에서 충전하세요`, 'warn');
      } else if (!this._agWarn) {
        G.ui.toast(!id ? '먼저 소화약제를 고르세요 (1~6 키)' : '약제가 소진되었습니다 — 보급대(E)에서 충전', 'warn');
        this._agWarn = true; setTimeout(() => (this._agWarn = false), 2000);
      }
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
