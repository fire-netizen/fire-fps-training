// 플레이어 성장(RPG) · 진행 저장
export const RANKS = ['소방사', '소방교', '소방장', '소방위', '소방경', '소방령'];
export const LEVEL_EXP = [0, 300, 800, 1500, 2400, 3600];
const KEY = 'fire-hero-save-v1';

export function levelFromExp(exp) {
  let lv = 1;
  for (let i = 0; i < LEVEL_EXP.length; i++) if (exp >= LEVEL_EXP[i]) lv = i + 1;
  return Math.min(lv, LEVEL_EXP.length);
}

export class Progress {
  constructor() {
    this.name = '김소방';
    this.exp = 0;
    this.missions = {}; // id -> { done, best, stars }
    this.gearDone = false;
  }

  get level() { return levelFromExp(this.exp); }
  get rank() { return RANKS[this.level - 1]; }
  get expInLevel() { const lv = this.level; return this.exp - LEVEL_EXP[lv - 1]; }
  get expToNext() { const lv = this.level; return lv >= LEVEL_EXP.length ? 0 : LEVEL_EXP[lv] - LEVEL_EXP[lv - 1]; }
  get maxHp() { return 100 + 10 * (this.level - 1); }
  get airEff() { return 1 + 0.08 * (this.level - 1); } // 공기 소모 감소
  get waterEff() { return 1 + 0.06 * (this.level - 1); } // 방수 효율

  static hasSave() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) Object.assign(this, s);
      return !!s;
    } catch (e) { return false; }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ name: this.name, exp: this.exp, missions: this.missions, gearDone: this.gearDone })); } catch (e) { /* 저장 불가 환경 */ }
  }

  reset(name) {
    this.name = name || '김소방'; this.exp = 0; this.missions = {}; this.gearDone = false; this.save();
  }

  addExp(n) {
    const before = this.level;
    this.exp += n;
    this.save();
    return { before, after: this.level, leveled: this.level > before };
  }

  record(id, score, stars, success) {
    const m = (this.missions[id] ||= { done: false, best: 0, stars: 0 });
    if (success) m.done = true;
    m.best = Math.max(m.best, score);
    m.stars = Math.max(m.stars, stars);
    if (id === 'm1' && success) this.gearDone = true;
    this.save();
  }
}
