// 마을 시설: 고깃집(실외+실내) · 병원 + 구급차
import * as THREE from 'three';
import { labelTexture, plasterTex, tileTex, woodTex, tiled } from './textures.js';
import { makeAmbulance, PROPS_MAT as PM, std } from './props.js';

export const DINER = { x: -40, z: -36, w: 18, d: 12 };
export const HOSPITAL = { x: 8, z: -38, w: 28, d: 14 };

const lbl = (t, o) => new THREE.MeshStandardMaterial({ map: labelTexture(t, o), roughness: 0.6 });

export function buildRestaurant(W) {
  const g = W.out;
  const { x, z, w, d } = DINER;
  W.building({ x, z, w, d, floors: 1, floorH: 4.6, wall: '#a9633d', variant: 0 });
  const fz = z + d / 2;
  W.box(g, w + 1, 0.4, 0.1, x, 4.2, fz + 0.12, lbl('🔥 소방이네 고깃집', { w: 1024, h: 128, bg: '#2a1a12', fg: '#ffd27a', font: 'bold 78px sans-serif' }), { cast: false });
  // 차양
  for (let i = 0; i < 8; i++) W.box(g, (w - 4) / 8, 0.08, 1.6, x - (w - 4) / 2 + ((w - 4) / 8) * (i + 0.5), 3.5, fz + 0.9, std(i % 2 ? '#f2eee4' : '#c42b22', 0.7), { cast: true });
  // 문 + 간판
  W.box(g, 2.6, 2.7, 0.12, x, 1.35, fz + 0.1, new THREE.MeshStandardMaterial({ color: '#ffe3a8', emissive: '#ffcf80', emissiveIntensity: 0.8 }), { cast: false });
  W.box(g, 2.9, 0.16, 0.2, x, 2.8, fz + 0.12, std('#3a2416', 0.7), {});
  W.box(g, 1.3, 0.5, 0.06, x - 6, 1.6, fz + 0.1, lbl('삼겹살·냉면', { w: 320, h: 128, bg: '#f4ecd8', fg: '#b4231b', font: 'bold 52px sans-serif' }), { cast: false });
  W.box(g, 1.3, 0.5, 0.06, x + 6, 1.6, fz + 0.1, lbl('영업중', { w: 320, h: 128, bg: '#1d5a2a', fg: '#fff', font: 'bold 60px sans-serif' }), { cast: false });
  // 진입로
  W.box(g, 3.2, 0.1, 20, x, 0.05, fz + 10 + 0.0, new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.95 }), { cast: false });
  // 입구 안내 (진입 지점)
  W.dinerDoor = new THREE.Vector3(x, 0, fz + 1.8);
}

export function buildHospital(W) {
  const g = W.out;
  const { x, z, w, d } = HOSPITAL;
  W.building({ x, z, w, d, floors: 4, floorH: 3.6, wall: '#dfe3e6', variant: 1 });
  const fz = z + d / 2;
  W.box(g, 10, 1.4, 0.2, x, 13.6, fz + 0.15, lbl('✚ 119 중앙병원', { w: 1024, h: 140, bg: '#ffffff', fg: '#d02a22', font: 'bold 84px sans-serif' }), { cast: false });
  // 응급실 캐노피 + 간판
  W.box(g, 9, 0.3, 4.2, x, 3.6, fz + 2.1, std('#eef0f2', 0.5), { solid: false });
  W.box(g, 7, 0.9, 0.12, x, 4.25, fz + 4.18, lbl('응급실 EMERGENCY', { w: 900, h: 120, bg: '#c8261e', fg: '#fff', font: 'bold 70px sans-serif' }), { cast: false });
  for (const dx of [-4.3, 4.3]) W.box(g, 0.3, 3.6, 0.3, x + dx, 1.8, fz + 4, std('#cfd3d6', 0.5), {});
  W.box(g, 4, 2.9, 0.14, x, 1.45, fz + 0.1, new THREE.MeshStandardMaterial({ color: '#9fd0e6', emissive: '#6aa8c6', emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.4 }), { cast: false });
  // 포장 + 응급 주차선
  W.box(g, w + 6, 0.12, 12, x, 0.06, fz + 6, new THREE.MeshStandardMaterial({ color: '#a8aaae', roughness: 0.95 }), { cast: false });
  W.box(g, 7, 0.02, 3.4, x + 10, 0.13, fz + 4.4, std('#e8c32a', 0.8), { cast: false });
  // 구급차
  const amb = makeAmbulance();
  amb.position.set(x + 10, 0, fz + 4.4);
  amb.rotation.y = Math.PI; // 후진 주차: 전방 -x 방향
  amb.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.add(amb);
  W.ambulance = amb;
  W.solid(x + 10, 1.2, fz + 4.4, 5.6, 2.4, 2.3, 'ambulance', { water: false });
  // 수목/벤치
  W.hospitalPos = new THREE.Vector3(x, 0, fz + 5);
}

export function buildDiner(W, LAYOUT) {
  const grp = new THREE.Group();
  W.scene.add(grp);
  const O = LAYOUT.interiorR;
  const I = (W.intR = { group: grp, O: new THREE.Vector3(...O), lamps: [], tables: [] });
  const H = 3.4;
  const wx = (x) => O[0] + x, wz = (z) => O[2] + z;
  I.p = (x, y, zz) => new THREE.Vector3(wx(x), y, wz(zz));
  const wallMat = new THREE.MeshStandardMaterial({ map: tiled(plasterTex('#e2c9a0'), 4, 1), roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ map: tiled(woodTex(), 6, 5), roughness: 0.7 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#d9c7a6', roughness: 0.95, side: THREE.DoubleSide });
  const fl = W.mesh(grp, new THREE.PlaneGeometry(19, 14), floorMat, wx(0), 0.01, wz(6), { cast: false }); fl.rotation.x = -Math.PI / 2;
  const ce = W.mesh(grp, new THREE.PlaneGeometry(19, 14), ceilMat, wx(0), H, wz(6)); ce.rotation.x = Math.PI / 2;
  W.solid(wx(0), H + 0.2, wz(6), 21, 0.4, 16, 'ceiling');
  const wall = (x0, z0, x1, z1, y0 = 0, y1 = H) => {
    const ww = Math.abs(x1 - x0) + (x0 === x1 ? 0.28 : 0), dd = Math.abs(z1 - z0) + (z0 === z1 ? 0.28 : 0);
    W.box(grp, ww, y1 - y0, dd, wx((x0 + x1) / 2), (y0 + y1) / 2, wz((z0 + z1) / 2), wallMat, { solid: true, tag: 'wall' });
  };
  wall(-9, 0, -9, 12.5); wall(9, 0, 9, 12.5); wall(-9, 12.5, 9, 12.5); wall(-9, 0, -1.3, 0); wall(1.3, 0, 9, 0); wall(-1.3, 0, 1.3, 0, 2.5, H);
  W.box(grp, 2.6, 2.5, 0.1, wx(0), 1.25, wz(-0.5), new THREE.MeshBasicMaterial({ color: '#fff0d8' }));
  W.solid(wx(0), 1.6, wz(-0.9), 3.0, 3.2, 0.6, 'exitblock', { water: false });
  W.box(grp, 1.4, 0.4, 0.06, wx(0), 2.8, wz(0.2), lbl('출구 EXIT', { w: 320, h: 110, bg: '#0f7d3d', fg: '#fff', font: 'bold 52px sans-serif' }), { cast: false });
  // 조명(따뜻한 색)
  for (const [x, zz] of [[-5.5, 4], [5.5, 4], [-5.5, 9], [5.5, 9]]) {
    W.box(grp, 1.2, 0.08, 1.2, wx(x), H - 0.05, wz(zz), std('#ffe6b8', 0.4, 0, { emissive: '#ffd08a', emissiveIntensity: 1.8 }), { cast: false });
    I.lamps.push({ pos: new THREE.Vector3(wx(x), H - 0.6, wz(zz)), color: '#ffd9a0', intensity: 10, distance: 13 });
  }
  // 벽 메뉴판
  W.box(grp, 5.2, 1.4, 0.05, wx(-4.5), 2.0, wz(12.3), lbl('물냉면 · 비빔냉면 · 된장찌개 · 돌솥밥 · 계란찜 · 삼겹살 · 목삼겹 · 콜라 · 사이다', { w: 1100, h: 300, bg: '#2a1a12', fg: '#ffd27a', font: 'bold 44px sans-serif' }), { cast: false });
  W.box(grp, 4.2, 1.1, 0.05, wx(5), 2.0, wz(12.3), lbl('우리 가게는 소방안전 인증업소! 불조심 강조', { w: 900, h: 260, bg: '#b4231b', fg: '#fff', font: 'bold 46px sans-serif' }), { cast: false });
  // 주방 카운터
  W.box(grp, 9, 1.0, 0.9, wx(-3.5), 0.5, wz(11.6), std('#6b4a30', 0.6), { solid: true, tag: 'counter' });
  W.box(grp, 9.2, 0.08, 1.0, wx(-3.5), 1.03, wz(11.6), std('#2c2c30', 0.4, 0.3), {});
  // 소화기 (식당 비치)
  const ex = new THREE.Group(); ex.position.set(wx(8.5), 0, wz(2)); grp.add(ex);
  const e1 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 16), PM.red); e1.position.set(0, 0.3, 0); ex.add(e1);
  // 테이블
  const wood = std('#7a5232', 0.6), black = std('#1b1b1e', 0.5, 0.4), chairM = std('#8a3a2b', 0.8);
  const spots = [[-5.5, 4.5], [-5.5, 8.5], [5.5, 4.5], [5.5, 8.5]];
  spots.forEach(([tx, tz], i) => {
    W.box(grp, 1.7, 0.08, 1.2, wx(tx), 0.78, wz(tz), wood, { solid: false });
    W.solid(wx(tx), 0.4, wz(tz), 1.7, 0.8, 1.2, 'table', { water: false, view: false });
    for (const [lx, lz] of [[-0.75, -0.5], [0.75, -0.5], [-0.75, 0.5], [0.75, 0.5]]) W.box(grp, 0.08, 0.76, 0.08, wx(tx + lx), 0.38, wz(tz + lz), wood, { solid: false });
    const grill = W.mesh(grp, new THREE.CylinderGeometry(0.42, 0.42, 0.07, 28), black, wx(tx), 0.86, wz(tz));
    const coal = W.mesh(grp, new THREE.CylinderGeometry(0.34, 0.34, 0.02, 24), std('#ff5a1a', 0.5, 0, { emissive: '#ff4a10', emissiveIntensity: 1.4 }), wx(tx), 0.895, wz(tz), { cast: false });
    for (const dz of [-1.0, 1.0]) W.box(grp, 0.5, 0.45, 0.5, wx(tx), 0.23, wz(tz + dz), chairM, { solid: true, round: 0.03, tag: 'chair', water: false, view: false });
    // 환기 후드
    W.box(grp, 0.18, 1.2, 0.18, wx(tx), H - 0.6, wz(tz), std('#9aa0a6', 0.35, 0.8), { cast: false });
    W.box(grp, 1.0, 0.1, 1.0, wx(tx), 2.3, wz(tz), std('#9aa0a6', 0.35, 0.8), { cast: false });
    I.tables.push({ id: i, pos: I.p(tx, 0, tz), grillPos: I.p(tx, 0.92, tz), coal });
  });
  I.spawn = I.p(0, 0, 2.0);
  I.exit = I.p(0, 0, 0.8);
  I.owner = I.p(-6, 0, 10.6);
  grp.visible = false;
}
