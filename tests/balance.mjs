// Баланс: сравниваем байки и режимы. Обновлений без рендера — быстро и стабильно.
const W = 1280, H = 720;
globalThis.document = {
  createElement: () => ({}),
  addEventListener() {}, body: {},
};
globalThis.window = { innerWidth: W, innerHeight: H, addEventListener() {}, devicePixelRatio: 1 };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Game } = await import('../src/game.js');
const { FX } = await import('../src/fx.js');
const { BIKES } = await import('../src/data.js');

function makeInput() {
  return {
    keys: new Set(), justPressed: new Set(), virtual: {}, isTouch: false,
    moveStick: { active: false, dx: 0, dy: 0, mag: 0 },
    aimStick: { active: false, dx: 0, dy: 0, mag: 0 },
    down(c) { return this.keys.has(c); },
    pressed(c) { return this.justPressed.has(c); },
    endFrame() { this.justPressed.clear(); },
  };
}

// «Средний игрок»: держится центра, объезжает ближайшую машину, иногда жмёт нитро.
function botSteer(game, input) {
  let targetX = 0;
  let bestRel = Infinity;
  for (const car of game.traffic) {
    let rel = car.z - game.position;
    if (rel < -game.trackLength / 2) rel += game.trackLength;
    if (rel < 0 || rel > 3000) continue;
    if (rel < bestRel) { bestRel = rel; targetX = car.x > 0 ? car.x - 0.7 : car.x + 0.7; }
  }
  targetX = Math.max(-0.8, Math.min(0.8, targetX));
  input.keys.clear();
  input.keys.add('KeyW');
  const dx = targetX - game.playerX;
  if (dx > 0.05) input.keys.add('KeyD');
  else if (dx < -0.05) input.keys.add('KeyA');
  if (game.nitro > 60) input.keys.add('Shift');
}

function simulate(bikeId, mode, seconds = 90) {
  const fx = new FX();
  const input = makeInput();
  const result = { bikeId, mode, distance: 0, score: 0, crashes: 0, gameovers: 0, maxSpeed: 0 };
  const game = new Game({
    width: W, height: H, fx, audio: null, input, best: 0,
    callbacks: {
      onBanner: (t) => { if (t === 'АВАРИЯ!') result.crashes++; },
      onState: (s) => { if (s === 'gameover') result.gameovers++; },
      onGameOver: () => { game.startRun(); },
      onHud: () => {}, onToast: () => {}, onFlash: () => {},
    },
  });
  game.bikeId = bikeId;
  game.setMode(mode);
  game.startRun();
  const frames = seconds * 60;
  for (let f = 0; f < frames; f++) {
    if (game.state !== 'playing') game.startRun();
    botSteer(game, input);
    game.update(1 / 60);
    input.endFrame();
    result.distance = Math.max(result.distance, Math.round(game.distance));
    result.score = Math.max(result.score, Math.round(game.score));
    result.maxSpeed = Math.max(result.maxSpeed, game.hud.speedKmh);
  }
  return result;
}

const rows = [];
for (const bike of BIKES) rows.push(simulate(bike.id, '3d'));
rows.push(simulate('storm', '2d'));

console.log('── БАЛАНС MOTO RUSH (90 с на конфигурацию) ─────────────────');
console.log('байк        режим   дистанция   счёт    аварий  макс.км/ч');
for (const r of rows) {
  console.log(
    r.bikeId.padEnd(11),
    r.mode.padEnd(6),
    String(r.distance).padStart(8),
    String(r.score).padStart(8),
    String(r.crashes).padStart(7),
    String(r.maxSpeed).padStart(8),
  );
}

const fail = [];
for (const r of rows) {
  if (r.distance < 400) fail.push(`${r.bikeId}/${r.mode}: слишком малая дистанция`);
  if (r.maxSpeed < 80) fail.push(`${r.bikeId}/${r.mode}: не разгоняется`);
}
const speeds = new Set(rows.filter((r) => r.mode === '3d').map((r) => r.maxSpeed));
if (speeds.size < 2) fail.push('байки не отличаются по динамике');

if (fail.length) {
  console.error('\n❌ ПРОВАЛ:', fail.join('; '));
  process.exit(1);
}
console.log('\n✅ BALANCE OK');
