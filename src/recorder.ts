// 1 Hz ride recording (1 s averages), crash-safe in localStorage, exported as a FIT activity (virtual ride).
import { FitWriter, FIT } from './fit';
import { live, settings } from './state';

export interface Sample { t: number; p: number; c: number; hr: number; v: number; d: number; a: number; rr?: number[]; tg?: number } // tg: target W (ERG steps only)
interface Ride { name: string; samples: Sample[]; laps: number[]; pauses: [number, number][] }

const KEY = 'ride-in-progress';
let ride: Ride = { name: '', samples: [], laps: [0], pauses: [] };
let lastSave = 0;
let acc = { p: 0, c: 0, dt: 0 }; // power/cadence integrated over the current second

export const recording = () => ride;

export function start(name: string) {
  ride = { name, samples: [], laps: [0], pauses: [] };
  acc = { p: 0, c: 0, dt: 0 };
  live.rr.length = 0;
}

// Called every ride sub-step; each full second becomes one sample holding that second's mean power and cadence.
export function add(dt: number, wall = Date.now(), target: number | null = null) {
  acc.p += live.power * dt; acc.c += live.cadence * dt; acc.dt += dt;
  if (acc.dt < 1) return;
  // whole, strictly increasing seconds — FIT timestamps are 1 s resolution
  const t = Math.max(Math.round(wall / 1000) * 1000, (ride.samples.at(-1)?.t ?? 0) + 1000);
  ride.samples.push({
    t, p: Math.round(acc.p / acc.dt), c: Math.round(acc.c / acc.dt), hr: live.hr,
    v: live.speed, d: live.distance, a: live.elevation,
    ...(target != null ? { tg: Math.round(target) } : {}),
    ...(live.rr.length ? { rr: live.rr.splice(0) } : {}), // beats since the last sample (incl. any pause, so the HRV stream stays continuous)
  });
  const over = acc.dt - 1; // carry the overshoot into the next second
  acc = { p: live.power * over, c: live.cadence * over, dt: over };
  if (Date.now() - lastSave > 5_000) persist();
}

export const lap = () => { if (ride.samples.length > ride.laps.at(-1)!) ride.laps.push(ride.samples.length); };
export const pause = () => ride.pauses.push([Date.now(), 0]);
export const resume = () => { const p = ride.pauses.at(-1); if (p && !p[1]) p[1] = Date.now(); };

export function persist() {
  lastSave = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(ride)); } catch {}
}
export function clearSaved() { try { localStorage.removeItem(KEY); } catch {} }
export function recover(): Ride | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return r?.samples?.length > 60 ? r : null;
  } catch { return null; }
}
export const load = (r: Ride) => { ride = r; };

// --- stats -----------------------------------------------------------------
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// highest 60 s mean power (0 for a ride under a minute): what an FTP ramp test is scored on
export function bestMinute(s = ride.samples) {
  let sum = 0, best = 0;
  s.forEach((x, i) => { sum += x.p - (i >= 60 ? s[i - 60].p : 0); if (i >= 59) best = Math.max(best, sum / 60); });
  return best;
}

export function stats(s = ride.samples) {
  const p = s.map((x) => x.p), hr = s.map((x) => x.hr).filter(Boolean), cad = s.map((x) => x.c).filter(Boolean);
  // NP: 30 s rolling mean, ^4, mean, ^¼
  const roll: number[] = [];
  let sum = 0;
  p.forEach((w, i) => { sum += w - (i >= 30 ? p[i - 30] : 0); if (i >= 29) roll.push(sum / 30); });
  const np = roll.length ? Math.pow(avg(roll.map((x) => x ** 4)), 0.25) : avg(p);
  const secs = s.length;
  const IF = np / settings.ftp;
  let ascent = 0;
  for (let i = 1; i < s.length; i++) ascent += Math.max(0, s[i].a - s[i - 1].a);
  return {
    secs,
    distance: s.at(-1)?.d ?? 0,
    avgPower: avg(p), maxPower: Math.max(0, ...p), np,
    avgHr: avg(hr), maxHr: Math.max(0, ...hr),
    avgCad: avg(cad),
    kj: p.reduce((a, b) => a + b, 0) / 1000,
    ascent, IF, tss: (secs * np * IF) / (settings.ftp * 3600) * 100,
  };
}

// --- FIT ---------------------------------------------------------------------
export function toFit(r = ride): Uint8Array {
  const s = r.samples;
  const start = new Date(s[0].t), end = new Date(s.at(-1)!.t);
  const f = new FitWriter(), { event: EV, eventType: ET } = FIT, dev = FIT.manufacturer.development;
  f.put('fileId', { type: FIT.file.activity, manufacturer: dev, product: 1, serialNumber: 1, timeCreated: start });
  f.put('deviceInfo', { timestamp: start, deviceIndex: 0 /* creator */, manufacturer: dev, product: 1, productName: 'Croissant Ride', softwareVersion: 1 });
  f.put('event', { timestamp: start, event: EV.timer, eventType: ET.start });

  // pause events interleaved in time order; a pause never resumed (End ride) is covered by the final stop
  const ev = r.pauses.filter(([, b]) => b).flatMap(([a, b]) => [[a, ET.stopAll], [b, ET.start]] as const);
  let k = 0;
  for (const x of s) {
    for (; k < ev.length && ev[k][0] <= x.t; k++) f.put('event', { timestamp: new Date(ev[k][0]), event: EV.timer, eventType: ev[k][1] });
    f.put('record', {
      timestamp: new Date(x.t), power: x.p, cadence: x.c, heartRate: x.hr || undefined,
      speed: x.v, enhancedSpeed: x.v, distance: x.d, altitude: x.a, enhancedAltitude: x.a,
    });
    // HRV: RR intervals in s, up to 5 per message like Garmin devices (Intervals.icu derives DFA α1 from these)
    for (let i = 0; i < (x.rr?.length ?? 0); i += 5) f.put('hrv', { time: x.rr!.slice(i, i + 5).map((ms) => ms / 1000) });
  }

  const summary = (part: Sample[]) => {
    const st = stats(part);
    return {
      startTime: new Date(part[0].t), timestamp: new Date(part.at(-1)!.t),
      totalElapsedTime: (part.at(-1)!.t - part[0].t) / 1000 + 1, totalTimerTime: part.length,
      totalDistance: st.distance - (part[0].d - (part[0].v || 0)),
      avgPower: Math.round(st.avgPower), maxPower: st.maxPower, normalizedPower: Math.round(st.np),
      ...(st.avgHr ? { avgHeartRate: Math.round(st.avgHr), maxHeartRate: st.maxHr } : {}),
      avgCadence: Math.round(st.avgCad), totalWork: Math.round(st.kj * 1000), totalAscent: Math.round(st.ascent),
      sport: FIT.sport.cycling, subSport: FIT.subSport.virtualActivity,
    };
  };
  const bounds = [...r.laps.filter((i) => i < s.length), s.length];
  let laps = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (bounds[i + 1] <= bounds[i]) continue;
    f.put('lap', { ...summary(s.slice(bounds[i], bounds[i + 1])), messageIndex: laps++, event: EV.lap, eventType: ET.stop });
  }
  f.put('event', { timestamp: end, event: EV.timer, eventType: ET.stopAll });
  const st = stats(s);
  f.put('session', {
    ...summary(s), totalDistance: st.distance, messageIndex: 0, firstLapIndex: 0, numLaps: laps,
    event: EV.session, eventType: ET.stop, thresholdPower: settings.ftp,
    trainingStressScore: Math.round(st.tss * 10) / 10, intensityFactor: Math.round(st.IF * 1000) / 1000,
  });
  f.put('activity', {
    timestamp: end, totalTimerTime: s.length, numSessions: 1, type: FIT.activityType.manual, event: EV.activity, eventType: ET.stop,
    localTimestamp: Math.round(end.getTime() / 1000 - end.getTimezoneOffset() * 60 - 631065600),
  });
  return f.close();
}
