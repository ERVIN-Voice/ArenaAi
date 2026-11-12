// ─── Ядро игры: симуляция, волны, враги, боссы, апгрейды ────────────────────
import {
  TAU, clamp, lerp, damp, rand, randInt, pick, chance,
  dist, dist2, angleTo,
} from './util.js';
import { PALETTE, ENEMY_TYPES, UPGRADES, RARITY, ARENA_PAD } from './data.js';
import { renderGame } from './render.js';

const DASH_COST = 14;
const DASH_TIME = 0.16;
const DASH_SPEED = 1500;
const SLOW_DRAIN = 30;

function makePlayer(x, y) {
  return {
    x, y, r: 13, angle: -Math.PI / 2,
    hp: 100, maxHp: 100, speed: 330,
    damage: 11, fireDelay: 0.135, fireTimer: 0,
    bulletSpeed: 1040, bulletSize: 4.2,
    pierce: 0, ricochet: 0, shots: 1, spread: 0,
    critChance: 0.05, critMult: 2.5,
    explosive: 0, lifesteal: 0, slowOnHit: 0,
    blades: 0, bladeAngle: 0, bladePts: [],
    dashCd: 1.15, dashCdTimer: 0, dashTimer: 0, dashDirX: 1, dashDirY: 0, dashGhostT: 0, dashHits: new Set(),
    energy: 100, maxEnergy: 100, energyRegen: 20, bulletTime: false,
    invuln: 0, shield: 0, shieldMax: 0, shieldCd: 9, shieldTimer: 0,
    magnetR: 105, odMul: 1, regen: 0,
    overdrive: 0, odActive: 0,
    hitFlash: 0, dead: false, upgrades: {},
    thrust: 0, recoil: 0,
  };
}

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
    this.animT = 0;
    this.time = 0;
    this.timeAlive = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.slowmo = 0;
    this.bulletTime = false;
    this.damageFlash = 0;
    this.odFlash = 0;
    this.uid = 0;

    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.orbs = [];
    this.ghosts = [];
    this.portals = [];
    this.pickups = [];
    this.boss = null;

    this.wave = 0;
    this.waveQueue = [];
    this.waveActive = false;
    this.spawnTimer = 0;
    this.spawnInterval = 1;
    this.intermission = 0;
    this.minionTimer = 0;

    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.xp = 0;
    this.xpNext = 12;
    this.level = 1;
    this.deathTimer = 0;
    this.newBest = false;
    this.upgradeCards = null;

    this.hud = {
      hp: 1, hpVal: 100, maxHp: 100, energy: 1, overdrive: 0, odReady: false, odActive: 0,
      dashCd: 1, bulletTime: false, shield: 0, shieldMax: 0,
      score: 0, wave: 0, level: 1, combo: 0, comboMul: 1, xp: 0,
      boss: null, paused: false,
    };

    this.ambient = [];
    this.dust = [];
    this.resetAmbient();
    this.updateHud();
  }

  resetAmbient() {
    this.ambient = [];
    this.dust = [];
    const colors = ['#5ef1ff', '#ff4d8d', '#b98bff', '#3dffa0', '#ffd24a'];
    for (let i = 0; i < 170; i++) {
      this.dust.push({
        x: rand(0, this.w), y: rand(0, this.h),
        size: rand(0.7, 2.3), speed: rand(5, 24), phase: rand(0, TAU),
        twinkle: rand(0.6, 2.2),
        color: pick(colors), alpha: rand(0.1, 0.42),
      });
    }
    for (let i = 0; i < 16; i++) {
      this.ambient.push({
        x: rand(0, this.w), y: rand(0, this.h),
        r: rand(14, 46), sides: randInt(3, 6), rot: rand(0, TAU),
        spin: rand(-0.5, 0.5), vx: rand(-22, 22), vy: rand(-16, 16),
        color: pick(colors), alpha: rand(0.05, 0.16),
      });
    }
  }

  updateAmbient(dt) {
    for (const d of this.dust) {
      d.y -= d.speed * dt;
      d.phase += dt * d.twinkle;
      if (d.y < -10) {
        d.y = this.h + 10;
        d.x = rand(0, this.w);
      }
    }
    for (const a of this.ambient) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.spin * dt;
      if (a.x < -80) a.x = this.w + 80;
      if (a.x > this.w + 80) a.x = -80;
      if (a.y < -80) a.y = this.h + 80;
      if (a.y > this.h + 80) a.y = -80;
    }
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    if (this.player) {
      this.player.x = clamp(this.player.x, ARENA_PAD + this.player.r, w - ARENA_PAD - this.player.r);
      this.player.y = clamp(this.player.y, ARENA_PAD + this.player.r, h - ARENA_PAD - this.player.r);
    }
  }

  // ── запуск ───────────────────────────────────────────────────────────────
  startRun() {
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.ebullets.length = 0;
    this.orbs.length = 0;
    this.ghosts.length = 0;
    this.portals.length = 0;
    this.pickups.length = 0;
    this.boss = null;
    this.fx.clear();

    this.player = makePlayer(this.w / 2, this.h / 2 + 40);
    this.player.invuln = 1.2;

    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.xp = 0;
    this.xpNext = 12;
    this.level = 1;
    this.wave = 0;
    this.waveQueue.length = 0;
    this.waveActive = false;
    this.intermission = 1.1;
    this.spawnTimer = 0;
    this.time = 0;
    this.timeAlive = 0;
    this.deathTimer = 0;
    this.hitstop = 0;
    this.shake = 0;
    this.slowmo = 0;
    this.paused = false;
    this.newBest = false;
    this.upgradeCards = null;
    this.state = 'playing';

    this.cb.onState?.('playing');
    this.cb.onBanner?.('СИСТЕМА В СЕТИ', 'Уничтожай. Собирай. Расти.', 'start');
    this.audio?.startMusic();
    this.updateHud();
  }

  // ── главный цикл ─────────────────────────────────────────────────────────
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    this.animT += dt;
    this.updateAmbient(dt);

    if (this.state === 'title' || this.state === 'gameover') {
      this.fx.update(dt);
      this.shake = Math.max(0, this.shake - dt * 20);
      return;
    }
    if (this.paused || this.state === 'upgrade') return;
    if (this.state === 'dying') {
      this.updateDying(dt);
      return;
    }
    if (this.state !== 'playing') return;

    let ts = 1;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      ts = 0.14;
    }
    const pdt = dt * ts;
    const worldScale = (this.bulletTime ? 0.34 : 1) * (this.slowmo > 0 ? 0.45 : 1);
    if (this.slowmo > 0) this.slowmo -= dt;
    const wdt = pdt * worldScale;

    this.time += pdt;
    this.timeAlive += pdt;

    this.comboTimer -= pdt;
    if (this.comboTimer <= 0) {
      this.combo = Math.max(0, this.combo - 70 * pdt);
      if (this.combo < 1) this.combo = 0;
    }

    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    this.odFlash = Math.max(0, this.odFlash - dt * 1.8);
    this.shake = Math.max(0, this.shake - dt * (this.shake * 5 + 16));

    this.updatePlayer(pdt);
    this.updateBullets(pdt);
    this.updateEnemies(wdt);
    this.updateEBullets(wdt);
    this.updateOrbs(pdt);
    this.updatePortals(dt);
    this.updatePickups(pdt);
    this.updateGhosts(pdt);
    this.updateWave(dt);
    this.fx.update(pdt);
    this.updateHud();
  }

  updateDying(dt) {
    this.deathTimer -= dt;
    const sdt = dt * 0.3;
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.updateBullets(sdt);
    this.updateEBullets(sdt);
    this.updateEnemies(sdt);
    this.updateOrbs(sdt);
    if (this.deathTimer <= 0) {
      this.state = 'gameover';
      this.cb.onState?.('gameover');
      this.cb.onGameOver?.({
        score: this.score, wave: this.wave, kills: this.kills,
        level: this.level, best: this.best, newBest: this.newBest,
        time: this.timeAlive,
      });
      this.updateHud();
    }
  }

  // ── игрок ────────────────────────────────────────────────────────────────
  updatePlayer(dt) {
    const p = this.player;
    if (!p || p.dead) return;
    const inp = this.input;

    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCdTimer = Math.max(0, p.dashCdTimer - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt * 3.2);
    p.recoil = Math.max(0, p.recoil - dt * 8);
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    if (p.shieldMax > 0 && p.shield < p.shieldMax) {
      p.shieldTimer -= dt;
      if (p.shieldTimer <= 0) {
        p.shield = p.shieldMax;
        this.audio?.shield();
        this.fx.ring(p.x, p.y, PALETTE.player, { r0: 12, r1: 52, life: 0.5, width: 2.5 });
      }
    }

    // движение
    let mx = 0;
    let my = 0;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
    if (inp.down('KeyW') || inp.down('ArrowUp')) my -= 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) my += 1;
    if (inp.moveStick.active && inp.moveStick.mag > 0.1) {
      mx += inp.moveStick.dx * inp.moveStick.mag;
      my += inp.moveStick.dy * inp.moveStick.mag;
    }
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }

    // прицел
    if (inp.aimStick.active && inp.aimStick.mag > 0.25) {
      p.angle = inp.aimStick.angle;
    } else if (inp.isTouch) {
      const t = this.nearestEnemy(p.x, p.y, 1200);
      if (t) p.angle = angleTo(p.x, p.y, t.x, t.y);
    } else {
      p.angle = angleTo(p.x, p.y, inp.mouse.x, inp.mouse.y);
    }

    // рывок
    if (inp.pressed('Space') && p.dashTimer <= 0 && p.dashCdTimer <= 0 && p.energy >= DASH_COST) {
      let dx = mx;
      let dy = my;
      if (Math.hypot(dx, dy) < 0.15) {
        dx = Math.cos(p.angle);
        dy = Math.sin(p.angle);
      }
      const dl = Math.hypot(dx, dy) || 1;
      p.dashDirX = dx / dl;
      p.dashDirY = dy / dl;
      p.dashTimer = DASH_TIME;
      p.dashCdTimer = p.dashCd;
      p.dashGhostT = 0;
      p.dashHits.clear();
      p.energy -= DASH_COST;
      p.invuln = Math.max(p.invuln, DASH_TIME + 0.12);
      this.audio?.dash();
      this.shake = Math.max(this.shake, 6);
      this.fx.ring(p.x, p.y, PALETTE.player, { r0: 8, r1: 46, life: 0.35, width: 2.5 });
      this.fx.burst(p.x, p.y, 10, PALETTE.player, { speed: 240, size: 3.5, life: 0.35 });
    }

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashDirX * DASH_SPEED * dt;
      p.y += p.dashDirY * DASH_SPEED * dt;
      p.dashGhostT -= dt;
      if (p.dashGhostT <= 0) {
        p.dashGhostT = 0.024;
        this.ghosts.push({ x: p.x, y: p.y, angle: p.angle, life: 0.4, maxLife: 0.4 });
      }
      this.dashDamage();
      // рывок стирает вражеские пули рядом
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        if (dist2(p.x, p.y, b.x, b.y) < 34 * 34) {
          this.fx.burst(b.x, b.y, 3, b.color, { speed: 90, size: 2.5, life: 0.25 });
          this.ebullets.splice(i, 1);
        }
      }
    } else {
      const sp = p.speed * (p.bulletTime ? 1.06 : 1);
      p.x += mx * sp * dt;
      p.y += my * sp * dt;
      p.thrust = lerp(p.thrust, ml > 0.1 ? 1 : 0, 1 - Math.pow(0.001, dt));
      if (ml > 0.1 && Math.random() < 0.5) {
        const a = p.angle + Math.PI + rand(-0.4, 0.4);
        this.fx.particle({
          x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10,
          vx: Math.cos(a) * 130 + rand(-40, 40), vy: Math.sin(a) * 130 + rand(-40, 40),
          life: 0.3, size: 3.2, color: PALETTE.player, drag: 0.9,
        });
      }
    }

    p.x = clamp(p.x, ARENA_PAD + p.r, this.w - ARENA_PAD - p.r);
    p.y = clamp(p.y, ARENA_PAD + p.r, this.h - ARENA_PAD - p.r);

    // энергия / замедление времени
    const wantSlow = inp.down('Shift') && p.energy > 1;
    p.bulletTime = wantSlow;
    this.bulletTime = wantSlow;
    if (wantSlow) {
      p.energy = Math.max(0, p.energy - SLOW_DRAIN * dt);
    } else {
      p.energy = Math.min(p.maxEnergy, p.energy + p.energyRegen * dt);
    }

    // овердрайв
    if (p.odActive > 0) {
      p.odActive -= dt;
      if (p.odActive < 0) p.odActive = 0;
      this.shake = Math.max(this.shake, 1.6);
    }
    if (inp.pressed('KeyQ') && p.overdrive >= 100 && p.odActive <= 0) this.activateOverdrive();

    // стрельба
    p.fireTimer -= dt;
    if (p.fireTimer <= 0) {
      this.shoot();
      p.fireTimer = p.fireDelay * (p.odActive > 0 ? 0.52 : 1);
    }

    // клинки
    if (p.blades > 0) {
      p.bladeAngle += dt * 3.3;
      p.bladePts.length = 0;
      for (let i = 0; i < p.blades; i++) {
        const a = p.bladeAngle + (i * TAU) / p.blades;
        const bx = p.x + Math.cos(a) * 72;
        const by = p.y + Math.sin(a) * 72;
        p.bladePts.push({ x: bx, y: by, a });
        for (const e of this.enemies) {
          if (e.dead || e.bladeCd > 0) continue;
          const rr = e.r + 11;
          if (dist2(bx, by, e.x, e.y) < rr * rr) {
            e.bladeCd = 0.32;
            this.damageEnemy(e, 22 + p.damage * 0.35, { x: bx, y: by });
            this.fx.burst(bx, by, 4, '#ffffff', { speed: 140, size: 2.5, life: 0.25 });
          }
        }
      }
    }
  }

  dashDamage() {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead || p.dashHits.has(e.id)) continue;
      const rr = e.r + 22;
      if (dist2(p.x, p.y, e.x, e.y) < rr * rr) {
        p.dashHits.add(e.id);
        this.damageEnemy(e, 26 + p.damage * 0.4, { x: p.x, y: p.y });
        this.fx.burst(e.x, e.y, 5, PALETTE.player, { speed: 220, size: 3, life: 0.3 });
      }
    }
  }

  shoot() {
    const p = this.player;
    const od = p.odActive > 0;
    const n = p.shots + (od ? 1 : 0);
    const spread = p.spread;
    const dmg = p.damage * (od ? 1.6 : 1);
    const color = od ? PALETTE.od : PALETTE.bullet;

    for (let i = 0; i < n; i++) {
      const a = p.angle + (i - (n - 1) / 2) * spread + rand(-0.022, 0.022);
      const crit = Math.random() < p.critChance;
      const bx = p.x + Math.cos(a) * 17;
      const by = p.y + Math.sin(a) * 17;
      this.bullets.push({
        x: bx, y: by,
        vx: Math.cos(a) * p.bulletSpeed,
        vy: Math.sin(a) * p.bulletSpeed,
        angle: a,
        r: p.bulletSize * (crit ? 1.4 : 1),
        damage: dmg,
        crit,
        pierce: p.pierce,
        bounces: p.ricochet,
        life: 1.25,
        explosive: p.explosive,
        color,
        hitSet: null,
        trailT: 0,
      });
    }

    p.recoil = 1;
    const ma = p.angle;
    this.fx.burst(p.x + Math.cos(ma) * 18, p.y + Math.sin(ma) * 18, n > 1 ? 4 : 2, color, {
      speed: 170, size: 3, life: 0.18, angle: ma, spread: 0.4,
    });
    this.shake = Math.max(this.shake, 1);
    this.audio?.shoot(od);
  }

  activateOverdrive() {
    const p = this.player;
    p.overdrive = 0;
    p.odActive = 6;
    this.odFlash = 1;
    this.hitstop = 0.08;
    this.shake = 20;
    this.fx.ring(p.x, p.y, PALETTE.od, { r0: 10, r1: 280, life: 0.8, width: 7 });
    this.fx.ring(p.x, p.y, '#ffffff', { r0: 4, r1: 140, life: 0.5, width: 3 });
    this.fx.burst(p.x, p.y, 44, PALETTE.od, { speed: 460, size: 5, life: 0.8 });
    this.audio?.overdrive();
    this.cb.onFlash?.('od');
  }

  nearestEnemy(x, y, maxDist = Infinity) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ── снаряды ──────────────────────────────────────────────────────────────
  updateBullets(dt) {
    const arr = this.bullets;
    const minX = ARENA_PAD;
    const maxX = this.w - ARENA_PAD;
    const minY = ARENA_PAD;
    const maxY = this.h - ARENA_PAD;

    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.05;
        this.fx.particle({
          x: s.x, y: s.y, vx: -s.vx * 0.05, vy: -s.vy * 0.05,
          life: 0.18, size: s.r * 0.8, color: s.color, drag: 0.85, glow: 0.6,
        });
      }

      let dead = s.life <= 0;

      if (!dead) {
        let wall = false;
        if (s.x < minX) { s.x = minX; s.vx = -s.vx; wall = true; }
        else if (s.x > maxX) { s.x = maxX; s.vx = -s.vx; wall = true; }
        if (s.y < minY) { s.y = minY; s.vy = -s.vy; wall = true; }
        else if (s.y > maxY) { s.y = maxY; s.vy = -s.vy; wall = true; }
        if (wall) {
          s.bounces--;
          s.angle = Math.atan2(s.vy, s.vx);
          this.fx.burst(s.x, s.y, 3, s.color, { speed: 90, size: 2.4, life: 0.22 });
          if (s.bounces < 0) dead = true;
        }
      }

      if (!dead) {
        const n = this.enemies.length;
        for (let j = 0; j < n; j++) {
          const e = this.enemies[j];
          if (e.dead) continue;
          if (s.hitSet && s.hitSet.has(e.id)) continue;
          const rr = e.r + s.r;
          if (dist2(s.x, s.y, e.x, e.y) < rr * rr) {
            this.damageEnemy(e, s.damage, { crit: s.crit, x: s.x, y: s.y });
            this.fx.burst(s.x, s.y, 5, e.color, { speed: 180, size: 3, life: 0.3 });
            this.fx.burst(s.x, s.y, 2, '#ffffff', { speed: 90, size: 2, life: 0.16 });
            this.audio?.hit();
            if (s.explosive > 0) {
              this.explodeAt(s.x, s.y, 52 + s.explosive * 20, s.damage * 0.55, s.color);
            }
            if (s.pierce > 0) {
              s.pierce--;
              if (!s.hitSet) s.hitSet = new Set();
              s.hitSet.add(e.id);
            } else {
              dead = true;
            }
            break;
          }
        }
      }

      if (dead) arr.splice(i, 1);
    }
  }

  explodeAt(x, y, radius, dmg, color) {
    this.fx.ring(x, y, color, { r0: 6, r1: radius * 1.5, life: 0.35, width: 3 });
    this.fx.burst(x, y, 10, color, { speed: 300, size: 4, life: 0.4 });
    this.shake = Math.max(this.shake, 3);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = radius + e.r;
      if (dist2(x, y, e.x, e.y) < rr * rr) {
        this.damageEnemy(e, dmg, { x, y });
      }
    }
  }

  updateEBullets(dt) {
    const arr = this.ebullets;
    const p = this.player;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.angle += dt * 4;
      let dead = b.life <= 0;
      if (!dead && (b.x < ARENA_PAD - 20 || b.x > this.w - ARENA_PAD + 20 || b.y < ARENA_PAD - 20 || b.y > this.h - ARENA_PAD + 20)) {
        dead = true;
      }
      if (!dead && p && !p.dead) {
        const rr = b.r + p.r * 0.7;
        if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
          this.damagePlayer(b.dmg);
          this.fx.burst(b.x, b.y, 6, b.color, { speed: 180, size: 3, life: 0.3 });
          dead = true;
        }
      }
      if (dead) arr.splice(i, 1);
    }
  }

  ebullet(x, y, angle, speed, dmg, color = PALETTE.enemyBullet, r = 6) {
    this.ebullets.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle, dmg, r, color, life: 7,
    });
  }

  // ── урон и смерть ────────────────────────────────────────────────────────
  damageEnemy(e, dmg, opts = {}) {
    if (e.dead) return;
    const p = this.player;
    let d = dmg;
    if (opts.crit && p) d *= p.critMult;
    e.hp -= d;
    e.flash = 1;

    if (e.type !== 'boss' && opts.x !== undefined) {
      const a = angleTo(opts.x, opts.y, e.x, e.y);
      const kb = e.type === 'bulwark' ? 5 : e.type === 'splitter' ? 12 : 26;
      e.vx += Math.cos(a) * kb;
      e.vy += Math.sin(a) * kb;
    }
    if (p && p.slowOnHit > 0) e.slow = Math.max(e.slow, 0.35 + p.slowOnHit * 0.15);
    if (p && p.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + d * p.lifesteal);
    if (opts.crit) this.fx.text(e.x + rand(-9, 9), e.y - e.r - 6, Math.round(d), PALETTE.crit, 16);

    if (e.hp <= 0) this.killEnemy(e, opts);
  }

  killEnemy(e, opts = {}) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;
    this.kills++;
    this.combo++;
    this.comboTimer = 1.9;

    if (e.type === 'boss') {
      this.onBossKilled(e);
      return;
    }

    const mul = 1 + Math.min(this.combo, 60) * 0.06;
    this.score += Math.round(e.score * mul);

    if (e.type === 'shard') {
      this.fx.burst(e.x, e.y, 7, e.color, { speed: 170, size: 3, life: 0.3 });
    } else {
      this.shake = Math.max(this.shake, 2 + e.r * 0.12);
      this.fx.explosion(e.x, e.y, e.color, clamp(e.r / 15, 0.6, 1.8));
      this.audio?.explode(e.r > 20 ? 1.15 : 0.65);
    }

    if (p && p.odActive <= 0) p.overdrive = Math.min(100, p.overdrive + 2.3 * p.odMul);

    const orbCount = e.type === 'bulwark' ? 5 : e.type === 'splitter' ? 3 : 1;
    for (let i = 0; i < orbCount; i++) this.spawnOrb(e.x, e.y, e.xp);

    if (e.type === 'splitter') {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        this.spawnEnemy('shard', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
      }
    }
    if (e.elite) {
      this.fx.ring(e.x, e.y, '#ffffff', { r0: 8, r1: 120, life: 0.5, width: 4 });
      this.fx.burst(e.x, e.y, 16, '#ffffff', { speed: 300, size: 4, life: 0.5 });
      if (chance(0.4)) this.spawnPickup(e.x, e.y, 'health');
    }
    if (e.type === 'bulwark' || (e.type === 'splitter' && chance(0.16)) || chance(0.055)) {
      this.spawnPickup(e.x, e.y, 'health');
    }
    if (e.type === 'bulwark') {
      const count = 10;
      for (let i = 0; i < count; i++) {
        this.ebullet(e.x, e.y, (i / count) * TAU + rand(0, 0.35), 235, 9);
      }
      this.fx.ring(e.x, e.y, e.color, { r0: 10, r1: 120, life: 0.4, width: 3 });
    }
  }

  onBossKilled(b) {
    const p = this.player;
    this.boss = null;
    this.hitstop = 0.3;
    this.slowmo = 1.1;
    this.shake = 36;
    this.score += Math.round(b.score * (1 + Math.min(this.combo, 60) * 0.06));
    this.fx.explosion(b.x, b.y, b.color, 3.4);
    this.fx.explosion(b.x + rand(-70, 70), b.y + rand(-70, 70), '#ffffff', 2.4);
    this.fx.explosion(b.x + rand(-70, 70), b.y + rand(-70, 70), PALETTE.od, 2.0);
    this.fx.ring(b.x, b.y, '#ffffff', { r0: 20, r1: 560, life: 1, width: 9 });
    this.fx.ring(b.x, b.y, b.color, { r0: 10, r1: 380, life: 0.8, width: 5 });
    this.audio?.explode(2.2);
    this.audio?.waveClear();
    this.cb.onBanner?.('ЯДРО УНИЧТОЖЕНО', `+${b.score} очков`, 'boss');
    this.cb.onFlash?.('boss');
    for (let i = 0; i < 16; i++) this.spawnOrb(b.x, b.y, 3);
    this.spawnPickup(b.x - 40, b.y, 'health');
    this.spawnPickup(b.x + 40, b.y, 'health');
    if (p) {
      p.overdrive = 100;
      p.energy = p.maxEnergy;
      p.hp = Math.min(p.maxHp, p.hp + 25);
    }
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const eb = this.ebullets[i];
      if (dist2(b.x, b.y, eb.x, eb.y) < 400 * 400) {
        this.fx.burst(eb.x, eb.y, 3, PALETTE.od, { speed: 120, size: 3, life: 0.4 });
        this.ebullets.splice(i, 1);
      }
    }
  }

  damagePlayer(amount) {
    const p = this.player;
    if (!p || p.dead) return;
    if (p.invuln > 0) return;
    if (p.odActive > 0) return;

    if (p.shield > 0) {
      p.shield--;
      p.shieldTimer = p.shieldCd;
      p.invuln = 0.6;
      this.shake = 10;
      this.audio?.shield();
      this.fx.ring(p.x, p.y, PALETTE.player, { r0: 20, r1: 90, life: 0.4, width: 4 });
      this.fx.burst(p.x, p.y, 16, PALETTE.player, { speed: 260, size: 4, life: 0.4 });
      return;
    }

    p.hp -= amount;
    p.invuln = 0.85;
    p.hitFlash = 1;
    this.damageFlash = 1;
    this.shake = Math.max(this.shake, 14);
    this.hitstop = 0.07;
    this.combo = 0;
    this.comboTimer = 0;
    this.audio?.hurt();
    this.fx.burst(p.x, p.y, 18, PALETTE.hp, { speed: 320, size: 4, life: 0.5 });
    this.fx.ring(p.x, p.y, PALETTE.hp, { r0: 8, r1: 90, life: 0.4, width: 3 });
    this.cb.onFlash?.('hit');

    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      this.die();
    }
  }

  die() {
    const p = this.player;
    this.state = 'dying';
    this.deathTimer = 1.5;
    this.hitstop = 0.24;
    this.shake = 30;
    this.slowmo = 1.5;
    this.fx.explosion(p.x, p.y, PALETTE.player, 2.6);
    this.fx.explosion(p.x, p.y, PALETTE.hp, 1.8);
    this.fx.ring(p.x, p.y, '#ffffff', { r0: 10, r1: 380, life: 0.8, width: 6 });
    this.audio?.explode(1.8);
    this.audio?.gameOver();
    this.cb.onFlash?.('death');
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
    }
    this.cb.onState?.('dying');
  }

  // ── опыт и улучшения ─────────────────────────────────────────────────────
  spawnOrb(x, y, value) {
    const a = rand(0, TAU);
    const sp = rand(30, 150);
    this.orbs.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      value: value || 1, life: 26, forced: false,
      bob: rand(0, TAU),
    });
  }

  updateOrbs(dt) {
    const p = this.player;
    const arr = this.orbs;
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      o.life -= dt;
      o.bob += dt * 4;
      let dead = o.life <= 0;

      if (!dead && p && !p.dead) {
        const d = dist(o.x, o.y, p.x, p.y);
        if (o.forced || d < p.magnetR) {
          const a = angleTo(o.x, o.y, p.x, p.y);
          const pull = o.forced ? 2400 : 1300;
          o.vx += Math.cos(a) * pull * dt;
          o.vy += Math.sin(a) * pull * dt;
        }
        if (d < p.r + 12) {
          this.xp += o.value;
          this.audio?.pickup();
          this.fx.burst(o.x, o.y, 3, PALETTE.orb, { speed: 80, size: 2.5, life: 0.25 });
          dead = true;
          this.checkLevelUp();
        }
      }

      if (!dead) {
        const drag = Math.pow(0.975, dt * 60);
        o.vx *= drag;
        o.vy *= drag;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.x < ARENA_PAD) { o.x = ARENA_PAD; o.vx = Math.abs(o.vx) * 0.7; }
        if (o.x > this.w - ARENA_PAD) { o.x = this.w - ARENA_PAD; o.vx = -Math.abs(o.vx) * 0.7; }
        if (o.y < ARENA_PAD) { o.y = ARENA_PAD; o.vy = Math.abs(o.vy) * 0.7; }
        if (o.y > this.h - ARENA_PAD) { o.y = this.h - ARENA_PAD; o.vy = -Math.abs(o.vy) * 0.7; }
      }

      if (dead) arr.splice(i, 1);
    }
  }

  checkLevelUp() {
    const p = this.player;
    if (!p || this.state !== 'playing') return;
    if (this.xp < this.xpNext) return;
    this.xp -= this.xpNext;
    this.level++;
    this.xpNext = Math.round(11 + this.level * 6.5);
    this.fx.ring(p.x, p.y, PALETTE.od, { r0: 10, r1: 170, life: 0.7, width: 5 });
    this.fx.burst(p.x, p.y, 30, PALETTE.od, { speed: 340, size: 5, life: 0.7 });
    this.audio?.levelUp();
    this.cb.onFlash?.('level');
    this.openUpgrades();
  }

  rollUpgrades(n) {
    const p = this.player;
    const pool = UPGRADES.filter((u) => (p.upgrades[u.id] || 0) < u.max);
    const result = [];
    let guard = 0;
    while (result.length < n && guard++ < 300 && pool.length) {
      const total = pool.reduce((s, u) => s + RARITY[u.rarity].weight, 0);
      let r = Math.random() * total;
      let chosen = pool[0];
      for (const u of pool) {
        r -= RARITY[u.rarity].weight;
        if (r <= 0) {
          chosen = u;
          break;
        }
      }
      result.push({
        ...chosen,
        stack: p.upgrades[chosen.id] || 0,
        rarityLabel: RARITY[chosen.rarity].label,
        rarityColor: RARITY[chosen.rarity].color,
      });
      pool.splice(pool.indexOf(chosen), 1);
    }
    if (!result.length) {
      const heal = UPGRADES.find((u) => u.id === 'hp');
      result.push({ ...heal, stack: p.upgrades.heal || 0, rarityLabel: RARITY.common.label, rarityColor: RARITY.common.color });
    }
    return result;
  }

  openUpgrades() {
    this.state = 'upgrade';
    this.upgradeCards = this.rollUpgrades(3);
    this.cb.onUpgrade?.(this.upgradeCards);
    this.updateHud();
  }

  chooseUpgrade(card) {
    if (this.state !== 'upgrade' || !card) return;
    const p = this.player;
    card.apply(p);
    p.upgrades[card.id] = (p.upgrades[card.id] || 0) + 1;
    if (card.id === 'shield') {
      p.shield = p.shieldMax;
      p.shieldTimer = p.shieldCd;
    }
    this.audio?.uiClick();
    this.state = 'playing';
    this.upgradeCards = null;
    this.cb.onUpgradeEnd?.();
    this.fx.ring(p.x, p.y, PALETTE.od, { r0: 12, r1: 90, life: 0.4, width: 2 });
    if (this.xp >= this.xpNext) this.checkLevelUp();
    this.updateHud();
  }

  // ── враги ────────────────────────────────────────────────────────────────
  spawnEnemy(type, x, y) {
    const t = ENEMY_TYPES[type];
    if (!t) return null;
    const wv = Math.max(1, this.wave);
    const hpScale = 1 + (wv - 1) * 0.135;
    const elite = wv >= 6 && type !== 'shard' && chance(0.09);
    const hp = Math.round(t.hp * hpScale * (elite ? 2.6 : 1));
    const e = {
      id: ++this.uid, type, elite,
      x, y, r: t.r * (elite ? 1.22 : 1), sides: t.sides, color: t.color,
      hp, maxHp: hp,
      speed: t.speed * clamp(1 + (wv - 1) * 0.024, 1, 1.55) * (elite ? 0.9 : 1),
      dmg: t.dmg + Math.floor((wv - 1) * 0.7) + (elite ? 5 : 0),
      vx: Math.cos(rand(0, TAU)) * 30, vy: Math.sin(rand(0, TAU)) * 30,
      angle: rand(0, TAU), spin: rand(-1.4, 1.4),
      flash: 0, slow: 0, seed: rand(0, 100),
      state: 'approach', stateT: 0, fireTimer: rand(0.9, 2.4),
      xp: t.xp * (elite ? 3 : 1), score: t.score * (elite ? 4 : 1),
      spawnT: 0.3, bladeCd: 0, dead: false,
    };
    this.enemies.push(e);
    return e;
  }

  updateEnemyAI(e, dt) {
    const p = this.player;
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);

    switch (e.type) {
      case 'drifter': {
        e.vx = damp(e.vx, Math.cos(a) * e.speed, 3.2, dt);
        e.vy = damp(e.vy, Math.sin(a) * e.speed, 3.2, dt);
        e.angle += dt * 2.4;
        break;
      }
      case 'shard': {
        e.vx = damp(e.vx, Math.cos(a) * e.speed, 5, dt);
        e.vy = damp(e.vy, Math.sin(a) * e.speed, 5, dt);
        e.angle = a;
        break;
      }
      case 'spitter': {
        const want = d < 240 ? -1 : d > 380 ? 1 : 0;
        const strafe = Math.sin(this.time * 1.6 + e.seed) * 0.95;
        const tx = Math.cos(a) * want + Math.cos(a + Math.PI / 2) * strafe;
        const ty = Math.sin(a) * want + Math.sin(a + Math.PI / 2) * strafe;
        e.vx = damp(e.vx, tx * e.speed, 3, dt);
        e.vy = damp(e.vy, ty * e.speed, 3, dt);
        e.angle = a;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && d < 760) {
          e.fireTimer = rand(1.7, 2.4);
          for (let i = 0; i < 2; i++) {
            this.ebullet(e.x, e.y, a + (i - 0.5) * 0.14, 275, 10, PALETTE.enemyBullet, 5.5);
          }
          this.fx.burst(e.x, e.y, 4, e.color, { speed: 120, size: 3, life: 0.25 });
          this.audio?.hit();
        }
        break;
      }
      case 'dasher': {
        e.stateT -= dt;
        if (e.state === 'approach') {
          e.vx = damp(e.vx, Math.cos(a) * e.speed, 3, dt);
          e.vy = damp(e.vy, Math.sin(a) * e.speed, 3, dt);
          e.angle = a;
          if (d < 340) {
            e.state = 'tele';
            e.stateT = 0.5;
            e.vx *= 0.15;
            e.vy *= 0.15;
          }
        } else if (e.state === 'tele') {
          e.vx = damp(e.vx, 0, 6, dt);
          e.vy = damp(e.vy, 0, 6, dt);
          e.angle = angleTo(e.x, e.y, p.x, p.y);
          if (Math.random() < 0.4) {
            this.fx.particle({
              x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r),
              vx: 0, vy: 0, life: 0.25, size: 3, color: e.color, glow: 1, drag: 1,
            });
          }
          if (e.stateT <= 0) {
            e.state = 'dash';
            e.stateT = 0.3;
            const da = angleTo(e.x, e.y, p.x, p.y);
            e.vx = Math.cos(da) * 760;
            e.vy = Math.sin(da) * 760;
            this.audio?.dash();
          }
        } else if (e.state === 'dash') {
          if (Math.random() < 0.7) {
            this.fx.particle({
              x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-30, 30),
              life: 0.3, size: 5, color: e.color, drag: 0.9,
            });
          }
          if (e.stateT <= 0) {
            e.state = 'recover';
            e.stateT = 0.7;
            e.vx *= 0.2;
            e.vy *= 0.2;
          }
        } else {
          e.vx = damp(e.vx, 0, 6, dt);
          e.vy = damp(e.vy, 0, 6, dt);
          if (e.stateT <= 0) e.state = 'approach';
        }
        break;
      }
      case 'splitter': {
        const wob = Math.sin(this.time * 1.1 + e.seed) * 0.5;
        e.vx = damp(e.vx, Math.cos(a + wob) * e.speed, 2.4, dt);
        e.vy = damp(e.vy, Math.sin(a + wob) * e.speed, 2.4, dt);
        e.angle += dt * 1.1;
        break;
      }
      case 'bulwark': {
        e.vx = damp(e.vx, Math.cos(a) * e.speed, 1.8, dt);
        e.vy = damp(e.vy, Math.sin(a) * e.speed, 1.8, dt);
        e.angle += dt * 0.9;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = rand(2.6, 3.4);
          if (d < 500) {
            for (let i = 0; i < 5; i++) {
              this.ebullet(e.x, e.y, a + (i - 2) * 0.22, 210, 11, PALETTE.enemyBullet, 5.5);
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }
      e.flash = Math.max(0, e.flash - dt * 4.5);
      e.spawnT = Math.max(0, e.spawnT - dt);
      e.bladeCd = Math.max(0, e.bladeCd - dt);
      if (e.slow > 0) {
        e.slow -= dt;
        if (e.slow < 0) e.slow = 0;
      }
      const slowF = e.slow > 0 ? 0.45 : 1;
      const edt = dt * slowF;

      if (e.type === 'boss') {
        this.updateBoss(e, edt);
      } else {
        this.updateEnemyAI(e, edt);
        e.x += e.vx * edt;
        e.y += e.vy * edt;
        e.x = clamp(e.x, ARENA_PAD + e.r * 0.4, this.w - ARENA_PAD - e.r * 0.4);
        e.y = clamp(e.y, ARENA_PAD + e.r * 0.4, this.h - ARENA_PAD - e.r * 0.4);
      }

      if (p && !p.dead) {
        const rr = e.r + p.r * 0.85;
        if (dist2(e.x, e.y, p.x, p.y) < rr * rr) this.damagePlayer(e.dmg);
      }
    }

    // расталкивание
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const a = this.enemies[i];
      if (a.dead || a.type === 'boss') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.enemies[j];
        if (b.dead || b.type === 'boss') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minD = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = ((minD - d) / d) * 0.4;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }

  // ── босс ─────────────────────────────────────────────────────────────────
  spawnBoss() {
    const wv = this.wave;
    const hp = Math.round(900 + wv * 200);
    const b = {
      id: ++this.uid, type: 'boss',
      x: this.w / 2, y: this.h * 0.24,
      r: 62, sides: 6, color: PALETTE.boss,
      hp, maxHp: hp,
      speed: 70, dmg: 26 + wv,
      vx: 0, vy: 0, cvx: 0, cvy: 0,
      angle: 0, spin: 0.7, flash: 0, slow: 0, seed: 0,
      xp: 25, score: 4000 + wv * 320, spawnT: 0.8, dead: false, bladeCd: 0,
      mode: 'idle', modeTimer: 0, attackTimer: 2.2, phase: 1,
      fired: false, charging: false, spiralAngle: 0, emitTimer: 0,
    };
    this.enemies.push(b);
    this.boss = b;
    this.shake = 24;
    this.minionTimer = 5;
    this.fx.ring(b.x, b.y, PALETTE.boss, { r0: 20, r1: 380, life: 1.1, width: 9 });
    this.fx.burst(b.x, b.y, 40, PALETTE.boss, { speed: 380, size: 5, life: 0.8 });
  }

  updateBoss(b, dt) {
    const p = this.player;
    b.angle += dt * b.spin;

    const frac = b.hp / b.maxHp;
    if (frac < 0.66 && b.phase === 1) this.bossPhase(b, 2);
    if (frac < 0.33 && b.phase === 2) this.bossPhase(b, 3);

    const charging = b.mode === 'charge' && b.charging;
    if (charging) {
      b.x += b.cvx * dt;
      b.y += b.cvy * dt;
      const minX = ARENA_PAD + b.r;
      const maxX = this.w - ARENA_PAD - b.r;
      const minY = ARENA_PAD + b.r;
      const maxY = this.h - ARENA_PAD - b.r;
      if (b.x < minX) { b.x = minX; b.cvx = Math.abs(b.cvx) * 0.7; }
      if (b.x > maxX) { b.x = maxX; b.cvx = -Math.abs(b.cvx) * 0.7; }
      if (b.y < minY) { b.y = minY; b.cvy = Math.abs(b.cvy) * 0.7; }
      if (b.y > maxY) { b.y = maxY; b.cvy = -Math.abs(b.cvy) * 0.7; }
      if (Math.random() < 0.8) {
        this.fx.particle({
          x: b.x + rand(-b.r, b.r) * 0.5, y: b.y + rand(-b.r, b.r) * 0.5,
          vx: rand(-60, 60), vy: rand(-60, 60),
          life: 0.4, size: 6, color: b.color, drag: 0.9,
        });
      }
    } else {
      const tx = this.w * 0.5 + Math.cos(this.time * 0.35) * this.w * 0.22;
      const ty = this.h * 0.26 + Math.sin(this.time * 0.6) * this.h * 0.07;
      b.x = damp(b.x, tx, 1.5, dt);
      b.y = damp(b.y, ty, 1.5, dt);
    }

    if (!p) return;

    if (b.mode === 'idle') {
      b.attackTimer -= dt;
      if (b.attackTimer <= 0) this.bossChoose(b);
      return;
    }

    b.modeTimer -= dt;

    switch (b.mode) {
      case 'spiral': {
        b.emitTimer -= dt;
        if (b.emitTimer <= 0) {
          b.emitTimer = b.phase >= 3 ? 0.085 : 0.115;
          const arms = b.phase >= 3 ? 3 : 2;
          for (let i = 0; i < arms; i++) {
            this.ebullet(b.x, b.y, b.spiralAngle + (i * TAU) / arms, 245, 12, b.color, 6.5);
          }
          b.spiralAngle += 0.42;
        }
        if (b.modeTimer <= 0) this.bossIdle(b, 0.7);
        break;
      }
      case 'burst': {
        if (!b.fired && b.modeTimer <= 0) {
          b.fired = true;
          const count = 16 + b.phase * 4;
          for (let i = 0; i < count; i++) {
            this.ebullet(b.x, b.y, (i / count) * TAU + rand(-0.03, 0.03), 240, 12, b.color, 6.5);
          }
          this.shake = 14;
          this.audio?.explode(0.85);
          this.fx.ring(b.x, b.y, b.color, { r0: 20, r1: 200, life: 0.5, width: 5 });
          b.modeTimer = 0.45;
        } else if (b.fired && b.modeTimer <= 0) {
          this.bossIdle(b, 0.9);
        }
        break;
      }
      case 'summon': {
        if (!b.fired && b.modeTimer <= 0) {
          b.fired = true;
          const type = b.phase >= 3 ? 'dasher' : 'drifter';
          for (let i = 0; i < 3; i++) this.spawnPortal(type);
          b.modeTimer = 0.4;
        } else if (b.fired && b.modeTimer <= 0) {
          this.bossIdle(b, 0.8);
        }
        break;
      }
      case 'charge': {
        if (!b.charging) {
          if (b.modeTimer <= 0) {
            b.charging = true;
            b.modeTimer = 0.62;
            const a = angleTo(b.x, b.y, p.x, p.y);
            const sp = 880 + b.phase * 110;
            b.cvx = Math.cos(a) * sp;
            b.cvy = Math.sin(a) * sp;
            this.shake = 16;
            this.audio?.dash();
          }
        } else if (b.modeTimer <= 0) {
          b.charging = false;
          b.cvx = 0;
          b.cvy = 0;
          this.bossIdle(b, 0.55);
        }
        break;
      }
      default:
        break;
    }
  }

  bossIdle(b, t) {
    b.mode = 'idle';
    b.attackTimer = t + rand(0, 0.5);
    b.fired = false;
    b.emitTimer = 0;
    b.charging = false;
  }

  bossPhase(b, phase) {
    b.phase = phase;
    this.shake = 26;
    this.hitstop = 0.12;
    this.fx.ring(b.x, b.y, '#ffffff', { r0: 20, r1: 440, life: 0.7, width: 7 });
    this.fx.burst(b.x, b.y, 40, b.color, { speed: 540, size: 6, life: 0.8 });
    this.audio?.bossWarn();
    b.attackTimer = 0.7;
    b.mode = 'idle';
    b.charging = false;
    b.fired = false;
    this.cb.onBanner?.('ФАЗА ' + (phase === 2 ? 'II' : 'III'), '', 'phase');
  }

  bossChoose(b) {
    const opts = ['spiral', 'burst', 'summon'];
    if (b.phase >= 2) opts.push('charge');
    if (b.phase >= 3) opts.push('burst', 'spiral');
    const mode = pick(opts);
    b.mode = mode;
    b.fired = false;
    if (mode === 'spiral') {
      b.modeTimer = 1.7;
      b.spiralAngle = rand(0, TAU);
      b.emitTimer = 0;
    } else if (mode === 'burst') {
      b.modeTimer = 0.55;
    } else if (mode === 'summon') {
      b.modeTimer = 0.5;
    } else {
      b.modeTimer = 0.65;
    }
  }

  // ── порталы появления ────────────────────────────────────────────────────
  randomSpawnPoint(attempt = 0) {
    const m = 78;
    const side = randInt(0, 3);
    let x;
    let y;
    if (side === 0) { x = rand(m, this.w - m); y = m; }
    else if (side === 1) { x = this.w - m; y = rand(m, this.h - m); }
    else if (side === 2) { x = rand(m, this.w - m); y = this.h - m; }
    else { x = m; y = rand(m, this.h - m); }
    if (this.player && attempt < 6 && dist(x, y, this.player.x, this.player.y) < 200) {
      return this.randomSpawnPoint(attempt + 1);
    }
    return { x, y };
  }

  spawnPortal(type) {
    const pos = this.randomSpawnPoint();
    this.portals.push({
      x: pos.x, y: pos.y, type, t: 0.62, maxT: 0.62,
      color: (ENEMY_TYPES[type] || { color: '#ff4d8d' }).color,
    });
  }

  updatePortals(dt) {
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const pt = this.portals[i];
      pt.t -= dt;
      if (Math.random() < 0.25) {
        const a = rand(0, TAU);
        const rr = 22 + rand(-6, 6);
        this.fx.particle({
          x: pt.x + Math.cos(a) * rr, y: pt.y + Math.sin(a) * rr,
          vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40,
          life: 0.3, size: 2.6, color: pt.color, drag: 0.95,
        });
      }
      if (pt.t <= 0) {
        this.spawnEnemy(pt.type, pt.x, pt.y);
        this.fx.ring(pt.x, pt.y, pt.color, { r0: 6, r1: 56, life: 0.4, width: 3 });
        this.portals.splice(i, 1);
      }
    }
  }

  spawnPickup(x, y, type = 'health') {
    this.pickups.push({
      x, y, type,
      vx: rand(-70, 70), vy: rand(-70, 70),
      life: 20, bob: rand(0, TAU),
    });
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      it.life -= dt;
      it.bob += dt * 3;
      let dead = it.life <= 0;

      if (!dead && p && !p.dead) {
        const d = dist(it.x, it.y, p.x, p.y);
        if (d < 130) {
          const a = angleTo(it.x, it.y, p.x, p.y);
          it.vx += Math.cos(a) * 1000 * dt;
          it.vy += Math.sin(a) * 1000 * dt;
        }
        if (d < p.r + 17) {
          if (it.type === 'health') {
            p.hp = Math.min(p.maxHp, p.hp + 18);
            this.fx.text(p.x, p.y - 26, '+18', '#3dffa0', 15);
          }
          this.audio?.pickup();
          this.fx.ring(it.x, it.y, '#3dffa0', { r0: 4, r1: 44, life: 0.4, width: 3 });
          this.fx.burst(it.x, it.y, 9, '#3dffa0', { speed: 170, size: 3, life: 0.4 });
          dead = true;
        }
      }

      if (!dead) {
        const drag = Math.pow(0.97, dt * 60);
        it.vx *= drag;
        it.vy *= drag;
        it.x = clamp(it.x + it.vx * dt, ARENA_PAD + 14, this.w - ARENA_PAD - 14);
        it.y = clamp(it.y + it.vy * dt, ARENA_PAD + 14, this.h - ARENA_PAD - 14);
      }

      if (dead) this.pickups.splice(i, 1);
    }
  }

  updateGhosts(dt) {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      if (g.life <= 0) this.ghosts.splice(i, 1);
    }
  }

  // ── волны ────────────────────────────────────────────────────────────────
  buildWave() {
    const wv = this.wave;
    let budget = 4 + wv * 3.6;
    const pool = [{ t: 'drifter', cost: 1 }];
    if (wv >= 2) pool.push({ t: 'spitter', cost: 2 });
    if (wv >= 3) pool.push({ t: 'dasher', cost: 2 });
    if (wv >= 4) pool.push({ t: 'splitter', cost: 3 });
    if (wv >= 6) pool.push({ t: 'bulwark', cost: 4 });
    const queue = [];
    let guard = 0;
    while (budget >= 1 && guard++ < 80) {
      const cand = pool.filter((o) => o.cost <= budget);
      if (!cand.length) break;
      const o = pick(cand);
      queue.push(o.t);
      budget -= o.cost;
    }
    if (!queue.length) queue.push('drifter');
    return queue;
  }

  beginWave() {
    this.wave++;
    this.waveActive = true;
    this.spawnTimer = 0.3;
    const isBoss = this.wave % 5 === 0;
    this.waveQueue = isBoss ? [] : this.buildWave();
    this.spawnInterval = clamp(0.9 - this.wave * 0.045, 0.22, 0.9);

    if (isBoss) {
      this.cb.onBanner?.(`ВОЛНА ${this.wave}`, 'ЯДРО ПУСТОТЫ ПРОБУЖДАЕТСЯ', 'boss');
      this.audio?.bossWarn();
      this.spawnBoss();
    } else {
      this.cb.onBanner?.(`ВОЛНА ${this.wave}`, '', 'wave');
      this.audio?.waveStart();
    }
  }

  completeWave() {
    this.waveActive = false;
    this.intermission = 2.7;
    const bonus = 120 + this.wave * 80;
    this.score += bonus;
    const nextBoss = (this.wave + 1) % 5 === 0;
    this.cb.onBanner?.(`ВОЛНА ${this.wave} ЗАЧИЩЕНА`, `+${bonus}${nextBoss ? ' · ДАЛЬШЕ БОСС' : ''}`, 'clear');
    this.audio?.waveClear();
    for (const o of this.orbs) o.forced = true;
    const p = this.player;
    if (p) p.hp = Math.min(p.maxHp, p.hp + 6);
  }

  updateWave(dt) {
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.beginWave();
      return;
    }
    if (!this.waveActive) return;

    if (this.boss) {
      this.minionTimer -= dt;
      if (this.minionTimer <= 0) {
        this.minionTimer = 6;
        const n = this.boss.phase >= 3 ? 3 : 2;
        for (let i = 0; i < n; i++) this.spawnPortal('drifter');
      }
    }

    if (this.waveQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.length < 58) {
        const group = 1 + Math.floor(this.wave / 4) + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < group && this.waveQueue.length; i++) {
          this.spawnPortal(this.waveQueue.shift());
        }
        this.spawnTimer = this.spawnInterval * rand(0.7, 1.35);
      }
    } else if (this.enemies.length === 0 && this.portals.length === 0 && !this.boss) {
      this.completeWave();
    }
  }

  // ── пауза / HUD ──────────────────────────────────────────────────────────
  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    this.cb.onState?.(this.paused ? 'paused' : 'playing');
    this.audio?.uiClick();
  }

  updateHud() {
    const h = this.hud;
    const p = this.player;
    if (p) {
      h.hp = clamp(p.hp / p.maxHp, 0, 1);
      h.hpVal = Math.ceil(p.hp);
      h.maxHp = p.maxHp;
      h.energy = clamp(p.energy / p.maxEnergy, 0, 1);
      h.overdrive = clamp(p.overdrive / 100, 0, 1);
      h.odReady = p.overdrive >= 100 && p.odActive <= 0;
      h.odActive = p.odActive;
      h.dashCd = p.dashCd > 0 ? clamp(1 - p.dashCdTimer / p.dashCd, 0, 1) : 1;
      h.bulletTime = p.bulletTime;
      h.shield = p.shield;
      h.shieldMax = p.shieldMax;
    }
    h.score = Math.round(this.score);
    h.wave = this.wave;
    h.level = this.level;
    h.combo = Math.floor(this.combo);
    h.comboMul = 1 + Math.min(this.combo, 60) * 0.06;
    h.xp = clamp(this.xp / (this.xpNext || 1), 0, 1);
    h.boss = this.boss ? { hp: clamp(this.boss.hp / this.boss.maxHp, 0, 1), phase: this.boss.phase } : null;
    h.paused = this.paused;
    this.cb.onHud?.(h);
  }

  render(ctx) {
    renderGame(ctx, this);
  }
}
