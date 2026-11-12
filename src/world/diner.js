// 소방이네 고깃집: 입장/퇴장 · 주문서 · 불판 · 식사(기력 회복)
import * as THREE from 'three';
import { Human } from '../character/human.js';
import { DINER } from './town.js';

export const MENU = [
  { id: 'mul', name: '물냉면', gain: 14, kind: 'dish', col: '#d8e6ee', top: '#c9d8e0' },
  { id: 'bib', name: '비빔냉면', gain: 14, kind: 'dish', col: '#d8d2c8', top: '#b8301c' },
  { id: 'doen', name: '된장찌개', gain: 12, kind: 'dish', col: '#2a2420', top: '#8a5a2a' },
  { id: 'cola', name: '콜라', gain: 5, kind: 'dish', col: '#4a1a12', top: '#2a0e0a', can: true },
  { id: 'soda', name: '사이다', gain: 5, kind: 'dish', col: '#8ad0a0', top: '#d8f2e0', can: true },
  { id: 'stone', name: '돌솥밥', gain: 16, kind: 'dish', col: '#201c1a', top: '#f4efe2' },
  { id: 'egg', name: '계란찜', gain: 8, kind: 'dish', col: '#2a2420', top: '#f2c845' },
  { id: 'sam', name: '삼겹살', gain: 4, kind: 'meat', sliceGain: 4 },
  { id: 'mok', name: '목삼겹', gain: 5, kind: 'meat', sliceGain: 5 },
];
const BY = Object.fromEntries(MENU.map((m) => [m.id, m]));
const COOK_T = 8, BURN_T = 17, N_SLICE = 6;
const RAW = new THREE.Color('#e8a0a0'), DONE = new THREE.Color('#a8683c'), BURNT = new THREE.Color('#1d1511');

export class Diner {
  constructor(G) {
    this.G = G;
    this.I = G.world.intR;
    this.tables = this.I.tables.map((t) => Object.assign(t, { dishes: [], slices: [] }));
    this.inside = false;
    this.owner = new Human({ skin: '#c89472', hair: '#1a1410', scale: 1.0 });
    this.owner.root.position.copy(this.I.p(3.5, 0, 10.4));
    this.owner.root.rotation.y = Math.PI;
    this.I.group.add(this.owner.root);
    this.its = [];
    // 사장님 앞치마(흰 박스)
    this.its.push({ pos: this.I.exit, radius: 2.2, label: '밖으로 나가기', onUse: () => this.leave() });
    this.its.push({ pos: this.owner.root.position, radius: 2.6, label: '사장님과 대화', onUse: () => this.talk() });
    this.tables.forEach((t) => this.its.push({ pos: t.pos, radius: 2.7, label: `${t.id + 1}번 테이블 · 주문 / 식사`, onUse: () => this.tableMenu(t) }));
    this.doorIt = { pos: G.world.dinerDoor, radius: 3.0, label: '소방이네 고깃집 들어가기', onUse: () => this.enter() };
  }

  async enter() {
    const G = this.G, W = G.world, P = G.player;
    G.state = 'trans'; G.input.active = false;
    await G.ui.fade(true, 400);
    W.showZone('diner');
    G.removeHubIts();
    for (const it of this.its) G.interactables.push(it);
    this.inside = true;
    P.teleport(this.I.spawn, 0);
    G.ui.setObjectives('소방이네 고깃집', [
      { text: '테이블(E)에서 주문서를 보고 음식을 고른다', active: true },
      { text: '삼겹살·목삼겹은 직접 구워 잘 익었을 때 먹는다', active: false },
      { text: '기력은 식사로만 회복된다', active: false },
    ]);
    await G.ui.fade(false, 400);
    G.resume();
    G.ui.toast(`기력 ${Math.ceil(G.progress.hp)} / ${G.progress.maxHp}`, 'info');
  }

  async leave() {
    const G = this.G, W = G.world, P = G.player;
    G.state = 'trans'; G.input.active = false;
    await G.ui.fade(true, 400);
    for (const it of this.its) { const k = G.interactables.indexOf(it); if (k >= 0) G.interactables.splice(k, 1); }
    W.showZone('outdoor');
    this.inside = false;
    P.teleport(new THREE.Vector3(DINER.x, 0, DINER.z + DINER.d / 2 + 4.2), 0);
    P.resetStats(G.progress);
    G.addHubIts();
    G.hubObjectives();
    await G.ui.fade(false, 400);
    G.resume();
  }

  async talk() {
    const G = this.G;
    G.state = 'modal';
    await G.ui.talk('사장님', ['어서 와요, 소방관님! 오늘도 고생 많았죠?', '테이블에서 주문서를 보고 마음껏 시켜 먹어요. 기력은 여기서 먹어야만 채워져요.', '고기는 겉이 갈색으로 익었을 때가 제일 맛있고, 너무 오래 두면 타니까 조심해요!']);
    G.ui.close(); G.resume();
  }

  async tableMenu(t) {
    const G = this.G, P = G.progress;
    G.state = 'modal';
    for (;;) {
      const pend = t.dishes.length, ready = t.slices.filter((s) => this.stage(s) === 'done').length, raw = t.slices.filter((s) => this.stage(s) === 'raw').length;
      const act = await G.ui.ask(`<div class="talk"><div class="who">${t.id + 1}번 테이블</div>
        <p>기력 <b>${Math.ceil(P.hp)} / ${P.maxHp}</b></p>
        <p>나온 음식 ${pend}개 · 불판 위 고기: 익음 ${ready}점 / 덜 익음 ${raw}점</p></div>`, [
        { label: '📋 주문서 보기', primary: true, value: 'order' },
        { label: '🍜 나온 음식 먹기', value: 'dish' },
        { label: '🥩 잘 익은 고기 먹기', value: 'meat' },
        { label: '닫기', value: 'close' },
      ]);
      if (act === 'order') { await this.orderSheet(t); continue; }
      if (act === 'dish' || act === 'meat') { this.eat(t, act); G.ui.close(); break; }
      G.ui.close(); break;
    }
    G.resume();
  }

  async orderSheet(t) {
    const G = this.G, cart = {};
    for (;;) {
      const lines = MENU.filter((m) => cart[m.id]).map((m) => `${m.name} ×${cart[m.id]}`).join(' · ') || '(비어 있음)';
      const v = await G.ui.ask(`<div class="talk"><div class="who">📋 주문서 — 소방이네 고깃집</div>
        <p>메뉴를 누르면 1개씩 추가됩니다. (삼겹살·목삼겹은 불판에 직접 구워 먹습니다)</p>
        <p>선택: <b>${lines}</b></p></div>`,
      [...MENU.map((m) => ({ label: `${m.name}${cart[m.id] ? ' ×' + cart[m.id] : ''}`, value: m.id })), { label: '✅ 주문 완료', primary: true, value: '_ok' }, { label: '취소', value: '_x' }]);
      if (v === '_x') return;
      if (v === '_ok') break;
      cart[v] = Math.min(4, (cart[v] || 0) + 1);
    }
    let n = 0;
    for (const m of MENU) for (let i = 0; i < (cart[m.id] || 0); i++) { if (this.serve(t, m)) n++; }
    if (n) { G.ui.toast(`주문이 나왔습니다 (${n}건)`, 'good'); G.sfx.click(); } else G.ui.toast('테이블이 가득 찼습니다', 'bad');
  }

  serve(t, m) {
    const W = this.G.world, grp = this.I.group;
    if (m.kind === 'meat') {
      if (t.slices.length > 0 && t.slices.length + N_SLICE > 12) return false;
      for (let i = 0; i < N_SLICE; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: RAW.clone(), roughness: 0.55 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.11), mat);
        const k = t.slices.length, a = (k / 12) * Math.PI * 2 + 0.3, r = k < 6 ? 0.2 : 0.33;
        mesh.position.set(t.grillPos.x + Math.cos(a) * r, 0.935, t.grillPos.z + Math.sin(a) * r);
        mesh.rotation.y = a + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        mesh.castShadow = true;
        grp.add(mesh);
        t.slices.push({ kind: m.id, t: 0 - i * 0.6, mesh, mat, eaten: false });
      }
      return true;
    }
    if (t.dishes.length >= 6) return false;
    const k = t.dishes.length, side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(m.can ? new THREE.CylinderGeometry(0.06, 0.06, 0.16, 14) : new THREE.CylinderGeometry(0.2, 0.13, 0.12, 20), new THREE.MeshStandardMaterial({ color: m.col, roughness: 0.4 }));
    bowl.position.y = m.can ? 0.08 : 0.06; g.add(bowl);
    if (!m.can) { const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18), new THREE.MeshStandardMaterial({ color: m.top, roughness: 0.6 })); top.position.y = 0.115; g.add(top); }
    g.position.set(t.pos.x + side * 0.55, 0.82, t.pos.z + (row - 1) * 0.38);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grp_add(this.I.group, g);
    t.dishes.push({ id: m.id, mesh: g });
    return true;
  }

  stage(s) { return s.t < COOK_T ? 'raw' : s.t < BURN_T ? 'done' : 'burnt'; }

  eat(t, mode) {
    const G = this.G, P = G.progress;
    if (P.hp >= P.maxHp - 0.01) { G.ui.toast('배가 불러서 더 먹을 수 없습니다 (기력 가득)', 'info'); return; }
    let gain = 0, msg = '';
    if (mode === 'dish') {
      const d = t.dishes.shift();
      if (!d) { G.ui.toast('나온 음식이 없습니다. 주문서에서 주문하세요', 'bad'); return; }
      gain = BY[d.id].gain; msg = `${BY[d.id].name} 맛있게 먹었다!`;
      this.I.group.remove(d.mesh);
      t.dishes.forEach((x, i) => { const side = i % 2 ? 1 : -1, row = Math.floor(i / 2); x.mesh.position.set(t.pos.x + side * 0.55, 0.82, t.pos.z + (row - 1) * 0.38); });
    } else {
      const live = t.slices.filter((s) => !s.eaten);
      const s = live.find((x) => this.stage(x) === 'done') || live.find((x) => this.stage(x) === 'burnt');
      if (!live.length) { G.ui.toast('불판 위에 고기가 없습니다', 'bad'); return; }
      if (!s) { G.ui.toast('아직 덜 익었어요! 갈색이 될 때까지 기다리세요', 'bad'); return; }
      const m = BY[s.kind];
      if (this.stage(s) === 'burnt') { gain = 1; msg = '고기가 타버렸다… (기력 거의 회복 안 됨)'; } else { gain = m.sliceGain; msg = `${m.name} 한 점! 육즙이 가득`; }
      s.eaten = true; this.I.group.remove(s.mesh); t.slices = t.slices.filter((x) => x !== s);
    }
    P.setStamina(P.hp + gain);
    G.player.stats.hp = P.hp;
    G.player.human.play && G.player.human.play('reach', 0.7);
    G.ui.toast(`${msg}  기력 +${gain}  (${Math.ceil(P.hp)} / ${P.maxHp})`, 'good');
    G.sfx.click();
  }

  update(dt) {
    if (!this.inside) return;
    for (const t of this.tables) {
      for (const s of t.slices) {
        s.t += dt;
        const k = s.t < 0 ? 0 : s.t < COOK_T ? s.t / COOK_T : 1;
        const c = s.mat.color.copy(RAW).lerp(DONE, k);
        if (s.t > COOK_T) c.lerp(BURNT, Math.min(1, (s.t - BURN_T + 4) / 6 > 0 ? (s.t - BURN_T + 4) / 6 : 0));
      }
      t.coal.material.emissiveIntensity = 1.2 + Math.sin(performance.now() / 180 + t.id) * 0.25;
    }
    this.owner.update(dt, { speed: 0 });
  }
}
function grp_add(grp, o) { grp.add(o); }
