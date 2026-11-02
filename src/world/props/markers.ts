import * as THREE from 'three';
import type { Route } from '../route';
import { beside, texture, type Ground } from '../kit';
import { croissant } from './village';

// A cyclists' marker post every km of a climb (distance to the summit, gradient of the next km), and at the top a
// small car park where you turn round, with the col's sign (a croissant hides on its back)
export default function markers(p: { name: string; face: string; cap: string; summit: string; altitude: number; board: string; plaza: string }, route: Route, ground: Ground) {
  const group = new THREE.Group();
  const post = new THREE.BoxGeometry(0.55, 1.6, 0.22).translate(0, 0.8, 0), cap = new THREE.BoxGeometry(0.57, 0.22, 0.24).translate(0, 1.71, 0);
  const capMat = new THREE.MeshLambertMaterial({ color: p.cap }), bodyMat = new THREE.MeshLambertMaterial({ color: p.face });
  const ground0 = (x: number, z: number, y: number) => Math.min(y, ground?.(x, z) ?? y);
  for (let d = 0; d < route.length - 300; d += 1000) {
    const at = beside(route, d, 4.4), left = (route.length - d) / 1000;
    const grade = ((route.elevAt(Math.min(route.length, d + 1000)) - route.elevAt(d)) / Math.min(1000, route.length - d)) * 100;
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 256;
    const g = cv.getContext('2d')!;
    g.fillStyle = p.face; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#2b2c30'; g.textAlign = 'center';
    g.font = '700 13px system-ui, sans-serif'; g.fillText(p.name, 64, 34);
    g.font = '700 46px system-ui, sans-serif'; g.fillText(`${Math.round(left)}`, 64, 110);
    g.font = '600 18px system-ui, sans-serif'; g.fillText('km', 64, 134);
    g.font = '700 30px system-ui, sans-serif'; g.fillText(`${grade.toFixed(1)}%`, 64, 200);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.04), new THREE.MeshLambertMaterial({ map: texture(cv) }));
    face.position.set(0, 1.0, -0.115);
    face.rotation.y = Math.PI; // faces the rider coming up
    const m = new THREE.Group().add(new THREE.Mesh(post, bodyMat), new THREE.Mesh(cap, capMat), face);
    m.position.set(at.x, at.y - 0.95, at.z); // on the road's shoulder slope
    m.rotation.y = at.yaw;
    group.add(m);
  }

  const end = beside(route, route.length, 0), plaza = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 2.2, 28).translate(0, -1, 0), new THREE.MeshLambertMaterial({ color: p.plaza }));
  plaza.position.set(end.x + Math.sin(end.yaw) * 9, end.y + 0.1, end.z + Math.cos(end.yaw) * 9);
  plaza.receiveShadow = true;
  group.add(plaza);

  // the col's sign: a wooden board on two posts, facing the arriving rider
  const top = beside(route, route.length, 9);
  const sign = new THREE.Group();
  const board = (cv: HTMLCanvasElement, back: boolean) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshLambertMaterial({ map: texture(cv) }));
    b.position.set(0, 2.6, back ? 0.07 : -0.07);
    b.rotation.y = back ? 0 : Math.PI;
    return b;
  };
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = p.board; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#f4f2ec'; g.lineWidth = 8; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = '#f4f2ec'; g.textAlign = 'center';
  g.font = '700 58px system-ui, sans-serif'; g.fillText(p.summit, 256, 112);
  g.font = '600 44px system-ui, sans-serif'; g.fillText(`Alt. ${p.altitude} m`, 256, 190);
  const back = document.createElement('canvas');
  back.width = 512; back.height = 256;
  const bg = back.getContext('2d')!;
  bg.fillStyle = p.board; bg.fillRect(0, 0, 512, 256);
  croissant(bg, 452, 200, 16);
  const wood = new THREE.MeshLambertMaterial({ color: p.board });
  for (const x of [-1.5, 1.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.8, 0.12).translate(0, 1.4, 0), wood);
    leg.position.x = x;
    sign.add(leg);
  }
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.9, 0.12).translate(0, 2.6, 0), wood), board(cv, false), board(back, true));
  sign.position.set(top.x, ground0(top.x, top.z, top.y) - 0.3, top.z);
  sign.rotation.y = top.yaw - 0.5; // turned a little toward the road
  group.add(sign);
  return group;
}
