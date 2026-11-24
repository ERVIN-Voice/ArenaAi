import { TICK_RATE, TICK_MS, PLAYER, BOT, MSG, TEAM_COLORS } from '../shared/constants.js';
import { SPAWN_POINTS, resolveCircleMap, raycastObstacles } from '../shared/map.js';

let nextId = 1;
function uid() { return String(nextId++); }

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }

function spawnPoint(entities) {
  // pick spawn farthest from other alive entities
  let best = SPAWN_POINTS[0];
  let bestScore = -Infinity;
  for (const sp of SPAWN_POINTS) {
    let minD = Infinity;
    for (const e of entities) {
      if (e.dead) continue;
      const dx = sp[0] - e.x;
      const dz = sp[2] - e.z;
      const d = dx * dx + dz * dz;
      if (d < minD) minD = d;
    }
    if (minD > bestScore) { bestScore = minD; best = sp; }
  }
  return { x: best[0] + rand(-1, 1), y: 0, z: best[2] + rand(-1, 1) };
}

function makeEntity({ isBot, name, color }) {
  const e = {
    id: uid(),
    isBot,
    name,
    color,
    x: 0, y: 0, z: 0,
    vx: 0, vz: 0,
    yaw: 0, pitch: 0,
    hp: PLAYER.hp,
    maxHp: PLAYER.hp,
    dead: false,
    respawnAt: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    lastShotAt: 0,
    ammo: PLAYER.magSize,
    reloading: false,
    reloadEndAt: 0,
    // input (for players) / AI state (for bots)
    input: { forward: 0, right: 0, yaw: 0, pitch: 0, sprint: false, shoot: false },
    ai: null,
  };
  return e;
}

function makeBot(index) {
  const name = BOT.namePool[index % BOT.namePool.length];
  const color = TEAM_COLORS[index % TEAM_COLORS.length];
  const e = makeEntity({ isBot: true, name, color });
  e.ai = {
    nextThink: 0,
    targetId: null,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeSwitchAt: 0,
    wanderYaw: rand(-Math.PI, Math.PI),
    wanderUntil: 0,
    shootBurstUntil: 0,
  };
  return e;
}

export class GameServer {
  constructor() {
    this.players = new Map(); // id -> entity (human)
    this.bots = [];
    this.bullets = [];
    this.time = 0;
    this.lastTick = Date.now();
    this.events = []; // transient events to broadcast (hits, kills, spawns)

    for (let i = 0; i < BOT.count; i++) {
      const b = makeBot(i);
      const sp = spawnPoint([...this.bots]);
      b.x = sp.x; b.z = sp.z; b.y = 0;
      b.yaw = rand(-Math.PI, Math.PI);
      this.bots.push(b);
    }
  }

  allEntities() {
    return [...this.players.values(), ...this.bots];
  }

  addPlayer(name) {
    const usedColors = new Set(this.allEntities().map(e => e.color));
    let color = TEAM_COLORS.find(c => !usedColors.has(c));
    if (color === undefined) color = pick(TEAM_COLORS);
    const e = makeEntity({ isBot: false, name: (name || 'Player').slice(0, 16), color });
    const sp = spawnPoint(this.allEntities());
    e.x = sp.x; e.z = sp.z; e.y = 0;
    this.players.set(e.id, e);
    this.events.push({ type: 'join', id: e.id, name: e.name });
    return e;
  }

  removePlayer(id) {
    const e = this.players.get(id);
    if (e) {
      this.players.delete(id);
      this.events.push({ type: 'leave', id, name: e.name });
    }
  }

  handleInput(id, input) {
    const e = this.players.get(id);
    if (!e) return;
    // sanitize
    e.input.forward = clamp(Number(input.forward) || 0, -1, 1);
    e.input.right = clamp(Number(input.right) || 0, -1, 1);
    if (typeof input.yaw === 'number') e.input.yaw = input.yaw;
    if (typeof input.pitch === 'number') e.input.pitch = clamp(input.pitch, -1.2, 1.2);
    e.input.sprint = !!input.sprint;
    e.input.shoot = !!input.shoot;
    if (input.reload) this.startReload(e);
  }

  startReload(e) {
    if (e.dead || e.reloading || e.ammo === PLAYER.magSize) return;
    e.reloading = true;
    e.reloadEndAt = this.time + PLAYER.reloadMs;
  }

  shoot(e) {
    if (e.dead) return;
    if (e.reloading) return;
    if (e.ammo <= 0) { this.startReload(e); return; }
    const now = this.time;
    if (now - e.lastShotAt < PLAYER.fireRateMs) return;
    e.lastShotAt = now;
    e.ammo--;

    const yaw = e.yaw;
    const pitch = e.pitch;
    // direction vector from yaw/pitch
    const cosP = Math.cos(pitch);
    const dx = Math.sin(yaw) * cosP;
    const dy = -Math.sin(pitch);
    const dz = Math.cos(yaw) * cosP;
    // muzzle position (approx)
    const mx = e.x + dx * 0.8;
    const my = e.y + PLAYER.eyeHeight - 0.1;
    const mz = e.z + dz * 0.8;

    this.bullets.push({
      ownerId: e.id,
      x: mx, y: my, z: mz,
      dx, dy, dz,
      speed: PLAYER.bulletSpeed,
      life: PLAYER.bulletLifeMs,
      damage: PLAYER.damage,
    });
    this.events.push({ type: 'shot', id: e.id, x: mx, y: my, z: mz });

    if (e.ammo <= 0) this.startReload(e);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;
    this.time += dt * 1000;

    const entities = this.allEntities();

    // respawns
    for (const e of entities) {
      if (e.dead && this.time >= e.respawnAt) {
        this.respawn(e, entities);
      }
    }

    // reloads
    for (const e of entities) {
      if (e.reloading && this.time >= e.reloadEndAt) {
        e.reloading = false;
        e.ammo = PLAYER.magSize;
      }
    }

    // bots think
    for (const b of this.bots) this.updateBot(b, dt, entities);

    // movement
    for (const e of entities) this.moveEntity(e, dt);

    // shooting
    for (const e of entities) {
      if (e.input.shoot) this.shoot(e);
    }

    // bullets
    this.updateBullets(dt, entities);

    // cleanup old events after they are picked up by snapshot? We'll keep them per tick and clear after buildSnapshot
  }

  respawn(e, entities) {
    const sp = spawnPoint(entities);
    e.x = sp.x; e.y = 0; e.z = sp.z;
    e.hp = PLAYER.hp;
    e.dead = false;
    e.ammo = PLAYER.magSize;
    e.reloading = false;
    e.vx = 0; e.vz = 0;
    this.events.push({ type: 'spawn', id: e.id });
  }

  moveEntity(e, dt) {
    if (e.dead) return;
    const inp = e.input;
    const yaw = inp.yaw;
    e.yaw = yaw;
    e.pitch = inp.pitch || 0;

    // forward/right in world based on yaw
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    // forward is -Z in local at yaw=0? We'll define: yaw=0 faces +Z
    const fwdX = sinY;
    const fwdZ = cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    let mx = fwdX * inp.forward + rightX * inp.right;
    let mz = fwdZ * inp.forward + rightZ * inp.right;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const speed = PLAYER.speed * (inp.sprint ? PLAYER.sprintMult : 1);
    e.vx = mx * speed;
    e.vz = mz * speed;
    let nx = e.x + e.vx * dt;
    let nz = e.z + e.vz * dt;
    const resolved = resolveCircleMap(nx, nz, PLAYER.radius);
    e.x = resolved.x;
    e.z = resolved.z;
    e.y = 0;
  }

  updateBot(b, dt, entities) {
    if (b.dead) return;
    const ai = b.ai;
    const now = this.time;

    // pick target
    if (now >= ai.nextThink) {
      ai.nextThink = now + BOT.thinkMs + rand(-30, 30);
      let best = null;
      let bestD = Infinity;
      for (const e of entities) {
        if (e.id === b.id || e.dead) continue;
        const d = dist2(b, e);
        if (d < bestD) { bestD = d; best = e; }
      }
      ai.targetId = best ? best.id : null;
      if (now >= ai.strafeSwitchAt) {
        if (Math.random() < 0.4) ai.strafeDir *= -1;
        ai.strafeSwitchAt = now + rand(800, 2200);
      }
    }

    const target = ai.targetId ? entities.find(e => e.id === ai.targetId && !e.dead) : null;
    if (!target) {
      // wander
      if (now > ai.wanderUntil) {
        ai.wanderYaw = rand(-Math.PI, Math.PI);
        ai.wanderUntil = now + rand(1000, 3000);
      }
      b.input.yaw = ai.wanderYaw;
      b.input.pitch = 0;
      b.input.forward = 0.6;
      b.input.right = 0;
      b.input.shoot = false;
      b.input.sprint = false;
      return;
    }

    const dx = target.x - b.x;
    const dz = target.z - b.z;
    const distH = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    // smooth aim
    let dyaw = wantYaw - b.input.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const aimSpeed = 5.5;
    b.input.yaw += clamp(dyaw, -aimSpeed * dt, aimSpeed * dt);
    b.input.pitch = 0;

    // movement: keep preferred distance, strafe
    let forward = 0;
    let right = ai.strafeDir * 0.7;
    if (distH > BOT.preferredDist + 3) forward = 1;
    else if (distH < BOT.preferredDist - 3) forward = -0.8;
    else forward = 0.1;

    // simple obstacle avoidance: if very close to wall in front, turn
    const lookX = Math.sin(b.input.yaw);
    const lookZ = Math.cos(b.input.yaw);
    const ahead = raycastObstacles(b.x, 1.0, b.z, lookX, 0, lookZ, 2.5);
    if (ahead !== null) {
      forward = -0.2;
      right = ai.strafeDir;
      ai.wanderYaw = b.input.yaw + ai.strafeDir * 1.2;
    }

    b.input.forward = forward;
    b.input.right = right;
    b.input.sprint = distH > 25;

    // shoot if roughly aimed and has LOS
    const aimOk = Math.abs(dyaw) < 0.15;
    let los = false;
    if (aimOk && distH < 60) {
      const toX = dx / distH;
      const toZ = dz / distH;
      const hitDist = raycastObstacles(b.x, PLAYER.eyeHeight, b.z, toX, 0, toZ, distH);
      los = hitDist === null;
    }
    b.input.shoot = aimOk && los;
  }

  updateBullets(dt, entities) {
    const dtMs = dt * 1000;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dtMs;
      const step = b.speed * dt;
      // ray segment for hit detection
      const nx = b.x + b.dx * step;
      const ny = b.y + b.dy * step;
      const nz = b.z + b.dz * step;

      // ground hit
      if (ny <= 0.05 && b.dy < 0) {
        const tGround = (0.05 - b.y) / b.dy;
        if (tGround >= 0 && tGround <= step) {
          this.events.push({ type: 'impact', x: b.x + b.dx * tGround, y: 0.05, z: b.z + b.dz * tGround, kind: 'ground' });
          this.bullets.splice(i, 1);
          continue;
        }
      }
      // obstacle hit
      const obsDist = raycastObstacles(b.x, b.y, b.z, b.dx, b.dy, b.dz, step);
      if (obsDist !== null) {
        this.events.push({ type: 'impact', x: b.x + b.dx * obsDist, y: b.y + b.dy * obsDist, z: b.z + b.dz * obsDist, kind: 'world' });
        this.bullets.splice(i, 1);
        continue;
      }

      // entity hit
      let hitEntity = null;
      let hitT = step;
      for (const e of entities) {
        if (e.id === b.ownerId || e.dead) continue;
        // sphere-ish hit on body (cylinder approx as capsule/sphere at chest)
        const ex = e.x, ey = e.y + 1.0, ez = e.z;
        // closest point on segment to entity center
        const sx = nx - b.x, sy = ny - b.y, sz = nz - b.z;
        const sLen2 = sx * sx + sy * sy + sz * sz;
        let t = 0;
        if (sLen2 > 0) t = clamp(((ex - b.x) * sx + (ey - b.y) * sy + (ez - b.z) * sz) / sLen2, 0, 1);
        const px = b.x + sx * t, py = b.y + sy * t, pz = b.z + sz * t;
        const ddx = ex - px, ddy = ey - py, ddz = ez - pz;
        const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
        const hr = 0.55;
        if (d2 < hr * hr) {
          const tDist = t * step;
          if (tDist < hitT) { hitT = tDist; hitEntity = e; }
        }
        // headshot check
        const hex = e.x, hey = e.y + 1.55, hez = e.z;
        let th = 0;
        if (sLen2 > 0) th = clamp(((hex - b.x) * sx + (hey - b.y) * sy + (hez - b.z) * sz) / sLen2, 0, 1);
        const phx = b.x + sx * th, phy = b.y + sy * th, phz = b.z + sz * th;
        const hdx = hex - phx, hdy = hey - phy, hdz = hez - phz;
        if (hdx * hdx + hdy * hdy + hdz * hdz < 0.28 * 0.28) {
          const tDist = th * step;
          if (tDist < hitT) { hitT = tDist; hitEntity = { ...e, _headshot: true, _ref: e }; }
        }
      }

      if (hitEntity) {
        const target = hitEntity._ref || hitEntity;
        const isHead = !!hitEntity._headshot;
        const dmg = isHead ? Math.round(b.damage * 1.8) : b.damage;
        target.hp -= dmg;
        this.events.push({ type: 'hit', targetId: target.id, by: b.ownerId, dmg, head: isHead, x: target.x, y: target.y + 1.2, z: target.z });
        if (target.hp <= 0 && !target.dead) {
          target.dead = true;
          target.hp = 0;
          target.deaths++;
          target.respawnAt = this.time + PLAYER.respawnMs;
          const killer = entities.find(e => e.id === b.ownerId);
          if (killer) { killer.kills++; killer.score += isHead ? 120 : 100; }
          this.events.push({ type: 'kill', killerId: b.ownerId, victimId: target.id, head: isHead });
        }
        this.bullets.splice(i, 1);
        continue;
      }

      b.x = nx; b.y = ny; b.z = nz;
      if (b.life <= 0 || b.y < -5 || b.y > 20) {
        this.bullets.splice(i, 1);
      }
    }
  }

  buildSnapshot(forId) {
    const entities = this.allEntities().map(e => ({
      id: e.id,
      name: e.name,
      color: e.color,
      isBot: e.isBot,
      x: +e.x.toFixed(3), y: +e.y.toFixed(3), z: +e.z.toFixed(3),
      yaw: +e.yaw.toFixed(4), pitch: +e.pitch.toFixed(4),
      hp: e.hp, maxHp: e.maxHp,
      dead: e.dead,
      score: e.score, kills: e.kills, deaths: e.deaths,
      ammo: e.ammo, reloading: e.reloading,
    }));
    // only send recent bullets (positions) - limit for bandwidth
    const bullets = this.bullets.slice(-60).map(b => ({
      x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2),
    }));
    const events = this.events.splice(0, this.events.length);
    return {
      type: MSG.STATE,
      t: this.time,
      you: forId,
      entities,
      bullets,
      events,
    };
  }
}
