// Built-in world packs from `worlds/`: routes (road line + elevation → grade, physics, FIT) and skins (visuals only).
// Packs are data, never code. Adding a pack = adding a file/folder; ids come from the file/folder name.
export interface RouteData {
  id: string;
  name: string;
  line: [number, number][]; // closed loop control points, x/z metres
  elevation: number[]; // metres, evenly spaced along the loop, wraps around
}

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
const routeFiles = import.meta.glob<Omit<RouteData, 'id'>>('../../worlds/routes/*.json', { eager: true, import: 'default' });
const skinFiles = import.meta.glob<Omit<SkinData, 'id'>>('../../worlds/skins/*/skin.json', { eager: true, import: 'default' });
export const routes: RouteData[] = Object.entries(routeFiles).map(([p, r]) => ({ ...r, id: id(p, -1) }));
export const skins: SkinData[] = Object.entries(skinFiles).map(([p, s]) => ({ ...s, id: id(p, -2) }));

export const DEFAULT_SKIN = 'default-valley';
export const ROUTE = routes.find((r) => r.id === 'valley-flat')!; // the one route every ride uses (hilly routes: roadmap N17)
export const skinById = (id?: string | null) => skins.find((s) => s.id === id) ?? skins.find((s) => s.id === DEFAULT_SKIN)!;
