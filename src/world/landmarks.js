// 도시 곳곳의 다양한 건물(소방서·고깃집 제외) — 외관 + 외부 소방시설 + 소방차 진입 공간.
// 건물 내부와 미션은 이후 추가할 수 있도록 각 건물의 출입구·정차 위치를 W.landmarks 에 기록해 둔다.
import * as THREE from 'three';
import { labelTexture } from './textures.js';
import { makeHydrant, makeCar, std } from './props.js';

// row 'S': 남쪽 보조도로(z=24) 건너 남측 줄 — 정면이 북쪽(-z)을 봄 / 'N': 북쪽 보조도로(z=-52) 북측 줄 — 정면이 남쪽(+z)을 봄
// 정면 z: S 줄 36, N 줄 -62 (도로 끝선 29 / -57 과의 사이가 소방차 진입 포장구역)
export const LANDMARKS = [
  { id: 'shop',    name: '중앙상가',        kind: '근린생활시설', row: 'S', x: -28, w: 22, d: 16, floors: 4,  floorH: 3.5, wall: '#c9b99a', variant: 1 },
  { id: 'care',    name: '해뜰 요양원',     kind: '노유자시설',   row: 'S', x: 36,  w: 26, d: 15, floors: 5,  floorH: 3.3, wall: '#e3d6c0', variant: 0 },
  { id: 'academy', name: '119 학원가',      kind: '교육연구시설', row: 'S', x: 118, w: 28, d: 16, floors: 5,  floorH: 3.4, wall: '#9db0c4', variant: 1 },
  { id: 'logis',   name: '대한 물류센터',   kind: '창고시설',     row: 'S', x: 210, w: 38, d: 22, floors: 2,  floorH: 6.0, wall: '#b0b4b8', variant: 0, dock: true },
  { id: 'apt',     name: '행복 아파트',     kind: '공동주택',     row: 'S', x: 296, w: 30, d: 16, floors: 12, floorH: 3.0, wall: '#cbb7a0', variant: 1 },
  { id: 'gas',     name: '119 주유소',      kind: '위험물취급소', row: 'S', x: 386, w: 12, d: 8,  floors: 1,  floorH: 3.6, wall: '#d9d9d2', variant: 0, gas: true, spanW: 36 },
  { id: 'hotel',   name: '그랜드 119 호텔', kind: '숙박시설',     row: 'N', x: -8,  w: 26, d: 16, floors: 9,  floorH: 3.2, wall: '#d8cdb8', variant: 0 },
  { id: 'mart',    name: '119 대형마트',    kind: '판매시설',     row: 'N', x: 110, w: 36, d: 20, floors: 2,  floorH: 5.0, wall: '#d6bf74', variant: 0 },
  { id: 'office',  name: '중앙 오피스타워', kind: '업무시설',     row: 'N', x: 232, w: 22, d: 18, floors: 14, floorH: 3.2, wall: '#8fa2b3', variant: 1 },
  { id: 'hall',    name: '혜전 문화예술회관', kind: '문화집회시설', row: 'N', x: 334, w: 32, d: 20, floors: 3,  floorH: 5.0, wall: '#c7b8c9', variant: 0 },
];

export const FRONT_Z = { S: 36, N: -62 };
const ROAD_EDGE = { S: 29, N: -57 };

// 새 건물이 차지하는 x 구간(여유 포함) — 배경 건물 생성 때 겹치지 않도록 비워 둔다
export function landmarkSpan(row) {
  return LANDMARKS.filter((l) => l.row === row).map((l) => { const w = l.spanW || l.w; return [l.x - w / 2 - 3, l.x + w / 2 + 3]; });
}

export function buildLandmarks(W) {
  const g = W.out;
  W.landmarks = [];
  for (const L of LANDMARKS) {
    const sgn = L.row === 'S' ? -1 : 1; // 정면이 향하는 z 방향
    const fz = FRONT_Z[L.row];
    // S: 정면(북쪽 면)이 fz, 건물은 +z 쪽으로 / N: 정면(남쪽 면)이 fz, 건물은 -z 쪽으로
    const cz = L.gas ? fz + 22 : (L.row === 'S' ? fz + L.d / 2 : fz - L.d / 2);
    const b = W.building({ x: L.x, z: cz, w: L.w, d: L.d, floors: L.floors, floorH: L.floorH, wall: L.wall, variant: L.variant });
    const faceZ = L.gas ? cz + sgn * (L.d / 2) : fz;
    const zz = (o) => faceZ + sgn * o; // 정면에서 바깥으로 o 만큼
    const H = b.h;

    // ── 소방차 진입·정차 포장구역: 도로 끝선에서 정면까지, 건물 폭 + 여유
    const apW = L.gas ? 30 : L.w + 6;
    const apFrom = ROAD_EDGE[L.row], apTo = L.gas ? faceZ : fz;
    const apron = new THREE.MeshStandardMaterial({ color: '#a9a8a2', roughness: 0.95 });
    W.box(g, apW, 0.12, Math.abs(apTo - apFrom), L.x, 0.06, (apFrom + apTo) / 2, apron, { cast: false });
    // 소방차 전용 표시(노란 사선 띠 + 문구)
    const yel = std('#e6bf2a', 0.8);
    W.box(g, Math.min(apW - 2, 16), 0.02, 0.35, L.x, 0.14, apFrom + (L.row === 'S' ? 1.2 : -1.2), yel, { cast: false });
    const fireLane = W.mesh(g, new THREE.PlaneGeometry(6, 1.2), new THREE.MeshStandardMaterial({ map: labelTexture('소방차 전용', { w: 512, h: 100, bg: '#a9a8a2', fg: '#c8281f', font: 'bold 66px sans-serif' }), roughness: 0.9 }), L.x + (L.w / 2 - 4), 0.15, (apFrom + apTo) / 2, { cast: false });
    fireLane.rotation.x = -Math.PI / 2; fireLane.rotation.z = L.row === 'S' ? Math.PI : 0;

    if (!L.gas) {
      // ── 간판
      const signMat = new THREE.MeshStandardMaterial({ map: labelTexture(L.name, { w: 1024, h: 128, bg: '#1d3b5c', fg: '#fff', font: 'bold 72px sans-serif' }), roughness: 0.6 });
      W.box(g, Math.min(L.w - 2, 14), 1.1, 0.2, L.x, Math.min(H - 0.8, 5.6), zz(0.15), signMat, { cast: false });
      const kindMat = new THREE.MeshStandardMaterial({ map: labelTexture(L.kind, { w: 512, h: 80, bg: '#e9e6dc', fg: '#555', font: 'bold 40px sans-serif' }), roughness: 0.8 });
      W.box(g, 3.4, 0.5, 0.08, L.x + Math.min(L.w - 2, 14) / 2 - 1.9, Math.min(H - 0.8, 5.6) - 1.0, zz(0.1), kindMat, { cast: false });

      // ── 출입구: 방화문(강판 문) + 차양 + 비상구 유도등
      const dx = L.x;
      const doorMat = std('#6b7076', 0.5, 0.5);
      W.box(g, 2.6, 2.6, 0.16, dx, 1.3, zz(0.1), doorMat, { cast: false });
      W.box(g, 0.1, 2.6, 0.18, dx, 1.3, zz(0.11), std('#2c2f33', 0.6), { cast: false }); // 양문 중앙선
      W.box(g, 1.0, 0.4, 0.06, dx, 2.0, zz(0.2), new THREE.MeshStandardMaterial({ map: labelTexture('방화문', { w: 256, h: 96, bg: '#b4231b', fg: '#fff', font: 'bold 56px sans-serif' }) }), { cast: false });
      W.box(g, 3.4, 0.12, 1.6, dx, 3.0, zz(0.9), std('#3a3d42', 0.7), {}); // 차양
      W.box(g, 1.2, 0.46, 0.08, dx, 3.35, zz(0.2), new THREE.MeshStandardMaterial({ map: labelTexture('비상구', { w: 256, h: 96, bg: '#0f7d3d', fg: '#fff', font: 'bold 56px sans-serif' }), emissive: '#14a85a', emissiveIntensity: 1.0 }), { cast: false });
      // 출입 계단(낮은 단)
      W.box(g, 4.2, 0.18, 1.4, dx, 0.09, zz(0.9), std('#9a9892', 0.95), { cast: false });

      // ── 외부 소방시설
      // 소화기함(출입구 오른쪽 벽): 적색 함 + 소화기 + 표지
      const ex = dx + 3.0;
      W.box(g, 0.55, 0.9, 0.3, ex, 1.15, zz(0.15), std('#c8281f', 0.45, 0.2), { cast: false });
      W.box(g, 0.22, 0.55, 0.22, ex, 1.12, zz(0.33), std('#d8281f', 0.4, 0.3), { cast: false });
      W.box(g, 0.1, 0.12, 0.1, ex, 1.46, zz(0.33), std('#222', 0.6), { cast: false });
      W.box(g, 0.5, 0.18, 0.04, ex, 1.74, zz(0.12), new THREE.MeshStandardMaterial({ map: labelTexture('소화기', { w: 256, h: 80, bg: '#fff', fg: '#c8281f', font: 'bold 54px sans-serif' }) }), { cast: false });
      // 옥외소화전함(출입구 왼쪽 벽)
      const hx = dx - 3.4;
      W.box(g, 0.7, 1.2, 0.35, hx, 1.15, zz(0.18), std('#c8281f', 0.45, 0.2), { cast: false });
      W.box(g, 0.55, 0.3, 0.04, hx, 1.45, zz(0.37), new THREE.MeshStandardMaterial({ map: labelTexture('옥외소화전', { w: 256, h: 80, bg: '#7a1510', fg: '#fff', font: 'bold 44px sans-serif' }) }), { cast: false });
      // 송수구(연결송수관·스프링클러): 벽 하부 은색 쌍구형 + 청색 표지
      const sx = dx + (L.w / 2 - 3);
      W.box(g, 0.5, 0.4, 0.18, sx, 0.85, zz(0.12), std('#c7ccd2', 0.3, 0.8), { cast: false });
      for (const o of [-0.12, 0.12]) { const n = W.mesh(g, new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), std('#d9a526', 0.35, 0.8), sx + o, 0.85, zz(0.3), { cast: false }); n.rotation.x = Math.PI / 2; }
      W.box(g, 0.9, 0.26, 0.04, sx, 1.22, zz(0.1), new THREE.MeshStandardMaterial({ map: labelTexture('송수구', { w: 256, h: 80, bg: '#1d5fa0', fg: '#fff', font: 'bold 54px sans-serif' }) }), { cast: false });
      // 소방시설 설치 안내판
      const gx = dx - (L.w / 2 - 3);
      W.box(g, 2.0, 0.8, 0.06, gx, 1.7, zz(0.1), new THREE.MeshStandardMaterial({ map: labelTexture('옥내소화전·스프링클러·자동화재탐지설비 설치', { w: 800, h: 220, bg: '#f2efe4', fg: '#7a1510', font: 'bold 40px sans-serif' }) }), { cast: false });
      // 지면 소화전(정차 위치 옆)
      const hy = makeHydrant();
      hy.position.set(L.x - L.w / 2 - 1.2, 0.2, (apFrom + apTo) / 2);
      hy.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(hy);
      W.solid(hy.position.x, 0.5, hy.position.z, 0.5, 1, 0.5, 'hydrant', { water: false, view: false });
      // 물류센터: 상하차 도크 셔터
      if (L.dock) {
        for (const o of [-12, -6, 6, 12]) {
          W.box(g, 3.4, 4.2, 0.14, L.x + o, 2.1, zz(0.1), std('#8c9298', 0.5, 0.5), { cast: false });
          for (let k = 0; k < 7; k++) W.box(g, 3.4, 0.04, 0.16, L.x + o, 0.5 + k * 0.55, zz(0.12), std('#6a7076', 0.5, 0.5), { cast: false });
        }
        W.box(g, 4.6, 0.9, 0.12, L.x - 17, 3.2, zz(0.1), new THREE.MeshStandardMaterial({ map: labelTexture('위험물 저장소 · 화기엄금', { w: 640, h: 120, bg: '#c8281f', fg: '#fff', font: 'bold 50px sans-serif' }) }), { cast: false });
      }
    } else {
      buildGas(W, L, g, faceZ, sgn);
    }

    // 정차 위치(미션 연결용): 건물 앞 도로 쪽 / 출입구
    W.landmarks.push({
      id: L.id, name: L.name, kind: L.kind, x: L.x, z: cz, w: L.w, d: L.d, floors: L.floors,
      door: new THREE.Vector3(L.x, 0, zz(L.gas ? 6 : 1.8)),
      truckSpot: new THREE.Vector3(L.x - L.w / 2 + 4, 0, (apFrom + apTo) / 2),
    });
  }
}

// 주유소: 캐노피 + 주유기 4대 + 사무실 + 안내 표지 (위험물 시설)
function buildGas(W, L, g, faceZ, sgn) {
  const canopyZ = L.row === 'S' ? 41 : -66;
  W.box(g, 22, 0.5, 11, L.x, 5.0, canopyZ, std('#e9e9e4', 0.6), { solid: false });
  W.box(g, 22.2, 0.5, 0.3, L.x, 4.6, canopyZ - 5.4, std('#c8281f', 0.5), { cast: false });
  W.box(g, 22.2, 0.5, 0.3, L.x, 4.6, canopyZ + 5.4, std('#c8281f', 0.5), { cast: false });
  for (const px of [-9, 9]) for (const pz of [-3.5, 3.5]) W.box(g, 0.5, 5, 0.5, L.x + px, 2.5, canopyZ + pz, std('#cfd3d6', 0.5), { solid: true, tag: 'pillar', water: false, view: false });
  for (const px of [-6, -2, 2, 6]) {
    W.box(g, 0.9, 0.2, 2.6, L.x + px, 0.1, canopyZ, std('#8a8a86', 0.9), { cast: false }); // 아일랜드
    W.box(g, 0.6, 1.6, 0.5, L.x + px, 1.0, canopyZ, std('#d9d9d2', 0.5, 0.2), { solid: true, tag: 'pump', water: false });
    W.box(g, 0.62, 0.35, 0.52, L.x + px, 1.65, canopyZ, std('#c8281f', 0.5), { cast: false });
  }
  const pylon = new THREE.MeshStandardMaterial({ map: labelTexture('119 주유소', { w: 512, h: 160, bg: '#1d4f7a', fg: '#fff', font: 'bold 76px sans-serif' }), roughness: 0.6 });
  W.box(g, 0.3, 7, 0.3, L.x - 13, 3.5, canopyZ - (L.row === 'S' ? 4 : -4), std('#cfd3d6', 0.5), { solid: true, tag: 'pillar', water: false, view: false });
  W.box(g, 4.2, 1.3, 0.2, L.x - 13, 7.2, canopyZ - (L.row === 'S' ? 4 : -4), pylon, { cast: false });
  // 소화기·모래·위험물 표지
  const sg = L.row === 'S' ? -1 : 1;
  W.box(g, 0.55, 0.9, 0.3, L.x + 4.2, 1.15, faceZ + sg * 0.15, std('#c8281f', 0.45, 0.2), { cast: false });
  W.box(g, 0.5, 0.18, 0.04, L.x + 4.2, 1.74, faceZ + sg * 0.12, new THREE.MeshStandardMaterial({ map: labelTexture('소화기', { w: 256, h: 80, bg: '#fff', fg: '#c8281f', font: 'bold 54px sans-serif' }) }), { cast: false });
  W.box(g, 2.2, 0.8, 0.06, L.x - 3.2, 1.9, faceZ + sg * 0.1, new THREE.MeshStandardMaterial({ map: labelTexture('위험물 취급소 · 화기엄금', { w: 800, h: 200, bg: '#c8281f', fg: '#fff', font: 'bold 48px sans-serif' }) }), { cast: false });
  W.box(g, 1.0, 0.4, 0.08, L.x, 3.0, faceZ + sg * 0.2, new THREE.MeshStandardMaterial({ map: labelTexture('비상구', { w: 256, h: 96, bg: '#0f7d3d', fg: '#fff', font: 'bold 56px sans-serif' }), emissive: '#14a85a', emissiveIntensity: 1.0 }), { cast: false });
  W.box(g, 2.4, 2.4, 0.16, L.x, 1.2, faceZ + sg * 0.1, std('#6b7076', 0.5, 0.5), { cast: false });
  const hy = makeHydrant(); hy.position.set(L.x - 16, 0.2, L.row === 'S' ? 33 : -60); g.add(hy);
  W.solid(hy.position.x, 0.5, hy.position.z, 0.5, 1, 0.5, 'hydrant', { water: false, view: false });
  // 주유 중인 승용차 1대
  const car = makeCar('#c8c8c4'); car.position.set(L.x + 4, 0, canopyZ + 2.2 * -1); car.rotation.y = Math.PI / 2; car.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(car);
  W.solid(L.x + 4, 0.9, canopyZ - 2.2, 1.9, 1.8, 4.5, 'car', { water: true });
}
