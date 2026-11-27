// Производительность: плотная сцена 1920×1080 — трафик, монеты, частицы, оба режима.
import { createCanvas } from '@napi-rs/canvas';

const W = 1920, H = 1080;
globalThis.document = {
  createElement: (t) => (t === 'canvas' ? createCanvas(2, 2) : {}),
  addEventListener() {}, body: {},
};
globalThis.window = { innerWidth: W, innerHeight: H, addEventListener() {}, devicePixelRatio: 1 };

const { Game } = await import('../src/game.js');
const { FX } = await import('../src/fx.js');

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const fx = new FX();
const input = {
  keys: new Set(['KeyW']),
  justPressed: new Set(),
  virtual: {},
  isTouch: false,
  moveStick: { active: false, dx: 0, dy: 0, mag: 0 },
  aimStick: { active: false, dx: 0, dy: 0, mag: 0 },
  down(c) { return this.keys.has(c); },
  pressed(c) { return this.justPressed.has(c); },
  press(c) { this.justPressed.add(c); },
  endFrame() { this.justPressed.clear(); },
};

const g = new Game({
  width: W, height: H, fx, audio: null, input, best: 0,
  callbacks: { onBanner() {}, onFlash() {}, onState() {}, onHud() {}, onToast() {}, onGameOver() {} },
});
g.dpr = 1;
g.startRun();

// насыщаем сцену
for (let i = 0; i < 36; i++) {
  g.spawnTraffic(g.position + 200 * (4 + i * 4));
}
for (let i = 0; i < 24; i++) g.spawnCoins(g.position + 200 * (4 + i * 5));
for (let i = 0; i < 260; i++) {
  fx.particle({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 300, vy: -200, life: 1.2, size: 4, color: '#5ef1ff' });
}
for (let i = 0; i < 40; i++) fx.ring(Math.random() * W, Math.random() * H, '#ffffff', { r1: 90, life: 1 });
for (let i = 0; i < 30; i++) fx.text(Math.random() * W, Math.random() * H, '+150', '#3dffa0', 16);

function bench(label, mode) {
  g.setMode(mode);
  g.hp = 100;
  for (let i = 0; i < 60; i++) { g.update(1 / 60); g.render(ctx); }
  const N = 300;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    g.hp = 100;
    g.update(1 / 60);
    g.render(ctx);
  }
  const per = (performance.now() - t0) / N;
  console.log(`${label}: ${per.toFixed(2)} мс/кадр → ~${Math.round(1000 / per)} fps (CPU, 1920×1080)`);
  return per;
}

console.log('трафик:', g.traffic.length, '| монеты:', g.coinArr.length, '| частицы:', fx.particles.length);
const a = bench('3D', '3d');
const b = bench('2D', '2d');

if (a > 30 || b > 30) {
  console.error('❌ слишком медленно даже для CPU-растеризации');
  process.exit(1);
}
console.log('✅ PERF OK');
