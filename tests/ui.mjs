// Интеграционный тест интерфейса: поднимаем index.html в jsdom,
// подменяем canvas-контекст, гоняем кадры и проверяем экраны и чит-консоль.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;

// ── заглушка 2D-контекста ─────────────────────────────────────────────────
const gradient = () => ({ addColorStop() {} });
function makeCtx() {
  const ctx = {
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
    createRadialGradient: gradient,
    createLinearGradient: gradient,
    measureText: () => ({ width: 10 }),
  };
  for (const n of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath', 'arc',
    'arcTo', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'fill',
    'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'setTransform',
    'resetTransform', 'fillText', 'strokeText', 'clip', 'setLineDash', 'roundRect', 'rect',
  ]) ctx[n] = () => {};
  return ctx;
}
window.HTMLCanvasElement.prototype.getContext = () => makeCtx();
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 };
};
window.HTMLElement.prototype.scrollIntoView = function () {};
window.HTMLElement.prototype.setPointerCapture = function () {};

// ── управляемые rAF и время ───────────────────────────────────────────────
let simNow = 0;
let rafCb = null;
const raf = (cb) => { rafCb = cb; return 1; };

// ── глобальное окружение ──────────────────────────────────────────────────
window.addEventListener = () => {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.requestAnimationFrame = raf;
globalThis.performance = { now: () => simNow };
globalThis.matchMedia = window.matchMedia;

const errors = [];
process.on('unhandledRejection', (e) => errors.push(String(e)));
process.on('uncaughtException', (e) => errors.push(String(e)));

await import('../src/main.js');

const app = window.__moto;
const game = app.game;
const input = app.input;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const fire = (el, type, ev = {}) => {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, ev);
  el.dispatchEvent(e);
  return e;
};
function tick(frames = 1, stepMs = 16.7) {
  for (let i = 0; i < frames; i++) {
    simNow += stepMs;
    const cb = rafCb;
    rafCb = null;
    if (cb) cb(simNow);
  }
}

const checks = [];
const ok = (cond, msg) => {
  checks.push({ cond: !!cond, msg });
  if (!cond) console.error('  ✗', msg);
};

// 1. титульный экран
tick(3);
ok(game.state === 'title', 'игра стартует в состоянии title');
ok($('overlay').classList.contains('open'), 'титульный оверлей открыт');
ok(!!doc.querySelector('[data-act="start"]'), 'кнопка СТАРТ отрисована');
ok($('overlay').textContent.includes('MOTO'), 'на титуле написано MOTO RUSH');
ok($('bikeList').children.length === 4, 'в гараже 4 байка');

// 2. старт
doc.querySelector('[data-act="start"]').click();
tick(3);
ok(game.state === 'playing', 'старт игры по кнопке');
ok(!$('overlay').classList.contains('open'), 'оверлей скрыт после старта');

// 3. HUD живёт
input.keys.add('KeyW');
tick(180); // ~3 секунды
ok(game.hud.speedKmh > 0, 'байк разгоняется');
ok($('speedVal').textContent.trim().length > 0, 'спидометр выводится');
ok(parseFloat($('hpFill').style.width) === 100, 'полоса прочности заполнена');
ok(parseFloat($('nitroFill').style.width) > 0, 'полоса нитро заполнена');
ok($('distLabel').textContent.includes('м'), 'дистанция обновляется');

// 4. чит-консоль и встроенный код
$('cheatBtn').click();
tick(1);
ok($('cheatConsole').classList.contains('open'), 'чит-консоль открывается');
game.hp = 100;
game.invuln = 99;
game.traffic.length = 0;
game.coins = 0;
game.updateHud();
$('cheatInput').value = 'rich';
$('cheatApply').click();
tick(2);
ok(game.coins >= 5000, 'код RICH начисляет 5000 монет');
ok($('cheatHistory').textContent.includes('RICH'), 'история консоли пишет код');
ok($('activeCheats').textContent.includes('RICH'), 'активный чит виден в HUD');
app.closeConsole();

// 5. конструктор своих кодов
$('cfCode').value = 'testgo';
$('cfName').value = 'Тестовый чит';
$('cfEffect').value = 'coins';
fire($('cfEffect'), 'change');
$('cfValue').value = '777';
fire($('cheatForm'), 'submit');
tick(1);
const saved = JSON.parse(window.localStorage.getItem('moto.cheats.custom.v1') || '[]');
ok(saved.length === 1 && saved[0].code === 'TESTGO', 'свой код сохранён в localStorage (TESTGO)');
ok($('customList').textContent.includes('TESTGO'), 'свой код появился в списке');
ok($('customCount').textContent === '1', 'счётчик своих кодов обновился');

const coinsBefore = game.coins;
app.openConsole();
$('cheatInput').value = 'TESTGO';
$('cheatApply').click();
tick(2);
ok(game.coins >= coinsBefore + 777, 'свой код работает в игре (+777)');
app.closeConsole();

// 6. ошибки в форме
$('cfCode').value = 'a';
$('cfName').value = 'bad';
fire($('cheatForm'), 'submit');
tick(1);
ok($('cfError').textContent.length > 0, 'короткий код даёт ошибку в форме');

// 7. режим 2D / 3D
$('mode2d').click();
tick(2);
ok(game.mode === '2d', 'переключение в 2D');
ok($('modeLabel').textContent === '2D', 'лейбл режима обновился');
ok($('mode2d').classList.contains('active'), 'кнопка 2D активна');
$('mode3d').click();
tick(2);
ok(game.mode === '3d', 'переключение обратно в 3D');
ok(JSON.parse(window.localStorage.getItem('moto.rush.prefs.v1') || '{}').mode === '3d', 'режим сохраняется');

// 8. гараж
doc.querySelector('[data-act="bike"][data-id="viper"]').click();
tick(1);
ok(game.bikeId === 'viper', 'выбор байка применяется');
ok($('bikeLabel').textContent.includes('VIPER'), 'HUD показывает выбранный байк');

// 9. пауза
$('pauseBtn').click();
tick(1);
ok(game.paused, 'игра на паузе');
ok($('overlay').classList.contains('open'), 'экран паузы показан');
doc.querySelector('[data-act="resume"]').click();
tick(2);
ok(!game.paused && game.state === 'playing', 'снятие с паузы');

// 10. гибель и рестарт
game.hp = 50;
game.invuln = 0;
game.crash(game.traffic[0]);
game.invuln = 0;
game.crash(game.traffic[0]);
tick(2);
ok(game.state === 'gameover', 'при нуле HP наступает gameover');
ok($('overlay').classList.contains('open'), 'экран результатов показан');
ok($('overlay').textContent.includes('ЕЩЁ ЗАЕЗД'), 'кнопка рестарта есть');
const rec = JSON.parse(window.localStorage.getItem('moto.rush.records.v1') || '{}');
ok(Number(rec.best) > 0, 'рекорд сохранён в localStorage');
ok($('recScore').textContent.trim() !== '', 'рекорд выводится в сайдбаре');

doc.querySelector('[data-act="start"]').click();
tick(30);
ok(game.state === 'playing', 'рестарт работает');
ok(game.hp === 100, 'новый заезд с полной прочностью');

// 11. звук и горячие клавиши
$('muteBtn').click();
ok($('muteBtn').classList.contains('off'), 'кнопка звука переключается');
input.press('KeyC');
tick(1);
ok($('cheatConsole').classList.contains('open'), 'клавиша C открывает чит-консоль');
input.press('Escape');
tick(1);
ok(!$('cheatConsole').classList.contains('open'), 'Escape закрывает консоль');

tick(90);
ok(errors.length === 0, 'нет ошибок в процессе: ' + errors.join(' | '));

const failed = checks.filter((c) => !c.cond);
console.log('── UI ТЕСТ MOTO RUSH ─────────────────────');
console.log(`проверок: ${checks.length}, провалено: ${failed.length}`);
console.log(`состояние: ${game.state}, счёт: ${Math.round(game.score)}, скорость: ${game.hud.speedKmh} км/ч`);
if (failed.length) {
  console.error('❌ ' + failed.map((f) => f.msg).join('\n❌ '));
  process.exit(1);
}
console.log('✅ UI OK');
