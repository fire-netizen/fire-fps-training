// 내비게이션 안내: 현재 퀘스트 목적지(markerTarget)까지 바닥에 녹색 화살표를 이어서 표시한다.
// - 기존 퀘스트/미션 시스템은 그대로 두고, 목적지 정보(markerTarget)만 읽어 쓴다.
// - 건물·차량·가구 등 고체를 피하는 경로를 격자 A* 로 계산하고, 플레이어가 경로를 벗어나면 현재 위치에서 다시 계산한다.
// - 소방차 운전 구간·모달 창·목적지 근처에서는 숨긴다. N 키(터치: 길안내 버튼)로 켜고 끈다.
import * as THREE from 'three';

const MAX_ARROWS = 28;      // 한 번에 보이는 화살표 수 (화면을 가리지 않도록)
const SPACING = 2.6;        // 화살표 간격(m)
const SHOW_AHEAD = 62;      // 플레이어 앞쪽으로 보여 주는 길이(m)
const ARRIVE = 3.2;         // 이 거리 안으로 들어오면 안내 종료
const MARGIN = 0.5;         // 고체와의 여유(플레이어 반경 + 여유)
const SKIP_TAGS = new Set(['ceiling', 'door', 'exitblock', 'person']);

// ── 경로 계산 ────────────────────────────────────────────────
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, v) {
    const a = this.a; a.push([f, v]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

// world.solids 중 걸어 다니는 높이에서 길을 막는 상자만 추려 격자로 길찾기
export function planPath(world, ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az);
  const cs = dist > 90 ? 1.0 : dist > 30 ? 0.7 : 0.5;
  const pad = Math.max(10, Math.min(24, dist * 0.35));
  const minx = Math.min(ax, bx) - pad, maxx = Math.max(ax, bx) + pad;
  const minz = Math.min(az, bz) - pad, maxz = Math.max(az, bz) + pad;
  const boxes = [];
  for (const s of world.solids) {
    if (!s.active || SKIP_TAGS.has(s.tag)) continue;
    const b = s.box;
    if (b.max.y < 0.3 || b.min.y > 1.5) continue;
    if (b.max.x < minx || b.min.x > maxx || b.max.z < minz || b.min.z > maxz) continue;
    boxes.push(b);
  }
  const nx = Math.ceil((maxx - minx) / cs) + 1, nz = Math.ceil((maxz - minz) / cs) + 1;
  const px = (i) => minx + i * cs, pz = (j) => minz + j * cs;
  const blockedPt = (x, z) => {
    for (const b of boxes) if (x > b.min.x - MARGIN && x < b.max.x + MARGIN && z > b.min.z - MARGIN && z < b.max.z + MARGIN) return true;
    return false;
  };
  const cache = new Int8Array(nx * nz); // 0 미확인, 1 통과, 2 막힘
  const free = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
    const k = j * nx + i;
    if (cache[k] === 0) cache[k] = blockedPt(px(i), pz(j)) ? 2 : 1;
    return cache[k] === 1;
  };
  const clampI = (v, n) => Math.max(0, Math.min(n - 1, v));
  let si = clampI(Math.round((ax - minx) / cs), nx), sj = clampI(Math.round((az - minz) / cs), nz);
  let ei = clampI(Math.round((bx - minx) / cs), nx), ej = clampI(Math.round((bz - minz) / cs), nz);
  // 시작 칸은 항상 통과 가능(벽에 붙어 있어도 출발), 목적지가 막혀 있으면 가장 가까운 빈 칸으로
  cache[sj * nx + si] = 1;
  if (!free(ei, ej)) {
    let best = null, bd = 1e9;
    const R = Math.ceil(7 / cs);
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      if (!free(ei + di, ej + dj)) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = [ei + di, ej + dj]; }
    }
    if (!best) return null;
    [ei, ej] = best;
  }
  const g = new Float32Array(nx * nz).fill(1e9), from = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz);
  const heap = new Heap(); g[sj * nx + si] = 0; heap.push(0, sj * nx + si);
  const H = (i, j) => Math.hypot(i - ei, j - ej);
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false, guard = 0;
  while (heap.size && guard++ < 90000) {
    const k = heap.pop(); if (done[k]) continue; done[k] = 1;
    const ci = k % nx, cj = (k - ci) / nx;
    if (ci === ei && cj === ej) { found = true; break; }
    for (const [di, dj, c] of nb) {
      const ni = ci + di, nj = cj + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue; // 모서리 가로지르기 방지
      const nk = nj * nx + ni, ng = g[k] + c;
      if (ng < g[nk]) { g[nk] = ng; from[nk] = k; heap.push(ng + H(ni, nj), nk); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = ej * nx + ei; k !== -1; k = from[k]) cells.push([px(k % nx), pz(Math.floor(k / nx))]);
  cells.reverse();
  cells[0] = [ax, az];
  // 시선 확인으로 꺾이는 점만 남김
  const seg = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / (cs * 0.5)));
    for (let i = 1; i < n; i++) { const t = i / n; if (blockedPt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  };
  const out = [cells[0]];
  let cur = 0;
  while (cur < cells.length - 1) {
    let nxt = cur + 1;
    for (let k = cells.length - 1; k > cur + 1; k--) if (seg(cells[cur][0], cells[cur][1], cells[k][0], cells[k][1])) { nxt = k; break; }
    out.push(cells[nxt]); cur = nxt;
  }
  // 막힌 목적지였다면 실제 목적지까지 마지막 구간을 이어 줌(벽 너머라도 방향 안내)
  if (out[out.length - 1][0] !== bx || out[out.length - 1][1] !== bz) out.push([bx, bz]);
  return out;
}

// ── 화살표 표시 ─────────────────────────────────────────────
function chevronGeo() {
  // +Z 방향을 가리키는 납작한 쐐기(바닥에 눕힘)
  const v = [
    [0, 0.55], [0.55, -0.05], [0.55, -0.35], [0, 0.15],
    [0, 0.55], [0, 0.15], [-0.55, -0.35], [-0.55, -0.05],
  ];
  const pos = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) pos.push(v[p][0], 0, v[p][1]); };
  tri(0, 1, 2); tri(0, 2, 3); tri(4, 5, 6); tri(4, 6, 7);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Guide {
  constructor(G) {
    this.G = G;
    this.enabled = true;
    try { if (localStorage.getItem('guideOff') === '1') this.enabled = false; } catch (e) { /* ignore */ }
    const geo = chevronGeo();
    const fill = new THREE.MeshBasicMaterial({ color: '#3dff7a', transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const edge = new THREE.MeshBasicMaterial({ color: '#0a4d22', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.fill = new THREE.InstancedMesh(geo, fill, MAX_ARROWS);
    this.edge = new THREE.InstancedMesh(geo, edge, MAX_ARROWS);
    for (const m of [this.fill, this.edge]) { m.frustumCulled = false; m.count = 0; m.visible = false; m.renderOrder = 5; G.engine.scene.add(m); }
    this.edge.renderOrder = 4;
    this.poly = null; this.cum = null; this.total = 0;
    this.planT = 0; this.lastPlan = { px: 1e9, pz: 1e9, tx: 1e9, tz: 1e9 };
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('guideOff', this.enabled ? '0' : '1'); } catch (e) { /* ignore */ }
    this.G.ui.toast(this.enabled ? '길 안내 켬 (N)' : '길 안내 끔 (N)', 'info');
    if (!this.enabled) this.hide();
    return this.enabled;
  }

  hide() { this.fill.visible = this.edge.visible = false; this.fill.count = this.edge.count = 0; this.poly = null; }

  // 바닥 높이: 실외는 인도(0.2) 위 / 포장구역·도로 위, 실내는 바닥 위
  groundY(x, z) {
    const W = this.G.world;
    if (W.zone === 'outdoor') return Math.abs(z) > 7 && Math.abs(z) < 10.7 ? 0.245 : 0.15;
    return 0.07;
  }

  update(dt) {
    const G = this.G, P = G.player;
    const t = this.enabled && G.state === 'play' && !G.resolving ? G.currentMarker() : null;
    const driving = !!(P.control && P.control.opts); // 소방차 운전 구간은 숨김
    if (!t || driving || P.frozen) { this.hide(); return; }
    const tx = t.pos.x, tz = t.pos.z;
    const dd = Math.hypot(tx - P.pos.x, tz - P.pos.z);
    if (dd < ARRIVE || dd > 600) { this.hide(); return; }
    // 다른 구역(실내/실외 좌표가 멀리 떨어져 있음)에 있는 목적지는 안내하지 않음
    const needPlan = !this.poly
      || Math.hypot(tx - this.lastPlan.tx, tz - this.lastPlan.tz) > 0.6
      || this.offPath(P.pos.x, P.pos.z) > 3.0; // 경로를 3m 이상 벗어났을 때만 다시 계산
    if (needPlan) {
      this.planT = 0;
      this.lastPlan = { px: P.pos.x, pz: P.pos.z, tx, tz };
      let poly = null;
      try { poly = planPath(G.world, P.pos.x, P.pos.z, tx, tz); } catch (e) { poly = null; }
      if (!poly) poly = [[P.pos.x, P.pos.z], [tx, tz]]; // 길을 못 찾으면 직선 방향만 안내
      this.poly = poly;
      this.cum = [0];
      for (let i = 1; i < poly.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
      this.total = this.cum[this.cum.length - 1];
    }
    this.draw(P);
  }

  // 현재 위치에서 경로까지의 거리
  offPath(x, z) {
    if (!this.poly) return 0;
    let best = 1e9;
    for (let i = 1; i < this.poly.length; i++) {
      const [x0, z0] = this.poly[i - 1], [x1, z1] = this.poly[i];
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
      best = Math.min(best, Math.hypot(x - (x0 + dx * u), z - (z0 + dz * u)));
    }
    return best;
  }

  at(s) {
    const cum = this.cum, poly = this.poly;
    let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
    const seg = cum[k] - cum[k - 1] || 1, u = Math.max(0, Math.min(1, (s - cum[k - 1]) / seg));
    const x0 = poly[k - 1][0], z0 = poly[k - 1][1], x1 = poly[k][0], z1 = poly[k][1];
    return [x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, Math.atan2(x1 - x0, z1 - z0)];
  }

  draw(P) {
    // 플레이어가 경로 위 어디까지 왔는지(가장 가까운 지점의 누적 거리)
    let s0 = 0, best = 1e9;
    for (let i = 1; i < this.poly.length; i++) {
      const [x0, z0] = this.poly[i - 1], [x1, z1] = this.poly[i];
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((P.pos.x - x0) * dx + (P.pos.z - z0) * dz) / l2));
      const d = Math.hypot(P.pos.x - (x0 + dx * u), P.pos.z - (z0 + dz * u));
      if (d < best) { best = d; s0 = this.cum[i - 1] + Math.sqrt(l2) * u; }
    }
    const flow = (this.G.time * 1.6) % SPACING; // 목적지 쪽으로 흘러가는 움직임
    let n = 0;
    const end = Math.min(this.total - ARRIVE * 0.6, s0 + SHOW_AHEAD);
    for (let s = s0 + 1.6 + flow; s < end && n < MAX_ARROWS; s += SPACING, n++) {
      const [x, z, yaw] = this.at(s);
      const fade = 1 - 0.45 * ((s - s0) / SHOW_AHEAD); // 멀수록 약간 작게
      const y = this.groundY(x, z);
      this._e.set(0, yaw, 0); this._q.setFromEuler(this._e);
      this._p.set(x, y, z);
      this._s.set(fade, 1, fade); this._m.compose(this._p, this._q, this._s); this.fill.setMatrixAt(n, this._m);
      this._p.y = y - 0.006; this._s.set(fade * 1.32, 1, fade * 1.32); this._m.compose(this._p, this._q, this._s); this.edge.setMatrixAt(n, this._m);
    }
    this.fill.count = this.edge.count = n;
    this.fill.instanceMatrix.needsUpdate = this.edge.instanceMatrix.needsUpdate = true;
    this.fill.visible = this.edge.visible = n > 0;
  }
}
