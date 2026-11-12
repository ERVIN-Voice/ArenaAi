export const ARENA_PAD = 26;

// ─── Палитра ───────────────────────────────────────────────────────────────
export const PALETTE = {
  bg: '#04050c',
  grid: '#0e2a44',
  player: '#5ef1ff',
  playerCore: '#ffffff',
  bullet: '#8ffbff',
  crit: '#fff2a8',
  enemyBullet: '#ff5a8a',
  orb: '#5dffc4',
  hp: '#ff4d7d',
  energy: '#42e9ff',
  od: '#ffd24a',
  boss: '#ff2f6d',
  white: '#ffffff',
};

// ─── Типы врагов ───────────────────────────────────────────────────────────
export const ENEMY_TYPES = {
  drifter: {
    sides: 3, r: 15, hp: 22, speed: 108, dmg: 9, color: '#ff4d8d',
    xp: 1, score: 20, cost: 1, name: 'Дрейф',
  },
  spitter: {
    sides: 4, r: 16, hp: 30, speed: 82, dmg: 10, color: '#ffb020',
    xp: 2, score: 35, cost: 2, name: 'Стрелок',
  },
  dasher: {
    sides: 4, r: 15, hp: 26, speed: 78, dmg: 16, color: '#b16bff',
    xp: 2, score: 42, cost: 2, name: 'Рывок',
  },
  splitter: {
    sides: 6, r: 21, hp: 58, speed: 64, dmg: 12, color: '#3dffa0',
    xp: 3, score: 55, cost: 3, name: 'Деление',
  },
  bulwark: {
    sides: 5, r: 28, hp: 155, speed: 52, dmg: 20, color: '#ff6b3d',
    xp: 5, score: 95, cost: 4, name: 'Танк',
  },
  shard: {
    sides: 3, r: 9, hp: 10, speed: 158, dmg: 7, color: '#9dffcf',
    xp: 1, score: 15, cost: 0, name: 'Осколок',
  },
};

// ─── Улучшения ─────────────────────────────────────────────────────────────
export const RARITY = {
  common: { label: 'ОБЫЧНОЕ', weight: 58, color: '#7fe7ff' },
  rare: { label: 'РЕДКОЕ', weight: 30, color: '#b98bff' },
  epic: { label: 'ЭПИЧЕСКОЕ', weight: 12, color: '#ffcb4d' },
};

export const UPGRADES = [
  {
    id: 'dmg', name: 'ФОКУС ЛУЧА', icon: '✦', rarity: 'common', max: 6,
    desc: '+22% урона выстрелов',
    apply: (p) => { p.damage *= 1.22; },
  },
  {
    id: 'rate', name: 'БЫСТРЫЙ ЦИКЛ', icon: '⚡', rarity: 'common', max: 6,
    desc: '+15% скорострельности',
    apply: (p) => { p.fireDelay *= 0.85; },
  },
  {
    id: 'speed', name: 'ЛЁГКИЙ КОРПУС', icon: '➤', rarity: 'common', max: 4,
    desc: '+9% скорости перемещения',
    apply: (p) => { p.speed *= 1.09; },
  },
  {
    id: 'hp', name: 'РЕЗЕРВ', icon: '❤', rarity: 'common', max: 5,
    desc: '+25 к максимуму HP, лечит 25',
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'heal', name: 'РЕГЕНЕРАЦИЯ', icon: '✚', rarity: 'rare', max: 3,
    desc: '+1.5 HP в секунду',
    apply: (p) => { p.regen += 1.5; },
  },
  {
    id: 'pierce', name: 'ПРОБОЙ', icon: '⤳', rarity: 'rare', max: 3,
    desc: 'Пули пробивают +1 цель',
    apply: (p) => { p.pierce += 1; },
  },
  {
    id: 'ricochet', name: 'РИКОШЕТ', icon: '⤡', rarity: 'rare', max: 3,
    desc: 'Пули отскакивают от стен +1',
    apply: (p) => { p.ricochet += 1; },
  },
  {
    id: 'crit', name: 'КРИТ. ЯДРО', icon: '◈', rarity: 'rare', max: 4,
    desc: '+12% шанс крита (x2.5 урона)',
    apply: (p) => { p.critChance += 0.12; },
  },
  {
    id: 'dash', name: 'ИМПУЛЬС', icon: '»', rarity: 'rare', max: 3,
    desc: 'Рывок перезаряжается на 25% быстрее',
    apply: (p) => { p.dashCd *= 0.75; },
  },
  {
    id: 'energy', name: 'БУСТЕР', icon: '⌁', rarity: 'rare', max: 3,
    desc: '+30% энергии и её регенерации',
    apply: (p) => { p.maxEnergy *= 1.3; p.energyRegen *= 1.3; p.energy = p.maxEnergy; },
  },
  {
    id: 'magnet', name: 'ГРАВИТАЦИЯ', icon: '◉', rarity: 'common', max: 2,
    desc: 'Радиус сбора осколков x1.8',
    apply: (p) => { p.magnetR *= 1.8; },
  },
  {
    id: 'slow', name: 'КРИО-ПОПАДАНИЕ', icon: '❄', rarity: 'rare', max: 2,
    desc: 'Попадания замедляют врагов',
    apply: (p) => { p.slowOnHit += 1; },
  },
  {
    id: 'multishot', name: 'РАССЕИВАНИЕ', icon: '⋔', rarity: 'epic', max: 3,
    desc: '+1 пуля за выстрел',
    apply: (p) => { p.shots += 1; p.spread = Math.max(p.spread, 0.14); },
  },
  {
    id: 'blade', name: 'ОРБИТАЛЬНЫЙ КЛИНОК', icon: '✧', rarity: 'epic', max: 3,
    desc: '+1 клинок кружит вокруг тебя',
    apply: (p) => { p.blades += 1; },
  },
  {
    id: 'explosive', name: 'ДЕТОНАТОР', icon: '☄', rarity: 'epic', max: 2,
    desc: 'Пули взрываются при попадании',
    apply: (p) => { p.explosive += 1; },
  },
  {
    id: 'lifesteal', name: 'ВАМПИРИЗМ', icon: '♨', rarity: 'epic', max: 2,
    desc: '2% нанесённого урона возвращается в HP',
    apply: (p) => { p.lifesteal += 0.02; },
  },
  {
    id: 'shield', name: 'ЩИТ-ФАНТОМ', icon: '⬡', rarity: 'epic', max: 2,
    desc: 'Поглощает удар, восстанавливается за 9с',
    apply: (p) => { p.shieldMax += 1; p.shield = p.shieldMax; },
  },
  {
    id: 'overdrive', name: 'СВЕРХПРОВОДНИК', icon: '◎', rarity: 'rare', max: 2,
    desc: 'Овердрайв заряжается на 35% быстрее',
    apply: (p) => { p.odMul += 0.35; },
  },
];

export const getUpgradeById = (id) => UPGRADES.find((u) => u.id === id);
