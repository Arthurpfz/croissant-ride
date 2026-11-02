// Live ride state shared by sensors, physics, HUD and recorder.
import type { Sensor } from './ble/ble';

export const live = {
  power: 0, // resolved: trainer if one was paired, else power meter
  power3s: 0, // 3 s average for the HUD
  trainerPower: 0,
  pmPower: 0,
  cadence: 0,
  hr: 0,
  speed: 0, // m/s, virtual
  distance: 0, // m along the route (total)
  elevation: 0, // m, current
  ascent: 0, // m climbed
  grade: 0, // %
  elapsed: 0, // s of riding (not paused)
  kj: 0,
  rr: [] as number[], // beat-to-beat intervals (ms) not yet recorded
};

// keep only the latest beats while nothing is recording them
export const beats = (ms: number[]) => { live.rr.push(...ms); live.rr.splice(0, live.rr.length - 600); };

// Sensor readings remember who sent them and when, so a dropped or silent sensor reads 0, not its last value.
type Metric = 'trainerPower' | 'pmPower' | 'cadence' | 'hr';
const seen: Partial<Record<Metric, { by: Sensor; at: number }>> = {};
export function reading(by: Sensor, k: Metric, v: number) {
  live[k] = v;
  seen[k] = { by, at: performance.now() };
}
export function dropStale(now = performance.now()) {
  for (const k of Object.keys(seen) as Metric[]) {
    const s = seen[k]!;
    if (s.by.status !== 'connected' || now - s.at > 3000) { live[k] = 0; delete seen[k]; }
  }
}

const store = (k: string, d: number) => {
  try { return Number(localStorage.getItem(k)) || d; } catch { return d; }
};
export const settings = {
  ftp: store('ftp', 261),
  weight: store('weight', 80),
  save() {
    try { localStorage.setItem('ftp', String(this.ftp)); localStorage.setItem('weight', String(this.weight)); } catch {}
  },
};
