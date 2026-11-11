// 파티클 이펙트: 화염 · 연기 · 방수 · 분말 · 스파크 · 화재 객체
import * as THREE from 'three';
import { clamp, lerp, rand } from '../core/util.js';
import { AGENT_IDS } from '../data/agents.js';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale; varying float vA; varying vec3 vC; varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(aSize * uScale / max(-mv.z, 0.1), 0.0);
  vA = aAlpha; vC = aColor; vDist = -mv.z;
}`;
const FRAG = `
varying float vA; varying vec3 vC; varying float vDist;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uAdd;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 1.6) * vA;
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  vec3 col = vC;
  if (uAdd > 0.5) { a *= (1.0 - f); } else { col = mix(col, uFogColor, f * 0.85); }
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export class ParticleSystem {
  constructor(engine, max, { additive = false } = {}) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.a1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.aSize = new Float32Array(max); this.aAlpha = new Float32Array(max); this.aColor = new Float32Array(max * 3);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = {
      uScale: { value: 800 }, uAdd: { value: additive ? 1 : 0 },
      uFogColor: engine.fogU.uFogColor, uFogDensity: engine.fogU.uFogDensity,
    };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    engine.scene.add(this.points);
    this.onStep = null;
  }

  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.s0[i] = o.s0 ?? 0.3; this.s1[i] = o.s1 ?? this.s0[i];
    this.a0[i] = o.a0 ?? 1; this.a1[i] = o.a1 ?? 0;
    const c0 = o.c0 || [1, 1, 1], c1 = o.c1 || c0;
    this.c0.set(c0, i3); this.c1.set(c1, i3);
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0;
  }

  update(dt, scale) {
    this.uniforms.uScale.value = scale;
    const { pos, vel, life, maxLife } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { this.aAlpha[i] = 0; continue; }
      life[i] -= dt;
      const i3 = i * 3;
      if (life[i] <= 0) { this.aAlpha[i] = 0; continue; }
      const t = 1 - life[i] / maxLife[i];
      if (this.drag[i] > 0) { const k = Math.exp(-this.drag[i] * dt); vel[i3] *= k; vel[i3 + 1] *= k; vel[i3 + 2] *= k; }
      vel[i3 + 1] += this.grav[i] * dt;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (this.onStep) {
        // 입자별 좌표(q)를 전달 — 예전엔 pos 배열 전체를 넘겨 모든 입자가 0번 입자 좌표로 판정되었음
        const q = this._q || (this._q = new Float32Array(3));
        q[0] = pos[i3]; q[1] = pos[i3 + 1]; q[2] = pos[i3 + 2];
        if (this.onStep(i, q, vel, i3)) { life[i] = 0; this.aAlpha[i] = 0; continue; }
      }
      this.aSize[i] = lerp(this.s0[i], this.s1[i], t);
      const fadeIn = Math.min(1, t * 8);
      this.aAlpha[i] = lerp(this.a0[i], this.a1[i], t) * fadeIn;
      this.aColor[i3] = lerp(this.c0[i3], this.c1[i3], t);
      this.aColor[i3 + 1] = lerp(this.c0[i3 + 1], this.c1[i3 + 1], t);
      this.aColor[i3 + 2] = lerp(this.c0[i3 + 2], this.c1[i3 + 2], t);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.aAlpha.fill(0); }
}

// ────────────────────────── 화재 객체 ──────────────────────────
export class Fire {
  constructor(fx, pos, o = {}) {
    this.fx = fx;
    this.pos = pos.clone();
    this.size = o.size ?? 1;
    this.type = o.type ?? 'A';
    this.maxHp = this.hp = o.hp ?? 100;
    this.alive = true;
    this.label = o.label || '';
    this.smoke = o.smoke ?? 1;
    this.heat = o.heat ?? 5.5; // 열기 영향 반경(m)
    this.flare = 0;
    this.shock = 0;
    this.accF = 0; this.accS = 0; this.accE = 0;
    this.hitCool = 0;
    this.onOut = o.onOut || null;
    this.thermal = true;
    this.id = o.id || '';
    this.tint = o.tint || null;
    this.smokeC = o.smokeC || null; // [시작색, 끝색]
    this.smokeA = o.smokeA ?? 0.42; // 연기 농도
    this.light = o.light || '#ff7a2a';
  }

  get intensity() { return this.alive ? clamp(this.hp / this.maxHp, 0.12, 1.3) : 0; }

  damage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) this.extinguish();
  }

  extinguish() {
    if (!this.alive) return;
    this.alive = false; this.hp = 0;
    for (let i = 0; i < 26; i++) this.fx.steam(this.pos.x + rand(-0.5, 0.5) * this.size, this.pos.y + rand(0, 0.8) * this.size, this.pos.z + rand(-0.5, 0.5) * this.size, 1);
    this.onOut && this.onOut(this);
  }

  // 물에 의한 유류화재 확대(플레어업)
  flareUp() {
    this.hp = Math.min(this.maxHp * 1.25, this.hp + this.maxHp * 0.35);
    this.flare = 1.2;
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      this.fx.flame.emit({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z, vx: Math.cos(a) * rand(1, 4), vy: rand(3, 6), vz: Math.sin(a) * rand(1, 4), life: rand(0.6, 1.1), s0: 0.8, s1: 2.6, a0: 0.9, a1: 0, c0: [1, 0.8, 0.4], c1: [0.9, 0.2, 0.05] });
    }
  }

  update(dt) {
    if (!this.alive) return;
    this.flare = Math.max(0, this.flare - dt);
    this.hitCool = Math.max(0, this.hitCool - dt);
    const I = this.intensity * (1 + this.flare * 0.8);
    const sz = this.size;
    const f = this.fx.flame, s = this.fx.smoke, e = this.fx.spark;
    // 화염
    this.accF += dt * 70 * I * sz;
    while (this.accF > 1) {
      this.accF -= 1;
      const r = rand(0, 0.55) * sz, a = rand(0, Math.PI * 2);
      f.emit({
        x: this.pos.x + Math.cos(a) * r, y: this.pos.y + rand(0, 0.25), z: this.pos.z + Math.sin(a) * r,
        vx: rand(-0.35, 0.35), vy: rand(1.2, 2.6) * (0.6 + 0.5 * I), vz: rand(-0.35, 0.35),
        life: rand(0.55, 1.05) * (0.6 + 0.5 * I), s0: rand(0.7, 1.15) * sz * (0.6 + 0.5 * I), s1: rand(0.15, 0.4) * sz,
        a0: 0.34, a1: 0, c0: this.tint ? this.tint[0] : [1.0, 0.62, 0.18], c1: this.tint ? this.tint[1] : [0.9, 0.16, 0.03], drag: 0.4,
      });
    }
    // 연기
    this.accS += dt * 11 * this.smoke * I * sz;
    while (this.accS > 1) {
      this.accS -= 1;
      s.emit({
        x: this.pos.x + rand(-0.4, 0.4) * sz, y: this.pos.y + rand(0.8, 1.6) * sz, z: this.pos.z + rand(-0.4, 0.4) * sz,
        vx: rand(-0.3, 0.5) + this.fx.wind.x, vy: rand(1.3, 2.4), vz: rand(-0.3, 0.3) + this.fx.wind.z,
        life: rand(3.2, 5.5), s0: rand(0.9, 1.4) * sz, s1: rand(3.2, 5.4) * sz, a0: this.smokeA, a1: 0,
        c0: this.smokeC ? this.smokeC[0] : [0.1, 0.1, 0.11], c1: this.smokeC ? this.smokeC[1] : [0.32, 0.31, 0.3], drag: 0.15,
      });
    }
    // 불꽃 튀김
    this.accE += dt * 4 * I;
    while (this.accE > 1) {
      this.accE -= 1;
      e.emit({ x: this.pos.x + rand(-0.4, 0.4), y: this.pos.y + 0.5, z: this.pos.z + rand(-0.4, 0.4), vx: rand(-1, 1), vy: rand(2, 5), vz: rand(-1, 1), life: rand(0.8, 1.6), s0: 0.06, s1: 0.02, a0: 1, a1: 0, c0: [1, 0.7, 0.25], c1: [1, 0.3, 0.1], grav: -2.2 });
    }
  }
}

export class Effects {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.flame = new ParticleSystem(engine, 2600, { additive: true });
    this.spark = new ParticleSystem(engine, 400, { additive: true });
    this.smoke = new ParticleSystem(engine, 1800);
    this.water = new ParticleSystem(engine, 900);
    this.mist = new ParticleSystem(engine, 700);
    this.powder = new ParticleSystem(engine, 800);
    this.agent = new ParticleSystem(engine, 1400);
    this.agentKind = new Uint8Array(1400);
    this.agent.onStep = (i, p, v) => this._agentStep(i, p, v);
    this.onAgentHit = null;
    this.blasts = [];
    this.fires = [];
    this.wind = new THREE.Vector3(0.35, 0, 0.1);
    this.sources = []; // 연기 배출구(건물 창문 등)
    this.stats = { waterHits: 0, wrongAgent: 0, lastHit: null };
    this.onWrongAgent = null;
    this.waterMult = 1;
    this.waterWide = new Uint8Array(900);
    this.water.onStep = (i, p, v, i3) => this._waterStep(i, p, v, i3);
    this.powder.onStep = (i, p, v, i3) => this._powderStep(i, p, v, i3);
    this._v = new THREE.Vector3();
  }

  addFire(pos, o) {
    const f = new Fire(this, pos, o);
    this.fires.push(f);
    return f;
  }

  removeAllFires() { this.fires.length = 0; }

  aliveFires() { return this.fires.filter((f) => f.alive); }

  steam(x, y, z, k = 1) {
    this.mist.emit({ x, y, z, vx: rand(-0.4, 0.4), vy: rand(0.6, 1.6), vz: rand(-0.4, 0.4), life: rand(0.9, 1.7), s0: 0.4 * k, s1: 1.7 * k, a0: 0.55, a1: 0, c0: [0.92, 0.94, 0.96], drag: 0.8 });
  }

  _hitFire(p, radiusMul, perHit, kind) {
    for (const f of this.fires) {
      if (!f.alive) continue;
      const dx = p[0] - f.pos.x, dz = p[2] - f.pos.z, dy = p[1] - f.pos.y;
      const r = (0.75 + 0.35 * f.size) * f.size * radiusMul;
      if (dx * dx + dz * dz > r * r || dy < -0.5 || dy > 2.3 * f.size) continue;
      // 불꽃의 뿌리(아래쪽)를 겨냥할수록 효과가 큼 → 냉각소화의 원리
      const low = dy < 0.55 * f.size;
      let dmg = perHit * (low ? 1.55 : 0.55);
      if (kind === 'water') {
        dmg *= this.waterMult;
        if (f.type === 'B') {
          // 유류화재에 물: 기름이 튀며 확대
          if (f.hitCool <= 0) { f.hitCool = 2.2; f.flareUp(); this.stats.wrongAgent++; this.onWrongAgent && this.onWrongAgent(f, 'B'); }
          return true;
        }
        if (f.type === 'C') {
          if (f.hitCool <= 0) { f.hitCool = 1.6; f.shock = 1; this.stats.wrongAgent++; this.onWrongAgent && this.onWrongAgent(f, 'C'); }
          return true;
        }
      }
      f.damage(dmg);
      f.lastHit = performance.now();
      this.stats.lastHit = f;
      return true;
    }
    return false;
  }

  _waterStep(i, p, v) {
    if (p[1] < 0.04) { this.steam(p[0], 0.1, p[2], 0.35); return true; }
    if (this.world.pointInSolid(p[0], p[1], p[2])) { this.steam(p[0], p[1], p[2], 0.5); return true; }
    if (this._hitFire(p, this.waterWide[i] ? 1.9 : 1.0, this.waterWide[i] ? 0.06 : 0.14, 'water')) {
      this.steam(p[0], p[1], p[2], 0.7);
      return true;
    }
    return false;
  }

  _powderStep(i, p) {
    if (p[1] < 0.03) return true;
    if (this.world.pointInSolid(p[0], p[1], p[2])) return true;
    if (this._hitFire(p, 1.5, 0.08, 'powder')) return true;
    return false;
  }

  // 관창 방수. mode: 'jet'(직사) | 'fog'(분무)
  sprayWater(origin, dir, mode, dt, aimDist = 20) {
    const jet = mode === 'jet';
    const n = Math.floor((jet ? 150 : 170) * dt + Math.random());
    const speed = jet ? 21 : 13;
    const spread = jet ? 0.022 : 0.2;
    const up = this._v.set(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const vert = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * spread;
      const vx = dir.x + (side.x * Math.cos(a) + vert.x * Math.sin(a)) * r;
      const vy = dir.y + (side.y * Math.cos(a) + vert.y * Math.sin(a)) * r;
      const vz = dir.z + (side.z * Math.cos(a) + vert.z * Math.sin(a)) * r;
      const sp = speed * rand(0.92, 1.05);
      const idx = this.water.cursor;
      this.waterWide[idx] = jet ? 0 : 1;
      this.water.emit({
        x: origin.x + dir.x * rand(0, dt * speed), y: origin.y + dir.y * rand(0, dt * speed), z: origin.z + dir.z * rand(0, dt * speed),
        vx: vx * sp, vy: vy * sp, vz: vz * sp, life: jet ? 1.8 : 1.1,
        s0: jet ? 0.11 : 0.22, s1: jet ? 0.17 : 0.8, a0: jet ? 0.8 : 0.4, a1: jet ? 0.55 : 0.0,
        c0: jet ? [0.78, 0.93, 1] : [0.9, 0.96, 1], grav: -4.2,
      });
    }
  }

  _agentStep(i, p) {
    if (p[1] < 0.03) return true;
    if (this.world.pointInSolid(p[0], p[1], p[2])) return true;
    for (const f of this.fires) {
      if (!f.alive) continue;
      const dx = p[0] - f.pos.x, dz = p[2] - f.pos.z, dy = p[1] - f.pos.y;
      const r = (0.75 + 0.35 * f.size) * f.size * 1.5;
      if (dx * dx + dz * dz > r * r || dy < -0.5 || dy > 2.3 * f.size) continue;
      this.onAgentHit && this.onAgentHit(f, AGENT_IDS[this.agentKind[i]], dy < 0.55 * f.size);
      return true;
    }
    return false;
  }

  // 소화약제 방사 (5번 임무): water | powder | co2 | foam | sand | kagent
  sprayAgent(origin, dir, agent, dt) {
    const C = {
      water: { n: 160, sp: [20, 22], r: 0.03, life: 1.8, s0: 0.12, s1: 0.18, a0: 0.8, a1: 0.5, c0: [0.78, 0.93, 1], grav: -4.2, drag: 0 },
      powder: { n: 260, sp: [8.5, 12], r: 0.16, life: 0.75, s0: 0.1, s1: 0.85, a0: 0.75, a1: 0, c0: [0.97, 0.96, 0.93], grav: -1, drag: 1.1 },
      co2: { n: 200, sp: [10, 13], r: 0.12, life: 0.55, s0: 0.15, s1: 0.9, a0: 0.55, a1: 0, c0: [0.95, 0.98, 1], c1: [0.78, 0.9, 1], grav: 0, drag: 1.4 },
      foam: { n: 170, sp: [10, 12], r: 0.07, life: 1.0, s0: 0.22, s1: 0.5, a0: 0.85, a1: 0.6, c0: [0.96, 0.94, 0.82], grav: -3, drag: 0.2 },
      sand: { n: 150, sp: [10.5, 11.5], r: 0.08, life: 1.1, s0: 0.09, s1: 0.1, a0: 1, a1: 0.9, c0: [0.74, 0.62, 0.42], grav: -9, drag: 0 },
      kagent: { n: 170, sp: [11, 13], r: 0.12, life: 0.9, s0: 0.15, s1: 0.6, a0: 0.55, a1: 0, c0: [0.88, 0.97, 0.72], grav: -3, drag: 0.3 },
    }[agent];
    if (!C) return;
    const kind = AGENT_IDS.indexOf(agent);
    const n = Math.floor(C.n * dt + Math.random());
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const vert = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * C.r, sp = rand(C.sp[0], C.sp[1]);
      this.agentKind[this.agent.cursor] = kind;
      this.agent.emit({
        x: origin.x, y: origin.y, z: origin.z,
        vx: (dir.x + (side.x * Math.cos(a) + vert.x * Math.sin(a)) * r) * sp,
        vy: (dir.y + (side.y * Math.cos(a) + vert.y * Math.sin(a)) * r) * sp,
        vz: (dir.z + (side.z * Math.cos(a) + vert.z * Math.sin(a)) * r) * sp,
        life: C.life * rand(0.9, 1.1), s0: C.s0, s1: C.s1, a0: C.a0, a1: C.a1, c0: C.c0, c1: C.c1 || C.c0, grav: C.grav, drag: C.drag,
      });
    }
  }

  // 폭발 연출 (나트륨 + 물 등)
  explode(pos, power = 1) {
    for (let i = 0; i < 170; i++) {
      const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-0.3, 1)), sp = rand(4, 12) * power;
      this.flame.emit({ x: pos.x, y: pos.y, z: pos.z, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp * 0.9 + 1, vz: Math.sin(ph) * Math.sin(th) * sp, life: rand(0.5, 1.2), s0: 1.0 * power, s1: 3.4 * power, a0: 0.8, a1: 0, c0: [1, 0.9, 0.5], c1: [0.9, 0.25, 0.05], drag: 1.2 });
    }
    for (let i = 0; i < 70; i++) {
      const th = rand(0, Math.PI * 2), ph = rand(0.1, 1.5), sp = rand(6, 16) * power;
      this.spark.emit({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(th) * Math.cos(ph) * sp, vy: Math.sin(ph) * sp, vz: Math.sin(th) * Math.cos(ph) * sp, life: rand(0.9, 1.9), s0: 0.09, s1: 0.03, a0: 1, a1: 0, c0: [1, 0.85, 0.4], c1: [1, 0.3, 0.1], grav: -9 });
    }
    for (let i = 0; i < 45; i++) {
      this.smoke.emit({ x: pos.x + rand(-0.6, 0.6), y: pos.y + rand(0, 1), z: pos.z + rand(-0.6, 0.6), vx: rand(-1.5, 1.5), vy: rand(1.5, 4), vz: rand(-1.5, 1.5), life: rand(3, 5.5), s0: 1.2, s1: 5 * power, a0: 0.5, a1: 0, c0: [0.08, 0.08, 0.09], c1: [0.35, 0.33, 0.3], drag: 0.3 });
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    mesh.position.copy(pos);
    this.engine.scene.add(mesh);
    this.blasts.push({ pos: pos.clone(), t: 0, dur: 0.65, power, mesh });
  }

  _updateBlasts(dt) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) { this.engine.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); this.blasts.splice(i, 1); continue; }
      b.mesh.scale.setScalar(0.6 + k * 6.5 * b.power);
      b.mesh.material.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }

  // 소화기 분말 방사
  sprayPowder(origin, dir, dt) {
    const n = Math.floor(260 * dt + Math.random());
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const vert = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 0.16;
      const sp = rand(8.5, 12);
      this.powder.emit({
        x: origin.x, y: origin.y, z: origin.z,
        vx: (dir.x + (side.x * Math.cos(a) + vert.x * Math.sin(a)) * r) * sp, vy: (dir.y + (side.y * Math.cos(a) + vert.y * Math.sin(a)) * r) * sp, vz: (dir.z + (side.z * Math.cos(a) + vert.z * Math.sin(a)) * r) * sp,
        life: rand(0.6, 0.8), s0: 0.1, s1: 0.85, a0: 0.75, a1: 0, c0: [0.97, 0.96, 0.93], drag: 1.1, grav: -1.0,
      });
    }
  }

  // 건물에서 나오는 연기 (창문 등)
  addSmokeSource(pos, rate = 8, size = 1.5) { this.sources.push({ pos: pos.clone(), rate, size, acc: 0 }); }

  update(dt) {
    for (const f of this.fires) f.update(dt);
    for (const s of this.sources) {
      s.acc += dt * s.rate;
      while (s.acc > 1) {
        s.acc -= 1;
        this.smoke.emit({
          x: s.pos.x + rand(-0.6, 0.6), y: s.pos.y + rand(-0.3, 0.3), z: s.pos.z + rand(-0.2, 0.4),
          vx: rand(0, 0.6) + this.wind.x, vy: rand(1.2, 2.4), vz: rand(0.2, 1.2),
          life: rand(4, 7), s0: s.size * 0.6, s1: s.size * 3.4, a0: 0.5, a1: 0, c0: [0.08, 0.08, 0.09], c1: [0.3, 0.29, 0.28], drag: 0.12,
        });
      }
    }
    const sc = this.engine.pixelScale();
    this.flame.update(dt, sc); this.spark.update(dt, sc); this.smoke.update(dt, sc);
    this.water.update(dt, sc); this.mist.update(dt, sc); this.powder.update(dt, sc); this.agent.update(dt, sc);
    this._updateBlasts(dt);
  }

  clearAll() {
    for (const s of [this.flame, this.spark, this.smoke, this.water, this.mist, this.powder, this.agent]) s.clear();
    for (const b of this.blasts) { this.engine.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    this.blasts.length = 0; this.onAgentHit = null;
    this.fires.length = 0; this.sources.length = 0;
  }

  lightSources() {
    const out = [];
    for (const f of this.fires) {
      if (!f.alive) continue;
      out.push({
        pos: new THREE.Vector3(f.pos.x, f.pos.y + 1.2 * f.size, f.pos.z), color: f.light,
        intensity: (22 + Math.random() * 6) * f.intensity * f.size, distance: 15 + 8 * f.size,
      });
    }
    for (const b of this.blasts) out.push({ pos: b.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), color: '#ffd9a0', intensity: 140 * (1 - b.t / b.dur), distance: 26 });
    return out;
  }
}
