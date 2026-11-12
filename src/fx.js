// ─── Визуальные эффекты: частицы, кольца, всплывающий текст ─────────────────
import { TAU, rand, clamp, withAlpha, pick } from './util.js';

const glowCache = new Map();

// Предрендер «мягкого» свечения — рисуется в аддитивном режиме, очень быстро.
export function getGlow(color) {
  let sprite = glowCache.get(color);
  if (sprite) return sprite;
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, withAlpha(color, 0.95));
  grad.addColorStop(0.18, withAlpha(color, 0.55));
  grad.addColorStop(0.45, withAlpha(color, 0.16));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(color, c);
  return c;
}

export function clearGlowCache() {
  glowCache.clear();
}

export class FX {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.max = 1100;
    this.pool = [];
  }

  clear() {
    this.pool.push(...this.particles);
    this.particles.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
  }

  _get() {
    const p = this.pool.pop() || {};
    return p;
  }

  particle(o) {
    if (this.particles.length >= this.max) return;
    const p = this._get();
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.life = p.maxLife = o.life || 0.5;
    p.size = o.size || 4;
    p.color = o.color || '#ffffff';
    p.drag = o.drag === undefined ? 0.94 : o.drag;
    p.gravity = o.gravity || 0;
    p.glow = o.glow === undefined ? 1 : o.glow;
    p.shrink = o.shrink === undefined ? 0.94 : o.shrink;
    p.spin = o.spin || 0;
    p.rot = o.rot || 0;
    p.shape = o.shape || 'circle';
    this.particles.push(p);
    return p;
  }

  // Взрыв искр
  burst(x, y, count, color, opts = {}) {
    const speed = opts.speed || 220;
    const size = opts.size || 4.5;
    const life = opts.life || 0.6;
    for (let i = 0; i < count; i++) {
      const a = opts.angle !== undefined ? opts.angle + rand(-opts.spread || -0.6, opts.spread || 0.6) : rand(0, TAU);
      const sp = speed * rand(0.25, 1);
      this.particle({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * rand(0.6, 1.2),
        size: size * rand(0.6, 1.3),
        color: opts.color2 && Math.random() < 0.35 ? opts.color2 : color,
        drag: opts.drag !== undefined ? opts.drag : 0.93,
        shrink: 0.94,
        glow: 1,
      });
    }
  }

  explosion(x, y, color, scale = 1) {
    this.burst(x, y, Math.round(16 * scale), color, {
      speed: 300 * scale, size: 5.5 * scale, life: 0.65,
    });
    this.burst(x, y, Math.round(8 * scale), '#ffffff', {
      speed: 180 * scale, size: 3 * scale, life: 0.35,
    });
    this.ring(x, y, color, { r0: 4, r1: 64 * scale, life: 0.38, width: 3 });
    this.ring(x, y, '#ffffff', { r0: 2, r1: 38 * scale, life: 0.25, width: 2 });
  }

  ring(x, y, color, opts = {}) {
    this.rings.push({
      x, y, color,
      r: opts.r0 || 0,
      r0: opts.r0 || 0,
      r1: opts.r1 || 80,
      life: this.rings.length > 90 ? 0.2 : opts.life || 0.5,
      maxLife: opts.life || 0.5,
      width: opts.width || 3,
      ease: opts.ease || 'out',
    });
  }

  text(x, y, str, color, size = 14) {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({
      x, y, str, color, size,
      life: 0.85, maxLife: 0.85,
      vx: rand(-24, 24), vy: -68 - rand(0, 30),
    });
  }

  update(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size *= Math.pow(p.shrink, dt * 60);
      p.rot += p.spin * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      const e = r.ease === 'out' ? 1 - Math.pow(1 - t, 3) : t;
      r.r = r.r0 + (r.r1 - r.r0) * e;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 52 * dt;
      t.vx *= Math.pow(0.9, dt * 60);
    }
  }

  drawParticles(ctx) {
    const ps = this.particles;
    if (!ps.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const a = clamp(p.life / p.maxLife, 0, 1);
      const size = Math.max(0.5, p.size);
      if (p.glow > 0.5) {
        const sprite = getGlow(p.color);
        const s = size * 5.2;
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'square') {
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.55, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawRings(ctx) {
    if (!this.rings.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const a = clamp(r.life / r.maxLife, 0, 1);
      ctx.strokeStyle = withAlpha(r.color, a * 0.62);
      ctx.lineWidth = Math.max(0.6, r.width * a);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0.1, r.r), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts(ctx) {
    if (!this.texts.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = clamp(t.life / t.maxLife, 0, 1);
      ctx.font = `800 ${t.size}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.fillStyle = withAlpha(t.color, k);
      ctx.fillText(t.str, t.x, t.y);
    }
  }
}
