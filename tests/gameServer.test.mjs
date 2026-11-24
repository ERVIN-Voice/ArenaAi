import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../src/server/gameServer.js';

test('game server initializes with bots and handles player join', () => {
  const gs = new GameServer();
  const entities = gs.allEntities();
  assert.ok(entities.length >= 6, 'should have bots');
  const player = gs.addPlayer('Tester');
  assert.equal(player.name, 'Tester');
  assert.equal(player.hp, 100);
  assert.equal(gs.allEntities().length, entities.length + 1);
  const snap = gs.buildSnapshot(player.id);
  assert.equal(snap.type, 'state');
  assert.equal(snap.you, player.id);
  assert.ok(snap.entities.find(e => e.id === player.id));
});

test('input moves player and shooting produces events', async () => {
  const gs = new GameServer();
  const p = gs.addPlayer('Shooter');
  const z0 = p.z;
  gs.handleInput(p.id, { forward: 1, right: 0, yaw: 0, pitch: 0, shoot: false });
  await new Promise(r => setTimeout(r, 60));
  gs.tick();
  await new Promise(r => setTimeout(r, 60));
  gs.tick();
  assert.notEqual(p.z, z0); // moved forward along +Z at yaw=0

  // advance game time so fire rate allows shooting
  gs.time += 1000;
  gs.handleInput(p.id, { forward: 0, right: 0, yaw: 0, pitch: 0, shoot: true });
  await new Promise(r => setTimeout(r, 60));
  gs.tick();
  const snap = gs.buildSnapshot(p.id);
  assert.ok(p.ammo < 30 || snap.events.some(e => e.type === 'shot'));
});
