import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GameServer } from './src/server/gameServer.js';
import { MSG, TICK_MS } from './src/shared/constants.js';

const __filenameResolved = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filenameResolved);
const isPkg = typeof process.pkg !== 'undefined';
const PORT = Number(process.env.PORT) || 8080;
const isProd = process.env.NODE_ENV === 'production' || isPkg;

const app = express();
app.disable('x-powered-by');

// Allow preview proxy hosts
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const game = new GameServer();

function safeSend(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
  }
}

wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === MSG.JOIN) {
      if (playerId) return;
      const name = typeof msg.name === 'string' ? msg.name.trim().slice(0, 16) || 'Player' : 'Player';
      const entity = game.addPlayer(name);
      playerId = entity.id;
      ws.playerId = playerId;
      safeSend(ws, {
        type: MSG.WELCOME,
        id: playerId,
        name: entity.name,
        color: entity.color,
        tickRate: 1000 / TICK_MS,
      });
      return;
    }

    if (!playerId) return;

    if (msg.type === MSG.INPUT) {
      game.handleInput(playerId, msg.input || {});
    } else if (msg.type === MSG.PING) {
      safeSend(ws, { type: MSG.PONG, t: msg.t });
    }
  });

  ws.on('close', () => {
    if (playerId) game.removePlayer(playerId);
  });

  ws.on('error', () => {
    if (playerId) game.removePlayer(playerId);
  });
});

// Game loop
setInterval(() => {
  game.tick();
  for (const client of wss.clients) {
    if (client.readyState !== 1 || !client.playerId) continue;
    const snap = game.buildSnapshot(client.playerId);
    safeSend(client, snap);
  }
}, TICK_MS);

function resolveDistDir() {
  const candidates = [
    path.join(__dirname, 'dist'),
    path.join(process.cwd(), 'dist'),
  ];
  if (isPkg) {
    candidates.unshift(path.join(path.dirname(process.execPath), 'dist'));
    candidates.unshift(path.join(__dirname, 'dist'));
  }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return path.join(__dirname, 'dist');
}

async function setupClient() {
  if (isProd) {
    const dist = resolveDistDir();
    if (fs.existsSync(dist)) {
      app.use(express.static(dist));
      app.get('*', (req, res) => {
        res.sendFile(path.join(dist, 'index.html'));
      });
      console.log('Serving client from', dist);
    } else {
      app.get('*', (_req, res) => res.status(503).send('dist not built. Run npm run build'));
    }
    return;
  }

  // Dev: use Vite in middleware mode
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

setupClient().then(() => {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Arena Shooter 3D running on http://0.0.0.0:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
