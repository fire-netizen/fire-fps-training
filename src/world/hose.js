// 소방호스: 소방차(또는 소화전)에서 대원 손까지 바닥에 늘어지는 호스 라인
import * as THREE from 'three';

export class HoseLine {
  constructor(scene, color = '#e0a41c') {
    this.scene = scene;
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

  update(a, b) {
    if (a.distanceToSquared(this.a) < 0.0025 && b.distanceToSquared(this.b) < 0.0025) return;
    this.a.copy(a); this.b.copy(b);
    const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz);
    this.length = dist;
    const N = Math.max(6, Math.min(26, Math.round(dist / 1.4)));
    const pts = [];
    const nx = dist > 0.01 ? -dz / dist : 0, nz = dist > 0.01 ? dx / dist : 1;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // 양 끝에서 지면/손높이로 부드럽게 연결, 가운데는 바닥에 늘어짐
      const near0 = Math.exp(-t * dist / 1.1), near1 = Math.exp(-(1 - t) * dist / 1.0);
      const y = 0.05 + (a.y - 0.05) * near0 + (b.y - 0.05) * near1;
      const wig = Math.sin(t * Math.PI * (dist / 7)) * Math.min(1.2, dist * 0.04) * Math.sin(t * Math.PI);
      pts.push(new THREE.Vector3(a.x + dx * t + nx * wig, y, a.z + dz * t + nz * wig));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
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
