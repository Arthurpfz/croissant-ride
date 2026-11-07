// Floating mini window (Document Picture-in-Picture, Chrome/Edge): the ride's essentials on top of every tab, for riding
// while watching something else. Big watts + target on the left; time left, heart rate, step progress and next step on
// the right. It only shows what main.ts hands it in update(); keys typed in it reach the same rider actions.
import { fmt, stepLabel, powerState } from './hud';
import { live } from './state';
import { listenKeys } from './actions';
import type { Step } from './workouts';

interface PipApi { requestWindow(o: { width: number; height: number }): Promise<Window> }
const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
export const supported = !!api;

let win: Window | null = null, closing = false;
let el: Record<'power' | 'target' | 'left' | 'hr' | 'bar' | 'next', HTMLElement>;

// onClosed(byUser): the window went away, by its ✕ (true) or by close() (false)
export async function open(onClosed: (byUser: boolean) => void) {
  if (win || !api) return;
  const w = await api.requestWindow({ width: 340, height: 150 }); // needs a click: Chrome only opens it on user activation
  for (const s of document.querySelectorAll('link[rel="stylesheet"], style')) w.document.head.append(s.cloneNode(true));
  w.document.title = 'Croissant Ride';
  w.document.body.className = 'mini';
  w.document.body.innerHTML = `
    <div class="mini-watts"><div><b id="m-power">0</b><small>W</small></div><span id="m-target"></span></div>
    <div class="mini-side">
      <div class="mini-row"><span id="m-left"></span><span id="m-hr"></span></div>
      <div class="bar"><div id="m-bar"></div></div>
      <span id="m-next"></span>
    </div>`;
  const $ = (id: string) => w.document.getElementById(id)!;
  el = { power: $('m-power'), target: $('m-target'), left: $('m-left'), hr: $('m-hr'), bar: $('m-bar'), next: $('m-next') };
  listenKeys(w);
  w.addEventListener('pagehide', () => { win = null; onClosed(!closing); closing = false; });
  win = w;
}

export function close() {
  if (!win) return;
  closing = true;
  win.close();
}
export const isOpen = () => !!win;

export interface MiniView {
  cur: { step: Step; into: number; left: number } | null; // the current step (null: free ride or finished)
  target: number | null; // ERG target in W, null on a free step
  next?: Step;
  offset: number;
  paused: boolean;
  lost: boolean; // trainer lost
}

const unit = (text: string) => Object.assign(document.createElement('small'), { textContent: text });

export function update({ cur, target, next, offset, paused, lost }: MiniView) {
  if (!win) return;
  const s = target !== null && cur ? powerState(target, cur.into) : '';
  el.power.textContent = String(Math.round(live.power3s));
  el.power.classList.toggle('off', s === 'low' || s === 'high');
  el.target.classList.toggle('off', lost && !paused);
  el.target.textContent = paused ? '⏸ Paused' : lost ? 'Trainer lost'
    : target === null || !cur ? (cur?.step.label ?? 'Free ride')
    : `@ ${Math.round(target)} W${cur.step.rep ? ` · ${cur.step.rep[0]}/${cur.step.rep[1]}` : ''}`;
  el.left.replaceChildren(cur ? fmt(cur.left) : fmt(live.elapsed), unit(cur ? 'left' : 'ridden'));
  el.hr.replaceChildren(live.hr ? String(live.hr) : '—', unit('bpm'));
  el.bar.style.width = cur ? `${(cur.into / cur.step.dur) * 100}%` : '0';
  el.next.replaceChildren(...(next ? [unit('next'), ` ${stepLabel(next, offset)}`] : []));
  el.next.classList.toggle('soon', !!(cur && next && cur.left <= 3)); // the 3-2-1 before a step change
}
