// ─── Отрисовка MOTO RUSH: 3D дорога + 2D вид сверху ─────────────────────────
import { TAU, clamp, rand, withAlpha, hashNoise } from './util.js';
import { getGlow } from './fx.js';

const SEG_LEN = 200;
const RUMBLE = 3;
const ROAD_W = 2100;
const CAM_H = 1150;
const CAM_DEPTH = 0.92;
const DRAW_DIST = 170;

const THEMES = [
  { sky1: '#5db9ff', sky2: '#cfeeff', sun: '#fff6c9', grass1: '#3fbf5a', grass2: '#359e4c', road1: '#6b6f78', road2: '#62666f', rumble: '#e8e8e8', lane: '#ffffff', fog: 'rgba(207,238,255,0.0)', mtn: '#7fb8e8' },
  { sky1: '#2a1a5e', sky2: '#ff7a3d', sun: '#ffd24a', grass1: '#7a4a2d', grass2: '#6b3f26', road1: '#4a4a55', road2: '#43434d', rumble: '#ff4d5a', lane: '#ffd24a', fog: 'rgba(255,150,80,0.10)', mtn: '#5e3a6e' },
  { sky1: '#050818', sky2: '#14204a', sun: '#e8fbff', grass1: '#0e2a22', grass2: '#0b211b', road1: '#23262e', road2: '#1e2128', rumble: '#5ef1ff', lane: '#9fe9ff', fog: 'rgba(20,40,90,0.18)', mtn: '#0e1a3a' },
];

function glowAt(ctx, x, y, size, color, alpha) {
  try {
    const s = getGlow(color);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  } catch { /* noop */ }
}

function project(p, camX, camY, camZ, w, h) {
  p.camera.x = p.world.x - camX;
  p.camera.y = p.world.y - camY;
  p.camera.z = p.world.z - camZ;
  p.screen.scale = CAM_DEPTH / Math.max(1, p.camera.z);
  p.screen.x = Math.round(w / 2 + p.screen.scale * p.camera.x * (w / 2));
  p.screen.y = Math.round(h / 2 - p.screen.scale * p.camera.y * (h / 2));
  p.screen.w = Math.round(p.screen.scale * ROAD_W * (w / 2));
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}

function drawSky(ctx, g, theme) {
  const { w, h } = g;
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  grad.addColorStop(0, theme.sky1);
  grad.addColorStop(1, theme.sky2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.62);
  // солнце / луна
  const sx = w * 0.72 + Math.sin(g.animT * 0.1) * 8;
  const sy = h * 0.16;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, sx, sy, 220, theme.sun, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = theme.sun;
  ctx.beginPath(); ctx.arc(sx, sy, g.themeIndex === 2 ? 26 : 34, 0, TAU); ctx.fill();
  ctx.restore();
  // горы (параллакс от руления и кривой)
  const par = (g.playerX * 26 + Math.sin(g.position / 9000) * 30) % 60;
  ctx.fillStyle = theme.mtn;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  for (let x = 0; x <= w; x += 40) {
    const y = h * 0.5 - (Math.abs(Math.sin((x + par) * 0.008)) * h * 0.16 + Math.sin((x + par) * 0.02) * 10);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h * 0.62); ctx.lineTo(0, h * 0.62); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // звёзды ночью
  if (g.themeIndex === 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 89.3) % (h * 0.4);
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(g.animT * 1.5 + i));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

function drawSprite(ctx, g, seg, spr, theme) {
  const scale = seg.p1.screen.scale;
  if (scale <= 0 || seg.p1.camera.z <= CAM_DEPTH || seg.p1.camera.z < SEG_LEN * 1.2) return;
  const destX = seg.p1.screen.x + scale * spr.offset * ROAD_W * (g.w / 2);
  const destY = seg.p1.screen.y;
  const hPx = scale * 900 * (g.h / 2) * 0.55;
  const wPx = hPx * 0.7;
  if (destX < -wPx * 2 || destX > g.w + wPx * 2) return;
  ctx.save();
  ctx.translate(destX, destY);
  if (spr.type === 'palm') {
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(1, wPx * 0.08);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wPx * 0.1, -hPx * 0.6, wPx * 0.25, -hPx); ctx.stroke();
    ctx.strokeStyle = '#2f9e4f'; ctx.lineWidth = Math.max(1, wPx * 0.09);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * (0.15 + i * 0.18);
      ctx.beginPath();
      ctx.moveTo(wPx * 0.25, -hPx);
      ctx.quadraticCurveTo(wPx * 0.25 + Math.cos(a) * wPx * 0.5, -hPx + Math.sin(a) * wPx * 0.3, wPx * 0.25 + Math.cos(a) * wPx * 0.85, -hPx + Math.sin(a) * wPx * 0.55 + hPx * 0.25);
      ctx.stroke();
    }
  } else if (spr.type === 'lamp') {
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = Math.max(1, wPx * 0.07);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -hPx); ctx.stroke();
    ctx.fillStyle = theme.sun;
    ctx.beginPath(); ctx.arc(0, -hPx, Math.max(2, wPx * 0.14), 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, 0, -hPx, wPx * 1.2, theme.sun, 0.35);
    ctx.restore();
  } else if (spr.type === 'sign') {
    ctx.fillStyle = '#1a4a8a'; ctx.fillRect(-wPx * 0.5, -hPx, wPx, hPx * 0.55);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-wPx * 0.5, -hPx, wPx, hPx * 0.55);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(6, wPx * 0.22)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('MOTO →', 0, -hPx * 0.68);
    ctx.fillStyle = '#555'; ctx.fillRect(-wPx * 0.06, -hPx * 0.45, wPx * 0.12, hPx * 0.45);
  } else if (spr.type === 'billboard') {
    ctx.fillStyle = '#ff4d8d'; ctx.fillRect(-wPx * 0.7, -hPx * 1.1, wPx * 1.4, hPx * 0.6);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(6, wPx * 0.2)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('MOTO RUSH', 0, -hPx * 0.75);
    ctx.fillStyle = '#333'; ctx.fillRect(-wPx * 0.08, -hPx * 0.5, wPx * 0.16, hPx * 0.5);
  } else { // rock
    ctx.fillStyle = '#8a8f9a';
    ctx.beginPath();
    ctx.moveTo(-wPx * 0.5, 0); ctx.lineTo(-wPx * 0.2, -hPx * 0.5); ctx.lineTo(wPx * 0.3, -hPx * 0.6); ctx.lineTo(wPx * 0.5, 0);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawCar3D(ctx, g, car, seg) {
  const scale = seg.p1.screen.scale;
  if (scale <= 0 || seg.p1.camera.z <= CAM_DEPTH) return;
  const sx = seg.p1.screen.x + scale * car.x * ROAD_W * (g.w / 2);
  const sy = seg.p1.screen.y;
  let wPx = seg.p1.screen.w * car.w * 0.8;
  if (wPx < 1.6) return;
  // крупные машины у камеры не должны закрывать пол-экрана
  const maxW = g.w * 0.26;
  if (wPx > maxW) wPx = maxW;
  const hRatio = car.type === 'truck' ? 1.15 : car.type === 'van' ? 0.95
    : car.type === 'bike' ? 1.0 : 0.78;
  const hPx = wPx * hRatio;
  if (sx < -wPx * 1.6 || sx > g.w + wPx * 1.6) return;

  // мягко растворяем машину, которая уже «подъехала» к камере, и в тумане
  const camZ = seg.p1.camera.z;
  const nearCull = SEG_LEN * 4.2;
  if (camZ < nearCull) return;
  const nearFade = clamp((camZ - nearCull) / (SEG_LEN * 1.8), 0, 1);
  const far = SEG_LEN * DRAW_DIST;
  const fade = clamp((far - camZ) / (far * 0.5), 0, 1);
  const alpha = Math.min(1, fade * 1.6) * nearFade;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(0, 2, wPx * 0.6, Math.max(2, hPx * 0.1), 0, 0, TAU);
  ctx.fill();

  const isTruck = car.type === 'truck';
  const isVan = car.type === 'van';
  const isBike = car.type === 'bike';
  const night = g.themeIndex === 2;

  // мелкие машины у горизонта рисуем упрощённо — экономия на дальней сцене
  if (wPx < 26) {
    ctx.fillStyle = car.color;
    ctx.fillRect(-wPx / 2, -hPx * (isTruck ? 1.2 : 1), wPx, hPx * (isTruck ? 1.2 : 1));
    ctx.fillStyle = car.color2;
    ctx.fillRect(-wPx / 2, -hPx * 0.28, wPx, hPx * 0.28);
    ctx.restore();
    return;
  }

  if (isBike) {
    // мопед: узкий силуэт с райдером
    ctx.fillStyle = '#0c0e14';
    ctx.beginPath(); ctx.ellipse(0, -hPx * 0.12, wPx * 0.34, hPx * 0.16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = car.color;
    ctx.beginPath(); ctx.roundRect(-wPx * 0.26, -hPx * 0.72, wPx * 0.52, hPx * 0.55, wPx * 0.2); ctx.fill();
    ctx.fillStyle = car.color2;
    ctx.fillRect(-wPx * 0.3, -hPx * 0.7, wPx * 0.08, hPx * 0.22);
    ctx.fillRect(wPx * 0.22, -hPx * 0.7, wPx * 0.08, hPx * 0.22);
    ctx.fillStyle = '#20242f';
    ctx.beginPath(); ctx.arc(0, -hPx * 0.9, wPx * 0.24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff2f4d';
    ctx.fillRect(-wPx * 0.14, -hPx * 0.36, wPx * 0.28, hPx * 0.07);
    ctx.restore();
    return;
  }

  // колёса
  ctx.fillStyle = '#101218';
  const wheelW = wPx * (isTruck ? 0.17 : 0.15);
  ctx.fillRect(-wPx * 0.52, -hPx * 0.28, wheelW, hPx * 0.3);
  ctx.fillRect(wPx * 0.52 - wheelW, -hPx * 0.28, wheelW, hPx * 0.3);

  // кузов: сужается к крыше, чтобы читался объём
  const bodyH = hPx * (isTruck ? 0.78 : 0.9);
  const r = Math.max(2, wPx * 0.12);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.moveTo(-wPx * 0.5, 0);
  ctx.lineTo(-wPx * 0.5, -bodyH * 0.68);
  ctx.quadraticCurveTo(-wPx * 0.5, -bodyH, -wPx * 0.38, -bodyH);
  ctx.lineTo(wPx * 0.38, -bodyH);
  ctx.quadraticCurveTo(wPx * 0.5, -bodyH, wPx * 0.5, -bodyH * 0.68);
  ctx.lineTo(wPx * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  // светлая кромка крыши — читается как верхняя плоскость
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.roundRect(-wPx * 0.37, -bodyH - bodyH * 0.04, wPx * 0.74, bodyH * 0.09, r * 0.6);
  ctx.fill();
  // бампер и номер
  ctx.fillStyle = car.color2;
  ctx.fillRect(-wPx * 0.5, -bodyH * 0.34, wPx, bodyH * 0.34);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-wPx * 0.5, -bodyH * 0.22, wPx, bodyH * 0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(-wPx * 0.17, -bodyH * 0.22, wPx * 0.34, bodyH * 0.1);

  if (isTruck) {
    // тент и рёбра
    ctx.fillStyle = car.color2;
    ctx.beginPath();
    ctx.roundRect(-wPx * 0.42, -bodyH * 1.14, wPx * 0.84, bodyH * 0.5, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * wPx * 0.16, -bodyH * 1.14, wPx * 0.04, bodyH * 0.48);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-wPx * 0.46, -bodyH * 0.7, wPx * 0.92, bodyH * 0.06);
  } else {
    // заднее стекло и крыша
    ctx.fillStyle = 'rgba(10,20,40,0.88)';
    ctx.beginPath();
    ctx.roundRect(-wPx * 0.32, -bodyH * 0.82, wPx * 0.64, bodyH * 0.38, r * 0.8);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,225,255,0.35)';
    ctx.fillRect(-wPx * 0.34, -bodyH * 0.84, wPx * 0.68, bodyH * 0.07);
    if (isVan) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(-wPx * 0.46, -bodyH * 0.3, wPx * 0.92, bodyH * 0.06);
    }
  }

  // фары/фонари
  const lightW = wPx * 0.2;
  const lightH = Math.max(1.5, bodyH * 0.09);
  if (night) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, -wPx * 0.34, -bodyH * 0.2, wPx * 0.9, '#ff2f4d', 0.5);
    glowAt(ctx, wPx * 0.34, -bodyH * 0.2, wPx * 0.9, '#ff2f4d', 0.5);
    ctx.restore();
  }
  ctx.fillStyle = '#ff2f4d';
  ctx.fillRect(-wPx * 0.44, -bodyH * 0.24, lightW, lightH);
  ctx.fillRect(wPx * 0.44 - lightW, -bodyH * 0.24, lightW, lightH);
  ctx.fillStyle = 'rgba(255,246,201,0.9)';
  ctx.fillRect(-wPx * 0.44, -bodyH * 0.62, lightW * 0.7, lightH * 0.7);
  ctx.fillRect(wPx * 0.44 - lightW * 0.7, -bodyH * 0.62, lightW * 0.7, lightH * 0.7);
  ctx.restore();
}

function drawCoin3D(ctx, g, coin, seg) {
  const scale = seg.p1.screen.scale;
  if (scale <= 0 || seg.p1.camera.z <= CAM_DEPTH) return;
  const sx = seg.p1.screen.x + scale * coin.x * ROAD_W * (g.w / 2);
  const sy = seg.p1.screen.y - scale * 420 * (g.h / 2) + Math.sin(coin.bob) * scale * 60 * (g.h / 2);
  const r = Math.min(g.w * 0.02, Math.max(2, scale * 150 * (g.h / 2) * 0.5));
  if (sx < -r * 2 || sx > g.w + r * 2) return;
  if (r < 1.4) return;
  const coinFade = clamp((seg.p1.camera.z - SEG_LEN * 3.6) / (SEG_LEN * 1.6), 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.max(0, coinFade);
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, sx, sy, r * 4, '#ffd24a', 0.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff2a8';
  ctx.beginPath(); ctx.arc(sx, sy, r * 0.6, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBike3D(ctx, g) {
  const { w, h } = g;
  const bike = g.bike;
  const wheelie = g.wheelieTimer > 0;
  const ghost = g.time < g.cheatState.ghostUntil;
  const god = g.time < g.cheatState.godUntil;
  const s = Math.min(w, h) / 720;
  const B = Math.max(58, 96 * s);
  const speedPct = clamp(g.maxSpeed ? g.speed / g.maxSpeed : 0, 0, 1.4);
  const bob = Math.sin(g.animT * (10 + speedPct * 16)) * speedPct * 2.2;
  const cx = w / 2 + g.lean * w * 0.09;
  const cy = h * 0.9 + bob;

  // тень под байком
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx + g.lean * 10, cy + B * 0.06, B * 0.62, B * 0.14, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(g.lean * 0.4 - (wheelie ? 0.3 : 0));
  if (ghost) ctx.globalAlpha = 0.45;

  // нитро-пламя из-под хвоста
  if (g.nitroActive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fl = B * (0.85 + Math.random() * 0.65);
    const fg = ctx.createLinearGradient(0, B * 0.1, 0, B * 0.1 + fl);
    fg.addColorStop(0, 'rgba(255,255,255,0.95)');
    fg.addColorStop(0.3, 'rgba(94,241,255,0.9)');
    fg.addColorStop(0.7, 'rgba(255,138,61,0.65)');
    fg.addColorStop(1, 'rgba(255,77,141,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-B * 0.22, B * 0.1);
    ctx.quadraticCurveTo(0, B * 0.1 + fl * 1.1, B * 0.22, B * 0.1);
    ctx.closePath(); ctx.fill();
    glowAt(ctx, 0, B * 0.2, B * 2.4, '#5ef1ff', 0.35);
    ctx.restore();
  }

  // заднее колесо
  ctx.fillStyle = '#0b0d13';
  ctx.beginPath(); ctx.ellipse(0, -B * 0.06, B * 0.4, B * 0.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2a2f3d';
  ctx.lineWidth = Math.max(1.5, B * 0.05);
  ctx.beginPath(); ctx.ellipse(0, -B * 0.06, B * 0.27, B * 0.36, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = bike.color2;
  ctx.beginPath(); ctx.ellipse(0, -B * 0.06, B * 0.11, B * 0.16, 0, 0, TAU); ctx.fill();

  // маятник и выхлопы
  ctx.strokeStyle = '#40465a';
  ctx.lineWidth = B * 0.07;
  ctx.beginPath(); ctx.moveTo(-B * 0.3, -B * 0.1); ctx.lineTo(-B * 0.42, -B * 0.34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(B * 0.3, -B * 0.1); ctx.lineTo(B * 0.42, -B * 0.34); ctx.stroke();
  ctx.fillStyle = '#9aa3b5';
  ctx.beginPath(); ctx.ellipse(-B * 0.4, -B * 0.2, B * 0.075, B * 0.05, -0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(B * 0.4, -B * 0.2, B * 0.075, B * 0.05, 0.4, 0, TAU); ctx.fill();

  // корпус/хвост
  const grad = ctx.createLinearGradient(0, -B * 1.1, 0, B * 0.1);
  grad.addColorStop(0, bike.color);
  grad.addColorStop(0.55, bike.color);
  grad.addColorStop(1, bike.color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-B * 0.2, -B * 1.12);
  ctx.quadraticCurveTo(-B * 0.42, -B * 0.72, -B * 0.3, -B * 0.14);
  ctx.quadraticCurveTo(0, -B * 0.02, B * 0.3, -B * 0.14);
  ctx.quadraticCurveTo(B * 0.42, -B * 0.72, B * 0.2, -B * 1.12);
  ctx.closePath(); ctx.fill();
  // светлая полоса по корпусу
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(0, -B * 1.06);
  ctx.quadraticCurveTo(-B * 0.06, -B * 0.7, -B * 0.04, -B * 0.16);
  ctx.lineTo(B * 0.04, -B * 0.16);
  ctx.quadraticCurveTo(B * 0.06, -B * 0.7, 0, -B * 1.06);
  ctx.fill();

  // стоп-сигнал
  const braking = g.input?.down?.('KeyS') || g.input?.down?.('ArrowDown');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, 0, -B * 0.42, B * (braking ? 1.5 : 0.9), '#ff2f4d', braking ? 0.75 : 0.4);
  ctx.restore();
  ctx.fillStyle = braking ? '#ff6b7a' : '#ff2f4d';
  ctx.beginPath();
  ctx.roundRect(-B * 0.18, -B * 0.48, B * 0.36, B * 0.1, B * 0.05);
  ctx.fill();

  // ноги райдера
  ctx.fillStyle = '#191d28';
  ctx.beginPath(); ctx.ellipse(-B * 0.32, -B * 0.62, B * 0.12, B * 0.26, 0.25, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(B * 0.32, -B * 0.62, B * 0.12, B * 0.26, -0.25, 0, TAU); ctx.fill();

  // корпус райдера (куртка)
  const jg = ctx.createLinearGradient(0, -B * 1.75, 0, -B * 1.0);
  jg.addColorStop(0, '#2b3142');
  jg.addColorStop(1, '#161a25');
  ctx.fillStyle = jg;
  ctx.beginPath();
  ctx.moveTo(-B * 0.4, -B * 1.02);
  ctx.quadraticCurveTo(-B * 0.5, -B * 1.6, -B * 0.22, -B * 1.72);
  ctx.lineTo(B * 0.22, -B * 1.72);
  ctx.quadraticCurveTo(B * 0.5, -B * 1.6, B * 0.4, -B * 1.02);
  ctx.closePath(); ctx.fill();
  // полосы куртки
  ctx.strokeStyle = bike.color;
  ctx.lineWidth = B * 0.045;
  ctx.beginPath(); ctx.moveTo(-B * 0.34, -B * 1.16); ctx.lineTo(-B * 0.18, -B * 1.62); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(B * 0.34, -B * 1.16); ctx.lineTo(B * 0.18, -B * 1.62); ctx.stroke();

  // руки к рулю
  ctx.strokeStyle = '#232733';
  ctx.lineCap = 'round';
  ctx.lineWidth = B * 0.13;
  ctx.beginPath(); ctx.moveTo(-B * 0.34, -B * 1.55); ctx.lineTo(-B * 0.62, -B * 1.12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(B * 0.34, -B * 1.55); ctx.lineTo(B * 0.62, -B * 1.12); ctx.stroke();
  // перчатки и руль
  ctx.fillStyle = '#0f1219';
  ctx.beginPath(); ctx.arc(-B * 0.63, -B * 1.1, B * 0.075, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(B * 0.63, -B * 1.1, B * 0.075, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a5166';
  ctx.lineWidth = B * 0.04;
  ctx.beginPath(); ctx.moveTo(-B * 0.62, -B * 1.08); ctx.lineTo(B * 0.62, -B * 1.08); ctx.stroke();

  // шлем
  ctx.fillStyle = '#1b2030';
  ctx.beginPath(); ctx.arc(0, -B * 1.92, B * 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = bike.color;
  ctx.beginPath(); ctx.arc(0, -B * 1.94, B * 0.26, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(140,215,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(-B * 0.2, -B * 2.06, B * 0.4, B * 0.08, B * 0.03);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(0, -B * 1.96, B * 0.09, 0, TAU); ctx.fill();

  ctx.restore();

  // аура неуязвимости
  if (god) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,210,74,${0.4 + 0.3 * Math.sin(g.animT * 6)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy - B * 0.8, B * 1.6, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if (wheelie) {
    ctx.save();
    ctx.font = `900 ${Math.round(20 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 16;
    ctx.fillText('WHEELIE!', cx, cy - B * 2.5);
    ctx.restore();
  }
}

function render3D(ctx, g) {
  const { w, h } = g;
  const theme = THEMES[g.themeIndex] || THEMES[1];
  const demo = g.state === 'title' || g.state === 'gameover';
  const position = demo ? (g.animT * 2600) % g.trackLength : g.position;
  const playerSeg = g.findSegment(position);
  const playerPct = (position % SEG_LEN) / SEG_LEN;
  const playerY = playerSeg.p1.world.y + (playerSeg.p2.world.y - playerSeg.p1.world.y) * playerPct;
  const baseIdx = playerSeg.index;
  const maxY = playerY + CAM_H;

  drawSky(ctx, g, theme);

  // дорога: дальние → ближние
  let x = 0, dx = -(playerSeg.curve * playerPct);
  const drawn = [];
  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = g.segments[(baseIdx + n) % g.segments.length];
    const looped = seg.index < baseIdx;
    const camZ = position - (looped ? g.trackLength : 0);
    project(seg.p1, g.playerX * ROAD_W - x, playerY + CAM_H, camZ, w, h);
    project(seg.p2, g.playerX * ROAD_W - x - dx, playerY + CAM_H, camZ, w, h);
    x += dx; dx += seg.curve;
    seg.clip = maxY;
    if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxY) continue;
    drawn.push(seg);
  }
  // трава одним заливом, дальше — только тёмные полосы для ощущения скорости
  let horizonY = h;
  for (const seg of drawn) horizonY = Math.min(horizonY, seg.p2.screen.y);
  if (horizonY < h) {
    ctx.fillStyle = theme.grass1;
    ctx.fillRect(0, Math.max(0, horizonY), w, h - horizonY);
  }
  // рисуем с конца (дальние) к началу
  for (let i = drawn.length - 1; i >= 0; i--) {
    const seg = drawn[i];
    const light = seg.color === 'light';
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    // полоса травы
    if (!light) {
      ctx.fillStyle = theme.grass2;
      ctx.fillRect(0, p2.y, w, p1.y - p2.y);
    }
    const r1 = p1.w * 1.18, r2 = p2.w * 1.18;
    const l1 = p1.w * 0.06, l2 = p2.w * 0.06;
    // обочина
    poly(ctx, p1.x - r1, p1.y, p1.x + r1, p1.y, p2.x + r2, p2.y, p2.x - r2, p2.y, light ? theme.rumble : '#c23a4a');
    // асфальт
    poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, light ? theme.road1 : theme.road2);
    // разметка
    if (Math.floor(seg.index / RUMBLE) % 2 === 0) {
      poly(ctx, p1.x - l1, p1.y, p1.x + l1, p1.y, p2.x + l2, p2.y, p2.x - l2, p2.y, theme.lane);
    }
    // туман
    if (theme.fog !== 'rgba(207,238,255,0.0)') {
      ctx.fillStyle = theme.fog;
      ctx.fillRect(0, p2.y, w, p1.y - p2.y);
    }
  }
  // спрайты, трафик, монеты: дальние → ближние
  for (let i = drawn.length - 1; i >= 0; i--) {
    const seg = drawn[i];
    for (const spr of seg.sprites) drawSprite(ctx, g, seg, spr, theme);
  }
  const sortedCars = [...g.traffic].sort((a, b) => b.z - a.z);
  for (const car of sortedCars) {
    let rel = car.z - position;
    if (rel < -g.trackLength / 2) rel += g.trackLength;
    if (rel < SEG_LEN * 4.2 || rel > SEG_LEN * DRAW_DIST) continue;
    drawCar3D(ctx, g, car, g.findSegment(car.z));
  }
  const sortedCoins = [...g.coinArr].sort((a, b) => b.z - a.z);
  for (const c of sortedCoins) {
    let rel = c.z - position;
    if (rel < -g.trackLength / 2) rel += g.trackLength;
    if (rel < SEG_LEN * 3.6 || rel > SEG_LEN * DRAW_DIST) continue;
    drawCoin3D(ctx, g, c, g.findSegment(c.z));
  }
  // частицы поверх
  g.fx?.drawRings?.(ctx);
  g.fx?.drawParticles?.(ctx);
  if (!demo) drawBike3D(ctx, g);
  g.fx?.drawTexts?.(ctx);
  drawSpeedFX(ctx, g);
}

function drawSpeedFX(ctx, g) {
  const { w, h } = g;
  const pct = g.hud?.speedPct || 0;
  if (pct > 0.55 && g.state === 'playing') {
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${(pct - 0.55) * 0.5})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = rand(0, h);
      const x = Math.random() < 0.5 ? rand(0, w * 0.2) : rand(w * 0.8, w);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (x < w / 2 ? 60 : -60), y);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (g.shake > 0.5) {
    ctx.save();
    ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
    ctx.restore();
  }
}

// ─── 2D вид сверху ───────────────────────────────────────────────────────────
function drawProp2D(ctx, x, y, k, kind, theme) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (kind === 'palm') {
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(6, -26, 12, -46); ctx.stroke();
    ctx.strokeStyle = '#2f9e4f';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * (0.08 + i * 0.21);
      ctx.beginPath();
      ctx.moveTo(12, -46);
      ctx.quadraticCurveTo(12 + Math.cos(a) * 26, -46 + Math.sin(a) * 12, 12 + Math.cos(a) * 40, -30 + Math.sin(a) * 26);
      ctx.stroke();
    }
  } else if (kind === 'lamp') {
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -54); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -54); ctx.lineTo(-14, -54); ctx.stroke();
    ctx.fillStyle = theme.sun;
    ctx.beginPath(); ctx.arc(-14, -52, 6, 0, TAU); ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, -14, -52, 60, theme.sun, 0.35);
    ctx.restore();
  } else {
    ctx.fillStyle = '#8a8f9a';
    ctx.beginPath();
    ctx.moveTo(-13, 6); ctx.lineTo(-5, -16); ctx.lineTo(7, -20); ctx.lineTo(14, 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(-5, -16); ctx.lineTo(7, -20); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function render2D(ctx, g) {
  const { w, h } = g;
  const theme = THEMES[g.themeIndex] || THEMES[1];
  const demo = g.state === 'title' || g.state === 'gameover';
  const roadW = Math.min(w * 0.56, 680);
  const roadX = w / 2 - roadW / 2;
  const playerY = h * 0.74;
  const scale = 0.85; // px на единицу мира
  const scroll = (demo ? g.animT * 2600 : g.position) % 400;

  // фон
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, theme.sky1);
  grad.addColorStop(1, theme.grass2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // обочины: полосы и точки
  ctx.fillStyle = theme.grass1;
  ctx.fillRect(0, 0, roadX, h);
  ctx.fillRect(roadX + roadW, 0, roadX, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = -40 + (scroll * scale) % 90; y < h; y += 90) {
    ctx.fillRect(0, y, roadX, 10);
    ctx.fillRect(roadX + roadW, y, roadX, 10);
  }
  // дорога
  ctx.fillStyle = theme.road1;
  ctx.fillRect(roadX, 0, roadW, h);
  // края
  ctx.fillStyle = theme.rumble;
  ctx.fillRect(roadX, 0, 8, h);
  ctx.fillRect(roadX + roadW - 8, 0, 8, h);
  // разметка
  ctx.fillStyle = theme.lane;
  const laneOff = (scroll * scale) % 110;
  for (let y = -110 + laneOff; y < h; y += 110) {
    ctx.fillRect(w / 2 - 4, y, 8, 62);
    ctx.fillRect(roadX + roadW * 0.33 - 3, y + 30, 6, 50);
    ctx.fillRect(roadX + roadW * 0.66 - 3, y + 30, 6, 50);
  }

  // придорожные объекты, летящие навстречу
  const gap = 124;
  const off = (scroll * scale) % gap;
  const base = Math.floor((scroll * scale) / gap);
  for (let i = -1; i <= Math.ceil(h / gap) + 1; i++) {
    const idx = base + i;
    const hs = hashNoise(idx);
    const side = idx % 2 === 0 ? -1 : 1;
    const y = i * gap + off;
    const k = 0.75 + hs * 0.45;
    const x = side < 0 ? roadX - 26 - hs * 54 : roadX + roadW + 26 + hs * 54;
    const kind = hs > 0.62 ? 'palm' : hs > 0.3 ? 'lamp' : 'rock';
    drawProp2D(ctx, x, y, k, kind, theme);
  }

  const toScreen = (relZ, xOff) => ({
    x: w / 2 + xOff * (roadW / 2),
    y: playerY - relZ * scale,
  });

  // монеты
  for (const c of g.coinArr) {
    let rel = c.z - (demo ? (g.animT * 2600) % g.trackLength : g.position);
    if (rel < -g.trackLength / 2) rel += g.trackLength;
    if (rel < -400 || rel > h / scale + 200) continue;
    const p = toScreen(rel, c.x);
    if (p.y < -30 || p.y > h + 30) continue;
    const r = 13 * (0.7 + 0.3 * Math.abs(Math.cos(c.bob)));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, p.x, p.y, r * 4, '#ffd24a', 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff2a8';
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // трафик сверху
  const sorted = [...g.traffic].sort((a, b) => b.z - a.z);
  for (const car of sorted) {
    let rel = car.z - (demo ? (g.animT * 2600) % g.trackLength : g.position);
    if (rel < -g.trackLength / 2) rel += g.trackLength;
    if (rel < -500 || rel > h / scale + 300) continue;
    const p = toScreen(rel, car.x);
    if (p.y < -90 || p.y > h + 90) continue;
    const cw = roadW * car.w * 0.5;
    const ch = cw * 1.9;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-cw / 2 + 4, -ch / 2 + 6, cw, ch);
    const grad2 = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    grad2.addColorStop(0, car.color);
    grad2.addColorStop(1, car.color2);
    ctx.fillStyle = grad2;
    ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 10); ctx.fill();
    ctx.fillStyle = 'rgba(10,20,40,0.85)';
    ctx.beginPath(); ctx.roundRect(-cw * 0.38, -ch * 0.28, cw * 0.76, ch * 0.4, 6); ctx.fill();
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(-cw * 0.42, -ch / 2 + 4, cw * 0.2, 8);
    ctx.fillRect(cw * 0.22, -ch / 2 + 4, cw * 0.2, 8);
    ctx.fillStyle = '#ff2f4d';
    ctx.fillRect(-cw * 0.42, ch / 2 - 12, cw * 0.2, 8);
    ctx.fillRect(cw * 0.22, ch / 2 - 12, cw * 0.2, 8);
    ctx.fillStyle = '#111';
    ctx.fillRect(-cw / 2 - 4, -ch * 0.32, 6, ch * 0.2);
    ctx.fillRect(cw / 2 - 2, -ch * 0.32, 6, ch * 0.2);
    ctx.fillRect(-cw / 2 - 4, ch * 0.12, 6, ch * 0.2);
    ctx.fillRect(cw / 2 - 2, ch * 0.12, 6, ch * 0.2);
    ctx.restore();
  }

  // игрок сверху
  if (!demo) {
    const bike = g.bike;
    const px = w / 2 + g.playerX * (roadW / 2);
    const py = playerY;
    const wheelie = g.wheelieTimer > 0;
    const ghost = g.time < g.cheatState.ghostUntil;
    const god = g.time < g.cheatState.godUntil;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(g.lean * 0.36);
    if (ghost) ctx.globalAlpha = 0.5;
    const B = Math.min(roadW * 0.18, 62);
    if (g.nitroActive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fl = B * (1 + Math.random() * 0.8);
      const fg = ctx.createLinearGradient(0, B * 0.6, 0, B * 0.6 + fl);
      fg.addColorStop(0, 'rgba(94,241,255,0.95)');
      fg.addColorStop(1, 'rgba(255,77,141,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-B * 0.2, B * 0.55); ctx.lineTo(0, B * 0.6 + fl); ctx.lineTo(B * 0.2, B * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(4, 6, B * 0.5, B * 1.0, 0, 0, TAU); ctx.fill();
    // заднее колесо
    ctx.fillStyle = '#0b0d13';
    ctx.beginPath(); ctx.roundRect(-B * 0.19, B * 0.52, B * 0.38, B * 0.55, B * 0.14); ctx.fill();
    // переднее колесо
    ctx.beginPath(); ctx.roundRect(-B * 0.13, -B * 1.34, B * 0.26, B * 0.44, B * 0.11); ctx.fill();
    // вилка
    ctx.strokeStyle = '#5b6478';
    ctx.lineWidth = B * 0.07;
    ctx.beginPath(); ctx.moveTo(-B * 0.1, -B * 0.92); ctx.lineTo(-B * 0.07, -B * 1.16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(B * 0.1, -B * 0.92); ctx.lineTo(B * 0.07, -B * 1.16); ctx.stroke();
    // корпус
    const grad3 = ctx.createLinearGradient(-B * 0.4, 0, B * 0.4, 0);
    grad3.addColorStop(0, bike.color2);
    grad3.addColorStop(0.45, bike.color);
    grad3.addColorStop(1, bike.color2);
    ctx.fillStyle = grad3;
    ctx.beginPath();
    ctx.moveTo(0, -B * 0.98);
    ctx.quadraticCurveTo(B * 0.32, -B * 0.7, B * 0.22, B * 0.1);
    ctx.quadraticCurveTo(B * 0.18, B * 0.62, 0, B * 0.68);
    ctx.quadraticCurveTo(-B * 0.18, B * 0.62, -B * 0.22, B * 0.1);
    ctx.quadraticCurveTo(-B * 0.32, -B * 0.7, 0, -B * 0.98);
    ctx.fill();
    // светлая полоса
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.roundRect(-B * 0.035, -B * 0.85, B * 0.07, B * 1.25, B * 0.03); ctx.fill();
    // выхлопы
    ctx.fillStyle = '#9aa3b5';
    ctx.beginPath(); ctx.roundRect(-B * 0.26, B * 0.5, B * 0.1, B * 0.22, B * 0.04); ctx.fill();
    ctx.beginPath(); ctx.roundRect(B * 0.16, B * 0.5, B * 0.1, B * 0.22, B * 0.04); ctx.fill();
    // райдер: плечи и шлем
    ctx.fillStyle = '#191d28';
    ctx.beginPath(); ctx.ellipse(0, B * 0.05, B * 0.3, B * 0.34, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = bike.color;
    ctx.beginPath(); ctx.arc(0, -B * 0.12, B * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(160,225,255,0.7)';
    ctx.beginPath(); ctx.arc(0, -B * 0.19, B * 0.1, 0, TAU); ctx.fill();
    // руки на руль
    ctx.strokeStyle = '#222633';
    ctx.lineCap = 'round';
    ctx.lineWidth = B * 0.09;
    ctx.beginPath(); ctx.moveTo(-B * 0.24, -B * 0.02); ctx.lineTo(-B * 0.3, -B * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(B * 0.24, -B * 0.02); ctx.lineTo(B * 0.3, -B * 0.6); ctx.stroke();
    // руль
    ctx.strokeStyle = '#4a5166';
    ctx.lineWidth = B * 0.06;
    ctx.beginPath(); ctx.moveTo(-B * 0.32, -B * 0.62); ctx.lineTo(B * 0.32, -B * 0.62); ctx.stroke();
    // стоп-сигнал
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, 0, B * 0.66, B * 0.7, '#ff2f4d', 0.5);
    ctx.restore();
    ctx.fillStyle = '#ff2f4d';
    ctx.beginPath(); ctx.roundRect(-B * 0.13, B * 0.6, B * 0.26, B * 0.09, B * 0.04); ctx.fill();
    ctx.restore();
    if (god) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,210,74,${0.5 + 0.3 * Math.sin(g.animT * 6)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, B * 1.3, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (wheelie) {
      ctx.save();
      ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd24a'; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 14;
      ctx.fillText('WHEELIE!', px, py - B * 1.8);
      ctx.restore();
    }
  }

  g.fx?.drawRings?.(ctx);
  g.fx?.drawParticles?.(ctx);
  g.fx?.drawTexts?.(ctx);
  drawSpeedFX(ctx, g);
}

export function renderGame(ctx, g) {
  const { w, h, dpr } = g;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // тряска
  if (g.shake > 0.4) ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
  if (g.mode === '2d') render2D(ctx, g);
  else render3D(ctx, g);
  // виньетка
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
