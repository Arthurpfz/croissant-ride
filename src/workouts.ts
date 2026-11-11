import { token } from './tokens';
import { settings } from './state';

// Workout library (% FTP). `to` = ramp end, `free` = no ERG (sprints / free ride), `rep` = "2 of 3" label,
// `notes` = coach messages [s into the step, text] (from imported .zwo textevents).
export interface Step { dur: number; from: number; to?: number; free?: boolean; label?: string; rep?: [number, number]; notes?: [number, string][] }
// route: worlds/routes id (default: the flat loop). test: 'ramp' = an FTP test: first step warm-up, last step cool-down,
// the ride engine ends the ramp between them when the rider can't hold it, and the summary proposes a new FTP.
export interface Workout { id: string; name: string; who: string; steps: Step[]; route?: string; test?: 'ramp' }

// Built-in sessions: one JSON file each in `workouts/`, in % FTP. A step is { min | sec, pct, free?, label? },
// { warmup: min } (50 → 75 %), { cooldown: min } (60 → 40 %), { ramp: { from, by, count } } (1-min steps, each `by` %
// higher) or { repeat: n, steps, lastRecovery? }: the repeat's first step is the work and carries "i of n"; a `pct`
// list gives each rep its own target.
interface FileStep { min?: number; sec?: number; pct?: number | number[]; free?: boolean; label?: string; warmup?: number; cooldown?: number; ramp?: { from: number; by: number; count: number }; repeat?: number; steps?: FileStep[]; lastRecovery?: boolean }

function expand(f: FileStep, rep = 0): Step[] {
  const r = f.ramp;
  if (r) return Array.from({ length: r.count }, (_, i): Step => ({ dur: 60, from: r.from + i * r.by }));
  if (f.warmup) return [{ dur: f.warmup * 60, from: 50, to: 75, label: 'Warm-up' }];
  if (f.cooldown) return [{ dur: f.cooldown * 60, from: 60, to: 40, label: 'Cool-down' }];
  if (f.repeat) {
    const n = f.repeat, out: Step[] = [];
    for (let i = 1; i <= n; i++) f.steps!.forEach((st, j) => {
      if (f.lastRecovery === false && i === n && j > 0) return;
      out.push(...expand(st, i - 1).map((x): Step => ({ ...x, rep: j === 0 ? [i, n] : undefined })));
    });
    return out;
  }
  return [{ dur: (f.min ?? 0) * 60 + (f.sec ?? 0), from: Array.isArray(f.pct) ? f.pct[rep] : f.pct!, free: f.free, label: f.label }];
}

const files = import.meta.glob<{ name: string; who: string; steps: FileStep[]; test?: 'ramp' }>('../workouts/*.json', { eager: true, import: 'default' });
export const workouts: Workout[] = [
  ...Object.entries(files).map(([p, w]) => ({ id: p.slice(p.lastIndexOf('/') + 1, -5), name: w.name, who: w.who, steps: w.steps.flatMap((st) => expand(st)), test: w.test })),
  { id: 'free', name: 'Free Ride', who: 'Just ride the loop', steps: [] },
  { id: 'galibier', name: 'Col du Galibier', who: 'Valloire → 2,642 m · 18 km at 7 % · map data IGN', steps: [], route: 'galibier' },
];

// target watts: % FTP plus the rider's −/+ offset (10 W steps)
export const watts = (pct: number, offset: number) => Math.max(0, Math.round((pct / 100) * settings.ftp + offset));

export const totalDuration = (w: Workout) => w.steps.reduce((a, st) => a + st.dur, 0);

// Where we are in a workout at time t (s).
export function at(w: Workout, t: number) {
  let start = 0;
  for (let i = 0; i < w.steps.length; i++) {
    const st = w.steps[i];
    if (t < start + st.dur) {
      const into = t - start;
      const pct = st.to === undefined ? st.from : st.from + (st.to - st.from) * (into / st.dur);
      return { i, step: st, into, left: st.dur - into, pct };
    }
    start += st.dur;
  }
  return null; // finished (or free ride)
}

export const zoneOf = (pct: number) => (pct < 56 ? 1 : pct < 76 ? 2 : pct < 91 ? 3 : pct < 106 ? 4 : pct < 121 ? 5 : 6);
export const zoneColor = (pct: number) => token(`zone-${zoneOf(pct)}`);
