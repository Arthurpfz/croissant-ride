// The trainer plug: one shape every trainer driver fills in, so the ride loop never knows which protocol it drives.
// Add a trainer = write a driver (see ftms.ts) and list it in `drivers`. Drivers only see real changes (deduplicated
// here), report readings through `io`, and never touch app state directly.
import { connectSensor, DEBUG, type Sensor } from '../ble/ble';
import { hrStrap } from '../ble/hr';
import { powerMeter } from '../ble/power';
import { reading } from '../state';
import { ftms } from './ftms';
import { simTrainer } from './sim';

export interface TrainerIO {
  power(watts: number): void;
  cadence(rpm: number): void;
  hr(bpm: number): void; // only used while no HR strap is paired
}
export interface TrainerControl {
  setErg(watts: number): void; // hold this power whatever the cadence
  setGrade(pct: number): void; // ride like this road gradient (free steps, Free Ride, ERG dropped or released)
}
export interface TrainerDriver extends TrainerControl {
  name: string;
  service: BluetoothServiceUUID; // GATT service that identifies the protocol; the picker lists devices with any driver's
  // subscribe to the trainer's data, and take control unless `control` is false (?observe=1)
  setup(server: BluetoothRemoteGATTServer, io: TrainerIO, control: boolean): Promise<void>;
}

const drivers: TrainerDriver[] = [ftms]; // first match wins

// ?observe=1 — read-only: never take control (lets another app keep driving the trainer)
export const OBSERVE = new URLSearchParams(location.search).has('observe');

export const trainer: Sensor = { name: '', status: 'idle' };
let active: TrainerControl | null = null;
let lastErg = -1;
let lastGrade = NaN;

const io: TrainerIO = {
  power: (w) => reading(trainer, 'trainerPower', Math.max(0, w)),
  cadence: (rpm) => { if (powerMeter.status === 'idle') reading(trainer, 'cadence', rpm); }, // a paired cadence sensor wins
  hr: (bpm) => { if (hrStrap.status === 'idle') reading(trainer, 'hr', bpm); },
};

export const connectTrainer = (device?: BluetoothDevice) =>
  connectSensor(trainer, drivers.map((d) => d.service), async (server) => {
    const have = new Set((await server.getPrimaryServices()).map((s) => s.uuid));
    const d = drivers.find((d) => have.has(BluetoothUUID.getService(d.service)));
    if (!d) throw new Error(`${trainer.name} speaks no supported trainer protocol`);
    lastErg = -1; lastGrade = NaN; // resend the current target after a reconnect
    await d.setup(server, io, !OBSERVE);
    active = d;
    if (DEBUG) console.info('trainer driver', d.name);
  }, device);

// ?sim=1: the simulated trainer goes through the same plug as a real one
export function useSimulator(mute: Set<string>) {
  const s = simTrainer(io, mute);
  active = s;
  trainer.name = 'Simulated';
  trainer.status = 'connected';
  trainer.onStatus?.('connected');
  return s;
}

export function setErg(watts: number) {
  const w = Math.round(watts);
  if (w === lastErg) return;
  lastErg = w; lastGrade = NaN;
  if (DEBUG) console.info('trainer erg', w, 'W');
  if (!OBSERVE) active?.setErg(w);
}

export function setGrade(pct: number) {
  if (Math.abs(pct - lastGrade) < 0.3) return;
  lastGrade = pct; lastErg = -1;
  if (DEBUG) console.info('trainer grade', pct.toFixed(1), '%');
  if (!OBSERVE) active?.setGrade(pct);
}
