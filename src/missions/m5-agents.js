// 임무 5 — 소화약제 선택 실습: 화재 종류에 맞는 약제를 골라 진압 (잘못 고르면 확대·감전·폭발)
import * as THREE from 'three';
import { Mission } from './mission.js';
import { QUIZ } from '../data/quizzes.js';
import { AGENTS } from '../data/agents.js';

// eff: 약제별 효과 계수(1=최적). weak: 효과 낮음(불이 줄었다 되살아남). bad: 위험 반응.
const RULES = {
  wood: {
    name: '나무(목재) 화재', cls: '일반화재(A급)',
    ok: '나무·종이는 일반화재(A급)입니다. 물의 냉각소화가 가장 효과적입니다.',
    eff: { water: 1, foam: 0.8, powder: 0.7, kagent: 0.55 },
    weak: { co2: '이산화탄소는 냉각 효과가 작아 속불이 되살아납니다.', sand: '모래는 덮는 범위가 좁아 불씨가 남습니다.' },
  },
  gas: {
    name: '휘발유 화재', cls: '유류화재(B급)',
    ok: '유류화재(B급)는 포·분말·CO₂로 질식소화합니다. 물은 금지입니다.',
    eff: { foam: 1, powder: 0.9, co2: 0.85 },
    weak: { kagent: '강화액은 유류에는 효과가 약합니다.', sand: '모래만으로는 넓은 유면을 덮기 어렵습니다.' },
    bad: { water: ['flare', '휘발유 화재에 물을 사용했습니다 — 기름이 물 위에 떠 번지며 불이 확대됩니다'] },
  },
  elec: {
    name: '배전반(전기) 화재', cls: '전기화재(C급)',
    ok: '전기화재(C급)는 전원 차단 후 CO₂·분말 같은 비전도성 약제를 씁니다.',
    eff: { co2: 1, powder: 0.85 },
    weak: { sand: '모래는 전기설비 화재에 적합하지 않습니다.' },
    bad: {
      water: ['shock', '전기 설비 화재에 물을 직접 방수했습니다 — 감전 위험! 비전도성 약제를 써야 합니다'],
      foam: ['shock', '전기 설비 화재에 포(수성 약제)를 사용했습니다 — 전도성이라 감전 위험입니다'],
      kagent: ['shock', '전기 설비 화재에 수성 약제(강화액)를 사용했습니다 — 감전 위험입니다'],
    },
  },
  sodium: {
    name: '나트륨 화재', cls: '금속화재(D급)',
    ok: '금수성 금속화재(D급)는 팽창질석·팽창진주암·마른모래로 덮어 질식소화합니다.',
    eff: { sand: 1 },
    weak: { powder: '일반 분말은 금속화재에 효과가 없습니다.', co2: '이산화탄소는 금속화재에 효과가 없고 오히려 반응할 수 있습니다.' },
    bad: {
      water: ['explode', '나트륨 화재에 물을 사용했습니다 — 물과 격렬히 반응해 수소가 발생하고 폭발합니다 (금수성 물질)'],
      foam: ['explode', '나트륨 화재에 포(수성 약제)를 사용했습니다 — 물 성분과 반응해 폭발합니다'],
      kagent: ['explode', '나트륨 화재에 수성 약제를 사용했습니다 — 물 성분과 반응해 폭발합니다'],
    },
  },
  oil: {
    name: '식용유(튀김) 화재', cls: '주방화재(K급)',
    ok: '식용유 화재(K급)는 K급(강화액) 약제가 기름막을 만들어(비누화) 질식·냉각합니다.',
    eff: { kagent: 1, foam: 0.35 },
    weak: { powder: '분말은 불을 잠시 누르지만 고온 기름이 재발화합니다.', co2: '이산화탄소는 냉각이 부족해 재발화합니다.', sand: '모래는 기름이 튈 위험이 있어 부적합합니다.' },
    bad: { water: ['flare', '식용유 화재에 물을 사용했습니다 — 물이 끓어 기름이 튀며 불이 확대됩니다'] },
  },
  li: {
    name: '리튬이온 배터리 화재', cls: '배터리 화재',
    ok: '리튬이온 배터리는 열폭주로 재발화하므로 대량의 물로 냉각하는 것이 핵심입니다.',
    eff: { water: 0.55, foam: 0.3, kagent: 0.3 },
    weak: { powder: '분말은 배터리 내부를 냉각하지 못해 곧 다시 불이 붙습니다.', co2: '이산화탄소는 냉각이 안 되어 재발화합니다.', sand: '모래로는 열폭주를 막지 못합니다.' },
  },
};

const BASE_DMG = 0.16;

export class AgentMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.fires = [];
    this.reported = false;
    this.used = new Set();
    this._weakWarn = {};
  }

  quizPool() { return QUIZ.m5; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, I = W.intD;
    this.I = I;
    G.fx.clearAll();
    W.showZone('lab');
    P.setGear({ pants: true, boots: true, coat: true, hood: true, helmet: true, gloves: true });
    P.setMask(false);
    P.resetStats(G.progress);
    P.allowed = { hose: false, ext: false, tic: false, agent: true };
    P.hoseReady = false;
    P.equip(null);
    P.teleport(I.spawn, 0);
    this.buildPicker();

    for (const f of I.fires) {
      const rule = RULES[f.id];
      const fire = G.fx.addFire(f.pos, { size: f.size, hp: f.hp, type: f.type, heat: 2.4 + f.size * 1.6, smoke: f.smoke, label: f.label, id: f.id, tint: f.tint, light: f.light });
      fire.minHp = 0;
      fire.onOut = () => {
        G.ui.toast(`${rule.name} 진압 — ${rule.cls}: ${rule.ok}`, 'good');
        G.sfx.ok();
        this.updateCount();
      };
      this.fires.push(fire);
    }
    G.fx.onAgentHit = (f, agent, low) => this.hit(f, agent, low);

    this.addInteract({
      pos: I.supplyPos, radius: 2.8, label: '소화약제 보급 (모든 약제 100%)',
      enabled: () => AGENTS.some((a) => (P.agentAmt[a.id] ?? 100) < 99),
      onUse: () => {
        for (const a of AGENTS) P.agentAmt[a.id] = 100;
        if (P.agentSel) P.stats.ext = 100;
        G.ui.toast('소화약제를 모두 충전했습니다', 'good');
      },
    });
    this.addInteract({
      pos: I.exit, radius: 2.6, label: '실습 종료 · 대피 후 보고',
      enabled: () => this.fires.every((f) => !f.alive) && !this.reported,
      onUse: () => { this.reported = true; this.complete('report'); G.ui.banner('실습 종료'); setTimeout(() => this.finish(true), 1200); },
    });

    this.addObj('pick', '소화약제 6종 확인 — 1~6 키로 모두 선택해 본다', '0/6')
      .addObj('fires', '화재 6곳 진압 — 화재 종류에 맞는 약제 선택', '0/6')
      .addObj('report', '출입구에서 실습 종료 보고');
    this.setActive('pick');
    G.ui.banner('화재 종류에 맞는 약제를 고르세요', 2800);
    G.ui.toast('1~6 키: 물 · 분말 · CO₂ · 포 · 팽창질석/모래 · K급 — 클릭으로 방사', 'info');
  }

  buildPicker() {
    const el = document.createElement('div');
    el.className = 'agentpick';
    el.innerHTML = AGENTS.map((a, i) => `<div class="ag" data-id="${a.id}"><kbd>${i + 1}</kbd><i style="background:${a.color}"></i><b>${a.name}</b><small>${a.info}</small><em class="amt">100%</em></div>`).join('');
    document.body.appendChild(el);
    this.pickEl = el;
    this.tiles = [...el.querySelectorAll('.ag')];
  }

  // 약제가 불에 닿을 때마다 호출 (입자 1개당)
  hit(f, agent, low) {
    const G = this.G, P = G.player;
    const rule = RULES[f.id];
    if (!rule || !f.alive) return;
    const bad = rule.bad && rule.bad[agent];
    if (bad) { this.badReaction(f, agent, bad); return; }
    const eff = rule.eff[agent];
    if (eff) {
      f.weakMode = false;
      f.damage(BASE_DMG * eff * (low ? 1.6 : 0.6));
      return;
    }
    // 효과 낮음: 불길이 줄었다가 되살아남 (절반 이하로는 내려가지 않음)
    const msg = rule.weak && rule.weak[agent];
    const floor = f.maxHp * 0.5;
    if (f.hp > floor) f.hp = Math.max(floor, f.hp - BASE_DMG * 0.25 * (low ? 1.6 : 0.6));
    if (msg && !this._weakWarn[f.id + agent]) {
      this._weakWarn[f.id + agent] = true;
      G.ui.toast(`효과 부족 — ${msg}`, 'warn');
      this.mistake(`${rule.name}에 ${AGENTS.find((a) => a.id === agent).name}은(는) 적합하지 않습니다 — ${msg}`, 40);
    }
    // 되살아남: 약제 투입을 멈추면 서서히 회복
    f.regenHold = 0.8; f.weakMode = true;
  }

  badReaction(f, agent, [kind, text]) {
    const G = this.G, P = G.player;
    if (f.hitCool > 0) return;
    const d = P.pos.distanceTo(f.pos);
    if (kind === 'flare') {
      f.hitCool = 2.2; f.flareUp();
      this.mistake(text, 130);
      G.ui.banner('🔥 불이 확대되었습니다!', 2200);
      if (d < 4.5) P.hurt(12, 'flare');
      G.sfx.hurt();
    } else if (kind === 'shock') {
      f.hitCool = 1.6; f.shock = 1;
      this.mistake(text, 150);
      G.ui.banner('⚡ 감전 위험!', 2200);
      G.ui.flash('#bfe0ff', 500);
      P.hurt(20, 'shock'); G.sfx.hurt();
      G.fx.spark.emit({ x: f.pos.x, y: f.pos.y + 0.3, z: f.pos.z, vx: 0, vy: 2, vz: 0, life: 0.6, s0: 0.5, s1: 0.1, a0: 1, a1: 0, c0: [0.7, 0.85, 1] });
    } else if (kind === 'explode') {
      f.hitCool = 4.5;
      const first = !this._exploded;
      this._exploded = true;
      G.fx.explode(f.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 1.25);
      f.flareUp();
      this.mistake(text, 220);
      G.ui.banner('💥 폭발! 나트륨이 물과 반응했습니다', 3200);
      G.ui.flash('#fff6d8', 900);
      G.shake = 1.1;
      P.hurt(Math.max(10, (first ? 44 : 28) - d * 3.5), 'explosion');
      G.sfx.hurt(); G.sfx.alarm && G.sfx.alarm();
      // 충격파로 뒤로 밀림
      const away = new THREE.Vector3(P.pos.x - f.pos.x, 0, P.pos.z - f.pos.z).normalize();
      G.world.move(P.pos, P.radius, away.x * 1.8, away.z * 1.8);
    }
  }

  updateCount() {
    const out = this.fires.filter((f) => !f.alive).length;
    this.setCount('fires', `${out}/${this.fires.length}`);
    if (out === this.fires.length) { this.complete('fires'); this.G.ui.banner('화재 6곳 진압 완료'); }
  }

  update(dt) {
    const G = this.G, P = G.player;
    // 약제 선택 진행도 / HUD
    if (P.agentSel) this.used.add(P.agentSel);
    if (!this.objs[0].done) {
      this.setCount('pick', `${this.used.size}/6`);
      if (this.used.size >= AGENTS.length) { this.complete('pick'); G.ui.toast('약제 6종을 모두 확인했습니다', 'good'); }
    }
    if (this.tiles) for (const t of this.tiles) {
      t.classList.toggle('on', t.dataset.id === P.agentSel);
      const amt = Math.ceil(P.agentAmt[t.dataset.id] ?? 100);
      const em = t.querySelector('.amt');
      if (em.textContent !== amt + '%') em.textContent = amt + '%';
      t.classList.toggle('empty', amt <= 0);
    }
    // 효과 약한 약제 사용 후 불길 되살아남(회복)
    for (const f of this.fires) {
      if (!f.alive) continue;
      if (f.regenHold > 0) { f.regenHold -= dt; continue; }
      if (f.weakMode && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.12 * dt);
    }
    // 마커
    let tgt = null;
    if (this.fires.some((f) => f.alive)) {
      let best = null, bd = 1e9;
      for (const f of this.fires) if (f.alive) { const d = P.pos.distanceTo(f.pos); if (d < bd) { bd = d; best = f; } }
      tgt = [best.pos.x, best.pos.y + 1.0, best.pos.z, RULES[best.id].name.replace(' 화재', '')];
    } else if (!this.reported) tgt = [this.I.exit.x, 2.2, this.I.exit.z + 0.6, '출입구'];
    this.markerTarget = tgt ? { pos: new THREE.Vector3(tgt[0], tgt[1], tgt[2]), label: tgt[3] } : null;
    this.smokeFx = 0;
  }

  teardown() {
    const G = this.G;
    this.pickEl && this.pickEl.remove();
    G.fx.onAgentHit = null;
    G.shake = 0;
    G.fx.clearAll();
    G.player.agentSel = null;
    G.player.allowed.agent = false;
  }
}
