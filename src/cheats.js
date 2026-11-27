// ─── Менеджер чит-кодов: встроенные + пользовательские (localStorage) ───────
import { BUILTIN_CHEATS, CHEAT_EFFECTS, getEffect } from './data.js';

const STORAGE_KEY = 'moto.cheats.custom.v1';
const CODE_RE = /^[A-Z0-9]{3,16}$/;

export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

export function validateCode(code) {
  if (!CODE_RE.test(code)) return 'Код: 3–16 символов A–Z, 0–9';
  return null;
}

export function loadCustomCheats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c) => c && typeof c.code === 'string' && getEffect(c.effect));
  } catch {
    return [];
  }
}

export function saveCustomCheats(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function addCustomCheat({ code, name, effect, value, duration }) {
  const norm = normalizeCode(code);
  const err = validateCode(norm);
  if (err) return { ok: false, error: err };
  if (!getEffect(effect)) return { ok: false, error: 'Выбери эффект' };
  const all = listAllCheats();
  if (all.some((c) => c.code === norm)) return { ok: false, error: 'Такой код уже есть' };
  const list = loadCustomCheats();
  const cheat = {
    code: norm,
    name: String(name || '').trim().slice(0, 40) || norm,
    effect,
    value: Number(value) || 0,
    duration: Number(duration) || 0,
    builtin: false,
    createdAt: Date.now(),
  };
  list.push(cheat);
  saveCustomCheats(list);
  return { ok: true, cheat };
}

export function removeCustomCheat(code) {
  const norm = normalizeCode(code);
  const list = loadCustomCheats().filter((c) => c.code !== norm);
  saveCustomCheats(list);
  return list;
}

export function listAllCheats() {
  return [...BUILTIN_CHEATS, ...loadCustomCheats()];
}

export function findCheat(code) {
  const norm = normalizeCode(code);
  if (!norm) return null;
  return listAllCheats().find((c) => c.code === norm) || null;
}

export function describeCheat(cheat) {
  const eff = getEffect(cheat.effect);
  if (!eff) return cheat.code;
  const v = cheat.value;
  const d = cheat.duration;
  switch (cheat.effect) {
    case 'coins': return `+${v} монет`;
    case 'score': return `+${v} очков`;
    case 'nitro_time': return `Нитро ${d || v} сек`;
    case 'god_time': return `Неуязвимость ${d || v} сек`;
    case 'ghost_time': return `Призрак ${d || v} сек`;
    case 'speed_mul': return `Скорость ×${v} на ${d} сек`;
    case 'traffic_slow': return `Трафик ×${v} на ${d} сек`;
    case 'traffic_clear': return 'Убрать трафик';
    case 'repair': return `+${v} HP`;
    case 'wheelie': return `Вилла +${v} очков`;
    case 'density': return `Трафик ×${v} на ${d} сек`;
    case 'theme': return 'Сменить тему';
    default: return eff.desc;
  }
}

// Применяет чит к игре. Возвращает { ok, message }
export function applyCheatToGame(game, cheat) {
  if (!cheat) return { ok: false, message: 'Код не найден' };
  const now = game.time;
  const dur = cheat.duration || cheat.value || 0;
  const v = cheat.value;
  switch (cheat.effect) {
    case 'coins':
      game.coins += Math.round(v);
      game.fx?.text?.(game.w / 2, game.h * 0.35, `+${Math.round(v)} ◉`, '#ffd24a', 22);
      break;
    case 'score':
      game.score += Math.round(v);
      game.fx?.text?.(game.w / 2, game.h * 0.35, `+${Math.round(v)} ★`, '#5ef1ff', 22);
      break;
    case 'nitro_time':
      game.cheatState.nitroUntil = now + (dur || 10);
      game.nitro = 100;
      break;
    case 'god_time':
      game.cheatState.godUntil = now + (dur || 10);
      break;
    case 'ghost_time':
      game.cheatState.ghostUntil = now + (dur || 8);
      break;
    case 'speed_mul':
      game.cheatState.speedMul = v;
      game.cheatState.speedMulUntil = now + (dur || 15);
      break;
    case 'traffic_slow':
      game.cheatState.trafficMul = v;
      game.cheatState.trafficMulUntil = now + (dur || 10);
      break;
    case 'traffic_clear':
      game.traffic.length = 0;
      break;
    case 'repair':
      game.hp = Math.min(100, game.hp + v);
      break;
    case 'wheelie':
      game.wheelieTimer = 2.2;
      game.score += Math.round(v);
      break;
    case 'density':
      game.cheatState.densityMul = v;
      game.cheatState.densityUntil = now + (dur || 20);
      break;
    case 'theme':
      game.themeIndex = (game.themeIndex + 1) % 3;
      break;
    default:
      return { ok: false, message: 'Неизвестный эффект' };
  }
  game.pushActiveCheat(cheat);
  return { ok: true, message: `${cheat.code} — ${describeCheat(cheat)}` };
}

export { CHEAT_EFFECTS };
