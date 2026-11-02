// Optional cadence source: a crank power meter (Cycling Power; its power only counts without a trainer) or a cadence sensor (CSC).
// Also exports the crank-revolution → rpm helpers trainers use when FTMS data carries no cadence.
import { connectSensor, subscribe, type Sensor } from './ble';
import { reading } from '../state';

export const powerMeter: Sensor = { name: '', status: 'idle' };

// only a new crank revolution counts as a reading, so cadence drops to 0 after 3 s without one
export function crankCadence(out: (rpm: number) => void) {
  let lastRevs = -1, lastTime = 0;
  return (revs: number, time: number) => {
    if (lastRevs >= 0 && revs !== lastRevs) {
      const dt = ((time - lastTime + 65536) % 65536) / 1024;
      if (dt > 0) out((((revs - lastRevs + 65536) % 65536) / dt) * 60);
    }
    lastRevs = revs; lastTime = time;
  };
}

// Cycling Power Measurement → [crank revs, last crank event time] if present
export function cpsCrank(v: DataView): [number, number] | null {
  const f = v.getUint16(0, true);
  if (!(f & 32)) return null;
  let o = 4;
  if (f & 1) o += 1;
  if (f & 4) o += 2;
  if (f & 16) o += 6;
  return [v.getUint16(o, true), v.getUint16(o + 2, true)];
}

// CSC Measurement → [crank revs, last crank event time] if present
export function cscCrank(v: DataView): [number, number] | null {
  const f = v.getUint8(0);
  if (!(f & 2)) return null;
  const o = f & 1 ? 7 : 1;
  return [v.getUint16(o, true), v.getUint16(o + 2, true)];
}

export let measuresPower = false; // false for a cadence-only sensor

// "Cadence" slot: a power meter (Cycling Power) or a plain cadence sensor (CSC)
export const connectPowerMeter = (device?: BluetoothDevice) =>
  connectSensor(powerMeter, ['cycling_power', 'cycling_speed_and_cadence'], async (server) => {
    const cad = crankCadence((rpm) => reading(powerMeter, 'cadence', rpm));
    try {
      await subscribe(server, 'cycling_power', 'cycling_power_measurement', (v) => {
        reading(powerMeter, 'pmPower', Math.max(0, v.getInt16(2, true)));
        const c = cpsCrank(v);
        if (c) cad(...c);
      });
      measuresPower = true;
    } catch {
      measuresPower = false;
      await subscribe(server, 'cycling_speed_and_cadence', 'csc_measurement', (v) => {
        const c = cscCrank(v);
        if (c) cad(...c);
      });
    }
  }, device);
