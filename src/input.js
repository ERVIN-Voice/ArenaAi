// ─── Клавиатура, мышь и виртуальные стики для тача ─────────────────────────
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
    this.isTouch = false;
    this.moveStick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0 };
    this.aimStick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, dx: 0, dy: 0, angle: 0 };
    this._bind();
  }

  _bind() {
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyQ']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code) && e.target === document.body) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.add('Shift');
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.delete('Shift');
    });
    window.addEventListener('blur', () => this.keys.clear());

    const localPos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    };

    window.addEventListener('mousemove', (e) => {
      const p = localPos(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.isTouch = true;
        this._startStick(e);
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') this._moveStick(e);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') this._endStick(e);
    });
    window.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') this._endStick(e);
    });
  }

  _startStick(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const stick = x < r.width * 0.5 ? this.moveStick : this.aimStick;
    if (stick.id !== null) return;
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = x;
    stick.oy = y;
    stick.x = x;
    stick.y = y;
    stick.mag = 0;
    stick.dx = 0;
    stick.dy = 0;
  }

  _moveStick(e) {
    for (const s of [this.moveStick, this.aimStick]) {
      if (s.id !== e.pointerId) continue;
      const r = this.canvas.getBoundingClientRect();
      s.x = e.clientX - r.left;
      s.y = e.clientY - r.top;
      let dx = s.x - s.ox;
      let dy = s.y - s.oy;
      const m = Math.hypot(dx, dy);
      const max = 68;
      if (m > max) {
        s.ox = s.x - (dx / m) * max;
        s.oy = s.y - (dy / m) * max;
        dx = (dx / m) * max;
        dy = (dy / m) * max;
      }
      s.mag = Math.min(1, m / max);
      if (m > 1) {
        s.dx = dx / Math.max(1, Math.min(m, max));
        s.dy = dy / Math.max(1, Math.min(m, max));
        if (s === this.aimStick) s.angle = Math.atan2(dy, dx);
      } else {
        s.dx = 0;
        s.dy = 0;
      }
    }
  }

  _endStick(e) {
    for (const s of [this.moveStick, this.aimStick]) {
      if (s.id === e.pointerId) {
        s.active = false;
        s.id = null;
        s.mag = 0;
        s.dx = 0;
        s.dy = 0;
      }
    }
  }

  down(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.justPressed.has(code);
  }

  press(code) {
    this.justPressed.add(code);
  }

  endFrame() {
    this.justPressed.clear();
  }
}
