// ─── Процедурный звук на WebAudio (без единого файла ассетов) ───────────────
const A2 = 110, F2 = 87.31, C3 = 130.81, G2 = 98.0;

const CHORDS = [
  { root: A2, notes: [440.0, 523.25, 659.25, 880.0] },   // Am
  { root: F2, notes: [349.23, 440.0, 523.25, 698.46] },  // F
  { root: C3, notes: [523.25, 659.25, 783.99, 1046.5] }, // C
  { root: G2, notes: [392.0, 493.88, 587.33, 783.99] },  // G
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.delay = null;
    this.noiseBuf = null;
    this.muted = false;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.lastShoot = 0;
    this.lastHit = 0;
    this.lastPickup = 0;
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
    this.master.gain.value = this.muted ? 0 : 0.62;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    this.musicBus.connect(lp);
    lp.connect(this.master);

    // Эхо для арпеджио
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.281;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.musicBus);

    this.noiseBuf = this.makeNoise();
    if (this.musicOn) this.startMusic();
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, t, 0.03);
    }
    return this.muted;
  }

  // ── базовые «голоса» ─────────────────────────────────────────────────────
  tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.15, gain = 0.15, delay = 0, dest = null }) {
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
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.15, f1 = 5000, f2 = 300, type = 'lowpass', q = 1, delay = 0, dest = null }) {
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
    src.connect(filt).connect(g).connect(dest || this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ── эффекты ──────────────────────────────────────────────────────────────
  shoot(od = false) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShoot < 0.04) return;
    this.lastShoot = now;
    this.tone({
      freq: od ? 1250 : 940, freq2: od ? 340 : 240, type: 'square',
      dur: 0.065, gain: 0.035,
    });
    this.noise({ dur: 0.05, gain: 0.02, f1: 4200, f2: 900, type: 'highpass' });
  }

  hit() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.035) return;
    this.lastHit = now;
    this.noise({ dur: 0.06, gain: 0.05, f1: 2600, f2: 600, type: 'bandpass', q: 0.9 });
  }

  explode(size = 1) {
    this.noise({ dur: 0.32 * size, gain: 0.16, f1: 1800, f2: 90, type: 'lowpass' });
    this.tone({ freq: 140 * size, freq2: 38, type: 'sine', dur: 0.3 * size, gain: 0.16 });
  }

  dash() {
    this.noise({ dur: 0.24, gain: 0.1, f1: 400, f2: 3200, type: 'bandpass', q: 1.6 });
    this.tone({ freq: 280, freq2: 720, type: 'triangle', dur: 0.16, gain: 0.05 });
  }

  pickup() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPickup < 0.05) return;
    this.lastPickup = now;
    this.tone({ freq: 900 + Math.random() * 260, freq2: 1500, type: 'sine', dur: 0.08, gain: 0.035 });
  }

  hurt() {
    this.tone({ freq: 220, freq2: 60, type: 'sawtooth', dur: 0.28, gain: 0.12 });
    this.noise({ dur: 0.18, gain: 0.1, f1: 900, f2: 120 });
  }

  shield() {
    this.tone({ freq: 1400, freq2: 500, type: 'triangle', dur: 0.24, gain: 0.09 });
    this.tone({ freq: 2100, freq2: 900, type: 'sine', dur: 0.2, gain: 0.05, delay: 0.03 });
  }

  levelUp() {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.07, delay: i * 0.075 });
    });
  }

  waveStart() {
    this.tone({ freq: 110, freq2: 220, type: 'sawtooth', dur: 0.5, gain: 0.07 });
    this.tone({ freq: 330, freq2: 440, type: 'triangle', dur: 0.4, gain: 0.04, delay: 0.05 });
  }

  waveClear() {
    [392, 523.25, 659.25].forEach((f, i) => {
      this.tone({ freq: f, type: 'sine', dur: 0.3, gain: 0.06, delay: i * 0.06 });
    });
  }

  bossWarn() {
    this.tone({ freq: 62, freq2: 40, type: 'sawtooth', dur: 1.1, gain: 0.16 });
    this.noise({ dur: 1.0, gain: 0.07, f1: 600, f2: 60, type: 'lowpass' });
  }

  overdrive() {
    [220, 330, 440, 660, 880].forEach((f, i) => {
      this.tone({ freq: f, freq2: f * 2, type: 'sawtooth', dur: 0.4, gain: 0.055, delay: i * 0.05 });
    });
    this.noise({ dur: 0.6, gain: 0.1, f1: 300, f2: 5000, type: 'bandpass', q: 0.7 });
  }

  uiClick() {
    this.tone({ freq: 660, freq2: 880, type: 'square', dur: 0.06, gain: 0.04 });
  }

  gameOver() {
    [440, 349.23, 261.63, 196].forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.08, delay: i * 0.14 });
    });
  }

  // ── музыка ───────────────────────────────────────────────────────────────
  startMusic() {
    this.musicOn = true;
    if (!this.ready) return;
    if (this.timer) return;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.34, this.ctx.currentTime, 0.6);
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  stopMusic() {
    this.musicOn = false;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  scheduler() {
    if (!this.ready) return;
    const stepDur = 60 / 128 / 4; // 128 BPM, 16-е
    // после сворачивания вкладки не «догоняем» прошедшее время пачкой нот
    if (this.nextTime < this.ctx.currentTime - 0.2) {
      this.nextTime = this.ctx.currentTime + 0.05;
    }
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  scheduleStep(step, t) {
    const bar = (step >> 4) & 3;
    const s = step & 15;
    const chord = CHORDS[bar];
    const delayT = Math.max(0, t - this.ctx.currentTime);

    // бочка
    if (s === 0 || s === 4 || s === 8 || s === 12) {
      this.musicTone({ freq: 150, freq2: 44, type: 'sine', dur: 0.28, gain: 0.26, t });
      this.musicNoise({ dur: 0.04, gain: 0.06, f1: 4000, f2: 800, t });
    }
    // хэт
    if (s === 2 || s === 6 || s === 10 || s === 14) {
      this.musicNoise({ dur: 0.05, gain: 0.05, f1: 9000, f2: 6000, t, type: 'highpass' });
    }
    // бас
    if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) {
      const oct = (s === 6 || s === 14) ? 2 : 1;
      this.musicTone({
        freq: chord.root * oct, type: 'sawtooth', dur: 0.2, gain: 0.1, t,
        filter: 720,
      });
    }
    // арпеджио
    if (s % 2 === 0) {
      const notes = chord.notes;
      const idx = (s / 2 + bar) % notes.length;
      const f = notes[idx] * (s % 4 === 0 ? 1 : 2);
      this.musicTone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.045, t, sendDelay: true });
    }
  }

  musicTone({ freq, freq2 = null, type = 'sine', dur = 0.2, gain = 0.1, t, filter = null, sendDelay = false }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      node = node.connect(f);
    }
    node.connect(this.musicBus);
    if (sendDelay) node.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  musicNoise({ dur = 0.05, gain = 0.05, f1 = 8000, f2 = 4000, t, type = 'highpass' }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f1, t);
    filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.musicBus);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  }
}
