// Scenery from a skin's placement rules (`props` in skin.json). Built-in procedural types only; packs never ship code.
import * as THREE from 'three';
import type { Route } from './route';
import type { Prop } from './packs';
import { fbm } from './noise';

type Ground = ((x: number, z: number) => number) | undefined;
type Rand = () => number;
export type Tick = (dt: number, at: THREE.Vector3, forward: THREE.Vector3, camera: THREE.Camera) => void; // per frame, with the rider's position + heading
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// animated props put a Tick in userData.tick, clickable parts a handler in userData.click
export function buildProps(props: Prop[], route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group(), ticks: Tick[] = [], targets: THREE.Object3D[] = [];
  for (const p of props) {
    const build = builders[p.type];
    if (!build) { console.warn(`Unknown prop type "${p.type}"`); continue; }
    const o = build(p as never, route, ground, rand);
    group.add(o);
    if (o.userData.tick) ticks.push(o.userData.tick);
    o.traverse((c) => { if (c.userData.click) targets.push(c); });
  }
  const tick: Tick = (dt, at, forward, camera) => { for (const t of ticks) t(dt, at, forward, camera); };
  return { group, tick, targets };
}

const builders: Record<string, (p: never, route: Route, ground: Ground, rand: Rand) => THREE.Object3D> = { pines, planet, asteroids, gates, cube, flyby, meteor };

// cone pines in noise patches on the ground, kept off the road and out of the water and high rock
function pines(p: { count: number; from: number; patches: number; maxHeight: number; trunk: string; hue: [number, number] }, route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group();
  if (!ground) return group;
  const COUNT = p.count;
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 8, 6), new THREE.MeshLambertMaterial({ flatShading: true }), COUNT);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2.5, 5), new THREE.MeshLambertMaterial({ color: p.trunk }), COUNT);
  crown.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < COUNT && tries < COUNT * 20; tries++) {
    const a = rand() * Math.PI * 2, r = 300 + Math.sqrt(rand()) * 3600;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (fbm(x / 300, z / 300) < p.patches) continue; // forest patches
    if (route.nearRoad(x, z).dist < p.from) continue;
    const h = ground(x, z);
    if (h < -1 || h > p.maxHeight) continue; // water at -3
    const k = 0.7 + rand() * 0.8;
    s.set(k, k * (0.8 + rand() * 0.5), k);
    m.compose(v.set(x, h + 1.25 * s.y, z), q, s);
    trunk.setMatrixAt(n, m);
    m.compose(v.set(x, h + 2.5 * s.y + 4 * s.y, z), q, s);
    crown.setMatrixAt(n, m);
    crown.setColorAt(n, col.setHSL(lerp(p.hue[0], p.hue[1], rand()), 0.45, 0.18 + rand() * 0.1));
    n++;
  }
  crown.count = trunk.count = n;
  group.add(crown, trunk);
  return group;
}

// a banded planet far away, optionally ringed; `dir` from the loop centre, `distance` and `radius` in metres
function planet(p: { dir: [number, number, number]; distance: number; radius: number; colors: [string, string]; ring?: boolean; tilt?: number }, _r: Route, _g: Ground, rand: Rand) {
  const group = new THREE.Group();
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d')!;
  const [a, b] = p.colors.map((c) => new THREE.Color(c)), c = new THREE.Color();
  for (let y = 0; y < 256; y++) {
    const t = 0.5 + 0.5 * Math.sin(y * 0.09 + Math.sin(y * 0.031) * 3) * (0.6 + 0.4 * fbm(y * 0.05, 1.7));
    g.fillStyle = `#${c.copy(a).lerp(b, t).getHexString()}`;
    g.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 260; i++) { // storms and streaks
    g.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`;
    g.beginPath(); g.ellipse(rand() * 512, rand() * 256, 6 + rand() * 40, 1 + rand() * 3, 0, 0, Math.PI * 2); g.fill();
  }
  // lit from the side by a fixed star, with an atmosphere rim, so it reads as a sphere from anywhere on the loop
  const dir = new THREE.Vector3(...p.dir).normalize(), up = new THREE.Vector3(0, 1, 0);
  const light = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(0.9).addScaledVector(dir, -0.45).addScaledVector(up, 0.3).normalize();
  const body = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 64, 32), new THREE.ShaderMaterial({
    uniforms: { map: { value: texture(cv) }, light: { value: light }, rim: { value: b.clone().multiplyScalar(1.3) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN, vV;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 light, rim; varying vec2 vUv; varying vec3 vN, vV;
      void main() {
        vec3 n = normalize(vN); float l = dot(n, light);
        vec3 col = texture2D(map, vUv).rgb * (0.03 + 1.2 * smoothstep(-0.1, 0.7, l));
        col += rim * pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.5) * smoothstep(-0.3, 0.4, l);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  body.rotation.z = p.tilt ?? 0.3;
  group.add(body);
  if (p.ring) {
    const inner = p.radius * 1.35, outer = p.radius * 2.3;
    const geo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
    const rc = document.createElement('canvas');
    rc.width = 256; rc.height = 1;
    const rg = rc.getContext('2d')!;
    for (let x = 0; x < 256; x++) {
      const k = (0.25 + 0.75 * fbm(x * 0.08, 3.1)) * Math.sin((x / 256) * Math.PI) ** 0.5;
      rg.fillStyle = `rgba(${Math.round(lerp(a.r, 1, 0.6) * 255)},${Math.round(lerp(a.g, 1, 0.6) * 255)},${Math.round(lerp(a.b, 1, 0.6) * 255)},${k * 0.8})`;
      rg.fillRect(x, 0, 1, 1);
    }
    const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture(rc), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.set(-Math.PI / 2 + 0.35, 0.2, 0);
    group.add(ring);
  }
  group.position.set(...p.dir).normalize().multiplyScalar(p.distance);
  return group;
}

// rocks scattered around the road: `from`–`to` metres off it, any direction, sizes skewed small
function asteroids(p: { count: number; from: number; to: number; size: [number, number]; color: string }, route: Route, _g: Ground, rand: Rand) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { // lumpy: displace along the normal by a hash of the vertex direction
    v.fromBufferAttribute(pos, i);
    const k = 0.75 + 0.5 * fbm(v.x * 1.7 + 4, v.y * 1.7 + v.z * 1.3);
    pos.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.95, flatShading: true }), p.count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), at = new THREE.Vector3();
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const { pos: c, tangent } = route.pose(rand() * route.length, at);
    side.crossVectors(tangent, up).normalize();
    const ang = rand() * Math.PI * 2, d = lerp(p.from, p.to, rand() ** 1.5);
    c.addScaledVector(side, Math.cos(ang) * d).addScaledVector(up, Math.sin(ang) * d * 0.5);
    const k = lerp(p.size[0], p.size[1], rand() ** 3);
    s.set(k * (0.7 + rand() * 0.6), k * (0.7 + rand() * 0.6), k * (0.7 + rand() * 0.6));
    m.compose(c, q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6)), s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(p.color).multiplyScalar(0.7 + rand() * 0.6));
  }
  return mesh;
}

// a glowing ring over the road every `every` metres, with the distance on a small sign
function gates(p: { every: number; color: string; radius: number }, route: Route) {
  const group = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(p.radius, 0.22, 10, 96);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(3) });
  const haloGeo = new THREE.TorusGeometry(p.radius, 0.9, 10, 96);
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(0.25), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const at = new THREE.Vector3(), look = new THREE.Vector3();
  for (let d = p.every; d < route.length - p.every / 3; d += p.every) {
    const { pos, tangent } = route.pose(d, at);
    const gate = new THREE.Group();
    gate.position.copy(pos).setY(pos.y + 0.6);
    gate.lookAt(look.copy(gate.position).add(tangent.setY(0)));
    gate.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(haloGeo, haloMat));
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const g = cv.getContext('2d')!;
    g.fillStyle = 'rgba(7,16,38,0.85)'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = p.color; g.fillRect(0, 88, 256, 8);
    g.font = '700 60px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${Math.round(d / 1000)} km`, 128, 46);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: texture(cv), side: THREE.DoubleSide }));
    sign.position.set(0, p.radius + 1.1, 0);
    sign.rotation.y = Math.PI; // face the oncoming rider
    gate.add(sign);
    group.add(gate);
  }
  return group;
}

// A rare visitor: a dark cube of armour panels with amber seams drifts down into view beside a small moon, opens the
// three panels at its weapon corner, charges (the seams light up in a wave toward that corner) and fires one beam at
// the moon, which flashes and wobbles. Then it closes up and drifts back out. Every `every` [min, max] seconds, once a
// moon is in view; clicking it fires again. `moons` small moons stay in the sky as targets. Reduced motion: drift only.
function cube(p: { every: [number, number]; edge: number; grid: number; hull: string; seams: string; beam: string; moons: number; moon: string }, _r: Route, _g: Ground, rand: Rand) {
  const group = new THREE.Group(), rig = new THREE.Group();
  const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), Y = up.clone();
  const moons = Array.from({ length: p.moons }, (_, i) => {
    const r = 80 + rand() * 50, a = ((i + rand() * 0.5) / p.moons) * Math.PI * 2, el = THREE.MathUtils.degToRad(6 + rand() * 4), d = 5000 + rand() * 1000;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshStandardMaterial({ map: craters(p.moon, rand), roughness: 1, emissive: p.beam, emissiveIntensity: 0, fog: false }));
    m.position.set(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d);
    m.userData.home = m.position.clone();
    m.userData.r = r;
    group.add(m);
    return m;
  });

  // cube, in its own frame with the weapon corner at (+h, +h, +h): an inner body whose glowing surface shows through
  // the gaps between panels, with an empty pocket under the corner holding the core
  const E = p.edge, h = E / 2, N = p.grid, c = E / N, t = c * 0.12, gap = c * 0.08, hi = h - t, split = h - c;
  const seam = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { color: { value: new THREE.Color(p.seams) }, glow: { value: 0.6 }, wave: { value: 0 }, lit: { value: 0 }, size: { value: E } },
    vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float glow, wave, lit, size; varying vec3 vP;
      void main() {
        float d = length(vP - vec3(size * 0.5)) / (size * 1.732), front = 1.0 - wave; // d: 0 at the weapon corner, 1 at the far one
        float band = exp(-pow((d - front) * 14.0, 2.0)) * step(0.001, wave) * step(wave, 0.999);
        gl_FragColor = vec4(color * (glow + lit * (2.0 * smoothstep(front - 0.04, front + 0.04, d) + 3.0 * band)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const spans = [[-hi, split], [split, hi]];
  for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
    if (sx & sy & sz) continue; // the pocket
    const [x0, x1] = spans[sx], [y0, y1] = spans[sy], [z0, z1] = spans[sz];
    rig.add(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), seam));
  }
  const panelMat = new THREE.MeshStandardMaterial({ color: p.hull, metalness: 0.6, roughness: 0.5, fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const panels = new THREE.InstancedMesh(box, panelMat, 6 * N * N - 3);
  const doors: { mesh: THREE.Mesh; home: THREE.Vector3; open: THREE.Vector3 }[] = [];
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  axes.forEach((nAx, a) => {
    const u = axes[(a + 1) % 3], w = axes[(a + 2) % 3];
    for (const s of [1, -1]) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      pos.copy(nAx).multiplyScalar(s * (h - t / 2)).addScaledVector(u, (i + 0.5) * c - h).addScaledVector(w, (j + 0.5) * c - h);
      scl.copy(nAx).multiplyScalar(t).addScaledVector(u, c - gap).addScaledVector(w, c - gap);
      if (s > 0 && i === N - 1 && j === N - 1) { // a weapon-corner panel: lifts and slides back over its neighbours
        const mesh = new THREE.Mesh(box, panelMat);
        mesh.position.copy(pos); mesh.scale.copy(scl);
        doors.push({ mesh, home: pos.clone(), open: nAx.clone().multiplyScalar(t * 1.2).addScaledVector(u, -c * 0.7).addScaledVector(w, -c * 0.7) });
        rig.add(mesh);
        continue;
      }
      panels.setMatrixAt(n, m4.compose(pos, q0, scl));
      panels.setColorAt(n++, col.set(p.hull).multiplyScalar(0.8 + rand() * 0.4));
    }
  });
  rig.add(panels);
  const coreAt = (split + hi) / 2;
  const core = new THREE.Mesh(new THREE.SphereGeometry((hi - split) * 0.4, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.beam).multiplyScalar(0.3), fog: false }));
  core.position.setScalar(coreAt);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(E, E, E), new THREE.MeshBasicMaterial({ visible: false })); // click target
  rig.add(core, hit);
  rig.visible = false;

  // beam: bright core + soft glow, unit length along +y from the corner; impact flash on the moon
  const tube = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
  const additive = (k: number, opacity: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(p.beam).multiplyScalar(k), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beam = new THREE.Group();
  const beamCore = new THREE.Mesh(tube, additive(4, 1)), beamGlow = new THREE.Mesh(tube, additive(1.2, 0.35));
  beam.add(beamCore, beamGlow);
  beam.visible = false;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), additive(3, 0));
  group.add(rig, beam, flash);

  const IN = 12, HOLD = 3, OUT = 12, ATK = 5; // seconds
  const next = () => lerp(p.every[0], p.every[1], Math.random());
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), axis = new THREE.Vector3(), corner = new THREE.Vector3();
  const align = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), ndc = new THREE.Vector3(), side = new THREE.Vector3();
  let wait = next(), life = -1, atk = -1, fired = false, spin = 0, time = 0, hitT = -1, target = moons[0];
  hit.userData.click = () => { if (life >= 0 && atk < 0 && !still()) atk = 0; };

  group.userData.tick = ((dt, _at, _f, camera) => {
    time += dt;
    seam.uniforms.glow.value = still() ? 0.6 : 0.6 + 0.15 * Math.sin(time * 2); // faint pulse
    if (hitT >= 0) { // the moon flashes and wobbles, then settles
      hitT += dt;
      const e = Math.exp(-hitT * 2.5), r = target.userData.r;
      target.position.copy(target.userData.home).add(v.set(Math.sin(hitT * 23), Math.sin(hitT * 31 + 1), Math.sin(hitT * 27 + 2)).multiplyScalar(r * 0.12 * e));
      target.rotation.z = Math.sin(hitT * 19) * 0.15 * e;
      (target.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.5 * Math.exp(-hitT * 4);
      flash.position.copy(target.position);
      flash.scale.setScalar(r * (1.3 + hitT * 2));
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.8 * Math.exp(-hitT * 5);
      if (hitT > 2.5) { target.position.copy(target.userData.home); target.rotation.z = 0; hitT = -1; }
    }

    if (life < 0) {
      if ((wait -= dt) > 0) return;
      // the moon nearest the middle of the view, below the HUD; none in view → look again shortly
      let best: typeof target | undefined, bx = 0.4;
      for (const m of moons) {
        ndc.copy(m.position).project(camera);
        if (ndc.z < 1 && ndc.y > 0.15 && ndc.y < 0.5 && Math.abs(ndc.x) < bx) { best = m; bx = Math.abs(ndc.x); }
      }
      if (!best) { wait = 5; return; }
      target = best;
      // hold just above it on its outer side, clear of the road ahead; drift in from above that side, leave the same way
      ndc.copy(target.position).project(camera);
      const s = Math.abs(ndc.x) < 0.1 ? (Math.random() < 0.5 ? 1 : -1) : Math.sign(ndc.x);
      const dist = Math.min(2600, camera.position.distanceTo(target.position) * 0.6);
      B.copy(ndc.set(ndc.x + s * 0.35, ndc.y + 0.06, 0.5)).unproject(camera).sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
      side.subVectors(B, camera.position).cross(up).normalize(); // screen right
      A.copy(B).addScaledVector(up, dist * 0.9).addScaledVector(side, s * dist * 0.3);
      C.copy(B).addScaledVector(up, dist * 0.9).addScaledVector(side, s * dist * 0.5);
      // weapon corner turned mostly toward the rider, partly toward the moon, so three faces and the opening show
      axis.subVectors(target.position, B).normalize().multiplyScalar(0.5).add(v.subVectors(camera.position, B).normalize()).normalize();
      align.setFromUnitVectors(v.set(1, 1, 1).normalize(), axis);
      life = 0;
      fired = false;
      rig.visible = true;
    }

    spin += (dt * Math.PI * 2) / 150;
    rig.quaternion.copy(spinQ.setFromAxisAngle(axis, spin)).multiply(align);
    if (atk < 0) {
      life += dt;
      if (life < IN) rig.position.lerpVectors(A, B, 1 - (1 - life / IN) ** 3);
      else if (life < IN + HOLD) rig.position.copy(B);
      else rig.position.lerpVectors(B, C, ((life - IN - HOLD) / OUT) ** 3);
      if (life >= IN + 1 && !fired && !still()) atk = 0;
      if (life >= IN + HOLD + OUT) { rig.visible = false; life = -1; wait = next(); }
      return;
    }

    // attack: doors open, seams charge toward the corner (2 s), beam, cool down, doors close
    fired = true;
    atk += dt;
    const sm = THREE.MathUtils.smoothstep;
    const open = sm(atk, 0, 0.8) * (1 - sm(atk, 4, 4.8)), lit = 1 - sm(atk, 3.8, ATK);
    for (const d of doors) d.mesh.position.copy(d.home).addScaledVector(d.open, open);
    seam.uniforms.wave.value = Math.min(1, atk / 2);
    seam.uniforms.lit.value = lit;
    core.material.color.set(p.beam).multiplyScalar(0.3 + 4 * sm(atk, 0, 2) * lit);
    beam.visible = atk > 2 && atk < 3.8;
    if (beam.visible) {
      rig.updateMatrixWorld();
      rig.localToWorld(corner.setScalar(coreAt));
      v.subVectors(target.position, corner);
      const len = v.length() * sm(atk, 2, 2.3), k = 1 - sm(atk, 3, 3.8);
      beam.position.copy(corner);
      beam.quaternion.setFromUnitVectors(Y, v.normalize());
      beamCore.scale.set(5 * k, len, 5 * k);
      beamGlow.scale.set(16 * k, len, 16 * k);
      if (atk >= 2.3 && hitT < 0 && len > 0) hitT = 0;
    }
    if (atk >= ATK) { atk = -1; seam.uniforms.wave.value = 0; }
  }) as Tick;
  return group;
}

function craters(hex: string, rand: Rand) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = hex; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 90; i++) {
    const x = rand() * 256, y = 10 + rand() * 108, r = 2 + rand() ** 2 * 14;
    g.fillStyle = `rgba(0,0,0,${0.12 + rand() * 0.15})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, Math.PI * 2); g.fill();
  }
  return texture(cv);
}

// a starfighter that streaks past every `every` [min, max] seconds at `speed` m/s: across the road ahead,
// or from behind the rider, overhead and away into the distance with a roll
function flyby(p: { every: [number, number]; speed: number; hull: string; accent: string; canopy: string }) {
  const ship = fighter(p.hull, p.accent, p.canopy);
  ship.visible = false;
  let wait = 20 + Math.random() * 20, path: THREE.QuadraticBezierCurve3 | undefined, len = 0, u = 0, overtake = false, bank = 0;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), tan = new THREE.Vector3(), next = new THREE.Vector3(), look = new THREE.Vector3();
  ship.userData.tick = ((dt, at, forward) => {
    if (!path) {
      if ((wait -= dt) > 0) return;
      side.crossVectors(forward, up).normalize();
      const s = Math.random() < 0.5 ? 1 : -1;
      const pt = (f: number, x: number, y: number) => at.clone().addScaledVector(forward, f).addScaledVector(side, x * s).addScaledVector(up, y);
      overtake = Math.random() < 0.6;
      path = overtake
        ? new THREE.QuadraticBezierCurve3(pt(-260, 30, 22), pt(120, 8, 26), pt(2400, -500, 160))
        : new THREE.QuadraticBezierCurve3(pt(80, -700, 12), pt(220, 0, 18), pt(80, 700, 30)); // low, under the HUD panel
      len = path.getLength();
      u = bank = 0;
      ship.visible = true;
    }
    u += (dt * p.speed) / len;
    if (u >= 1) {
      path = undefined;
      ship.visible = false;
      wait = lerp(p.every[0], p.every[1], Math.random());
      return;
    }
    path.getPointAt(u, ship.position);
    path.getTangentAt(u, tan);
    path.getTangentAt(Math.min(1, u + 0.02), next);
    ship.lookAt(look.copy(ship.position).add(tan));
    // bank into the turn (positive roll = right wing down), plus one full roll mid-way on the overtaking pass
    bank += (THREE.MathUtils.clamp(next.sub(tan).dot(side.crossVectors(tan, up).normalize()) * 25, -0.9, 0.9) - bank) * Math.min(1, dt * 3);
    ship.rotateZ(bank + (overtake ? Math.PI * 2 * THREE.MathUtils.smoothstep(u, 0.12, 0.24) : 0));
  }) as Tick;
  return ship;
}

// ~12 m long, nose +z: flat arrowhead wing with a notched tail, raised spine and canopy, engine pods on the wingtips
// with canted fins, glowing exhausts and fading trails
function fighter(hullHex: string, accentHex: string, canopyHex: string) {
  const ship = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: hullHex, metalness: 0.3, roughness: 0.45, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentHex).multiplyScalar(3) });
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    ship.add(m);
    return m;
  };
  const outline = [[0, 7.5], [1.1, 2.5], [5.5, -3], [5.5, -4.6], [1.8, -3.2], [0, -4.2]];
  const shape = new THREE.Shape([...outline, ...outline.slice(1, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => new THREE.Vector2(x, y)));
  const wing = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1 });
  wing.rotateX(Math.PI / 2); // shape y → +z, thickness downwards
  part(wing, hull, 0, 0.17, 0);
  part(new THREE.OctahedronGeometry(1), hull, 0, 0.15, 0.8).scale.set(1, 0.7, 5.5);
  part(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: canopyHex, metalness: 0.9, roughness: 0.1, emissive: canopyHex, emissiveIntensity: 0.3 }), 0, 0.5, 2.2).scale.set(0.65, 0.55, 1.7);
  const pod = new THREE.CylinderGeometry(0.55, 0.45, 4.2, 10).rotateX(Math.PI / 2);
  const nozzle = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10).rotateX(Math.PI / 2);
  const fin = new THREE.BoxGeometry(0.12, 1.6, 1.8), stripe = new THREE.BoxGeometry(0.1, 0.06, 3.2);
  const TRAIL = 7, trail = new THREE.ConeGeometry(0.45, TRAIL, 10, 1, true);
  const pos = trail.attributes.position, cols: number[] = [], c = new THREE.Color(accentHex);
  for (let i = 0; i < pos.count; i++) { const k = (TRAIL / 2 - pos.getY(i)) / TRAIL; cols.push(c.r * k, c.g * k, c.b * k); } // bright at the nozzle, fading out
  trail.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  trail.rotateX(-Math.PI / 2).translate(0, 0, -TRAIL / 2); // apex backwards
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const s of [-1, 1]) {
    part(pod, hull, s * 5.5, 0, -2.6);
    part(nozzle, glow, s * 5.5, 0, -4.72);
    part(trail, trailMat, s * 5.5, 0, -4.75);
    part(fin, hull, s * 5.75, 0.9, -3.6).rotation.z = -s * 0.35;
    part(stripe, glow, s * 5.5, 0.55, -2.4);
  }
  return ship;
}

// a rare shooting star in the open sky right of the HUD: a thin streak, bright at the head and fading along the tail,
// crossing down and out in about a second. Placed in screen space so it is always visible and never over the road.
function meteor(p: { every: [number, number]; color: string }) {
  const geo = new THREE.CylinderGeometry(1, 0.1, 1, 6, 8, true).translate(0, -0.5, 0); // head at the origin, tail down -y
  const col: number[] = [], c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    c.set(p.color).multiplyScalar((1 + geo.attributes.position.getY(i)) ** 2);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const streak = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  streak.visible = false;
  const DUR = 1.1, Y = new THREE.Vector3(0, 1, 0), from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
  const r = (a: number, b: number) => lerp(a, b, Math.random());
  let wait = r(30, 90), t = -1;
  streak.userData.tick = ((dt, _at, _f, camera) => {
    if (t < 0) {
      if ((wait -= dt) > 0) return;
      wait = r(p.every[0], p.every[1]);
      if (still()) return;
      // NDC start + end, pushed out to 3–5 km along the camera rays
      const d = r(3000, 5000), x = r(0.55, 0.8), y = r(0.45, 0.8);
      const at = (v: THREE.Vector3, nx: number, ny: number) => v.set(nx, ny, 0.5).unproject(camera).sub(camera.position).setLength(d).add(camera.position);
      at(from, x, y);
      at(to, x + r(0.2, 0.35), y - r(0.25, 0.4));
      dir.subVectors(to, from);
      streak.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
      streak.scale.set(d * 6e-4, dir.length() * 0.45, d * 6e-4);
      streak.visible = true;
      t = 0;
    }
    t += dt / DUR;
    if (t >= 1) { streak.visible = false; t = -1; return; }
    streak.position.lerpVectors(from, to, t);
    (streak.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(t, 0, 0.15) * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1));
  }) as Tick;
  return streak;
}

export function texture(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
