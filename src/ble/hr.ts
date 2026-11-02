import { connectSensor, subscribe, type Sensor } from './ble';
import { beats, reading } from '../state';

export const hrStrap: Sensor = { name: '', status: 'idle' };

// Straps send the odd junk value (57 bpm mid-interval, often right after contact returns). A jump of more than
// 25 bpm from the last good reading only counts once the next reading confirms it; a real change survives that.
let good = 0, held = -1e3;
function plausible(bpm: number) {
  if (good && Math.abs(bpm - good) > 25 && Math.abs(bpm - held) > 10) { held = bpm; return false; }
  good = bpm; held = -1e3;
  return true;
}

export const connectHr = (device?: BluetoothDevice) =>
  connectSensor(hrStrap, 'heart_rate', async (server) => {
    await subscribe(server, 'heart_rate', 'heart_rate_measurement', (v) => {
      const f = v.getUint8(0);
      // flag bits 1–2 = 0b10: strap supports contact detection but has no skin contact → reading is junk
      if ((f & 6) === 4) return reading(hrStrap, 'hr', 0);
      const bpm = f & 1 ? v.getUint16(1, true) : v.getUint8(1);
      if (!plausible(bpm)) return;
      reading(hrStrap, 'hr', bpm);
      // bit 4: RR intervals (1/1024 s) follow the HR value and the optional energy field (bit 3)
      if (!(f & 16)) return;
      const rr: number[] = [];
      for (let i = (f & 1 ? 3 : 2) + (f & 8 ? 2 : 0); i + 1 < v.byteLength; i += 2) rr.push(Math.round(v.getUint16(i, true) * 1000 / 1024));
      beats(rr);
    });
  }, device);
