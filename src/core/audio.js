// 외부 음원 없이 WebAudio로 합성하는 효과음 (사이렌 · 방수 · 화재 · 경보)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = {};
    this.t = 0;
    this.nextPop = 0;
    this.nextBeep = 0;
  }

  init() {
    if (this.ctx) { this.ctx.state === 'suspended' && this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(c.destination);
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const mkNoise = (type, freq, q) => {
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master); src.start();
        return { g, f };
      };
      this.loops.water = mkNoise('bandpass', 2400, 0.7);
      this.loops.fire = mkNoise('lowpass', 520, 0.5);
      this.loops.powder = mkNoise('highpass', 3200, 0.4);
      // 사이렌
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 700;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
      const sg = c.createGain(); sg.gain.value = 0;
      osc.connect(lp); lp.connect(sg); sg.connect(this.master); osc.start();
      this.loops.siren = { g: sg, osc };
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  level(name, v) {
    const l = this.loops[name];
    if (!l || !this.ctx) return;
    l.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.18, slide = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02);
  }

  ok() { this.tone(660, 0.1, 'triangle', 0.16); setTimeout(() => this.tone(990, 0.16, 'triangle', 0.16), 90); }
  bad() { this.tone(180, 0.25, 'sawtooth', 0.16, -60); }
  click() { this.tone(520, 0.05, 'square', 0.06); }
  hurt() { this.tone(120, 0.18, 'sawtooth', 0.2, -40); }
  alarm() { this.tone(1500, 0.09, 'square', 0.07); }
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.18), i * 120)); }

  pop() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800 + Math.random() * 2400; f.Q.value = 3;
    const g = c.createGain(); g.gain.value = 0.18 * Math.random();
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.06);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(c.currentTime, Math.random() * 1.5, 0.07);
  }

  update(dt, st) {
    if (!this.ctx) return;
    this.t += dt;
    const lp = this.loops.siren;
    if (lp) lp.osc.frequency.setTargetAtTime(760 + 330 * Math.sin(this.t * 2.6), this.ctx.currentTime, 0.03);
    this.level('siren', st.siren ? 0.07 : 0);
    this.level('water', st.water || 0);
    this.level('powder', st.powder || 0);
    this.level('fire', Math.min(0.32, (st.fire || 0) * 0.32));
    if (st.fire > 0.05 && this.t > this.nextPop) { this.pop(); this.nextPop = this.t + 0.05 + Math.random() * 0.35 / (0.2 + st.fire); }
    if (st.lowAir && this.t > this.nextBeep) { this.alarm(); this.nextBeep = this.t + 0.7; }
  }
}
