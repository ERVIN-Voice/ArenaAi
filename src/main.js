// ─── MOTO RUSH: точка входа, интерфейс, экраны, чит-консоль ─────────────────
import { Game } from './game.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { BIKES, CHEAT_EFFECTS, getEffect } from './data.js';
import {
  addCustomCheat, removeCustomCheat, loadCustomCheats, listAllCheats,
  findCheat, describeCheat, normalizeCode,
} from './cheats.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const REC_KEY = 'moto.rush.records.v1';
const PREF_KEY = 'moto.rush.prefs.v1';

const canvas = $('#game');
const ctx = canvas.getContext('2d');
const fx = new FX();
const audio = new AudioEngine();
const input = new Input(canvas);

// ── сохранения ──────────────────────────────────────────────────────────────
function loadRecords() {
  const def = { best: 0, bestDist: 0, coins: 0 };
  try {
    const raw = localStorage.getItem(REC_KEY);
    if (!raw) return def;
    const o = JSON.parse(raw);
    return {
      best: Number(o.best) || 0,
      bestDist: Number(o.bestDist) || 0,
      coins: Number(o.coins) || 0,
    };
  } catch { return def; }
}
function saveRecords(r) {
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch { /* приватный режим */ }
}
function loadPrefs() {
  const def = { mode: '3d', bike: 'storm', muted: false };
  try {
    const o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      mode: o.mode === '2d' ? '2d' : '3d',
      bike: BIKES.some((b) => b.id === o.bike) ? o.bike : 'storm',
      muted: !!o.muted,
    };
  } catch { return def; }
}
const prefs = loadPrefs();
let records = loadRecords();
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// ── игра ────────────────────────────────────────────────────────────────────
const game = new Game({
  width: window.innerWidth || 1280,
  height: window.innerHeight || 720,
  fx, audio, input,
  best: records.best,
  // колбэки подключаем чуть ниже, когда готовы элементы интерфейса
  callbacks: {},
});
game.mode = prefs.mode;
game.bikeId = prefs.bike;
game.setBike(prefs.bike);

let overlayKind = null;
let consoleOpen = false;
let bannerTimer = 0;
let toastTimer = 0;

// ── размер канваса ──────────────────────────────────────────────────────────
function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, Math.round(rect.width || window.innerWidth || 960));
  const h = Math.max(220, Math.round(rect.height || window.innerHeight * 0.6 || 540));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  game.dpr = dpr;
  game.resize(w, h);
}
if (window.ResizeObserver) {
  new ResizeObserver(() => resize()).observe($('#app'));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ── HUD ─────────────────────────────────────────────────────────────────────
const hudEls = {
  speed: $('#speedVal'), score: $('#score'), coins: $('#coinsLabel'),
  top: $('#topLabel'), hp: $('#hpText'), hpFill: $('#hpFill'),
  nitro: $('#nitroText'), nitroFill: $('#nitroFill'),
  bike: $('#bikeLabel'), mode: $('#modeLabel'), dist: $('#distLabel'), near: $('#nearLabel'),
  active: $('#activeCheats'),
};
let lastActiveKey = '';

function syncHud(h) {
  if (!h) return;
  hudEls.speed.textContent = fmt(Math.max(0, h.speedKmh));
  hudEls.score.textContent = fmt(h.score);
  hudEls.coins.textContent = `◉ ${fmt(h.coins)}`;
  hudEls.top.textContent = `топ ${fmt(h.topSpeed)} км/ч`;
  hudEls.hp.textContent = h.hpVal ?? Math.round(h.hp * 100);
  hudEls.hpFill.style.width = `${Math.max(0, Math.min(100, h.hp * 100))}%`;
  hudEls.hpFill.style.background = h.hp > 0.6 ? '' : h.hp > 0.3 ? 'linear-gradient(90deg,#ffd24a,#ff8a3d)' : 'linear-gradient(90deg,#ff4d5a,#ff2d6a)';
  const n = Math.round(h.nitro * 100);
  hudEls.nitro.textContent = h.nitroInf ? '∞' : `${n}%`;
  hudEls.nitroFill.style.width = `${n}%`;
  hudEls.nitroFill.classList.toggle('inf', !!h.nitroInf);
  hudEls.bike.textContent = h.bike;
  hudEls.mode.textContent = h.mode === '3d' ? '3D' : '2D';
  hudEls.dist.textContent = `${fmt(h.distance)} м`;
  hudEls.near.textContent = `обгонов: ${h.nearMisses}`;

  const list = h.activeCheats || [];
  const key = list.map((c) => `${c.code}:${c.left}`).join('|');
  if (key !== lastActiveKey) {
    lastActiveKey = key;
    hudEls.active.innerHTML = list.map((c) => `
      <span class="chip-cheat">
        <b>${esc(c.code)}</b>${c.left ? `<i>${c.left}с</i>` : '<i>∞</i>'}
      </span>`).join('') + (h.god ? '<span class="chip-cheat god"><b>ЩИТ</b></span>' : '')
      + (h.ghost ? '<span class="chip-cheat ghost"><b>ПРИЗРАК</b></span>' : '');
    const side = $('#activeList');
    side.innerHTML = list.length || h.god || h.ghost
      ? list.map((c) => `<span class="active-pill"><b>${esc(c.code)}</b> ${esc(c.name)}${c.left ? ` · ${c.left}с` : ''}</span>`).join('')
        + (h.god ? '<span class="active-pill god">🛡 неуязвимость</span>' : '')
        + (h.ghost ? '<span class="active-pill ghost">◌ призрак</span>' : '')
      : '<span class="empty">—</span>';
  }
}

// ── баннеры, тосты, вспышки ─────────────────────────────────────────────────
const bannerEl = $('#banner');
function showBanner(title, sub, kind = '') {
  bannerEl.querySelector('.banner-title').textContent = title || '';
  bannerEl.querySelector('.banner-sub').textContent = sub || '';
  bannerEl.className = `banner-${kind}`;
  bannerEl.classList.add('active');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.remove('active'), 1500);
}

const toastEl = $('#toast');
function toast(msg, ok = true) {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${ok ? 'ok' : 'err'}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2400);
}

const flashEl = $('#flash');
function flash(kind = 'hit') {
  flashEl.classList.remove('hit', 'cheat');
  void flashEl.offsetWidth;
  flashEl.classList.add(kind === 'cheat' ? 'cheat' : 'hit');
}

// ── экраны-оверлеи ──────────────────────────────────────────────────────────
const overlayEl = $('#overlay');

function titleScreen() {
  const cheats = listAllCheats().filter((c) => c.builtin).slice(0, 4);
  return `
    <div class="screen">
      <div class="screen-kicker">аркадные мотогонки · canvas 2d</div>
      <h1 class="screen-title">MOTO <span>RUSH</span></h1>
      <p class="screen-text">Уходи от трафика, собирай монеты, жми нитро и вводи чит-коды.<br>Свои коды можно придумать и сохранить в разделе «Читы».</p>
      <div class="screen-chips">
        <span>🏍 ${esc(game.bike.name)}</span>
        <span>${game.mode === '3d' ? '🧊 псевдо-3D' : '🗺 вид сверху'}</span>
        <span>🏆 рекорд ${fmt(records.best)}</span>
      </div>
      <button class="btn big" data-act="start">СТАРТ ▸</button>
      <div class="screen-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> руль и газ · <kbd>SHIFT</kbd> нитро · <kbd>C</kbd> чит-консоль</div>
      <div class="screen-cheats">
        ${cheats.map((c) => `<button class="mini-cheat" data-act="cheat" data-code="${esc(c.code)}"><b>${esc(c.code)}</b><span>${esc(c.hint || c.name)}</span></button>`).join('')}
      </div>
    </div>`;
}

function pauseScreen() {
  return `
    <div class="screen">
      <div class="screen-kicker">пауза</div>
      <h2 class="screen-title small">ПЕРЕДЫШКА</h2>
      <div class="screen-chips">
        <span>счёт ${fmt(game.score)}</span><span>${fmt(Math.round(game.distance))} м</span><span>◉ ${fmt(game.coins)}</span>
      </div>
      <div class="screen-buttons">
        <button class="btn" data-act="resume">ПРОДОЛЖИТЬ</button>
        <button class="btn ghost" data-act="restart">ЗАНОВО</button>
        <button class="btn ghost" data-act="open-cheats">ЧИТ-КОНСОЛЬ</button>
      </div>
      <div class="screen-hint"><kbd>ESC</kbd> продолжить · <kbd>V</kbd> сменить 2D / 3D</div>
    </div>`;
}

function overScreen(res) {
  return `
    <div class="screen">
      <div class="screen-kicker">заезд окончен</div>
      <h2 class="screen-title small">${res.newBest ? 'НОВЫЙ РЕКОРД!' : 'ФИНИШ'}</h2>
      <div class="result-grid">
        <div><span>Счёт</span><b>${fmt(res.score)}</b></div>
        <div><span>Дистанция</span><b>${fmt(res.distance)} м</b></div>
        <div><span>Монеты</span><b>◉ ${fmt(res.coins)}</b></div>
        <div><span>Макс. скорость</span><b>${fmt(res.topSpeed)} км/ч</b></div>
        <div><span>Обгоны</span><b>${fmt(res.nearMisses)}</b></div>
        <div><span>Рекорд</span><b>${fmt(records.best)}</b></div>
      </div>
      <div class="screen-buttons">
        <button class="btn" data-act="start">ЕЩЁ ЗАЕЗД ▸</button>
        <button class="btn ghost" data-act="title">В МЕНО</button>
      </div>
      <div class="screen-hint">${esc(res.bike)} · ${res.mode === '3d' ? '3D' : '2D'} · попробуй чит <kbd>RICH</kbd> на монеты</div>
    </div>`;
}

function setOverlay(kind, html = '') {
  overlayKind = kind;
  overlayEl.innerHTML = html;
  overlayEl.classList.toggle('open', !!kind);
}
function hideOverlay(kind = null) {
  setOverlay(null);
  if (kind) overlayKind = kind;
}
function showTitle() { setOverlay('title', titleScreen()); }
function showPause() { if (!consoleOpen) setOverlay('pause', pauseScreen()); }

function onState(state) {
  if (state === 'playing') {
    hideOverlay();
    lastActiveKey = '';
  } else if (state === 'paused') {
    showPause();
  }
}

function onGameOver(res) {
  const isBest = res.score > records.best;
  records.best = Math.max(records.best, res.score);
  records.bestDist = Math.max(records.bestDist, res.distance);
  records.coins += res.coins;
  game.best = records.best;
  saveRecords(records);
  renderRecords();
  setOverlay('over', overScreen({ ...res, newBest: isBest }));
  if (isBest) flash('cheat');
}

// подключаем колбэки движка к DOM (элементы и функции уже готовы)
Object.assign(game.cb, {
  onHud: syncHud,
  onBanner: showBanner,
  onToast: (msg, ok) => toast(msg, ok),
  onFlash: flash,
  onState,
  onGameOver,
});
game.updateHud();

// ── рекорды ─────────────────────────────────────────────────────────────────
function renderRecords() {
  $('#recScore').textContent = fmt(records.best);
  $('#recDist').textContent = `${fmt(records.bestDist)} м`;
  $('#recCoins').textContent = fmt(records.coins);
}

// ── запуск / пауза ──────────────────────────────────────────────────────────
function startGame() {
  audio.init();
  audio.uiClick?.();
  game.best = records.best;
  game.startRun();
  hideOverlay();
}
function togglePause() {
  if (game.state === 'playing') game.togglePause();
}
function toggleMute() {
  audio.init();
  const muted = audio.toggleMute();
  prefs.muted = muted;
  savePrefs();
  $('#muteBtn').classList.toggle('off', muted);
  $('#muteBtn').textContent = muted ? '✕' : '♪';
  toast(muted ? 'Звук выключен' : 'Звук включён');
}

// ── 2D / 3D ─────────────────────────────────────────────────────────────────
function switchMode(m, silent = false) {
  if (!m) m = game.mode === '3d' ? '2d' : '3d';
  if (m === game.mode) return;
  game.setMode(m);
  prefs.mode = m;
  savePrefs();
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  if (!silent) toast(m === '3d' ? 'Режим 3D: псевдо-3D трасса' : 'Режим 2D: вид сверху');
  if (overlayKind === 'title') setOverlay('title', titleScreen());
}

// ── гараж ───────────────────────────────────────────────────────────────────
function renderGarage() {
  const list = $('#bikeList');
  list.innerHTML = BIKES.map((b) => {
    const stat = (v, max) => `<i style="width:${Math.round((v / max) * 100)}%"></i>`;
    return `
      <div class="bike-card ${b.id === game.bikeId ? 'selected' : ''}" data-act="bike" data-id="${b.id}" role="button" tabindex="0">
        <div class="bike-swatch" style="--c1:${b.color};--c2:${b.color2}">🏍</div>
        <div class="bike-info">
          <div class="bike-name">${esc(b.name)} ${b.id === game.bikeId ? '<em>выбран</em>' : ''}</div>
          <div class="bike-desc">${esc(b.desc)}</div>
          <div class="bike-stats">
            <span>скорость<i class="bar-mini">${stat(b.maxSpeed, 1.2)}</i></span>
            <span>разгон<i class="bar-mini">${stat(b.accel, 1.3)}</i></span>
            <span>руль<i class="bar-mini">${stat(b.handling, 1.3)}</i></span>
          </div>
        </div>
      </div>`;
  }).join('');
}
function selectBike(id) {
  if (id === game.bikeId) return;
  game.setBike(id);
  prefs.bike = id;
  savePrefs();
  audio.init();
  audio.uiClick?.();
  renderGarage();
  toast(`${game.bike.name} — в седле`);
  if (overlayKind === 'title') setOverlay('title', titleScreen());
}

// ── чит-коды: списки ────────────────────────────────────────────────────────
function cheatCard(c, custom = false) {
  return `
    <div class="cheat-card ${custom ? 'custom' : ''}" data-act="cheat" data-code="${esc(c.code)}" role="button" tabindex="0" title="Активировать ${esc(c.code)}">
      <div class="cheat-head">
        <b class="cheat-code">${esc(c.code)}</b>
        ${custom ? `<button class="cheat-del" data-act="del" data-code="${esc(c.code)}" title="Удалить">✕</button>` : '<span class="cheat-tag">встроенный</span>'}
      </div>
      <div class="cheat-name">${esc(c.name || c.code)}</div>
      <div class="cheat-desc">${esc(c.hint || describeCheat(c))}</div>
      ${custom && c.effect === 'speed_mul' ? '' : ''}
    </div>`;
}

function renderCheatLists() {
  const all = listAllCheats();
  const builtins = all.filter((c) => c.builtin);
  const customs = all.filter((c) => !c.builtin);
  $('#builtinList').innerHTML = builtins.map((c) => cheatCard(c, false)).join('');
  $('#customList').innerHTML = customs.map((c) => cheatCard(c, true)).join('');
  $('#customEmpty').style.display = customs.length ? 'none' : 'block';
  $('#customCount').textContent = customs.length ? `${customs.length}` : '';

}

// ── конструктор своих читов ────────────────────────────────────────────────
const form = $('#cheatForm');
const cfCode = $('#cfCode');
const cfName = $('#cfName');
const cfEffect = $('#cfEffect');
const cfValue = $('#cfValue');
const cfValueLabel = $('#cfValueLabel');
const cfDuration = $('#cfDuration');
const cfError = $('#cfError');

function initCheatForm() {
  cfEffect.innerHTML = CHEAT_EFFECTS.map((e) => `<option value="${e.id}">${esc(e.icon)} ${esc(e.name)}</option>`).join('');
  cfEffect.value = 'coins';
  applyEffectDefaults();
  cfEffect.addEventListener('change', () => applyEffectDefaults());
}

function applyEffectDefaults() {
  const eff = getEffect(cfEffect.value) || CHEAT_EFFECTS[0];
  cfValueLabel.textContent = eff.valueLabel || '';
  cfValue.min = eff.min;
  cfValue.max = eff.max;
  cfValue.step = eff.step;
  cfValue.value = eff.defValue;
  cfValue.disabled = eff.min === eff.max;
  cfDuration.max = eff.timed ? 120 : 0;
  cfDuration.value = eff.timed ? eff.defValue : 0;
  cfDuration.disabled = !eff.timed;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  cfError.textContent = '';
  const code = normalizeCode(cfCode.value);
  const eff = getEffect(cfEffect.value);
  if (!eff) { cfError.textContent = 'Выбери эффект'; return; }
  let value = Number(cfValue.value);
  if (!Number.isFinite(value)) value = eff.defValue;
  value = Math.min(eff.max, Math.max(eff.min, value));
  let duration = eff.timed ? Math.max(1, Math.min(120, Math.round(Number(cfDuration.value) || eff.defValue))) : 0;
  const res = addCustomCheat({ code, name: cfName.value, effect: eff.id, value, duration });
  if (!res.ok) {
    cfError.textContent = res.error;
    audio.init();
    audio.cheatFail?.();
    cfCode.focus();
    return;
  }
  audio.init();
  audio.cheatOk?.();
  renderCheatLists();
  toast(`Код ${res.cheat.code} сохранён — теперь его можно ввести`, true);
  cfCode.value = '';
  cfName.value = '';
  applyEffectDefaults();
  flash('cheat');
});

// ── чит-консоль ─────────────────────────────────────────────────────────────
const consoleEl = $('#cheatConsole');
const cheatInput = $('#cheatInput');
const cheatHistory = $('#cheatHistory');
const history = [];

let consolePausedGame = false;
function openConsole() {
  consoleEl.classList.add('open');
  consoleOpen = true;
  // пока вводим код — заезд «мягко» замирает, но экран паузы не мешает
  if (game.state === 'playing' && !game.paused) {
    game.paused = true;
    consolePausedGame = true;
  }
  setTimeout(() => cheatInput.focus(), 30);
}
function closeConsole() {
  consoleEl.classList.remove('open');
  consoleOpen = false;
  cheatInput.blur();
  if (consolePausedGame) {
    consolePausedGame = false;
    if (game.state === 'playing') game.paused = false;
  }
}
function toggleConsole() {
  if (consoleOpen) closeConsole(); else openConsole();
}

function applyCode(raw) {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, message: 'Пустой код' };
  if (!findCheat(code)) {
    audio.init();
    audio.cheatFail?.();
    toast(`Код «${code}» не найден`, false);
    return { ok: false, message: 'не найден' };
  }
  const cheat = findCheat(code);
  if (game.state !== 'playing' && cheat.effect !== 'theme') {
    toast(`Код ${code} есть! Запусти заезд — и вводи`, false);
    return { ok: false, message: 'нужен заезд' };
  }
  const res = game.applyCheatCode(code);
  return res;
}

function submitConsoleCode() {
  const raw = cheatInput.value;
  if (!raw.trim()) return;
  const res = applyCode(raw);
  history.unshift({ code: normalizeCode(raw), ok: !!res.ok });
  history.length = Math.min(history.length, 6);
  cheatHistory.innerHTML = history.map((h) => `<span class="hist ${h.ok ? 'ok' : 'err'}">${h.ok ? '✓' : '✕'} ${esc(h.code)}</span>`).join('');
  cheatInput.value = '';
  cheatInput.focus();
}

$('#cheatApply').addEventListener('click', submitConsoleCode);
$('#cheatClose').addEventListener('click', closeConsole);
cheatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitConsoleCode(); }
});
$('#cheatBtn').addEventListener('click', toggleConsole);
$('#cheatBtnTop').addEventListener('click', () => { toggleConsole(); $('#cheats').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#pauseBtn').addEventListener('click', () => { audio.init(); togglePause(); });
$('#muteBtn').addEventListener('click', toggleMute);
$$('.mode-btn').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));

// ── удаление своих кодов ────────────────────────────────────────────────────
function deleteCheat(code) {
  removeCustomCheat(code);
  renderCheatLists();
  toast(`Код ${code} удалён`, false);
  audio.init();
  audio.click?.();
}

// ── тач-кнопки ──────────────────────────────────────────────────────────────
$$('#touchPad .tbtn').forEach((btn) => {
  const key = btn.dataset.v;
  const set = (v) => { input.virtual[key] = v; btn.classList.toggle('held', v); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.isTouch = true;
    document.body.classList.add('touch');
    set(true);
    btn.setPointerCapture?.(e.pointerId);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, () => set(false)));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    input.isTouch = true;
    document.body.classList.add('touch');
  }
});

// ── делегирование кликов ────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  audio.init();
  if (act === 'start') { startGame(); return; }
  if (act === 'resume') { game.togglePause(); return; }
  if (act === 'restart') { startGame(); return; }
  if (act === 'title') { showTitle(); audio.click?.(); return; }
  if (act === 'open-cheats') { openConsole(); return; }
  if (act === 'bike') { selectBike(el.dataset.id); return; }
  if (act === 'del') {
    e.stopPropagation();
    deleteCheat(el.dataset.code);
    return;
  }
  if (act === 'cheat') {
    const code = el.dataset.code;
    const res = applyCode(code);
    if (!res.ok && game.state !== 'playing') {
      const cheat = findCheat(code);
      if (cheat) toast(`${cheat.code}: ${describeCheat(cheat)} — жми СТАРТ`, true);
    }
    return;
  }
});
document.addEventListener('keydown', (e) => {
  const tag = (e.target?.tagName || '').toLowerCase();
  const field = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (field) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (overlayKind === 'title' || overlayKind === 'over') {
      e.preventDefault();
      startGame();
    }
  }
});

// ── горячие клавиши в кадре ─────────────────────────────────────────────────
function handleHotkeys() {
  if (input.pressed('KeyC') || input.pressed('Backquote')) {
    toggleConsole();
    return;
  }
  if (input.pressed('KeyV')) switchMode();
  if (input.pressed('KeyM')) toggleMute();
  if (input.pressed('Escape')) {
    if (consoleOpen) { closeConsole(); input.keys.delete('Escape'); return; }
    if (game.state === 'playing') togglePause();
    else if (overlayKind === 'over') showTitle();
  } else if (input.pressed('KeyP')) {
    togglePause();
  }
}

// ── цикл ────────────────────────────────────────────────────────────────────
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  handleHotkeys();
  game.update(dt);
  game.render(ctx);
  input.endFrame();
  requestAnimationFrame(frame);
}

// ── инициализация ───────────────────────────────────────────────────────────
resize();
renderGarage();
renderCheatLists();
renderRecords();
initCheatForm();
$$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === game.mode));
$('#muteBtn').classList.toggle('off', prefs.muted);
audio.muted = prefs.muted;
showTitle();
syncHud(game.hud);
requestAnimationFrame(frame);

// удобно для отладки и тестов
window.__moto = { game, audio, input, fx, startGame, switchMode, applyCode, openConsole, closeConsole, records: () => records };
