// ─── Данные MOTO RUSH: байки, трафик, эффекты читов ─────────────────────────
export const BIKES = [
  {
    id: 'storm',
    name: 'STORM 250',
    desc: 'Сбалансированный городской байк. Прощает ошибки, стабилен на скорости.',
    color: '#5ef1ff',
    color2: '#1fa7ff',
    maxSpeed: 1.0,      // множитель макс. скорости
    accel: 1.0,
    handling: 1.0,
    nitroPower: 1.0,
    grip: 1.0,
  },
  {
    id: 'viper',
    name: 'VIPER 600',
    desc: 'Спортивный снаряд. Самая высокая максималка, но рулится жёстче.',
    color: '#ff4d8d',
    color2: '#ff8a3d',
    maxSpeed: 1.18,
    accel: 1.08,
    handling: 0.88,
    nitroPower: 1.1,
    grip: 0.92,
  },
  {
    id: 'hawk',
    name: 'NIGHTHAWK 1000',
    desc: 'Ночной хищник. Взрывной разгон и мощное нитро, широкая посадка.',
    color: '#b98bff',
    color2: '#5ef1ff',
    maxSpeed: 1.1,
    accel: 1.28,
    handling: 0.95,
    nitroPower: 1.45,
    grip: 1.0,
  },
  {
    id: 'cruiser',
    name: 'CRUISER X',
    desc: 'Тяжёлый круизёр. Идеальная управляемость и сцепление, медленный разгон.',
    color: '#ffd24a',
    color2: '#ff6b3d',
    maxSpeed: 0.92,
    accel: 0.85,
    handling: 1.22,
    nitroPower: 0.9,
    grip: 1.3,
  },
];

export const TRAFFIC_TYPES = {
  car:     { w: 0.62, speedMul: 0.38, color: '#ff5a5a', color2: '#8a1f2d', score: 50,  name: 'Седан' },
  taxi:    { w: 0.62, speedMul: 0.42, color: '#ffd24a', color2: '#8a6a10', score: 60,  name: 'Такси' },
  van:     { w: 0.78, speedMul: 0.34, color: '#5ef1ff', color2: '#1a4a6a', score: 80,  name: 'Фургон' },
  truck:   { w: 0.92, speedMul: 0.28, color: '#3dffa0', color2: '#14532d', score: 120, name: 'Грузовик' },
  bike:    { w: 0.34, speedMul: 0.55, color: '#ff8a3d', color2: '#7a3a10', score: 90,  name: 'Мопед' },
  police:  { w: 0.62, speedMul: 0.5,  color: '#e8fbff', color2: '#1a3a8a', score: 150, name: 'Полиция' },
};
export const TRAFFIC_KEYS = Object.keys(TRAFFIC_TYPES);

// ─── Каталог эффектов читов (для конструктора) ──────────────────────────────
// value — число, duration — секунды (0 = мгновенно / навсегда до конца заезда)
export const CHEAT_EFFECTS = [
  { id: 'coins',        name: 'Монеты',              icon: '◉', desc: 'Мгновенно +N монет',                 valueLabel: 'Монеты',      defValue: 1000, min: 10,   max: 99999, step: 10,  timed: false },
  { id: 'score',        name: 'Очки',                icon: '★', desc: 'Мгновенно +N очков',                 valueLabel: 'Очки',        defValue: 5000, min: 100,  max: 999999, step: 100, timed: false },
  { id: 'nitro_time',   name: 'Бесконечное нитро',   icon: '⚡', desc: 'Нитро без расхода N секунд',         valueLabel: 'Секунд',      defValue: 10,   min: 1,    max: 120,    step: 1,   timed: true },
  { id: 'god_time',     name: 'Неуязвимость',        icon: '🛡', desc: 'Нельзя разбить N секунд',            valueLabel: 'Секунд',      defValue: 10,   min: 1,    max: 120,    step: 1,   timed: true },
  { id: 'ghost_time',   name: 'Призрак',             icon: '◌', desc: 'Сквозь трафик N секунд',             valueLabel: 'Секунд',      defValue: 8,    min: 1,    max: 120,    step: 1,   timed: true },
  { id: 'speed_mul',    name: 'Буст скорости',        icon: '➤', desc: 'Макс. скорость ×N на M секунд',     valueLabel: 'Множитель',   defValue: 1.5,  min: 1.05, max: 3,      step: 0.05, timed: true },
  { id: 'traffic_slow', name: 'Замедлить трафик',    icon: '❄', desc: 'Трафик едет ×N медленнее M секунд',  valueLabel: 'Множитель',   defValue: 0.5,  min: 0.05, max: 0.95, step: 0.05, timed: true },
  { id: 'traffic_clear',name: 'Чистая дорога',       icon: '✦', desc: 'Убрать весь трафик с трассы',        valueLabel: '—',           defValue: 0,    min: 0,    max: 0,      step: 1,   timed: false },
  { id: 'repair',       name: 'Ремонт',               icon: '✚', desc: 'Восстановить N HP',                valueLabel: 'HP',          defValue: 50,   min: 5,    max: 100,   step: 5,   timed: false },
  { id: 'wheelie',      name: 'Вилла (wheelie)',     icon: '▲', desc: 'Встать на заднее колесо, +N очков', valueLabel: 'Очки',        defValue: 1000, min: 100, max: 99999, step: 100, timed: false },
  { id: 'density',      name: 'Плотность трафика',   icon: '▦', desc: 'Трафика ×N на M секунд',             valueLabel: 'Множитель',   defValue: 0.3,  min: 0,    max: 3,      step: 0.1, timed: true },
  { id: 'theme',        name: 'Сменить тему',        icon: '☀', desc: 'День → закат → ночь (цикл)',       valueLabel: '—',           defValue: 0,    min: 0,    max: 0,      step: 1,   timed: false },
];

export const getEffect = (id) => CHEAT_EFFECTS.find((e) => e.id === id);

// ─── Встроенные коды ─────────────────────────────────────────────────────────
export const BUILTIN_CHEATS = [
  { code: 'TURBO',      name: 'Турбо-нитpо',   effect: 'nitro_time',   value: 10,   duration: 10,  builtin: true, hint: '10 сек бесконечного нитро' },
  { code: 'GODMODE',    name: 'Божественный',  effect: 'god_time',     value: 10,   duration: 10,  builtin: true, hint: '10 сек неуязвимости' },
  { code: 'GHOST',      name: 'Призрак',       effect: 'ghost_time',   value: 8,    duration: 8,   builtin: true, hint: '8 сек сквозь трафик' },
  { code: 'RICH',       name: 'Богач',         effect: 'coins',        value: 5000, duration: 0,   builtin: true, hint: '+5000 монет' },
  { code: 'FAST',       name: 'Форсаж',        effect: 'speed_mul',    value: 1.5,  duration: 15,  builtin: true, hint: 'Скорость ×1.5 на 15 сек' },
  { code: 'SLOWMO',     name: 'Замедление',    effect: 'traffic_slow', value: 0.4,  duration: 10,  builtin: true, hint: 'Трафик ×0.4 на 10 сек' },
  { code: 'CLEARROAD',  name: 'Чистая дорога', effect: 'traffic_clear',value: 0,    duration: 0,   builtin: true, hint: 'Убрать весь трафик' },
  { code: 'WHEELIE',    name: 'Вилла!',        effect: 'wheelie',      value: 1500, duration: 0,   builtin: true, hint: '+1500 очков за виллу' },
  { code: 'REPAIR',     name: 'Ремонт',         effect: 'repair',       value: 50,   duration: 0,   builtin: true, hint: '+50 HP' },
  { code: 'NIGHT',      name: 'Ночной режим',  effect: 'theme',        value: 0,    duration: 0,   builtin: true, hint: 'Сменить время суток' },
];
