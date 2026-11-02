// Ride summary charts: power over the ride against the target steps, and time spent in each power zone.
import type { Sample } from './recorder';
import { zoneOf } from './workouts';
import { token } from './tokens';

const ZONES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂', 'Anaerobic'];
const $ = (id: string) => document.getElementById(id)!;
const two = (n: number) => String(Math.floor(n)).padStart(2, '0');
const ms = (s: number) => `${Math.floor(s / 60)}:${two(s % 60)}`;
const hm = (s: number) => `${Math.floor(s / 3600)}:${two((s % 3600) / 60)}`;

export function summaryCharts(s: Sample[], ftp: number) {
  const n = s.length;
  const zone = (w: number) => zoneOf((w / ftp) * 100);

  // time in zone (one sample = one second)
  const secs = [0, 0, 0, 0, 0, 0];
  for (const x of s) secs[zone(x.p) - 1]++;
  $('sum-zones').innerHTML = secs.map((v, i) =>
    `<div><span>Z${i + 1}</span><span>${ZONES[i]}</span><span class="zbar"><i style="width: ${((v / n) * 100).toFixed(1)}%; --c: var(--zone-${i + 1})"></i></span><span>${ms(v)}</span></div>`).join('');

  // power line: mean of each bucket, ≤ ~400 points
  const b = Math.max(5, Math.ceil(n / 400));
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i += b) {
    const g = s.slice(i, i + b);
    pts.push([i + g.length / 2, g.reduce((a, x) => a + x.p, 0) / g.length]);
  }
  // target steps: runs of the same target, one filled path per zone
  const runs: [number, number, number][] = [];
  s.forEach((x, i) => {
    if (x.tg == null) return;
    const last = runs.at(-1);
    if (last && last[1] === i && last[2] === x.tg) last[1] = i + 1;
    else runs.push([i, i + 1, x.tg]);
  });
  const top = Math.max(...pts.map(([, w]) => w), ...runs.map(([, , w]) => w));
  const ymax = Math.max(100, Math.ceil((top * 1.05) / 100) * 100);
  const step = ymax > 400 ? 200 : 100;
  const ticks = Array.from({ length: ymax / step + 1 }, (_, k) => k * step);
  const y = (w: number) => (ymax - w).toFixed(1);
  const blocks = ['', '', '', '', '', ''];
  for (const [a, e, w] of runs) blocks[zone(w) - 1] += `M${a} ${ymax}V${y(w)}H${e}V${ymax}Z`;

  const svg = $('sum-chart');
  svg.setAttribute('viewBox', `0 0 ${n} ${ymax}`);
  svg.innerHTML =
    ticks.map((v) => `<line x1="0" x2="${n}" y1="${y(v)}" y2="${y(v)}" stroke="${token('line')}" vector-effect="non-scaling-stroke" />`).join('') +
    blocks.map((d, i) => (d ? `<path d="${d}" fill="${token(`zone-${i + 1}`)}" fill-opacity=".3" />` : '')).join('') +
    `<path d="${pts.map(([x, w], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y(w)}`).join('')}" fill="none" stroke="${token('accent')}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`;
  svg.setAttribute('aria-label', `Power over the ride, average ${Math.round(s.reduce((a, x) => a + x.p, 0) / n)} watts${runs.length ? ', against the target steps' : ''}`);
  $('sum-y').innerHTML = ticks.map((v) => `<span style="top: ${(1 - v / ymax) * 100}%">${v}</span>`).join('');
  $('sum-x').innerHTML = [0, 1, 2, 3, 4].map((k) => `<span>${(n < 3600 ? ms : hm)(Math.round((n * k) / 4))}</span>`).join('');
  $('sum-tgt-key').style.display = runs.length ? '' : 'none';
}
