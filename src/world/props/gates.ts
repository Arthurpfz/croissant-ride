import * as THREE from 'three';
import type { Route } from '../route';
import { texture } from '../kit';

// a glowing ring over the road every `every` metres, with the distance on a small sign
export default function gates(p: { every: number; color: string; radius: number }, route: Route) {
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
