// 임무 2 — 주택 화재 외부 진압: 호스 전개 · 방수 · 용수 관리 · 붕괴 위험구역 · 상황 보고
import * as THREE from 'three';
import { Mission, dist2 } from './mission.js';
import { LAYOUT } from '../world/world.js';
import { Human } from '../character/human.js';
import { HoseLine } from '../world/hose.js';
import { QUIZ } from '../data/quizzes.js';
import { rand } from '../core/util.js';

export class ExteriorMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.fires = [];
    this.zoneT = 0;
    this.reported = false;
    this.refillLock = 0;
  }

  quizPool() { return QUIZ.m2; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, A = LAYOUT.siteA;
    G.fx.clearAll();
    P.setGear({ pants: true, boots: true, coat: true, hood: true, scba: true, helmet: true, gloves: true });
    P.setMask(false);
    P.resetStats(G.progress);
    P.allowed = { hose: true, ext: false, tic: false };
    P.hoseReady = false;
    P.equip(null);
    P.mode = 'jet';

    // 화점 5곳 (창문 · 출입구)
    const slots = W.siteA.fireSlots;
    const sizes = [1.25, 1.35, 1.1, 1.2, 1.3];
    slots.forEach((p, i) => {
      const f = G.fx.addFire(p, { size: sizes[i], hp: 95 + i * 8, type: 'A', heat: 4.2 * sizes[i], label: '화점' + (i + 1) });
      this.fires.push(f);
    });
    G.fx.addSmokeSource(new THREE.Vector3(A.x, A.floors * A.floorH + 0.5, A.z + A.d / 2 - 1), 6, 2.2);
    G.fx.addSmokeSource(new THREE.Vector3(A.x - 4, A.floors * A.floorH + 0.5, A.z + A.d / 2 - 2), 5, 2);

    // 소방차 · 현장 인원
    const truck = W.truck.position;
    this.hosePt = new THREE.Vector3(truck.x - 4.7, 0.9, truck.z);
    this.pumpPos = new THREE.Vector3(truck.x - 5.6, 0, truck.z + 0.3);
    const cap = new Human({ skin: '#b98763', scale: 1.03 });
    cap.setGear({ pants: true, boots: true, coat: true, hood: true, helmet: true, gloves: true });
    cap.root.position.set(truck.x - 1.5, 0, truck.z + 3.4);
    cap.root.rotation.y = Math.PI * 0.8;
    this.addHuman(cap);
    this.captain = cap;
    const cols = [['#c4524a', '#2d3a4f'], ['#5a8a6a', '#3c3a3a'], ['#d8b44a', '#2b3550'], ['#8a6fb0', '#3a4a5a']];
    [[-9, -8.2], [-7.4, -8.6], [10, -8.3], [11.4, -8.7]].forEach(([dx, z], i) => {
      const h = new Human({ shirt: cols[i][0], pants: cols[i][1], hair: ['#241a14', '#3a2a1e', '#15110e', '#4a3a2a'][i], skin: ['#d9a982', '#c99472', '#b98763', '#e0b690'][i], longHair: i % 2 === 1 });
      h.root.position.set(A.x + dx, 0, z);
      h.root.rotation.y = Math.PI;
      this.addHuman(h);
    });

    // 붕괴·낙하물 위험구역 표시
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(28, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: '#e5372b', roughness: 0.6, emissive: '#601510', emissiveIntensity: 0.5 }));
    stripe.position.set(A.x, 0.14, -14.3);
    G.engine.scene.add(stripe);
    this.addProp(stripe);
    this.zone = { x0: A.x - 14, x1: A.x + 14, z0: -18.2, z1: -14.3 };

    // 호스
    this.hose = new HoseLine(G.engine.scene);
    this.addProp(this.hose.mesh);

    // 상호작용
    this.addInteract({
      pos: this.pumpPos, radius: 3.4, label: '호스 전개 · 관창 장착',
      enabled: () => !P.hoseReady,
      onUse: () => {
        P.hoseReady = true; P.equip('hose'); P.tether = { pos: this.hosePt, max: 46 };
        this.hose.visible = true;
        G.ui.toast('호스를 전개했습니다. 방수 준비 완료!', 'good'); G.sfx.ok();
        this.complete('hose');
      },
    });
    this.addInteract({
      pos: this.pumpPos, radius: 3.4, label: '용수 보충 (소방차 탱크)', hold: 2.4,
      enabled: () => P.hoseReady && P.stats.water < 90,
      onUse: () => this.refill('소방차 탱크에서 용수를 보충했습니다'),
    });
    this.addInteract({
      pos: W.hydrantA, radius: 2.4, label: '용수 보충 (소화전 연결)', hold: 2.0,
      enabled: () => P.hoseReady && P.stats.water < 90,
      onUse: () => this.refill('소화전에서 용수를 보충했습니다'),
    });
    this.addInteract({
      pos: this.captain.root.position, radius: 2.8, label: '지휘관에게 상황 종료 보고',
      enabled: () => this.fires.every((f) => !f.alive) && !this.reported,
      onUse: () => {
        this.reported = true; this.complete('report'); G.ui.banner('상황 종료'); setTimeout(() => this.finish(true), 1400);
      },
    });

    this.addObj('hose', '소방차에서 호스를 전개하고 관창을 잡는다')
      .addObj('fires', '화점 5곳을 모두 진압한다', `0/${this.fires.length}`)
      .addObj('report', '잔불 확인 후 지휘관에게 상황 종료 보고');
    this.setActive('hose');
    G.fx.onWrongAgent = null;
  }

  refill(msg) {
    this.G.player.stats.water = 100;
    this.G.ui.toast(msg, 'good'); this.G.sfx.ok();
  }

  update(dt) {
    const G = this.G, P = G.player, st = P.stats;
    // 진압 수
    const out = this.fires.filter((f) => !f.alive).length;
    this.setCount('fires', `${out}/${this.fires.length}`);
    if (out === this.fires.length) { if (!this.objs.find((o) => o.id === 'fires').done) { this.complete('fires'); G.ui.banner('화재 진압 완료'); } }
    if (this.fires.some((f) => f.alive) === false) { /* 보고 단계 */ }

    // 호스 라인
    if (P.hoseReady) {
      const hand = P.human.arms.R.hand.getWorldPosition(new THREE.Vector3());
      this.hose.update(this.hosePt, hand);
    }

    // 붕괴·낙하물 위험구역
    const z = this.zone, p = P.pos;
    if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) {
      this.zoneT += dt;
      if (this.zoneT > 1.2 && !this._warned) { G.ui.toast('붕괴·낙하물 위험구역입니다! 벗어나세요', 'warn'); this._warned = true; }
      if (this.zoneT > 3.0) {
        this.zoneT = 0; this._warned = false;
        P.hurt(16, 'debris'); G.sfx.hurt();
        this.mistake('붕괴·낙하물 위험구역 안에서 방수했습니다 (안전거리 확보 필요)', 90);
        this.debris(p);
      }
    } else { this.zoneT = Math.max(0, this.zoneT - dt * 2); this._warned = false; }

    // 용수 경고
    if (st.water < 15 && P.hoseReady && !this._lowWater) { this._lowWater = true; G.ui.toast('용수 부족 — 소화전/소방차에서 보충(E 길게)', 'warn'); }
    if (st.water > 40) this._lowWater = false;

    // 안내 마커
    if (!P.hoseReady) this.markerTarget = { pos: new THREE.Vector3(this.pumpPos.x, 2.4, this.pumpPos.z), label: '소방차 · 호스 전개' };
    else if (st.water < 12) this.markerTarget = { pos: new THREE.Vector3(G.world.hydrantA.x, 1.6, G.world.hydrantA.z), label: '소화전 · 용수 보충' };
    else if (out < this.fires.length) {
      let best = null, bd = 1e9;
      for (const f of this.fires) if (f.alive) { const d = dist2(f.pos, p); if (d < bd) { bd = d; best = f; } }
      this.markerTarget = best ? { pos: new THREE.Vector3(best.pos.x, best.pos.y + 2.6, best.pos.z), label: '화점' } : null;
    } else if (!this.reported) this.markerTarget = { pos: new THREE.Vector3(this.captain.root.position.x, 2.5, this.captain.root.position.z), label: '지휘관 · 상황 종료 보고' };
    else this.markerTarget = null;
    this.captain.update(dt, { speed: 0 });
    this.humans.forEach((h) => h !== this.captain && h.update(dt, { speed: 0 }));
  }

  debris(p) {
    const fx = this.G.fx;
    for (let i = 0; i < 18; i++) fx.smoke.emit({ x: p.x + rand(-0.6, 0.6), y: 3 + rand(0, 1), z: p.z + rand(-0.6, 0.6), vx: rand(-1, 1), vy: rand(-8, -4), vz: rand(-1, 1), life: 0.6, s0: 0.4, s1: 0.9, a0: 0.9, a1: 0, c0: [0.25, 0.22, 0.2], grav: -9 });
  }

  teardown() { this.G.fx.clearAll(); this.hose && this.hose.dispose(); }
}
