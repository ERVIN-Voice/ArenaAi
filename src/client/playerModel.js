import * as THREE from 'three';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

function box(w, h, d, material) {
  const g = new THREE.BoxGeometry(w, h, d);
  return new THREE.Mesh(g, material);
}
function cyl(rt, rb, h, seg, material) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  return new THREE.Mesh(g, material);
}
function sphere(r, ws, hs, material) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
}

export function createPlayerModel(colorHex, { isLocal = false } = {}) {
  const group = new THREE.Group();
  group.name = 'player';

  const color = new THREE.Color(colorHex);
  const dark = color.clone().multiplyScalar(0.45);
  const skin = new THREE.Color(0xd8a07a);
  const cloth = new THREE.Color(0x2a2f38);
  const clothDark = new THREE.Color(0x1c2028);
  const metal = new THREE.Color(0x555b66);

  const bodyMat = mat(color, { roughness: 0.6, metalness: 0.15 });
  const darkMat = mat(dark, { roughness: 0.7, metalness: 0.1 });
  const skinMat = mat(skin, { roughness: 0.65 });
  const clothMat = mat(cloth, { roughness: 0.85 });
  const clothDarkMat = mat(clothDark, { roughness: 0.9 });
  const metalMat = mat(metal, { roughness: 0.35, metalness: 0.7 });
  const visorMat = mat(0x111827, { roughness: 0.15, metalness: 0.4, emissive: color, emissiveIntensity: 0.35 });

  // Hips/root
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  group.add(hips);

  // Torso
  const torso = box(0.52, 0.55, 0.28, bodyMat);
  torso.position.y = 0.35;
  torso.castShadow = true;
  hips.add(torso);

  // Chest plate
  const chest = box(0.54, 0.22, 0.30, darkMat);
  chest.position.y = 0.48;
  chest.castShadow = true;
  hips.add(chest);

  // Belly
  const belly = box(0.44, 0.22, 0.24, clothMat);
  belly.position.y = 0.12;
  belly.castShadow = true;
  hips.add(belly);

  // Backpack
  const pack = box(0.32, 0.38, 0.16, clothDarkMat);
  pack.position.set(0, 0.35, -0.2);
  pack.castShadow = true;
  hips.add(pack);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.82;
  hips.add(headGroup);

  const head = box(0.28, 0.30, 0.26, skinMat);
  head.castShadow = true;
  headGroup.add(head);

  // Helmet
  const helmet = box(0.32, 0.22, 0.30, darkMat);
  helmet.position.y = 0.08;
  helmet.castShadow = true;
  headGroup.add(helmet);
  const helmetTop = box(0.30, 0.08, 0.28, darkMat);
  helmetTop.position.y = 0.22;
  headGroup.add(helmetTop);

  // Visor
  const visor = box(0.26, 0.10, 0.05, visorMat);
  visor.position.set(0, 0.04, 0.14);
  headGroup.add(visor);

  // Legs
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.0, 0);
    hips.add(leg);

    const upper = box(0.18, 0.38, 0.20, clothMat);
    upper.position.y = -0.19;
    upper.castShadow = true;
    leg.add(upper);

    const knee = new THREE.Group();
    knee.position.y = -0.38;
    leg.add(knee);

    const lower = box(0.16, 0.38, 0.18, clothDarkMat);
    lower.position.y = -0.19;
    lower.castShadow = true;
    knee.add(lower);

    const boot = box(0.18, 0.12, 0.26, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
    boot.position.set(0, -0.42, 0.03);
    boot.castShadow = true;
    knee.add(boot);

    return { leg, knee };
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Arms
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.34, 0.52, 0);
    hips.add(arm);

    const shoulder = sphere(0.09, 8, 8, darkMat);
    shoulder.castShadow = true;
    arm.add(shoulder);

    const upper = box(0.14, 0.30, 0.14, bodyMat);
    upper.position.y = -0.20;
    upper.castShadow = true;
    arm.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    arm.add(elbow);

    const lower = box(0.12, 0.28, 0.12, skinMat);
    lower.position.y = -0.14;
    lower.castShadow = true;
    elbow.add(lower);

    const hand = box(0.11, 0.10, 0.12, skinMat);
    hand.position.y = -0.32;
    hand.castShadow = true;
    elbow.add(hand);

    return { arm, elbow };
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Gun (attached to right hand area / aimed forward)
  const gun = new THREE.Group();
  gun.position.set(0.22, 0.25, 0.28);
  hips.add(gun);

  const gunBody = box(0.10, 0.14, 0.55, metalMat);
  gunBody.position.set(0, 0, 0.15);
  gunBody.castShadow = true;
  gun.add(gunBody);

  const barrel = cyl(0.025, 0.03, 0.45, 8, metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.55);
  barrel.castShadow = true;
  gun.add(barrel);

  const stock = box(0.09, 0.12, 0.18, clothDarkMat);
  stock.position.set(0, -0.02, -0.18);
  gun.add(stock);

  const grip = box(0.07, 0.14, 0.08, clothDarkMat);
  grip.position.set(0, -0.12, -0.02);
  grip.rotation.x = 0.2;
  gun.add(grip);

  const mag = box(0.06, 0.16, 0.08, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.4 }));
  mag.position.set(0, -0.16, 0.12);
  mag.rotation.x = 0.15;
  gun.add(mag);

  const scope = box(0.06, 0.05, 0.12, metalMat);
  scope.position.set(0, 0.1, 0.05);
  gun.add(scope);

  // Muzzle flash (hidden by default)
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), muzzleMat);
  muzzle.position.set(0, 0.02, 0.82);
  muzzle.visible = false;
  gun.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffaa44, 0, 6);
  muzzleLight.position.set(0, 0.02, 0.85);
  gun.add(muzzleLight);

  // Name tag anchor
  const nameAnchor = new THREE.Object3D();
  nameAnchor.position.y = 2.15;
  group.add(nameAnchor);

  // For local player, optionally hide head to avoid clipping in first-person? We're third-person.
  if (isLocal) {
    // keep visible in third person
  }

  // Shadows for all meshes
  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });

  return {
    group,
    hips, torso, headGroup,
    leftLeg, rightLeg, leftArm, rightArm,
    gun, muzzle, muzzleLight, nameAnchor,
    anim: { walkPhase: Math.random() * Math.PI * 2, recoil: 0, muzzleT: 0, dead: false, deathT: 0 },
  };
}

export function updatePlayerModel(model, dt, state) {
  const a = model.anim;
  const moving = Math.hypot(state.vx || 0, state.vz || 0) > 0.3;
  const speed = Math.hypot(state.vx || 0, state.vz || 0);
  const walkSpeed = moving ? Math.min(12, 4 + speed * 0.8) : 0;

  if (state.dead) {
    a.deathT = Math.min(1, a.deathT + dt * 2.5);
    // fall over
    model.hips.rotation.x = THREE.MathUtils.lerp(model.hips.rotation.x, -Math.PI / 2.2, a.deathT);
    model.hips.position.y = THREE.MathUtils.lerp(0.95, 0.25, a.deathT);
    model.leftArm.arm.rotation.x = THREE.MathUtils.lerp(model.leftArm.arm.rotation.x, -1.2, a.deathT);
    model.rightArm.arm.rotation.x = THREE.MathUtils.lerp(model.rightArm.arm.rotation.x, -1.2, a.deathT);
    model.muzzle.visible = false;
    model.muzzleLight.intensity = 0;
    return;
  } else {
    if (a.deathT > 0) {
      a.deathT = 0;
      model.hips.rotation.x = 0;
      model.hips.position.y = 0.95;
    }
  }

  a.walkPhase += dt * walkSpeed;
  const swing = moving ? Math.sin(a.walkPhase) * 0.55 : 0;
  const swing2 = moving ? Math.sin(a.walkPhase + Math.PI) * 0.55 : 0;

  model.leftLeg.leg.rotation.x = swing;
  model.rightLeg.leg.rotation.x = swing2;
  model.leftLeg.knee.rotation.x = moving ? Math.max(0, -Math.sin(a.walkPhase) * 0.6) : 0;
  model.rightLeg.knee.rotation.x = moving ? Math.max(0, -Math.sin(a.walkPhase + Math.PI) * 0.6) : 0;

  // Arms: left holds gun area, right aims
  const aimPitch = state.pitch || 0;
  model.rightArm.arm.rotation.x = -0.6 - aimPitch * 0.8 + swing2 * 0.25;
  model.rightArm.elbow.rotation.x = -0.4;
  model.leftArm.arm.rotation.x = -0.8 - aimPitch * 0.5 + swing * 0.25;
  model.leftArm.elbow.rotation.x = -0.6;

  // Gun follows aim
  model.gun.rotation.x = -aimPitch * 0.3;
  model.gun.position.y = 0.25 - aimPitch * 0.05;

  // Idle bob
  if (!moving) {
    const t = performance.now() * 0.001;
    model.hips.position.y = 0.95 + Math.sin(t * 2) * 0.01;
  } else {
    model.hips.position.y = 0.95 + Math.abs(Math.sin(a.walkPhase)) * 0.03;
  }

  // Recoil
  a.recoil = Math.max(0, a.recoil - dt * 8);
  model.gun.position.z = 0.28 - a.recoil * 0.08;
  model.gun.rotation.x += -a.recoil * 0.08;

  // Muzzle flash
  a.muzzleT = Math.max(0, a.muzzleT - dt * 15);
  model.muzzle.visible = a.muzzleT > 0.01;
  model.muzzle.material.opacity = a.muzzleT * 0.9;
  model.muzzle.rotation.z += dt * 30;
  model.muzzleLight.intensity = a.muzzleT * 3;
}

export function triggerShot(model) {
  model.anim.recoil = 1;
  model.anim.muzzleT = 1;
}
