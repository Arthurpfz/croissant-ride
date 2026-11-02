import * as THREE from 'three';
import type { Route } from '../route';
import { beside, type Ground, type Rand } from '../kit';

// low stone guard walls on the road edge wherever the ground falls away more than `drop` m beside it
export default function walls(p: { drop: number; stone: string }, route: Route, ground: Ground, rand: Rand) {
  const STEP = 3, spots: { x: number; y: number; z: number; yaw: number }[] = [];
  if (ground) for (let d = 0; d < route.length; d += STEP) for (const s of [1, -1]) {
    const edge = beside(route, d, s * 4.05), out = beside(route, d, s * 13);
    if (edge.y - ground(out.x, out.z) > p.drop) spots.push(edge);
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 1.6, STEP + 0.05).translate(0, -0.25, 0), new THREE.MeshLambertMaterial({ color: p.stone, flatShading: true }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  spots.forEach((at, i) => {
    mesh.setMatrixAt(i, m4.compose(v.set(at.x, at.y, at.z), q.setFromAxisAngle(Y, at.yaw), one));
    mesh.setColorAt(i, c.set(p.stone).multiplyScalar(0.85 + rand() * 0.3));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
