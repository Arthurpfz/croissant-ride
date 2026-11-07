// Rider actions: the one list every input triggers. Keys, HUD buttons and the Zwift Click today; another remote
// (e.g. a phone, roadmap N23) only needs to call `press(id)`. What an action does is defined once, in main.ts.
export type ActionId = 'pause' | 'harder' | 'easier' | 'erg' | 'skip' | 'world' | 'mute' | 'end' | 'keys' | 'float';

export interface Action {
  label: string; // what it does, for the shortcuts popover
  keys: string[]; // KeyboardEvent.key values, case-insensitive; listed in the shortcuts popover
  more?: string[]; // also work, not listed (what presentation clickers send)
  button: string; // selector of its HUD button
  run(): void;
}

let actions: Partial<Record<ActionId, Action>> = {}, active = () => false;
export const trigger = (id: ActionId) => actions[id]?.run();
export const press = (id: ActionId) => { if (active()) trigger(id); }; // a remote's button: only during a ride
export const all = () => actions;

// `active` says whether rider actions apply right now (keys are ignored outside a ride and while typing)
export function bindActions(defs: Record<ActionId, Action>, isActive: () => boolean) {
  actions = defs;
  active = isActive;
  for (const [id, a] of Object.entries(defs) as [ActionId, Action][]) {
    for (const k of [...a.keys, ...(a.more ?? [])]) byKey.set(k.toLowerCase(), id);
    document.querySelectorAll<HTMLElement>(a.button).forEach((b) => (b.onclick = () => trigger(id)));
  }
  listenKeys(window);
}

const byKey = new Map<string, ActionId>();
function onKey(e: KeyboardEvent) {
  if (!active() || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).tagName === 'INPUT') return;
  const id = byKey.get(e.key.toLowerCase());
  if (!id) return;
  e.preventDefault();
  trigger(id);
}
// the same shortcuts in another window of this page (the floating mini window)
export const listenKeys = (w: Window) => w.addEventListener('keydown', onKey);
