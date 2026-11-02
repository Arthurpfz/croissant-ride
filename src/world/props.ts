// Scenery from a skin's placement rules (`props` in skin.json). Built-in procedural types only; packs never ship code.
// One file per prop type in `props/`, named after the type; adding a file adds the type.
import * as THREE from 'three';
import type { Route } from './route';
import type { Prop } from './packs';
import type { Ground, Rand, Tick } from './kit';

type Builder = (p: never, route: Route, ground: Ground, rand: Rand) => THREE.Object3D;
const builders = Object.fromEntries(Object.entries(import.meta.glob<Builder>('./props/*.ts', { eager: true, import: 'default' }))
  .map(([p, b]) => [p.slice(8, -3), b]));

// animated props put a Tick in userData.tick, clickable parts a handler in userData.click
export function buildProps(props: Prop[], route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group(), ticks: Tick[] = [], targets: THREE.Object3D[] = [];
  for (const p of props) {
    const build = builders[p.type];
    if (!build) { console.warn(`Unknown prop type "${p.type}"`); continue; }
    const o = build(p as never, route, ground, rand);
    group.add(o);
    if (o.userData.tick) ticks.push(o.userData.tick);
    o.traverse((c) => { if (c.userData.click) targets.push(c); });
  }
  const tick: Tick = (dt, at, forward, camera) => { for (const t of ticks) t(dt, at, forward, camera); };
  return { group, tick, targets };
}
