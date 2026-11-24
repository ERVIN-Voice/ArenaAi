import { MSG } from '../shared/constants.js';

export class Network {
  constructor() {
    this.ws = null;
    this.id = null;
    this.handlers = new Map();
    this.connected = false;
    this.ping = 0;
    this._pingTimer = null;
    this._pingSentAt = 0;
  }

  on(type, fn) { this.handlers.set(type, fn); }
  emit(type, data) { const fn = this.handlers.get(type); if (fn) fn(data); }

  connect(name) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.connected = true;
        ws.send(JSON.stringify({ type: MSG.JOIN, name }));
        this._pingTimer = setInterval(() => {
          if (ws.readyState === 1) {
            this._pingSentAt = performance.now();
            ws.send(JSON.stringify({ type: MSG.PING, t: Date.now() }));
          }
        }, 2000);
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === MSG.WELCOME) {
          this.id = msg.id;
          resolve(msg);
        } else if (msg.type === MSG.PONG) {
          this.ping = Math.round(performance.now() - this._pingSentAt);
        } else {
          this.emit(msg.type, msg);
        }
      });

      ws.addEventListener('close', () => {
        this.connected = false;
        clearInterval(this._pingTimer);
        this.emit('close');
      });
      ws.addEventListener('error', (e) => {
        if (!this.connected) reject(e);
        this.emit('error', e);
      });
    });
  }

  send(type, payload) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  sendInput(input) { this.send(MSG.INPUT, { input }); }
}
