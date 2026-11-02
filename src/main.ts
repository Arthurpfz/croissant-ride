import { live, settings, reading, dropStale, beats } from './state';
import { workouts, totalDuration, type Workout } from './workouts';
import { createRide } from './engine';
import { route } from './world/route';
import { ROUTE, skinById, skins } from './world/packs';
import { createWorld } from './world/scene';
import { connectTrainer, trainer, setErg, setGrade, OBSERVE, useSimulator } from './trainer/trainer';
import { connectHr, hrStrap } from './ble/hr';
import { connectPowerMeter, powerMeter, measuresPower } from './ble/power';
import { rememberedDevices, type Sensor } from './ble/ble';
import { click, connectClick, lastPress } from './ble/click';
import * as units from './units';
import * as hud from './hud';
import * as rec from './recorder';
import * as audio from './audio';
import { summaryCharts } from './summary';
import { bindActions, all as allActions } from './actions';
import { services } from './post';
import { parseZwo, loadImported, saveImported } from './zwo';

const params = new URLSearchParams(location.search);
// demo: a visitor with no sensors picked a workout and chose to ride the simulator; leaving the ride leaves the demo
const DEMO = params.has('demo');
const SIM = DEMO || params.has('sim');
const DEMO_TAG = ' (demo)';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let wakeLock: WakeLockSentinel | null = null;
let refillFrom = 0; // power3s refills for a few seconds after a resume or trainer reconnect: no effort cues meanwhile
let downloaded = false;

const world = createWorld($<HTMLCanvasElement>('world'));
// the ride itself (clock, targets, ERG, spiral protection, pause) lives in engine.ts; this file is the screen around it
const ride = createRide({
  trainerLost: () => trainer.status === 'lost',
  erg: setErg,
  grade: setGrade,
  route: { gradeAt: (d) => route.gradeAt(d), elevAt: (d) => route.elevAt(d) }, // `route` changes with the world
  rec,
  beep: audio.beep,
  announce: (st) => audio.say(audio.describe(st, ride.offset)),
  banner: hud.banner,
});
const SKIN_KEY = 'world-skin'; // last skin picked
const savedSkin = () => { try { return localStorage.getItem(SKIN_KEY); } catch { return null; } };
world.show(ROUTE, skinById(savedSkin())); // start-screen backdrop

// --- start screen -----------------------------------------------------------
function sensorButton(id: string, sensor: Sensor, connect: (d?: BluetoothDevice) => Promise<BluetoothDevice>) {
  const btn = $(id);
  const label = btn.querySelector('span')!;
  sensor.onStatus = (s) => {
    btn.classList.toggle('on', s === 'connected');
    label.textContent = s === 'connected' ? sensor.name : s === 'connecting' ? 'connecting…' : s === 'lost' ? 'reconnecting…' : 'Tap to pair';
    renderDots();
  };
  btn.onclick = () => connect().catch((e) => { if (e.name !== 'NotFoundError') alert(e.message); });
}
if (!SIM && !navigator.bluetooth) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('no-bt').hidden = false;
  $('no-bt').textContent = ios
    ? 'iPhone and iPad browsers can’t connect to Bluetooth sensors. Use the Bluefy browser app, or ride from a Mac, PC or Android phone in Chrome.'
    : 'This browser can’t connect to Bluetooth sensors. Open this page in Chrome or Edge to pair your trainer.';
  $('no-bt').textContent += ' You can still pick a workout to try it in demo mode.';
}
sensorButton('c-trainer', trainer, connectTrainer);
sensorButton('c-hr', hrStrap, connectHr);
sensorButton('c-pm', powerMeter, connectPowerMeter);
sensorButton('c-click', click, connectClick);

// reconnect devices granted on a previous visit (no picker needed)
rememberedDevices().then(async (devs) => {
  for (const d of devs) {
    const tries = [connectTrainer, connectHr, connectPowerMeter, connectClick];
    for (const c of tries) { try { await c(d); break; } catch {} }
  }
});

// HUD chip: paired sensors, plus a "＋" for each unpaired one so a sensor can be added mid-ride
function renderDots() {
  const dot = (cls: string, n: string) => `<span><i class="dot ${cls}"></i>${n}</span>`;
  const sensor = (s: Sensor, n: string, chip: string) => (s.status === 'idle' ? `<button data-pair="${chip}" title="Pair ${n}">＋ ${n}</button>` : dot(s.status === 'connected' ? '' : 'wait', n));
  $('sensor-dots').innerHTML = SIM ? dot('ring', DEMO ? 'demo' : 'simulated') : [OBSERVE ? dot('ring', 'read-only') : '', sensor(trainer, 'trainer', 'c-trainer'), sensor(hrStrap, 'HR', 'c-hr'), sensor(powerMeter, 'cadence', 'c-pm'), click.status === 'idle' ? '' : sensor(click, 'remote', 'c-click')].join('');
}
$('sensor-dots').onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pair]');
  if (!b) return;
  b.blur(); // Space must keep pausing, not reopen the picker
  $(b.dataset.pair!).click(); // same pairing as the start screen (still inside the click, so the picker may open)
};

// live reading on each paired chip, to check a pairing before riding
setInterval(() => {
  if (ride.mode !== 'start') return;
  const show = (id: string, s: Sensor, v: string) => { $(id).querySelector('em')!.textContent = s.status === 'connected' ? v : ''; };
  show('c-trainer', trainer, `${Math.round(live.trainerPower)} W`);
  show('c-hr', hrStrap, `${live.hr} bpm`);
  show('c-pm', powerMeter, `${Math.round(live.cadence)} rpm`);
  show('c-click', click, lastPress && `${lastPress} pressed`);
}, 1000);

const ftpIn = $<HTMLInputElement>('s-ftp'), wIn = $<HTMLInputElement>('s-weight');
ftpIn.value = String(settings.ftp);
// weight shows in kg or lb (the switch next to it flips every unit); settings keep kg
const showWeight = () => { wIn.value = String(units.weight(settings.weight)); wIn.min = String(units.weight(40)); wIn.max = String(units.weight(150)); units.label(); };
showWeight();
$('s-units').onclick = () => { units.setImperial(!units.imperial); showWeight(); };
$('s-units').title = 'Switch units (kg, km/h, km, m ⇄ lb, mph, mi, ft)';
const wkg = () => { $('s-wkg').textContent = `${(settings.ftp / settings.weight).toFixed(2)} W/kg`; };
ftpIn.onchange = wIn.onchange = () => {
  settings.ftp = Number(ftpIn.value) || settings.ftp;
  settings.weight = units.toKg(Number(wIn.value)) || settings.weight;
  settings.save();
  wkg();
};
wkg();

// Imported sessions first (usually today's), then the built-ins, then free rides and the Import card.
const list = $('list'), zwoIn = $<HTMLInputElement>('zwo-file');
function card(name: string, sub: string, onclick: () => void, time = '') {
  const b = document.createElement('button');
  b.className = 'wo';
  const top = document.createElement('span'), t = document.createElement('strong'), e = document.createElement('em');
  top.className = 'wo-top';
  t.textContent = name; e.textContent = sub;
  top.append(t);
  if (time) top.append(Object.assign(document.createElement('time'), { textContent: time }));
  b.append(top, e);
  b.onclick = onclick;
  return b;
}
function renderList() {
  const imported = loadImported();
  const all = [...imported, ...workouts];
  list.replaceChildren(...[...all.filter(totalDuration), ...all.filter((w) => !totalDuration(w))].map((w) => {
    const T = totalDuration(w);
    const b = card(w.name, w.who, () => startRide(w), T ? hud.fmt(T) : '∞');
    if (T) {
      const cv = document.createElement('canvas');
      cv.width = 500; cv.height = 120;
      hud.drawProfile(cv, w);
      b.append(cv);
    } else b.classList.add('free');
    if (imported.includes(w)) {
      const x = document.createElement('span');
      x.className = 'wo-remove'; x.textContent = '✕'; x.title = 'Remove';
      x.onclick = (ev) => {
        ev.stopPropagation();
        if (confirm(`Remove "${w.name}"?`)) { saveImported(imported.filter((o) => o !== w)); renderList(); }
      };
      b.append(x);
    }
    return b;
  }), Object.assign(card('Import session', 'Zwift .zwo file, e.g. from TrainingPeaks: Export → ZWO', () => zwoIn.click()), { className: 'wo wo-import' }));
}
zwoIn.onchange = async () => {
  let imported = loadImported();
  for (const f of zwoIn.files ?? []) {
    try {
      const w = parseZwo(await f.text(), f.name.replace(/\.zwo$/i, ''));
      imported = [w, ...imported.filter((o) => o.name !== w.name)]; // re-importing a session replaces it
    } catch (e) { alert(`Couldn't import ${f.name}: ${(e as Error).message}`); }
  }
  saveImported(imported);
  zwoIn.value = '';
  renderList();
};
renderList();

const saved = DEMO ? null : rec.recover();
if (saved?.name.endsWith(DEMO_TAG)) rec.clearSaved(); // a demo tab closed mid-ride
else if (saved) {
  const box = $('recover');
  box.hidden = false;
  box.innerHTML = `<span>Unfinished ride found: <b>${saved.name}</b> (${hud.fmt(saved.samples.length)})</span>`;
  const up = document.createElement('button'); up.textContent = 'Finish it'; up.className = 'primary';
  up.onclick = () => { rec.load(saved); finish(); };
  const no = document.createElement('button'); no.textContent = 'Discard';
  no.onclick = () => { rec.clearSaved(); box.hidden = true; };
  box.append(up, no);
}

// --- ride --------------------------------------------------------------------
async function startRide(w: Workout) {
  if (!SIM && [trainer, hrStrap, powerMeter].every((s) => s.status === 'idle')) {
    if (confirm('No sensors connected. Continue in demo mode? The trainer, heart rate and rider will be simulated.')) location.search = `?demo=1&w=${encodeURIComponent(w.id)}`;
    return;
  }
  if (!SIM && trainer.status !== 'connected' && !(powerMeter.status === 'connected' && measuresPower)) {
    if (!confirm('No trainer or power meter connected. Ride anyway?')) return;
  }
  audio.unlock();
  const s = skinById(savedSkin());
  if (route.data !== ROUTE || world.skin !== s) world.show(ROUTE, s);
  rec.start(`Croissant Ride — ${w.name}${DEMO ? DEMO_TAG : ''}`);
  ride.start(w);
  $('start').hidden = true;
  $('hud').hidden = false;
  hud.refreshSteps();
  renderDots();
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}

function togglePause() {
  ride.togglePause();
  if (ride.mode === 'ride') refillFrom = performance.now();
  $('btn-pause').textContent = ride.mode === 'paused' ? 'Resume' : 'Pause';
}
function changeTarget(d: number) {
  ride.changeTarget(d);
  hud.refreshSteps();
}
function nextSkin() {
  const s = skins[(skins.indexOf(world.skin) + 1) % skins.length];
  try { localStorage.setItem(SKIN_KEY, s.id); } catch {}
  hud.banner(s.name, 2000);
  world.switchSkin(s);
}
const muteIcon = () => { $('btn-mute').classList.toggle('muted', audio.isMuted()); $('btn-mute').ariaPressed = String(audio.isMuted()); };
function toggleMute() {
  hud.banner(audio.toggleMute() ? 'Cues muted' : 'Cues on', 1500);
  muteIcon();
}
muteIcon();

function askEnd() {
  if (ride.mode === 'ride') togglePause();
  $('confirm').hidden = false;
}

// shortcuts popover (⌨ or ?): built from the action list, so a new key shows up by itself
const keyName = (k: string) => ({ ' ': 'Space', pageup: 'Page Up', pagedown: 'Page Down', arrowup: '↑', arrowdown: '↓' })[k.toLowerCase()] ?? k.toUpperCase();
function toggleKeys(show = $('keys').hidden) {
  if (show) {
    $('keys-list').innerHTML = Object.values(allActions()).filter((a) => a.keys.length)
      .map((a) => `<tr><td>${a.keys.map((k) => `<kbd>${keyName(k)}</kbd>`).join(' ')}</td><td>${a.label}</td></tr>`).join('');
  }
  $('keys').hidden = !show;
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleKeys(false); });
addEventListener('pointerdown', (e) => { if (!(e.target as Element).closest('#keys, #btn-keys')) toggleKeys(false); });

// Page Up/Down and B/. are what presentation clickers send, so a €15 clicker works as a handlebar remote
bindActions({
  pause: { label: 'Pause / resume', keys: [' '], button: '#btn-pause', run: togglePause },
  harder: { label: 'Target +10 W', keys: ['+', 'ArrowUp'], more: ['=', 'PageUp'], button: '[data-bias="1"]', run: () => changeTarget(10) },
  easier: { label: 'Target −10 W', keys: ['-', 'ArrowDown'], more: ['PageDown'], button: '[data-bias="-1"]', run: () => changeTarget(-10) },
  erg: { label: 'ERG ⇄ ride by feel for this step', keys: ['e'], more: ['b', '.'], button: '#btn-erg', run: ride.toggleErg },
  skip: { label: 'Skip step', keys: [], button: '#btn-skip', run: ride.skip },
  world: { label: 'Next world', keys: ['w'], button: '#btn-world', run: nextSkin },
  mute: { label: 'Mute audio cues', keys: ['m'], button: '#btn-mute', run: toggleMute },
  end: { label: 'End ride', keys: [], button: '#btn-end', run: askEnd },
  keys: { label: 'Show these shortcuts', keys: ['?'], button: '#btn-keys', run: () => toggleKeys() },
}, () => ride.mode === 'ride' || ride.mode === 'paused');
$('btn-resume').onclick = () => { $('confirm').hidden = true; togglePause(); };
// back to the start screen; a demo ends there, back in normal mode
const home = () => (DEMO ? location.assign(location.pathname) : location.reload());
$('btn-discard').onclick = () => { if (DEMO || confirm('Delete this ride?')) { rec.clearSaved(); ride.mode = 'start'; home(); } };
$('btn-finish').onclick = () => { $('confirm').hidden = true; finish(); };
$('btn-new').onclick = () => {
  if (!DEMO && !downloaded && !confirm('This ride hasn’t been downloaded or posted. Leave and delete it?')) return;
  rec.clearSaved();
  home();
};
// a reload or closed tab drops the BLE sensors: save, then ask first
addEventListener('beforeunload', (e) => {
  if (ride.mode !== 'ride' && ride.mode !== 'paused') return;
  rec.persist();
  e.preventDefault();
  e.returnValue = '';
});

// simulated sensors for testing without hardware. Console: `sim.mute.add('hr')` silences a metric,
// `sim.trainer.status = 'lost'` fakes a disconnect, `sim.powerMeter.status = 'connected'` adds a (miscalibrated) PM,
// `sim.world.renderer.info.memory` / `sim.rec.recording()` for checking skin switches, `sim.ride` = the ride engine.
const sim = { mute: new Set<string>(), trainer, hrStrap, powerMeter, world, rec, ride };
const simTrainer = SIM ? useSimulator(sim.mute) : null;
if (SIM) {
  Object.assign(window, { live, sim });
  hrStrap.name = 'Simulated'; hrStrap.status = 'connected'; hrStrap.onStatus?.('connected');
}
let simHr = 95, simBeat = 0;
// the simulated rider: pedals while riding; the trainer itself is simulated behind the trainer plug (trainer/sim.ts)
function simulate(dt: number) {
  const feed = (s: Sensor, k: Parameters<typeof reading>[1], v: number) => { if (!sim.mute.has(k)) reading(s, k, v); };
  simTrainer!.pedalling = ride.mode === 'ride';
  const p = simTrainer!.step();
  feed(powerMeter, 'pmPower', p * 0.3);
  if (powerMeter.status !== 'idle') feed(powerMeter, 'cadence', simTrainer!.pedalling ? 88 : 0); // a paired PM owns cadence
  simHr += ((95 + p * 0.3) - simHr) * dt / 25;
  feed(hrStrap, 'hr', Math.round(simHr));
  for (simBeat += dt * 1000; !sim.mute.has('hr') && simBeat >= 60000 / simHr; simBeat -= 60000 / simHr) {
    beats([Math.round(60000 / simHr + (Math.random() - 0.5) * 40)]);
  }
}

// Ride logic runs on a timer, not the render loop: Chrome pauses rAF for hidden windows,
// and background timers get throttled, so long gaps are integrated in small sub-steps.
let lastTick = performance.now();
const toWall = (perf: number) => perf - performance.now() + Date.now();
const recent: [number, number][] = []; // [power, dt] of the last 3 s, for the HUD
function tick() {
  const now = performance.now();
  let left = Math.min(120, (now - lastTick) / 1000);
  lastTick = now;
  while (left > 0) {
    const dt = Math.min(0.25, left);
    left -= dt;
    simStep(dt, toWall(now - left * 1000)); // wall-clock time of this sub-step
  }
}
// sensors → live power, then one engine step
function simStep(dt: number, wall: number) {
  if (SIM) simulate(dt);
  dropStale();
  // trainer power whenever a trainer was paired (it is what ERG regulates on), 0 while it is lost, never the
  // power meter's; power meter only without a trainer
  live.power = trainer.status !== 'idle' || powerMeter.status === 'idle' ? live.trainerPower : live.pmPower;
  recent.push([live.power, dt]);
  let span = recent.reduce((a, [, d]) => a + d, 0);
  while (span - recent[0][1] >= 3) span -= recent.shift()![1];
  live.power3s = recent.reduce((a, [p, d]) => a + p * d, 0) / span;
  ride.step(dt, wall);
}
setInterval(tick, 250);

let last = performance.now();
let menuDistance = 0;
let hudAcc = 0, legCad = 0, effort = 0;
function frame(now: number) {
  const real = (now - last) / 1000;
  const dt = Math.min(0.1, real); // 3D only — HUD smoothing needs real time, or slow frames make power lag
  last = now;
  hudAcc += real;
  const { mode, workout } = ride;
  if ((mode === 'ride' || mode === 'paused') && hudAcc >= 0.2) { // DOM + canvas redraws at 5 Hz, 3D at full rate
    const avg = live.elapsed ? (live.kj * 1000) / live.elapsed : 0;
    const { cur, target: t } = ride.target();
    const next = cur && workout.steps[cur.i + 1]; // 3-2-1 cue before each step change, beside the audio beep
    hud.update(workout, ride.wT, ride.offset, t, avg);
    if (mode === 'paused') $('cue').textContent = '⏸ Paused · Space to resume';
    else if (trainer.status === 'lost') { $('cue').textContent = '⚠ Trainer lost · reconnecting…'; refillFrom = now; }
    else if (cur && next && cur.left > 0 && cur.left <= 3) $('cue').textContent = `${Math.ceil(cur.left)} · Next ${hud.stepLabel(next, ride.offset)}`;
    else if (ride.spiral) $('cue').textContent = '⟳ Spin up to resume ERG';
    else if (ride.feel) $('cue').textContent = '〰 Riding by feel · E for ERG';
    else if (performance.now() - refillFrom < 5000 && /^[▲▼]/.test($('cue').textContent!)) $('cue').textContent = '';
    $<HTMLButtonElement>('btn-erg').disabled = t === null;
    $('btn-erg').textContent = ride.feel ? 'Back to ERG' : 'Ride by feel';
    hud.drawMinimap($<HTMLCanvasElement>('minimap'));
    hudAcc = 0;
  }
  const menu = mode === 'start';
  if (menu) menuDistance += 4 * dt; // gentle fly-by behind the menu
  // ride state advances at 4 Hz: extrapolate position since the last tick so the rider glides, and low-pass the 1 Hz sensors
  const ahead = mode === 'ride' && ride.rolling ? live.speed * Math.min(0.25, Math.max(0, now - lastTick) / 1000) : 0;
  const k = 1 - Math.exp(-dt / 0.6);
  // no cadence source (e.g. a trainer that reports none): legs still turn while there's power
  legCad += ((menu ? 70 : live.cadence || (live.power > 0 ? 85 : 0)) - legCad) * k;
  effort += (live.power / settings.ftp - effort) * k;
  world.render(dt, menu ? menuDistance : live.distance + ahead, legCad, menu ? 4 : live.speed, effort);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- finish: summary + hand the .FIT to the rider (no uploads from the app) -------------------
function finish() {
  ride.finish();
  wakeLock?.release().catch(() => {});
  rec.persist();
  const r = rec.recording();
  if (!r.samples.length) { home(); return; }
  const st = rec.stats();
  $('hud').hidden = true;
  $('start').hidden = true; // still up when finishing a recovered ride
  $('summary').hidden = false;
  $('sum-title').textContent = r.name.replace('Croissant Ride — ', '');
  const cells: [string, string, string][] = [
    [`${Math.floor(st.secs / 3600)}:${String(Math.floor((st.secs % 3600) / 60)).padStart(2, '0')}`, 'h', 'time'], [units.dist(st.distance), units.unit('dist'), 'distance'], [units.height(st.ascent), units.unit('height'), 'climbed'],
    [String(Math.round(st.avgPower)), 'W', 'avg power'], [String(Math.round(st.np)), 'W', 'normalized'], [st.tss.toFixed(0), '', 'TSS'],
    [st.avgHr ? String(Math.round(st.avgHr)) : '—', 'bpm', 'avg HR'], [st.maxHr ? String(st.maxHr) : '—', 'bpm', 'max HR'], [String(Math.round(st.kj)), 'kJ', 'work'],
  ];
  $('sum-grid').innerHTML = cells.map(([v, u, l]) => `<div><small>${l}</small><b>${v}<small>${u}</small></b></div>`).join('');
  summaryCharts(r.samples, settings.ftp);
  const fit = rec.toFit(r);
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([fit as BlobPart], { type: 'application/octet-stream' }));
    a.download = `${new Date(r.samples[0].t).toISOString().slice(0, 16).replace(/[:T]/g, '-')}-croissant-ride.fit`;
    a.click();
    rec.clearSaved();
    downloaded = true;
  };
  $('btn-download').onclick = download;
  const caption = [
    [$('sum-title').textContent, hud.fmt(st.secs), `${Math.round(st.avgPower)} W avg`, `${Math.round(st.np)} W NP`, `TSS ${st.tss.toFixed(0)}`, st.avgHr ? `${Math.round(st.avgHr)} bpm avg` : ''].filter(Boolean).join(' · '),
    `Ridden on Croissant Ride, a free trainer app in the browser → ${location.host}`,
  ].join('\n');
  // no APIs: download the file and open the service's own upload page
  $('post').append(...services.map((s) => {
    const b = document.createElement('button');
    b.textContent = s.name; b.title = s.hint;
    b.onclick = () => {
      if (s.caption) navigator.clipboard?.writeText(caption).catch(() => {}); // before the new tab takes focus
      open(s.url, '_blank', 'noopener');
      download();
      $('sum-note').textContent = s.hint;
    };
    return b;
  }));
}

// demo started from a workout pick: ride it right away (drop `w` so a reload doesn't restart it)
if (DEMO && params.has('w')) {
  const w = [...loadImported(), ...workouts].find((x) => x.id === params.get('w'));
  history.replaceState(null, '', '?demo=1');
  if (w) startRide(w);
}
