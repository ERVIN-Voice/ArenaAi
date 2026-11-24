import * as THREE from 'three';
import { PLAYER, MSG, WORLD } from '../shared/constants.js';
import { resolveCircleMap } from '../shared/map.js';
import { buildWorld } from './world.js';
import { createPlayerModel, updatePlayerModel, triggerShot } from './playerModel.js';

export class GameClient {
  constructor(network, ui) {
    this.net = network;
    this.ui = ui;
    this.canvas = document.getElementById('game');
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 5, -10);

    buildWorld(this.scene);

    this.clock = new THREE.Clock();
    this.entities = new Map(); // id -> { data, model, prev, target, lastSeen }
    this.bulletMeshes = [];
    this.bulletPool = [];
    this.impactParticles = [];

    this.myId = null;
    this.local = {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      vx: 0, vz: 0, hp: 100, dead: false,
    };
    this.input = { forward: 0, right: 0, sprint: false, shoot: false, reload: false };
    this.keys = new Set();
    this.pointerLocked = false;
    this.scoreboardOpen = false;

    this.lastInputSend = 0;
    this.lastShotSound = 0;
    this.hitMarkerT = 0;

    this.raycaster = new THREE.Raycaster();
    this.tmpVec = new THREE.Vector3();
    this.tmpVec2 = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();

    this._bindEvents();
    this._setupNet();

    this.running = false;
    this._raf = null;
  }

  start(myId) {
    this.myId = myId;
    this.running = true;
    this.clock.start();
    this.ui.showHud();
    this.canvas.requestPointerLock?.();
    this._loop();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && this.running && !this.local.dead) {
        // don't force menu; user may have pressed esc
      }
    });

    this.canvas.addEventListener('click', () => {
      if (this.running && !this.pointerLocked) this.canvas.requestPointerLock?.();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.running) return;
      const sens = 0.0022;
      this.local.yaw -= e.movementX * sens;
      this.local.pitch -= e.movementY * sens;
      this.local.pitch = Math.max(-1.1, Math.min(1.1, this.local.pitch));
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.input.shoot = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.shoot = false;
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); this.scoreboardOpen = true; this.ui.toggleScoreboard(true); }
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.input.reload = true;
      this._updateInputFromKeys();
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') { this.scoreboardOpen = false; this.ui.toggleScoreboard(false); }
      this.keys.delete(e.code);
      if (e.code === 'KeyR') this.input.reload = false;
      this._updateInputFromKeys();
    });
  }

  _updateInputFromKeys() {
    let f = 0, r = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    this.input.forward = f;
    this.input.right = r;
    this.input.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  _setupNet() {
    this.net.on(MSG.STATE, (snap) => this._onSnapshot(snap));
    this.net.on('close', () => {
      this.ui.addKillFeed('Соединение потеряно');
      this.ui.showMenu();
      this.stop();
    });
  }

  _onSnapshot(snap) {
    const seen = new Set();
    let myData = null;

    for (const e of snap.entities) {
      seen.add(e.id);
      let ent = this.entities.get(e.id);
      if (!ent) {
        const model = createPlayerModel(e.color, { isLocal: e.id === this.myId });
        this.scene.add(model.group);
        ent = {
          id: e.id,
          model,
          data: e,
          prev: { ...e },
          target: { ...e },
          lastSeen: performance.now(),
          nameSprite: null,
        };
        this.entities.set(e.id, ent);
        this._attachNameLabel(ent);
      }
      ent.prev = { ...ent.target };
      ent.target = e;
      ent.data = e;
      ent.lastSeen = performance.now();
      if (e.id === this.myId) myData = e;
    }

    // remove missing
    for (const [id, ent] of this.entities) {
      if (!seen.has(id)) {
        this.scene.remove(ent.model.group);
        if (ent.nameSprite) this.scene.remove(ent.nameSprite);
        this.entities.delete(id);
      }
    }

    // handle events
    if (snap.events) {
      for (const ev of snap.events) this._handleEvent(ev, snap);
    }

    // update bullets visual
    this._syncBullets(snap.bullets || []);

    // local player reconciliation
    if (myData) {
      const wasDead = this.local.dead;
      this.local.dead = myData.dead;
      this.local.hp = myData.hp;
      // reconcile position gently
      if (!myData.dead) {
        const dx = myData.x - this.local.x;
        const dz = myData.z - this.local.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.5) {
          // hard snap if very off
          this.local.x = myData.x;
          this.local.z = myData.z;
        } else if (d > 0.05) {
          this.local.x += dx * 0.25;
          this.local.z += dz * 0.25;
        }
      } else {
        this.local.x = myData.x;
        this.local.z = myData.z;
      }
      if (myData.dead && !wasDead) {
        this.ui.showDeath(true);
        this.input.shoot = false;
      }
      if (!myData.dead && wasDead) {
        this.ui.showDeath(false);
      }
    }

    // HUD
    const me = myData;
    this.ui.updateHud(me, this.net.ping, snap.entities.length);
    if (this.scoreboardOpen) this.ui.updateScoreboard(snap.entities, this.myId);
  }

  _handleEvent(ev, snap) {
    const entById = (id) => this.entities.get(id);
    if (ev.type === 'shot') {
      const ent = entById(ev.id);
      if (ent) triggerShot(ent.model);
      // tracer effect
      this._spawnTracer(ev);
    } else if (ev.type === 'hit') {
      if (ev.targetId === this.myId) this.ui.flashDamage();
      if (ev.by === this.myId) {
        this.hitMarkerT = 0.25;
      }
      this._spawnImpact(ev.x, ev.y, ev.z, ev.head ? 0xff4444 : 0xffcc44);
    } else if (ev.type === 'kill') {
      const killer = snap.entities.find(e => e.id === ev.killerId);
      const victim = snap.entities.find(e => e.id === ev.victimId);
      const kName = killer ? killer.name : '?';
      const vName = victim ? victim.name : '?';
      this.ui.addKillFeed(`${kName} ${ev.head ? '✦' : '➤'} ${vName}`);
      if (ev.victimId === this.myId) {
        this.ui.showDeath(true, kName);
      }
    } else if (ev.type === 'impact') {
      this._spawnImpact(ev.x, ev.y, ev.z, 0xd0d0d0);
    } else if (ev.type === 'join') {
      this.ui.addKillFeed(`${ev.name} подключился`);
    } else if (ev.type === 'leave') {
      this.ui.addKillFeed(`${ev.name} вышел`);
    }
  }

  _attachNameLabel(ent) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(28, 8, 200, 40);
    ctx.fillStyle = '#' + ent.data.color.toString(16).padStart(6, '0');
    ctx.fillText(ent.data.name, 128, 36);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 0.45, 1);
    sprite.renderOrder = 10;
    ent.nameSprite = sprite;
    ent.nameCanvas = canvas;
    ent.nameTex = tex;
    this.scene.add(sprite);
  }

  _spawnTracer(ev) {
    // simple short-lived tracer line
    const from = new THREE.Vector3(ev.x, ev.y, ev.z);
    // approximate direction from owner yaw if available
    const owner = this.entities.get(ev.id);
    let dir = new THREE.Vector3(0, 0, 1);
    if (owner) {
      const yaw = owner.target.yaw;
      const pitch = owner.target.pitch;
      const cosP = Math.cos(pitch);
      dir.set(Math.sin(yaw) * cosP, -Math.sin(pitch), Math.cos(yaw) * cosP);
    }
    const to = from.clone().add(dir.clone().multiplyScalar(8));
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    line.userData.life = 0.08;
    this.scene.add(line);
    this.impactParticles.push(line);
  }

  _spawnImpact(x, y, z, color) {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.userData.life = 0.35;
    m.userData.vel = new THREE.Vector3((Math.random()-0.5)*2, Math.random()*2, (Math.random()-0.5)*2);
    this.scene.add(m);
    this.impactParticles.push(m);
  }

  _syncBullets(bullets) {
    // simple visualization: small glowing spheres at bullet positions
    while (this.bulletMeshes.length < bullets.length) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffee88 })
      );
      this.scene.add(m);
      this.bulletMeshes.push(m);
    }
    for (let i = 0; i < this.bulletMeshes.length; i++) {
      const m = this.bulletMeshes[i];
      if (i < bullets.length) {
        m.visible = true;
        m.position.set(bullets[i].x, bullets[i].y, bullets[i].z);
      } else {
        m.visible = false;
      }
    }
  }

  _loop = () => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    // local movement prediction
    if (!this.local.dead) {
      this._predictLocal(dt);
    }

    // send input
    const now = performance.now();
    if (now - this.lastInputSend > 33) {
      this.lastInputSend = now;
      this.net.sendInput({
        forward: this.input.forward,
        right: this.input.right,
        yaw: this.local.yaw,
        pitch: this.local.pitch,
        sprint: this.input.sprint,
        shoot: this.input.shoot && !this.local.dead && this.pointerLocked,
        reload: this.input.reload,
      });
      this.input.reload = false; // edge trigger
    }

    // update entities
    for (const [id, ent] of this.entities) {
      const isMe = id === this.myId;
      if (isMe) {
        // use predicted local pos for own model
        ent.model.group.position.set(this.local.x, 0, this.local.z);
        ent.model.group.rotation.y = this.local.yaw;
        updatePlayerModel(ent.model, dt, {
          vx: this.input.forward * Math.sin(this.local.yaw) + this.input.right * Math.cos(this.local.yaw),
          vz: this.input.forward * Math.cos(this.local.yaw) - this.input.right * Math.sin(this.local.yaw),
          pitch: this.local.pitch,
          dead: this.local.dead,
        });
        // hide own body? in third-person we see it; that's fine
        ent.model.group.visible = true;
      } else {
        // interpolate toward target
        const t = ent.target;
        const p = ent.model.group.position;
        p.x += (t.x - p.x) * Math.min(1, dt * 12);
        p.z += (t.z - p.z) * Math.min(1, dt * 12);
        p.y = 0;
        // smooth yaw
        let dy = t.yaw - ent.model.group.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        ent.model.group.rotation.y += dy * Math.min(1, dt * 12);

        const vx = (t.x - ent.prev.x);
        const vz = (t.z - ent.prev.z);
        updatePlayerModel(ent.model, dt, { vx, vz, pitch: t.pitch, dead: t.dead });
      }

      // name label
      if (ent.nameSprite) {
        ent.nameSprite.position.set(
          ent.model.group.position.x,
          ent.model.group.position.y + (ent.data.dead ? 0.5 : 2.2),
          ent.model.group.position.z
        );
        ent.nameSprite.visible = !isMe; // hide own name
      }
    }

    // camera follow local player
    this._updateCamera(dt);

    // particles / tracers
    for (let i = this.impactParticles.length - 1; i >= 0; i--) {
      const p = this.impactParticles[i];
      p.userData.life -= dt;
      if (p.userData.vel) {
        p.position.addScaledVector(p.userData.vel, dt);
        p.userData.vel.y -= 5 * dt;
        if (p.material) p.material.opacity = Math.max(0, p.userData.life / 0.35);
      } else if (p.material) {
        p.material.opacity = Math.max(0, p.userData.life / 0.08);
      }
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        if (p.geometry) p.geometry.dispose();
        if (p.material) p.material.dispose();
        this.impactParticles.splice(i, 1);
      }
    }

    // hit marker
    this.hitMarkerT = Math.max(0, this.hitMarkerT - dt);
    this.ui.crosshair.classList.toggle('hit', this.hitMarkerT > 0);
  }

  _predictLocal(dt) {
    const yaw = this.local.yaw;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const fwdX = sinY, fwdZ = cosY;
    const rightX = cosY, rightZ = -sinY;
    let mx = fwdX * this.input.forward + rightX * this.input.right;
    let mz = fwdZ * this.input.forward + rightZ * this.input.right;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const speed = PLAYER.speed * (this.input.sprint ? PLAYER.sprintMult : 1);
    let nx = this.local.x + mx * speed * dt;
    let nz = this.local.z + mz * speed * dt;
    const resolved = resolveCircleMap(nx, nz, PLAYER.radius);
    this.local.x = resolved.x;
    this.local.z = resolved.z;
  }

  _updateCamera(dt) {
    // third-person camera behind player
    const yaw = this.local.yaw;
    const pitch = this.local.pitch;
    const behindDist = 5.0;
    const up = 2.6;
    const lookUp = 1.4;

    const cosP = Math.cos(pitch * 0.3);
    const sinP = Math.sin(pitch * 0.3);
    const backX = -Math.sin(yaw) * behindDist * cosP;
    const backZ = -Math.cos(yaw) * behindDist * cosP;
    const backY = up + sinP * 2.0;

    const targetCamPos = this.tmpVec.set(
      this.local.x + backX,
      this.local.y + backY,
      this.local.z + backZ
    );
    this.camera.position.lerp(targetCamPos, 1 - Math.pow(0.001, dt));

    const lookX = this.local.x + Math.sin(yaw) * 8 * Math.cos(pitch);
    const lookY = this.local.y + lookUp - Math.sin(pitch) * 8;
    const lookZ = this.local.z + Math.cos(yaw) * 8 * Math.cos(pitch);
    this.camera.lookAt(lookX, lookY, lookZ);
  }
}
