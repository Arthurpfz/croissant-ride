import * as THREE from 'three';
import type { Route } from '../route';
import { lerp, still, texture, type Ground, type Rand, type Tick } from '../kit';

// A rare visitor: a dark cube of armour panels with amber seams drifts down into view beside a small moon, opens the
// three panels at its weapon corner, charges (the seams light up in a wave toward that corner) and fires one beam at
// the moon, which flashes and wobbles. Then it closes up and drifts back out. Every `every` [min, max] seconds, once a
// moon is in view; clicking it fires again. `moons` small moons stay in the sky as targets. Reduced motion: drift only.
export default function cube(p: { every: [number, number]; edge: number; grid: number; hull: string; seams: string; beam: string; moons: number; moon: string }, _r: Route, _g: Ground, rand: Rand) {
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
