import * as THREE from 'three';
import type { Route } from '../route';
import { sceneryOf } from '../packs';
import { beside, texture } from '../kit';

// a French place-name sign (white panel, red border, on two posts) on the right of the road at each of the
// route's named places, `before` m ahead of the place itself
export default function signs(p: { before: number; face: string; border: string; post: string }, route: Route) {
  const group = new THREE.Group(), post = new THREE.MeshLambertMaterial({ color: p.post });
  for (const [d, name] of sceneryOf(route.data)?.places ?? []) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 160;
    const g = cv.getContext('2d')!;
    g.fillStyle = p.border; g.fillRect(0, 0, 512, 160);
    g.fillStyle = p.face; g.fillRect(12, 12, 488, 136);
    g.fillStyle = '#16171a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 64px system-ui, sans-serif';
    g.fillText(name.toUpperCase(), 256, 84, 460);
    const at = beside(route, Math.max(0, d - p.before), 5.6), sign = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 0.05), [post, post, post, post, post, new THREE.MeshLambertMaterial({ map: texture(cv) })]);
    panel.position.y = 2.1;
    sign.add(panel);
    for (const x of [-0.95, 0.95]) sign.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 4, 0.07).translate(x, 0.2, 0.06), post));
    sign.position.set(at.x, at.y, at.z);
    sign.rotation.y = at.yaw; // the panel's -z face (the printed one) meets the rider coming up
    group.add(sign);
  }
  return group;
}
