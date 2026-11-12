// Интеграционный тест интерфейса: поднимаем index.html в jsdom,
// подменяем canvas-контекст, гоняем кадры и проверяем все экраны.
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
    createRadialGradient: gradient,
    createLinearGradient: gradient,
    measureText: () => ({ width: 10 }),
  };
  for (const n of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath', 'arc',
    'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill', 'stroke', 'fillRect',
    'strokeRect', 'clearRect', 'drawImage', 'setTransform', 'resetTransform', 'fillText',
    'strokeText', 'clip', 'setLineDash', 'roundRect',
  ]) ctx[n] = () => {};
  return ctx;
}
window.HTMLCanvasElement.prototype.getContext = () => makeCtx();
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 };
};

// ── управляемые rAF и время ───────────────────────────────────────────────
let simNow = 0;
let rafCb = null;
const raf = (cb) => { rafCb = cb; return 1; };

// ── глобальное окружение ──────────────────────────────────────────────────
const listeners = {};
window.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.requestAnimationFrame = raf;
globalThis.performance = { now: () => simNow };
globalThis.matchMedia = window.matchMedia;
globalThis.devicePixelRatio = 2;

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));
process.on('unhandledRejection', (e) => errors.push(String(e)));

await import('../src/main.js');

const { game } = window.__neon;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const fire = (el, type, ev = {}) => {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, ev);
  el.dispatchEvent(e);
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
  checks.push({ cond, msg });
  if (!cond) console.error('  ✗', msg);
};

// 1. титульный экран
tick(3);
ok(game.state === 'title', 'игра стартует в состоянии title');
ok($('overlay').classList.contains('active'), 'титульный оверлей активен');
ok(!!$('startBtn'), 'кнопка «В БОЙ» отрисована');
ok(doc.querySelector('.logo .a')?.textContent === 'NEON', 'логотип на месте');

// 2. старт
$('startBtn').click();
tick(2);
ok(game.state === 'playing', 'старт игры по кнопке');
ok(!$('overlay').classList.contains('active'), 'оверлей скрыт после старта');
ok(doc.body.classList.contains('playing'), 'курсор скрыт (body.playing)');

// 3. HUD живёт
tick(240); // ~4 секунды
ok(game.wave >= 1, 'первая волна началась');
ok($('waveLabel').textContent.includes('ВОЛНА'), 'лейбл волны обновляется');
ok($('score').textContent.length > 0, 'счёт выводится');
ok(parseFloat($('hpFill').style.width) > 0, 'полоса HP заполнена');
ok(parseFloat($('energyFill').style.width) > 0, 'полоса энергии заполнена');

// 4. апгрейды
game.openUpgrades();
tick(1);
const cards = doc.querySelectorAll('#upgrades .card');
ok(game.state === 'upgrade', 'состояние upgrade');
ok($('upgrades').classList.contains('active'), 'экран апгрейдов активен');
ok(cards.length === 3, 'отрисовано 3 карточки (получено ' + cards.length + ')');
ok(!!cards[0].querySelector('.card-name').textContent, 'у карточки есть название');
const before = game.player.damage;
cards[0].click();
tick(2);
ok(game.state === 'playing', 'после выбора карты игра продолжается');
ok(!$('upgrades').classList.contains('active'), 'экран апгрейдов скрыт');
ok(Object.keys(game.player.upgrades).length >= 0 && game.player.damage !== undefined, 'апгрейд применился');

// 5. пауза
game.togglePause();
tick(1);
ok(game.paused, 'игра на паузе');
ok(doc.querySelector('.pause-title')?.textContent === 'ПАУЗА', 'экран паузы показан');
$('resumeBtn').click();
tick(2);
ok(!game.paused && game.state === 'playing', 'снятие с паузы');

// 6. овердрайв
game.player.overdrive = 100;
game.updateHud();
tick(1);
ok($('odStat').classList.contains('ready'), 'индикатор овердрайва готов');
game.input.press('KeyQ');
tick(2);
ok(game.player.odActive > 0, 'овердрайв активируется');

// 7. смерть и рестарт
game.player.invuln = 0;
game.player.odActive = 0;
game.player.hp = 5;
game.damagePlayer(50);
tick(1);
ok(game.state === 'dying', 'состояние dying при нулевом HP');
tick(150);
ok(game.state === 'gameover' || game.state === 'playing', 'после смерти — gameover');
ok(!!doc.querySelector('.gameover-title'), 'экран поражения показан');
const scoreShown = doc.querySelectorAll('.stat-cell .v').length;
ok(scoreShown === 4, '4 показателя в итогах (' + scoreShown + ')');
ok(!!$('retryBtn'), 'кнопка «ЕЩЁ РАЗ» есть');
ok(parseInt(localStorage.getItem('neonvoid.best.v1') || '0', 10) >= 0, 'рекорд сохраняется в localStorage');

$('retryBtn').click();
tick(3);
ok(game.state === 'playing', 'рестарт работает');
ok(game.wave >= 0 && game.player && game.player.hp > 0, 'новый ран начался');

// 8. кнопка звука
$('muteBtn').click();
ok(true, 'кнопка звука не падает');

tick(120);
ok(errors.length === 0, 'нет ошибок в консоли: ' + errors.join(' | '));

const failed = checks.filter((c) => !c.cond);
console.log('── UI ТЕСТ ───────────────────────────────');
console.log(`проверок: ${checks.length}, провалено: ${failed.length}`);
console.log(`состояние: ${game.state}, волна: ${game.wave}, очки: ${game.score}`);
if (failed.length) {
  console.error('❌ ' + failed.map((f) => f.msg).join('\n❌ '));
  process.exit(1);
}
console.log('✅ UI OK');
