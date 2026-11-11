// Built-in world packs from `worlds/`: routes (road line + elevation → grade, physics, FIT) and skins (visuals only).
// Packs are data, never code. Adding a pack = adding a file/folder; ids come from the file/folder name.
export interface RouteData {
  id: string;
  name: string;
  line: [number, number][]; // control points, x/z metres: a closed loop, or a one-way road from start to end
  elevation: number[]; // metres, evenly spaced along the road (a loop wraps around)
  oneWay?: boolean; // ride to the end, turn round, ride back
  skin?: string; // the route's default skin (`W` cycles the others that fit it)
  terrain?: Grid[]; // real ground heights, finest grid first
  scenery?: string | Scenery; // what stands beside the road: a file in the route's folder, loaded with the terrain
  licence?: string;
  credit?: string;
}
// a height grid in a route folder: Uint16 decimetres, row by row (z), west → east (x)
// `photo`: an aerial photo of the same rectangle (north up), for skins that drape it over the ground
export interface Grid { file: string; photo?: string; x0: number; z0: number; nx: number; nz: number; cell: number }
export type TerrainGrid = Grid & { h: Uint16Array; image?: HTMLImageElement };

// Real-world scenery for skins to draw their own way. buildings: [x, z, short side, long side, y rotation (°: the
// short side is local x), height, 1 = church or chapel]; places: [m along the road, name]; tunnel: a tunnel mouth
// beside the road [x, z, heading into the hill (°)]; forest: base64, one bit per cell of the finest grid (row by row,
// low bit first)
export interface Scenery { buildings: number[][]; places: [number, string][]; tunnel?: number[]; forest: string | Uint8Array }

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
    | { type: 'dem'; photo?: boolean; meadow: Hex[]; alpine: Hex; scree: Hex; rock: Hex; snow: Hex; treeline: number; snowline: number } // needs a route with terrain
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
const gridFiles = import.meta.glob<string>(['../../worlds/routes/*/scenery.json', '../../worlds/routes/*/*.{bin,webp}'], { query: '?url', import: 'default' }); // fetched on first use
const skinFiles = import.meta.glob<Omit<SkinData, 'id'>>('../../worlds/skins/*/skin.json', { eager: true, import: 'default' });
export const routes: RouteData[] = Object.entries(routeFiles).map(([p, r]) => ({ ...r, id: id(p, p.endsWith('/route.json') ? -2 : -1) }));
export const skins: SkinData[] = Object.entries(skinFiles).map(([p, s]) => ({ ...s, id: id(p, -2) }));

export const DEFAULT_SKIN = 'night-draft';
export const ROUTE = routes.find((r) => r.id === 'valley-flat')!; // every ride's route unless its workout names one
export const routeById = (id?: string) => routes.find((r) => r.id === id) ?? ROUTE;
export const skinsFor = (r: RouteData) => skins.filter((s) => (s.ground.type === 'dem') === !!r.terrain); // the world-switch cycle: a `dem` skin needs a route's terrain, and only it fits one
export const skinById = (id?: string | null) => skins.find((s) => s.id === id) ?? skins.find((s) => s.id === DEFAULT_SKIN)!;

// a route's terrain (and its scenery, put on the route), with each grid's photo for a skin that drapes it
const terrains = new Map<string, Promise<TerrainGrid[]>>();
export function terrainOf(r: RouteData, photo = false) {
  const id = `${r.id}:${photo}`, url = (f: string) => gridFiles[`../../worlds/routes/${r.id}/${f}`]();
  if (!terrains.has(id)) terrains.set(id, Promise.all((r.terrain ?? []).map(async (g) => {
    const image = photo && g.photo ? Object.assign(new Image(), { src: await url(g.photo) }) : undefined;
    const [h] = await Promise.all([fetch(await url(g.file)).then((f) => f.arrayBuffer()), image?.decode()]);
    return { ...g, h: new Uint16Array(h), image };
  })).then(async (grids) => {
    if (typeof r.scenery === 'string') {
      const s: Scenery = await (await fetch(await url(r.scenery))).json();
      r.scenery = { ...s, forest: Uint8Array.from(atob(s.forest as string), (c) => c.charCodeAt(0)) };
    }
    if (photo) mapPhotos.set(r.id, grids.findLast((g) => g.image));
    return grids;
  }));
  return terrains.get(id)!;
}
// the widest aerial photo loaded for a route so far: the minimap's backdrop
const mapPhotos = new Map<string, TerrainGrid | undefined>();
export const mapPhotoOf = (r: RouteData) => mapPhotos.get(r.id);

// a loaded route's scenery, and whether (x, z) is in its forest
export const sceneryOf = (r: RouteData) => (typeof r.scenery === 'object' ? r.scenery : undefined);
export function wooded(r: RouteData, x: number, z: number) {
  const g = r.terrain?.[0], bits = sceneryOf(r)?.forest as Uint8Array | undefined;
  if (!g || !bits) return false;
  const i = Math.round((x - g.x0) / g.cell), j = Math.round((z - g.z0) / g.cell), k = j * g.nx + i;
  return i >= 0 && j >= 0 && i < g.nx && j < g.nz && !!(bits[k >> 3] & (1 << (k & 7)));
}
