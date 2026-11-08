// FTMS (Fitness Machine Service, 0x1826), the standard most current smart trainers speak: reads Indoor Bike Data,
// ERG = Set Target Power (0x05), gradient = Indoor Bike Simulation (0x11).
import { subscribe, uuid, DEBUG, hex } from '../ble/ble';
import { crankCadence, cpsCrank, cscCrank } from '../ble/power';
import type { TrainerDriver, TrainerIO } from './trainer';

const FTMS = 0x1826;
const BIKE_DATA = 0x2ad2;
const CONTROL = 0x2ad9;

let control: BluetoothRemoteGATTCharacteristic | undefined;
let queue = Promise.resolve();
let ftmsCadence = false;

// GATT allows one operation at a time: serialize every control-point write.
function write(bytes: number[]) {
  if (DEBUG) console.info('ftms control', hex(new DataView(new Uint8Array(bytes).buffer)));
  if (!control) return;
  const c = control;
  queue = queue.then(() => c.writeValueWithResponse(new Uint8Array(bytes))).catch(() => {});
}

export function parseBikeData(v: DataView, io: TrainerIO) {
  const f = v.getUint16(0, true);
  let o = 2;
  if (!(f & 1)) o += 2; // instantaneous speed (ignored: we use virtual speed)
  if (f & 2) o += 2;
  if (f & 4) { ftmsCadence = true; io.cadence(v.getUint16(o, true) / 2); o += 2; }
  if (f & 8) o += 2;
  if (f & 16) o += 3;
  if (f & 32) o += 2;
  if (f & 64) { io.power(v.getInt16(o, true)); o += 2; }
  if (f & 128) o += 2;
  if (f & 256) o += 5;
  if (f & 512) io.hr(v.getUint8(o));
}

export const ftms: TrainerDriver = {
  name: 'FTMS',
  service: FTMS,
  async setup(server, io, takeControl) {
    const svc = await server.getPrimaryService(uuid(FTMS));
    control = takeControl ? await svc.getCharacteristic(uuid(CONTROL)) : undefined;
    await control?.startNotifications(); // indications required before writes on most trainers
    queue = Promise.resolve();
    write([0x00]); // request control
    write([0x07]); // start/resume
    await subscribe(server, FTMS, BIKE_DATA, (v) => parseBikeData(v, io));
    // Some trainers (e.g. Van Rysel D100) only report cadence via Cycling Power or CSC crank data
    const cad = crankCadence(io.cadence);
    const use = (c: [number, number] | null) => { if (c && !ftmsCadence) cad(...c); };
    for (const [svc, ch, parse] of [
      ['cycling_power', 'cycling_power_measurement', cpsCrank],
      ['cycling_speed_and_cadence', 'csc_measurement', cscCrank],
    ] as const) {
      try { await subscribe(server, svc, ch, (v) => use(parse(v))); console.info('trainer exposes', svc); } catch {}
    }
  },
  setErg(w) {
    write([0x05, w & 0xff, (w >> 8) & 0xff]);
  },
  setGrade(pct) {
    const g = Math.round(pct * 100); // 0.01 %
    // wind 0, grade, Crr 0.004 (×0.0001), Cw 0.51 kg/m (×0.01)
    write([0x11, 0, 0, g & 0xff, (g >> 8) & 0xff, 40, 51]);
  },
};
