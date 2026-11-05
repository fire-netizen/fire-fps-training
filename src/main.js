// 119 FIRE HERO — 소방관 미션 RPG (메인 게임 루프)
import * as THREE from 'three';
import './style.css';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Sfx } from './core/audio.js';
import { World, LAYOUT } from './world/world.js';
import { Effects } from './world/effects.js';
import { Player, CameraRig } from './core/player.js';
import { UI } from './ui/ui.js';
import { Progress } from './data/progress.js';
import { MISSIONS, missionById } from './missions/index.js';
import { Human } from './character/human.js';
import { clamp, lerp, shuffle } from './core/util.js';
import { fmtTime } from './core/util.js';

const FULL_GEAR = { pants: true, boots: true, coat: true, hood: true, scba: true, helmet: true, gloves: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Game {
  constructor() {
    this.root = document.getElementById('app');
    this.engine = new Engine(document.getElementById('game'));
    this.world = new World(this.engine);
    this.fx = new Effects(this.engine, this.world);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();
    this.progress = new Progress();
    this.interactables = [];
    this.hubIts = [];
    this.state = 'title';
    this.mission = null;
    this.cut = null;
    this.time = 0;
    this.camRig = new CameraRig(this.engine, this.world);
    this.cam = this.camRig;
    this.player = new Player(this);
    this.ui = new UI(this.root, this);
    this.holdT = 0;
    this.holdTarget = null;
    this.resolving = false;
    this.npc = null;
    this.tmp = new THREE.Vector3();
    this.last = performance.now();
    this.player.onHurt = (amt, reason) => {
      if (!this._hurtT || this.time - this._hurtT > 0.5) { this.sfx.hurt(); this._hurtT = this.time; }
    };
    this.input.onPause = () => { if (this.state === 'play' && !this.resolving) this.pause(); };
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'play' && this.input.active && !this.input.locked) this.input.lock();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !(e.target && /INPUT/.test(e.target.tagName))) { this.sfx.setMuted(!this.sfx.muted); this.ui.toast(this.sfx.muted ? '소리 끔' : '소리 켬', 'info'); }
    });
    this.buildHub();
    window.__game = this;
  }

  // ───────────── 허브(소방서) ─────────────
  buildHub() {
    const npc = new Human({ skin: '#b98763', hair: '#1a1410', scale: 1.04 });
    npc.setGear({ ...FULL_GEAR });
    npc.root.position.set(LAYOUT.npc[0], 0, LAYOUT.npc[1]);
    npc.root.rotation.y = Math.PI * 0.35;
    this.world.out.add(npc.root);
    this.npc = npc;
    const board = this.world.boardPos;
    this.hubIts = [
      { pos: new THREE.Vector3(board.x, 0, board.z + 2.2), radius: 3.6, label: '출동 상황판 · 임무 선택', onUse: () => this.openBoard() },
      { pos: npc.root.position, radius: 2.8, label: '김 팀장(소방위)과 대화', onUse: () => this.npcTalk() },
    ];
  }

  addHubIts() { for (const it of this.hubIts) if (!this.interactables.includes(it)) this.interactables.push(it); }
  removeHubIts() { for (const it of this.hubIts) { const k = this.interactables.indexOf(it); if (k >= 0) this.interactables.splice(k, 1); } }

  async enterHub() {
    const W = this.world, P = this.player;
    W.showZone('outdoor');
    this.fx.clearAll();
    W.placeTruck(LAYOUT.truckHome[0], LAYOUT.truckHome[1]);
    P.root.visible = true;
    P.setGear(this.progress.gearDone ? { ...FULL_GEAR } : {});
    P.setMask(false);
    P.allowed = { hose: false, ext: false, tic: false };
    P.hoseReady = false; P.tool = null; P.human.setTool(null); P.tic = false; P.tether = null; P.carry = null;
    P.resetStats(this.progress);
    P.teleport(new THREE.Vector3(LAYOUT.spawnHub[0], 0, LAYOUT.spawnHub[1]), Math.PI);
    this.engine.setDensity(this.engine.zone.density);
    this.mission = null;
    this.interactables.length = 0;
    this.addHubIts();
    this.ui.setObjectives('소방서 · 대기', [{ text: this.progress.gearDone ? '출동 상황판(E)에서 임무를 선택한다' : '먼저 1번 임무 「출동 준비」를 완료한다', active: true }, { text: '김 팀장과 대화하면 조언을 들을 수 있다', active: false }]);
    this.ui.setPass(null);
    this.state = 'play';
  }

  async openBoard() {
    this.state = 'modal';
    const id = await this.ui.board(MISSIONS, this.progress);
    this.ui.close();
    if (!id) { this.resume(); return; }
    await this.startMission(id);
  }

  async npcTalk() {
    this.state = 'modal';
    const p = this.progress;
    const lines = !p.gearDone
      ? [`${p.name} 대원, 환영한다. 현장에서는 장비가 곧 생명줄이다.`, '출동 상황판(E)에서 1번 「출동 준비」 임무를 먼저 수행하게. 장비를 갖추지 못하면 출동할 수 없다.']
      : ['장비를 갖췄군. 지령이 떨어지면 상황판에서 임무를 골라 출동한다.', '기억해라. 연기 속에서는 자세를 낮추고, 불은 꽃이 아니라 뿌리를 노린다. 무엇보다 안전이 최우선이다.'];
    await this.ui.talk('김 팀장 (소방위)', lines);
    this.ui.close();
    this.resume();
  }

  resume() {
    this.state = 'play';
    this.input.active = true;
    this.input.lock();
  }

  // ───────────── 흐름 ─────────────
  async boot() {
    this.engine.setZone('outdoor');
    this.player.setGear({ ...FULL_GEAR });
    this.player.teleport(new THREE.Vector3(LAYOUT.spawnHub[0], 0, LAYOUT.spawnHub[1]), Math.PI);
    this.state = 'title';
    let saved = new Progress();
    const has = Progress.hasSave() && saved.load();
    const r = await this.ui.title(has, has ? saved.name : '김소방');
    if (r.mode === 'continue') { this.progress.load(); } else { this.progress.reset(r.name); }
    this.progress.name = r.name; this.progress.save();
    this.ui.close();
    await this.ui.fade(true, 200);
    await this.enterHub();
    this.ui.show(true);
    await this.ui.fade(false, 700);
    await this.ui.talk('김 팀장 (소방위)', [`${this.progress.name} 대원! 자네가 오늘 배치된 신임 소방사로군.`, '여기는 119 안전센터. 출동 지령이 떨어지면 소방차에 올라 화재 현장으로 향한다.', '화면 앞의 출동 상황판(E)에서 임무를 선택하게. 처음에는 보호장비 착용부터다.']);
    this.ui.close();
    this.resume();
  }

  async startMission(id, { skipBrief = false } = {}) {
    const def = missionById(id);
    if (!skipBrief) {
      this.state = 'modal';
      const ok = await this.ui.briefing(def);
      this.ui.close();
      if (!ok) { this.resume(); return; }
    }
    this.state = 'trans';
    this.input.active = false;
    await this.ui.fade(true, 500);
    this.removeHubIts();
    this.ui.show(false);
    if (def.dispatch) await this.dispatch(def);
    const m = def.create(this, def);
    this.player.resetStats(this.progress);
    this.player.allowed = { hose: false, ext: false, tic: false };
    this.mission = m;
    this.resolving = false;
    this.fx.onWrongAgent = null;
    await m.setup();
    m.refresh();
    this.camRig.yaw = this.player.heading;
    this.camRig.update(0, this.player, null, { free: false });
    this.ui.show(true);
    this.state = 'play';
    await this.ui.fade(false, 600);
    this.input.active = true;
    this.input.lock();
    this.ui.banner(def.title, 2600);
  }

  // 출동 연출: 소방차가 소방서에서 현장까지 사이렌을 울리며 이동
  async dispatch(def) {
    const W = this.world, site = LAYOUT[def.site], home = LAYOUT.truckHome;
    W.showZone('outdoor');
    this.fx.clearAll();
    W.placeTruck(home[0], home[1]);
    this.player.root.visible = false;
    const dist = site.truck[0] - home[0];
    this.cut = { t: 0, dur: clamp(dist / 40, 4.5, 8.5), x0: home[0], x1: site.truck[0], z: home[1], done: null, finished: false };
    this.state = 'dispatch';
    const finished = new Promise((res) => (this.cut.done = res));
    await this.ui.fade(false, 500);
    this.ui.banner('🚒 출동 중…', 2400);
    await finished;
    await this.ui.fade(true, 500);
    this.cut = null;
    W.placeTruck(site.truck[0], site.truck[1]);
    this.player.root.visible = true;
    this.player.teleport(new THREE.Vector3(site.spawn[0], 0, site.spawn[1]), Math.PI);
    this.engine.setDensity(this.engine.zone.density);
    this.state = 'trans';
  }

  async pause() {
    if (this.state !== 'play' || this.pausing) return;
    this.pausing = true;
    this.state = 'modal';
    const r = await this.ui.pause();
    this.ui.close();
    this.pausing = false;
    if (r === 'abort' && this.mission) { this.mission.aborted = true; this.mission.finish(false, '임무를 중단했습니다.'); this.state = 'play'; this.input.active = false; }
    else this.resume();
  }

  async resolveMission() {
    this.resolving = true;
    this.state = 'modal';
    this.input.active = false;
    this.input.unlock();
    const m = this.mission, def = m.def, P = this.player;
    this.ui.setPrompt(null);
    this.ui.setMarker(null);
    P.firing = false;
    this.sfx.update(0, {});
    if (!m.aborted) {
      let quiz = { correct: 0, total: 0 };
      await wait(m.success ? 700 : 300);
      this.ui.show(false);
      if (m.success) quiz = await this.ui.quiz(def.title, shuffle(m.quizPool()).slice(0, 3));
      const r = m.result(quiz);
      const before = this.progress.level, prevRank = this.progress.rank;
      this.progress.addExp(r.exp);
      this.progress.record(def.id, r.score, r.stars, m.success);
      const lv = this.progress.level;
      if (lv > before) this.sfx.levelUp();
      const rows = [
        { k: '소요 시간', v: `${fmtTime(m.time)} (기준 ${fmtTime(m.par)})` },
        ...(m.success && r.timePen ? [{ k: '시간 초과 감점', v: `-${r.timePen}`, kind: 'bad' }] : []),
        { k: '실수 감점', v: m.penalty ? `-${m.penalty}` : '없음', kind: m.penalty ? 'bad' : 'good' },
        ...(m.success ? [{ k: '퀴즈 정답', v: `${quiz.correct} / ${quiz.total}`, kind: quiz.correct === quiz.total ? 'good' : '' }] : []),
        { k: '남은 체력', v: `${Math.ceil(P.stats.hp)} / ${P.stats.maxHp}` },
        ...(m.failReason ? [{ k: '실패 사유', v: m.failReason, kind: 'bad' }] : []),
      ];
      const choice = await this.ui.result({
        title: def.title, success: m.success, score: r.score, stars: r.stars, exp: r.exp, rows, mistakes: m.mistakes, retry: !m.success,
        level: { cur: this.progress.expInLevel, need: this.progress.expToNext, rank: this.progress.rank, level: lv, up: lv > before, prevRank },
      });
      this.ui.close();
      await this.ui.fade(true, 500);
      m.dispose(); this.mission = null;
      if (choice === 'retry') { await this.startMission(def.id, { skipBrief: true }); return; }
    } else {
      await this.ui.fade(true, 400);
      m.dispose(); this.mission = null;
    }
    await this.enterHub();
    this.ui.show(true);
    await this.ui.fade(false, 600);
    this.resolving = false;
    this.resume();
  }

  // ───────────── 갱신 ─────────────
  updateInteract(dt) {
    const P = this.player, inp = this.input;
    if (this.mission && inp.pressed('KeyE') && this.mission.onE()) { this.holdT = 0; return; }
    let best = null, bd = 1e9;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(P.pos.x - it.pos.x, P.pos.z - it.pos.z);
      if (d < (it.radius || 2.5) && d < bd) { bd = d; best = it; }
    }
    if (best !== this.holdTarget) { this.holdTarget = best; this.holdT = 0; }
    if (!best) { this.ui.setPrompt(null); return; }
    if (best.hold) {
      if (inp.isDown('KeyE')) { this.holdT += dt; if (this.holdT >= best.hold) { this.holdT = 0; best.onUse(); } } else this.holdT = 0;
      this.ui.setPrompt(`${best.label} — E 길게 누르기`, this.holdT / best.hold);
    } else {
      this.ui.setPrompt(best.label, null);
      if (inp.pressed('KeyE')) { P.human.play('reach', 0.7); best.onUse(); this.sfx.click(); }
    }
  }

  updateMarker() {
    let t = this.mission ? this.mission.markerTarget : null;
    if (!this.mission && this.state === 'play') t = { pos: new THREE.Vector3(this.world.boardPos.x, 3.7, this.world.boardPos.z), label: '출동 상황판' };
    if (!t || this.state !== 'play') { this.ui.setMarker(null); return; }
    const v = this.tmp.copy(t.pos).project(this.engine.camera);
    if (v.z > 1) { this.ui.setMarker(null); return; }
    const W = innerWidth, H = innerHeight;
    const x = clamp((v.x * 0.5 + 0.5) * W, 40, W - 40), y = clamp((-v.y * 0.5 + 0.5) * H, 60, H - 70);
    const d = t.pos.distanceTo(this.player.pos);
    this.ui.setMarker(x, y, t.label, d);
  }

  fireLevel() {
    let s = 0;
    for (const f of this.fx.fires) if (f.alive) s += clamp(1 - f.pos.distanceTo(this.player.pos) / 28, 0, 1) * f.intensity * Math.min(1.2, f.size);
    return Math.min(1, s);
  }

  update(dt) {
    this.time += dt;
    const inp = this.input, P = this.player, cam = this.engine.camera;
    if (inp.pressed('Escape') && this.state === 'play' && !inp.locked) this.pause();

    if (this.state === 'title') {
      const t = this.time * 0.12;
      const cx = LAYOUT.spawnHub[0] + 3, cz = LAYOUT.spawnHub[1] - 3;
      cam.position.set(cx + Math.cos(t) * 11, 3.2, cz + Math.sin(t) * 11 + 4);
      cam.lookAt(cx, 1.8, cz - 2);
      P.human.update(dt, { speed: 0 });
      this.engine.follow(P.pos);
    } else if (this.state === 'dispatch' && this.cut) {
      const c = this.cut;
      c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1), e = k * k * (3 - 2 * k);
      const x = lerp(c.x0, c.x1, e);
      this.world.placeTruck(x, c.z);
      cam.position.set(x - 13, 4.6, c.z + 8.5);
      cam.lookAt(x + 5, 1.5, c.z - 0.5);
      this.engine.follow(this.world.truck.position);
      if (c.t >= c.dur && !c.finished) { c.finished = true; c.done(); }
    } else if (this.state === 'play') {
      P.update(dt);
      this.camRig.update(dt, P, inp, { aiming: P.aiming });
      this.mission && this.mission.tick(dt);
      this.updateInteract(dt);
      if (!this.mission) this.npc.update(dt, { speed: 0 });
      this.engine.follow(P.pos);
      if (this.mission && this.mission.ended && !this.resolving) this.resolveMission();
    } else if (this.state === 'modal' || this.state === 'trans') {
      this.engine.follow(P.pos);
    }

    // 월드 효과
    if (this.state !== 'modal') this.fx.update(this.state === 'dispatch' ? 0.016 : dt);
    if (this.world.zone === 'outdoor') this.world.truck.userData.flash(this.time + (this.state === 'dispatch' ? 0 : 0));
    // 조명
    const src = this.fx.lightSources();
    for (const l of this.world.lampSources) src.push(l);
    if (this.world.zone === 'smoky' && this.state === 'play') {
      const hp = P.human.head.getWorldPosition(new THREE.Vector3());
      hp.add(this.tmp.set(Math.sin(P.heading) * 0.5, 0.1, Math.cos(P.heading) * 0.5));
      src.push({ pos: hp, color: '#fff0d8', intensity: P.tic ? 3 : 18, distance: 11 });
    }
    this.engine.assignLights(src, this.state === 'dispatch' ? this.world.truck.position : P.pos);
    // 열화상 표시
    this.engine.renderer.domElement.classList.toggle('tic', !!P.tic && this.state === 'play');
    if (this.mission) for (const o of this.mission.thermal) o.visible = !!P.tic;
    // 소리
    const a = P.audio || {};
    this.sfx.update(dt, {
      siren: this.state === 'dispatch', water: this.state === 'play' ? a.water : 0, powder: this.state === 'play' ? a.powder : 0,
      fire: this.state === 'play' ? this.fireLevel() : 0,
      lowAir: !!(this.mission && this.mission.showAir && P.mask && P.stats.air < 30 && this.state === 'play'),
    });
    // HUD
    if (this.state === 'play' || this.state === 'modal') {
      let nf = 1e9;
      for (const f of this.fx.fires) if (f.alive) nf = Math.min(nf, f.pos.distanceTo(P.pos));
      this.ui.update({
        player: P, progress: this.progress, time: this.mission ? this.mission.time : 0, showAir: !!(this.mission && this.mission.showAir),
        survivor: this.mission ? this.mission.survivorCond : null, smoke: this.mission ? this.mission.smokeFx : 0,
        crosshair: this.state === 'play', ticTemp: 24 + Math.max(0, 14 - nf) * 35,
      });
      this.updateMarker();
    }
    inp.endFrame();
  }

  render() { this.engine.render(); }

  loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.update(dt);
    this.render();
  };

  // 테스트/디버그: 렌더링 없이 시뮬레이션만 진행
  sim(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) this.update(step);
  }
}

const game = new Game();
game.loop();
game.boot();
