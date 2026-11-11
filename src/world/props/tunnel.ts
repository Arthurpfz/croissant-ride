import * as THREE from 'three';
import type { Route } from '../route';
import { sceneryOf } from '../packs';
import type { Ground } from '../kit';

// the mouth of the route's tunnel: a concrete portal with a dark arch, set into the hillside at road height
export default function tunnel(p: { concrete: string; dark: string }, route: Route, ground: Ground) {
  const group = new THREE.Group(), t = sceneryOf(route.data)?.tunnel;
  if (!t || !ground) return group;
  const [x, z, deg] = t;
  const face = new THREE.Shape().moveTo(-6, 0).lineTo(6, 0).lineTo(6, 7.5).lineTo(-6, 7.5).closePath();
  const arch = new THREE.Path().moveTo(-3.6, 0).lineTo(-3.6, 3.2).absarc(0, 3.2, 3.6, Math.PI, 0, true).lineTo(3.6, 0).closePath();
  face.holes.push(arch);
  const portal = new THREE.Mesh(new THREE.ExtrudeGeometry(face, { depth: 14, bevelEnabled: false }), new THREE.MeshLambertMaterial({ color: p.concrete, flatShading: true }));
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7).translate(0, 3.5, 6), new THREE.MeshBasicMaterial({ color: p.dark, side: THREE.DoubleSide }));
  portal.castShadow = portal.receiveShadow = true;
  group.add(portal, dark);
  group.position.set(x, route.nearRoad(x, z).e - 0.6, z);
  group.rotation.y = (deg * Math.PI) / 180; // local +z runs into the hill
  return group;
}
