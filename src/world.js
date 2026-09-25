export const HALF = 44;

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const segDist = (x, z, [ax, az, bx, bz]) => {
  const px = x - ax, pz = z - az, dx = bx - ax, dz = bz - az;
  const h = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - dx * h, pz - dz * h);
};

// Collider radius per prop type (0 = walk-through decoration).
const COLL = { tree_oak: 0.7, tree_pine: 0.55, pillar: 0.75, statue: 1.1, rock: 0.8, grave: 0.35, brazier: 0.6 };

export function buildWorld() {
  const rnd = mulberry(7);
  const props = [];
  const colliders = [];
  const add = (type, x, z, s = 1, flip = rnd() < 0.5) => {
    props.push({ type, x, z, s, flip });
    if (COLL[type]) colliders.push({ x, z, r: COLL[type] * s });
  };

  const braziers = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const r = i % 2 ? 24 : 18;
    braziers.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, lit: 0, fuel: 0, prog: 0 });
  }
  const paths = braziers.map((b) => [0, 0, b.x, b.z]);
  paths.push([braziers[0].x, braziers[0].z, braziers[1].x, braziers[1].z], [braziers[3].x, braziers[3].z, braziers[4].x, braziers[4].z]);
  for (const b of braziers) colliders.push({ x: b.x, z: b.z, r: 0.6 });

  add('statue', 0, -4.2, 1.15, false);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = Math.cos(a) * 10.5, z = Math.sin(a) * 10.5;
    if (paths.some((p) => segDist(x, z, p) < 2.2)) continue;
    if (rnd() < 0.8) add('pillar', x, z, 0.9 + rnd() * 0.25);
  }
  add('arch', 0, -12.5, 1.1, false);
  colliders.push({ x: -1.9, z: -12.5, r: 0.7 }, { x: 1.9, z: -12.5, r: 0.7 });

  const clear = (x, z, pad) => {
    if (Math.hypot(x, z) < 13 + pad) return false;
    if (paths.some((p) => segDist(x, z, p) < 2.4 + pad)) return false;
    if (braziers.some((b) => Math.hypot(b.x - x, b.z - z) < 4.5 + pad)) return false;
    return !props.some((p) => COLL[p.type] && Math.hypot(p.x - x, p.z - z) < 2.6 + pad);
  };

  // Tree wall around the edge, then a looser forest inside.
  for (let t = -HALF; t <= HALF; t += 2.6) {
    for (const [x, z] of [[t, -HALF], [t, HALF], [-HALF, t], [HALF, t]]) {
      const j = () => (rnd() - 0.5) * 1.6;
      add(rnd() < 0.5 ? 'tree_pine' : 'tree_oak', x + j(), z + j(), 1 + rnd() * 0.3);
    }
  }
  for (let i = 0; i < 1400 && props.length < 190; i++) {
    const x = (rnd() * 2 - 1) * (HALF - 3), z = (rnd() * 2 - 1) * (HALF - 3);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;
    if (rnd() > 0.25 + edge * 0.7 || !clear(x, z, 0.8)) continue;
    add(rnd() < 0.45 ? 'tree_pine' : 'tree_oak', x, z, 0.9 + rnd() * 0.35);
  }
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1) * (HALF - 6), z = (rnd() * 2 - 1) * (HALF - 6);
    if (clear(x, z, 0)) add(rnd() < 0.3 ? 'pillar' : 'rock', x, z, 0.8 + rnd() * 0.4);
  }
  for (let i = 0; i < 12; i++) {
    const x = -30 + (rnd() - 0.5) * 12, z = 26 + (rnd() - 0.5) * 10;
    if (clear(x, z, -0.5)) add('grave', x, z, 0.9 + rnd() * 0.3);
  }
  for (let i = 0; i < 260; i++) {
    const x = (rnd() * 2 - 1) * (HALF - 2), z = (rnd() * 2 - 1) * (HALF - 2);
    if (Math.hypot(x, z) < 9) continue;
    const k = rnd();
    add(k < 0.35 ? 'bush' : k < 0.7 ? 'flowers' : 'mushrooms', x, z, 0.85 + rnd() * 0.3);
  }

  return { props, colliders, braziers, paths, beams: Array.from({ length: 12 }, () => [(rnd() * 2 - 1) * 36, (rnd() * 2 - 1) * 36, 1.2 + rnd() * 2.2, rnd()]) };
}

// Uniform grid over static colliders so per-entity lookups stay O(1).
export function colliderGrid(colliders, cell = 4) {
  const map = new Map();
  const key = (i, j) => i * 1000 + j;
  for (const c of colliders) {
    const pad = c.r + 2;
    const i0 = Math.floor((c.x - pad) / cell), i1 = Math.floor((c.x + pad) / cell);
    const j0 = Math.floor((c.z - pad) / cell), j1 = Math.floor((c.z + pad) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
  }
  return (x, z) => map.get(key(Math.floor(x / cell), Math.floor(z / cell))) || [];
}
