// 임무 5 — 소화약제 선택 실습: 화재 종류에 맞는 약제를 골라 진압 (잘못 고르면 확대·감전·폭발)
import * as THREE from 'three';
import { Mission } from './mission.js';
import { QUIZ } from '../data/quizzes.js';
import { AGENTS } from '../data/agents.js';
import { bindAgentTiles } from '../ui/touch.js';
import { IS_TOUCH } from '../core/device.js';
import { Human } from '../character/human.js';

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
const dampAngleSimple = (a, b, k, dt) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };

export class AgentMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.fires = [];
    this.reported = false;
    this.autoT = -1; // 모두 진압 후 자동 종료까지 남은 시간
    this.hintOn = false;
    this.hint = true; // 터치 힌트 버튼 표시용
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
    this.buildSpectators();

    for (const f of I.fires) {
      const rule = RULES[f.id];
      const fire = G.fx.addFire(f.pos, { size: f.size, hp: f.hp, type: f.type, heat: 2.4 + f.size * 1.6, smoke: f.smoke, label: f.label, id: f.id, tint: f.tint, light: f.light, smokeC: f.smokeC, smokeA: f.smokeA });
      fire.minHp = 0;
      fire.onOut = () => {
        G.ui.toast(`${rule.name} 진압 — ${rule.cls}: ${rule.ok}`, 'good');
        G.sfx.ok();
        this.cheer(1.4, 3);
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
    this.addObj('pick', '소화약제 6종 확인 — 1~6 키로 모두 선택해 본다', '0/6')
      .addObj('fires', '화재 6곳 진압 — 화재 종류에 맞는 약제 선택 (H: 힌트)', '0/6');
    this.setActive('pick');
    G.ui.banner('화재 종류에 맞는 약제를 고르세요', 2800);
    G.ui.toast(IS_TOUCH ? '아래 약제 칸을 눌러 선택한 뒤 오른쪽 분사 버튼으로 뿌리세요' : '1~6 키: 물 · 분말 · CO₂ · 포 · 팽창질석/모래 · K급 — 클릭으로 방사', 'info');
  }

  // 화재 주변에서 지켜보는 동료 대원들 — 진압하면 박수
  buildSpectators() {
    const I = this.I;
    this.crowd = [];
    const looks = [['#c99472', '#1b1511'], ['#b98763', '#2a1d14'], ['#d6a785', '#3a2a1a'], ['#a67453', '#111'], ['#c99472', '#4a3320'], ['#b98763', '#1b1511']];
    const spots = [[-9.0, 9.6], [-9.0, 12.2], [9.0, 9.6], [9.0, 12.2], [-3.0, 9.0], [3.0, 9.0]];
    spots.forEach(([x, z], i) => {
      const h = new Human({ skin: looks[i][0], hair: looks[i][1], scale: 0.98 + (i % 3) * 0.03 });
      h.setGear({ pants: true, boots: true, coat: true, helmet: i % 2 === 0, gloves: false });
      h.root.position.copy(I.p(x, 0, z));
      this.addHuman(h);
      this.crowd.push(h);
      // 몸통 충돌: 부딪히면 통과하지 않고 옆으로 미끄러져 돌아가게 함(물·시선은 통과)
      const pp = h.root.position;
      (this.crowdSolids || (this.crowdSolids = [])).push(this.G.world.solid(pp.x, 0.9, pp.z, 0.7, 1.8, 0.7, 'person', { water: false, view: false }));
    });
  }

  cheer(sec, loudness) {
    for (const h of this.crowd || []) h.clap(sec * (0.85 + Math.random() * 0.3));
    this.G.sfx.applause(sec, loudness);
  }

  buildPicker() {
    const el = document.createElement('div');
    el.className = 'agentpick';
    el.innerHTML = AGENTS.map((a, i) => `<div class="ag" data-id="${a.id}"><kbd>${i + 1}</kbd><i style="background:${a.color}"></i><b>${a.name}</b><small>${a.info}</small><em class="amt">100%</em></div>`).join('');
    document.body.appendChild(el);
    this.pickEl = el;
    this.tiles = [...el.querySelectorAll('.ag')];
    bindAgentTiles(this.G, el);
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
      for (let k = 0; k < 12; k++) G.world.move(P.pos, P.radius, away.x * 0.15, away.z * 0.15); // 작은 단계로 밀어 벽을 뚫지 않게
    }
  }

  updateCount() {
    const out = this.fires.filter((f) => !f.alive).length;
    this.setCount('fires', `${out}/${this.fires.length}`);
    if (out === this.fires.length && this.autoT < 0) {
      this.complete('fires');
      this.G.ui.banner('모두 진압!', 2600);
      this.G.ui.setHint(null);
      this.cheer(2.6, 6);
      this.autoT = 2.5; // 별도 종료 버튼 없이 약 2.5초 뒤 자동으로 문제/결과로 넘어감
    }
  }

  // ── 힌트: 가장 가까운 화재에 쓸 약제 / 쓰면 안 되는 약제
  hintFor(f) {
    const rule = RULES[f.id];
    const nm = (id) => AGENTS.find((a) => a.id === id).name;
    const use = Object.entries(rule.eff).sort((a, b) => b[1] - a[1]).map(([id]) => nm(id));
    const no = [...Object.keys(rule.bad || {}).map((id) => `${nm(id)}(위험)`), ...Object.keys(rule.weak || {}).map((id) => `${nm(id)}(효과 없음)`)];
    return `<b class="ht">💡 힌트 · ${rule.name} (${rule.cls})</b><div class="use">✔ 사용: ${use.join(' › ')}</div><div class="no">✖ 금지/부적합: ${no.length ? no.join(', ') : '없음'}</div><small>${rule.ok}</small>`;
  }

  nearestFire() {
    const P = this.G.player;
    let best = null, bd = 1e9;
    for (const f of this.fires) if (f.alive) { const d = P.pos.distanceTo(f.pos); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  update(dt) {
    const G = this.G, P = G.player;
    // 구경하는 대원들은 플레이어 쪽을 바라봄
    for (const h of this.crowd || []) {
      const dx = P.pos.x - h.root.position.x, dz = P.pos.z - h.root.position.z;
      h.root.rotation.y = dampAngleSimple(h.root.rotation.y, Math.atan2(dx, dz), 4, dt);
      h.update(dt, { speed: 0 });
    }
    // H 키(또는 힌트 버튼): 힌트 패널 켜기/끄기 — 팝업이 열려 있는 동안은 UI가 알아서 숨김
    if (G.input.pressed('KeyH')) { this.hintOn = !this.hintOn; if (!this.hintOn) G.ui.setHint(null); }
    if (this.hintOn) {
      const nf = this.nearestFire();
      if (nf) { if (this._hintId !== nf.id) { this._hintId = nf.id; G.ui.setHint(this.hintFor(nf)); } } else { this._hintId = null; G.ui.setHint(null); }
    } else this._hintId = null;
    // 모두 진압되면 배너 → 약 2.5초 뒤 자동 종료
    if (this.autoT >= 0) {
      this.autoT -= dt;
      if (this.autoT < 0 && !this.reported) { this.reported = true; this.finish(true); }
    }
    // 약제 선택 진행도 / HUD
    if (P.agentSel) this.used.add(P.agentSel);
    if (!this.objs[0].done) {
      this.setCount('pick', `${this.used.size}/6`);
      if (this.used.size >= AGENTS.length) { this.complete('pick'); G.ui.toast('약제 6종을 모두 확인했습니다', 'good'); }
    }
    if (this.pickEl) this.pickEl.style.display = G.ui.modal.classList.contains('hidden') ? '' : 'none'; // 팝업이 열리면 약제 바 숨김
    if (this.tiles) for (const t of this.tiles) {
      t.classList.toggle('on', t.dataset.id === P.agentSel);
      const amt = Math.ceil(P.agentAmt[t.dataset.id] ?? 100);
      const em = t.querySelector('.amt');
      if (em.textContent !== amt + '%') em.textContent = amt + '%';
      t.classList.toggle('empty', amt <= 0);
    }
    // 안전장치: 실습장 밖으로 나가면 입구로 복귀
    const O = this.I.O;
    if (P.pos.x < O.x - 9.4 || P.pos.x > O.x + 9.4 || P.pos.z < O.z - 0.1 || P.pos.z > O.z + 13.6) {
      P.teleport(this.I.spawn, 0);
      G.ui.toast('실습장 안으로 복귀했습니다', 'info');
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
    }
    this.markerTarget = tgt ? { pos: new THREE.Vector3(tgt[0], tgt[1], tgt[2]), label: tgt[3] } : null;
    this.smokeFx = 0;
  }

  teardown() {
    const G = this.G;
    G.ui.setHint(null);
    for (const sd of this.crowdSolids || []) { const k = G.world.solids.indexOf(sd); if (k >= 0) G.world.solids.splice(k, 1); }
    this.pickEl && this.pickEl.remove();
    G.fx.onAgentHit = null;
    G.shake = 0;
    G.fx.clearAll();
    G.player.agentSel = null;
    G.player.allowed.agent = false;
  }
}
