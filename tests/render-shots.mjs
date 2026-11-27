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
  virtual: { left: false, right: false, gas: false, brake: false, nitro: false },
  isTouch: false,
  moveStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0 },
  aimStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0, angle: 0 },
  down(code) { return this.keys.has(code); },
  pressed(code) { return this.justPressed.has(code); },
  press(code) { this.justPressed.add(code); },
  endFrame() { this.justPressed.clear(); },
};

const game = new Game({
  width: W,
  height: H,
  fx,
  audio: null,
  input,
  best: 0,
  callbacks: {
    onBanner: () => {},
    onFlash: () => {},
    onState: () => {},
    onHud: () => {},
    onToast: () => {},
    onGameOver: () => {},
  },
});
game.dpr = 1;

const out = 'screenshots';
fs.mkdirSync(out, { recursive: true });

function shot(name) {
  game.render(ctx);
  fs.writeFileSync(`${out}/${name}.png`, canvas.toBuffer('image/png'));
  console.log('saved', name);
}

function step(seconds) {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) {
    input.keys.clear();
    input.keys.add('KeyW');
    if (Math.sin(f * 0.04) > 0.2) input.keys.add('KeyD');
    else if (Math.sin(f * 0.04) < -0.2) input.keys.add('KeyA');
    if (f % 90 < 40) input.keys.add('Shift');
    game.hp = 100; // держим байк живым для красивых кадров
    game.update(1 / 60);
    input.endFrame();
  }
}

// 1. титульный кадр (трасса ещё стоит)
shot('01-title-3d');

// 2. заезд днём
game.startRun();
game.themeIndex = 0;
step(6);
shot('02-race-3d-day');

// 3. закат + нитро
game.themeIndex = 1;
game.applyCheatCode('TURBO');
game.applyCheatCode('FAST');
step(3);
shot('03-race-3d-sunset');

// 4. ночь
game.themeIndex = 2;
game.applyCheatCode('GODMODE');
step(2.5);
shot('04-race-3d-night');

// 5. вид сверху
game.setMode('2d');
game.themeIndex = 1;
step(3);
shot('05-race-2d');

// 6. авария
game.setMode('3d');
game.invuln = 0;
game.crash({});
step(0.12);
shot('06-crash');

// 7. плотный трафик + монеты
game.startRun();
game.themeIndex = 2;
for (let i = 0; i < 26; i++) {
  game.spawnTraffic(game.position + 200 * (10 + i * 4));
  if (i % 3 === 0) game.spawnCoins(game.position + 200 * (12 + i * 5));
}
step(2.2);
shot('07-traffic-night');

// 8. машина прямо перед байком (проверка масштаба у камеры)
game.startRun();
game.mode = '3d';
game.themeIndex = 1;
game.playerX = 0.1;
game.speed = game.maxSpeed * 0.8;
game.traffic.length = 0;
game.coinArr.length = 0;
game.traffic.push({ id: 1, z: game.position + 1200, x: 0.1, speed: 0, type: 'truck', w: 0.92, color: '#5ef1ff', color2: '#1a4a6a', passed: false, wobble: 0 });
game.traffic.push({ id: 2, z: game.position + 1900, x: -0.6, speed: 0, type: 'car', w: 0.62, color: '#ff5a5a', color2: '#8a1f2d', passed: false, wobble: 0 });
game.updateHud();
shot('08-near-car');

console.log('готово ->', out);
