import { token } from './tokens';
import { settings } from './state';

// Workout library (% FTP). `to` = ramp end, `free` = no ERG (sprints / free ride), `rep` = "2 of 3" label,
// `notes` = coach messages [s into the step, text] (from imported .zwo textevents).
export interface Step { dur: number; from: number; to?: number; free?: boolean; label?: string; rep?: [number, number]; notes?: [number, string][] }
export interface Workout { id: string; name: string; who: string; steps: Step[] }

const min = (m: number) => m * 60;
const s = (dur: number, from: number, extra: Partial<Step> = {}): Step => ({ dur, from, ...extra });
const warm = (m: number, to = 75) => s(min(m), 50, { to, label: 'Warm-up' });
const cool = (m: number) => s(min(m), 60, { to: 40, label: 'Cool-down' });

// n reps of [work, recovery…]; the work step carries the "i of n" label, last recovery optional
function rep(n: number, steps: Step[], lastRecovery = true): Step[] {
  const out: Step[] = [];
  for (let i = 1; i <= n; i++) {
    steps.forEach((st, j) => {
      if (!lastRecovery && i === n && j > 0) return;
      out.push({ ...st, rep: j === 0 ? [i, n] : undefined });
    });
  }
  return out;
}

export const workouts: Workout[] = [
  {
    id: 'sst', name: '3×20min Sweet Spot', who: 'Base staple',
    steps: [warm(15), ...rep(3, [s(min(20), 89), s(min(5), 57)], false), cool(15)],
  },
  {
    id: 'vo2-mix', name: '70-min VO₂ Mix', who: 'VO₂max + anaerobic · 3′, 1′, 30″ and sprints',
    steps: [
      warm(20),
      ...rep(6, [s(min(3), 105), s(min(1), 50)]),
      ...rep(5, [s(min(1), 115), s(min(1), 50)]),
      ...rep(6, [s(30, 130), s(min(1), 50)]),
      ...rep(4, [s(15, 150, { free: true, label: 'Sprint ~10 strokes' }), s(min(1), 50)]),
      cool(5),
    ],
  },
  {
    id: 'vo2-build', name: 'Progressive VO₂ 6×3', who: '3-min reps building 110 → 120%',
    steps: [
      warm(10),
      ...[110, 112, 114, 116, 118, 120].flatMap((p, i, a) =>
        [s(min(3), p, { rep: [i + 1, a.length] }), ...(i < a.length - 1 ? [s(min(2), 50)] : [])]),
      cool(5),
    ],
  },
  {
    id: 'threshold-7x10', name: '7×10 Threshold', who: 'Long-course engine',
    steps: [warm(30), ...rep(7, [s(min(10), 92), s(min(1), 55)], false), cool(20)],
  },
  {
    id: 'surges-30-10', name: '30/10 Surges', who: '3 sets of 15 repeated surges',
    steps: [
      warm(15),
      ...[1, 2, 3].flatMap((set) => [
        ...rep(15, [s(30, 120), s(10, 50)]).map((st) => (st.rep ? { ...st, label: `Set ${set}/3` } : st)),
        ...(set < 3 ? [s(min(5), 55)] : []),
      ]),
      cool(10),
    ],
  },
  {
    id: 'endurance-3x30', name: 'Endurance 3×30', who: 'Aerobic base',
    steps: [warm(15), ...rep(3, [s(min(30), 80), s(min(5), 55)], false), cool(10)],
  },
  { id: 'free', name: 'Free Ride', who: 'Just ride the loop', steps: [] },
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
