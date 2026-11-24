export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 20;

export const WORLD = {
  width: 80,
  depth: 80,
  wallHeight: 6,
};

export const PLAYER = {
  radius: 0.45,
  height: 1.8,
  eyeHeight: 1.55,
  speed: 6.2,
  sprintMult: 1.55,
  hp: 100,
  respawnMs: 2200,
  fireRateMs: 140, // ms between shots
  damage: 18,
  bulletSpeed: 70,
  bulletLifeMs: 1800,
  magSize: 30,
  reloadMs: 1600,
};

export const BOT = {
  count: 6,
  namePool: ['Razor', 'Viper', 'Ghost', 'Blaze', 'Hawk', 'Frost', 'Reaper', 'Nova', 'Spike', 'Storm'],
  thinkMs: 120,
  aimError: 0.035,
  reactionMs: 220,
  preferredDist: 14,
};

export const TEAM_COLORS = [
  0x3aa7ff,
  0xff5a6a,
  0x57d38c,
  0xffc04d,
  0xc084fc,
  0x4dd0e1,
  0xff8a65,
  0xa3e635,
];

export const MSG = {
  JOIN: 'join',
  INPUT: 'input',
  SHOOT: 'shoot',
  RELOAD: 'reload',
  PING: 'ping',
  WELCOME: 'welcome',
  STATE: 'state',
  EVENT: 'event',
  PONG: 'pong',
};
