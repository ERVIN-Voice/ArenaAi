// ─── Точка входа: canvas, игровой цикл и весь DOM-интерфейс ─────────────────
import { FX } from './fx.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { withAlpha } from './util.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const overlay = document.getElementById('overlay');
const upgradesEl = document.getElementById('upgrades');
const cardsEl = document.getElementById('cards');
const bannerEl = document.getElementById('banner');
const bannerTitle = bannerEl.querySelector('.banner-title');
const bannerSub = bannerEl.querySelector('.banner-sub');
const flashEl = document.getElementById('flash');
const body = document.body;

const ui = {
  hpFill: document.getElementById('hpFill'),
  hpText: document.getElementById('hpText'),
  energyFill: document.getElementById('energyFill'),
  energyText: document.getElementById('energyText'),
  odFill: document.getElementById('odFill'),
  odText: document.getElementById('odText'),
  odStat: document.getElementById('odStat'),
  score: document.getElementById('score'),
  wave: document.getElementById('waveLabel'),
  lvl: document.getElementById('lvlLabel'),
  xpFill: document.getElementById('xpFill'),
  combo: document.getElementById('combo'),
  comboVal: document.getElementById('comboVal'),
  bossWrap: document.getElementById('bossWrap'),
  bossFill: document.getElementById('bossFill'),
  bossPhase: document.getElementById('bossPhase'),
  hints: document.getElementById('hints'),
};

const BOSS_PHASES = ['ФАЗА I', 'ФАЗА II', 'ФАЗА III'];
const BEST_KEY = 'neonvoid.best.v1';

const fx = new FX();
const audio = new AudioEngine();
const input = new Input(canvas);

let best = 0;
try {
  best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
} catch (e) {
  best = 0;
}

let dpr = 1;
let game = null;
let lastCombo = 0;
let lastScore = -1;
let lastHpText = -1;
let hintsTimer = null;
let audioUnlocked = false;

// ── canvas ─────────────────────────────────────────────────────────────────
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  if (game) {
    game.dpr = dpr;
    game.resize(w, h);
  }
}

resize();

game = new Game({
  width: window.innerWidth,
  height: window.innerHeight,
  fx,
  audio,
  input,
  best,
  callbacks: {
    onHud: updateHud,
    onBanner: showBanner,
    onUpgrade: showUpgrades,
    onUpgradeEnd: hideUpgrades,
    onState: handleState,
    onFlash: flash,
    onGameOver: handleGameOver,
  },
});
game.dpr = dpr;

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ── звук ───────────────────────────────────────────────────────────────────
function unlockAudio() {
  if (audioUnlocked) {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  audioUnlocked = true;
  try {
    audio.init();
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    if (audio.ready && audio.musicOn && !audio.timer) audio.startMusic();
  } catch (e) {
    /* без звука тоже играем */
  }
}
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

function toggleMute() {
  const muted = audio.toggleMute();
  const btn = document.getElementById('muteBtn');
  if (btn) {
    btn.textContent = muted ? '✕' : '♪';
    btn.style.opacity = muted ? '0.45' : '1';
  }
  if (!muted) audio.init();
}

// ── HUD ────────────────────────────────────────────────────────────────────
function updateHud(h) {
  ui.hpFill.style.width = (h.hp * 100).toFixed(1) + '%';
  if (lastHpText !== h.hpVal) {
    ui.hpText.textContent = h.hpVal;
    lastHpText = h.hpVal;
  }
  ui.energyFill.style.width = (h.energy * 100).toFixed(1) + '%';
  ui.energyText.textContent = Math.round(h.energy * 100) + '%';
  ui.odFill.style.width = (h.overdrive * 100).toFixed(1) + '%';
  ui.odText.textContent = Math.round(h.overdrive * 100) + '%';
  ui.odStat.classList.toggle('ready', !!h.odReady);
  ui.odStat.classList.toggle('active', h.odActive > 0);

  if (lastScore !== h.score) {
    ui.score.textContent = h.score.toLocaleString('ru-RU');
    lastScore = h.score;
  }
  ui.wave.textContent = 'ВОЛНА ' + Math.max(1, h.wave);
  ui.lvl.textContent = 'УР. ' + h.level;
  ui.xpFill.style.width = (h.xp * 100).toFixed(1) + '%';

  if (h.combo >= 3) {
    ui.combo.classList.add('show');
    ui.comboVal.textContent = 'x' + h.comboMul.toFixed(1);
    if (h.combo > lastCombo) {
      ui.combo.classList.add('pulse');
      setTimeout(() => ui.combo.classList.remove('pulse'), 110);
    }
  } else {
    ui.combo.classList.remove('show');
  }
  lastCombo = h.combo;

  if (h.boss) {
    ui.bossWrap.classList.add('show');
    ui.bossFill.style.width = (h.boss.hp * 100).toFixed(1) + '%';
    ui.bossPhase.textContent = BOSS_PHASES[h.boss.phase - 1] || 'ФАЗА I';
  } else {
    ui.bossWrap.classList.remove('show');
  }
}

// ── баннер ─────────────────────────────────────────────────────────────────
const BANNER_COLORS = {
  wave: '#5ef1ff',
  boss: '#ff2f6d',
  clear: '#3dffa0',
  start: '#5ef1ff',
  phase: '#ffd24a',
  od: '#ffd24a',
};

function showBanner(title, sub, kind = 'wave') {
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerTitle.textContent = title;
  bannerSub.textContent = sub || '';
  bannerEl.style.setProperty('--bc', BANNER_COLORS[kind] || '#5ef1ff');
  bannerEl.classList.add('show');
}

// ── вспышки ────────────────────────────────────────────────────────────────
const FLASH_COLORS = {
  hit: 'rgba(255,45,90,0.2)',
  level: 'rgba(255,214,90,0.16)',
  od: 'rgba(255,200,90,0.3)',
  boss: 'rgba(255,255,255,0.4)',
  death: 'rgba(255,255,255,0.55)',
};

function flash(kind) {
  flashEl.style.transition = 'none';
  flashEl.style.background = FLASH_COLORS[kind] || 'rgba(255,255,255,0.3)';
  flashEl.style.opacity = '1';
  void flashEl.offsetWidth;
  flashEl.style.transition = kind === 'hit' ? 'opacity 0.5s ease-out' : 'opacity 0.6s ease-out';
  flashEl.style.opacity = '0';
}

// ── экраны ─────────────────────────────────────────────────────────────────
function hideOverlay() {
  overlay.classList.remove('active');
  overlay.innerHTML = '';
}

function showTitle() {
  body.classList.remove('playing');
  overlay.innerHTML = `
    <div class="screen">
      <div class="logo"><span class="a">NEON</span><span class="b">VOID</span></div>
      <p class="tag">
        Последний живой осколок света в мёртвой сети.<br />
        Геометрия идёт за твоим ядром — держись, собирай осколки, становись сильнее.
      </p>
      <div class="controls">
        <span><kbd>WASD</kbd> движение</span>
        <span><kbd>МЫШЬ</kbd> прицел · автоогонь</span>
        <span><kbd>SHIFT</kbd> замедление времени</span>
        <span><kbd>ПРОБЕЛ</kbd> рывок</span>
        <span><kbd>Q</kbd> овердрайв</span>
        <span><kbd>ESC</kbd> пауза</span>
      </div>
      <div class="touch-hint">На телефоне: левый палец — движение, правый — прицел, кнопки справа — рывок и овердрайв</div>
      <button class="btn" id="startBtn">В БОЙ</button>
      <div class="best">ЛУЧШИЙ РЕЗУЛЬТАТ <b>${best.toLocaleString('ru-RU')}</b></div>
    </div>`;
  overlay.classList.add('active');
  document.getElementById('startBtn').addEventListener('click', startGame);
}

function showPause() {
  body.classList.remove('playing');
  overlay.innerHTML = `
    <div class="screen">
      <div class="pause-title">ПАУЗА</div>
      <div class="gameover-sub">система приостановлена</div>
      <div class="btn-row">
        <button class="btn" id="resumeBtn">ПРОДОЛЖИТЬ</button>
        <button class="btn ghost" id="restartBtn">ЗАНОВО</button>
      </div>
    </div>`;
  overlay.classList.add('active');
  document.getElementById('resumeBtn').addEventListener('click', () => game.togglePause());
  document.getElementById('restartBtn').addEventListener('click', startGame);
}

function handleGameOver(res) {
  if (res.score > best) {
    best = res.score;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (e) {
      /* ignore */
    }
    game.best = best;
  }
  audio.stopMusic();
  body.classList.remove('playing');
  const stats = [
    ['ОЧКИ', res.score],
    ['ВОЛНА', res.wave],
    ['УНИЧТОЖЕНО', res.kills],
    ['УРОВЕНЬ', res.level],
  ];
  overlay.innerHTML = `
    <div class="screen">
      <div class="gameover-title">СИГНАЛ ПОТЕРЯН</div>
      <div class="gameover-sub">ядро уничтожено</div>
      ${res.newBest ? '<div class="new-best">НОВЫЙ РЕКОРД</div>' : ''}
      <div class="stats-grid">
        ${stats.map(([k, v]) => `<div class="stat-cell"><div class="k">${k}</div><div class="v">${v.toLocaleString('ru-RU')}</div></div>`).join('')}
      </div>
      <div class="btn-row">
        <button class="btn" id="retryBtn">ЕЩЁ РАЗ</button>
      </div>
      <div class="best">ЛУЧШИЙ РЕЗУЛЬТАТ <b>${best.toLocaleString('ru-RU')}</b></div>
    </div>`;
  overlay.classList.add('active');
  document.getElementById('retryBtn').addEventListener('click', startGame);
}

// ── апгрейды ───────────────────────────────────────────────────────────────
let currentCards = [];

function showUpgrades(cards) {
  currentCards = cards;
  body.classList.remove('playing');
  cardsEl.innerHTML = cards.map((c, i) => `
    <button class="card" data-i="${i}" style="--c:${c.rarityColor};--cg:${withAlpha(c.rarityColor, 0.28)}">
      <div class="card-rarity">${c.rarityLabel}</div>
      <div class="card-icon">${c.icon}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-desc">${c.desc}</div>
      <div class="card-foot">
        <span>${c.stack > 0 ? `УРОВЕНЬ ${c.stack} → ${c.stack + 1}` : 'НОВОЕ'}</span>
        <span class="num">${i + 1}</span>
      </div>
    </button>`).join('');
  upgradesEl.classList.add('active');
}

function hideUpgrades() {
  upgradesEl.classList.remove('active');
  body.classList.add('playing');
}

function pickCard(i) {
  if (game.state !== 'upgrade') return;
  const card = currentCards[i];
  if (!card) return;
  audio.uiClick();
  game.chooseUpgrade(card);
  if (game.state !== 'upgrade') hideUpgrades();
}

cardsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.card');
  if (!btn) return;
  pickCard(parseInt(btn.dataset.i, 10));
});

// ── состояния ──────────────────────────────────────────────────────────────
function handleState(state) {
  if (state === 'playing') {
    hideOverlay();
    upgradesEl.classList.remove('active');
    body.classList.add('playing');
  } else if (state === 'paused') {
    showPause();
  } else if (state === 'dying' || state === 'gameover') {
    body.classList.remove('playing');
  }
}

function startGame() {
  unlockAudio();
  hideOverlay();
  upgradesEl.classList.remove('active');
  currentCards = [];
  lastCombo = 0;
  lastScore = -1;
  body.classList.add('playing');
  input.justPressed.clear();
  game.best = best;
  game.fx.clear();
  game.startRun();
  audio.init();
  if (audio.ready) audio.startMusic();

  ui.hints.classList.remove('hidden');
  clearTimeout(hintsTimer);
  hintsTimer = setTimeout(() => ui.hints.classList.add('hidden'), 14000);
}

// ── ввод интерфейса ────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  unlockAudio();

  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.state === 'playing') game.togglePause();
    else if (game.paused) game.togglePause();
    return;
  }
  if (e.code === 'KeyM') {
    toggleMute();
    return;
  }
  if (e.code === 'KeyR' && (game.state === 'gameover' || game.paused)) {
    startGame();
    return;
  }
  if (game.state === 'upgrade') {
    if (e.code === 'Digit1' || e.code === 'Numpad1') pickCard(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') pickCard(1);
    if (e.code === 'Digit3' || e.code === 'Numpad3') pickCard(2);
    return;
  }
  if (game.state === 'title' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
    startGame();
  } else if (game.state === 'gameover' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
    startGame();
  }
});

document.getElementById('muteBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
});
document.getElementById('pauseBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.state === 'playing') game.togglePause();
});

// мобильные кнопки
for (const btn of document.querySelectorAll('#touchPad .tbtn')) {
  const fire = (e) => {
    e.preventDefault();
    unlockAudio();
    input.press(btn.dataset.code);
  };
  btn.addEventListener('pointerdown', fire);
}

// пауза при потере фокуса
window.addEventListener('blur', () => {
  if (game.state === 'playing' && !game.paused) game.togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !game.paused) game.togglePause();
});

// тач-режим
if (matchMedia('(hover: none)').matches || 'ontouchstart' in window) {
  body.classList.add('touch');
  input.isTouch = true;
}

// ── игровой цикл ───────────────────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  game.render(ctx);
  input.endFrame();
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);

// отладочный доступ из консоли
window.__neon = { game, fx, audio, input };
