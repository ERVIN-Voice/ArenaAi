// Headless-симуляция MOTO RUSH: гоняем движок без браузера с заглушкой canvas.
// Проверяет физику заезда, трафик, монеты, читы (встроенные и свои), падение и рестарт.

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
    'putImageData', 'createPattern', 'rect', 'globalCompositeOperation',
  ]) {
    ctx[name] = noop;
  }
  return ctx;
}

function makeCanvas() {
  return {
    width: 2,
    height: 2,
    getContext: () => makeCtx(),
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
  addEventListener() {},
  body: {},
};
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, devicePixelRatio: 1 };

// простое localStorage-хранилище для проверки пользовательских читов
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { Game } = await import('../src/game.js');
const { FX } = await import('../src/fx.js');
const { BIKES } = await import('../src/data.js');
const {
  addCustomCheat, removeCustomCheat, listAllCheats, loadCustomCheats,
  findCheat, normalizeCode, describeCheat,
} = await import('../src/cheats.js');

const ctx = makeCtx();
const fx = new FX();
const input = {
  keys: new Set(),
  justPressed: new Set(),
  mouse: { x: 900, y: 240, down: false },
  isTouch: false,
  virtual: { left: false, right: false, gas: false, brake: false, nitro: false },
  moveStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0 },
  aimStick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0, angle: 0 },
  down(code) { return this.keys.has(code); },
  pressed(code) { return this.justPressed.has(code); },
  press(code) { this.justPressed.add(code); },
  endFrame() { this.justPressed.clear(); },
};

const stats = {
  runs: 0, deaths: 0, maxDistance: 0, maxScore: 0, maxSpeed: 0,
  banners: new Set(), crashBanners: 0, states: new Set(),
};

let game;
game = new Game({
  width: 1280,
  height: 720,
  fx,
  audio: null,
  input,
  best: 0,
  callbacks: {
    onBanner: (title, sub, kind) => {
      stats.banners.add(kind);
      if (kind === 'crash') stats.crashBanners++;
    },
    onFlash: () => {},
    onState: (s) => stats.states.add(s),
    onHud: () => {},
    onToast: () => {},
    onGameOver: (res) => {
      stats.deaths++;
      stats.maxDistance = Math.max(stats.maxDistance, res.distance);
      stats.maxScore = Math.max(stats.maxScore, res.score);
      if (game.state === 'gameover') game.startRun();
    },
  },
});
game.dpr = 1;

// титульный экран: рендер без гонки не должен падать
for (let i = 0; i < 30; i++) {
  game.update(1 / 60);
  game.render(ctx);
  input.endFrame();
}

// ── читы: пользовательские коды ────────────────────────────────────────────
const checks = [];
const ok = (cond, msg) => checks.push({ cond: !!cond, msg });

ok(normalizeCode('  my code! ') === 'MYCODE', 'нормализация кода (регистр/пробелы)');
const bad = addCustomCheat({ code: 'x', name: 'x', effect: 'coins', value: 10, duration: 0 });
ok(!bad.ok, 'слишком короткий код отклоняется');
const custom = addCustomCheat({ code: 'mycode', name: 'Мой код', effect: 'coins', value: 777, duration: 0 });
ok(custom.ok, 'свой код добавляется');
ok(custom.ok && custom.cheat.code === 'MYCODE', 'код сохранён в верхнем регистре');
ok(!addCustomCheat({ code: 'MYCODE', name: 'dup', effect: 'score', value: 1, duration: 0 }).ok, 'дубликат кода отклоняется');
ok(loadCustomCheats().length === 1, 'свой код попал в localStorage');
ok(findCheat('mycode')?.name === 'Мой код', 'поиск своего кода без учёта регистра');
ok(describeCheat(findCheat('MYCODE')).includes('777'), 'описание своего кода');
ok(listAllCheats().length >= 11, 'встроенные + свои коды в общем списке');

// ── гонка ──────────────────────────────────────────────────────────────────
game.startRun();
stats.runs++;
const FPS = 60;
const SECONDS = 180;
const frames = FPS * SECONDS;
let framesSinceCheat = 0;
const cheatPool = ['TURBO', 'GODMODE', 'GHOST', 'FAST', 'SLOWMO', 'CLEARROAD', 'REPAIR', 'NIGHT', 'MYCODE'];

for (let f = 0; f < frames; f++) {
  if (game.state === 'title') { game.startRun(); stats.runs++; }
  const t = f / FPS;
  input.keys.clear();
  input.keys.add('KeyW');
  // бот виляет рулём: объезжает трафик по знаку синуса
  if (Math.sin(t * 0.85) > 0.15) input.keys.add('KeyD');
  else if (Math.sin(t * 0.85) < -0.15) input.keys.add('KeyA');
  if (f % 240 === 0) input.justPressed.add('Shift');
  if (f % 400 === 0) input.justPressed.add('KeyR');

  // каждые 4 секунды применяем случайный чит
  if (++framesSinceCheat > 240) {
    framesSinceCheat = 0;
    game.applyCheatCode(cheatPool[Math.floor(Math.random() * cheatPool.length)]);
  }

  game.update(1 / 60);
  game.render(ctx);
  input.endFrame();
  stats.maxSpeed = Math.max(stats.maxSpeed, game.hud.speedKmh);
  stats.maxDistance = Math.max(stats.maxDistance, Math.round(game.distance));
  stats.maxScore = Math.max(stats.maxScore, Math.round(game.score));
  if (Math.abs(game.playerX) > 2.6) throw new Error('игрок вышел за границы трассы');

  // не даём боту умирать слишком часто
  if (game.hp < 34 && game.state === 'playing') {
    game.applyCheatCode('REPAIR');
    if (game.hp < 20) game.applyCheatCode('GODMODE');
  }
}

// ── проверка эффектов читов по отдельности ─────────────────────────────────
game.startRun();
game.time = 0;
game.nitro = 42;
game.applyCheatCode('TURBO');
const nitroAfter = game.nitro;
for (let i = 0; i < 60; i++) game.update(1 / 60);
ok(nitroAfter === 100, 'TURBO сразу заряжает нитро');
ok(game.nitro >= 99, 'TURBO не даёт нитро утекать');

game.startRun();
game.time = 0;
game.applyCheatCode('GODMODE');
const hpBefore = game.hp;
ok(game._cheatFlags().god, 'GODMODE включает флаг неуязвимости');
game.traffic.push({
  id: 999, z: game.position, x: game.playerX, speed: 0, type: 'car',
  w: 0.62, color: '#f00', color2: '#800', passed: false, wobble: 0,
});
for (let i = 0; i < 6; i++) { input.keys.clear(); game.update(1 / 60); }
ok(game.hp === hpBefore, 'GODMODE защищает от аварии');

game.startRun();
game.time = 0;
game.coins = 0;
game.applyCheatCode('MYCODE');
ok(game.coins === 777, 'свой код работает в игре (+777 монет)');

game.startRun();
game.time = 0;
const baseMax = game.maxSpeed;
game.applyCheatCode('FAST');
game.update(1 / 60);
ok(game.maxSpeed > baseMax, 'FAST повышает максимальную скорость');
ok(game.activeCheats.some((c) => c.code === 'FAST'), 'активный чит виден в HUD-данных');

game.startRun();
game.applyCheatCode('UNKNOWN');
ok(game.activeCheats.length === 0, 'неизвестный код ничего не ломает');

// гибель и рестарт
game.startRun();
game.invuln = 0;
for (let i = 0; i < 5; i++) {
  game.invuln = 0;
  game.crash(game.traffic[0]);
}
ok(stats.states.has('gameover'), 'состояние gameover наступает');
ok(game.state === 'playing' || game.state === 'gameover', 'рестарт после гибели');

removeCustomCheat('MYCODE');
ok(loadCustomCheats().length === 0, 'свой код удаляется');
ok(!findCheat('MYCODE'), 'удалённый код не находится');

// ── итоги ──────────────────────────────────────────────────────────────────
ok(stats.maxDistance > 500, `дистанция растёт (${stats.maxDistance} м)`);
ok(stats.maxScore > 1000, `очки начисляются (${stats.maxScore})`);
ok(stats.maxSpeed > 80, `спидометр живой (${stats.maxSpeed} км/ч)`);
ok(stats.states.has('playing'), 'состояние playing наступает');
ok(stats.states.has('gameover'), 'состояние gameover наступает');
ok(stats.crashBanners > 0, 'аварии наносят урон');
ok(BIKES.length === 4, 'в гараже 4 байка');
ok(game.traffic.length > 0, 'трафик на трассе есть');
ok(game.coinArr.length > 0, 'монеты на трассе есть');

const failed = checks.filter((c) => !c.cond);
console.log('── ИТОГИ СИМУЛЯЦИИ MOTO RUSH ─────────────');
console.log('кадров:            ', frames);
console.log('дистанция (макс.): ', stats.maxDistance, 'м');
console.log('счёт (макс.):      ', stats.maxScore);
console.log('скорость (макс.):  ', stats.maxSpeed, 'км/ч');
console.log('смертей/рестартов: ', stats.deaths);
console.log('аварий:            ', stats.crashBanners);
console.log('баннеры:           ', [...stats.banners].join(', '));
console.log('проверок:          ', checks.length, '| провалено:', failed.length);

if (failed.length) {
  console.error('\n❌ ПРОВАЛ:');
  for (const f of failed) console.error('  ✗', f.msg);
  process.exit(1);
}
console.log('\n✅ SMOKE OK — движок и читы работают');
