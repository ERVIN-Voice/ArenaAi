// ─── MOTO RUSH: гоночный движок (3D pseudo-3D + 2D top-down) ────────────────
import { TAU, clamp, lerp, damp, rand, randInt, pick, chance } from './util.js';
import { BIKES, TRAFFIC_TYPES, TRAFFIC_KEYS } from './data.js';
import { renderGame } from './render.js';
import { findCheat, applyCheatToGame } from './cheats.js';

const SEG_LEN = 200;
const RUMBLE = 3;
const ROAD_W = 2100;
const CAM_H = 1150;
const CAM_DEPTH = 0.92;
const DRAW_DIST = 170;
const CENTRI = 0.32;
const PLAYER_W = 0.34;

function lastY() { return this.segments.length ? this.segments[this.segments.length - 1].p2.world.y : 0; }

export class Game {
  constructor(opts) {
    this.w = opts.width;
    this.h = opts.height;
    this.fx = opts.fx;
    this.audio = opts.audio;
    this.input = opts.input;
    this.cb = opts.callbacks || {};
    this.best = opts.best || 0;
    this.dpr = 1;

    this.state = 'title';
    this.paused = false;
    this.mode = '3d'; // '3d' | '2d'
    this.bikeId = 'storm';
    this.themeIndex = 1; // 0 день, 1 закат, 2 ночь
    this.time = 0;
    this.animT = 0;
    this.shake = 0;
    this.uid = 0;

    // гонка
    this.position = 0;
    this.playerX = 0;
    this.speed = 0;
    this.maxSpeed = SEG_LEN * 60;
    this.distance = 0; // метры
    this.score = 0;
    this.coins = 0;
    this.hp = 100;
    this.nitro = 100;
    this.nitroActive = false;
    this.invuln = 0;
    this.wheelieTimer = 0;
    this.lean = 0;
    this.steer = 0;
    this.topSpeed = 0;
    this.nearMisses = 0;
    this.offroad = false;
    this.countdown = 0;

    this.traffic = [];
    this.coinArr = [];
    this.activeCheats = [];
    this.cheatState = {
      godUntil: 0, ghostUntil: 0, nitroUntil: 0,
      speedMul: 1, speedMulUntil: 0,
      trafficMul: 1, trafficMulUntil: 0,
      densityMul: 1, densityUntil: 0,
    };

    // совместимость / удобство
    this.player = { x: 0, y: 0, hp: 100, maxHp: 100, r: 14, angle: 0, dead: false };
    this.wave = 0;
    this.kills = 0;
    this.level = 1;

    this.hud = this._emptyHud();
    this.buildTrack();
    this.resetAmbient();
    this.updateHud();
  }

  _emptyHud() {
    return {
      speedKmh: 0, speedPct: 0, distance: 0, score: 0, coins: 0,
      nitro: 1, hp: 1, mode: '3d', bike: 'STORM 250',
      topSpeed: 0, nearMisses: 0, paused: false,
      activeCheats: [], god: false, ghost: false, nitroInf: false,
      wheelie: false, theme: 1,
    };
  }

  get bike() { return BIKES.find((b) => b.id === this.bikeId) || BIKES[0]; }

  // ── трасса ────────────────────────────────────────────────────────────────
  buildTrack() {
    this.segments = [];
    const addSeg = (curve, y) => {
      const n = this.segments.length;
      this.segments.push({
        index: n,
        p1: { world: { x: 0, y: lastY.call(this), z: n * SEG_LEN }, camera: {}, screen: {} },
        p2: { world: { x: 0, y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
        curve,
        sprites: [],
        color: Math.floor(n / RUMBLE) % 2 ? 'dark' : 'light',
      });
    };
    const addRoad = (enter, hold, leave, curve, y) => {
      const startY = lastY.call(this);
      const endY = startY + y * SEG_LEN;
      const total = enter + hold + leave;
      for (let n = 0; n < enter; n++) addSeg(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
      for (let n = 0; n < hold; n++) addSeg(curve, easeInOut(startY, endY, (enter + n) / total));
      for (let n = 0; n < leave; n++) addSeg(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
    };
    const easeIn = (a, b, p) => a + (b - a) * p * p;
    const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

    // стартовый отрезок
    addRoad(25, 25, 25, 0, 0);
    // серия поворотов и холмов
    const sections = [
      [30, 30, 30, 2, 10], [30, 30, 30, -3, 20], [25, 25, 25, 0, -15],
      [40, 40, 40, 4, 25], [30, 30, 30, -2, -20], [35, 35, 35, 5, 15],
      [25, 25, 25, 0, 30], [40, 40, 40, -4, -10], [30, 30, 30, 3, 20],
      [30, 30, 30, -5, 25], [25, 25, 25, 1, -25], [40, 40, 40, -3, 10],
      [30, 30, 30, 4, -15], [35, 35, 35, -2, 20], [25, 25, 25, 0, 0],
    ];
    for (const s of sections) addRoad(s[0], s[1], s[2], s[3], s[4]);
    this.trackLength = this.segments.length * SEG_LEN;

    // придорожные объекты
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (i % 7 === 0) seg.sprites.push({ type: pick(['palm', 'lamp', 'sign']), offset: pick([-1.6, 1.6]) });
      if (i % 23 === 0) seg.sprites.push({ type: 'rock', offset: pick([-2.4, 2.4]) });
      if (i % 31 === 0) seg.sprites.push({ type: 'billboard', offset: 2.2 });
    }
  }

  findSegment(z) {
    const n = this.segments.length;
    const idx = Math.floor((z % this.trackLength) / SEG_LEN) % n;
    return this.segments[idx];
  }

  resetAmbient() {
    this.dust = [];
    const colors = ['#ffd24a', '#ff8a3d', '#5ef1ff', '#ff4d8d'];
    for (let i = 0; i < 90; i++) {
      this.dust.push({
        x: rand(0, this.w || 1280), y: rand(0, this.h || 720),
        size: rand(0.8, 2.4), speed: rand(8, 30), phase: rand(0, TAU),
        color: pick(colors), alpha: rand(0.08, 0.3),
      });
    }
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.resetAmbient();
  }

  setMode(m) {
    if (m !== '2d' && m !== '3d') return;
    this.mode = m;
    this.cb.onBanner?.(m === '3d' ? 'РЕЖИМ 3D' : 'РЕЖИМ 2D', m === '3d' ? 'Псевдо-3D трасса' : 'Вид сверху', 'mode');
    this.updateHud();
  }

  setBike(id) {
    if (!BIKES.some((b) => b.id === id)) return;
    this.bikeId = id;
    this.updateHud();
  }

  // ── запуск ────────────────────────────────────────────────────────────────
  startRun() {
    this.position = 0;
    this.playerX = 0;
    this.speed = 0;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.hp = 100;
    this.nitro = 100;
    this.invuln = 0;
    this.wheelieTimer = 0;
    this.topSpeed = 0;
    this.nearMisses = 0;
    this.time = 0;
    this.traffic.length = 0;
    this.coinArr.length = 0;
    this.activeCheats.length = 0;
    this.cheatState = {
      godUntil: 0, ghostUntil: 0, nitroUntil: 0,
      speedMul: 1, speedMulUntil: 0,
      trafficMul: 1, trafficMulUntil: 0,
      densityMul: 1, densityUntil: 0,
    };
    this.fx?.clear?.();
    this.state = 'playing';
    this.paused = false;
    this.player.hp = 100;
    this.player.dead = false;
    // стартовый трафик и монеты впереди
    for (let i = 0; i < 10; i++) this.spawnTraffic(this.position + SEG_LEN * (18 + i * 9));
    for (let i = 0; i < 6; i++) this.spawnCoins(this.position + SEG_LEN * (14 + i * 11));
    this.cb.onState?.('playing');
    this.cb.onBanner?.('ПОЕХАЛИ!', `${this.bike.name} · ${this.mode === '3d' ? '3D' : '2D'}`, 'start');
    this.audio?.countGo?.();
    this.updateHud();
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    this.cb.onState?.(this.paused ? 'paused' : 'playing');
    if (this.paused) this.audio?.engineUpdate?.(0, false, false);
    this.audio?.click?.();
    this.updateHud();
  }

  // ── читы ──────────────────────────────────────────────────────────────────
  pushActiveCheat(cheat) {
    const dur = cheat.duration || cheat.value || 0;
    const until = dur > 0 && ['nitro_time', 'god_time', 'ghost_time', 'speed_mul', 'traffic_slow', 'density'].includes(cheat.effect)
      ? this.time + dur : 0;
    this.activeCheats = this.activeCheats.filter((c) => c.code !== cheat.code);
    this.activeCheats.push({ code: cheat.code, name: cheat.name || cheat.code, effect: cheat.effect, until });
    if (this.activeCheats.length > 8) this.activeCheats.shift();
  }

  applyCheatCode(code) {
    const cheat = findCheat(code);
    if (!cheat) {
      this.audio?.cheatFail?.();
      this.cb.onToast?.(`Код «${String(code || '').toUpperCase()}» не найден`, false);
      return { ok: false };
    }
    const res = applyCheatToGame(this, cheat);
    if (res.ok) {
      this.audio?.cheatOk?.();
      this.cb.onToast?.(res.message, true);
      this.cb.onBanner?.(`ЧИТ: ${cheat.code}`, cheat.name || '', 'cheat');
    } else {
      this.audio?.cheatFail?.();
      this.cb.onToast?.(res.message, false);
    }
    this.updateHud();
    return res;
  }

  _cheatFlags() {
    const t = this.time;
    const cs = this.cheatState;
    if (cs.speedMulUntil && t > cs.speedMulUntil) { cs.speedMul = 1; cs.speedMulUntil = 0; }
    if (cs.trafficMulUntil && t > cs.trafficMulUntil) { cs.trafficMul = 1; cs.trafficMulUntil = 0; }
    if (cs.densityUntil && t > cs.densityUntil) { cs.densityMul = 1; cs.densityUntil = 0; }
    this.activeCheats = this.activeCheats.filter((c) => !c.until || t < c.until);
    return {
      god: t < cs.godUntil,
      ghost: t < cs.ghostUntil,
      nitroInf: t < cs.nitroUntil,
    };
  }

  // ── спавн ─────────────────────────────────────────────────────────────────
  spawnTraffic(z) {
    const type = pick(TRAFFIC_KEYS);
    const t = TRAFFIC_TYPES[type];
    const base = SEG_LEN * 60;
    this.traffic.push({
      id: ++this.uid,
      z: z ?? (this.position + SEG_LEN * rand(60, DRAW_DIST)),
      x: rand(-0.82, 0.82),
      speed: base * t.speedMul * rand(0.85, 1.12),
      type, w: t.w, color: t.color, color2: t.color2,
      passed: false, wobble: rand(0, TAU),
    });
  }

  spawnCoins(z) {
    const zz = z ?? (this.position + SEG_LEN * rand(50, DRAW_DIST));
    const x = pick([-0.55, -0.2, 0.2, 0.55]);
    const n = randInt(3, 5);
    for (let i = 0; i < n; i++) {
      this.coinArr.push({ id: ++this.uid, z: zz + i * SEG_LEN * 1.2, x, taken: false, bob: rand(0, TAU) });
    }
  }

  // ── ввод ──────────────────────────────────────────────────────────────────
  _readInput() {
    const inp = this.input;
    const down = (c) => inp.down(c);
    const v = inp.virtual || {};
    let steer = 0;
    if (down('ArrowLeft') || down('KeyA') || v.left) steer -= 1;
    if (down('ArrowRight') || down('KeyD') || v.right) steer += 1;
    if (inp.moveStick?.active && Math.abs(inp.moveStick.dx) > 0.08) {
      steer += inp.moveStick.dx * inp.moveStick.mag * 1.6;
    }
    let gas = down('ArrowUp') || down('KeyW') || v.gas;
    let brake = down('ArrowDown') || down('KeyS') || v.brake;
    let nitro = down('ShiftLeft') || down('ShiftRight') || down('Shift') || down('Space') || down('KeyF') || v.nitro;
    if (inp.aimStick?.active) {
      if (inp.aimStick.dy < -0.25) gas = true;
      if (inp.aimStick.dy > 0.25) brake = true;
    }
    if (inp.isTouch && !v.brake && !down('ArrowDown') && !down('KeyS')) {
      // на таче газ автоматический, если не тормозим
      if (!inp.aimStick?.active) gas = true;
    }
    return { steer: clamp(steer, -1, 1), gas: !!gas, brake: !!brake, nitro: !!nitro };
  }

  // ── главный цикл ──────────────────────────────────────────────────────────
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    this.animT += dt;
    for (const d of this.dust) {
      d.y -= d.speed * dt;
      d.phase += dt * 2;
      if (d.y < -8) { d.y = this.h + 8; d.x = rand(0, this.w); }
    }
    if (this.state === 'title' || this.state === 'gameover') {
      this.fx?.update?.(dt);
      this.shake = Math.max(0, this.shake - dt * 20);
      this.audio?.engineUpdate?.(0, false, false);
      return;
    }
    if (this.paused || this.state !== 'playing') return;

    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.wheelieTimer = Math.max(0, this.wheelieTimer - dt);
    this.shake = Math.max(0, this.shake - dt * (this.shake * 4 + 14));
    const flags = this._cheatFlags();
    const bike = this.bike;
    const inp = this._readInput();
    this.steer = inp.steer;

    const speedMul = this.cheatState.speedMul;
    const maxSpeed = SEG_LEN * 60 * bike.maxSpeed * speedMul;
    this.maxSpeed = maxSpeed;
    const speedPct = this.speed / maxSpeed;

    // нитро
    const wantNitro = inp.nitro && this.speed > maxSpeed * 0.05 && (this.nitro > 1 || flags.nitroInf);
    this.nitroActive = !!wantNitro;
    if (this.nitroActive) {
      if (!flags.nitroInf) this.nitro = Math.max(0, this.nitro - 34 * dt);
      if (Math.random() < 0.6) {
        this.fx?.particle?.({
          x: this.w / 2 + rand(-14, 14), y: this.h * 0.86,
          vx: rand(-30, 30), vy: rand(120, 260),
          life: 0.4, size: rand(3, 6), color: pick(['#5ef1ff', '#ff8a3d', '#ffd24a']),
          drag: 0.92, glow: 1,
        });
      }
    } else {
      this.nitro = Math.min(100, this.nitro + 9 * dt);
    }

    // скорость
    const accel = (maxSpeed / 4.6) * bike.accel * (this.nitroActive ? 2.1 * bike.nitroPower : 1);
    if (inp.gas) this.speed += accel * dt;
    else this.speed -= (maxSpeed * 0.22) * dt;
    if (inp.brake) this.speed -= (maxSpeed * 1.15) * dt;
    if (this.nitroActive) this.speed += (maxSpeed * 0.55) * dt;
    this.speed = clamp(this.speed, 0, maxSpeed * (this.nitroActive ? 1.32 : 1));

    // руление + центробежная сила
    const seg = this.findSegment(this.position);
    const steerPower = 2.4 * bike.handling * (0.35 + 0.65 * Math.min(1, speedPct + 0.15));
    this.playerX += inp.steer * steerPower * dt * (this.speed > 10 ? 1 : 0.4);
    this.playerX -= speedPct * seg.curve * CENTRI * dt * 2.2 / bike.grip;
    this.playerX = clamp(this.playerX, -1.45, 1.45);
    this.lean = damp(this.lean, inp.steer * (0.25 + speedPct * 0.5), 8, dt);
    this.offroad = Math.abs(this.playerX) > 1.0;
    if (this.offroad) {
      this.speed = Math.max(this.speed - maxSpeed * 0.9 * dt, maxSpeed * 0.32);
      this.shake = Math.max(this.shake, 2.2);
      if (Math.random() < 0.4) {
        this.fx?.particle?.({
          x: this.w / 2 + rand(-40, 40), y: this.h * 0.9,
          vx: rand(-60, 60), vy: rand(-40, 20),
          life: 0.5, size: rand(2, 5), color: '#c9a86a', drag: 0.9, glow: 0.4,
        });
      }
    }

    // движение вперёд
    const dz = this.speed * dt;
    this.position = (this.position + dz) % this.trackLength;
    this.distance += dz / 55; // ~метры
    this.score += speedPct * dt * 110 * (this.wheelieTimer > 0 ? 2.2 : 1);
    const kmh = Math.round(speedPct * 330 * bike.maxSpeed * speedMul);
    if (kmh > this.topSpeed) this.topSpeed = kmh;

    // вилли вручную (R) — тратит нитро
    if (this.input.pressed?.('KeyR') && this.speed > maxSpeed * 0.45 && this.nitro > 15) {
      this.wheelieTimer = 1.6;
      this.nitro -= 12;
      this.score += 300;
      this.audio?.nearMiss?.();
    }

    // трафик
    // в 3D байк нарисован внизу экрана, что соответствует ~6 сегментам впереди камеры,
    // поэтому столкновения считаем относительно этой точки — тогда они совпадают с картинкой
    const ego = this.mode === '3d' ? SEG_LEN * 6 : 0;
    const tMul = this.cheatState.trafficMul;
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const c = this.traffic[i];
      if (!c) continue;
      c.z += c.speed * tMul * dt;
      c.wobble += dt * 0.6;
      // относительная позиция
      let rel = c.z - this.position - ego;
      if (rel < -this.trackLength / 2) rel += this.trackLength;
      if (rel < -SEG_LEN * 4) { this.traffic.splice(i, 1); continue; }
      if (rel > SEG_LEN * DRAW_DIST * 1.4) { this.traffic.splice(i, 1); continue; }
      // обгон
      if (!c.passed && rel < -SEG_LEN * 0.5) {
        c.passed = true;
        const lat = Math.abs(c.x - this.playerX);
        const t = TRAFFIC_TYPES[c.type];
        this.score += t.score;
        if (lat < c.w * 0.5 + PLAYER_W * 0.5 + 0.28 && this.speed > maxSpeed * 0.35) {
          this.nearMisses++;
          this.score += 150;
          this.audio?.nearMiss?.();
          this.fx?.text?.(this.w / 2, this.h * 0.42, 'ОБГОН! +150', '#3dffa0', 18);
        }
      }
      // столкновение
      if (rel > -SEG_LEN * 0.9 && rel < SEG_LEN * 0.9) {
        const lat = Math.abs(c.x - this.playerX);
        if (lat < (c.w + PLAYER_W) * 0.5 && this.invuln <= 0) {
          if (flags.ghost || flags.god) {
            // призрак: пролетаем, лёгкий эффект
            if (Math.random() < 0.3) {
              this.fx?.particle?.({ x: this.w / 2, y: this.h * 0.7, vx: rand(-40, 40), vy: rand(-60, 0), life: 0.4, size: 4, color: '#b98bff', drag: 0.9, glow: 1 });
            }
          } else {
            this.crash(c);
            // гибель могла перезапустить заезд из колбэка — выходим из цикла
            if (this.state !== 'playing') break;
          }
        }
      }
    }

    // спавн трафика
    const density = this.cheatState.densityMul;
    const maxTraffic = Math.round(34 * density);
    if (this.traffic.length < maxTraffic && Math.random() < 0.09 * density + 0.02) {
      this.spawnTraffic(this.position + SEG_LEN * rand(55, DRAW_DIST * 0.95));
    }
    if (Math.random() < 0.05) this.spawnCoins(this.position + SEG_LEN * rand(45, DRAW_DIST * 0.9));

    // монеты
    for (let i = this.coinArr.length - 1; i >= 0; i--) {
      const c = this.coinArr[i];
      if (!c) continue;
      c.bob += dt * 4;
      let rel = c.z - this.position - ego;
      if (rel < -this.trackLength / 2) rel += this.trackLength;
      if (rel < -SEG_LEN * 3) { this.coinArr.splice(i, 1); continue; }
      if (rel > SEG_LEN * DRAW_DIST * 1.3) { this.coinArr.splice(i, 1); continue; }
      if (Math.abs(rel) < SEG_LEN * 0.9 && Math.abs(c.x - this.playerX) < 0.42) {
        this.coinArr.splice(i, 1);
        this.coins++;
        this.score += 25;
        this.audio?.coin?.();
        this.fx?.text?.(this.w / 2 + rand(-30, 30), this.h * 0.55, '+1 ◉', '#ffd24a', 16);
        this.fx?.burst?.(this.w / 2, this.h * 0.6, 6, '#ffd24a', { speed: 140, size: 3, life: 0.35 });
      }
    }

    // синхронизация player (для тестов/совместимости)
    this.player.x = this.playerX;
    this.player.hp = this.hp;
    this.player.angle = this.lean;
    this.player.dead = this.hp <= 0;

    this.fx?.update?.(dt);
    this.audio?.engineUpdate?.(speedPct, this.nitroActive, true);
    this.updateHud();
  }

  crash(car) {
    this.hp -= 26;
    this.invuln = 1.8;
    this.speed *= 0.32;
    this.shake = 16;
    this.audio?.crash?.();
    this.fx?.burst?.(this.w / 2, this.h * 0.72, 22, '#ff4d5a', { speed: 340, size: 5, life: 0.6 });
    this.fx?.ring?.(this.w / 2, this.h * 0.72, '#ff4d5a', { r0: 8, r1: 150, life: 0.5, width: 4 });
    this.cb.onFlash?.('hit');
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    } else {
      this.cb.onBanner?.('АВАРИЯ!', `Осталось ${Math.ceil(this.hp)} HP`, 'crash');
    }
  }

  die() {
    this.state = 'gameover';
    this.player.dead = true;
    this.audio?.engineUpdate?.(0, false, false);
    this.audio?.gameOver?.();
    this.fx?.burst?.(this.w / 2, this.h * 0.7, 40, '#ff4d5a', { speed: 420, size: 6, life: 0.8 });
    const res = {
      score: Math.round(this.score),
      distance: Math.round(this.distance),
      coins: this.coins,
      topSpeed: this.topSpeed,
      nearMisses: this.nearMisses,
      best: this.best,
      newBest: false,
      mode: this.mode,
      bike: this.bike.name,
    };
    if (res.score > this.best) { this.best = res.score; res.newBest = true; }
    this.cb.onState?.('gameover');
    this.cb.onGameOver?.(res);
    this.updateHud();
  }

  updateHud() {
    const h = this.hud;
    const bike = this.bike;
    const pct = this.maxSpeed ? this.speed / this.maxSpeed : 0;
    h.speedKmh = Math.round(pct * 330 * bike.maxSpeed * this.cheatState.speedMul);
    h.speedPct = clamp(pct, 0, 1.3);
    h.distance = Math.round(this.distance);
    h.score = Math.round(this.score);
    h.coins = this.coins;
    h.nitro = this.nitro / 100;
    h.hp = clamp(this.hp / 100, 0, 1);
    h.hpVal = Math.ceil(this.hp);
    h.mode = this.mode;
    h.bike = bike.name;
    h.topSpeed = this.topSpeed;
    h.nearMisses = this.nearMisses;
    h.paused = this.paused;
    h.theme = this.themeIndex;
    const flags = this._cheatFlags();
    h.god = flags.god; h.ghost = flags.ghost; h.nitroInf = flags.nitroInf;
    h.wheelie = this.wheelieTimer > 0;
    h.activeCheats = this.activeCheats.map((c) => ({
      code: c.code, name: c.name,
      left: c.until ? Math.max(0, Math.ceil(c.until - this.time)) : 0,
    }));
    this.cb.onHud?.(h);
  }

  render(ctx) {
    renderGame(ctx, this);
  }
}
