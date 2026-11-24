import { WORLD } from './constants.js';

const W = WORLD.width / 2;
const D = WORLD.depth / 2;

// AABB obstacles: [cx, cy, cz, hx, hy, hz] center + half extents
// y is up, ground at y=0
export const OBSTACLES = [
  // boundary walls
  [0, 2, -D - 0.5, W + 1, 2, 0.5],
  [0, 2, D + 0.5, W + 1, 2, 0.5],
  [-W - 0.5, 2, 0, 0.5, 2, D + 1],
  [W + 0.5, 2, 0, 0.5, 2, D + 1],

  // central structure
  [0, 1.25, 0, 3, 1.25, 3],
  [0, 3.0, 0, 1.2, 0.5, 1.2], // upper platform

  // crates / cover
  [-12, 1, -10, 1.5, 1, 1.5],
  [-14, 1, -10, 1, 1, 1],
  [12, 1, 10, 1.5, 1, 1.5],
  [14, 1, 10, 1, 1, 1],
  [-12, 1, 12, 1.5, 1, 1.5],
  [12, 1, -12, 1.5, 1, 1.5],

  // walls / corridors
  [-20, 1.5, 0, 0.5, 1.5, 8],
  [20, 1.5, 0, 0.5, 1.5, 8],
  [0, 1.5, -20, 8, 1.5, 0.5],
  [0, 1.5, 20, 8, 1.5, 0.5],

  // corner bunkers
  [-25, 1.25, -25, 4, 1.25, 0.5],
  [-25, 1.25, -27, 0.5, 1.25, 2.5],
  [25, 1.25, 25, 4, 1.25, 0.5],
  [25, 1.25, 27, 0.5, 1.25, 2.5],
  [25, 1.25, -25, 4, 1.25, 0.5],
  [27, 1.25, -25, 0.5, 1.25, 2.5],
  [-25, 1.25, 25, 4, 1.25, 0.5],
  [-27, 1.25, 25, 0.5, 1.25, 2.5],

  // mid cover pillars
  [-8, 1.5, 18, 1, 1.5, 1],
  [8, 1.5, 18, 1, 1.5, 1],
  [-8, 1.5, -18, 1, 1.5, 1],
  [8, 1.5, -18, 1, 1.5, 1],
  [18, 1.5, -8, 1, 1.5, 1],
  [18, 1.5, 8, 1, 1.5, 1],
  [-18, 1.5, -8, 1, 1.5, 1],
  [-18, 1.5, 8, 1, 1.5, 1],

  // ramps-like low blocks
  [-6, 0.5, 6, 2, 0.5, 2],
  [6, 0.5, -6, 2, 0.5, 2],
];

export const SPAWN_POINTS = [
  [-30, 0, -30], [30, 0, -30], [-30, 0, 30], [30, 0, 30],
  [0, 0, -30], [0, 0, 30], [-30, 0, 0], [30, 0, 0],
  [-15, 0, -15], [15, 0, 15], [-15, 0, 15], [15, 0, -15],
];

export function collidesCircleAABB(x, z, radius, box) {
  const [cx, , cz, hx, , hz] = box;
  const nx = Math.max(cx - hx, Math.min(x, cx + hx));
  const nz = Math.max(cz - hz, Math.min(z, cz + hz));
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < radius * radius;
}

export function resolveCircleMap(x, z, radius) {
  // Push circle out of obstacles (simple iterative resolution)
  for (let iter = 0; iter < 4; iter++) {
    for (const box of OBSTACLES) {
      const [cx, , cz, hx, , hz] = box;
      const nx = Math.max(cx - hx, Math.min(x, cx + hx));
      const nz = Math.max(cz - hz, Math.min(z, cz + hz));
      let dx = x - nx;
      let dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 === 0) {
          // center inside box; push out along shortest axis
          const px = hx - Math.abs(x - cx);
          const pz = hz - Math.abs(z - cz);
          if (px < pz) x += (x < cx ? -px - radius - 0.001 : px + radius + 0.001);
          else z += (z < cz ? -pz - radius - 0.001 : pz + radius + 0.001);
        } else {
          const d = Math.sqrt(d2);
          const push = radius - d + 0.001;
          x += (dx / d) * push;
          z += (dz / d) * push;
        }
      }
    }
  }
  // clamp to world
  const lim = WORLD.width / 2 - radius - 0.5;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(lim, z));
  return { x, z };
}

export function raycastObstacles(ox, oy, oz, dx, dy, dz, maxDist) {
  // Simple ray vs AABB slab test; returns distance or null
  let closest = maxDist;
  let hit = false;
  for (const [cx, cy, cz, hx, hy, hz] of OBSTACLES) {
    const minX = cx - hx, maxX = cx + hx;
    const minY = cy - hy, maxY = cy + hy;
    const minZ = cz - hz, maxZ = cz + hz;
    let tmin = 0, tmax = closest;
    const axes = [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]];
    let ok = true;
    for (const [o, d, min, max] of axes) {
      if (Math.abs(d) < 1e-8) {
        if (o < min || o > max) { ok = false; break; }
      } else {
        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < closest) { closest = tmin; hit = true; }
  }
  return hit ? closest : null;
}
