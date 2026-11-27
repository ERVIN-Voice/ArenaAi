// ─── Синтез звука для мотогонки: двигатель, нитро, монеты, читы ────────────
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.noiseBuf = null;
    this.muted = false;
    this.lastCoin = 0;
    this.lastNear = 0;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this._startEngine();
  }

  _startEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxBus);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  engineUpdate(ratio, nitro, running) {
    if (!this.ready || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const r = Math.max(0, Math.min(1.2, ratio));
    const f = 52 + r * 165 + (nitro ? 28 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(500 + r * 2400 + (nitro ? 900 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(running ? 0.055 + r * 0.05 : 0, t, 0.1);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, t, 0.03);
    }
    return this.muted;
  }

  tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.15, gain = 0.12, delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.12, f1 = 4000, f2 = 300, type = 'lowpass', q = 1, delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f1, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  coin() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCoin < 0.05) return;
    this.lastCoin = now;
    this.tone({ freq: 980 + Math.random() * 240, freq2: 1560, type: 'sine', dur: 0.09, gain: 0.06 });
  }

  nearMiss() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastNear < 0.2) return;
    this.lastNear = now;
    this.noise({ dur: 0.18, gain: 0.08, f1: 600, f2: 3400, type: 'bandpass', q: 1.4 });
    this.tone({ freq: 520, freq2: 880, type: 'triangle', dur: 0.12, gain: 0.05 });
  }

  crash() {
    this.noise({ dur: 0.4, gain: 0.2, f1: 1600, f2: 80, type: 'lowpass' });
    this.tone({ freq: 130, freq2: 36, type: 'sine', dur: 0.35, gain: 0.2 });
  }

  nitro() {
    this.noise({ dur: 0.5, gain: 0.1, f1: 300, f2: 5200, type: 'bandpass', q: 0.8 });
  }

  cheatOk() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.07, delay: i * 0.06 });
    });
  }

  cheatFail() {
    this.tone({ freq: 220, freq2: 110, type: 'square', dur: 0.2, gain: 0.06 });
  }

  click() {
    this.tone({ freq: 660, freq2: 880, type: 'square', dur: 0.06, gain: 0.04 });
  }

  countGo() {
    this.tone({ freq: 440, type: 'square', dur: 0.12, gain: 0.07 });
    this.tone({ freq: 880, type: 'square', dur: 0.3, gain: 0.08, delay: 0.35 });
  }

  gameOver() {
    [440, 349.23, 261.63, 196].forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.08, delay: i * 0.14 });
    });
  }

  // совместимость со старым API
  startMusic() {}
  stopMusic() {}
  shoot() {}
  hit() {}
  explode() {}
  dash() {}
  pickup() { this.coin(); }
  hurt() { this.crash(); }
  shield() {}
  levelUp() { this.cheatOk(); }
  waveStart() {}
  waveClear() { this.cheatOk(); }
  bossWarn() {}
  overdrive() { this.nitro(); }
  uiClick() { this.click(); }
}
