import * as THREE from 'three';
import type { Route } from '../route';
import { fbm } from '../noise';
import { lerp, type Ground, type Rand } from '../kit';

// rocks scattered around the road: `from`–`to` metres off it, any direction, sizes skewed small
export default function asteroids(p: { count: number; from: number; to: number; size: [number, number]; color: string }, route: Route, _g: Ground, rand: Rand) {
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
