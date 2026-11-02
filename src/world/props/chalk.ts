import * as THREE from 'three';
import type { Route } from '../route';
import { beside, texture, type Rand } from '../kit';

// fans' chalk on the road: `words` spread evenly from `from` to `to` m, written to be read on the way up
export default function chalk(p: { words: string[]; from: number; to: number; color: string }, route: Route, _g: unknown, rand: Rand) {
  const group = new THREE.Group();
  p.words.forEach((word, i) => {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d')!;
    g.font = '800 92px system-ui, sans-serif';
    const size = Math.min(92, (460 / g.measureText(word).width) * 92);
    g.font = `800 ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = p.color; g.globalAlpha = 0.5;
    for (let k = 0; k < 4; k++) g.fillText(word, 256 + (rand() - 0.5) * 6, 66 + (rand() - 0.5) * 6); // rough strokes
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.5; // worn by tyres
    for (let k = 0; k < 500; k++) g.fillRect(rand() * 512, rand() * 128, 2, 2);
    const d = p.from + ((i + 0.5) / p.words.length) * (p.to - p.from), at = beside(route, d, (rand() - 0.5) * 1.5);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.5).rotateX(-Math.PI / 2), // stretched along the road, so it reads at a glance
      new THREE.MeshLambertMaterial({ map: texture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.position.set(at.x, at.y + 0.13, at.z);
    mesh.rotation.set(Math.atan(route.gradeAt(d) / 100), at.yaw + Math.PI, 0, 'YXZ'); // top of the letters uphill, lying on the slope
    group.add(mesh);
  });
  return group;
}
