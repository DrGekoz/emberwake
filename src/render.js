import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const PPU = 24;
export const PITCH = THREE.MathUtils.degToRad(42);
const TALL = 1 / Math.cos(PITCH);
const MAXL = 24;
const CAM_DIST = 30;

export const shared = {
  uAmbient: { value: new THREE.Color(0.16, 0.19, 0.36) },
  uMoon: { value: new THREE.Color(0.45, 0.6, 1.0) },
  uFog: { value: new THREE.Color(0.02, 0.025, 0.07) },
  uFogRange: { value: new THREE.Vector2(38, 66) },
  uLightPos: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
  uLightCol: { value: Array.from({ length: MAXL }, () => new THREE.Vector4()) },
  uTime: { value: 0 },
};

const LIGHT_GLSL = /* glsl */ `
  uniform vec3 uAmbient; uniform vec3 uMoon; uniform vec3 uFog; uniform vec2 uFogRange; uniform float uTime;
  uniform vec3 uLightPos[${MAXL}]; uniform vec4 uLightCol[${MAXL}];
  vec3 lightAt(vec3 p, vec3 n, float wrap) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${MAXL}; i++) {
      vec4 lc = uLightCol[i];
      if (lc.w <= 0.0) continue;
      vec3 d = uLightPos[i] - p;
      float dist = length(d);
      float f = clamp(1.0 - dist / lc.w, 0.0, 1.0);
      float nl = mix(max(dot(n, d / max(dist, 0.001)), 0.0), 1.0, wrap);
      acc += lc.rgb * f * f * nl;
    }
    return acc / (1.0 + acc * 0.2);
  }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 applyFog(vec3 c, float depth) { return mix(c, uFog, smoothstep(uFogRange.x, uFogRange.y, depth)); }
`;

// Light pool: gameplay pushes as many as it wants, the closest MAXL to the focus win.
const pending = [];
export function light(x, y, z, r, g, b, range) {
  pending.push({ x, y, z, r, g, b, range });
}
export function flushLights(fx, fz) {
  for (const l of pending) l.d = (l.x - fx) ** 2 + (l.z - fz) ** 2 - l.range * l.range * 0.5;
  pending.sort((a, b) => a.d - b.d);
  for (let i = 0; i < MAXL; i++) {
    const l = pending[i];
    if (l) {
      shared.uLightPos.value[i].set(l.x, l.y, l.z);
      shared.uLightCol.value[i].set(l.r, l.g, l.b, l.range);
    } else shared.uLightCol.value[i].w = 0;
  }
  pending.length = 0;
}

function emissiveFrom(img, hueHint) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, gg = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const s = mx ? (mx - mn) / mx : 0;
    const glow = hueHint ? hueHint(r, gg, b, mx, s) : mx > 0.82 && s > 0.5;
    if (!glow || p[i + 3] < 128) { p[i] = p[i + 1] = p[i + 2] = 0; }
    p[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

function pixelTex(src) {
  const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function loadSprites(names, hints = {}) {
  const out = {};
  await Promise.all(names.map(async (n) => {
    const img = new Image();
    img.src = `/sprites/${n}.png`;
    await img.decode();
    out[n] = { img, w: img.width, h: img.height, map: pixelTex(img), emap: pixelTex(emissiveFrom(img, hints[n])) };
  }));
  return out;
}

export function loadTile(name) {
  const t = new THREE.TextureLoader().load(`/sprites/${name}.png`);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPRITE_VS = /* glsl */ `
  attribute vec3 iPos; attribute vec3 iSize; attribute vec4 iData;
  uniform float uFrames;
  varying vec2 vUv; varying vec3 vWorld; varying vec4 vData; varying float vDepth;
  void main() {
    vUv = vec2((uv.x + iSize.z) / uFrames, uv.y);
    vData = iData;
    vec2 p = position.xy * iSize.xy;
    float c = cos(iData.x), s = sin(iData.x);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    #ifdef FACE
    // Camera-facing card keeps pixels square; depth still comes from the upright plane so it sorts like every other sprite.
    vec4 w = vec4(iPos + vec3(p.x, 0.0, 0.0) + vec3(0.0, ${Math.cos(PITCH)}, ${-Math.sin(PITCH)}) * p.y, 1.0);
    vec4 upright = projectionMatrix * viewMatrix * vec4(iPos + vec3(p, 0.0), 1.0);
    #else
    vec4 w = vec4(iPos + vec3(p, 0.0), 1.0);
    #endif
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    #ifdef FACE
    gl_Position.z = upright.z / upright.w * gl_Position.w;
    #endif
  }
`;
const SPRITE_FS = /* glsl */ `
  uniform sampler2D map; uniform sampler2D emap; uniform vec2 texSize; uniform float uGlow; uniform float uRim;
  varying vec2 vUv; varying vec3 vWorld; varying vec4 vData; varying float vDepth;
  ${LIGHT_GLSL}
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.5) discard;
    #ifdef SIL
    gl_FragColor = vec4(0.55, 0.36, 0.2, 1.0);
    return;
    #endif
    vec2 px = floor(vUv * texSize);
    if (vData.z > 0.0 && hash12(px) < vData.z) discard;
    vec3 n = normalize(vec3(0.0, 0.55, 1.0));
    vec3 lit = uAmbient + lightAt(vWorld, n, 0.55);
    vec3 col = c.rgb * lit;
    float edge = texture2D(map, vUv + vec2(-1.0, 1.0) / texSize).a;
    col += (c.rgb + 0.06) * uMoon * uRim * (1.0 - edge);
    col += texture2D(emap, vUv).rgb * uGlow * vData.w;
    col = mix(col, vec3(1.25, 1.15, 1.1), vData.y * 0.75);
    if (vData.z > 0.0 && hash12(px) < vData.z + 0.12) col = vec3(2.5, 1.4, 0.6);
    gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
  }
`;

// Instanced billboards, bottom-center pivot. One draw call per texture.
export class SpriteBatch {
  constructor(scene, spr, { cap = 256, glow = 2.2, scale = 1, rim = 0.35, silhouette = false, frames = 1, face = false } = {}) {
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap * 3);
    this.data = new Float32Array(cap * 4);
    for (const [k, arr, n] of [['iPos', this.pos, 3], ['iSize', this.size, 3], ['iData', this.data, 4]]) {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
    }
    this.geo = g;
    this.cap = cap;
    this.w = (spr.w / frames / PPU) * scale;
    this.h = (spr.h / PPU) * scale * (face ? 1 : TALL);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, map: { value: spr.map }, emap: { value: spr.emap }, texSize: { value: new THREE.Vector2(spr.w, spr.h) }, uGlow: { value: glow }, uRim: { value: rim }, uFrames: { value: frames } },
      vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, side: THREE.DoubleSide,
      defines: { ...(silhouette && { SIL: 1 }), ...(face && { FACE: 1 }) },
    });
    // Silhouette pass: only where something occludes the sprite, so the player never gets lost in a crowd.
    if (silhouette) Object.assign(this.mat, { depthFunc: THREE.GreaterDepth, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    if (silhouette) this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  add(x, y, z, sx = 1, sy = 1, rot = 0, flash = 0, dissolve = 0, glow = 1, frame = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.size[i * 3] = this.w * sx; this.size[i * 3 + 1] = this.h * sy; this.size[i * 3 + 2] = frame;
    const d = this.data;
    d[i * 4] = rot; d[i * 4 + 1] = flash; d[i * 4 + 2] = dissolve; d[i * 4 + 3] = glow;
  }
  end() {
    for (const k of ['iPos', 'iSize', 'iData']) this.geo.getAttribute(k).needsUpdate = true;
    this.geo.instanceCount = this.n;
  }
}

const FX_VS = /* glsl */ `
  attribute vec4 iPos; attribute vec4 iCol;
  uniform vec3 camRight; uniform vec3 camUp;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    vUv = position.xy * 2.0;
    vCol = iCol;
    vec3 w = iPos.xyz + (camRight * position.x + camUp * position.y) * iPos.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;
const FX_FS = /* glsl */ `
  uniform float uSquare;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    float r = length(vUv);
    float a = uSquare > 0.5 ? 1.0 : pow(max(1.0 - r, 0.0), 2.2) + smoothstep(0.35, 0.0, r) * 1.5;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vCol.rgb * vCol.a * a, 1.0);
  }
`;

// Additive camera-facing glows (bolts, embers, fireflies, explosions).
export class FxBatch {
  constructor(scene, { cap = 4000, square = false } = {}) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    this.pos = new Float32Array(cap * 4);
    this.col = new Float32Array(cap * 4);
    for (const [k, arr] of [['iPos', this.pos], ['iCol', this.col]]) {
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
    }
    this.geo = g;
    this.cap = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { camRight: { value: new THREE.Vector3(1, 0, 0) }, camUp: { value: new THREE.Vector3(0, Math.cos(PITCH), Math.sin(PITCH)) }, uSquare: { value: square ? 1 : 0 } },
      vertexShader: FX_VS, fragmentShader: FX_FS,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  add(x, y, z, size, r, g, b, a = 1) {
    if (this.n >= this.cap) return;
    const i = this.n++ * 4;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z; this.pos[i + 3] = size;
    this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b; this.col[i + 3] = a;
  }
  end() {
    this.geo.getAttribute('iPos').needsUpdate = true;
    this.geo.getAttribute('iCol').needsUpdate = true;
    this.geo.instanceCount = this.n;
  }
}

const DECAL_VS = /* glsl */ `
  attribute vec4 iPos; attribute vec4 iCol;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    vUv = position.xy * 2.0; vCol = iCol;
    vec3 w = vec3(iPos.x + position.x * iPos.w, iPos.y, iPos.z + position.y * iPos.w * iCol.w);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;
const DECAL_FS = /* glsl */ `
  uniform float uAdd;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    float r = length(vUv);
    if (uAdd > 1.5) {
      gl_FragColor = vec4(vCol.rgb * pow(max(1.0 - r, 0.0), 1.8), 1.0);
      return;
    }
    if (uAdd > 0.5) {
      float ring = smoothstep(0.08, 0.0, abs(r - 0.9)) + smoothstep(1.0, 0.0, r) * 0.12;
      gl_FragColor = vec4(vCol.rgb * ring, 1.0);
      return;
    }
    float a = smoothstep(1.0, 0.55, r) * vCol.r;
    gl_FragColor = vec4(0.0, 0.0, 0.02, a);
  }
`;

// Flat ground quads: blob shadows (multiply-ish) or additive rings (telegraphs, nova).
export class DecalBatch extends FxBatch {
  constructor(scene, { cap = 800, additive = false, pool = false } = {}) {
    super(scene, { cap });
    additive ||= pool;
    this.mat.vertexShader = DECAL_VS;
    this.mat.fragmentShader = DECAL_FS;
    this.mat.uniforms = { uAdd: { value: pool ? 2 : additive ? 1 : 0 } };
    this.mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.mat.side = THREE.DoubleSide;
    this.mesh.renderOrder = additive ? 9 : 1;
  }
  // shadow: add(x, z, radius, opacity, squash). ring: ring(x, z, radius, r, g, b)
  shadow(x, z, rad, op = 0.5, sq = 0.55) { this.add(x, 0.02, z, rad, op, 0, 0, sq); }
  ring(x, z, rad, r, g, b) { this.add(x, 0.04, z, rad, r, g, b, 1); }
}

const GROUND_VS = /* glsl */ `
  varying vec3 vWorld; varying float vDepth;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const GROUND_FS = /* glsl */ `
  uniform sampler2D grass; uniform sampler2D stone; uniform vec2 tile; uniform vec4 paths[8]; uniform float half_;
  varying vec3 vWorld; varying float vDepth;
  ${LIGHT_GLSL}
  float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
  void main() {
    vec2 q = floor(vWorld.xz * ${PPU}.0) / ${PPU}.0;
    float n = hash12(floor(q * 1.5)) * 0.9;
    float stoneMask = step(length(q), 9.5 + n);
    for (int i = 0; i < 8; i++) stoneMask = max(stoneMask, step(segDist(q, paths[i].xy, paths[i].zw), 1.3 + n * 0.8));
    vec2 uv = vWorld.xz * ${PPU}.0;
    vec3 c = mix(texture2D(grass, uv / tile.x).rgb * 1.45, texture2D(stone, uv / tile.y).rgb, stoneMask);
    float edge = max(abs(vWorld.x), abs(vWorld.z));
    c *= 1.0 - smoothstep(half_ - 10.0, half_, edge) * 0.8;
    vec3 lit = uAmbient * 1.15 + lightAt(vWorld, vec3(0.0, 1.0, 0.0), 0.15);
    vec3 col = c * lit;
    gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
  }
`;

export function makeGround(scene, half, paths) {
  const grass = loadTile('ground_grass');
  const stone = loadTile('ground_stone');
  const p = paths.slice(0, 8).map(([a, b, c, d]) => new THREE.Vector4(a, b, c, d));
  while (p.length < 8) p.push(new THREE.Vector4(999, 999, 999, 999.1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, grass: { value: grass }, stone: { value: stone }, tile: { value: new THREE.Vector2(64, 96) }, paths: { value: p }, half_: { value: half } },
    vertexShader: GROUND_VS, fragmentShader: GROUND_FS,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 40, half * 2 + 40).rotateX(-Math.PI / 2), mat);
  scene.add(m);
  return m;
}

const MIST_FS = /* glsl */ `
  uniform float uTime; uniform float uAmt; uniform vec3 uTint;
  varying vec3 vWorld; varying float vDepth;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vWorld.xz * 0.08 + vec2(uTime * 0.02, uTime * 0.013);
    float n = noise(p) * 0.55 + noise(p * 2.3 - uTime * 0.03) * 0.3 + noise(p * 5.1) * 0.15;
    float a = smoothstep(0.45, 0.95, n) * uAmt * smoothstep(8.0, 22.0, vDepth);
    gl_FragColor = vec4(uTint * a, 1.0);
  }
`;

export function makeMist(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uAmt: { value: 0.12 }, uTint: { value: new THREE.Color(0.35, 0.45, 0.8) } },
    vertexShader: GROUND_VS, fragmentShader: MIST_FS,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), mat);
  m.position.y = 0.6;
  m.renderOrder = 8;
  scene.add(m);
  return mat;
}

const BEAM_FS = /* glsl */ `
  uniform float uTime; uniform float uAmt; uniform vec3 uTint; varying vec2 vUv; varying float vSeed;
  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;
    float a = pow(1.0 - x, 2.0) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
    a *= 0.75 + 0.25 * sin(uTime * 0.6 + vSeed * 6.0 + vUv.y * 3.0);
    gl_FragColor = vec4(uTint * a * uAmt, 1.0);
  }
`;
const BEAM_VS = /* glsl */ `
  attribute vec4 iPos; attribute vec4 iCol; varying vec2 vUv; varying float vSeed;
  void main() {
    vUv = position.xy + 0.5; vSeed = iCol.x;
    vec3 p = vec3(position.x * iPos.w, (position.y + 0.5) * iCol.y, 0.0);
    float c = cos(iCol.z), s = sin(iCol.z);
    p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(iPos.xyz + p, 1.0);
  }
`;

// Moonlight shafts: a few tall additive quads leaning with the moon direction.
export function makeBeams(scene, spots) {
  const b = new FxBatch(scene, { cap: spots.length });
  b.mat.vertexShader = BEAM_VS;
  b.mat.fragmentShader = BEAM_FS;
  b.mat.uniforms = { uTime: shared.uTime, uAmt: { value: 0.5 }, uTint: { value: new THREE.Color(0.35, 0.5, 0.95) } };
  b.mesh.renderOrder = 11;
  for (const [x, z, w, seed] of spots) b.add(x, 0, z, w, seed, 22, -0.45, 1);
  b.end();
  return b;
}

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: shared.uTime,
    uFocus: { value: 0.5 }, uBlur: { value: 7.0 }, uDawn: { value: 0 }, uHurt: { value: 0 }, uSat: { value: 1.12 }, uVig: { value: 0.9 }, uAberr: { value: 0.0006 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uFocus, uBlur, uDawn, uHurt, uSat, uVig, uAberr;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d = vUv.y - uFocus;
      float coc = smoothstep(0.14, 0.5, abs(d)) * (d > 0.0 ? 1.0 : 0.8);
      vec3 col;
      if (coc < 0.02) col = texture2D(tDiffuse, vUv).rgb;
      else {
        col = vec3(0.0);
        for (int i = 0; i < 20; i++) {
          float r = sqrt((float(i) + 0.5) / 20.0);
          float a = float(i) * 2.39996;
          col += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * coc * uBlur / uRes * uRes.y / 720.0).rgb;
        }
        col /= 20.0;
      }
      vec2 v = vUv - 0.5;
      float ca = dot(v, v) * uAberr * 40.0;
      col.r = mix(col.r, texture2D(tDiffuse, vUv + v * ca).r, 0.5);
      col.b = mix(col.b, texture2D(tDiffuse, vUv - v * ca).b, 0.5);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= mix(vec3(0.92, 0.96, 1.12), vec3(1.1, 1.0, 0.9), smoothstep(0.0, 1.0, l));
      col = mix(col, col * vec3(1.3, 1.08, 0.85) + vec3(0.05, 0.03, 0.0), uDawn);
      v.x *= uRes.x / uRes.y * 0.75;
      float vig = dot(v, v);
      col *= 1.0 - uVig * vig * 1.3;
      col = mix(col, vec3(0.45, 0.0, 0.04), uHurt * 0.42 * smoothstep(0.14, 0.5, vig));
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = shared.uFog.value;
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 200);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.75, 0.55, 0.9);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const target = new THREE.Vector3();
  const shake = { amt: 0, x: 0, y: 0 };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    grade.uniforms.uRes.value.set(w * pr, h * pr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function place(x, z, dist = CAM_DIST, dt = 0.016) {
    shake.amt = Math.max(0, shake.amt - dt * 3);
    const s = shake.amt * shake.amt * 0.6;
    shake.x = (Math.random() - 0.5) * s;
    shake.y = (Math.random() - 0.5) * s;
    target.set(x, 1.2, z);
    camera.position.set(x + shake.x, 1.2 + Math.sin(PITCH) * dist + shake.y, z + Math.cos(PITCH) * dist);
    camera.lookAt(target.x + shake.x, target.y + shake.y, target.z);
  }

  return { renderer, scene, camera, composer, bloom, grade, place, shake, render: () => composer.render() };
}
