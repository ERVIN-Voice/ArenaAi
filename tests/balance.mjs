// Баланс и производительность: бот-«средний игрок» без читов.
import { createCanvas } from '@napi-rs/canvas';

const W = 1440, H = 810;
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? createCanvas(2, 2) : {}),
  addEventListener() {}, body: {},
};
globalThis.window = { innerWidth: W, innerHeight: H, addEventListener() {}, devicePixelRatio: 1 };

const { Game } = await import('../src/game.js');
const { FX } = await import('../src/fx.js');

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const fx = new FX();

function makeInput() {
  return {
    keys: new Set(), justPressed: new Set(),
    mouse: { x: W / 2, y: H / 3, down: false }, isTouch: false,
    moveStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0 },
    aimStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0, angle: 0 },
    down(c) { return this.keys.has(c); },
    pressed(c) { return this.justPressed.has(c); },
    press(c) { this.justPressed.add(c); },
    endFrame() { this.justPressed.clear(); },
  };
}

const results = [];

for (let run = 0; run < 10; run++) {
  const input = makeInput();
  let cards = null;
  let done = false;
  const game = new Game({
    width: W, height: H, fx, audio: null, input, best: 0,
    callbacks: {
      onUpgrade: (c) => { cards = c; },
      onUpgradeEnd: () => {},
      onBanner: () => {}, onFlash: () => {}, onState: () => {}, onHud: () => {},
      onGameOver: (res) => { results.push(res); done = true; },
    },
  });
  game.dpr = 1;
  game.startRun();

  const noiseBase = Math.random() * 100;
  let aimX = W / 2, aimY = H / 2, retargetIn = 0;

  for (let f = 0; f < 60 * 400 && !done; f++) {
    if (game.state === 'upgrade') {
      if (cards && cards.length) {
        // «игрок» берёт случайную карту
        game.chooseUpgrade(cards[Math.floor(Math.random() * cards.length)]);
        cards = null;
      }
      input.endFrame();
      continue;
    }
    const p = game.player;
    const t = f / 60;
    input.keys.clear();
    if (p) {
      const near = game.nearestEnemy(p.x, p.y, 2000);
      retargetIn -= 1 / 60;
      if (near && retargetIn <= 0) {
        retargetIn = 0.22;
        const a = Math.atan2(near.y - p.y, near.x - p.x) + (Math.sin(t * 7 + noiseBase) * 0.18);
        aimX = p.x + Math.cos(a) * 400;
        aimY = p.y + Math.sin(a) * 400;
      }
      input.mouse.x = aimX;
      input.mouse.y = aimY;

      // кайтим: держим дистанцию от ближайшего
      let vx = Math.cos(t * 0.6);
      let vy = Math.sin(t * 0.6);
      if (near) {
        const d = Math.hypot(near.x - p.x, near.y - p.y);
        if (d < 230) {
          vx = (p.x - near.x) / (d || 1);
          vy = (p.y - near.y) / (d || 1);
        }
        if (d < 90 && p.dashCdTimer <= 0) input.justPressed.add('Space');
      }
      // не прижимаемся к стенам
      if (p.x < W * 0.18) vx += 0.8;
      if (p.x > W * 0.82) vx -= 0.8;
      if (p.y < H * 0.18) vy += 0.8;
      if (p.y > H * 0.82) vy -= 0.8;
      if (vx > 0.3) input.keys.add('KeyD');
      if (vx < -0.3) input.keys.add('KeyA');
      if (vy > 0.3) input.keys.add('KeyS');
      if (vy < -0.3) input.keys.add('KeyW');
      if (p.overdrive >= 100) input.justPressed.add('KeyQ');
    }
    game.update(1 / 60);
    input.endFrame();
  }
  if (!done) results.push({ score: game.score, wave: game.wave, kills: game.kills, level: game.level, timeout: true });
}

const waves = results.map((r) => r.wave);
const avg = waves.reduce((a, b) => a + b, 0) / waves.length;
console.log('── БАЛАНС (10 ранов, бот-«средний игрок») ──');
console.log('волны смертей:', waves.sort((a, b) => a - b).join(', '));
console.log('средняя волна:', avg.toFixed(1));
console.log('средние очки: ', Math.round(results.reduce((a, r) => a + r.score, 0) / results.length));
console.log('средние убийства:', Math.round(results.reduce((a, r) => a + r.kills, 0) / results.length));

// ── производительность ───────────────────────────────────────────────────
const input = makeInput();
let cards = null;
const game = new Game({
  width: W, height: H, fx, audio: null, input, best: 0,
  callbacks: { onUpgrade: (c) => { cards = c; }, onUpgradeEnd: () => {}, onBanner: () => {}, onFlash: () => {}, onState: () => {}, onHud: () => {}, onGameOver: () => {} },
});
game.dpr = 1;
game.startRun();
for (let f = 0; f < 60 * 90; f++) {
  if (game.state === 'upgrade') { if (cards) { game.chooseUpgrade(cards[0]); cards = null; } continue; }
  const p = game.player;
  if (p) {
    const near = game.nearestEnemy(p.x, p.y, 2000);
    if (near) { input.mouse.x = near.x; input.mouse.y = near.y; }
    input.keys.clear();
    input.keys.add(f % 120 < 60 ? 'KeyD' : 'KeyA');
    input.keys.add(f % 200 < 100 ? 'KeyS' : 'KeyW');
    if (p.hp < p.maxHp) p.hp = p.maxHp;
  }
  game.update(1 / 60);
  input.endFrame();
}
// прогрев
for (let i = 0; i < 30; i++) { game.update(1 / 60); game.render(ctx); }
const N = 300;
const t0 = performance.now();
for (let i = 0; i < N; i++) { game.update(1 / 60); game.render(ctx); }
const per = (performance.now() - t0) / N;
console.log('\n── ПРОИЗВОДИТЕЛЬНОСТЬ ──');
console.log('врагов:', game.enemies.length, 'частиц:', fx.particles.length, 'пуль:', game.bullets.length + game.ebullets.length);
console.log('update+render (CPU canvas 1440×810):', per.toFixed(2), 'мс/кадр ≈', Math.round(1000 / per), 'fps');
