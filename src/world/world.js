// 월드: 소방서 · 화재 현장 3곳 · 실내 세트 2곳 · 충돌 처리
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  asphaltTex, concreteTex, facadeTile, grassTex, plasterTex, roadTex, roofTex, tileTex, woodTex, labelTexture, tiled,
} from './textures.js';
import { add, makeBarrier, makeCar, makeCone, makeFireTruck, makeHydrant, makeLamp, makeTree, PROPS_MAT as PM, rbox, std } from './props.js';
import { canvasTexture, clamp, rand } from '../core/util.js';

export const LAYOUT = {
  spawnHub: [-92, -11.5],
  truckHome: [-107, -3.6],
  board: [-97, -13.2],
  table: [-83.5, -16.7],
  npc: [-89.5, -10.2],
  siteA: { x: 60, z: -26, w: 24, d: 16, floors: 3, floorH: 4, truck: [44, -3.6], spawn: [50, -9.6], hydrant: [76, -9.2] },
  siteB: { x: 172, z: -28, w: 32, d: 18, floors: 5, floorH: 3.1, truck: [156, -3.6], spawn: [160, -9.6], door: [172, -19] },
  siteC: { x: 276, z: -24, w: 22, d: 14, floors: 2, floorH: 4, truck: [260, -3.6], spawn: [268, -9.6], door: [276, -17] },
  interiorB: [0, 0, 400],
  interiorC: [300, 0, 400],
};

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.solids = [];
    this.out = new THREE.Group(); // 실외
    this.scene.add(this.out);
    this.tex = { concrete: concreteTex(), asphalt: asphaltTex() };
    this.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();
    this.zone = 'outdoor';
    this.bounds = { minX: -135, maxX: 345, minZ: -75, maxZ: 62 };
    this.lampSources = []; // 현재 구역의 정적 조명
    this.sites = {};
    this.buildOutdoor();
    this.buildSmokeInterior();
    this.buildShop();
    this.showZone('outdoor');
  }

  // ───────── 충돌/레이캐스트 ─────────
  solid(cx, cy, cz, w, h, d, tag = '', o = {}) {
    const s = {
      box: new THREE.Box3(new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2), new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)),
      tag, active: true, water: o.water !== false, view: o.view !== false,
    };
    this.solids.push(s);
    return s;
  }

  pointInSolid(x, y, z) {
    for (const s of this.solids) {
      if (!s.active || !s.water) continue;
      const b = s.box;
      if (x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z) return true;
    }
    return false;
  }

  move(pos, r, dx, dz) {
    pos.x += dx; pos.z += dz;
    const bd = this.bounds;
    if (this.zone === 'outdoor') { pos.x = clamp(pos.x, bd.minX, bd.maxX); pos.z = clamp(pos.z, bd.minZ, bd.maxZ); }
    for (let it = 0; it < 3; it++) {
      for (const s of this.solids) {
        if (!s.active) continue;
        const b = s.box;
        if (b.max.y < 0.15 || b.min.y > 1.7) continue;
        if (pos.x < b.min.x - r || pos.x > b.max.x + r || pos.z < b.min.z - r || pos.z > b.max.z + r) continue;
        const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
        const ddx = pos.x - cx, ddz = pos.z - cz, d2 = ddx * ddx + ddz * ddz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x += (ddx / d) * (r - d); pos.z += (ddz / d) * (r - d); }
          else {
            const l = pos.x - b.min.x, rr = b.max.x - pos.x, t = pos.z - b.min.z, bt = b.max.z - pos.z, m = Math.min(l, rr, t, bt);
            if (m === l) pos.x = b.min.x - r; else if (m === rr) pos.x = b.max.x + r; else if (m === t) pos.z = b.min.z - r; else pos.z = b.max.z + r;
          }
        }
      }
    }
  }

  raycast(origin, dir, maxD = 60) {
    const ray = new THREE.Ray(origin, dir);
    let best = maxD, hit = null;
    const tmp = new THREE.Vector3();
    for (const s of this.solids) {
      if (!s.active || !s.view) continue;
      if (ray.intersectBox(s.box, tmp)) {
        const d = tmp.distanceTo(origin);
        if (d < best) { best = d; hit = s; }
      }
    }
    if (dir.y < -1e-4) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) { best = t; hit = { tag: 'ground' }; }
    }
    return { dist: best, hit };
  }

  // ───────── 구역 전환 ─────────
  showZone(name) {
    this.zone = name;
    this.out.visible = name === 'outdoor';
    this.intB.group.visible = name === 'smoky';
    this.intC.group.visible = name === 'shop';
    this.engine.setZone(name);
    this.lampSources = name === 'shop' ? this.intC.lamps : [];
  }

  // ───────── 공통 빌더 ─────────
  mesh(parent, geo, mat, x, y, z, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry;
    m.castShadow = o.cast !== false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  box(parent, w, h, d, x, y, z, mat, o = {}) {
    const m = this.mesh(parent, o.round ? new RoundedBoxGeometry(w, h, d, 3, o.round) : new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
    if (o.solid) this.solid(x + (o.ox || 0), y, z + (o.oz || 0), w, h, d, o.tag || '', { water: o.water, view: o.view });
    return m;
  }

  facadeMat(wall, w, h, bays, floors, variant = 0) {
    const t = tiled(facadeTile(wall, variant), bays, floors);
    t.anisotropy = this.anisotropy;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.88 });
  }

  building({ x, z, w, d, floors, floorH = 3.4, wall = '#b3aa9c', variant = 0, parent = this.out, solid = true }) {
    const h = floors * floorH;
    const bw = Math.max(2, Math.round(w / 3)), bd = Math.max(2, Math.round(d / 3));
    const front = this.facadeMat(wall, w, h, bw, floors, variant);
    const side = this.facadeMat(wall, d, h, bd, floors, variant);
    const roof = new THREE.MeshStandardMaterial({ map: tiled(roofTex(), w / 3, d / 3), roughness: 0.95 });
    const mats = [side, side, roof, roof, front, front];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    // 파라펫
    const par = std('#8e8b85', 0.9);
    for (const [px, pz, pw, pd] of [[0, d / 2, w + 0.3, 0.3], [0, -d / 2, w + 0.3, 0.3], [w / 2, 0, 0.3, d], [-w / 2, 0, 0.3, d]]) {
      this.box(parent, pw, 0.7, pd, x + px, h + 0.3, z + pz, par);
    }
    if (solid) this.solid(x, h / 2, z, w, h, d, 'building');
    return { mesh: m, h, x, z, w, d, floors, floorH, bw };
  }

  // 창문 위치 (정면 -z 방향이 아닌 +z 정면 기준: 건물 앞면은 z + d/2)
  windowPos(b, bay, floor) {
    const bayW = b.w / b.bw;
    return new THREE.Vector3(b.x - b.w / 2 + bayW * (bay + 0.5), floor * b.floorH + b.floorH * 0.555, b.z + b.d / 2);
  }

  // ═════════════════ 실외 ═════════════════
  buildOutdoor() {
    const g = this.out;
    const L = LAYOUT;
    // 지면
    const grass = tiled(grassTex(), 240, 190); grass.anisotropy = this.anisotropy;
    const gm = this.mesh(g, new THREE.PlaneGeometry(960, 760), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }), 100, 0, 0, { cast: false });
    gm.rotation.x = -Math.PI / 2;
    // 도로
    const rt = tiled(roadTex(), 960 / 40, 1); rt.anisotropy = this.anisotropy;
    const road = this.mesh(g, new THREE.PlaneGeometry(960, 14), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.92 }), 100, 0.02, 0, { cast: false });
    road.rotation.x = -Math.PI / 2;
    // 보도
    const conc = tiled(concreteTex(), 960 / 3.2, 1); conc.anisotropy = this.anisotropy;
    const walkMat = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.95 });
    for (const s of [-1, 1]) this.box(g, 960, 0.2, 3.6, 100, 0.1, s * 8.8, walkMat, { cast: false });
    // 소방서 앞 / 현장 앞 포장구역
    const plaza = (x, z, w, d) => {
      const t = tiled(concreteTex(), w / 4, d / 4); t.anisotropy = this.anisotropy;
      this.box(g, w, 0.12, d, x, 0.06, z, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), { cast: false });
    };
    plaza(-98, -14.5, 56, 7.4);
    plaza(L.siteA.x, -14.2, 36, 8.2);
    plaza(L.siteB.x, -14.2, 44, 8.2);
    plaza(L.siteC.x, -13.2, 34, 8.2);

    this.buildStation();
    this.buildSiteA();
    this.buildSiteB();
    this.buildSiteC();
    this.buildCity();

    // 소방차
    this.truck = makeFireTruck();
    this.truck.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(this.truck);
    this.truckSolid = this.solid(0, 1.9, 0, 9.2, 3.8, 2.7, 'truck', { water: true });
    this.placeTruck(L.truckHome[0], L.truckHome[1]);

    // 가로수 / 가로등 / 승용차
    for (let x = -130; x < 340; x += 18) {
      for (const s of [-1, 1]) {
        if (s < 0 && ((x > -125 && x < -70) || (x > 36 && x < 84) || (x > 150 && x < 200) || (x > 256 && x < 298))) continue;
        const t = makeTree(rand(0.9, 1.25));
        t.position.set(x + rand(-2, 2), 0.2, s * 11.5);
        t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        g.add(t);
        this.solid(t.position.x, 1, t.position.z, 0.7, 2, 0.7, 'tree', { water: false, view: false });
      }
    }
    for (let x = -120; x < 340; x += 32) for (const s of [-1, 1]) {
      const l = makeLamp();
      l.position.set(x, 0.2, s * 9.7);
      if (s > 0) l.rotation.y = Math.PI;
      l.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(l);
    }
    const carCols = ['#8aa3b8', '#c8c8c4', '#3e4a5a', '#a23a32', '#d9d4c6', '#4b6a52'];
    const parked = [[-60, 5], [-34, 5], [8, 5], [100, 5], [134, 5], [210, 5], [232, 5], [300, 5]];
    parked.forEach(([x, z], i) => {
      const c = makeCar(carCols[i % carCols.length]);
      c.position.set(x, 0, z);
      c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(c);
      this.solid(x, 0.9, z, 4.5, 1.8, 1.9, 'car', { water: true });
    });

    // 소화전
    const hy = makeHydrant();
    hy.position.set(L.siteA.hydrant[0], 0.2, L.siteA.hydrant[1]);
    hy.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(hy);
    this.solid(hy.position.x, 0.5, hy.position.z, 0.5, 1, 0.5, 'hydrant', { water: false, view: false });
    this.hydrantA = hy.position.clone();
    // 경계선 테이프 + 안전콘
    const bar = makeBarrier(22);
    bar.position.set(L.siteA.x, 0.1, -9.8);
    g.add(bar);
    for (const dx of [-14, 14]) { const c = makeCone(); c.position.set(L.siteA.x + dx, 0.1, -9.3); g.add(c); }
  }

  buildStation() {
    const g = this.out, L = LAYOUT;
    const cx = -100, cz = -30, w = 46, d = 24, h = 10;
    const body = this.building({ x: cx, z: cz, w, d, floors: 3, floorH: h / 3, wall: '#c7c9c4' });
    // 정면(+z)을 덮는 소방서 전면 패널
    const fz = cz + d / 2 + 0.02;
    const front = new THREE.MeshStandardMaterial({ map: this.stationFront(w, h), roughness: 0.8 });
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(w, h), front);
    fp.position.set(cx, h / 2, fz); fp.receiveShadow = true; g.add(fp);
    // 차고 셔터
    const sh = std('#9ea4ab', 0.5, 0.4);
    for (const x of [-115.5, -107, -98.5]) {
      this.box(g, 6.6, 5.2, 0.12, x, 2.7, fz + 0.06, sh, { cast: false });
      for (let i = 0; i < 9; i++) this.box(g, 6.6, 0.05, 0.14, x, 0.5 + i * 0.55, fz + 0.1, std('#7b8087', 0.5, 0.4), { cast: false });
    }
    // 지붕 간판
    const sign = new THREE.MeshStandardMaterial({ map: labelTexture('119  소방서', { w: 768, h: 160, bg: '#b4231b', fg: '#fff', font: 'bold 92px sans-serif' }), roughness: 0.5, emissive: '#661510', emissiveIntensity: 0.5 });
    this.box(g, 14, 2.4, 0.4, -107, h + 1.8, fz, sign, { round: 0.05 });
    // 호스 건조탑
    this.box(g, 5, 18, 5, -75, 9, -34, std('#b9b6ae', 0.85), { solid: true, tag: 'building' });
    this.box(g, 5.2, 0.6, 5.2, -75, 18.2, -34, std('#8e8b85', 0.9));
    // 출입문 / 안내
    this.box(g, 2.2, 3.0, 0.2, -88, 1.6, fz + 0.1, std('#2b3944', 0.2, 0.5), { cast: false });
    this.box(g, 2.6, 0.25, 0.4, -88, 3.3, fz + 0.2, std('#d6d4cd', 0.8), { cast: false });

    // 장비 테이블
    const T = LAYOUT.table;
    this.box(g, 12, 0.08, 1.3, T[0], 0.92, T[1], std('#7a6a55', 0.6), { solid: true, round: 0.02, tag: 'table' });
    for (const dx of [-5.6, 5.6]) for (const dz of [-0.5, 0.5]) this.box(g, 0.1, 0.9, 0.1, T[0] + dx, 0.45, T[1] + dz, PM.grey);
    this.hubTable = new THREE.Vector3(T[0], 0.96, T[1]);

    // 출동 상황판
    const B = LAYOUT.board;
    const boardMat = new THREE.MeshStandardMaterial({
      map: canvasTexture(THREE, 512, 320, (c, W, H) => {
        c.fillStyle = '#12202e'; c.fillRect(0, 0, W, H);
        c.fillStyle = '#c8281f'; c.fillRect(0, 0, W, 64);
        c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('출동 상황판', W / 2, 34);
        c.fillStyle = '#9fd0ff'; c.font = '30px sans-serif';
        c.fillText('E 키로 임무 선택', W / 2, 130);
        c.fillStyle = '#ffd84a'; c.font = 'bold 28px sans-serif'; c.fillText('119  FIRE HERO', W / 2, 200);
        c.strokeStyle = '#2d4a63'; c.lineWidth = 4; c.strokeRect(8, 8, W - 16, H - 16);
      }), roughness: 0.4, emissive: '#1a3550', emissiveIntensity: 0.6,
    });
    this.box(g, 3.6, 2.3, 0.14, B[0], 2.3, B[1], boardMat, { cast: true });
    for (const dx of [-1.6, 1.6]) this.box(g, 0.14, 3.4, 0.14, B[0] + dx, 1.7, B[1], PM.grey);
    this.solid(B[0], 1, B[1], 3.6, 2, 0.4, 'board', { water: false, view: false });
    this.boardPos = new THREE.Vector3(B[0], 0, B[1]);

    // 국기게양대 / 화단
    this.box(g, 0.12, 9, 0.12, -80, 4.5, -12.5, PM.silver);
    this.sites.station = { cx, cz };
  }

  stationFront(w, h) {
    return canvasTexture(THREE, 1024, 256, (c, W, H) => {
      c.fillStyle = '#c9cbc6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#b4231b'; c.fillRect(0, 0, W, 22);
      c.fillStyle = '#e6e6e2'; c.fillRect(0, H - 14, W, 14);
      c.fillStyle = 'rgba(0,0,0,.08)';
      for (let i = 0; i < 1024; i += 64) c.fillRect(i, 0, 2, H);
      // 오른쪽 창문들
      for (let i = 0; i < 4; i++) {
        c.fillStyle = '#5c7385'; c.fillRect(640 + 20 + i * 90, 30, 60, 66);
        c.fillStyle = '#5c7385'; c.fillRect(640 + 20 + i * 90, 140, 60, 66);
        c.fillStyle = '#dedcd5'; c.fillRect(640 + 48 + i * 90, 30, 4, 66); c.fillRect(640 + 48 + i * 90, 140, 4, 66);
      }
    });
  }

  buildSiteA() {
    const g = this.out, A = LAYOUT.siteA;
    const b = this.building({ x: A.x, z: A.z, w: A.w, d: A.d, floors: A.floors, floorH: A.floorH, wall: '#b79680' });
    b.bw = 8;
    this.siteA = b;
    const front = A.z + A.d / 2;
    // 그을음
    const soot = canvasTexture(THREE, 128, 256, (c, W, H) => {
      const gr = c.createRadialGradient(W / 2, H * 0.78, 4, W / 2, H * 0.55, H * 0.6);
      gr.addColorStop(0, 'rgba(8,7,6,.85)'); gr.addColorStop(0.6, 'rgba(8,7,6,.45)'); gr.addColorStop(1, 'rgba(8,7,6,0)');
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
    });
    soot.colorSpace = THREE.SRGBColorSpace;
    this.siteA.fireSlots = [
      { bay: 1, floor: 1 }, { bay: 3, floor: 1 }, { bay: 5, floor: 0 }, { bay: 6, floor: 1 }, { bay: 2, floor: 2 },
    ].map((s) => {
      const p = this.windowPos(b, s.bay, s.floor);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 5.2), new THREE.MeshBasicMaterial({ map: soot, transparent: true, depthWrite: false }));
      m.position.set(p.x, p.y + 1.6, front + 0.04); g.add(m);
      return new THREE.Vector3(p.x, p.y - 0.5, front + 0.75);
    });
  }

  buildSiteB() {
    const g = this.out, B = LAYOUT.siteB;
    const b = this.building({ x: B.x, z: B.z, w: B.w, d: B.d, floors: B.floors, floorH: B.floorH, wall: '#c9c2b4', variant: 1 });
    this.siteB = b;
    const front = B.z + B.d / 2;
    // 출입구
    this.box(g, 3.2, 3.0, 0.4, B.x, 1.5, front + 0.1, std('#20282e', 0.5, 0.2));
    this.box(g, 2.4, 2.6, 0.12, B.x, 1.3, front + 0.34, std('#6f93aa', 0.1, 0.6, { emissive: '#e8c068', emissiveIntensity: 0.25 }));
    const sign = new THREE.MeshStandardMaterial({ map: labelTexture('행복아파트 101동', { w: 640, h: 96, bg: '#274257', fg: '#fff', font: 'bold 50px sans-serif' }), roughness: 0.5 });
    this.box(g, 7, 1.05, 0.2, B.x, 4.3, front + 0.2, sign);
    this.doorB = new THREE.Vector3(B.x, 0, front + 1.6);
  }

  buildSiteC() {
    const g = this.out, C = LAYOUT.siteC;
    const b = this.building({ x: C.x, z: C.z, w: C.w, d: C.d, floors: C.floors, floorH: C.floorH, wall: '#a9a39a' });
    this.siteC = b;
    const front = C.z + C.d / 2;
    this.box(g, 14, 3.4, 0.2, C.x, 1.85, front + 0.1, std('#26343f', 0.12, 0.7));
    this.box(g, 2.2, 2.8, 0.12, C.x, 1.45, front + 0.25, std('#7aa0b4', 0.1, 0.6, { emissive: '#ffd890', emissiveIntensity: 0.35 }));
    const sign = new THREE.MeshStandardMaterial({ map: labelTexture('한솥 분식 · 식당', { w: 640, h: 96, bg: '#7a2b21', fg: '#fff3d6', font: 'bold 50px sans-serif' }), roughness: 0.5, emissive: '#3a120c', emissiveIntensity: 0.5 });
    this.box(g, 8, 1.1, 0.25, C.x, 4.0, front + 0.18, sign);
    this.doorC = new THREE.Vector3(C.x, 0, front + 1.6);
  }

  buildCity() {
    const g = this.out;
    const walls = ['#a99f92', '#8f9aa0', '#b7a791', '#9aa08f', '#b09a94', '#c0bbb0'];
    let x = -150;
    let i = 0;
    while (x < 360) {
      const w = rand(16, 30), d = rand(14, 22), floors = 3 + ((i * 7) % 7);
      this.building({ x: x + w / 2, z: 34 + d / 2 + rand(0, 6), w, d, floors, floorH: 3.4, wall: walls[i % walls.length], variant: i % 3 === 0 ? 1 : 0 });
      x += w + rand(3, 8);
      i++;
    }
    x = -150; i = 0;
    while (x < 360) {
      const w = rand(18, 32), d = rand(14, 22), floors = 4 + ((i * 5) % 9);
      const cx = x + w / 2;
      const skip = (cx > -128 && cx < -70) || (cx > 38 && cx < 86) || (cx > 150 && cx < 194) || (cx > 262 && cx < 292);
      if (!skip) this.building({ x: cx, z: -62 - d / 2, w, d, floors, floorH: 3.4, wall: walls[(i + 2) % walls.length], variant: i % 2 });
      x += w + rand(3, 7);
      i++;
    }
  }

  placeTruck(x, z, yaw = 0) {
    this.truck.position.set(x, 0, z);
    this.truck.rotation.y = yaw;
    const s = this.truck.userData.size;
    const b = this.truckSolid.box;
    b.min.set(x - s.w / 2, 0, z - s.d / 2);
    b.max.set(x + s.w / 2, s.h, z + s.d / 2);
  }

  // ═════════════════ 실내 B: 연기 가득한 공동주택 ═════════════════
  buildSmokeInterior() {
    const grp = new THREE.Group();
    this.scene.add(grp);
    const O = LAYOUT.interiorB;
    const I = (this.intB = { group: grp, O: new THREE.Vector3(...O), furniture: [], lamps: [] });
    const wallMat = new THREE.MeshStandardMaterial({ map: tiled(plasterTex('#c9c1b1'), 4, 1), roughness: 0.95 });
    const wallMat2 = new THREE.MeshStandardMaterial({ map: tiled(plasterTex('#c9c1b1'), 2, 1), roughness: 0.95 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tiled(woodTex(), 8, 8), roughness: 0.6 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: '#cfc9be', roughness: 0.95, side: THREE.DoubleSide });
    const H = 2.75;
    const wx = (x) => O[0] + x, wz = (z) => O[2] + z;
    const wall = (x0, z0, x1, z1, y0 = 0, y1 = H, mat = wallMat, thick = 0.28) => {
      const w = Math.abs(x1 - x0) + (x0 === x1 ? thick : 0), d = Math.abs(z1 - z0) + (z0 === z1 ? thick : 0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      this.box(grp, w, y1 - y0, d, wx(cx), (y0 + y1) / 2, wz(cz), x0 === x1 ? wallMat2 : mat, { solid: true, tag: 'wall' });
    };
    // 바닥/천장
    const fl = this.mesh(grp, new THREE.PlaneGeometry(22, 30), floorMat, wx(0), 0.01, wz(9), { cast: false }); fl.rotation.x = -Math.PI / 2;
    const ce = this.mesh(grp, new THREE.PlaneGeometry(22, 30), ceilMat, wx(0), H, wz(9)); ce.rotation.x = Math.PI / 2;
    this.solid(wx(0), H + 0.2, wz(9), 24, 0.4, 32, 'ceiling', { water: true });
    // 외곽
    wall(-11, 0, -11, 24); wall(11, 0, 11, 24); wall(-11, 24, 11, 24);
    wall(-11, 0, -1.2, 0); wall(1.2, 0, 11, 0);
    wall(-1.2, 0, 1.2, 0, 2.2, H);
    // 복도 벽 (좌: x=-2, 우: x=2)
    wall(-2, 0, -2, 7.4); wall(-2, 8.6, -2, 22); wall(-2, 7.4, -2, 8.6, 2.15, H);
    wall(2, 0, 2, 14.4); wall(2, 15.6, 2, 22); wall(2, 14.4, 2, 15.6, 2.15, H);
    wall(-2, 22, 2, 22);
    // 방 A (거실)
    wall(-10, 4, -2, 4); wall(-10, 12, -2, 12); wall(-10, 4, -10, 12);
    // 방 B (침실)
    wall(2, 10, 10, 10); wall(2, 22, 10, 22); wall(10, 10, 10, 22);
    // 비상구 및 외부 밝기
    const outside = this.mesh(grp, new THREE.PlaneGeometry(2.4, 2.2), new THREE.MeshBasicMaterial({ color: '#fff0d8' }), wx(0), 1.1, wz(-0.4), { cast: false });
    outside.rotation.y = Math.PI;
    this.solid(wx(0), 1.6, wz(-0.9), 3.0, 3.2, 0.6, 'exitblock', { water: false });
    this.mesh(grp, new THREE.BoxGeometry(2.4, 2.2, 0.1), new THREE.MeshBasicMaterial({ color: '#fff0d8' }), wx(0), 1.1, wz(-0.6), { cast: false });
    const exit = new THREE.MeshStandardMaterial({ map: labelTexture('비상구', { w: 256, h: 96, bg: '#0f7d3d', fg: '#fff', font: 'bold 56px sans-serif' }), emissive: '#14a85a', emissiveIntensity: 1.2, roughness: 0.4 });
    this.box(grp, 0.9, 0.34, 0.06, wx(0), 2.5, wz(0.2), exit, { cast: false });
    // 방 A 가구 (거실)
    const sofaMat = std('#6a5648', 0.9), tableMat = std('#4f3b2c', 0.6), fab = std('#8a7a68', 0.95);
    const fur = (w, h, d, x, y, z, mat, tag = 'furniture') => this.box(grp, w, h, d, wx(x), y, wz(z), mat, { solid: true, round: 0.04, tag, water: false, view: false });
    fur(2.0, 0.55, 0.9, -8.9, 0.28, 8, sofaMat); fur(2.0, 0.45, 0.2, -9.45, 0.7, 8, sofaMat);
    fur(1.1, 0.4, 0.6, -6.4, 0.2, 8, tableMat);
    fur(1.6, 0.5, 0.45, -9.5, 0.25, 5.2, tableMat);
    this.box(grp, 1.0, 0.6, 0.06, wx(-9.82), 0.95, wz(5.2), std('#0b0c0e', 0.2, 0.4), { cast: false });
    fur(0.5, 1.7, 0.5, -3.2, 0.85, 11.2, std('#5a4635', 0.7));
    // 복도 소품
    fur(0.9, 0.5, 0.35, -1.5, 0.25, 3.2, std('#5b4a3a', 0.7));
    // 방 B 가구
    fur(2.0, 0.5, 1.7, 8.6, 0.25, 17.6, std('#9aa6b8', 0.9)); // 침대
    fur(1.9, 0.18, 0.4, 8.6, 0.65, 18.65, std('#dfe3ea', 0.9)); // 베개
    fur(1.6, 2.1, 0.55, 5.2, 1.05, 21.55, std('#6b5441', 0.7)); // 옷장
    fur(0.9, 0.6, 0.5, 9.6, 0.3, 13.2, tableMat);
    this.burnChair = this.box(grp, 1.1, 0.5, 1.0, wx(4.3), 0.25, wz(12.6), std('#3a2a22', 0.9), { round: 0.05, cast: true });
    // 문 (방 B: 열기가 느껴지는 닫힌 문)
    const doorMat = std('#8d6a49', 0.6);
    const leaf = new THREE.Group();
    leaf.position.set(wx(2), 0, wz(14.4));
    const door = this.mesh(leaf, new THREE.BoxGeometry(0.07, 2.1, 1.2), doorMat, 0, 1.05, 0.6, {});
    this.mesh(leaf, new THREE.SphereGeometry(0.045, 10, 8), PM.silver, 0.08, 1.0, 1.05, { cast: false });
    grp.add(leaf);
    I.doorB = { leaf, door, solid: this.solid(wx(2), 1.05, wz(15), 0.3, 2.1, 1.2, 'door'), open: false, pos: new THREE.Vector3(wx(2), 0, wz(15)), hotGlow: null };
    // 문 틈 열기 표시(발광 라인)
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.1, 0.03), new THREE.MeshBasicMaterial({ color: '#ff5a1c', transparent: true, opacity: 0.0 }));
    glow.position.set(wx(1.86), 1.05, wz(15.62)); grp.add(glow);
    I.doorB.hotGlow = glow;
    // 방 A 문턱 표시
    I.roomA = { center: new THREE.Vector3(wx(-6), 0, wz(8)), mark: null };
    // 좌표 변환 도우미
    I.p = (x, y, z) => new THREE.Vector3(wx(x), y, wz(z));
    I.spawn = I.p(0, 0, 2.2);
    I.exit = I.p(0, 0, 0.5);
    I.fireSpot = I.p(4.3, 0.2, 12.6);
    I.survivorSpot = I.p(8.2, 0, 19.7);
    I.smokeAt = [I.p(0, 2.2, 6), I.p(0, 2.2, 14), I.p(0, 2.2, 20), I.p(-6, 2.2, 8), I.p(6, 2.2, 16), I.p(6, 2.2, 12)];
    grp.visible = false;
  }

  // ═════════════════ 실내 C: 식당 (초기 소화 훈련) ═════════════════
  buildShop() {
    const grp = new THREE.Group();
    this.scene.add(grp);
    const O = LAYOUT.interiorC;
    const I = (this.intC = { group: grp, O: new THREE.Vector3(...O), lamps: [] });
    const H = 3.2;
    const wx = (x) => O[0] + x, wz = (z) => O[2] + z;
    const wallMat = new THREE.MeshStandardMaterial({ map: tiled(plasterTex('#d8cfbd'), 4, 1), roughness: 0.95 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tiled(tileTex(), 7, 6), roughness: 0.5 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: '#e2ddd2', roughness: 0.95, side: THREE.DoubleSide });
    const fl = this.mesh(grp, new THREE.PlaneGeometry(17, 12), floorMat, wx(0), 0.01, wz(5.5), { cast: false }); fl.rotation.x = -Math.PI / 2;
    const ce = this.mesh(grp, new THREE.PlaneGeometry(17, 12), ceilMat, wx(0), H, wz(5.5)); ce.rotation.x = Math.PI / 2;
    this.solid(wx(0), H + 0.2, wz(5.5), 19, 0.4, 14, 'ceiling');
    const wall = (x0, z0, x1, z1, y0 = 0, y1 = H) => {
      const w = Math.abs(x1 - x0) + (x0 === x1 ? 0.28 : 0), d = Math.abs(z1 - z0) + (z0 === z1 ? 0.28 : 0);
      this.box(grp, w, y1 - y0, d, wx((x0 + x1) / 2), (y0 + y1) / 2, wz((z0 + z1) / 2), wallMat, { solid: true, tag: 'wall' });
    };
    wall(-8, 0, -8, 11); wall(8, 0, 8, 11); wall(-8, 11, 8, 11); wall(-8, 0, -1.2, 0); wall(1.2, 0, 8, 0); wall(-1.2, 0, 1.2, 0, 2.3, H);
    const outside = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 0.1), new THREE.MeshBasicMaterial({ color: '#fff0d8' }));
    outside.position.set(wx(0), 1.15, wz(-0.5)); grp.add(outside);
    this.solid(wx(0), 1.6, wz(-0.9), 3.0, 3.2, 0.6, 'exitblock', { water: false });
    const exit = new THREE.MeshStandardMaterial({ map: labelTexture('비상구', { w: 256, h: 96, bg: '#0f7d3d', fg: '#fff', font: 'bold 56px sans-serif' }), emissive: '#14a85a', emissiveIntensity: 1.2 });
    this.box(grp, 0.9, 0.34, 0.06, wx(0), 2.7, wz(0.2), exit, { cast: false });
    // 조명
    for (const [x, z] of [[-3.5, 3], [3.5, 3], [-3.5, 8], [3.5, 8]]) {
      this.box(grp, 1.4, 0.06, 0.5, wx(x), H - 0.04, wz(z), std('#fff6dc', 0.3, 0, { emissive: '#fff0c8', emissiveIntensity: 1.6 }), { cast: false });
      I.lamps.push({ pos: new THREE.Vector3(wx(x), H - 0.5, wz(z)), color: '#ffe8c0', intensity: 9, distance: 12 });
    }
    const fur = (w, h, d, x, y, z, mat, tag = 'furniture') => this.box(grp, w, h, d, wx(x), y, wz(z), mat, { solid: true, round: 0.03, tag, water: false, view: false });
    const steel = std('#aab0b6', 0.35, 0.8), wood = std('#6b4a30', 0.6), red = std('#b4231b', 0.45, 0.2), black = std('#16181b', 0.5, 0.3);
    // 주방
    fur(11, 0.9, 0.8, -2.5, 0.45, 10.4, steel);
    fur(1.6, 0.18, 0.7, -4.3, 0.99, 10.4, black); // 가스레인지
    this.box(grp, 1.8, 0.7, 0.8, wx(-4.3), 2.2, wz(10.5), steel, { cast: true }); // 후드
    this.box(grp, 0.5, 0.1, 0.5, wx(-4.3), 1.12, wz(10.3), black); // 프라이팬
    this.box(grp, 0.7, 0.06, 0.06, wx(-3.8), 1.12, wz(10.3), black);
    fur(4.5, 0.9, 0.9, 1.5, 0.45, 8.4, steel);
    this.box(grp, 4.5, 0.12, 2.0, wx(-1), 1.7, wz(10.9), wood, {});
    // 식탁
    for (const [x, z] of [[3.5, 4.2], [3.5, 6.4], [-2.6, 5.2], [-5.6, 5.2]]) {
      fur(1.4, 0.75, 0.9, x, 0.38, z, wood);
      for (const dz of [-0.85, 0.85]) fur(0.45, 0.45, 0.45, x, 0.23, z + dz, std('#8a3a2b', 0.8), 'chair');
    }
    // 쓰레기통 (A급)
    this.box(grp, 0.5, 0.6, 0.5, wx(6.4), 0.3, wz(2.6), std('#3a3f45', 0.5, 0.4), { round: 0.04 });
    this.box(grp, 0.9, 0.5, 0.2, wx(6.0), 0.25, wz(2.6), std('#e8e4d8', 0.9), { cast: false });
    // 분전반 (C급)
    this.box(grp, 0.12, 0.9, 0.7, wx(-7.88), 1.45, wz(5.8), std('#6a727a', 0.4, 0.6), { solid: false });
    this.box(grp, 0.06, 0.6, 0.5, wx(-7.8), 1.45, wz(5.8), std('#aab2ba', 0.4, 0.5));
    this.box(grp, 0.05, 0.12, 0.25, wx(-7.77), 1.6, wz(5.8), std('#e8c32a', 0.5));
    // 소화기 / 옥내소화전
    this.box(grp, 0.9, 0.14, 0.3, wx(7.7), 0.9, wz(1.6), std('#d6d4cd', 0.8), { cast: false });
    this.extStand = new THREE.Group();
    this.extStand.position.set(wx(7.55), 0, wz(1.6)); grp.add(this.extStand);
    add(this.extStand, new THREE.CylinderGeometry(0.075, 0.075, 0.42, 18), PM.red, 0, 0.62, 0);
    add(this.extStand, new THREE.SphereGeometry(0.075, 14, 8), PM.red, 0, 0.84, 0);
    add(this.extStand, new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), PM.black, 0, 0.9, 0);
    const extSign = new THREE.MeshStandardMaterial({ map: labelTexture('소화기', { w: 256, h: 96, bg: '#c8281f', fg: '#fff', font: 'bold 54px sans-serif' }), roughness: 0.5 });
    this.box(grp, 0.5, 0.2, 0.04, wx(7.9), 1.55, wz(1.6), extSign, { cast: false });
    const cab = new THREE.MeshStandardMaterial({ map: labelTexture('옥내소화전', { w: 256, h: 340, bg: '#b4231b', fg: '#fff', font: 'bold 44px sans-serif' }), roughness: 0.5 });
    this.box(grp, 0.28, 1.2, 0.7, wx(7.8), 1.35, wz(5.0), cab, { solid: false });
    this.box(grp, 0.3, 0.05, 0.05, wx(7.78), 1.0, wz(5.0), PM.silver);
    I.p = (x, y, z) => new THREE.Vector3(wx(x), y, wz(z));
    I.spawn = I.p(0, 0, 2.0);
    I.exit = I.p(0, 0, 0.5);
    I.extPos = I.p(7.1, 0, 1.6);
    I.hosePos = I.p(7.2, 0, 5.0);
    I.fires = [
      { id: 'trash', type: 'A', pos: I.p(6.4, 0.55, 2.6), size: 0.55, hp: 70, label: '쓰레기통 화재 (일반화재 · A급)' },
      { id: 'oil', type: 'B', pos: I.p(-4.3, 1.2, 10.3), size: 0.5, hp: 80, label: '주방 식용유 화재 (유류화재 · B/K급)' },
      { id: 'elec', type: 'C', pos: I.p(-7.4, 1.35, 5.8), size: 0.4, hp: 70, label: '분전반 화재 (전기화재 · C급)' },
    ];
    grp.visible = false;
  }
}
