// 사람 형태 캐릭터 (소방관 / 시민 공용)
// - 인체 비례(약 1.78m)의 관절 구조: 엉덩이-무릎-발목, 어깨-팔꿈치-손목, 목-머리
// - 방화복·방화두건·헬멧·공기호흡기·장갑·안전화가 개별 장비로 착용/해제됨 (setGear)
// - 걷기/달리기/자세 낮추기/방수 자세/구조(어깨 메기)/누운 자세 애니메이션
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, clamp, damp, lerp } from '../core/util.js';

// ───────── 장비 색상 (필요하면 여기서 바꾸세요) ─────────
export const GEAR_COLORS = {
  coat: '#27334f', // 방화복
  reflective: '#d6f53a', // 형광 반사띠
  silver: '#cfd6dd',
  helmet: '#f3f3ef', // 헬멧
  helmetTrim: '#c8281f',
  boots: '#16181b',
  gloves: '#5b4631',
  hood: '#12151b',
  tank: '#262b31',
  tankBand: '#e0a21a',
  brass: '#b8923a',
};

const std = (color, roughness = 0.8, metalness = 0, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const MAT = {
  coat: std(GEAR_COLORS.coat, 0.92),
  coatDark: std('#141a29', 0.95),
  reflective: std(GEAR_COLORS.reflective, 0.45, 0.1, { emissive: '#4d6200', emissiveIntensity: 0.55 }),
  silver: std(GEAR_COLORS.silver, 0.35, 0.6),
  helmet: std(GEAR_COLORS.helmet, 0.28, 0.05),
  helmetDark: std('#23262b', 0.5, 0.2),
  trim: std(GEAR_COLORS.helmetTrim, 0.45),
  boot: std(GEAR_COLORS.boots, 0.55, 0.05),
  glove: std(GEAR_COLORS.gloves, 0.8),
  hood: std(GEAR_COLORS.hood, 0.95),
  tank: std(GEAR_COLORS.tank, 0.32, 0.55),
  tankBand: std(GEAR_COLORS.tankBand, 0.5, 0.2),
  brass: std(GEAR_COLORS.brass, 0.35, 0.8),
  black: std('#0e1013', 0.6, 0.1),
  rubber: std('#1a1c1f', 0.8),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#cfe6ee', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
  }),
  red: std('#c3261d', 0.45, 0.2),
  white: std('#ececec', 0.6),
  eye: std('#f6f3ee', 0.35),
  iris: std('#201712', 0.3),
  mouth: std('#7a3b34', 0.6),
};

let emblemTex;
function emblem() {
  if (emblemTex) return emblemTex;
  emblemTex = canvasTexture(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#c8281f';
    g.beginPath();
    g.moveTo(14, 10); g.lineTo(w - 14, 10); g.lineTo(w - 14, h * 0.62);
    g.quadraticCurveTo(w / 2, h + 8, 14, h * 0.62); g.closePath(); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#f2f2f2'; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('119', w / 2, h * 0.42);
  });
  return emblemTex;
}

// ───────── 작은 헬퍼 ─────────
function add(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const grp = (parent, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};
const cap = (r, len, seg = 14) => new THREE.CapsuleGeometry(r, Math.max(0.002, len - 2 * r), 6, seg);
const rbox = (w, h, d, r = 0.02, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
const sphere = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const ring = (r, h, seg = 28, open = false) => new THREE.CylinderGeometry(r, r, h, seg, 1, open);

function shell(r, sc, phiStart, phiLen, thetaStart, thetaLen) {
  const g = new THREE.SphereGeometry(r, 32, 20, phiStart, phiLen, thetaStart, thetaLen);
  g.scale(sc[0], sc[1], sc[2]);
  return g;
}

export class Human {
  constructor(o = {}) {
    this.o = Object.assign(
      { skin: '#c99472', hair: '#1b1511', shirt: '#2b3b58', pants: '#262d3c', shoes: '#27272b', scale: 1, longHair: false },
      o,
    );
    this.skinMat = std(this.o.skin, 0.6);
    this.hairMat = std(this.o.hair, 0.7);
    this.shirtMat = std(this.o.shirt, 0.9);
    this.pantsMat = std(this.o.pants, 0.9);
    this.shoeMat = std(this.o.shoes, 0.6);

    this.root = new THREE.Group();
    this.root.scale.setScalar(this.o.scale);
    this.body = grp(this.root);
    this.hips = grp(this.body, 0, 0.96, 0);
    this.spine = grp(this.hips);

    this.baseG = { shirt: [], pants: [], shoes: [], hair: [], hands: [] };
    this.gearG = { pants: [], coat: [], boots: [], hood: [], helmet: [], gloves: [], scba: [], mask: [] };
    this.gear = {};

    // 애니메이션 상태
    this.phase = Math.random() * 6;
    this.t = Math.random() * 10;
    this.sp = 0; this.cr = 0; this.aim = 0; this.carryW = 0; this.lieW = 0; this.aimPitch = 0;
    this.actT = 0; this.actDur = 1; this.actType = 'reach';
    this.look = 0;
    this.tool = null;

    this._legs(); this._torso(); this._arms(); this._head(); this._gear(); this._tools();
    this.setGear({});
  }

  // ───────────────────── 모델링 ─────────────────────
  _legs() {
    this.legs = {};
    for (const [name, s] of [['R', -1], ['L', 1]]) {
      const hip = grp(this.hips, s * 0.095, -0.02, 0);
      const knee = grp(hip, 0, -0.45, 0);
      const ankle = grp(knee, 0, -0.42, 0);
      this.legs[name] = { hip, knee, ankle };
      // 평상복 바지 / 운동화
      this.baseG.pants.push(
        add(hip, cap(0.078, 0.47), this.pantsMat, 0, -0.225, 0),
        add(knee, cap(0.062, 0.44), this.pantsMat, 0, -0.21, 0),
      );
      this.baseG.shoes.push(add(ankle, rbox(0.1, 0.07, 0.25, 0.03), this.shoeMat, 0, -0.035, 0.05));
      // 방화바지 + 안전화
      const gp = [
        add(hip, cap(0.1, 0.48), MAT.coat, 0, -0.23, 0),
        add(knee, cap(0.084, 0.45), MAT.coat, 0, -0.215, 0),
        add(knee, sphere(0.092, 16, 12), MAT.coatDark, 0, 0.0, 0.015, { s: [1, 0.9, 1] }), // 무릎 보강
        add(knee, ring(0.088, 0.045), MAT.reflective, 0, -0.17, 0),
        add(hip, ring(0.106, 0.04), MAT.reflective, 0, -0.27, 0),
      ];
      this.gearG.pants.push(...gp);
      this.gearG.boots.push(
        add(ankle, rbox(0.118, 0.09, 0.29, 0.035), MAT.boot, 0, -0.04, 0.055),
        add(ankle, rbox(0.12, 0.022, 0.3, 0.01), MAT.black, 0, -0.077, 0.055),
        add(knee, cap(0.092, 0.24), MAT.boot, 0, -0.31, 0),
      );
    }
  }

  _torso() {
    const sp = this.spine;
    // 평상복(활동복)
    this.baseG.pants.push(add(sp, sphere(0.15), this.pantsMat, 0, -0.01, 0, { s: [1.18, 0.8, 0.86] }));
    this.baseG.shirt.push(
      add(sp, cap(0.15, 0.34), this.shirtMat, 0, 0.15, 0, { s: [1.18, 1, 0.8] }),
      add(sp, cap(0.17, 0.4), this.shirtMat, 0, 0.37, 0, { s: [1.2, 1, 0.82] }),
      add(sp, cap(0.065, 0.48), this.shirtMat, 0, 0.49, 0, { rz: Math.PI / 2 }),
    );
    // 방화복 상의
    this.gearG.coat.push(
      add(sp, cap(0.19, 0.42), MAT.coat, 0, 0.36, 0, { s: [1.2, 1, 0.84] }),
      add(sp, cap(0.185, 0.36), MAT.coat, 0, 0.12, 0, { s: [1.17, 1, 0.82] }),
      add(sp, new THREE.CylinderGeometry(0.2, 0.226, 0.2, 30), MAT.coat, 0, -0.03, 0, { s: [1.2, 1, 0.84] }),
      add(sp, cap(0.088, 0.5), MAT.coat, 0, 0.485, 0, { rz: Math.PI / 2 }),
      add(sp, new THREE.TorusGeometry(0.088, 0.036, 10, 28), MAT.coatDark, 0, 0.548, 0, { rx: Math.PI / 2, s: [1.2, 0.95, 1] }),
      add(sp, new THREE.CylinderGeometry(0.208, 0.208, 0.04, 32), MAT.reflective, 0, 0.1, 0, { s: [1.2, 1, 0.845] }),
      add(sp, new THREE.CylinderGeometry(0.212, 0.212, 0.012, 32), MAT.silver, 0, 0.1, 0, { s: [1.2, 1, 0.848] }),
      add(sp, new THREE.CylinderGeometry(0.205, 0.205, 0.04, 32), MAT.reflective, 0, 0.29, 0, { s: [1.2, 1, 0.845] }),
      add(sp, new THREE.CylinderGeometry(0.2, 0.226, 0.034, 30), MAT.reflective, 0, -0.1, 0, { s: [1.2, 1, 0.845] }),
      add(sp, rbox(0.035, 0.5, 0.02, 0.008), MAT.coatDark, 0, 0.27, 0.168),
      add(sp, rbox(0.1, 0.085, 0.03, 0.01), MAT.coatDark, 0.12, 0.1, 0.16),
      add(sp, rbox(0.1, 0.085, 0.03, 0.01), MAT.coatDark, -0.12, 0.1, 0.16),
      add(sp, rbox(0.075, 0.06, 0.016, 0.006), MAT.trim, -0.115, 0.4, 0.162), // 가슴 계급/명찰
    );
  }

  _arms() {
    this.arms = {};
    for (const [name, s] of [['R', -1], ['L', 1]]) {
      const sh = grp(this.spine, s * 0.235, 0.475, 0);
      const el = grp(sh, 0, -0.29, 0);
      const wr = grp(el, 0, -0.26, 0);
      const hand = grp(wr, 0, -0.09, 0);
      this.arms[name] = { sh, el, wr, hand };
      // 평상복 소매
      this.baseG.shirt.push(
        add(sh, cap(0.05, 0.31), this.shirtMat, 0, -0.145, 0),
        add(el, cap(0.042, 0.27), this.shirtMat, 0, -0.13, 0),
      );
      this.baseG.hands.push(
        add(wr, sphere(0.043), this.skinMat, 0, -0.065, 0.005, { s: [0.85, 1.35, 0.7] }),
        add(wr, cap(0.012, 0.05, 6), this.skinMat, s * -0.036, -0.06, 0.03, { rx: -0.5 }),
      );
      // 방화복 소매 + 장갑
      this.gearG.coat.push(
        add(sh, sphere(0.085, 18, 12), MAT.coat, 0, 0.005, 0, { s: [1.05, 0.95, 1] }),
        add(sh, cap(0.07, 0.31), MAT.coat, 0, -0.145, 0),
        add(sh, ring(0.074, 0.04), MAT.reflective, 0, -0.2, 0),
        add(el, cap(0.06, 0.27), MAT.coat, 0, -0.13, 0),
        add(el, ring(0.064, 0.04), MAT.reflective, 0, -0.14, 0),
        add(el, ring(0.062, 0.05), MAT.coatDark, 0, -0.235, 0),
      );
      this.gearG.gloves.push(
        add(wr, sphere(0.054), MAT.glove, 0, -0.07, 0.006, { s: [0.95, 1.4, 0.78] }),
        add(wr, ring(0.062, 0.07), MAT.glove, 0, -0.005, 0),
        add(wr, cap(0.015, 0.06, 6), MAT.glove, s * -0.04, -0.06, 0.03, { rx: -0.5 }),
      );
    }
  }

  _head() {
    const sp = this.spine;
    this.neck = grp(sp, 0, 0.56, 0);
    this.baseG.shirt.push(add(this.neck, new THREE.CylinderGeometry(0.046, 0.052, 0.13, 16), this.skinMat, 0, 0.04, 0));
    this.head = grp(this.neck, 0, 0.14, 0);
    const hd = this.head;
    // 얼굴
    add(hd, sphere(0.102, 28, 20), this.skinMat, 0, 0, 0, { s: [0.9, 1.13, 0.98] });
    for (const sx of [-1, 1]) {
      add(hd, sphere(0.0145, 12, 10), MAT.eye, sx * 0.035, 0.016, 0.088, { s: [1, 0.8, 0.5] });
      add(hd, sphere(0.0085, 10, 8), MAT.iris, sx * 0.035, 0.016, 0.0945, { s: [1, 1, 0.5] });
      add(hd, rbox(0.04, 0.008, 0.01, 0.003, 2), this.hairMat, sx * 0.036, 0.044, 0.088, { rz: sx * -0.12 });
      add(hd, sphere(0.02, 10, 8), this.skinMat, sx * 0.092, 0.0, 0.0, { s: [0.5, 1, 0.8] });
    }
    add(hd, sphere(0.017, 12, 10), this.skinMat, 0, -0.012, 0.098, { s: [0.9, 1.25, 1.1] });
    add(hd, rbox(0.04, 0.006, 0.008, 0.002, 2), MAT.mouth, 0, -0.055, 0.0865);
    // 머리카락
    this.baseG.hair.push(
      add(hd, new THREE.Mesh(shell(0.107, [0.93, 1.16, 1.0], 0, Math.PI * 2, 0, Math.PI * 0.33)).geometry, this.hairMat, 0, 0, 0),
      add(hd, new THREE.Mesh(shell(0.107, [0.93, 1.16, 1.0], Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0, Math.PI * 0.72)).geometry, this.hairMat, 0, 0, 0),
    );
    if (this.o.longHair) {
      this.baseG.hair.push(add(hd, cap(0.095, 0.26), this.hairMat, 0, -0.1, -0.06, { s: [1, 1, 0.55] }));
    }
    // 방화두건
    const hoodShell = shell(0.113, [0.93, 1.17, 1.04], Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.8);
    const hoodBand = shell(0.113, [0.93, 1.17, 1.04], 0, Math.PI * 2, Math.PI * 0.26, Math.PI * 0.075);
    this.gearG.hood.push(
      add(hd, hoodShell, MAT.hood, 0, 0, 0),
      add(hd, hoodBand, MAT.hood, 0, 0, 0),
      add(hd, new THREE.CylinderGeometry(0.075, 0.098, 0.16, 20, 1, true), MAT.hood, 0, -0.105, -0.005),
    );
    MAT.hood.side = THREE.DoubleSide;
    // 헬멧
    this.gearG.helmet.push(
      add(hd, shell(0.13, [0.99, 0.92, 1.12], 0, Math.PI * 2, 0, Math.PI / 2), MAT.helmet, 0, 0.032, 0),
      add(hd, new THREE.TorusGeometry(0.128, 0.011, 8, 36), MAT.helmetDark, 0, 0.034, 0, { rx: Math.PI / 2, s: [0.99, 1.12, 1] }),
      add(hd, new THREE.CylinderGeometry(0.134, 0.19, 0.1, 28, 1, true, Math.PI - 1.6, 3.2), MAT.helmet, 0, -0.018, -0.012, { s: [1, 1, 1.1] }),
      add(hd, new THREE.CylinderGeometry(0.133, 0.15, 0.034, 20, 1, true, -0.85, 1.7), MAT.helmet, 0, 0.03, 0.012, { s: [1, 1, 1.12] }),
      add(hd, rbox(0.03, 0.026, 0.27, 0.01), MAT.helmetDark, 0, 0.152, -0.005),
      add(hd, rbox(0.1, 0.018, 0.016, 0.006), MAT.reflective, 0, 0.092, 0.138, { rx: -0.3 }),
    );
    const em = new THREE.Mesh(
      new THREE.PlaneGeometry(0.085, 0.085),
      new THREE.MeshStandardMaterial({ map: emblem(), transparent: true, roughness: 0.5 }),
    );
    em.position.set(0, 0.098, 0.1345); em.rotation.x = -0.28; hd.add(em);
    this.gearG.helmet.push(em);
    // 공기호흡기 면체
    const maskRing = add(hd, new THREE.TorusGeometry(0.083, 0.013, 8, 30), MAT.rubber, 0, -0.004, 0.077, { s: [0.97, 1.28, 1] });
    const lens = add(hd, shell(0.107, [0.93, 1.16, 1.03], Math.PI / 2 - 0.85, 1.7, Math.PI * 0.3, Math.PI * 0.55), MAT.glass, 0, 0, 0.002, { shadow: false });
    const reg = add(hd, cap(0.026, 0.07, 8), MAT.black, 0, -0.058, 0.108, { rx: Math.PI / 2 });
    const strap = add(hd, new THREE.TorusGeometry(0.118, 0.007, 6, 28), MAT.rubber, 0, 0.0, -0.005, { rx: Math.PI / 2, s: [0.94, 1.07, 1] });
    this.gearG.mask.push(maskRing, lens, reg, strap);
  }

  _gear() {
    const sp = this.spine;
    // 공기호흡기 (SCBA)
    const pack = grp(sp);
    add(pack, rbox(0.3, 0.46, 0.05, 0.02), MAT.black, 0, 0.3, -0.185);
    add(pack, cap(0.085, 0.6), MAT.tank, 0, 0.3, -0.26);
    add(pack, ring(0.088, 0.035), MAT.tankBand, 0, 0.5, -0.26);
    add(pack, ring(0.088, 0.035), MAT.tankBand, 0, 0.1, -0.26);
    add(pack, ring(0.03, 0.07), MAT.brass, 0, 0.64, -0.26);
    add(pack, sphere(0.03, 12, 10), MAT.silver, 0.04, 0.61, -0.22, { s: [1, 1, 0.5] });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.66, -0.26), new THREE.Vector3(-0.09, 0.69, -0.18), new THREE.Vector3(-0.18, 0.63, -0.04),
      new THREE.Vector3(-0.19, 0.54, 0.09), new THREE.Vector3(-0.15, 0.42, 0.15),
    ]);
    add(pack, new THREE.TubeGeometry(curve, 24, 0.011, 6), MAT.rubber, 0, 0, 0);
    for (const sx of [-1, 1]) {
      add(pack, rbox(0.06, 0.018, 0.4, 0.006), MAT.black, sx * 0.15, 0.575, 0.0, { rx: 0.08 });
      add(pack, rbox(0.055, 0.3, 0.018, 0.006), MAT.black, sx * 0.14, 0.4, 0.125);
    }
    add(pack, new THREE.TorusGeometry(0.2, 0.014, 6, 28), MAT.black, 0, 0.02, 0, { rx: Math.PI / 2, s: [1.18, 0.84, 1] });
    this.gearG.scba.push(pack);
  }

  _tools() {
    this.tools = {};
    const R = this.arms.R.hand, L = this.arms.L.hand;
    // 관창(방수 노즐)
    const hose = grp(R);
    add(hose, ring(0.03, 0.12), MAT.brass, 0, -0.05, 0);
    add(hose, new THREE.CylinderGeometry(0.036, 0.022, 0.3, 14), MAT.red, 0, -0.26, 0);
    add(hose, new THREE.CylinderGeometry(0.022, 0.03, 0.1, 14), MAT.silver, 0, -0.46, 0);
    add(hose, rbox(0.02, 0.1, 0.03, 0.008), MAT.black, 0, -0.1, 0.05);
    const nozzleTip = grp(hose, 0, -0.52, 0);
    this.tools.hose = { g: hose, muzzle: nozzleTip };
    // 소화기 (오른손에 본체, 왼손에 호스 노즐)
    const ext = grp(R);
    add(ext, new THREE.CylinderGeometry(0.075, 0.075, 0.38, 20), MAT.red, 0, -0.27, 0);
    add(ext, sphere(0.075, 18, 8), MAT.red, 0, -0.08, 0, { s: [1, 0.6, 1] });
    add(ext, rbox(0.04, 0.05, 0.12, 0.01), MAT.black, 0, -0.04, 0.0);
    add(ext, ring(0.078, 0.07), MAT.black, 0, -0.34, 0);
    this.extPin = add(ext, new THREE.TorusGeometry(0.018, 0.004, 6, 12), MAT.silver, 0.04, -0.05, 0.03);
    add(ext, new THREE.CylinderGeometry(0.03, 0.025, 0.02, 10), MAT.black, 0, -0.01, 0);
    const horn = grp(L);
    add(horn, new THREE.CylinderGeometry(0.014, 0.034, 0.2, 12), MAT.black, 0, -0.14, 0);
    const hornTip = grp(horn, 0, -0.25, 0);
    this.tools.ext = { g: ext, horn, muzzle: hornTip };
    // 열화상 카메라
    const tic = grp(R);
    add(tic, rbox(0.1, 0.07, 0.16, 0.02), MAT.black, 0, -0.1, 0.02, { rx: 0.0 });
    add(tic, rbox(0.085, 0.001 + 0.05, 0.002, 0.001), std('#6cf8b0', 0.2, 0, { emissive: '#2ee890', emissiveIntensity: 1.2 }), 0, -0.1, 0.1);
    add(tic, rbox(0.04, 0.12, 0.04, 0.01), MAT.rubber, 0, -0.04, 0.0);
    this.tools.tic = { g: tic, muzzle: tic };
    for (const k of Object.keys(this.tools)) this.tools[k].g.visible = false;
    horn.visible = false;
  }

  // ───────────────────── 제어 ─────────────────────
  setGear(g) {
    this.gear = { ...g };
    const show = (arr, v) => arr.forEach((o) => (o.visible = !!v));
    for (const k of Object.keys(this.gearG)) show(this.gearG[k], g[k]);
    show(this.baseG.shirt, !g.coat);
    show(this.baseG.pants, !g.pants);
    show(this.baseG.shoes, !g.boots);
    show(this.baseG.hair, !(g.hood || g.helmet));
    show(this.baseG.hands, !g.gloves);
    if (g.hood && !g.coat) this.baseG.shirt.forEach((o) => (o.visible = true));
  }

  setTool(name) {
    this.tool = name;
    for (const k of Object.keys(this.tools)) this.tools[k].g.visible = k === name;
    this.tools.ext.horn.visible = name === 'ext';
  }

  setPin(inPlace) { this.extPin.visible = inPlace; }

  muzzleWorld(out = new THREE.Vector3()) {
    const t = this.tools[this.tool];
    if (!t) return this.head.getWorldPosition(out);
    return (t.muzzle || t.g).getWorldPosition(out);
  }

  play(type = 'reach', dur = 0.9) { this.actType = type; this.actDur = dur; this.actT = dur; }

  // 요구조자: 누운 자세 / 어깨에 메어진 자세
  setLying(v) { this.lying = v; }

  carriedBy(carrier) {
    this.carrier = carrier;
    carrier.spine.add(this.root);
    this.root.position.set(1.28, 0.585, -0.06);
    this.root.rotation.set(0, 0, Math.PI / 2);
    this.root.scale.setScalar(this.o.scale);
    this.lying = false; this.lieW = 0; this.carried = true;
  }

  dropAt(scene, pos, yaw = 0) {
    if (this.root.parent) this.root.parent.remove(this.root);
    scene.add(this.root);
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.carrier = null; this.carried = false;
    this.lying = true;
  }

  // ───────────────────── 애니메이션 ─────────────────────
  update(dt, st = {}) {
    this.t += dt;
    const k = (cur, tgt, l = 10) => damp(cur, tgt, l, dt);
    this.sp = k(this.sp, st.speed ?? 0, 9);
    this.cr = k(this.cr, st.crouch ? 1 : 0, 9);
    this.aim = k(this.aim, st.aim ? 1 : 0, 12);
    this.carryW = k(this.carryW, st.carry ? 1 : 0, 8);
    this.aimPitch = k(this.aimPitch, st.aimPitch ?? 0, 10);
    this.lieW = k(this.lieW, this.lying ? 1 : 0, 6);

    let act = 0;
    if (this.actT > 0) {
      this.actT -= dt;
      act = Math.sin(Math.PI * clamp(1 - this.actT / this.actDur, 0, 1));
    }

    const moving = clamp(this.sp / 2.4, 0, 1);
    const run = clamp((this.sp - 3.0) / 2.4, 0, 1);
    const walking = this.sp > 0.12 ? 1 : 0;
    const rate = walking ? lerp(5.4, 10.8, clamp((this.sp - 1.2) / 4, 0, 1)) : 0;
    this.phase += dt * rate;
    const ph = this.phase;
    const A = (0.12 + 0.42 * moving + 0.3 * run) * (1 - 0.4 * this.cr) * walking;
    const cr = this.cr;
    const breathe = Math.sin(this.t * 1.9) * 0.012;

    // ── 다리
    for (const [name, off] of [['R', 0], ['L', Math.PI]]) {
      const lg = this.legs[name];
      const p = ph + off;
      const sw = Math.sin(p);
      lg.hip.rotation.x = -sw * A - 1.02 * cr;
      lg.knee.rotation.x = 0.06 + 0.95 * A * Math.max(0, Math.cos(p)) * (walking ? 1 : 0) + 1.72 * cr;
      lg.ankle.rotation.x = 0.16 * sw * A - 0.62 * cr + (walking ? 0.1 * A * Math.max(0, -Math.cos(p)) : 0);
    }
    // ── 몸통
    const bob = walking ? Math.abs(Math.cos(ph)) * 0.05 * (0.4 + 0.6 * moving) : breathe * 0.4;
    this.hips.position.y = 0.96 - 0.31 * cr + bob - 0.02 * this.carryW;
    this.hips.position.z = -0.1 * cr;
    this.spine.rotation.x = 0.04 + 0.16 * run + 0.5 * cr + 0.14 * this.carryW + 0.4 * act * (this.actType === 'reach' ? 1 : 0.3) + breathe;
    this.spine.rotation.y = Math.sin(ph) * 0.12 * A * 1.6 * (1 - this.aim);
    this.spine.rotation.z = Math.sin(ph * 1) * 0.015 * A * 3;
    this.neck.rotation.x = -(this.spine.rotation.x) * 0.55 - 0.05 + this.aimPitch * -0.25 * this.aim;
    this.neck.rotation.y = Math.sin(this.t * 0.37) * 0.22 * (1 - moving) * (1 - this.aim);
    this.head.rotation.x = -(this.spine.rotation.x) * 0.3;

    // ── 팔 (걷기 FK → 방수/구조 자세로 블렌딩)
    const armWalk = (name, off) => {
      const a = this.arms[name];
      const sw = Math.sin(ph + off);
      return {
        sx: sw * A * 0.85 - 0.08 * breathe, sz: (name === 'R' ? -1 : 1) * 0.06,
        ex: -0.2 - 0.9 * run - 0.6 * A * Math.max(0, -sw),
      };
    };
    for (const name of ['R', 'L']) {
      const a = this.arms[name];
      const w = armWalk(name, name === 'R' ? Math.PI : 0);
      const s = name === 'R' ? -1 : 1;
      let sx = w.sx, sz = w.sz, ex = w.ex;
      // 방수/소화/촬영 자세
      const tool = this.tool;
      if (tool === 'hose') {
        const tgt = name === 'R' ? { sx: -1.2 - this.aimPitch * 0.35, sz: 0.1, ex: -0.5 } : { sx: -1.05 - this.aimPitch * 0.3, sz: -0.3, ex: -0.9 };
        sx = lerp(sx, tgt.sx, this.aim); sz = lerp(sz, tgt.sz, this.aim); ex = lerp(ex, tgt.ex, this.aim);
      } else if (tool === 'ext') {
        const tgt = name === 'R' ? { sx: -0.35, sz: 0.1, ex: -0.5 } : { sx: -1.2 - this.aimPitch * 0.35, sz: -0.2, ex: -0.45 };
        sx = lerp(sx, tgt.sx, this.aim); sz = lerp(sz, tgt.sz, this.aim); ex = lerp(ex, tgt.ex, this.aim);
      } else if (tool === 'tic') {
        const tgt = name === 'R' ? { sx: -1.15, sz: 0.08, ex: -0.9 } : { sx: -1.0, sz: -0.25, ex: -1.0 };
        sx = lerp(sx, tgt.sx, 0.85); sz = lerp(sz, tgt.sz, 0.85); ex = lerp(ex, tgt.ex, 0.85);
      }
      // 구조(어깨 메기)
      if (this.carryW > 0.01) {
        const tgt = name === 'R' ? { sx: -0.75, sz: 0.1, ex: -1.25 } : { sx: -0.35, sz: -0.3, ex: -0.95 };
        sx = lerp(sx, tgt.sx, this.carryW); sz = lerp(sz, tgt.sz, this.carryW); ex = lerp(ex, tgt.ex, this.carryW);
      }
      // 상호작용 동작(손 뻗기/줍기)
      if (act > 0) {
        const hold = this.actType === 'check' ? -1.35 : -1.05;
        if (name === 'R' || this.actType === 'pickup') {
          sx = lerp(sx, hold, act); ex = lerp(ex, -0.35, act); sz = lerp(sz, s * 0.05, act);
        }
      }
      // 누운 자세: 팔을 몸 옆에 느슨하게
      sx = lerp(sx, 0.1, this.lieW); sz = lerp(sz, s * 0.18, this.lieW); ex = lerp(ex, -0.25, this.lieW);
      // 어깨에 메어진 상태(요구조자): 팔다리 축 늘어짐
      if (this.carried) { sx = 0.0; sz = -Math.PI / 2 + 0.25; ex = -0.15; }
      a.sh.rotation.set(sx, 0, sz);
      a.el.rotation.set(ex, 0, 0);
      a.wr.rotation.set(0.05, 0, 0);
    }
    if (this.carried) {
      for (const name of ['R', 'L']) {
        const lg = this.legs[name];
        lg.hip.rotation.set(0, 0, -Math.PI / 2 + 0.15);
        lg.knee.rotation.x = 0.35;
      }
      this.neck.rotation.x = -0.35;
      this.head.rotation.set(0.1, 0, 0.25);
    }

    // ── 누운 자세
    this.body.rotation.x = -Math.PI / 2 * this.lieW;
    this.body.position.y = 0.17 * this.lieW;
    if (this.lieW > 0.01) {
      this.legs.R.hip.rotation.z = -0.07 * this.lieW; this.legs.L.hip.rotation.z = 0.1 * this.lieW;
      this.hips.position.y = lerp(this.hips.position.y, 0.96, this.lieW);
      this.spine.rotation.x = lerp(this.spine.rotation.x, 0.0, this.lieW);
      this.head.rotation.z = 0.18 * this.lieW;
    } else if (!this.carried) {
      this.legs.R.hip.rotation.z = 0; this.legs.L.hip.rotation.z = 0;
      this.head.rotation.z = 0;
    }
  }
}
