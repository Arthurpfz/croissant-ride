// Shared by the skin and prop builders.
import * as THREE from 'three';
import type { Route } from './route';

export type Ground = ((x: number, z: number) => number) | undefined;
export type Rand = () => number;
export type Tick = (dt: number, at: THREE.Vector3, forward: THREE.Vector3, camera: THREE.Camera) => void; // per frame, with the rider's position + heading
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// a spot `off` m right of the road (left if negative) `d` m along it, with the road's heading there (as a y rotation)
export function beside(route: Route, d: number, off: number) {
  const { pos, tangent } = route.pose(d);
  const yaw = Math.atan2(tangent.x, tangent.z);
  return { x: pos.x - Math.cos(yaw) * off, y: pos.y, z: pos.z + Math.sin(yaw) * off, yaw };
}

export function texture(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
