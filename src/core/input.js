// 키보드 · 마우스 입력 (포인터락 지원, 미지원 시 드래그 시점)
export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.hit = new Set();
    this.buttons = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.active = false; // 게임 조작 가능 여부
    this.dragging = false;
    this.onPause = null;

    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.hit.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.buttons.clear(); });
    el.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      this.buttons.add(e.button);
      if (!this.locked) this.dragging = true;
    });
    addEventListener('mouseup', (e) => { this.buttons.delete(e.button); this.dragging = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (this.locked || this.dragging) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked && this.active && this.onPause) this.onPause();
    });
  }

  lock() {
    try { const p = this.el.requestPointerLock?.(); p && p.catch && p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  unlock() { try { document.exitPointerLock?.(); } catch (e) { /* ignore */ } }

  isDown(c) { return this.down.has(c); }
  pressed(c) { return this.hit.has(c); }
  mouse(b = 0) { return this.buttons.has(b); }

  endFrame() { this.hit.clear(); this.dx = 0; this.dy = 0; }
}
