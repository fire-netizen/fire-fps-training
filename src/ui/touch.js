// 스마트폰용 터치 조작: 왼쪽 가상 조이스틱 + 오른쪽 화면 드래그(시점) + 행동 버튼
// 기존 Input(키보드/마우스) 모델에 값을 넣어 주므로 게임 로직은 그대로 사용합니다.
import { AGENTS } from '../data/agents.js';

const cap = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* 일부 브라우저는 무시 */ } };

export class TouchControls {
  constructor(G) {
    this.G = G;
    this.inp = G.input;
    this.joy = null;
    this.look = null;
    this.visible = false;
    document.body.classList.add('touch');
    const root = (this.root = document.createElement('div'));
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="t-joyzone"><div class="t-base"><div class="t-knob"></div></div></div>
      <div class="t-lookzone"></div>
      <button class="t-btn t-pause" data-act="pause" aria-label="일시정지">⏸</button>
      <div class="t-tools">
        <button class="t-btn t-sm" data-tool="1">1<small>관창</small></button>
        <button class="t-btn t-sm" data-tool="2">2<small>소화기</small></button>
        <button class="t-btn t-sm" data-tool="T">T<small>열화상</small></button>
        <button class="t-btn t-sm" data-tool="Q">Q<small>직사/분무</small></button>
      </div>
      <div class="t-actions">
        <button class="t-btn t-sm" data-act="crouch">⬇<small>자세</small></button>
        <button class="t-btn t-e" data-act="use">E<small>상호작용</small></button>
        <button class="t-btn t-fire" data-act="fire">💧<small>방수</small></button>
      </div>`;
    document.body.append(root);
    this.$ = (s) => root.querySelector(s);
    this.base = this.$('.t-base');
    this.knob = this.$('.t-knob');
    this.fireBtn = this.$('.t-fire');
    this.useBtn = this.$('.t-e');
    this.toolBtns = [...root.querySelectorAll('[data-tool]')];

    const joyZone = this.$('.t-joyzone'), lookZone = this.$('.t-lookzone');
    joyZone.addEventListener('pointerdown', (e) => this.joyDown(e));
    joyZone.addEventListener('pointermove', (e) => this.joyMove(e));
    for (const t of ['pointerup', 'pointercancel']) joyZone.addEventListener(t, (e) => this.joyUp(e));
    lookZone.addEventListener('pointerdown', (e) => { if (this.look) return; this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; cap(lookZone, e.pointerId); e.preventDefault(); });
    lookZone.addEventListener('pointermove', (e) => {
      if (!this.look || this.look.id !== e.pointerId) return;
      this.inp.dx += (e.clientX - this.look.x) * 1.5; this.inp.dy += (e.clientY - this.look.y) * 1.5;
      this.look.x = e.clientX; this.look.y = e.clientY; e.preventDefault();
    });
    for (const t of ['pointerup', 'pointercancel']) lookZone.addEventListener(t, (e) => { if (this.look && this.look.id === e.pointerId) this.look = null; });

    // 버튼: 누르는 동안 유지되는 입력(방수·상호작용)과 한 번 누르는 입력(나머지)
    const hold = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => { cap(el, e.pointerId); el.classList.add('on'); down(); e.preventDefault(); });
      for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, () => { el.classList.remove('on'); up(); });
    };
    const inp = this.inp;
    hold(this.fireBtn, () => { inp.buttons.add(0); inp.down.add('Space'); }, () => { inp.buttons.delete(0); inp.down.delete('Space'); });
    hold(this.useBtn, () => { inp.hit.add('KeyE'); inp.down.add('KeyE'); }, () => inp.down.delete('KeyE'));
    const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { fn(); e.preventDefault(); });
    tap(this.$('[data-act="crouch"]'), () => inp.hit.add('KeyC'));
    tap(this.$('[data-act="pause"]'), () => inp.hit.add('Escape'));
    const code = { 1: 'Digit1', 2: 'Digit2', T: 'KeyT', Q: 'KeyQ' };
    for (const b of this.toolBtns) tap(b, () => inp.hit.add(code[b.dataset.tool]));
    // 화면이 흔들리거나 선택되는 것 방지
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  setKeys(v) {
    const d = this.inp.down, set = (c, on) => (on ? d.add(c) : d.delete(c));
    const T = 0.35;
    set('KeyD', v.x > T); set('KeyA', v.x < -T); set('KeyW', v.y < -T); set('KeyS', v.y > T);
    set('ShiftLeft', Math.hypot(v.x, v.y) > 0.95);
  }

  joyDown(e) {
    if (this.joy) return;
    const z = e.currentTarget;
    cap(z, e.pointerId);
    this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    this.base.style.left = e.clientX + 'px'; this.base.style.top = e.clientY + 'px';
    this.base.classList.add('on');
    this.knob.style.transform = 'translate(-50%,-50%)';
    e.preventDefault();
  }

  joyMove(e) {
    const j = this.joy;
    if (!j || j.id !== e.pointerId) return;
    const R = 56;
    let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.setKeys({ x: dx / R, y: dy / R });
    e.preventDefault();
  }

  joyUp(e) {
    if (!this.joy || this.joy.id !== e.pointerId) return;
    this.joy = null;
    this.base.classList.remove('on');
    this.setKeys({ x: 0, y: 0 });
  }

  // 매 프레임: 게임 상태에 맞게 버튼 표시
  update() {
    const G = this.G, P = G.player;
    const vis = G.state === 'play' && !G.resolving && G.ui.modal.classList.contains('hidden');
    if (vis !== this.visible) {
      this.visible = vis;
      this.root.classList.toggle('hidden', !vis);
      if (!vis) { this.joyUp({ pointerId: this.joy && this.joy.id }); this.look = null; this.inp.buttons.delete(0); this.inp.down.delete('Space'); this.inp.down.delete('KeyE'); }
    }
    if (!vis) return;
    const A = P.allowed || {};
    const show = (el, on) => el.classList.toggle('hidden', !on);
    show(this.toolBtns[0], !!A.hose);
    show(this.toolBtns[1], !!A.ext);
    show(this.toolBtns[2], !!A.tic);
    show(this.toolBtns[3], P.tool === 'hose');
    show(this.fireBtn, !!P.tool && P.tool !== 'tic');
    const ag = P.tool === 'agent';
    this.fireBtn.firstChild.textContent = P.tool === 'ext' || ag ? '🧯' : '💧';
    this.fireBtn.querySelector('small').textContent = P.tool === 'ext' || ag ? '분사' : '방수';
    this.useBtn.classList.toggle('pulse', !!G.holdTarget);
  }
}

// 소화약제 선택 바(5번 임무)를 터치로 고르게 연결
export function bindAgentTiles(G, el) {
  [...el.querySelectorAll('.ag')].forEach((t, i) => t.addEventListener('pointerdown', (e) => { G.player.selectAgent(i); e.preventDefault(); }));
}
