// Zwift .zwo workout import (what TrainingPeaks, Intervals.icu and What's on Zwift export), kept in localStorage.
import type { Step, Workout } from './workouts';

const KEY = 'imported-workouts';

export function parseZwo(xml: string, fallbackName: string): Workout {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.querySelector('workout');
  if (doc.querySelector('parsererror') || !root) throw new Error('not a Zwift workout file');
  const steps: Step[] = [];
  for (const el of root.children) {
    // attribute names vary in case between exporters
    const a = (k: string) => { const v = [...el.attributes].find((x) => x.name.toLowerCase() === k)?.value; return v === undefined ? undefined : Number(v); };
    const pct = (k: string) => (a(k) === undefined ? undefined : Math.round(a(k)! * 100));
    const dur = Math.round(a('duration') ?? 0);
    const first = steps.length;
    switch (el.tagName.toLowerCase()) {
      case 'steadystate': // a target range (PowerLow–PowerHigh) rides at its midpoint
        steps.push({ dur, from: pct('power') ?? Math.round(((a('powerlow') ?? NaN) + (a('powerhigh') ?? a('powerlow') ?? NaN)) * 50) }); break;
      case 'warmup': case 'ramp': steps.push({ dur, from: pct('powerlow')!, to: pct('powerhigh') }); break;
      case 'cooldown': { // Zwift always ramps a cooldown down, whatever the attribute order
        const [x, y] = [pct('powerlow')!, pct('powerhigh')!];
        steps.push({ dur, from: Math.max(x, y), to: Math.min(x, y) }); break;
      }
      case 'intervalst': {
        const n = a('repeat') ?? 1, on = Math.round(a('onduration') ?? 0), off = Math.round(a('offduration') ?? 0);
        const onP = pct('onpower') ?? pct('poweronhigh') ?? pct('poweronlow')!, offP = pct('offpower') ?? pct('powerofflow') ?? pct('poweroffhigh')!;
        for (let i = 1; i <= n; i++) steps.push({ dur: on, from: onP, rep: [i, n] }, ...(off ? [{ dur: off, from: offP }] : []));
        break;
      }
      case 'freeride': steps.push({ dur, from: 50, free: true, label: 'Free ride' }); break;
      case 'maxeffort': steps.push({ dur, from: 150, free: true, label: 'Max effort' }); break;
    }
    // coach notes (<textevent timeoffset message>), placed on the step they fall in
    for (const te of el.querySelectorAll('textevent')) {
      let t = Number(te.getAttribute('timeoffset') ?? te.getAttribute('timeOffset')), msg = te.getAttribute('message')?.trim();
      if (!msg || !Number.isFinite(t)) continue;
      for (const st of steps.slice(first)) {
        if (t < st.dur) { (st.notes ??= []).push([t, msg]); break; }
        t -= st.dur;
      }
    }
  }
  const ok = steps.filter((s) => s.dur > 0 && Number.isFinite(s.from) && (s.to === undefined || Number.isFinite(s.to)));
  if (!ok.length) throw new Error('no steps found');
  const desc = root.parentElement?.querySelector(':scope > description')?.textContent?.trim().split('\n')[0] ?? '';
  return {
    id: `zwo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: doc.querySelector('workout_file > name')?.textContent?.trim() || fallbackName,
    who: desc.length > 70 ? desc.slice(0, 69) + '…' : desc || 'Imported',
    steps: ok,
  };
}

export function loadImported(): Workout[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function saveImported(ws: Workout[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ws)); } catch {}
}
