// 임무 1 — 출동 준비: 보호장비를 올바른 순서로 착용하고 대원 상호 점검
import * as THREE from 'three';
import { Mission } from './mission.js';
import { LAYOUT } from '../world/world.js';
import { Human } from '../character/human.js';
import { add, rbox, std, PROPS_MAT as PM } from '../world/props.js';
import { QUIZ } from '../data/quizzes.js';

const STEPS = [
  { id: 'pants', label: '방화바지 · 안전화 착용', set: { pants: true, boots: true }, tip: '하체부터 착용합니다.' },
  { id: 'coat', label: '방화복 상의 착용', set: { coat: true }, tip: '상의는 방화바지 위로 겹쳐 입습니다.' },
  { id: 'hood', label: '방화두건 착용', set: { hood: true }, tip: '머리·목 노출 부위를 덮습니다.' },
  { id: 'scba', label: '공기호흡기(SCBA) 착용', set: { scba: true }, tip: '용기 압력을 확인하고 어깨끈을 조입니다.' },
  { id: 'helmet', label: '헬멧 착용', set: { helmet: true }, tip: '턱끈까지 체결합니다.' },
  { id: 'gloves', label: '방화장갑 착용', set: { gloves: true }, tip: '마지막으로 장갑을 착용합니다.' },
];

function gearProp(kind) {
  const g = new THREE.Group();
  const coat = std('#27334f', 0.92);
  const stripe = std('#d6f53a', 0.45, 0.1, { emissive: '#4d6200', emissiveIntensity: 0.5 });
  if (kind === 'pants') {
    add(g, rbox(0.56, 0.13, 0.4, 0.05), coat, 0, 0.07, 0);
    add(g, rbox(0.57, 0.03, 0.4, 0.01), stripe, 0.1, 0.14, 0);
    add(g, rbox(0.3, 0.18, 0.12, 0.05), PM.black, -0.38, 0.09, 0.1);
    add(g, rbox(0.3, 0.18, 0.12, 0.05), PM.black, -0.38, 0.09, -0.1);
  } else if (kind === 'coat') {
    add(g, rbox(0.62, 0.16, 0.5, 0.07), coat, 0, 0.09, 0);
    add(g, rbox(0.63, 0.035, 0.5, 0.01), stripe, 0, 0.15, 0);
    add(g, rbox(0.2, 0.12, 0.5, 0.05), coat, 0.35, 0.07, 0.0);
  } else if (kind === 'hood') {
    const m = add(g, new THREE.SphereGeometry(0.15, 16, 12), std('#12151b', 0.95), 0, 0.12, 0);
    m.scale.set(1, 0.85, 1);
  } else if (kind === 'scba') {
    add(g, new THREE.CapsuleGeometry(0.1, 0.45, 6, 14), std('#262b31', 0.32, 0.55), 0, 0.12, 0, { rz: Math.PI / 2 });
    add(g, rbox(0.62, 0.05, 0.3, 0.02), PM.black, 0, 0.03, 0);
    add(g, new THREE.CylinderGeometry(0.103, 0.103, 0.05, 14), std('#e0a21a', 0.5), -0.15, 0.12, 0, { rz: Math.PI / 2 });
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), PM.silver, 0.34, 0.12, 0, { rz: Math.PI / 2 });
  } else if (kind === 'helmet') {
    add(g, new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#f3f3ef', 0.28, 0.05), 0, 0.04, 0);
    add(g, new THREE.CylinderGeometry(0.17, 0.25, 0.04, 20, 1, true, Math.PI - 1.6, 3.2), std('#f3f3ef', 0.28, 0.05), 0, 0.03, -0.01);
    add(g, rbox(0.06, 0.06, 0.04, 0.01), std('#c8281f', 0.4), 0, 0.14, 0.15);
  } else if (kind === 'gloves') {
    add(g, rbox(0.15, 0.06, 0.28, 0.03), std('#5b4631', 0.8), -0.12, 0.04, 0);
    add(g, rbox(0.15, 0.06, 0.28, 0.03), std('#5b4631', 0.8), 0.12, 0.04, 0.03);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export class GearMission extends Mission {
  constructor(G, def) { super(G, def); this.stepIdx = 0; this.items = []; this.buddy = null; this.buddyDone = false; }

  quizPool() { return QUIZ.m1; }

  async setup() {
    const G = this.G, P = G.player, T = G.world.hubTable;
    P.setGear({}); P.setMask(false); P.equip(null);
    P.allowed = { hose: false, ext: false, tic: false };
    P.resetStats(G.progress);
    STEPS.forEach((s, i) => this.addObj(s.id, `${i + 1}. ${s.label}`));
    this.addObj('buddy', '7. 동료 대원과 상호 점검(버디 체크)');
    // 장비 테이블 위 소품 (순서를 섞어서 배치)
    const order = [3, 0, 5, 2, 4, 1]; // STEPS 인덱스를 섞은 배치
    order.forEach((si, slot) => {
      const s = STEPS[si];
      const prop = gearProp(s.id);
      prop.position.set(T.x - 5 + slot * 2, T.y, T.z + 0.05);
      G.engine.scene.add(prop);
      this.addProp(prop);
      const it = this.addInteract({
        pos: new THREE.Vector3(T.x - 5 + slot * 2, 0, T.z + 1.5), radius: 1.7, label: `${s.label.replace(' 착용', '')} 집기`, step: si,
        onUse: () => this.take(si, prop),
      });
      this.items.push({ it, prop, step: si });
    });
    // 상호 점검 동료
    const b = new Human({ skin: '#b98763', hair: '#1a1410', scale: 1.03 });
    b.setGear({ pants: true, boots: true, coat: true, hood: true, scba: true, helmet: true, gloves: true });
    b.root.position.set(T.x - 1, 0, T.z + 3.4);
    b.root.rotation.y = Math.PI;
    this.addHuman(b, true);
    this.buddy = b;
    this.addInteract({
      pos: b.root.position.clone(), radius: 2.4, label: '동료와 상호 점검 (버디 체크)',
      enabled: () => this.stepIdx >= STEPS.length && !this.buddyDone,
      onUse: () => this.buddyCheck(),
    });
    this.setActive(STEPS[0].id);
  }

  take(si, prop) {
    const G = this.G, P = G.player, want = STEPS[this.stepIdx];
    if (!want) return;
    if (si !== this.stepIdx) {
      G.ui.toast(`순서가 다릅니다 — 지금은 [${want.label.replace(' 착용', '')}] 차례입니다`, 'warn');
      this.mistake(`착용 순서 오류: ${STEPS[si].label.replace(' 착용', '')}을(를) 너무 일찍 집었습니다`, 40);
      return;
    }
    const gear = { ...P.gearOn, ...want.set };
    P.setGear(gear);
    P.human.play('pickup', 0.9);
    prop.visible = false;
    const m = this.items.find((x) => x.step === si);
    m.it.enabled = () => false;
    G.ui.toast(`${want.label} 완료 · ${want.tip}`, 'good');
    G.sfx.ok();
    this.complete(want.id);
    this.stepIdx++;
    if (this.stepIdx >= STEPS.length) { this.setActive('buddy'); G.ui.banner('동료와 서로 점검하세요'); }
  }

  buddyCheck() {
    const G = this.G;
    G.player.human.play('check', 1.2);
    this.buddy.play('check', 1.2);
    G.ui.toast('상호 점검 완료 — 장비 이상 없음', 'good');
    this.buddyDone = true;
    this.complete('buddy');
    G.progress.gearDone = true;
    G.ui.banner('출동 준비 완료!');
    setTimeout(() => this.finish(true), 1600);
  }

  update() {
    const G = this.G;
    // 안내 마커: 다음에 집어야 할 장비
    if (this.stepIdx < STEPS.length) {
      const m = this.items.find((x) => x.step === this.stepIdx);
      if (m) this.markerTarget = { pos: new THREE.Vector3(m.prop.position.x, 1.6, m.prop.position.z), label: STEPS[this.stepIdx].label.replace(' 착용', '') };
    } else if (!this.buddyDone) {
      this.markerTarget = { pos: new THREE.Vector3(this.buddy.root.position.x, 2.4, this.buddy.root.position.z), label: '동료 대원' };
    } else this.markerTarget = null;
    this.buddy.update(1 / 60, { speed: 0 });
  }
}
