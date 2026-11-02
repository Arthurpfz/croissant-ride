// Display units. Everything is stored and recorded in metric (settings, samples, FIT); only what the rider sees changes.
// Default: imperial for a US browser (US English *and* an American time zone: many Europeans run en-US), metric
// elsewhere; the kg ⇄ lb switch on the start screen sets all units and is remembered (localStorage `units`).
// Power stays W and W/kg everywhere.
const LB = 2.20462, MI = 1609.344, FT = 3.28084;

function inUS() {
  try {
    return new Intl.Locale(navigator.language).maximize().region === 'US' && /^(America|Pacific)\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch { return false; }
}
export let imperial = (() => {
  try { const u = localStorage.getItem('units'); if (u) return u === 'imperial'; } catch {}
  return inUS();
})();

export function setImperial(on: boolean) {
  imperial = on;
  try { localStorage.setItem('units', on ? 'imperial' : 'metric'); } catch {}
  label();
}

export const unit = (k: 'speed' | 'dist' | 'height' | 'weight') =>
  ({ speed: ['km/h', 'mph'], dist: ['km', 'mi'], height: ['m', 'ft'], weight: ['kg', 'lb'] })[k][+imperial];
export const speed = (ms: number) => (ms * (imperial ? 3600 / MI : 3.6)).toFixed(0);
export const dist = (m: number) => (m / (imperial ? MI : 1000)).toFixed(1);
export const height = (m: number) => (m * (imperial ? FT : 1)).toFixed(0);
export const weight = (kg: number) => (imperial ? Math.round(kg * LB) : kg);
export const toKg = (v: number) => (imperial ? Math.round((v / LB) * 10) / 10 : v);

// static unit labels in the page: <small data-unit="speed">
export function label() {
  document.querySelectorAll<HTMLElement>('[data-unit]').forEach((e) => (e.textContent = unit(e.dataset.unit as never) + (e.dataset.suffix ?? '')));
}
