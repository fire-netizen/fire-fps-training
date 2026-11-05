// 외부 이미지 없이 캔버스로 만드는 절차적 텍스처 (저작권/용량 문제 없음)
import * as THREE from 'three';
import { canvasTexture, rand } from '../core/util.js';

function finish(t, rx = 1, ry = 1, repeat = true) {
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

function speckle(g, w, h, n, palette, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = palette[(Math.random() * palette.length) | 0];
    const r = rand(rmin, rmax);
    g.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
}

const cache = {};
const memo = (k, f) => (cache[k] ||= f());

export const asphaltTex = () => memo('asphalt', () => canvasTexture(THREE, 256, 256, (g, w, h) => {
  g.fillStyle = '#3a3f44'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 5000, ['#2f3438', '#454a50', '#50565c', '#2a2e32'], 1, 2.4);
  g.strokeStyle = 'rgba(20,22,24,.5)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
}));

export const roadTex = () => memo('road', () => canvasTexture(THREE, 1024, 448, (g, w, h) => {
  g.fillStyle = '#3a3f44'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 16000, ['#2f3438', '#454a50', '#50565c', '#2a2e32'], 1, 3);
  g.fillStyle = 'rgba(15,17,19,.25)';
  for (let i = 0; i < 6; i++) g.fillRect(0, h * 0.28 + i * 3, w, 40 + rand(0, 20));
  g.fillStyle = '#e8d44a';
  for (let x = 0; x < w; x += 256) g.fillRect(x + 32, h / 2 - 5, 128, 10);
  g.fillStyle = '#e9e9e4'; g.fillRect(0, 10, w, 6); g.fillRect(0, h - 16, w, 6);
}));

export const grassTex = () => memo('grass', () => canvasTexture(THREE, 256, 256, (g, w, h) => {
  g.fillStyle = '#4c6a3d'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 6000, ['#3f5c33', '#5a7a47', '#56733f', '#486638', '#6b8650'], 1, 2.2);
}));

export const concreteTex = () => memo('concrete', () => canvasTexture(THREE, 256, 256, (g, w, h) => {
  g.fillStyle = '#9a9c98'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 4500, ['#8d8f8b', '#a6a8a3', '#b1b2ad', '#858781'], 1, 2.4);
  g.strokeStyle = 'rgba(70,72,68,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
}));

export const woodTex = () => memo('wood', () => canvasTexture(THREE, 256, 256, (g, w, h) => {
  for (let i = 0; i < 8; i++) {
    const c = 120 + rand(-14, 14);
    g.fillStyle = `rgb(${c + 40},${c},${c - 40})`; g.fillRect(0, i * 32, w, 31);
    g.fillStyle = 'rgba(60,35,15,.25)'; g.fillRect(0, i * 32 + 31, w, 1);
    for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(70,40,20,.08)'; g.fillRect(Math.random() * w, i * 32 + Math.random() * 30, rand(20, 80), 1); }
  }
}));

export const tileTex = () => memo('tile', () => canvasTexture(THREE, 256, 256, (g, w, h) => {
  g.fillStyle = '#b9bcb8'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8f938f'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  speckle(g, w, h, 1200, ['#a7aaa6', '#c4c7c2'], 1, 2);
}));

export const plasterTex = (color = '#cfc9bd') => memo('plaster' + color, () => canvasTexture(THREE, 256, 256, (g, w, h) => {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2500, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.07)'], 1, 3);
}));

export const roofTex = () => memo('roof', () => canvasTexture(THREE, 128, 128, (g, w, h) => {
  g.fillStyle = '#4a4d50'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1800, ['#3b3e41', '#5a5e62', '#66696d'], 1, 2);
}));

// 건물 외벽 한 칸(가로 3.2m × 세로 3.4m): 창문 + 벽
export function facadeTile(wall = '#b3aa9c', variant = 0) {
  return memo(`facade${wall}${variant}`, () => canvasTexture(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.06)'], 1, 3);
    const lit = variant === 1;
    const x = 26, y = 22, ww = 76, hh = 70;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 4, y - 4, ww + 8, hh + 8);
    const grad = g.createLinearGradient(0, y, 0, y + hh);
    if (lit) { grad.addColorStop(0, '#f6d18a'); grad.addColorStop(1, '#d99e52'); }
    else { grad.addColorStop(0, '#6c8aa0'); grad.addColorStop(1, '#2e4252'); }
    g.fillStyle = grad; g.fillRect(x, y, ww, hh);
    if (!lit) { g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x + 30, y); g.lineTo(x + 52, y); g.lineTo(x + 22, y + hh); g.fill(); }
    g.fillStyle = '#e6e3dc'; g.fillRect(x + ww / 2 - 2, y, 4, hh); g.fillRect(x, y + hh / 2 - 2, ww, 4);
    g.fillStyle = '#cfcac0'; g.fillRect(x - 6, y + hh + 2, ww + 12, 7);
  }));
}

export const fabricNormalish = () => memo('fabric', () => canvasTexture(THREE, 64, 64, (g, w, h) => {
  g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#8a8a8a' : '#777'; g.fillRect(0, y, w, 1); }
}));

// 간판/차량 문구용
export function labelTexture(text, { w = 512, h = 128, bg = '#b5211a', fg = '#fff', font = 'bold 64px sans-serif', stripe = false } = {}) {
  return canvasTexture(THREE, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (stripe) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, h * 0.78, w, h * 0.08); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h * (stripe ? 0.4 : 0.5));
  });
}

export const tiled = (tex, rx, ry) => {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
};
export { finish };
