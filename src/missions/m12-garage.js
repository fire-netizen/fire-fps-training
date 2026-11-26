// 임무 12 — 지하주차장 화재 (발화 약 10분 경과 · 스프링클러 작동 중)
// 흐름: 호스 꺼내기 → 스프링클러 송수구 연결 → 소방차 펌프 가압 → 소화전 급수 연결 → 면체 착용·진입
//       → 제연설비·배연설비 가동 → 화점 3곳 진압 → 지상 보고
import * as THREE from 'three';
import { LAYOUT } from '../world/world.js';
import { Human } from '../character/human.js';
import { HoseLine } from '../world/hose.js';
import { QUIZ } from '../data/quizzes.js';
import { FieldMission } from './m6-special.js';
import { rand, clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FULL = { pants: true, boots: true, coat: true, hood: true, scba: true, helmet: true, gloves: true };

export class GarageMission extends FieldMission {
  constructor(G, def) {
    super(G, def);
    this.hoseA = null; this.stateA = 'none'; this.stateB = 'none';
    this.pumping = false; this.inGarage = false;
    this.bt = 36; this.tt = 100; // 건물 수조(%) · 소방차 수조(%)
    this.smokeOn = false; this.exhaustOn = false;
    this.fires = [];
    this.density = 0.07;
    this.reported = false; this.supplyFailed = false; this.warned = {};
  }
  quizPool() { return QUIZ.m12; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, E = LAYOUT.siteE, I = W.intG;
    this.I = I;
    this.baseSetup(FULL);
    P.setMask(false);
    P.allowed = { hose: false, ext: false, tic: false };
    const scene = G.engine.scene;

    // ── 지상 설비 위치
    const tr = W.truck.position;
    this.outPts = { A: V(tr.x - 4.7, 0.9, tr.z), B: V(tr.x - 4.2, 0.9, tr.z + 1.0) };
    this.pumpPanel = V(tr.x - 2.4, 0, tr.z + 2.7);
    this.takeA = V(tr.x - 5.8, 0, tr.z - 0.8);
    this.takeB = V(tr.x - 5.6, 0, tr.z + 1.4);
    const cp = W.connPos;
    this.connPt = V(cp.x, 0.9, cp.z - 0.5);
    this.hoseA = new HoseLine(scene, '#e0a41c', W); this.hoseB = new HoseLine(scene, '#d9d4c6', W);
    this.addProp(this.hoseA.mesh); this.addProp(this.hoseB.mesh);

    // 현장 인원: 기관원(펌프 조작) · 지휘관
    const op = new Human({ skin: '#c99472', scale: 1.02 });
    op.setGear({ pants: true, boots: true, coat: true, hood: true, helmet: true, gloves: true });
    op.root.position.set(this.pumpPanel.x - 0.6, 0, this.pumpPanel.z + 0.8); op.root.rotation.y = Math.PI;
    this.addHuman(op, true);
    const cap = new Human({ skin: '#b98763', scale: 1.03 });
    cap.setGear({ pants: true, boots: true, coat: true, hood: true, helmet: true, gloves: true });
    cap.root.position.set(tr.x + 3.4, 0, tr.z + 3.6); cap.root.rotation.y = Math.PI * 0.8;
    this.addHuman(cap, true); this.captain = cap;

    // 건물 외부 연기(주차장 배기구 + 램프)
    G.fx.addSmokeSource(V(W.ventPos.x, 0.9, W.ventPos.z), 5, 2.4);
    G.fx.addSmokeSource(V(W.garageDoor.x, 2.6, W.garageDoor.z - 2.8), 3.5, 2.2);

    // ── 1) 송수 호스 꺼내기 / 2) 송수구 연결 / 3) 펌프 가압 / 4) 소화전 급수
    this.addInteract({
      pos: this.takeA, radius: 3.2, label: '소방차에서 송수 호스 꺼내기', hold: 1.2,
      enabled: () => this.stateA === 'none',
      onUse: () => {
        this.stateA = 'carry'; this.hoseA.visible = true; P.tether = { pos: this.outPts.A, max: 46 };
        G.ui.toast('호스(65mm)를 어깨에 걸었습니다 — 건물 외벽의 「스프링클러 송수구」로 이동', 'good'); G.sfx.ok();
        this.complete('take');
      },
    });
    this.addInteract({
      pos: cp, radius: 2.2, label: '스프링클러 송수구에 호스 결합', hold: 1.6,
      enabled: () => this.stateA === 'carry',
      onUse: () => {
        this.stateA = 'fixed'; P.tether = null; P.human.play('check', 1.2); G.sfx.ok();
        G.ui.toast('송수구 표지(스프링클러)를 확인하고 결합부를 단단히 체결했습니다', 'good'); this.complete('connect');
      },
    });
    this.addInteract({
      pos: W.decoyPos, radius: 1.8, label: '연결송수관 송수구에 호스 결합', hold: 1.0,
      enabled: () => this.stateA === 'carry',
      onUse: () => {
        this.mistake('연결송수관 송수구에 연결했습니다 — 스프링클러용 송수구(파랑 표지)가 아닙니다', 70);
        G.ui.toast('이 송수구는 연결송수관(옥내소화전)용입니다. 스프링클러 송수구를 찾으세요', 'warn');
      },
    });
    this.addInteract({
      pos: this.pumpPanel, radius: 2.6, label: '소방차 펌프 가압 · 송수 개시', hold: 1.4,
      enabled: () => this.stateA === 'fixed' && !this.pumping,
      onUse: () => {
        this.pumping = true; P.human.play('reach', 1.0); G.sfx.ok();
        G.ui.banner('💧 송수 개시 — 스프링클러 배관 가압', 2600);
        G.ui.toast('펌프 압력이 오르고 송수구로 물이 들어갑니다', 'good'); this.complete('pump');
      },
    });
    this.addInteract({
      pos: this.takeB, radius: 2.6, label: '소방차 급수용 호스 꺼내기 (소화전 연결용)', hold: 1.0,
      enabled: () => this.pumping && this.stateB === 'none',
      onUse: () => {
        this.stateB = 'carry'; this.hoseB.visible = true; P.tether = { pos: this.outPts.B, max: 30 };
        G.ui.toast('소방차 수조는 계속 줄어듭니다 — 소화전에 연결해 급수를 이어 가세요', 'warn'); G.sfx.ok();
      },
    });
    this.addInteract({
      pos: W.hydrantE, radius: 2.4, label: '소화전에 호스 결합 (소방차 급수)', hold: 1.4,
      enabled: () => this.stateB === 'carry',
      onUse: () => {
        this.stateB = 'fixed'; P.tether = null; P.human.play('check', 1.2); G.sfx.ok();
        G.ui.toast('소화전 → 소방차 급수 연결 완료: 송수를 끊지 않고 계속 보낼 수 있습니다', 'good'); this.complete('hydrant');
      },
    });

    // ── 5) 면체 착용 · 진입
    this.addInteract({
      pos: W.garageDoor, radius: 5, label: '공기호흡기 면체 착용', hold: 0,
      enabled: () => !P.mask && !this.inGarage,
      onUse: () => { P.setMask(true); P.human.play('check', 0.9); G.ui.toast('면체 착용 완료 — 공기호흡기 정상', 'good'); },
    });
    this.addInteract({
      pos: W.garageDoor, radius: 2.6, label: '지하주차장 진입', hold: 0,
      enabled: () => !this.inGarage && this.stateA !== 'none',
      onUse: () => this.tryEnter(),
    });

    // ── 지하 내부
    I.smokePanel.led.material.color.set('#ff3b2f'); I.smokePanel.led.material.emissive.set('#ff3b2f');
    I.exhaustPanel.led.material.color.set('#ff3b2f'); I.exhaustPanel.led.material.emissive.set('#ff3b2f');
    this.addInteract({
      pos: I.smokePanel.pos, radius: 2.4, label: '제연설비 수동기동 (급·배기 팬 가동)', hold: 1.2,
      enabled: () => this.inGarage && !this.smokeOn,
      onUse: () => {
        this.smokeOn = true; I.smokePanel.led.material.color.set('#2fe06a'); I.smokePanel.led.material.emissive.set('#2fe06a'); G.sfx.ok();
        G.ui.toast('제연설비 가동 — 급기구로 신선한 공기가 들어옵니다', 'good'); this.checkVent();
      },
    });
    this.addInteract({
      pos: I.exhaustPanel.pos, radius: 2.4, label: '배연설비 수동기동 (배기 팬 · 댐퍼 개방)', hold: 1.2,
      enabled: () => this.inGarage && !this.exhaustOn,
      onUse: () => {
        this.exhaustOn = true; I.exhaustPanel.led.material.color.set('#2fe06a'); I.exhaustPanel.led.material.emissive.set('#2fe06a'); G.sfx.ok();
        G.ui.toast('배연설비 가동 — 배기 팬이 연기를 지상으로 내보냅니다', 'good'); this.checkVent();
      },
    });
    this.addInteract({
      pos: I.hydrantBox, radius: 2.4, label: '옥내소화전에서 용수 보충', hold: 1.2,
      enabled: () => this.inGarage && P.hoseReady && P.stats.water < 98,
      onUse: () => { P.stats.water = 100; G.ui.toast('옥내소화전에서 용수를 보충했습니다', 'good'); G.sfx.ok(); },
    });
    this.addInteract({
      pos: I.exit, radius: 2.4, label: '지상으로 나가기', hold: 0,
      enabled: () => this.inGarage,
      onUse: () => this.leave(),
    });
    this.addInteract({
      pos: this.captain.root.position, radius: 2.8, label: '지휘관에게 상황 종료 보고', hold: 1.0,
      enabled: () => !this.inGarage && this.fires.length > 0 && this.fires.every((f) => !f.alive && f.cooled) && !this.reported,
      onUse: () => {
        this.reported = true; this.complete('report'); G.ui.banner('상황 종료'); setTimeout(() => this.finish(true), 1500);
      },
    });

    // 화점 3곳 (스프링클러가 눌러 두었지만 가려진 곳은 계속 연소)
    I.fireSpots.forEach((s, k) => {
      const ev = s.label.startsWith('전기차');
      const f = G.fx.addFire(s.pos, { size: ev ? 1.5 : 1.25, hp: ev ? 190 : 115, type: 'A', heat: 4.4, smoke: 0.8, label: s.label });
      f.hidden = true; f.ev = ev; f.cooled = !ev; f.coolT = 0; f.idleT = 0; this.fires.push(f);
      G.fx.addSmokeSource(V(s.pos.x, 2.4, s.pos.z), 5, 2.6);
    });
    this.fires.forEach((f) => { f.hp = f.maxHp * 0.7; }); // 10분간 스프링클러로 어느 정도 약해진 상태
    this.initRain();

    this.addObj('take', '소방차에서 송수 호스를 꺼낸다')
      .addObj('connect', '건물 외벽 「스프링클러 송수구」에 호스를 결합한다')
      .addObj('pump', '소방차 펌프를 가압해 송수를 개시한다', '건물 수조 36% ↓')
      .addObj('hydrant', '소화전에 연결해 소방차 급수원을 확보한다 (송수 지속)')
      .addObj('vent', '지하 진입(면체 착용) 후 제연설비·배연설비를 가동한다', '0/2')
      .addObj('fires', '화점 3곳을 진압한다 (전기차는 불꽃이 꺼진 뒤에도 7초 이상 계속 냉각)', '0/3')
      .addObj('report', '지상으로 나와 지휘관에게 상황 종료 보고');
    this.setActive('take');
    G.ui.toast('발화 약 10분 경과 — 스프링클러가 작동 중입니다. 건물 수조가 줄고 있으니 서두르세요', 'warn');
  }

  tryEnter() {
    const G = this.G, P = G.player;
    if (!this.pumping) { this.mistake('송수를 시작하기 전에 지하로 진입하려 했습니다', 50); G.ui.toast('먼저 송수구로 급수해 스프링클러를 지속 작동시키세요', 'warn'); return; }
    if (this.stateB !== 'fixed') { this.mistake('급수원(소화전)을 확보하기 전에 진입하려 했습니다', 40); G.ui.toast('소방차 수조가 줄고 있습니다 — 소화전 연결을 먼저!', 'warn'); return; }
    if (!P.mask) { G.ui.toast('연기가 짙습니다 — 면체를 먼저 착용하세요', 'warn'); return; }
    this.enter();
  }

  enter() {
    const G = this.G, P = G.player, I = this.I;
    this.inGarage = true;
    G.world.showZone('garage');
    G.fx.clearTransients && G.fx.clearTransients();
    P.teleport(I.spawn, 0);
    P.allowed = { hose: true, ext: false, tic: true };
    P.hoseReady = true; P.tic = false; P.equip(null); P.mode = 'jet';
    if (!this.hose) { this.hose = new HoseLine(G.engine.scene, '#e0a41c', G.world); this.addProp(this.hose.mesh); }
    this.hose.visible = true;
    P.tether = { pos: I.p(0, 0, 1.2), max: 40 };
    this.hosePt = I.p(0, 0.9, 0.6); // 벽 안쪽(입구 안)에서 호스가 시작 — 벽을 뚫고 나오지 않도록
    G.camRig.dist = 3.3; G.camRig.pitch = 0.22;
    G.camRig.update(0, P, null, { free: false });
    G.ui.banner('⬇ 지하주차장 — 스프링클러 작동 중 · 연기 짙음', 2600);
    G.ui.toast('C: 낮은 자세 · T: 열화상 · 1: 관창 · 제연·배연설비를 가동하세요', 'info');
  }

  leave() {
    const G = this.G, P = G.player, W = G.world;
    this.inGarage = false;
    W.showZone('outdoor');
    G.engine.setDensity(G.engine.zone.density);
    this.smokeFx = 0;
    P.teleport(V(W.garageDoor.x, 0, W.garageDoor.z + 1.2), Math.PI);
    P.tic = false; P.equip(null); P.tether = null; P.allowed = { hose: false, ext: false, tic: false };
    if (this.hose) this.hose.visible = false;
    G.camRig.dist = 4.4; G.camRig.pitch = 0.4;
    G.ui.toast('지상으로 복귀했습니다', 'info');
  }

  checkVent() {
    const n = (this.smokeOn ? 1 : 0) + (this.exhaustOn ? 1 : 0);
    this.setCount('vent', `${n}/2`);
    if (n === 2) { this.complete('vent'); this.G.ui.banner('연기가 빠지기 시작합니다', 2200); }
  }

  // 스프링클러 살수 입자(지하)
  initRain() {
    const I = this.I, N = I.heads.length * 9;
    const pos = new Float32Array(N * 3), st = [];
    for (let i = 0; i < N; i++) { const h = I.heads[i % I.heads.length]; st.push({ h, a: Math.random() * Math.PI * 2, r: Math.random() * 1.9, y: Math.random() * 3, v: 4 + Math.random() * 3 }); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c9e2ff', size: 0.07, transparent: true, opacity: 0.8, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.G.engine.scene.add(this.rain); this.addProp(this.rain); this.rainSt = st;
  }

  updateRain(dt, on) {
    this.rain.visible = this.inGarage && on;
    if (!this.rain.visible) return;
    const p = this.rain.geometry.attributes.position, H = this.I.H;
    this.rainSt.forEach((d, i) => {
      d.y += d.v * dt; if (d.y > H - 0.4) { d.y = 0; d.a = Math.random() * Math.PI * 2; d.r = Math.random() * 1.9; }
      const spread = Math.min(1, d.y / 1.2) * d.r;
      p.setXYZ(i, d.h.x + Math.cos(d.a) * spread, d.h.y - d.y, d.h.z + Math.sin(d.a) * spread);
    });
    p.needsUpdate = true;
  }

  update(dt) {
    const G = this.G, P = G.player, st = P.stats, I = this.I;
    this.tickHumans(dt);

    // ── 호스 라인(지상)
    const hand = P.human.arms.R.hand.getWorldPosition(new THREE.Vector3());
    if (this.stateA === 'carry') this.hoseA.update(this.outPts.A, hand);
    else if (this.stateA === 'fixed') this.hoseA.update(this.outPts.A, this.connPt);
    if (this.stateB === 'carry') this.hoseB.update(this.outPts.B, hand);
    else if (this.stateB === 'fixed') this.hoseB.update(this.outPts.B, V(G.world.hydrantE.x, 0.7, G.world.hydrantE.z));
    if (this.inGarage && this.hose) this.hose.update(this.hosePt, hand);

    // ── 급수 모델: 건물 수조 → (송수 후) 소방차 수조 + 소화전 보충
    if (!this.pumping) this.bt = Math.max(0, this.bt - dt * 0.3);
    else {
      this.tt = clamp(this.tt - dt * 0.36 + (this.stateB === 'fixed' ? dt * 0.6 : 0), 0, 100);
    }
    const supply = this.pumping ? this.tt > 0 : this.bt > 0;
    this.sprinkling = supply;
    const txt = this.pumping ? `소방차 수조 ${Math.round(this.tt)}%${this.stateB === 'fixed' ? ' · 소화전 급수 중' : ' ↓'}` : `건물 수조 ${Math.round(this.bt)}% ↓`;
    this.setCount('pump', txt);
    if (this.pumping && this.stateB !== 'fixed' && this.tt < 45 && !this.warned.tt) { this.warned.tt = 1; G.ui.toast('⚠ 소방차 수조 40% 미만 — 소화전에서 급수를 연결하세요', 'warn'); }
    if (!supply && !this.supplyFailed) {
      this.supplyFailed = true;
      this.mistake(this.pumping ? '소방차 수조가 고갈되어 스프링클러 송수가 중단되었습니다' : '송수가 늦어 건물 수조가 고갈 — 스프링클러 방수가 중단되었습니다', 100);
      G.ui.banner('⚠ 스프링클러 방수 중단!', 2400);
    }
    if (supply && this.supplyFailed) this.supplyFailed = false;

    // ── 스프링클러가 화세를 누르거나(공급 중) 되살림(중단)
    for (const f of this.fires) {
      if (!f.alive) continue;
      // 스프링클러는 화세를 일정 수준(하한)까지만 누르며, 플레이어가 직접 낮춘 체력을 되돌리지 않는다
      const floor = f.maxHp * (f.ev ? 0.5 : 0.42);
      if (supply) { if (f.hp > floor) f.hp = Math.max(floor, f.hp - dt * 2.4); }
      else f.hp = Math.min(f.maxHp * 1.2, f.hp + dt * 3.2);
    }
    this.updateRain(dt, supply);
    if (I.fan) I.fan.rotation.z += dt * (this.exhaustOn ? 14 : 0);

    // 전기차: 불꽃이 꺼진 뒤에도 배터리 냉각(7초 이상 계속 방수)이 필요하며, 방수를 멈추면 재발화한다
    for (const f of this.fires) {
      if (!f.ev || f.alive || f.cooled || !this.inGarage) continue;
      const aimed = P.firing && P.aimPoint.distanceTo(f.pos) < 3.6;
      if (aimed) { f.coolT += dt; f.idleT = 0; } else f.idleT += dt;
      if (f.coolT >= 7) { f.cooled = true; G.ui.toast('전기차 배터리 냉각 완료 — 재발화 위험이 낮아졌습니다', 'good'); }
      else if (f.idleT > 4) {
        f.alive = true; f.hp = f.maxHp * 0.35; f.coolT = 0; f.idleT = 0; f.flare = 1.2;
        G.ui.toast('⚠ 전기차 배터리가 재발화했습니다 — 꺼진 뒤에도 계속 냉각하세요', 'bad'); G.sfx.bad && G.sfx.bad();
        this.mistake('전기차 배터리 냉각이 부족해 재발화했습니다', 15);
      }
    }
    const out = this.fires.filter((f) => !f.alive && f.cooled).length;
    const cool = this.fires.find((f) => f.ev && !f.alive && !f.cooled);
    this.setCount('fires', `${out}/${this.fires.length}` + (cool ? ` · 배터리 냉각 ${Math.min(7, Math.floor(cool.coolT))}/7초` : ''));
    if (out === this.fires.length && !this.objs.find((o) => o.id === 'fires').done) {
      this.complete('fires'); G.ui.banner('화점 진압 완료 — 지상으로 복귀해 보고하세요'); this.cheer(2);
    }

    // ── 지하: 시야·연기·공기
    if (this.inGarage) {
      let target = 0.085;
      if (this.smokeOn) target -= 0.022;
      if (this.exhaustOn) target -= 0.03;
      if (out > 0) target -= 0.004 * out;
      target = Math.max(0.018, target);
      this.density += (target - this.density) * Math.min(1, dt * 0.35);
      const dens = P.tic ? Math.min(this.density, 0.026) : P.crouch ? this.density * 0.8 : this.density;
      G.engine.setDensity(dens);
      this.smokeFx = P.tic ? 0.1 : clamp(this.density * 5.5, 0.12, 0.55) * (P.crouch ? 0.7 : 1);
      if (!P.mask) { P.hurt(3 * dt, 'smoke'); this.mistake('면체 없이 연기 속에 있었습니다', 60); }
      if (P.mask && st.air < 30 && !this._airWarn) { this._airWarn = true; G.ui.banner('⚠ 공기 잔량 부족 — 즉시 철수', 2400); }
      if (st.air >= 30) this._airWarn = false;
    } else this.smokeFx = 0;

    // ── 안내 마커
    const W = G.world;
    let t = null;
    const next = this.objs.find((o) => !o.done);
    const id = next && next.id;
    if (id === 'take') t = { pos: V(this.takeA.x, 2.4, this.takeA.z), label: '소방차 · 송수 호스' };
    else if (id === 'connect') t = { pos: V(W.connPos.x, 2.4, W.connPos.z), label: '스프링클러 송수구 (파랑 표지)' };
    else if (id === 'pump') t = { pos: V(this.pumpPanel.x, 2.6, this.pumpPanel.z), label: '소방차 펌프 · 가압' };
    else if (id === 'hydrant') t = this.stateB === 'none' ? { pos: V(this.takeB.x, 2.4, this.takeB.z), label: '급수 호스 꺼내기' } : { pos: V(W.hydrantE.x, 1.8, W.hydrantE.z), label: '소화전 연결' };
    else if (id === 'vent') {
      if (!this.inGarage) t = { pos: V(W.garageDoor.x, 2.4, W.garageDoor.z), label: P.mask ? '지하주차장 진입' : '면체 착용 후 진입' };
      else if (!this.smokeOn) t = { pos: V(I.smokePanel.pos.x, 2.4, I.smokePanel.pos.z), label: '제연설비' };
      else t = { pos: V(I.exhaustPanel.pos.x, 2.6, I.exhaustPanel.pos.z), label: '배연설비' };
    } else if (id === 'fires') {
      if (!this.inGarage) t = { pos: V(W.garageDoor.x, 2.4, W.garageDoor.z), label: '지하주차장 진입' };
      else { let bd = 1e9; for (const f of this.fires) if (f.alive || (f.ev && !f.cooled)) { const d = f.pos.distanceTo(P.pos); if (d < bd) { bd = d; t = { pos: V(f.pos.x, f.pos.y + 1.6, f.pos.z), label: f.label || '화점' }; } } }
    } else if (id === 'report') {
      t = this.inGarage ? { pos: V(I.exit.x, 2.4, I.exit.z + 0.6), label: '출구 · 지상으로' } : { pos: V(this.captain.root.position.x, 2.6, this.captain.root.position.z), label: '지휘관 · 보고' };
    }
    this.markerTarget = t;
  }

  teardown() {
    const G = this.G;
    super.teardown();
    this.hoseA && this.hoseA.dispose(); this.hoseB && this.hoseB.dispose();
    G.player.setMask(false); G.player.tic = false; G.player.tether = null;
    G.engine.setDensity(G.engine.zone.density);
  }
}
