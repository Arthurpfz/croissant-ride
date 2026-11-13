// HUD rendering: workout panel, live data, cues, workout graph, minimap.
import { live, settings } from './state';
import { at, totalDuration, zoneColor, watts, type Workout, type Step } from './workouts';
import { route, type Route } from './world/route';
import { mapPhotoOf } from './world/packs';
import { token } from './tokens';
import { speed, dist, height } from './units';

const $ = (id: string) => document.getElementById(id)!;
export const fmt = (s: number) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`;
};
const dur = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);

export function stepLabel(st: Step, offset: number) {
  if (st.label && st.to === undefined && st.free) return `${dur(st.dur)} ${st.label}`;
  const w = st.to === undefined ? `${watts(st.from, offset)} W` : `${watts(st.from, offset)}→${watts(st.to, offset)} W`;
  return `${st.label && st.to !== undefined ? st.label + ' ' : ''}${dur(st.dur)} @ ${w}${st.cad ? ` · ${st.cad} rpm` : ''}`;
}

export function drawProfile(cv: HTMLCanvasElement, w: Workout, progress?: number) {
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height, T = totalDuration(w) || 1;
  g.clearRect(0, 0, W, H);
  const max = 160;
  let t = 0;
  for (const st of w.steps) {
    const x0 = (t / T) * W, x1 = ((t + st.dur) / T) * W;
    const a = Math.min(st.from, max) / max * H, b = Math.min(st.to ?? st.from, max) / max * H;
    g.fillStyle = zoneColor(((st.from + (st.to ?? st.from)) / 2));
    g.beginPath(); g.moveTo(x0, H); g.lineTo(x0, H - a); g.lineTo(x1, H - b); g.lineTo(x1, H); g.fill();
    t += st.dur;
  }
  if (progress !== undefined) {
    const x = (progress / T) * W;
    g.globalCompositeOperation = 'destination-out'; // steps still to come fade back
    g.fillStyle = token('graph-ahead'); g.fillRect(x, 0, W - x, H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = token('graph-marker'); g.fillRect(x - 2, 0, 4, H);
  }
}

// live power against the target: the HUD's state chip and the mini window's red watts use the same rule
export function powerState(target: number, into: number): 'low' | 'ok' | 'high' | '' {
  if (into <= 5) return '';
  const r = live.power3s / target;
  return r < 0.9 ? 'low' : r > 1.1 ? 'high' : 'ok';
}

let shownWorkout: Workout | null = null;
let shownStep = -2;
export const refreshSteps = () => { shownStep = -2; };

export function update(w: Workout, wT: number, offset: number, target: number | null, avgPower: number) {
  const T = totalDuration(w);
  const cur = at(w, wT);
  const idx = cur?.i ?? -1;

  if (shownWorkout !== w) { shownWorkout = w; $('w-name').textContent = w.name; shownStep = -2; }
  $('w-finish').innerHTML = !T ? 'Free ride' : cur ? `Finish in <b>${fmt(T - wT)}</b>` : 'Workout complete ✓';
  ($('w-progress') as HTMLElement).style.width = `${T ? Math.min(100, (wT / T) * 100) : 0}%`;
  $('w-bias').textContent = offset ? `${offset > 0 ? '+' : '−'}${Math.abs(offset)} W` : '±0 W';

  if (idx !== shownStep) {
    shownStep = idx;
    const list = $('w-steps');
    list.innerHTML = '';
    if (idx >= 0) {
      w.steps.slice(idx, idx + 4).forEach((st, k) => {
        const li = document.createElement('li');
        li.className = k === 0 ? 'now' : '';
        li.innerHTML = `<span>${stepLabel(st, offset)}</span><span>${st.rep ? `${st.rep[0]} of ${st.rep[1]}` : ''}</span>`;
        list.append(li);
      });
    }
  }
  drawProfile($('w-graph') as HTMLCanvasElement, w, Math.min(wT, T));
  $('workout').hidden = !T;

  // live data
  $('d-speed').textContent = speed(live.speed);
  $('d-dist').textContent = dist(live.distance);
  $('d-ascent').textContent = height(live.ascent);
  $('d-time').textContent = fmt(live.elapsed);
  $('d-power').textContent = Math.round(live.power3s).toString();
  $('d-hr').textContent = live.hr ? String(live.hr) : '—';
  $('d-avg').textContent = Math.round(avgPower).toString();
  $('d-kj').textContent = Math.round(live.kj).toString();

  const cad = `<b>${Math.round(live.cadence)}</b>${cur?.step.cad ? ` / ${cur.step.cad}` : ''} rpm`; // live / target
  const state = $('d-state');
  let s: 'low' | 'ok' | 'high' | '' = '', cue = '';
  if (cur && target !== null) {
    $('d-target').innerHTML = `Target <b>${Math.round(target)} W</b> · ${Math.round((target / settings.ftp) * 100)}% FTP · ${cad}`;
    s = powerState(target, cur.into);
    if (s) {
      const r = live.power3s / target;
      cue = r < 0.85 ? '▲ Pick it up' : r > 1.15 ? '▼ Settle in' : '';
    }
  } else $('d-target').innerHTML = cad;
  state.className = `state ${s}`;
  state.textContent = s && { low: 'Under', ok: 'On target', high: 'Over' }[s];
  if (cur?.step.free) cue = cur.step.label ? `⚡ ${cur.step.label}` : '';
  const note = cur?.step.notes?.findLast(([o]) => cur.into >= o && cur.into < o + 10);
  if (note) cue = `💬 ${note[1]}`;
  $('cue').textContent = cue;
  ($('d-step-bar') as HTMLElement).style.width = cur ? `${(cur.into / cur.step.dur) * 100}%` : '0';
  $('d-step-left').innerHTML = cur ? `${cur.step.rep ? `Interval ${cur.step.rep[0]}/${cur.step.rep[1]} · ` : ''}<b>${fmt(cur.left)}</b> left` : '';
}

export function banner(text: string, ms = 2500) {
  const b = $('banner');
  b.textContent = text;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), ms);
}

// minimap of the active route, centred, north up (bounds cached per route); over the route's aerial photo if a skin loaded one
let boxFor: Route | undefined, minX = 0, minZ = 0, span = 1;
export function drawMinimap(cv: HTMLCanvasElement) {
  const { samples } = route;
  if (boxFor !== route) {
    const xs = samples.map((s) => s.x), zs = samples.map((s) => s.z);
    span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    minX = (Math.min(...xs) + Math.max(...xs) - span) / 2; minZ = (Math.min(...zs) + Math.max(...zs) - span) / 2;
    boxFor = route;
  }
  const g = cv.getContext('2d')!;
  const S = cv.width, pad = 18, k = (S - pad * 2) / span;
  const P = (x: number, z: number) => [pad + (x - minX) * k, pad + (z - minZ) * k];
  g.clearRect(0, 0, S, S);
  const photo = mapPhotoOf(route.data);
  if (photo?.image) {
    const px = photo.image.width / ((photo.nx - 1) * photo.cell); // photo pixels per metre
    g.save();
    g.beginPath(); g.roundRect(0, 0, S, S, parseFloat(token('radius-panel')) * (S / cv.clientWidth)); g.clip();
    g.drawImage(photo.image, (minX - pad / k - photo.x0) * px, (minZ - pad / k - photo.z0) * px, (S / k) * px, (S / k) * px, 0, 0, S, S);
    g.fillStyle = token('map-shade'); g.fillRect(0, 0, S, S);
    g.restore();
  }
  g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath();
  samples.forEach((s, i) => {
    const [x, y] = P(s.x, s.z);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  if (!route.data.oneWay) g.closePath();
  g.strokeStyle = token('map-route'); g.stroke();
  const i = Math.floor(route.frac(live.distance) * samples.length) % samples.length;
  g.beginPath(); // the part of this lap already ridden
  for (let k = 0; k <= i; k++) {
    const [x, y] = P(samples[k].x, samples[k].z);
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.lineCap = 'round'; g.strokeStyle = token('map-done'); g.stroke();
  const [x, y] = P(samples[i].x, samples[i].z);
  g.fillStyle = token('map-rider'); g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = token('map-rider-ring'); g.lineWidth = 3; g.stroke();
}
