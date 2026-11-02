import * as THREE from 'three';
import type { Route } from '../route';
import { fbm } from '../noise';
import { lerp, texture, type Ground, type Rand } from '../kit';

// a banded planet far away, optionally ringed; `dir` from the loop centre, `distance` and `radius` in metres
export default function planet(p: { dir: [number, number, number]; distance: number; radius: number; colors: [string, string]; ring?: boolean; tilt?: number }, _r: Route, _g: Ground, rand: Rand) {
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
