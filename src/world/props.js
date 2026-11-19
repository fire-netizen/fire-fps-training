// 소품: 소방차 · 나무 · 가로등 · 승용차 · 소화전 · 가림막 등
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { labelTexture } from './textures.js';
import { rand } from '../core/util.js';

const std = (color, rough = 0.7, metal = 0, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 3, r);

function add(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const M = {
  red: std('#b4231b', 0.32, 0.35),
  redDark: std('#8a1913', 0.4, 0.3),
  silver: std('#c7ccd2', 0.3, 0.8),
  grey: std('#4a4f55', 0.6, 0.3),
  black: std('#0f1113', 0.7, 0.1),
  glass: std('#1c2a34', 0.08, 0.6),
  white: std('#ececec', 0.5),
  yellow: std('#e8c32a', 0.5),
  rubber: std('#17191b', 0.9),
};

// 소방차 종류 (출동 선택용)
export const TRUCK_TYPES = {
  pump: { id: 'pump', name: '펌프차 (일반 소방차)', short: '펌프차', icon: '🚒', desc: '호스를 전개해 직접 방수·소화전 연결·송수에 쓰는 기본 소방차. 소방호스와 인명구조 장비를 싣고 있어 대부분의 현장에 첫 출동합니다.', use: '건물·주택 화재 진압, 실내 인명검색, 송수구 급수' },
  cannon: { id: 'cannon', name: '방수포 소방차', short: '방수포차', icon: '💦', desc: '지붕에 대용량 방수포(모니터 노즐)를 갖춘 차량. 분당 수천 L를 멀리 쏴 대형·고열 화재를 안전거리에서 냉각합니다.', use: '대형 외부 화재, 화염 분출 건물 외벽 냉각, 위험물·공장 화재' },
  aerial: { id: 'aerial', name: '고가굴절 소방차', short: '고가굴절차', icon: '🪜', desc: '굴절 붐(관절 사다리)과 바스켓으로 고층·옥상·발코니의 요구조자를 직접 구조하고 높은 곳에 방수합니다.', use: '고층 건물 인명구조, 옥상·발코니 고립, 높은 위치 방수' },
};

// 소방 펌프차: 전방 = +X  (type: 'pump' | 'cannon' | 'aerial')
export function makeFireTruck(type = 'pump') {
  const g = new THREE.Group();
  add(g, rbox(8.9, 0.7, 2.4, 0.1), M.grey, 0, 0.85, 0);
  add(g, rbox(5.6, 2.4, 2.5, 0.12), M.red, -1.55, 2.25, 0);
  add(g, rbox(2.55, 2.35, 2.5, 0.2), M.red, 3.1, 2.2, 0);
  add(g, rbox(2.6, 0.12, 2.56, 0.05), M.white, 3.1, 1.45, 0);
  add(g, rbox(5.62, 0.12, 2.52, 0.05), M.white, -1.55, 1.2, 0);
  // 유리
  add(g, new THREE.PlaneGeometry(2.1, 1.0), M.glass, 4.385, 2.55, 0, { ry: Math.PI / 2 });
  for (const s of [-1, 1]) add(g, new THREE.PlaneGeometry(1.5, 0.95), M.glass, 3.35, 2.6, s * 1.262, { ry: s > 0 ? 0 : Math.PI });
  // 범퍼/그릴
  add(g, rbox(0.4, 0.45, 2.55, 0.1), M.silver, 4.5, 0.78, 0);
  add(g, rbox(0.05, 0.35, 1.4, 0.02), M.black, 4.38, 1.55, 0);
  for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), std('#fff6c8', 0.2, 0, { emissive: '#ffe9a0', emissiveIntensity: 0.9 }), 4.4, 1.15, s * 0.95, { rz: Math.PI / 2 });
  // 측면 문구 및 셔터
  const lab = labelTexture(type === 'cannon' ? '119 방수포' : type === 'aerial' ? '119 고가굴절' : '119 소방', { w: 640, h: 160, bg: '#b4231b', fg: '#fff', font: 'bold 82px sans-serif', stripe: true });
  const labMat = new THREE.MeshStandardMaterial({ map: lab, roughness: 0.4, metalness: 0.2 });
  for (const s of [-1, 1]) {
    add(g, new THREE.PlaneGeometry(4.2, 1.05), labMat, -1.4, 2.95, s * 1.262, { ry: s > 0 ? 0 : Math.PI });
    for (let i = 0; i < 3; i++) {
      const sh = add(g, rbox(1.55, 1.15, 0.05, 0.02), M.silver, -3.1 + i * 1.7, 1.95, s * 1.27, { shadow: false });
      add(g, rbox(0.4, 0.05, 0.04, 0.01), M.black, -3.1 + i * 1.7, 1.45, s * 1.3, { shadow: false });
    }
  }
  // 지붕 사다리/경광등
  if (type !== 'aerial') {
    add(g, rbox(5.0, 0.07, 0.07, 0.02), M.silver, -1.6, 3.62, 0.4);
    add(g, rbox(5.0, 0.07, 0.07, 0.02), M.silver, -1.6, 3.62, -0.4);
    for (let i = 0; i < 11; i++) add(g, rbox(0.05, 0.05, 0.8, 0.01), M.silver, -3.9 + i * 0.46, 3.62, 0);
  }
  if (type === 'cannon') {
    // 지붕 방수포(모니터): 받침 · 굴절관 · 긴 포신 · 노즐
    add(g, new THREE.CylinderGeometry(0.34, 0.42, 0.34, 16), M.silver, -0.6, 3.6, 0);
    add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12), M.red, -0.6, 4.05, 0);
    const bar = add(g, new THREE.CylinderGeometry(0.17, 0.2, 2.3, 14), M.silver, 0.45, 4.5, 0, { rz: -Math.PI / 2 + 0.28 });
    add(g, new THREE.CylinderGeometry(0.24, 0.17, 0.5, 14), M.black, 1.7, 4.88, 0, { rz: -Math.PI / 2 + 0.28 });
    add(g, rbox(1.4, 0.5, 2.2, 0.1), std('#2b6cb0', 0.5, 0.2), -3.4, 3.55, 0); // 대용량 수조
    for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.9, 10), M.silver, -2.0, 3.2, s * 1.2, { rz: Math.PI / 2 });
  }
  if (type === 'aerial') {
    // 굴절 붐(접은 상태) + 회전대 + 바스켓 + 아웃트리거
    add(g, new THREE.CylinderGeometry(0.75, 0.85, 0.5, 18), M.grey, -2.6, 3.6, 0);
    add(g, rbox(7.2, 0.42, 0.5, 0.06), M.red, 0.8, 4.1, 0, { rz: 0.0 });
    add(g, rbox(0.5, 0.5, 0.44, 0.05), M.silver, 4.3, 4.1, 0);
    add(g, rbox(3.6, 0.32, 0.4, 0.05), M.yellow, 2.4, 4.55, 0);
    add(g, rbox(1.0, 0.9, 1.1, 0.06), M.white, 3.9, 4.55, 0);
    add(g, rbox(1.06, 0.06, 1.16, 0.02), M.silver, 3.9, 5.0, 0);
    for (const sx of [-2.9, 1.9]) for (const s of [-1, 1]) {
      add(g, rbox(0.14, 0.14, 1.2, 0.03), M.silver, sx, 0.6, s * 1.9);
      add(g, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14), M.black, sx, 0.05, s * 2.5);
      add(g, rbox(0.12, 0.7, 0.12, 0.02), M.silver, sx, 0.4, s * 2.5);
    }
  }
  const lbR = add(g, rbox(0.42, 0.2, 0.9, 0.05), std('#ff2a1a', 0.3, 0, { emissive: '#ff2a1a', emissiveIntensity: 1 }), 3.2, 3.5, -0.45);
  const lbB = add(g, rbox(0.42, 0.2, 0.9, 0.05), std('#1f6bff', 0.3, 0, { emissive: '#1f6bff', emissiveIntensity: 1 }), 3.2, 3.5, 0.45);
  // 바퀴
  for (const x of [3.3, -2.6]) for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.58, 0.58, 0.46, 24), M.rubber, x, 0.58, s * 1.2, { rx: Math.PI / 2 });
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.48, 16), M.silver, x, 0.58, s * 1.2, { rx: Math.PI / 2 });
  }
  // 후면 호스릴
  add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.8, 24), M.yellow, -4.45, 1.9, 0, { rx: Math.PI / 2 });
  add(g, new THREE.CylinderGeometry(0.18, 0.18, 0.9, 12), M.silver, -4.45, 1.9, 0, { rx: Math.PI / 2 });
  g.userData.lights = [lbR, lbB];
  g.userData.flash = (t) => {
    const a = Math.sin(t * 9) > 0;
    lbR.material.emissiveIntensity = a ? 2.2 : 0.15;
    lbB.material.emissiveIntensity = a ? 0.15 : 2.2;
  };
  g.userData.hosePoint = new THREE.Vector3(-4.7, 0.9, 0);
  g.userData.size = type === 'aerial' ? { w: 9.0, d: 2.6, h: 5.2 } : { w: 9.0, d: 2.6, h: 3.7 };
  g.userData.type = type;
  return g;
}

export function makeTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = add(g, new THREE.CylinderGeometry(0.2, 0.32, 3.2, 8), std('#5b4733', 0.95), 0, 1.6, 0);
  const leafCols = ['#3f6b3f', '#4a7a45', '#355f3a'];
  for (let i = 0; i < 4; i++) {
    const m = add(g, new THREE.IcosahedronGeometry(1.5 + Math.random() * 0.7, 1), std(leafCols[i % 3], 0.9), rand(-0.8, 0.8), 3.7 + i * 0.5 + rand(0, 0.6), rand(-0.8, 0.8));
    m.scale.y = 0.85;
  }
  g.scale.setScalar(scale);
  return g;
}

export function makeLamp() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.08, 0.12, 7, 8), M.grey, 0, 3.5, 0);
  add(g, rbox(1.4, 0.08, 0.08, 0.02), M.grey, 0.6, 7, 0);
  add(g, rbox(0.7, 0.14, 0.3, 0.05), std('#fff2cc', 0.3, 0, { emissive: '#ffd890', emissiveIntensity: 1.3 }), 1.2, 6.92, 0);
  return g;
}

export function makeCar(color = '#8aa3b8') {
  const g = new THREE.Group();
  const body = std(color, 0.3, 0.55);
  add(g, rbox(4.4, 0.7, 1.8, 0.2), body, 0, 0.7, 0);
  add(g, rbox(2.3, 0.6, 1.6, 0.25), body, -0.2, 1.25, 0);
  add(g, rbox(2.15, 0.5, 1.64, 0.2), M.glass, -0.2, 1.28, 0);
  for (const x of [1.4, -1.4]) for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), M.rubber, x, 0.34, s * 0.88, { rx: Math.PI / 2 });
  return g;
}

export function makeHydrant() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.17, 0.2, 0.75, 14), std('#c8281f', 0.4, 0.3), 0, 0.4, 0);
  add(g, new THREE.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#c8281f', 0.4, 0.3), 0, 0.78, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), std('#c8281f', 0.4, 0.3), 0, 0.55, 0, { rz: Math.PI / 2 });
  add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), M.silver, 0, 0.12, 0);
  return g;
}

export function makeCone() {
  const g = new THREE.Group();
  add(g, new THREE.ConeGeometry(0.2, 0.7, 12), std('#ff6a1a', 0.5), 0, 0.4, 0);
  add(g, new THREE.CylinderGeometry(0.21, 0.21, 0.09, 12), std('#ececec', 0.5), 0, 0.42, 0);
  add(g, rbox(0.5, 0.05, 0.5, 0.01), M.black, 0, 0.025, 0);
  return g;
}

// 경계선 테이프
export function makeBarrier(length = 10) {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(length / 3) + 1);
  for (let i = 0; i < n; i++) add(g, new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M.grey, (i / (n - 1) - 0.5) * length, 0.55, 0);
  const tape = new THREE.MeshStandardMaterial({ map: labelTexture('', { w: 128, h: 16, bg: '#f2c500' }), roughness: 0.7 });
  const t = add(g, new THREE.BoxGeometry(length, 0.1, 0.01), std('#e4b800', 0.6), 0, 0.95, 0);
  const t2 = add(g, new THREE.BoxGeometry(length, 0.1, 0.01), std('#e4b800', 0.6), 0, 0.7, 0);
  return g;
}

export const PROPS_MAT = M;
export { add, rbox, std };

// 구급차: 전방 = +X
export function makeAmbulance() {
  const g = new THREE.Group();
  const white = std('#f2f2f0', 0.35, 0.2), red = std('#d02a22', 0.4);
  add(g, rbox(5.6, 0.5, 2.1, 0.08), M.grey, 0, 0.7, 0);
  add(g, rbox(3.4, 1.9, 2.2, 0.15), white, -1.0, 1.85, 0);
  add(g, rbox(1.9, 1.45, 2.15, 0.25), white, 2.0, 1.55, 0);
  add(g, rbox(0.7, 0.8, 2.0, 0.1), M.glass, 2.55, 1.9, 0);
  add(g, rbox(3.42, 0.28, 2.22, 0.03), red, -1.0, 1.55, 0);
  add(g, rbox(1.92, 0.2, 2.17, 0.03), red, 2.0, 1.2, 0);
  for (const s of [-1, 1]) {
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ map: labelTexture('✚ 구급 119', { w: 384, h: 240, bg: '#f2f2f0', fg: '#d02a22', font: 'bold 62px sans-serif' }) }));
    cross.position.set(-1.0, 2.25, s * 1.111); cross.rotation.y = s > 0 ? 0 : Math.PI; g.add(cross);
  }
  add(g, rbox(0.4, 0.14, 1.3, 0.04), std('#d02a22', 0.3, 0, { emissive: '#ff2a1a', emissiveIntensity: 1.6 }), 1.6, 2.38, -0.3);
  add(g, rbox(0.4, 0.14, 1.3, 0.04), std('#2a5ad0', 0.3, 0, { emissive: '#2a6aff', emissiveIntensity: 1.6 }), 1.6, 2.38, 0.3);
  for (const x of [2.0, -1.8]) for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16), M.rubber, x, 0.4, s * 1.0, { rx: Math.PI / 2 });
  return g;
}
