// 임무 11 — 고층(3~10층) 화재 중 탈출구 차단 → 완강기로 탈출
// 순서: 출입구 확인 → 보관함 열기 → 지지대 고정 → 로프 투하 → 벨트 착용 → 하강(속도조절기 자동) → 지상 보고
import * as THREE from 'three';
import { LAYOUT } from '../world/world.js';
import { Human } from '../character/human.js';
import { QUIZ } from '../data/quizzes.js';
import { makeRope } from '../core/climb.js';
import { Climb } from '../core/climb.js';
import { std } from '../world/props.js';
import { labelTexture } from '../world/textures.js';
import { FieldMission } from './m6-special.js';
import { rand } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FULL = { pants: true, boots: true, coat: true, hood: true, scba: false, helmet: true, gloves: true };

const labelTexLike = (t, bg = '#33414f', fg = '#fff') => labelTexture(t, { w: 256, h: 128, bg, fg, font: 'bold 64px sans-serif' });
const bx = (parent, w, h, d, x, y, z, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};

export class EscapeMission extends FieldMission {
  constructor(G, def) { super(G, def); this.stage = 0; }
  quizPool() { return QUIZ.m11; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, D = LAYOUT.siteD;
    this.baseSetup(FULL);
    P.setMask(false);
    const scene = G.engine.scene;
    const floorNo = 3 + Math.floor(Math.random() * 8); // 3~10층
    this.floorNo = floorNo;
    const FH = D.floorH, floorY = (floorNo - 1) * FH;
    const front = D.z + D.d / 2;
    const rx = D.x + 2.6; // 하강 지점(난간 틈) x
    this.floorY = floorY; this.front = front; this.rx = rx;
    const bx0 = D.x - 5, bx1 = D.x + 5, depth = 1.45;

    // ── 피난 발코니(복도 끝 비상 발코니): 발판 + 난간
    G.platforms.push({ x0: bx0, x1: bx1, z0: front, z1: front + depth, y: floorY });
    const slab = std('#8d9096', 0.9);
    bx(scene, bx1 - bx0 + 0.3, 0.3, depth + 0.1, D.x, floorY - 0.15, front + depth / 2, slab); this.addProp(scene.children[scene.children.length - 1]);
    const zf = front + depth - 0.1;
    this.rail(bx0, zf, rx - 1.0, zf, floorY); this.rail(rx + 1.0, zf, bx1, zf, floorY);
    this.rail(bx0, front + 0.1, bx0, zf, floorY); this.rail(bx1, front + 0.1, bx1, zf, floorY);
    this.railSolids.push(W.solid(rx, floorY + 0.75, zf + 0.05, 2.0, 1.5, 0.3, 'rail', { water: false, view: false }));
    // 층 표시
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshStandardMaterial({ map: labelTexLike(`${floorNo}F`), roughness: 0.6 }));
    sign.position.set(D.x + 3.8, floorY + 2.2, front + 0.06); scene.add(sign); this.addProp(sign);

    // ── 출입구(철문) + 화염: 탈출 불가
    this.doorX = D.x - 3.4;
    const door = new THREE.Group(); scene.add(door); this.addProp(door);
    bx(door, 1.7, 2.5, 0.16, this.doorX, floorY + 1.25, front + 0.08, std('#6b4a3a', 0.6, 0.3));
    bx(door, 0.12, 0.12, 0.2, this.doorX + 0.55, floorY + 1.1, front + 0.2, std('#c9ccd0', 0.3, 0.9));
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.36), new THREE.MeshStandardMaterial({ map: labelTexLike('비상구', '#0f7d3d'), emissive: '#0f7d3d', emissiveIntensity: 0.5 }));
    exitSign.position.set(this.doorX, floorY + 2.75, front + 0.06); scene.add(exitSign); this.addProp(exitSign);
    this.doorPos = V(this.doorX, floorY, front + 1.1);
    const f1 = G.fx.addFire(V(this.doorX, floorY + 0.2, front + 0.7), { size: 1.35, hp: 99999, type: 'A', heat: 1.7, label: '출입구 화염' });
    f1.noTarget = true;
    const f2 = G.fx.addFire(V(this.doorX - 1.6, floorY + 0.2, front + 0.6), { size: 1.0, hp: 99999, type: 'A', heat: 1.3, label: '화염' });
    f2.noTarget = true;
    G.fx.addSmokeSource(V(this.doorX, floorY + 2.4, front + 0.9), 6, 2.4);

    // ── 하강 경로 아래층 창문 화염(5층 이상): A/D 로 피해야 함
    this.dodgeFire = null;
    if (floorNo >= 5) {
      const wy = (floorNo - 2) * FH + FH * 0.5;
      this.dodgeFire = G.fx.addFire(V(rx, wy, front + 0.7), { size: 1.1, hp: 99999, type: 'A', heat: 2.6, label: '아래층 화염' });
      this.dodgeFire.noTarget = true;
      G.fx.addSmokeSource(V(rx, wy + 1.4, front + 0.6), 5, 2.0);
    }

    // ── 완강기 보관함(벽) · 지지대(바닥 고정 브래킷)
    this.boxPos = V(D.x - 0.4, floorY, front + 1.0);
    const cab = new THREE.Group(); scene.add(cab); this.addProp(cab);
    bx(cab, 0.9, 1.0, 0.28, this.boxPos.x, floorY + 1.15, front + 0.16, std('#c8281f', 0.5, 0.2));
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshStandardMaterial({ map: labelTexLike('완강기', '#c8281f', '#fff'), roughness: 0.5 }));
    cl.position.set(this.boxPos.x, floorY + 1.28, front + 0.31); cab.add(cl);
    this.cabDoor = bx(cab, 0.84, 0.94, 0.04, this.boxPos.x, floorY + 1.15, front + 0.31, std('#d03a2e', 0.5, 0.2));
    this.cabDoor.visible = true; cl.visible = true;
    this.cab = cab;
    this.brackPos = V(rx - 0.4, floorY, front + 0.8);
    const br = new THREE.Group(); scene.add(br); this.addProp(br);
    bx(br, 0.5, 0.08, 0.4, this.brackPos.x, floorY + 0.04, this.brackPos.z, std('#aab0b6', 0.35, 0.8));
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 16), std('#e0442a', 0.5, 0.2));
    eye.position.set(this.brackPos.x, floorY + 0.28, this.brackPos.z); br.add(eye);
    bx(br, 0.05, 0.22, 0.05, this.brackPos.x, floorY + 0.16, this.brackPos.z, std('#aab0b6', 0.35, 0.8));
    // 완강기 본체(고정 후 표시) + 로프
    this.reel = new THREE.Group(); this.reel.visible = false;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 18), std('#c8281f', 0.45, 0.4)); body.rotation.z = Math.PI / 2; body.position.y = 0.44;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 14), std('#cfd6dd', 0.3, 0.8)); hook.position.y = 0.3;
    this.reel.add(body, hook); this.reel.position.set(this.brackPos.x, floorY, this.brackPos.z);
    scene.add(this.reel); this.addProp(this.reel);
    const ropePath = [V(this.brackPos.x, floorY + 0.4, this.brackPos.z), V(rx, floorY + 1.15, zf - 0.05)];
    this.ropeTopPt = V(rx, floorY + 1.15, front + depth - 0.1);
    this.ropeA = makeRope(ropePath[0], this.ropeTopPt);
    this.ropeB = makeRope(V(rx, 0.1, front + depth + 0.3), V(rx, floorY + 1.15, front + depth + 0.25));
    this.ropeA.visible = this.ropeB.visible = false;
    scene.add(this.ropeA, this.ropeB); this.addProp(this.ropeA); this.addProp(this.ropeB);
    this.dr1 = makeRope(V(0, 0, 0), V(0, 1, 0)); this.dr2 = makeRope(V(0, 0, 0), V(0, 1, 0));
    this.dr1.visible = this.dr2.visible = false;
    scene.add(this.dr1, this.dr2); this.addProp(this.dr1); this.addProp(this.dr2);

    // 지상 지휘관 + 착지 안내 원
    const tr = W.truck.position;
    this.landPt = V(rx, 0, front + 2.4);
    const cap = new Human({ skin: '#b98763', scale: 1.03 });
    cap.setGear({ pants: true, boots: true, coat: true, hood: true, helmet: true, gloves: true });
    cap.root.position.set(rx - 3.4, 0, front + 5.0); cap.root.rotation.y = Math.PI * 0.75;
    this.addHuman(cap, true); this.captain = cap;
    this.landRing = this.ring(rx, front + 2.4, 1.2, '#ffd24a');

    // 플레이어 배치(발코니)
    P.teleport(V(D.x + 0.6, floorY, front + 0.95), Math.PI);
    G.camRig.yaw = Math.PI; G.camRig.update(0, P, null, { free: false });

    // ── 상호작용(순서 검사)
    const wrong = (need, text) => { this.mistake(text, 40); G.ui.toast(`순서 확인: 지금은 「${need}」 단계입니다`, 'warn'); };
    const STEPS = ['출입구 확인', '완강기 보관함 열기', '지지대 고정', '로프 투하', '안전벨트 착용', '하강'];
    this.addInteract({
      pos: this.doorPos, radius: 2.6, label: '출입구(비상구) 상태 확인', hold: 0,
      enabled: () => this.stage === 0,
      onUse: () => {
        G.ui.toast('문손잡이가 뜨겁고 문틈으로 화염이 번집니다 — 출입구는 사용할 수 없습니다. 피난기구(완강기)로 탈출!', 'warn');
        P.hurt(4, 'heat'); G.sfx.hurt && G.sfx.hurt();
        this.stage = 1; this.complete('door');
      },
    });
    this.addInteract({
      pos: this.boxPos, radius: 2.4, label: '완강기 보관함 열기', hold: 1.0,
      enabled: () => this.stage <= 1,
      onUse: () => {
        if (this.stage < 1) return wrong(STEPS[0], '출입구 상태를 확인하지 않고 피난기구부터 꺼냈습니다');
        this.stage = 2; this.cabDoor.visible = false; cl.visible = false; G.sfx.ok();
        G.ui.toast('완강기·로프·안전벨트를 꺼냈습니다', 'good'); this.complete('box');
      },
    });
    this.addInteract({
      pos: this.brackPos, radius: 2.0, label: '완강기 후크를 지지대(고정 브래킷)에 걸어 고정', hold: 1.6,
      enabled: () => this.stage >= 1 && this.stage <= 2,
      onUse: () => {
        if (this.stage < 2) return wrong(STEPS[1], '장비를 꺼내기 전에 고정을 시도했습니다');
        this.stage = 3; this.reel.visible = true; P.human.play('check', 1.2); G.sfx.ok();
        G.ui.toast('후크를 지지대에 걸고 고정 상태를 확인했습니다', 'good'); this.complete('hook');
      },
    });
    this.addInteract({
      pos: V(rx, floorY, front + 0.7), radius: 2.0, label: '로프 릴을 창밖(난간 밖)으로 던져 내리기', hold: 0.8,
      enabled: () => this.stage >= 1 && this.stage <= 3,
      onUse: () => {
        if (this.stage < 3) return wrong(STEPS[this.stage], '고정하지 않은 채 로프를 던졌습니다 — 먼저 지지대에 고정해야 합니다');
        this.stage = 4; this.ropeA.visible = this.ropeB.visible = true; P.human.play('reach', 0.9); G.sfx.ok();
        G.ui.toast('로프가 지상까지 내려갔습니다 — 아래에 사람이 없는지 확인했습니다', 'good'); this.complete('rope');
      },
    });
    this.addInteract({
      pos: this.brackPos, radius: 2.8, label: '안전벨트를 가슴(겨드랑이 아래)에 걸어 단단히 조이기', hold: 2.0,
      enabled: () => this.stage >= 1 && this.stage <= 4,
      onUse: () => {
        if (this.stage < 4) return wrong(STEPS[this.stage], '로프를 내리기 전에 벨트를 착용했습니다 — 순서를 지키세요');
        this.stage = 5; P.human.setRig(true); P.human.play('check', 1.4); G.sfx.ok();
        G.ui.toast('벨트를 가슴에 걸고 조임쇠로 단단히 조였습니다. 로프에 연결 완료', 'good'); this.complete('belt');
      },
    });
    this.addInteract({
      pos: V(rx, floorY, front + 0.9), radius: 1.9, label: '난간 틈으로 나가 하강 시작 (벽을 보며)', hold: 0,
      enabled: () => this.stage >= 1 && this.stage <= 5 && !P.control,
      onUse: () => {
        if (this.stage < 5) return wrong(STEPS[this.stage], '벨트를 착용하지 않고 창밖으로 나가려 했습니다 — 추락 위험');
        this.stage = 6; this.startDescent();
      },
    });
    this.addInteract({
      pos: this.captain.root.position, radius: 2.8, label: '벨트를 풀고 지휘관에게 탈출 보고', hold: 1.2,
      enabled: () => this.stage === 7,
      onUse: () => {
        P.human.setRig(false); this.stage = 8; this.complete('report'); G.ui.banner('탈출 완료');
        setTimeout(() => this.finish(true), 1500);
      },
    });

    this.addObj('door', `${floorNo}층 — 출입구(비상구) 상태를 확인한다`)
      .addObj('box', '완강기 보관함을 열어 장비를 꺼낸다')
      .addObj('hook', '완강기 후크를 지지대(고정 브래킷)에 건다')
      .addObj('rope', '로프 릴을 난간 밖으로 던져 지상까지 내린다')
      .addObj('belt', '안전벨트를 가슴에 걸어 단단히 조인다')
      .addObj('down', '난간 틈으로 나가 하강한다 (화염이 있으면 A/D 로 피함)')
      .addObj('report', '지상에서 벨트를 풀고 지휘관에게 보고한다');
    this.setActive('door');
    G.ui.toast(`현재 위치: ${floorNo}층 피난 발코니 — 출입구가 화염으로 막혔습니다`, 'warn');
  }

  startDescent() {
    const G = this.G, P = G.player, rx = this.rx, front = this.front;
    const A = V(rx, 0, front + 1.9), B = V(rx, this.floorY, front + 1.9);
    const c = new Climb(G, {
      A, B, s: 1, speed: 1.3, auto: 1.3, face: Math.PI, lat: 2.6, type: 'rappel', camYaw: 0.9, camDist: 6.0,
      label: '⬇ 완강기가 자동으로 내려줍니다 — 아래층 화염이 있으면 A/D 로 옆으로 피하세요',
      onTick: (cl) => this.updateRope(cl),
      onBottom: () => {
        P.pos.set(rx + c.dx, 0, front + 2.4); P.heading = 0; P.root.rotation.y = 0; G.camRig.yaw = 0;
        this.dr1.visible = this.dr2.visible = false; this.ropeA.visible = this.ropeB.visible = false;
        this.stage = 7; this.complete('down');
        G.ui.toast('지상에 안전하게 도착했습니다 — 지휘관에게 보고하세요', 'info');
      },
    });
    this.climb = c; c.start();
    this.ropeA.visible = this.ropeB.visible = false;
  }

  updateRope(cl) {
    const P = this.G.player, dev = P.human.rigDev.getWorldPosition(V(0, 0, 0));
    this.dr1.visible = this.dr2.visible = true;
    const set = (m, a, b) => {
      const d = b.clone().sub(a), len = Math.max(0.01, d.length());
      if (!m.userData.len) m.userData.len = m.geometry.parameters.height;
      m.scale.set(1, len / m.userData.len, 1);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    };
    set(this.dr1, V(this.ropeTopPt.x, this.ropeTopPt.y, this.ropeTopPt.z), dev);
    set(this.dr2, dev, V(dev.x, Math.max(0.1, dev.y - 2.6), dev.z + 0.05));
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.tickHumans(dt);
    this.captain.update(dt, { speed: 0 });
    // 하강 중 아래층 화염을 그대로 통과하면 감점
    if (P.control && P.control === this.climb && this.dodgeFire) {
      if (this.dodgeFire.pos.distanceTo(P.pos) < 1.8) this.mistake('하강 경로의 화염 구간을 그대로 통과했습니다 — A/D 로 옆으로 피해야 합니다', 100);
    }
    // 안내 마커
    const F = this.floorY, fr = this.front;
    let t = null;
    switch (this.stage) {
      case 0: t = { pos: V(this.doorX, F + 2.6, fr + 0.8), label: '출입구(비상구) 확인' }; break;
      case 1: t = { pos: V(this.boxPos.x, F + 2.0, this.boxPos.z), label: '완강기 보관함' }; break;
      case 2: t = { pos: V(this.brackPos.x, F + 1.2, this.brackPos.z), label: '지지대 · 후크 고정' }; break;
      case 3: t = { pos: V(this.rx, F + 1.8, fr + 0.8), label: '로프 투하 (난간 틈)' }; break;
      case 4: t = { pos: V(this.brackPos.x, F + 1.2, this.brackPos.z), label: '안전벨트 착용' }; break;
      case 5: t = { pos: V(this.rx, F + 1.8, fr + 0.9), label: '하강 시작' }; break;
      case 7: t = { pos: V(this.captain.root.position.x, 2.6, this.captain.root.position.z), label: '지휘관 · 탈출 보고' }; break;
      default: t = null;
    }
    this.markerTarget = t;
  }
}
