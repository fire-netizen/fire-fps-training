// 날씨: 플레이 시점의 서울 현재 날씨(맑음 / 어두움 / 비 / 눈)를 실외 하늘·조명·입자에 반영
import * as THREE from 'three';
import { ZONES } from '../core/engine.js';

const PRESETS = {
  clear: { label: '맑음 ☀', icon: '☀' },
  dark: { label: '어두움 ☁', fog: '#2c303c', bg: '#1c202b', density: 0.010, hemi: 0.95, sun: 0.5, hemiSky: '#7480a0', hemiGround: '#3a3a42', exposure: 1.25, sky: ['#10162a', '#262d44', '#2a2d3a'], ground: ['#8a9096', '#000000'] },
  rain: { label: '비 ☔', fog: '#7c848c', bg: '#7c848c', density: 0.0125, hemi: 0.95, sun: 0.55, hemiSky: '#8e9aa8', hemiGround: '#4a4a48', exposure: 1.0, sky: ['#5b646e', '#8a9299', '#8a9299'], ground: ['#a8aeb0', '#000000'] },
  snow: { label: '눈 ❄', fog: '#cdd5de', bg: '#cdd5de', density: 0.0115, hemi: 1.3, sun: 0.9, hemiSky: '#e2e9f2', hemiGround: '#aeb6c0', exposure: 1.0, sky: ['#a9b5c4', '#d3dae1', '#d3dae1'], ground: ['#f2f5f8', '#6d747c'] },
};
const DEF_SKY = ['#4f79b3', '#e8b78c', '#d9a888'];

function dot() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Weather {
  constructor(engine, world) {
    this.engine = engine; this.world = world;
    this.kind = 'clear'; this.info = null; this.onChange = null;
    this.N = 1800;
    this.off = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) { this.off[i * 3] = (Math.random() - 0.5) * 44; this.off[i * 3 + 1] = Math.random() * 24; this.off[i * 3 + 2] = (Math.random() - 0.5) * 44; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#b8c6d6', transparent: true, opacity: 0.55, fog: false }));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ map: dot(), size: 0.22, transparent: true, depthWrite: false, color: '#ffffff', fog: false }));
    for (const o of [this.rain, this.snow]) { o.frustumCulled = false; o.visible = false; engine.scene.add(o); }
    engine.zoneHook = (name) => this.apply(name);
    this.groundMat = world.groundMat || null;
    this.start();
  }

  async start() {
    const q = new URLSearchParams(location.search).get('weather');
    if (q && PRESETS[q]) { this.set(q, { label: PRESETS[q].label, forced: true }); return; }
    let info = null;
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4500);
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,weather_code,is_day,cloud_cover&timezone=Asia%2FSeoul', { signal: ctl.signal });
      clearTimeout(to);
      const c = (await r.json()).current;
      const code = c.weather_code;
      let kind = 'clear';
      if ([71, 73, 75, 77, 85, 86].includes(code)) kind = 'snow';
      else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) kind = 'rain';
      else if (!c.is_day || code === 3 || code === 45 || code === 48 || c.cloud_cover >= 85) kind = 'dark';
      info = { kind, temp: Math.round(c.temperature_2m), src: '서울 현재 날씨' };
    } catch (e) {
      const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date()));
      info = { kind: h >= 19 || h < 6 ? 'dark' : 'clear', temp: null, src: '서울 시각 기준(날씨 조회 실패)' };
    }
    this.set(info.kind, info);
  }

  set(kind, info = {}) {
    this.kind = PRESETS[kind] ? kind : 'clear';
    this.info = { ...info, kind: this.kind };
    this.apply(this.engine.zoneName);
    this.onChange && this.onChange(this);
  }

  text() {
    const p = PRESETS[this.kind];
    return `오늘 서울 날씨: ${p.label}${this.info && this.info.temp != null ? ` · ${this.info.temp}°C` : ''}`;
  }

  apply(zone) {
    const E = this.engine, p = PRESETS[this.kind];
    const sk = E.sky.material.uniforms;
    if (zone !== 'outdoor') { this._ground(null); return; }
    const z = ZONES.outdoor, w = this.kind === 'clear' ? z : { ...z, ...p };
    E.scene.fog.color.set(w.fog); E.fogU.uFogColor.value.set(w.fog); E.scene.background.set(w.bg);
    E.hemi.intensity = w.hemi; E.hemi.color.set(w.hemiSky); E.hemi.groundColor.set(w.hemiGround);
    E.sun.intensity = w.sun; E.renderer.toneMappingExposure = w.exposure;
    E.zone = { ...E.zone, density: w.density }; E.baseDensity = w.density; E.setDensity(w.density);
    const s = p.sky || DEF_SKY;
    sk.top.value.set(s[0]); sk.mid.value.set(s[1]); sk.bot.value.set(s[2]);
    this._ground(p.ground || null);
  }

  _ground(g) {
    const m = this.world.groundMat; if (!m) return;
    m.color.set(g ? g[0] : '#ffffff'); m.emissive.set(g ? g[1] : '#000000');
  }

  update(dt, outdoor) {
    const E = this.engine, cam = E.camera.position, k = this.kind;
    const rainOn = outdoor && k === 'rain', snowOn = outdoor && k === 'snow';
    this.rain.visible = rainOn; this.snow.visible = snowOn;
    if (!rainOn && !snowOn) return;
    const N = this.N, off = this.off;
    const spd = rainOn ? 22 : 1.7;
    const pa = (rainOn ? this.rain : this.snow).geometry.attributes.position, a = pa.array, t = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      let y = off[i * 3 + 1] - spd * dt * (rainOn ? 1 : 0.6 + (i % 5) * 0.12);
      if (y < -2) y += 24;
      off[i * 3 + 1] = y;
      let x = off[i * 3], z = off[i * 3 + 2];
      if (snowOn) { x += Math.sin(t * 0.8 + i) * dt * 0.5; off[i * 3] = x; }
      const wx = cam.x + ((x - cam.x + 66) % 44 + 44) % 44 - 22, wz = cam.z + ((z - cam.z + 66) % 44 + 44) % 44 - 22;
      const wy = cam.y - 4 + y;
      if (rainOn) { a[i * 6] = wx; a[i * 6 + 1] = wy; a[i * 6 + 2] = wz; a[i * 6 + 3] = wx - 0.06; a[i * 6 + 4] = wy + 0.7; a[i * 6 + 5] = wz; }
      else { a[i * 3] = wx; a[i * 3 + 1] = wy; a[i * 3 + 2] = wz; }
    }
    pa.needsUpdate = true;
  }
}
