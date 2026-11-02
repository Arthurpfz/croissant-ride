// Built-in world packs from `worlds/`: routes (road line + elevation → grade, physics, FIT) and skins (visuals only).
// Packs are data, never code. Adding a pack = adding a file/folder; ids come from the file/folder name.
export interface RouteData {
  id: string;
  name: string;
  line: [number, number][]; // control points, x/z metres: a closed loop, or a one-way road from start to end
  elevation: number[]; // metres, evenly spaced along the road (a loop wraps around)
  oneWay?: boolean; // ride to the end, turn round, ride back
  skin?: string; // the route's own skin: no world switch on it
  terrain?: Grid[]; // real ground heights, finest grid first
  licence?: string;
  credit?: string;
}
// a height grid in a route folder: Uint16 decimetres, row by row (z), west → east (x)
export interface Grid { file: string; x0: number; z0: number; nx: number; nz: number; cell: number }
export type TerrainGrid = Grid & { h: Uint16Array };

type Hex = string;
export interface Prop { type: string; [k: string]: unknown }
export interface SkinData {
  id: string;
  name: string;
  author: string;
  licence: string;
  assets?: string;
  sky: { type: 'gradient'; top: Hex; horizon: Hex; stars?: number } | { type: 'nebula'; colors: Hex[]; stars: number };
  fog: { color: Hex; near: number; far: number };
  light: { sky: Hex; ground: Hex; ambient: number; sun: Hex; sunIntensity: number; sunFrom: [number, number, number] };
  ground:
    | { type: 'valley'; grass: Hex[]; sand: Hex; rock: Hex; snow: Hex; water: Hex }
    | { type: 'ridges'; color: Hex; ridges: { distance: number; height: number; color: Hex }[] }
    | { type: 'dem'; meadow: Hex[]; alpine: Hex; scree: Hex; rock: Hex; snow: Hex; treeline: number; snowline: number } // needs a route with terrain
    | { type: 'none' };
  road:
    | { style: 'asphalt'; surface: Hex; lines: Hex; shoulder: Hex }
    | { style: 'glass'; surface: Hex; edge: Hex; grid: Hex }
    | { style: 'lines'; surface: Hex; lines: Hex; width: number };
  rider: { suit: Hex; accent: Hex; skin: Hex; helmet: Hex; visor: Hex; shoes: Hex };
  bike: { frame: Hex; accent: Hex; parts: Hex; tyres: Hex; rims: Hex; glow?: Hex; front: 'deep' | 'disc'; rear: 'deep' | 'disc' };
  props: Prop[];
  bloom?: { strength: number; radius: number; threshold: number };
}

const id = (path: string, at: number) => path.split('/').at(at)!.replace('.json', '');
const routeFiles = import.meta.glob<Omit<RouteData, 'id'>>(['../../worlds/routes/*.json', '../../worlds/routes/*/route.json'], { eager: true, import: 'default' });
const gridFiles = import.meta.glob<string>('../../worlds/routes/*/*.bin', { query: '?url', import: 'default' }); // fetched on first use
const skinFiles = import.meta.glob<Omit<SkinData, 'id'>>('../../worlds/skins/*/skin.json', { eager: true, import: 'default' });
export const routes: RouteData[] = Object.entries(routeFiles).map(([p, r]) => ({ ...r, id: id(p, p.endsWith('/route.json') ? -2 : -1) }));
export const skins: SkinData[] = Object.entries(skinFiles).map(([p, s]) => ({ ...s, id: id(p, -2) }));

export const DEFAULT_SKIN = 'night-draft';
export const ROUTE = routes.find((r) => r.id === 'valley-flat')!; // every ride's route unless its workout names one
export const routeById = (id?: string) => routes.find((r) => r.id === id) ?? ROUTE;
export const switchable = skins.filter((s) => s.ground.type !== 'dem'); // the world-switch cycle: a `dem` skin needs its route's terrain
export const skinById = (id?: string | null) => skins.find((s) => s.id === id) ?? skins.find((s) => s.id === DEFAULT_SKIN)!;

const terrains = new Map<string, Promise<TerrainGrid[]>>();
export function terrainOf(r: RouteData) {
  if (!terrains.has(r.id)) terrains.set(r.id, Promise.all((r.terrain ?? []).map(async (g) => {
    const url = await gridFiles[`../../worlds/routes/${r.id}/${g.file}`]();
    return { ...g, h: new Uint16Array(await (await fetch(url)).arrayBuffer()) };
  })));
  return terrains.get(r.id)!;
}
