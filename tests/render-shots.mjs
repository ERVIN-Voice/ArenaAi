// Скриншоты игровых кадров через @napi-rs/canvas (только для разработки).
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';

const W = 1440;
const H = 810;

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? createCanvas(2, 2) : {}),
  addEventListener() {},
  body: {},
};
globalThis.window = { innerWidth: W, innerHeight: H, addEventListener() {}, devicePixelRatio: 1 };

const { Game } = await import('../src/game.js');
const { FX } = await import('../src/fx.js');

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const fx = new FX();
const input = {
  keys: new Set(),
  justPressed: new Set(),
  mouse: { x: W * 0.7, y: H * 0.35, down: false },
  isTouch: false,
  moveStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0 },
  aimStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0, angle: 0 },
  down(code) { return this.keys.has(code); },
  pressed(code) { return this.justPressed.has(code); },
  press(code) { this.justPressed.add(code); },
  endFrame() { this.justPressed.clear(); },
};

let onUpgradeCards = null;

const game = new Game({
  width: W,
  height: H,
  fx,
  audio: null,
  input,
  best: 0,
  callbacks: {
    onUpgrade: (cards) => { onUpgradeCards = cards; },
    onUpgradeEnd: () => {},
    onBanner: () => {},
    onFlash: () => {},
    onState: () => {},
    onHud: () => {},
    onGameOver: () => {},
  },
});
game.dpr = 1;

const out = '/tmp/shots';
fs.mkdirSync(out, { recursive: true });

function shot(name) {
  game.render(ctx);
  fs.writeFileSync(`${out}/${name}.png`, canvas.toBuffer('image/png'));
  console.log('saved', name);
}

function step(seconds, opts = {}) {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) {
    const t = f / 60;
    if (game.state === 'upgrade') {
      if (onUpgradeCards) {
        game.chooseUpgrade(onUpgradeCards[0]);
        onUpgradeCards = null;
      }
      continue;
    }
    input.keys.clear();
    const p = game.player;
    if (p) {
      const tx = W / 2 + Math.cos(t * 0.55) * W * 0.26;
      const ty = H / 2 + Math.sin(t * 0.45) * H * 0.26;
      if (p.x < tx - 26) input.keys.add('KeyD');
      if (p.x > tx + 26) input.keys.add('KeyA');
      if (p.y < ty - 26) input.keys.add('KeyS');
      if (p.y > ty + 26) input.keys.add('KeyW');
    }

    const target = game.nearestEnemy(game.player ? game.player.x : W / 2, game.player ? game.player.y : H / 2, 3000);
    if (target) {
      input.mouse.x = target.x + Math.sin(t * 3) * 20;
      input.mouse.y = target.y + Math.cos(t * 3) * 20;
    }
    if (f % 65 === 0) input.justPressed.add('Space');
    if (game.player && game.player.overdrive >= 100) input.justPressed.add('KeyQ');
    if (game.player) game.player.hp = game.player.maxHp;

    game.update(1 / 60);
    input.endFrame();
  }
}

// титульный экран
game.ambient.forEach((a, i) => { a.x = 120 + (i % 4) * 380 + Math.sin(i) * 60; a.y = 100 + Math.floor(i / 4) * 200; });
shot('01-title');

game.startRun();
step(9);
shot('02-wave-early');

// ждём плотного боя
let dense = 0;
while (game.enemies.length < 9 && dense < 60 * 90) { step(0.5); dense += 30; }
step(0.6);
shot('03-wave-mid');

// ждём босса
let guard = 0;
while (!game.boss && guard < 60 * 200) {
  step(1);
  guard += 60;
}
step(5);
shot('04-boss');

// фаза 3 + овердрайв
if (game.boss) game.boss.hp = game.boss.maxHp * 0.34;
if (game.player) game.player.overdrive = 100;
step(3);
shot('05-boss-phase3');

// витрина: элиты, аптечка, разные типы врагов
step(4);
for (const [type, dx, dy] of [['bulwark', -260, -120], ['splitter', -80, 90], ['spitter', 240, -60], ['dasher', 160, 150]]) {
  const e = game.spawnEnemy(type, W / 2 + dx, H / 2 + dy);
  if (e) { e.spawnT = 0; e.elite = true; e.hp = e.maxHp = Math.round(e.maxHp * 2.6); }
}
game.spawnPickup(W / 2 - 420, H / 2 + 40, 'health');
if (game.player) { game.player.x = W / 2; game.player.y = H / 2 + 180; }
step(0.35);
shot('06-late');

// финальный кадр смерти
if (game.player) {
  game.player.invuln = 0;
  game.player.hp = 1;
}
if (game.boss) game.boss.hp = 1;
step(0.4);
shot('07-action');

console.log('готово ->', out);
