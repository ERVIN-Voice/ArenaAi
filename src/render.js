// ─── Вся графика: неоновый вектор без единого спрайта ───────────────────────
import { TAU, clamp, withAlpha, rand, easeOutCubic, pick } from './util.js';
import { getGlow } from './fx.js';
import { PALETTE, ENEMY_TYPES, ARENA_PAD } from './data.js';

function polyPath(ctx, x, y, r, sides, rot = 0) {
  ctx.beginPath();
  const off = rot - Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = off + (i / sides) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function glowAt(ctx, x, y, size, color, alpha) {
  const sprite = getGlow(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

// ─── фон ───────────────────────────────────────────────────────────────────
function drawBackground(ctx, g) {
  const { w, h } = g;
  const grad = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.8);
  grad.addColorStop(0, '#0a1226');
  grad.addColorStop(0.55, '#070a18');
  grad.addColorStop(1, '#03040a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const cell = 64;
  const ox = (g.animT * 11) % cell;
  const oy = (g.animT * 6) % cell;
  ctx.strokeStyle = 'rgba(80,190,255,0.065)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -cell + ox; x < w + cell; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = -cell + oy; y < h + cell; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const t = g.animT;

  // пыль в глубине
  for (const d of g.dust) {
    ctx.globalAlpha = d.alpha * (0.5 + 0.5 * Math.sin(d.phase));
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // медленные контуры на фоне
  ctx.translate(w / 2, h / 2);
  ctx.rotate(t * 0.05);
  ctx.strokeStyle = 'rgba(90,200,255,0.032)';
  ctx.lineWidth = 1.4;
  polyPath(ctx, 0, 0, Math.min(w, h) * 0.43, 6, 0);
  ctx.stroke();
  ctx.rotate(-t * 0.11);
  polyPath(ctx, 0, 0, Math.min(w, h) * 0.31, 3, 0);
  ctx.stroke();
  ctx.rotate(-t * 0.05);
  ctx.translate(-w / 2, -h / 2);

  for (let i = 1; i <= 3; i++) {
    ctx.strokeStyle = `rgba(70,200,255,${0.045 - i * 0.006})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 130 * i + Math.sin(t * 0.5 + i) * 9, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  if (g.state === 'title' || g.state === 'gameover') {
    ctx.save();
    for (const a of g.ambient) {
      ctx.strokeStyle = withAlpha(a.color, a.alpha);
      ctx.lineWidth = 1.6;
      polyPath(ctx, a.x, a.y, a.r, a.sides, a.rot);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ─── рамка арены ───────────────────────────────────────────────────────────
function drawArenaFrame(ctx, g) {
  const { w, h } = g;
  const pad = ARENA_PAD;
  const pulse = 0.5 + 0.5 * Math.sin(g.animT * 2.2);
  const danger = g.boss ? 1 : 0;
  const col = danger ? PALETTE.boss : PALETTE.player;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(col, 0.07 + pulse * 0.04);
  ctx.lineWidth = 10;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.strokeStyle = withAlpha(col, 0.34 + pulse * 0.12);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  // угловые скобки
  const L = 46;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(col, 0.85);
  const corners = [
    [pad, pad, 1, 1],
    [w - pad, pad, -1, 1],
    [pad, h - pad, 1, -1],
    [w - pad, h - pad, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * L, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * L);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── игровые объекты ───────────────────────────────────────────────────────
function drawOrbs(ctx, g) {
  if (!g.orbs.length) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const o of g.orbs) {
    const s = 3.4 + Math.sin(o.bob) * 0.7;
    glowAt(ctx, o.x, o.y, 26, PALETTE.orb, 0.55);
    ctx.fillStyle = PALETTE.orb;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.bob * 0.5);
    polyPath(ctx, 0, 0, s, 4, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPickups(ctx, g) {
  if (!g.pickups.length) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const it of g.pickups) {
    const pulse = 0.8 + 0.2 * Math.sin(it.bob * 2.2);
    glowAt(ctx, it.x, it.y, 62 * pulse, '#3dffa0', 0.55);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(Math.sin(it.bob) * 0.14);
    ctx.strokeStyle = 'rgba(200,255,230,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12 * pulse, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-4.5, 0); ctx.lineTo(4.5, 0);
    ctx.moveTo(0, -4.5); ctx.lineTo(0, 4.5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPortals(ctx, g) {
  if (!g.portals.length) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const pt of g.portals) {
    const k = 1 - pt.t / pt.maxT;
    const r = 8 + k * 34;
    const a = 0.35 + k * 0.65;
    glowAt(ctx, pt.x, pt.y, 30 + k * 46, pt.color, 0.4 + k * 0.3);
    ctx.strokeStyle = withAlpha(pt.color, a);
    ctx.lineWidth = 2.5;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(TAU / 3 + k * 1.2);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 1.5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = withAlpha(pt.color, 0.25 + k * 0.5);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2 + k * 5, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawEnemy(ctx, g, e) {
  const t = g.animT;
  const pop = e.spawnT > 0 ? 1 - e.spawnT / 0.3 : 1;
  const scale = 0.35 + 0.65 * easeOutCubic(clamp(pop, 0, 1));
  const r = e.r * scale;
  const isShard = e.type === 'shard';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, e.x, e.y, r * (isShard ? 5.2 : 6.2), e.color, isShard ? 0.42 : 0.62);
  glowAt(ctx, e.x, e.y, r * 2.2, e.color, 0.35);
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  polyPath(ctx, 0, 0, r, e.sides, 0);
  ctx.fillStyle = withAlpha(e.color, 0.2);
  ctx.fill();
  ctx.lineWidth = isShard ? 1.8 : 2.4;
  ctx.strokeStyle = e.color;
  ctx.stroke();

  // внутренняя деталь
  ctx.rotate(-e.angle * 1.7 + t * 0.8);
  polyPath(ctx, 0, 0, r * 0.48, e.sides, 0);
  ctx.strokeStyle = withAlpha(e.color, 0.55);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (e.flash > 0) {
    polyPath(ctx, 0, 0, r, e.sides, 0);
    ctx.fillStyle = `rgba(255,255,255,${e.flash * 0.6})`;
    ctx.fill();
  }
  ctx.restore();

  // аура элиты
  if (e.elite) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(-t * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // индикатор здоровья
  if (!isShard && e.hp < e.maxHp) {
    const bw = e.r * 1.9;
    const bx = e.x - bw / 2;
    const by = e.y - e.r - 9;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = withAlpha(e.color, 0.95);
    ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
  }

  if (e.slow > 0) {
    ctx.strokeStyle = `rgba(150,240,255,${0.25 + e.slow * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
    ctx.stroke();
  }

  // телеграф рывка
  if (e.type === 'dasher' && e.state === 'tele') {
    const p = g.player;
    if (p) {
      const k = clamp(1 - e.stateT / 0.5, 0, 1);
      ctx.strokeStyle = withAlpha('#d9b3ff', 0.25 + k * 0.45);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

function drawBoss(ctx, g, b) {
  const t = g.animT;
  const frac = clamp(b.hp / b.maxHp, 0, 1);
  const col = b.color;
  const pulse = 1 + Math.sin(t * 3.4) * 0.03;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, b.x, b.y, b.r * 7.5, col, 0.55);
  glowAt(ctx, b.x, b.y, b.r * 3.2, '#ffffff', 0.18);
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(b.x, b.y);

  // внешние дуги
  ctx.save();
  ctx.rotate(b.angle * 0.55);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.5, (i / 6) * TAU + 0.09, ((i + 1) / 6) * TAU - 0.09);
    ctx.strokeStyle = withAlpha(col, 0.3 + (b.phase - 1) * 0.12);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();

  // оболочка
  ctx.save();
  ctx.rotate(-t * 0.35);
  polyPath(ctx, 0, 0, b.r * pulse, 6, 0);
  ctx.fillStyle = withAlpha(col, 0.13);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.restore();

  // внутренний треугольник
  ctx.save();
  ctx.rotate(t * 1.1);
  polyPath(ctx, 0, 0, b.r * 0.55, 3, 0);
  ctx.fillStyle = withAlpha('#ffffff', 0.12);
  ctx.fill();
  ctx.strokeStyle = withAlpha('#ffffff', 0.75);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // ядро
  const core = 9 + Math.sin(t * 6) * 2.5 + (1 - frac) * 8;
  ctx.beginPath();
  ctx.arc(0, 0, core, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = withAlpha(col, 0.9);
  ctx.lineWidth = 3;
  ctx.stroke();

  if (b.flash > 0) {
    polyPath(ctx, 0, 0, b.r * pulse, 6, -t * 0.35);
    ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.1})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${b.flash * 0.75})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();

  // телеграф рывка — луч в игрока
  if (b.mode === 'charge' && !b.charging && g.player) {
    const p = g.player;
    const k = 1 - clamp(b.modeTimer / 0.65, 0, 1);
    ctx.strokeStyle = withAlpha('#ff2f6d', 0.15 + k * 0.5);
    ctx.lineWidth = 2 + k * 5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemies(ctx, g) {
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (e.type === 'boss') drawBoss(ctx, g, e);
    else drawEnemy(ctx, g, e);
  }
}

function drawPlayer(ctx, g) {
  const p = g.player;
  if (!p) return;
  const od = p.odActive > 0;
  const color = od ? PALETTE.od : PALETTE.player;
  const t = g.animT;

  if (p.dead) return;

  // след рывка
  if (g.ghosts.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const gh of g.ghosts) {
      const a = clamp(gh.life / gh.maxLife, 0, 1);
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.rotate(gh.angle);
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-11, 12);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-11, -12);
      ctx.closePath();
      ctx.strokeStyle = withAlpha(PALETTE.player, a * 0.7);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const auraSize = 118 + Math.sin(t * 6) * 9 + (od ? 52 : 0) + p.thrust * 10;
  glowAt(ctx, p.x, p.y, auraSize, color, 0.7);
  if (od) glowAt(ctx, p.x, p.y, 150, '#fff0b8', 0.25);
  ctx.globalCompositeOperation = 'source-over';

  // прицельный пунктир
  if (!g.input.isTouch) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(color, 0.12);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 12]);
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26);
    ctx.lineTo(g.input.mouse.x, g.input.mouse.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const flicker = p.invuln > 0 ? (Math.sin(t * 44) > 0 ? 1 : 0.45) : 1;
  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + Math.sin(t * 2) * 0.01);
  const rec = 1 - p.recoil * 0.1;
  ctx.scale(rec, rec);

  ctx.beginPath();
  ctx.moveTo(23 + p.recoil * 2.5, 0);
  ctx.lineTo(-13, 15);
  ctx.lineTo(-6.5, 0);
  ctx.lineTo(-13, -15);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, od ? 0.55 : 0.3);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = od ? '#fff8dc' : '#dbffff';
  ctx.stroke();

  // внутренний акцент
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-7, 6);
  ctx.lineTo(-7, -6);
  ctx.closePath();
  ctx.fillStyle = withAlpha('#ffffff', 0.9);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // кольцо овердрайва
  if (od) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 4);
    ctx.strokeStyle = withAlpha(PALETTE.od, 0.9);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 26 + Math.sin(t * 6 + i) * 3, (i / 3) * TAU, (i / 3) * TAU + 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // щит
  if (p.shield > 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-t * 1.2);
    ctx.strokeStyle = withAlpha(PALETTE.player, 0.55 + Math.sin(t * 4) * 0.15);
    ctx.lineWidth = 2;
    for (let i = 0; i < p.shield; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 30, (i / p.shield) * TAU, (i / p.shield) * TAU + 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // клинки
  if (p.bladePts.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of p.bladePts) {
      glowAt(ctx, b.x, b.y, 50, PALETTE.player, 0.5);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a + t * 3);
      polyPath(ctx, 0, 0, 10, 3, 0);
      ctx.fillStyle = withAlpha('#e8ffff', 0.9);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawBullets(ctx, g) {
  if (!g.bullets.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of g.bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const len = 14 + sp * 0.014 + b.r * 1.4;
    const tx = b.x - (b.vx / sp) * len;
    const ty = b.y - (b.vy / sp) * len;
    glowAt(ctx, b.x, b.y, 34 + b.r * 3.4, b.color, 0.7);
    ctx.strokeStyle = withAlpha(b.color, 0.85);
    ctx.lineWidth = b.r * 1.7;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.2, b.r * 0.7);
    ctx.beginPath();
    ctx.moveTo(tx + (b.x - tx) * 0.45, ty + (b.y - ty) * 0.45);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemyBullets(ctx, g) {
  if (!g.ebullets.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of g.ebullets) {
    glowAt(ctx, b.x, b.y, b.r * 7, b.color, 0.65);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.55, 0, TAU);
    ctx.fill();
    polyPath(ctx, 0, 0, b.r * 1.15, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(b.color, 0.5);
    ctx.fill();
    ctx.strokeStyle = withAlpha(b.color, 0.95);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ─── пост-эффекты и интерфейс на канвасе ───────────────────────────────────
function drawPostFX(ctx, g) {
  const { w, h } = g;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (g.bulletTime) {
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    grd.addColorStop(0, 'rgba(40,120,255,0)');
    grd.addColorStop(1, 'rgba(50,130,255,0.16)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  if (g.player && g.player.odActive > 0) {
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    grd.addColorStop(0, 'rgba(255,200,60,0)');
    grd.addColorStop(1, 'rgba(255,180,40,0.13)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  if (g.boss) {
    const pulse = 0.6 + 0.4 * Math.sin(g.animT * 3);
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, 'rgba(255,40,90,0)');
    grd.addColorStop(1, `rgba(255,30,80,${0.1 * pulse})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  if (g.damageFlash > 0) {
    const a = g.damageFlash * 0.3;
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    grd.addColorStop(0, 'rgba(255,30,80,0)');
    grd.addColorStop(1, `rgba(255,30,80,${a})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  if (g.odFlash > 0) {
    ctx.fillStyle = `rgba(255,220,120,${g.odFlash * 0.16})`;
    ctx.fillRect(0, 0, w, h);
  }
  const pl = g.player;
  if (pl && !pl.dead && pl.hp / pl.maxHp < 0.32) {
    const k = 1 - pl.hp / pl.maxHp / 0.32;
    const pulse = 0.55 + 0.45 * Math.sin(g.animT * 6.5);
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.68);
    grd.addColorStop(0, 'rgba(255,30,70,0)');
    grd.addColorStop(1, `rgba(255,25,70,${0.08 + k * 0.16 * pulse})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawReticle(ctx, g) {
  if (g.input.isTouch) return;
  if (g.state !== 'playing' && g.state !== 'dying') return;
  const { x, y } = g.input.mouse;
  const t = g.animT;
  const od = g.player && g.player.odActive > 0;
  const col = od ? PALETTE.od : g.bulletTime ? '#9fd8ff' : PALETTE.player;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(col, 0.9);
  ctx.lineWidth = 1.6;
  ctx.translate(x, y);
  const s = 7;
  ctx.beginPath();
  ctx.moveTo(-s - 5, 0); ctx.lineTo(-s, 0);
  ctx.moveTo(s, 0); ctx.lineTo(s + 5, 0);
  ctx.moveTo(0, -s - 5); ctx.lineTo(0, -s);
  ctx.moveTo(0, s); ctx.lineTo(0, s + 5);
  ctx.stroke();
  ctx.fillStyle = withAlpha(col, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, 1.6, 0, TAU);
  ctx.fill();
  ctx.rotate(t * 1.4);
  ctx.strokeStyle = withAlpha(col, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0.2, 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 15, Math.PI + 0.2, Math.PI + 1.4);
  ctx.stroke();
  ctx.restore();
}

function drawSticks(ctx, g) {
  if (!g.input.isTouch) return;
  for (const s of [g.input.moveStick, g.input.aimStick]) {
    if (!s.active) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(160,230,255,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 68, 0, TAU);
    ctx.stroke();
    const kx = s.ox + s.dx * s.mag * 68;
    const ky = s.oy + s.dy * s.mag * 68;
    ctx.fillStyle = 'rgba(160,240,255,0.22)';
    ctx.beginPath();
    ctx.arc(kx, ky, 26, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,250,255,0.5)';
    ctx.beginPath();
    ctx.arc(kx, ky, 26, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── главная функция ───────────────────────────────────────────────────────
export function renderGame(ctx, g) {
  const { w, h, dpr } = g;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  drawBackground(ctx, g);
  drawArenaFrame(ctx, g);

  const s = g.shake;
  ctx.save();
  if (s > 0.4) ctx.translate(rand(-s, s), rand(-s, s));

  g.fx.drawRings(ctx);
  drawPortals(ctx, g);
  drawOrbs(ctx, g);
  drawPickups(ctx, g);
  drawEnemies(ctx, g);
  drawPlayer(ctx, g);
  drawBullets(ctx, g);
  drawEnemyBullets(ctx, g);
  g.fx.drawParticles(ctx);
  g.fx.drawTexts(ctx);
  ctx.restore();

  drawPostFX(ctx, g);
  drawSticks(ctx, g);
  drawReticle(ctx, g);
}
