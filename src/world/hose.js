// 소방호스: 소방차(또는 소화전)에서 대원 손까지 바닥에 늘어지는 호스 라인
// world 를 넘겨 주면 차량·기둥·벽 같은 고체를 돌아가는 경로를 찾아(격자 탐색) 구조물을 통과하지 않는다.
import * as THREE from 'three';

const CELL = 0.4;     // 경로 탐색 격자 간격(m)
const CLEAR = 0.26;   // 고체와의 여유(호스 반경 + 여유)
const FLOOR_Y = 0.065; // 호스 중심선 최소 높이 — 바닥(y≈0.01) 아래로 파고들지 않도록

export class HoseLine {
  constructor(scene, color = '#e0a41c', world = null) {
    this.scene = scene;
    this.world = world;
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.a = new THREE.Vector3(1e9, 0, 0);
    this.b = new THREE.Vector3(1e9, 0, 0);
    this.length = 0;
  }

  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }

  // a→b 사이를 고체를 피해 지나가는 평면(x,z) 경로. 막혀 있지 않으면 직선.
  _route(a, b) {
    const W = this.world;
    const pad = 7;
    const minx = Math.min(a.x, b.x) - pad, maxx = Math.max(a.x, b.x) + pad;
    const minz = Math.min(a.z, b.z) - pad, maxz = Math.max(a.z, b.z) + pad;
    const boxes = [];
    for (const s of W.solids) {
      if (!s.active || s.tag === 'ceiling' || s.tag === 'door' || s.tag === 'exitblock') continue;
      const bx = s.box;
      if (bx.max.y < 0.12 || bx.min.y > 0.7) continue;
      if (bx.max.x < minx || bx.min.x > maxx || bx.max.z < minz || bx.min.z > maxz) continue;
      boxes.push(bx);
    }
    if (!boxes.length) return null;
    const blockedAt = (x, z) => {
      for (const bx of boxes) if (x > bx.min.x - CLEAR && x < bx.max.x + CLEAR && z > bx.min.z - CLEAR && z < bx.max.z + CLEAR) return true;
      return false;
    };
    // 직선이 막혀 있지 않으면 경로 탐색 생략
    const segFree = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 0.15));
      for (let i = 0; i <= n; i++) { const t = i / n; if (blockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
      return true;
    };
    const nearEnd = (x, z) => Math.hypot(x - a.x, z - a.z) < 0.9 || Math.hypot(x - b.x, z - b.z) < 0.9; // 양 끝은 붙어 있는 대상이 있어도 허용
    const free = (x, z) => nearEnd(x, z) || !blockedAt(x, z);
    const segFree2 = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 0.15));
      for (let i = 0; i <= n; i++) { const t = i / n; if (!free(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
      return true;
    };
    if (segFree2(a.x, a.z, b.x, b.z)) return null;

    const nx = Math.ceil((maxx - minx) / CELL) + 1, nz = Math.ceil((maxz - minz) / CELL) + 1;
    const idx = (i, j) => j * nx + i;
    const px = (i) => minx + i * CELL, pz = (j) => minz + j * CELL;
    const si = Math.round((a.x - minx) / CELL), sj = Math.round((a.z - minz) / CELL);
    const ei = Math.round((b.x - minx) / CELL), ej = Math.round((b.z - minz) / CELL);
    const g = new Float32Array(nx * nz).fill(1e9), from = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
    const open = [[0, si, sj]]; g[idx(si, sj)] = 0;
    const H = (i, j) => Math.hypot(i - ei, j - ej);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, guard = 0;
    while (open.length && guard++ < 40000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, ci, cj] = open.splice(bi, 1)[0];
      const ck = idx(ci, cj); if (closed[ck]) continue; closed[ck] = 1;
      if (ci === ei && cj === ej) { found = true; break; }
      for (const [di, dj, c] of nb) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const k = idx(ni, nj); if (closed[k]) continue;
        if (!free(px(ni), pz(nj))) continue;
        if (di && dj && (!free(px(ci + di), pz(cj)) || !free(px(ci), pz(cj + dj)))) continue; // 모서리 가로지르기 방지
        const ng = g[ck] + c;
        if (ng < g[k]) { g[k] = ng; from[k] = ck; open.push([ng + H(ni, nj), ni, nj]); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = idx(ei, ej); k !== -1; k = from[k]) cells.push([px(k % nx), pz(Math.floor(k / nx))]);
    cells.reverse();
    cells[0] = [a.x, a.z]; cells[cells.length - 1] = [b.x, b.z];
    // 시선 기반 경로 단순화(모서리만 남김)
    const out = [cells[0]];
    let cur = 0;
    while (cur < cells.length - 1) {
      let nxt = cur + 1;
      for (let k = cells.length - 1; k > cur + 1; k--) if (segFree2(cells[cur][0], cells[cur][1], cells[k][0], cells[k][1])) { nxt = k; break; }
      out.push(cells[nxt]); cur = nxt;
    }
    return out;
  }

  update(a, b) {
    if (a.distanceToSquared(this.a) < 0.0025 && b.distanceToSquared(this.b) < 0.0025) return;
    this.a.copy(a); this.b.copy(b);
    const route = this.world ? this._route(a, b) : null;
    let poly; // [x,z] 꼭짓점들
    if (route) poly = route; else poly = [[a.x, a.z], [b.x, b.z]];
    // 경로 전체 길이와 누적 거리
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
    const dist = cum[cum.length - 1];
    this.length = dist;
    const straight = Math.hypot(b.x - a.x, b.z - a.z);
    const N = this.world ? Math.max(8, Math.min(60, Math.round(dist / 0.7))) : Math.max(6, Math.min(26, Math.round(dist / 1.4)));
    const dx = b.x - a.x, dz = b.z - a.z;
    const nx = straight > 0.01 ? -dz / straight : 0, nz = straight > 0.01 ? dx / straight : 1;
    const at = (s) => { // 경로를 따라 거리 s 지점
      let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
      const t = cum[k] > cum[k - 1] ? (s - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0;
      return [poly[k - 1][0] + (poly[k][0] - poly[k - 1][0]) * Math.min(1, Math.max(0, t)), poly[k - 1][1] + (poly[k][1] - poly[k - 1][1]) * Math.min(1, Math.max(0, t))];
    };
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // 양 끝에서 지면/손높이로 부드럽게 연결, 가운데는 바닥에 늘어짐
      const near0 = Math.exp(-t * dist / 1.1), near1 = Math.exp(-(1 - t) * dist / 1.0);
      const y = 0.05 + (a.y - 0.05) * near0 + (b.y - 0.05) * near1;
      const [x, z] = at(dist * t);
      // 고체를 피해 돌아가는 경로에서는 옆으로 흔들지 않는다(구조물 침투 방지)
      const wig = route || this.world ? 0 : Math.sin(t * Math.PI * (dist / 7)) * Math.min(1.2, dist * 0.04) * Math.sin(t * Math.PI);
      pts.push(new THREE.Vector3(x + nx * wig, Math.max(FLOOR_Y, y), z + nz * wig));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', route ? 0.15 : 0.5);
    const geo = new THREE.TubeGeometry(curve, Math.max(10, N * 3), 0.045, 6, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
