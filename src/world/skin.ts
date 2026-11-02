// Builds a skin (visuals only) around a route: sky, ground, road, props and rider (fog and lights are set by scene.ts).
// Everything it creates lives in one group, and dispose() frees all of it (geometries, materials, textures).
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Route } from './route';
import type { SkinData } from './packs';
import { Rider } from './rider';
import { fbm, smooth, seeded } from './noise';
import { buildProps } from './props';
import { texture, type Tick } from './kit';

export interface BuiltSkin {
  skin: SkinData;
  group: THREE.Group;
  rider: Rider;
  groundAt?: (x: number, z: number) => number;
  tick: Tick; // animated props
  targets: THREE.Object3D[]; // clickable props (userData.click)
  dispose(): void;
}

export function buildSkin(skin: SkinData, route: Route, renderer: THREE.WebGLRenderer): BuiltSkin {
  const group = new THREE.Group();
  const rand = seeded(1);
  const extra: { dispose(): void }[] = []; // GPU objects that are not part of a mesh (env maps)

  // sky
  const sky = () => (skin.sky.type === 'gradient' ? gradientSky(skin.sky.top, skin.sky.horizon) : nebulaSky(skin.sky.colors));
  group.add(sky());
  if (skin.sky.stars) group.add(stars(skin.sky.stars, rand));

  // ground
  let groundAt: BuiltSkin['groundAt'];
  if (skin.ground.type === 'valley') {
    groundAt = valleyHeight(route);
    group.add(...valley(skin.ground, groundAt));
  } else if (skin.ground.type === 'ridges') {
    const base = Math.min(...route.data.elevation) - 1.2;
    groundAt = toRoad(route, () => base);
    group.add(...ridges(skin.ground, groundAt, base));
  }

  // road
  if (skin.road.style === 'asphalt') group.add(...asphalt(skin.road, route, rand));
  else if (skin.road.style === 'lines') group.add(...lines(skin.road, route));
  else {
    // reflections of the sky on the glass
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envSky = sky();
    const env = pmrem.fromScene(new THREE.Scene().add(envSky), 0.02, 1, 20000);
    envSky.geometry.dispose(); envSky.material.dispose(); pmrem.dispose();
    extra.push(env);
    group.add(...glass(skin.road, route, env.texture));
  }

  const props = buildProps(skin.props, route, groundAt, rand);
  group.add(props.group);

  const rider = new Rider(skin.rider, skin.bike);
  group.add(rider.group);

  return {
    skin, group, rider, groundAt, tick: props.tick, targets: props.targets,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of [m.material ?? []].flat()) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          for (const u of Object.values((mat as THREE.ShaderMaterial).uniforms ?? {})) if (u.value instanceof THREE.Texture) u.value.dispose();
          mat.dispose();
        }
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      for (const e of extra) e.dispose();
    },
  };
}

// --- sky -------------------------------------------------------------------------
const SKY_R = 9000;

function gradientSky(topHex: string, horizonHex: string) {
  const geo = new THREE.SphereGeometry(SKY_R, 24, 12);
  const col: number[] = [];
  const horizon = new THREE.Color(horizonHex), top = new THREE.Color(topHex), c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    c.copy(horizon).lerp(top, Math.max(0, geo.attributes.position.getY(i) / SKY_R) ** 0.6);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
}

// deep-space backdrop: three colours mixed by 3D value-noise clouds, brighter along a tilted band
function nebulaSky([base, a, b]: string[]) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { base: { value: new THREE.Color(base) }, a: { value: new THREE.Color(a) }, b: { value: new THREE.Color(b) } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 base, a, b; varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float s = 0.0, w = 0.5; for (int k = 0; k < 5; k++) { s += w * n(p); p *= 2.03; w *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float band = exp(-pow(dot(d, normalize(vec3(0.35, 1.0, -0.25))) * 2.6, 2.0));
        float c1 = fbm(d * 2.2 + 3.0), c2 = fbm(d * 3.1 - 7.0), dust = fbm(d * 9.0);
        vec3 col = base;
        col = mix(col, a, smoothstep(0.3, 0.75, c1) * (0.45 + 0.55 * band));
        col = mix(col, b, smoothstep(0.42, 0.8, c2) * (0.3 + 0.7 * band));
        col *= 0.75 + 0.5 * dust;
        col += (a + b) * 0.35 * pow(smoothstep(0.55, 0.95, c1 * c2 * 1.9), 2.0) * band;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), mat);
}

function stars(count: number, rand: () => number) {
  const pos: number[] = [], col: number[] = [], c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, t = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.push(Math.cos(t) * r * SKY_R * 0.95, u * SKY_R * 0.95, Math.sin(t) * r * SKY_R * 0.95);
    c.setHSL(0.55 + rand() * 0.2, 0.5, 0.75).multiplyScalar(0.3 + rand() ** 12 * 3); // a few bright ones bloom
    col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
}

// --- valley ground -------------------------------------------------------------------
const WATER = -3;

type Height = (x: number, z: number) => number;

// ground that meets the road: just under it near the road, blending out to `far` 18–140 m away
function toRoad(route: Route, far: Height): Height {
  return (x, z) => {
    const { dist, e } = route.nearRoad(x, z);
    const b = smooth(18, 140, dist);
    return (e - 1.2) * (1 - b) + far(x, z) * b;
  };
}

// rolling hills, a lake basin in the loop, far mountains
function valleyHeight(route: Route) {
  return toRoad(route, (x, z) => {
    const r = Math.hypot(x, z);
    const hills = fbm(x / 420, z / 420) * 45 * smooth(200, 900, r);
    const mountains = 320 * smooth(2600, 5200, r) * (0.6 + fbm(x / 900, z / 900));
    const basin = 32 * smooth(950, 350, r);
    return hills + mountains - basin + fbm(x / 60, z / 60) * 4;
  });
}

// 12 km ground plane shaped by `height`
function plane(height: Height) {
  const SIZE = 12000, SEG = 300;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  tg.computeVertexNormals();
  return tg;
}

function valley(g: Extract<SkinData['ground'], { type: 'valley' }>, height: Height) {
  const tg = plane(height);
  const pos = tg.attributes.position;
  const cols: number[] = [];
  const grass = g.grass.map((h) => new THREE.Color(h));
  const sand = new THREE.Color(g.sand), rock = new THREE.Color(g.rock), snow = new THREE.Color(g.snow), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const n = fbm(x / 150, z / 150);
    c.copy(grass[0]).lerp(grass[1], n).lerp(grass[2], fbm(x / 40, z / 40) * 0.5);
    if (h < WATER + 1.5) c.copy(sand);
    if (h > 160) c.lerp(rock, smooth(160, 240, h));
    if (h > 300) c.lerp(snow, smooth(300, 360, h));
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;

  const water = new THREE.Mesh(new THREE.CircleGeometry(1100, 48), new THREE.MeshLambertMaterial({ color: g.water, transparent: true, opacity: 0.9 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER;
  return [terrain, water];
}

// flat ground plus rings of hill silhouettes on the horizon (back to front), each one flat, unlit grey
function ridges(g: Extract<SkinData['ground'], { type: 'ridges' }>, height: Height, base: number) {
  const ground = new THREE.Mesh(plane(height), new THREE.MeshLambertMaterial({ color: g.color }));
  ground.receiveShadow = true;
  const SEG = 720;
  return [ground, ...g.ridges.map((r, k) => {
    const v: number[] = [], idx: number[] = [], f = r.distance / 1000;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
      const n = fbm(cx * f + k * 17, sz * f + k * 17); // sampled on a circle, so the ring closes seamlessly
      const top = base + r.height * (0.08 + Math.max(0, n - 0.3) * 2.3);
      v.push(cx * r.distance, base - 30, sz * r.distance, cx * r.distance, top, sz * r.distance);
      if (i < SEG) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(idx);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: r.color, fog: false, side: THREE.DoubleSide }));
  })];
}

// --- road ----------------------------------------------------------------------------
const ROAD_W = 7, STEP = 3;

// A band swept along the route: each column is [sideways offset, height offset] from the road centre line.
// Faces join neighbouring columns (front face up when the offsets decrease); u runs across the columns, v along the road (1 per 12 m).
function sweep(route: Route, cols: [number, number][]) {
  const rings = Math.ceil(route.length / STEP), C = cols.length;
  const v: number[] = [], uv: number[] = [], idx: number[] = [];
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const d = (i / rings) * route.length;
    const { pos: q, tangent } = route.pose(d, p);
    side.crossVectors(tangent, up).setY(0).normalize();
    cols.forEach(([s, dy], c) => {
      v.push(q.x + side.x * s, q.y + dy, q.z + side.z * s);
      uv.push(c / (C - 1), d / 12);
    });
    if (i < rings) for (let c = 0; c < C - 1; c++) {
      const a = i * C + c, b = a + C;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function asphalt(r: Extract<SkinData['road'], { style: 'asphalt' }>, route: Route, rand: () => number) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = r.surface; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
    g.fillRect(rand() * 128, rand() * 256, 2, 2);
  }
  g.fillStyle = r.lines;
  g.fillRect(4, 0, 4, 256); g.fillRect(120, 0, 4, 256);
  g.fillRect(62, 0, 4, 128);
  const road = new THREE.Mesh(sweep(route, [[-ROAD_W / 2, 0.12], [ROAD_W / 2, 0.12]]), new THREE.MeshLambertMaterial({ map: texture(cv), side: THREE.DoubleSide }));
  road.receiveShadow = true;
  const shoulder = new THREE.MeshLambertMaterial({ color: r.shoulder, side: THREE.DoubleSide });
  const edge = ROAD_W / 2;
  return [
    road,
    new THREE.Mesh(sweep(route, [[-edge, 0.12], [-edge - 2.5, -2.38]]), shoulder),
    new THREE.Mesh(sweep(route, [[edge, 0.12], [edge + 2.5, -2.38]]), shoulder),
  ];
}

// road drawn like a sketch: a plain surface with pen strokes (constant width in pixels) for the edges and a dashed centre
function lines(r: Extract<SkinData['road'], { style: 'lines' }>, route: Route) {
  const e = ROAD_W / 2, n = Math.ceil(route.length / STEP);
  const surface = new THREE.Mesh(sweep(route, [[-e - 2.5, -2.38], [-e, 0.12], [e, 0.12], [e + 2.5, -2.38]]), new THREE.MeshLambertMaterial({ color: r.surface, side: THREE.DoubleSide }));
  surface.receiveShadow = true;
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
  const stroke = (s: number, dashed: boolean) => {
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const { pos: q, tangent } = route.pose((i / n) * route.length, p);
      side.crossVectors(tangent, up).setY(0).normalize();
      pts.push(q.x + side.x * s, q.y + 0.14, q.z + side.z * s);
    }
    const line = new Line2(new LineGeometry().setPositions(pts), new LineMaterial({ color: r.lines, linewidth: r.width, dashed, dashSize: 4, gapSize: 8, fog: true }));
    return line.computeLineDistances();
  };
  return [surface, stroke(-e, false), stroke(e, false), stroke(0, true)];
}

// floating glass deck: dark reflective top with faint panel seams, glowing edge rails, a thin slab underneath
function glass(r: Extract<SkinData['road'], { style: 'glass' }>, route: Route, env: THREE.Texture) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  for (const [x, dir] of [[0, 1], [128, -1]]) { // light spill from the rails
    const sp = g.createLinearGradient(x, 0, x + dir * 14, 0);
    sp.addColorStop(0, 'rgba(255,255,255,0.35)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.fillRect(dir > 0 ? 0 : 114, 0, 14, 256);
  }
  g.fillStyle = r.grid;
  g.globalAlpha = 0.12;
  g.fillRect(0, 0, 128, 2); g.fillRect(0, 128, 128, 2); // panel seams every 6 m
  g.globalAlpha = 0.55;
  g.fillRect(63, 0, 2, 96); // centre dashes
  const glow = texture(cv);
  const deck = new THREE.Mesh(
    sweep(route, [[ROAD_W / 2, 0.12], [-ROAD_W / 2, 0.12]]), // right → left so the face points up
    new THREE.MeshStandardMaterial({ color: r.surface, roughness: 0.08, metalness: 0.1, envMap: env, envMapIntensity: 1.6, emissive: r.grid, emissiveMap: glow, emissiveIntensity: 0.6 }),
  );
  deck.receiveShadow = true;
  const e = ROAD_W / 2, w = 0.12, top = 0.24, bottom = -0.7;
  const rail = new THREE.MeshBasicMaterial({ color: new THREE.Color(r.edge).multiplyScalar(1.3) });
  const body = new THREE.MeshStandardMaterial({ color: r.surface, roughness: 0.4, metalness: 0.7, envMap: env, side: THREE.DoubleSide });
  const under = new THREE.MeshBasicMaterial({ color: new THREE.Color(r.edge).multiplyScalar(0.6) });
  return [
    deck,
    // rails: inner face, top, outer face
    new THREE.Mesh(sweep(route, [[-e, 0.12], [-e, top], [-e - w, top], [-e - w, bottom + 0.15]]), rail),
    new THREE.Mesh(sweep(route, [[e + w, bottom + 0.15], [e + w, top], [e, top], [e, 0.12]]), rail),
    // slab sides + underside, with a thin glow line along the bottom edges
    new THREE.Mesh(sweep(route, [[-e - w, bottom + 0.15], [-e - w + 0.6, bottom], [e + w - 0.6, bottom], [e + w, bottom + 0.15]]), body),
    new THREE.Mesh(sweep(route, [[-e - w + 0.55, bottom - 0.02], [-e - w + 0.75, bottom - 0.02]]), under),
    new THREE.Mesh(sweep(route, [[e + w - 0.75, bottom - 0.02], [e + w - 0.55, bottom - 0.02]]), under),
  ];
}
