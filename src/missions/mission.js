// 임무 공통 기반 클래스
import { clamp } from '../core/util.js';

export class Mission {
  constructor(G, def) {
    this.G = G;
    this.def = def;
    this.time = 0;
    this.objs = [];
    this.mistakes = [];
    this.penalty = 0;
    this.ended = false;
    this.success = false;
    this.failReason = '';
    this.inter = [];
    this.props = [];
    this.humans = [];
    this.thermal = [];
    this.showAir = false;
    this.survivorCond = null;
    this.smokeFx = 0;
    this.markerTarget = null;
    this.par = def.par || 150;
    this.extraRows = [];
  }

  // ── 목표 관리
  addObj(id, text, count = null) {
    this.objs.push({ id, text, done: false, active: false, count });
    return this;
  }
  setActive(id) {
    for (const o of this.objs) o.active = o.id === id && !o.done;
    this.refresh();
  }
  complete(id) {
    const o = this.objs.find((x) => x.id === id);
    if (o && !o.done) { o.done = true; o.active = false; this.G.sfx.ok(); }
    const next = this.objs.find((x) => !x.done);
    this.objs.forEach((x) => (x.active = x === next));
    this.refresh();
  }
  setCount(id, text) {
    const o = this.objs.find((x) => x.id === id);
    if (o && o.count !== text) { o.count = text; this.refresh(); }
  }
  refresh() { this.G.ui.setObjectives(this.def.title, this.objs); }

  // ── 실수 기록 (같은 문구는 1번만 감점)
  mistake(text, pen = 60) {
    if (this.mistakes.includes(text)) return false;
    this.mistakes.push(text);
    this.penalty += pen;
    this.G.ui.toast('⚠ ' + text, 'bad');
    this.G.sfx.bad();
    return true;
  }

  // ── 리소스 등록(자동 정리)
  addInteract(o) { this.G.interactables.push(o); this.inter.push(o); return o; }
  addProp(o) { this.props.push(o); return o; }
  addHuman(h) { this.humans.push(h); this.G.engine.scene.add(h.root); return h; }

  finish(success, reason = '') {
    if (this.ended) return;
    this.ended = true;
    this.success = success;
    this.failReason = reason;
  }

  // ── 오버라이드
  async setup() {}
  update(dt) {}
  onE() { return false; }
  quizPool() { return []; }

  tick(dt) {
    if (this.ended) return;
    this.time += dt;
    if (!this.G.player.alive) { this.finish(false, '체력 소진 — 부상으로 현장에서 철수했습니다.'); return; }
    this.update(dt);
  }

  result(quiz) {
    const s = this.success;
    const over = Math.max(0, this.time - this.par);
    const timePen = Math.min(260, Math.round(over * 2));
    let score = s ? 1000 : 250;
    score -= this.penalty + (s ? timePen : 0);
    score += quiz.correct * 50;
    score = Math.max(0, Math.round(score));
    const stars = !s ? 0 : score >= 1050 ? 3 : score >= 800 ? 2 : 1;
    const exp = s ? 120 + stars * 60 + quiz.correct * 25 : 40;
    return { score, stars, exp, timePen, over };
  }

  dispose() {
    for (const i of this.inter) { const k = this.G.interactables.indexOf(i); if (k >= 0) this.G.interactables.splice(k, 1); }
    for (const p of this.props) { p.parent && p.parent.remove(p); p.traverse?.((o) => { o.geometry?.dispose?.(); }); }
    for (const h of this.humans) h.root.parent && h.root.parent.remove(h.root);
    this.teardown && this.teardown();
    this.G.player.tether = null;
    this.G.ui.setMarker(null);
  }
}

export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export { clamp };
