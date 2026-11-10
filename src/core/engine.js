// 렌더러 · 카메라 · 조명 · 하늘 · 안개 · 동적 조명 풀
import * as THREE from 'three';
import { IS_TOUCH } from './device.js';

export const ZONES = {
  outdoor: { fog: '#c7a58c', density: 0.0072, hemi: 1.25, sun: 2.7, bg: '#c7a58c', hemiSky: '#a9bfe0', hemiGround: '#5a4a3c', exposure: 1.05 },
  smoky: { fog: '#14110f', density: 0.1, hemi: 0.32, sun: 0.0, bg: '#0c0a09', hemiSky: '#6a625a', hemiGround: '#2a2320', exposure: 1.2 },
  lab: { fog: '#26282b', density: 0.010, hemi: 1.0, sun: 0.0, bg: '#1c1e21', hemiSky: '#dfe4ea', hemiGround: '#6a665e', exposure: 1.1 },
  shop: { fog: '#2c2824', density: 0.012, hemi: 0.95, sun: 0.0, bg: '#201d1a', hemiSky: '#d9cdb8', hemiGround: '#6a5a48', exposure: 1.1 },
};

export class Engine {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.25 : 1.75));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.append(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 700);
    this.scene.add(this.camera);

    this.fogU = { uFogColor: { value: new THREE.Color(ZONES.outdoor.fog) }, uFogDensity: { value: ZONES.outdoor.density } };
    this.scene.fog = new THREE.FogExp2(ZONES.outdoor.fog, ZONES.outdoor.density);
    this.scene.background = new THREE.Color(ZONES.outdoor.bg);

    this.hemi = new THREE.HemisphereLight('#a9bfe0', '#5a4a3c', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd9a8', 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    Object.assign(sc, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 220 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sunOffset = new THREE.Vector3(-55, 85, 45);
    this.scene.add(this.sun, this.sun.target);

    // 동적 조명 풀 (화재 불빛 + 헬멧 랜턴). 개수가 바뀌면 셰이더가 재컴파일되므로 항상 고정.
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ff7a2a', 0, 18, 1.5);
      this.scene.add(l);
      this.pool.push(l);
    }

    this._buildSky();
    this.zoneName = 'outdoor';
    addEventListener('resize', () => this.resize());
  }

  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#4f79b3') }, mid: { value: new THREE.Color('#e8b78c') }, bot: { value: new THREE.Color('#d9a888') },
        sunDir: { value: new THREE.Vector3(-0.55, 0.38, 0.45).normalize() },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir;
        void main(){
          float h = clamp(vP.y, -0.2, 1.0);
          vec3 c = mix(bot, mid, smoothstep(-0.15, 0.1, h));
          c = mix(c, top, smoothstep(0.05, 0.7, h));
          float s = max(dot(normalize(vP), sunDir), 0.0);
          c += vec3(1.0, 0.72, 0.4) * (pow(s, 28.0) * 0.55 + pow(s, 400.0) * 1.6);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  setZone(name) {
    const z = ZONES[name];
    this.zoneName = name;
    this.zone = z;
    this.baseDensity = z.density;
    this.scene.fog.color.set(z.fog);
    this.fogU.uFogColor.value.set(z.fog);
    this.scene.background.set(z.bg);
    this.hemi.intensity = z.hemi;
    this.hemi.color.set(z.hemiSky);
    this.hemi.groundColor.set(z.hemiGround);
    this.sun.intensity = z.sun;
    this.renderer.toneMappingExposure = z.exposure;
    this.sky.visible = name === 'outdoor';
    this.setDensity(z.density);
  }

  setDensity(d) {
    this.scene.fog.density = d;
    this.fogU.uFogDensity.value = d;
  }

  // 그림자 카메라가 대상을 따라다니게
  follow(p) {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).add(this.sunOffset);
    this.sky.position.copy(this.camera.position);
  }

  // 화재/랜턴 광원 할당. sources: [{pos, color, intensity, distance}]
  assignLights(sources, focus) {
    const cand = sources
      .filter((s) => s.intensity > 0.01)
      .map((s) => ({ s, d: s.pos.distanceToSquared(focus) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      const c = cand[i];
      if (!c) { l.intensity = 0; continue; }
      l.position.copy(c.s.pos);
      l.color.set(c.s.color || '#ff7a2a');
      l.intensity = c.s.intensity;
      l.distance = c.s.distance || 16;
    }
  }

  pixelScale() {
    return this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
