// Shared by the skin and prop builders.
import * as THREE from 'three';

export type Ground = ((x: number, z: number) => number) | undefined;
export type Rand = () => number;
export type Tick = (dt: number, at: THREE.Vector3, forward: THREE.Vector3, camera: THREE.Camera) => void; // per frame, with the rider's position + heading
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function texture(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
