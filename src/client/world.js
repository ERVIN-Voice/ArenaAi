import * as THREE from 'three';
import { OBSTACLES } from '../shared/map.js';
import { WORLD } from '../shared/constants.js';

export function buildWorld(scene) {
  // Sky/background
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0x87b5d6, 35, 110);

  // Lights
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x445522, 0.85);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xfff1d6, 1.25);
  dir.position.set(30, 50, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  const cam = dir.shadow.camera;
  cam.left = -55; cam.right = 55; cam.top = 55; cam.bottom = -55;
  cam.near = 1; cam.far = 140;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0x8ecaff, 0.35);
  fill.position.set(-40, 20, -30);
  scene.add(fill);

  // Ground
  const groundSize = WORLD.width + 20;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95, metalness: 0.05 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid overlay on ground
  const grid = new THREE.GridHelper(WORLD.width, 40, 0x5a6572, 0x4a525a);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  // Floor accent
  const accentGeo = new THREE.PlaneGeometry(WORLD.width, WORLD.depth);
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x404750, roughness: 1 });
  const accent = new THREE.Mesh(accentGeo, accentMat);
  accent.rotation.x = -Math.PI / 2;
  accent.position.y = 0.005;
  accent.receiveShadow = true;
  scene.add(accent);

  // Materials for obstacles
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.85, metalness: 0.1 });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x7b8594, roughness: 0.8, metalness: 0.1 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6a4b, roughness: 0.9, metalness: 0.05 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x596270, roughness: 0.5, metalness: 0.4 });
  const accentMat2 = new THREE.MeshStandardMaterial({ color: 0x4f8fba, roughness: 0.6, metalness: 0.2, emissive: 0x1a3a52, emissiveIntensity: 0.3 });

  // Build obstacles
  const obstacleMeshes = [];
  OBSTACLES.forEach((o, i) => {
    const [cx, cy, cz, hx, hy, hz] = o;
    const isBoundary = Math.abs(cx) > WORLD.width / 2 - 1 || Math.abs(cz) > WORLD.depth / 2 - 1;
    const isTall = hy >= 1.4;
    let m;
    if (isBoundary) m = wallMat;
    else if (hy <= 0.6) m = metalMat;
    else if (hx >= 1.4 && hz >= 1.4) m = crateMat;
    else m = isTall ? wallMat : metalMat;

    const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacleMeshes.push(mesh);

    // Add top edge accent for some obstacles
    if (!isBoundary && hy > 0.8) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2 + 0.04, 0.06, hz * 2 + 0.04),
        accentMat2
      );
      edge.position.set(cx, cy + hy + 0.03, cz);
      edge.receiveShadow = true;
      scene.add(edge);
    }
  });

  // Some decorative pillars/lights
  const decoPositions = [[-35, -35], [35, -35], [35, 35], [-35, 35]];
  for (const [x, z] of decoPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 5, 8), metalMat);
    pole.position.set(x, 2.5, z);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffcc66, emissiveIntensity: 1.5 }));
    lamp.position.set(x, 5.2, z);
    scene.add(lamp);
    const pl = new THREE.PointLight(0xffdd99, 0.8, 25);
    pl.position.set(x, 5.0, z);
    scene.add(pl);
  }

  return { obstacleMeshes };
}
