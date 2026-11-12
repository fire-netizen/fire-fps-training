// 임무 10 — 예방 점검: 자동화재탐지설비 + 소화기 비치·상태(내용연수) 점검
import * as THREE from 'three';
import { Mission } from './mission.js';
import { QUIZ } from '../data/quizzes.js';
import { add, PROPS_MAT as PM, std } from '../world/props.js';
import { labelTexture } from '../world/textures.js';

export class InspectionMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.det = [];
    this.exts = [];
    this.panelDone = false;
    this.reported = false;
  }

  quizPool() { return QUIZ.m10; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, I = W.intC;
    this.I = I;
    G.fx.clearAll();
    W.showZone('shop');
    P.setGear({ pants: true, boots: true, coat: false, hood: false, helmet: true, gloves: true });
    P.setMask(false);
    P.resetStats(G.progress);
    P.allowed = { hose: false, ext: false, tic: false };
    P.equip(null);
    P.teleport(I.spawn, 0);
    if (W.extStand) { W.extStand.visible = false; this.hid = true; }
    const year = new Date().getFullYear();
    const grp = I.group;
    const own = (o) => { grp.add(o); this.addProp(o); return o; };

    // ── 감지기 4개 (천장)
    [[-4, 3], [4, 3], [-4, 8], [4, 8]].forEach(([x, z], i) => {
      const g = new THREE.Group();
      g.position.copy(I.p(x, 3.1, z));
      add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.07, 18), std('#f2f2ee', 0.5), 0, 0, 0);
      const led = add(g, new THREE.SphereGeometry(0.03, 8, 6), std('#2a8a3a', 0.4, 0, { emissive: '#2a8a3a', emissiveIntensity: 1.2 }), 0, -0.05, 0.1);
      own(g);
      const d = { i, ok: i !== 2, tested: false, led, pos: I.p(x, 0, z) }; // 3번째 감지기가 불량
      this.det.push(d);
      this.addInteract({
        pos: d.pos, radius: 2.6, hold: 1.4, label: `감지기 ${i + 1} 작동시험`, enabled: () => !d.tested,
        onUse: () => this.testDet(d),
      });
    });

    // ── 수신기
    const panel = new THREE.Group();
    panel.position.copy(I.p(-7.7, 1.35, 7.6));
    add(panel, new THREE.BoxGeometry(0.2, 0.8, 0.6), std('#7a2a24', 0.45, 0.4), 0, 0, 0);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: labelTexture('수신기 ▣', { w: 256, h: 256, bg: '#7a2a24', fg: '#fff', font: 'bold 44px sans-serif' }) }));
    pl.rotation.y = Math.PI / 2; pl.position.x = 0.105; panel.add(pl);
    own(panel);
    this.addInteract({
      pos: I.p(-6.6, 0, 7.6), radius: 2.4, label: '자동화재탐지설비 수신기 확인', enabled: () => !this.panelDone,
      onUse: () => this.checkPanel(),
    });

    // ── 소화기 4대
    const specs = [
      { pos: [7.4, 9.0], made: year - 3, gauge: 'ok', pin: true, ok: true },
      { pos: [-7.4, 3.2], made: year - 12, gauge: 'ok', pin: true, ok: false, why: `제조 ${year - 12}년 — 내용연수(10년) 초과` },
      { pos: [-7.4, 10.0], made: year - 4, gauge: 'low', pin: true, ok: false, why: '압력계 지침이 적색(저압)' },
      { pos: [7.4, 3.0], made: year - 2, gauge: 'ok', pin: false, ok: false, why: '안전핀·봉인이 없음' },
    ];
    specs.forEach((s, i) => {
      const e = new THREE.Group();
      e.position.copy(I.p(s.pos[0], 0, s.pos[1]));
      add(e, new THREE.CylinderGeometry(0.09, 0.09, 0.45, 18), PM.red, 0, 0.5, 0);
      add(e, new THREE.SphereGeometry(0.09, 14, 8), PM.red, 0, 0.74, 0);
      add(e, new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), PM.black, 0, 0.82, 0);
      add(e, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), std(s.gauge === 'ok' ? '#2a9a4a' : '#d02a22', 0.4), 0.0, 0.7, 0.09, { rx: Math.PI / 2 });
      if (s.pin) add(e, new THREE.TorusGeometry(0.03, 0.006, 6, 12), PM.silver, 0.05, 0.8, 0);
      own(e);
      const x = { i, ...s, judged: false, mesh: e };
      this.exts.push(x);
      this.addInteract({
        pos: I.p(s.pos[0] > 0 ? s.pos[0] - 0.9 : s.pos[0] + 0.9, 0, s.pos[1]), radius: 2.0, label: `소화기 ${i + 1} 점검`, enabled: () => !x.judged,
        onUse: () => this.checkExt(x, year),
      });
    });

    // ── 점검 결과 기록부
    this.addInteract({
      pos: I.exit, radius: 2.6, label: '점검 결과 기록부 제출 (출입구)',
      enabled: () => this.det.every((d) => d.tested) && this.panelDone && this.exts.every((x) => x.judged) && !this.reported,
      onUse: () => this.report(),
    });

    this.addObj('det', '감지기 4개 작동시험', '0/4')
      .addObj('panel', '수신기 상태 확인·조치')
      .addObj('ext', '소화기 4대 점검·판정', '0/4')
      .addObj('report', '점검 결과 기록부 제출');
    this.setActive('det');
    G.ui.toast('E를 길게 눌러 감지기 시험, E로 수신기·소화기를 확인하세요', 'info');
  }

  testDet(d) {
    const G = this.G;
    d.tested = true;
    if (d.ok) {
      d.led.material.color.set('#e02a1a'); d.led.material.emissive.set('#e02a1a');
      G.ui.toast(`감지기 ${d.i + 1}: 작동 확인 (적색 표시등 점등) — 정상`, 'good'); G.sfx.ok();
    } else {
      G.ui.toast(`감지기 ${d.i + 1}: 시험기에 반응 없음 — 불량! 점검표에 기록됩니다`, 'bad'); G.sfx.bad();
      this.badDet = d;
    }
    const n = this.det.filter((x) => x.tested).length;
    this.setCount('det', `${n}/4`);
    if (n === 4) { this.complete('det'); G.ui.banner('감지기 시험 완료'); }
  }

  async checkPanel() {
    const G = this.G;
    G.state = 'modal';
    const v = await G.ui.ask(`<div class="talk"><div class="who">📟 자동화재탐지설비 수신기</div>
      <p>🟢 주전원 정상 &nbsp; 🟢 예비전원 정상 &nbsp; 🟡 <b>경종 정지</b> 표시등 점등</p>
      <p>경종(음향장치) 스위치가 '정지' 위치에 있습니다. 어떻게 조치하시겠습니까?</p></div>`, [
      { label: '이상 없음 — 그대로 둔다', value: 'keep' },
      { label: '스위치를 정상 위치로 복구하고 기록한다', primary: true, value: 'fix' },
      { label: '수신기 전원을 끈다', value: 'off' },
    ]);
    G.ui.close(); G.resume();
    this.panelDone = true;
    if (v === 'fix') { G.ui.toast('경종 스위치를 정상 위치로 복구했습니다 — 정확한 조치', 'good'); G.sfx.ok(); }
    else if (v === 'off') this.mistake('수신기 전원을 끄면 화재 감지·경보가 전부 중단됩니다 — 정지 스위치만 정상으로 복구해야 합니다', 80);
    else this.mistake('경종 정지 상태를 방치했습니다 — 화재 시 경보가 울리지 않으므로 정상 복구 후 기록해야 합니다', 80);
    this.complete('panel');
  }

  async checkExt(x, year) {
    const G = this.G;
    G.state = 'modal';
    const gauge = x.gauge === 'ok' ? '🟢 녹색(정상 범위)' : '🔴 적색(저압)';
    const v = await G.ui.ask(`<div class="talk"><div class="who">🧯 소화기 ${x.i + 1} 점검 (분말 ABC)</div>
      <p>제조연월: <b>${x.made}년</b> (올해 ${year}년)</p>
      <p>지시압력계: <b>${gauge}</b></p>
      <p>안전핀·봉인: <b>${x.pin ? '있음' : '없음(이탈)'}</b> · 호스/노즐: 이상 없음</p></div>`, [
      { label: '✅ 적합', value: 'ok' }, { label: '❌ 부적합', primary: true, value: 'bad' }, { label: '나중에 다시', value: 'later' },
    ]);
    G.ui.close(); G.resume();
    if (v === 'later') return;
    x.judged = true;
    const right = (v === 'ok') === x.ok;
    if (right) { G.ui.toast(x.ok ? `소화기 ${x.i + 1}: 적합 판정` : `소화기 ${x.i + 1}: 부적합 — ${x.why}`, 'good'); G.sfx.ok(); }
    else this.mistake(x.ok ? `소화기 ${x.i + 1}은 이상이 없는데 부적합으로 판정했습니다` : `소화기 ${x.i + 1}의 문제(${x.why})를 놓쳤습니다`, 80);
    const n = this.exts.filter((e) => e.judged).length;
    this.setCount('ext', `${n}/4`);
    if (n === 4) { this.complete('ext'); G.ui.banner('소화기 점검 완료'); }
  }

  async report() {
    const G = this.G;
    this.reported = true;
    G.state = 'modal';
    const bad = this.exts.filter((x) => !x.ok).length;
    await G.ui.ask(`<div class="talk"><div class="who">📝 점검 결과 기록부</div>
      <p>감지기: 4개 중 불량 1개 (교체 필요)</p><p>수신기: 경종 정지 → 정상 복구</p>
      <p>소화기: 4대 중 부적합 ${bad}대 (내용연수 초과 / 저압 / 안전핀 이탈)</p>
      <p>관계인에게 불량 사항 시정을 통보했습니다.</p></div>`, [{ label: '제출', primary: true, value: true }]);
    G.ui.close(); G.resume();
    this.complete('report');
    G.ui.banner('점검 완료');
    setTimeout(() => this.finish(true), 900);
  }

  teardown() { if (this.hid && this.G.world.extStand) this.G.world.extStand.visible = true; }
}
