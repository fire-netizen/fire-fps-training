// 임무 4 — 초기 소화: 화재 유형별 소화수단 선택 + 소화기 사용법(PASS)
import * as THREE from 'three';
import { Mission } from './mission.js';
import { QUIZ } from '../data/quizzes.js';
import { HoseLine } from '../world/hose.js';

const TYPE_INFO = {
  A: { name: '일반화재(A급)', ok: '물·분말소화기 모두 사용할 수 있습니다.' },
  B: { name: '유류화재(B급·주방 K급)', ok: '분말·K급 소화기가 적절합니다. 물은 금지!' },
  C: { name: '전기화재(C급)', ok: '전원 차단 후 분말·CO₂ 소화기를 사용합니다. 물은 감전 위험!' },
};

export class ExtinguishMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.fires = [];
    this.pass = [
      { k: 'P', t: '안전핀을 뽑는다 (E)', done: false },
      { k: 'A', t: '노즐을 불의 아랫부분에 겨눈다 (3~5m)', done: false },
      { k: 'S', t: '손잡이를 움켜쥐고 분사한다', done: false },
      { k: 'S', t: '빗자루로 쓸듯이 좌우로 분사한다', done: false },
    ];
    this.hasExt = false;
    this.hasHose = false;
    this.reported = false;
    this.lastSweep = 0;
  }

  quizPool() { return QUIZ.m4; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, I = W.intC;
    this.I = I;
    G.fx.clearAll();
    W.showZone('shop');
    P.setGear({ pants: true, boots: true, coat: true, hood: true, helmet: true, gloves: true });
    P.setMask(false);
    P.resetStats(G.progress);
    P.allowed = { hose: true, ext: true, tic: false };
    P.hoseReady = false;
    P.equip(null);
    P.pin = true;
    P.teleport(I.spawn, 0);
    this.hose = new HoseLine(G.engine.scene, '#c8281f');
    this.addProp(this.hose.mesh);

    for (const f of I.fires) {
      const fire = G.fx.addFire(f.pos, { size: f.size, hp: f.hp, type: f.type, heat: 2.6 + f.size * 2, smoke: 0.8, label: f.label, id: f.id });
      fire.onOut = (x) => {
        const info = TYPE_INFO[x.type];
        G.ui.toast(`${info.name} 진압 — ${info.ok}`, 'good');
        G.sfx.ok();
        this.updateCount();
      };
      this.fires.push(fire);
    }
    G.fx.onWrongAgent = (f, type) => this.wrongAgent(f, type);

    this.addInteract({
      pos: I.extPos, radius: 2.6, label: '소화기 집기', enabled: () => !this.hasExt || P.stats.ext < 25,
      onUse: () => {
        this.hasExt = true; P.stats.ext = 100; P.pin = true; P.equip('ext');
        G.ui.toast('소화기를 들었습니다 — 안전핀을 뽑으세요 (E)', 'good');
        this.complete('ext');
        this.refreshPass();
      },
    });
    this.addInteract({
      pos: I.hosePos, radius: 2.6, label: '옥내소화전 호스 전개', enabled: () => !this.hasHose,
      onUse: () => {
        this.hasHose = true; P.hoseReady = true; P.stats.water = 100; this.hose.visible = true;
        P.tether = { pos: I.hosePos, max: 18 };
        G.ui.toast('옥내소화전 호스를 전개했습니다 (1번 키)', 'good');
        this.hoseStart = new THREE.Vector3(I.hosePos.x + 0.6, 1.0, I.hosePos.z);
        P.equip('hose');
      },
    });
    this.addInteract({
      pos: I.exit, radius: 2.6, label: '상황 종료 · 대피 후 119 보고',
      enabled: () => this.fires.every((f) => !f.alive) && !this.reported,
      onUse: () => { this.reported = true; this.complete('report'); G.ui.banner('상황 종료'); setTimeout(() => this.finish(true), 1200); },
    });

    this.addObj('ext', '소화기를 비치 장소에서 가져온다')
      .addObj('fires', '화재 3곳 진압 — 화재 유형에 맞는 수단 선택', '0/3')
      .addObj('report', '출입구에서 상황 종료 보고');
    this.setActive('ext');
    this.refreshPass();
    G.ui.toast('화재 유형에 맞는 소화수단을 선택하세요 (1 옥내소화전 / 2 소화기)', 'info');
  }

  refreshPass() { this.G.ui.setPass(this.pass); }

  updateCount() {
    const out = this.fires.filter((f) => !f.alive).length;
    this.setCount('fires', `${out}/${this.fires.length}`);
    if (out === this.fires.length) { this.complete('fires'); this.G.ui.banner('화재 3곳 진압 완료'); }
  }

  wrongAgent(f, type) {
    const G = this.G, P = G.player;
    const d = P.pos.distanceTo(f.pos);
    if (type === 'B') {
      this.mistake('유류(식용유) 화재에 물을 사용해 불이 확대되었습니다 — 분말·K급 소화기를 사용해야 합니다', 140);
      G.ui.banner('🔥 기름이 튀며 불이 커졌습니다!', 2200);
      if (d < 4.5) P.hurt(14, 'flare');
      G.sfx.hurt();
    } else if (type === 'C') {
      this.mistake('전기 설비 화재에 물을 직접 방수했습니다 — 감전 위험! 분말·CO₂ 소화기를 사용해야 합니다', 140);
      G.ui.banner('⚡ 감전 위험!', 2200);
      P.hurt(20, 'shock'); G.sfx.hurt();
    }
  }

  onE() {
    const G = this.G, P = G.player;
    if (P.tool === 'ext' && P.pin) {
      P.pin = false; P.human.setPin(false); P.human.play('pickup', 0.6);
      G.ui.toast('안전핀 제거 — 이제 노즐을 겨누고 분사하세요', 'good'); G.sfx.click();
      this.pass[0].done = true; this.refreshPass();
      return true;
    }
    return false;
  }

  update(dt) {
    const G = this.G, P = G.player;
    // PASS 판정
    if (P.tool === 'ext' && !P.pin) {
      const aimP = P.computeAim();
      let nearest = null, nd = 1e9;
      for (const f of this.fires) if (f.alive) { const d = P.pos.distanceTo(f.pos); if (d < nd) { nd = d; nearest = f; } }
      if (nearest && !this.pass[1].done) {
        const aimErr = aimP.distanceTo(nearest.pos);
        if (nd >= 1.8 && nd <= 5.6 && aimErr < 1.6) { this.pass[1].done = true; this.refreshPass(); }
      }
      if (P.firing) {
        if (!this.pass[2].done) { this.pass[2].done = true; this.refreshPass(); }
        if (P.sweepAccum - this.lastSweep > 0) { this.sweep = (this.sweep || 0) + (P.sweepAccum - this.lastSweep); this.lastSweep = P.sweepAccum; }
        if ((this.sweep || 0) > 0.55 && !this.pass[3].done) { this.pass[3].done = true; this.refreshPass(); G.ui.toast('PASS 완료 — 쓸어 뿌리기까지 정확합니다', 'good'); }
        if (nearest && nd > 6.2 && !this._far) { this._far = true; G.ui.toast('사거리 밖입니다 — 3~5m 거리로 접근하세요', 'warn'); setTimeout(() => (this._far = false), 3000); }
        if (nearest && nd < 1.7 && !this._near) { this._near = true; G.ui.toast('너무 가깝습니다 — 열기에 주의 (3~5m 유지)', 'warn'); setTimeout(() => (this._near = false), 3000); }
      }
    }
    if (this.hasHose) {
      const hand = P.human.arms.R.hand.getWorldPosition(new THREE.Vector3());
      this.hose.update(this.hoseStart, hand);
    }
    // 마커
    let tgt = null;
    if (!this.hasExt) tgt = [this.I.extPos.x, 1.7, this.I.extPos.z, '소화기'];
    else {
      let best = null, bd = 1e9;
      for (const f of this.fires) if (f.alive) { const d = P.pos.distanceTo(f.pos); if (d < bd) { bd = d; best = f; } }
      if (best) tgt = [best.pos.x, best.pos.y + 1.1, best.pos.z, TYPE_INFO[best.type].name];
      else if (!this.reported) tgt = [this.I.exit.x, 2.2, this.I.exit.z + 0.6, '출입구'];
    }
    this.markerTarget = tgt ? { pos: new THREE.Vector3(tgt[0], tgt[1], tgt[2]), label: tgt[3] } : null;
    this.smokeFx = 0;
    // 화재 인원 소진 확인
    if (P.tool === 'ext' && P.stats.ext <= 0 && !this._empty) { this._empty = true; G.ui.toast('소화기가 비었습니다 — 비치 장소에서 새 소화기로 교체 (E)', 'warn'); }
    if (P.stats.ext > 25) this._empty = false;
    // 소화기 분말 소진 후 새 소화기를 쓰면 핀 재설정 필요
  }

  teardown() {
    const G = this.G;
    G.ui.setPass(null);
    G.fx.onWrongAgent = null;
    this.hose && this.hose.dispose();
    G.fx.clearAll();
    G.player.pin = true;
  }
}
