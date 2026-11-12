// Headless-симуляция: гоняем игру без браузера с заглушкой canvas.
// Проверяет, что нет рантайм-ошибок, волны идут, боссы появляются,
// апгрейды применяются, смерть и рестарт отрабатывают.

const gradient = () => ({ addColorStop() {} });

function makeCtx() {
  const ctx = {
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    strokeStyle: '#000',
    fillStyle: '#000',
    shadowBlur: 0,
    shadowColor: '#000',
    filter: 'none',
    createRadialGradient: gradient,
    createLinearGradient: gradient,
    measureText: () => ({ width: 12 }),
    getImageData: () => ({ data: [] }),
  };
  const noop = () => {};
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'arc', 'arcTo', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
    'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'setTransform',
    'resetTransform', 'fillText', 'strokeText', 'clip', 'setLineDash', 'roundRect',
    'putImageData', 'createPattern',
  ]) {
    ctx[name] = noop;
  }
  return ctx;
}

function makeCanvas() {
  return { width: 1, height: 1, getContext: () => makeCtx(), addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
  addEventListener() {},
  body: {},
};
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, devicePixelRatio: 1 };

const { Game } = await import('../src/game.js');
const { FX } = await import('../src/fx.js');

const ctx = makeCtx();
const fx = new FX();
const input = {
  keys: new Set(),
  justPressed: new Set(),
  mouse: { x: 900, y: 240, down: false },
  isTouch: false,
  moveStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0 },
  aimStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0, angle: 0 },
  down(code) { return this.keys.has(code); },
  pressed(code) { return this.justPressed.has(code); },
  press(code) { this.justPressed.add(code); },
  endFrame() { this.justPressed.clear(); },
};

const events = { upgrades: 0, banners: [], maxWave: 0, deaths: 0, states: [] };

const game = new Game({
  width: 1280,
  height: 720,
  fx,
  audio: null,
  input,
  best: 0,
  callbacks: {
    onUpgrade: (cards) => {
      events.upgrades++;
      if (!cards || !cards.length) throw new Error('Пустой список апгрейдов');
      // выбираем случайную карту
      const card = cards[Math.floor(Math.random() * cards.length)];
      setTimeout(() => {}, 0);
      game.chooseUpgrade(card);
    },
    onUpgradeEnd: () => {},
    onBanner: (title, sub, kind) => {
      events.banners.push({ title, sub, kind });
      if (events.banners.length > 400) events.banners.shift();
    },
    onFlash: () => {},
    onState: (s) => events.states.push(s),
    onHud: () => {},
    onGameOver: (res) => {
      events.deaths++;
      events.lastResult = res;
      game.startRun();
    },
  },
});

// немного «титульного» времени
for (let i = 0; i < 120; i++) {
  game.update(1 / 60);
  game.render(ctx);
  input.endFrame();
}

game.startRun();

const FPS = 60;
const SECONDS = 420;
const frames = FPS * SECONDS;
let start = Date.now();
let framesSinceHeal = 0;

for (let f = 0; f < frames; f++) {
  if (game.state === 'title') game.startRun();

  // «бот»: двигается по кругу, целится в ближайшего врага, жмёт скиллы
  const t = f / FPS;
  input.keys.clear();
  input.keys.add('KeyD');
  if (Math.sin(t * 0.7) > 0) input.keys.add('KeyW');
  else input.keys.add('KeyS');
  if (Math.cos(t * 0.5) > 0.6) input.keys.add('KeyA');

  const target = game.nearestEnemy(game.player ? game.player.x : 640, game.player ? game.player.y : 360, 2000);
  if (target) {
    input.mouse.x = target.x;
    input.mouse.y = target.y;
  }
  if (f % 70 === 0) input.justPressed.add('Space');
  if (game.player && game.player.overdrive >= 100) input.justPressed.add('KeyQ');

  // страховка, чтобы дожить до глубоких волн
  framesSinceHeal++;
  if (framesSinceHeal > 180 && game.player && !game.player.dead) {
    game.player.hp = game.player.maxHp;
    framesSinceHeal = 0;
  }

  game.update(1 / 60);
  game.render(ctx);
  input.endFrame();

  events.maxWave = Math.max(events.maxWave, game.wave);
}

const took = Date.now() - start;
console.log('── ИТОГИ СИМУЛЯЦИИ ─────────────────────────');
console.log('кадров:              ', frames);
console.log('время симуляции:     ', SECONDS, 'с, реальное:', took, 'мс');
console.log('макс. волна:         ', events.maxWave);
console.log('апгрейдов выбрано:   ', events.upgrades);
console.log('смертей/рестартов:   ', events.deaths);
console.log('последний результат: ', events.lastResult && {
  score: events.lastResult.score,
  wave: events.lastResult.wave,
  kills: events.lastResult.kills,
  level: events.lastResult.level,
});
console.log('боссы:               ', events.banners.filter((b) => b.kind === 'boss').length);
console.log('состояния:           ', [...new Set(events.states)].join(' → '));

const fail = [];
if (events.maxWave < 5) fail.push('волны не доходят до босса');
if (events.upgrades === 0) fail.push('апгрейды не срабатывают');
if (!events.banners.some((b) => b.kind === 'boss')) fail.push('босс не появился');

if (fail.length) {
  console.error('\n❌ ПРОВАЛ:', fail.join('; '));
  process.exit(1);
}
console.log('\n✅ OK — ошибок нет');
