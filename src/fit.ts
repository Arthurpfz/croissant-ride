// Minimal FIT activity writer (FIT protocol 2.0, little-endian), with only the messages and fields a ride needs.
// Our own code: Garmin's FIT SDK licence forbids redistributing the SDK under an open-source licence.
// Values go in as plain units (s, m, m/s, W, Date) and are scaled here.

type Base = 'enum' | 'u8' | 'u16' | 'u32' | 'u32z' | 'str';
const BASE: Record<Base, [id: number, size: number, invalid: number]> = {
  enum: [0x00, 1, 0xff], u8: [0x02, 1, 0xff], u16: [0x84, 2, 0xffff], u32: [0x86, 4, 0xffffffff], u32z: [0x8c, 4, 0], str: [0x07, 1, 0],
};
type Def = [num: number, base: Base, scale?: number, offset?: number];

// global message number + its fields (FIT profile numbers)
const TS: Def = [253, 'u32'], IDX: Def = [254, 'u16'], EV: Def = [0, 'enum'], EVT: Def = [1, 'enum'];
const MESGS = {
  fileId: [0, { type: [0, 'enum'], manufacturer: [1, 'u16'], product: [2, 'u16'], serialNumber: [3, 'u32z'], timeCreated: [4, 'u32'] }],
  deviceInfo: [23, { timestamp: TS, deviceIndex: [0, 'u8'], manufacturer: [2, 'u16'], product: [4, 'u16'], softwareVersion: [5, 'u16', 100], productName: [27, 'str'] }],
  event: [21, { timestamp: TS, event: EV, eventType: EVT }],
  record: [20, {
    timestamp: TS, power: [7, 'u16'], cadence: [4, 'u8'], heartRate: [3, 'u8'], speed: [6, 'u16', 1000], enhancedSpeed: [73, 'u32', 1000],
    distance: [5, 'u32', 100], altitude: [2, 'u16', 5, 500], enhancedAltitude: [78, 'u32', 5, 500],
  }],
  hrv: [78, { time: [0, 'u16', 1000] }], // array of RR intervals (s)
  lap: [19, {
    timestamp: TS, messageIndex: IDX, event: EV, eventType: EVT, startTime: [2, 'u32'], totalElapsedTime: [7, 'u32', 1000], totalTimerTime: [8, 'u32', 1000],
    totalDistance: [9, 'u32', 100], avgHeartRate: [15, 'u8'], maxHeartRate: [16, 'u8'], avgCadence: [17, 'u8'], avgPower: [19, 'u16'], maxPower: [20, 'u16'],
    totalAscent: [21, 'u16'], sport: [25, 'enum'], normalizedPower: [33, 'u16'], subSport: [39, 'enum'], totalWork: [41, 'u32'],
  }],
  session: [18, {
    timestamp: TS, messageIndex: IDX, event: EV, eventType: EVT, startTime: [2, 'u32'], sport: [5, 'enum'], subSport: [6, 'enum'],
    totalElapsedTime: [7, 'u32', 1000], totalTimerTime: [8, 'u32', 1000], totalDistance: [9, 'u32', 100], avgHeartRate: [16, 'u8'], maxHeartRate: [17, 'u8'],
    avgCadence: [18, 'u8'], avgPower: [20, 'u16'], maxPower: [21, 'u16'], totalAscent: [22, 'u16'], firstLapIndex: [25, 'u16'], numLaps: [26, 'u16'],
    normalizedPower: [34, 'u16'], trainingStressScore: [35, 'u16', 10], intensityFactor: [36, 'u16', 1000], thresholdPower: [45, 'u16'], totalWork: [48, 'u32'],
  }],
  activity: [34, { timestamp: TS, totalTimerTime: [0, 'u32', 1000], numSessions: [1, 'u16'], type: [2, 'enum'], event: [3, 'enum'], eventType: [4, 'enum'], localTimestamp: [5, 'u32'] }],
} satisfies Record<string, [number, Record<string, Def>]>;
type Mesg = keyof typeof MESGS;
type Value = number | number[] | string | Date;

// enum values used by recorder.ts
export const FIT = {
  file: { activity: 4 }, manufacturer: { development: 255 }, sport: { cycling: 2 }, subSport: { virtualActivity: 58 },
  event: { timer: 0, session: 8, lap: 9, activity: 26 }, eventType: { start: 0, stop: 1, stopAll: 4 }, activityType: { manual: 0 },
};
export const fitTime = (d: Date | number) => Math.round(+d / 1000) - 631065600; // s since 1989-12-31 UTC

const TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc(bytes: ArrayLike<number>, from = 0, to = bytes.length) {
  let c = 0;
  for (let i = from; i < to; i++) {
    for (const nib of [bytes[i] & 0xf, bytes[i] >> 4]) {
      const t = TABLE[c & 0xf];
      c = ((c >> 4) & 0x0fff) ^ t ^ TABLE[nib];
    }
  }
  return c;
}

export class FitWriter {
  private out: number[] = [];
  private locals: string[] = []; // definition signature per local message type (0–15)

  private int(v: number, size: number) { for (let i = 0; i < size; i++) this.out.push((v / 2 ** (8 * i)) & 0xff); }

  put(name: Mesg, values: Record<string, Value | undefined>) {
    const [global, defs] = MESGS[name] as [number, Record<string, Def>];
    const fields = Object.entries(values).filter(([, v]) => v !== undefined).map(([k, v]) => {
      const d = defs[k];
      if (!d) throw new Error(`FIT: no field ${name}.${k}`);
      const [, size] = BASE[d[1]];
      const bytes = typeof v === 'string' ? new TextEncoder().encode(v + '\0') : null;
      return { d, v: v!, size: bytes ? bytes.length : Array.isArray(v) ? v.length * size : size, bytes };
    });
    // a definition is written when this message's field layout differs from the last one sent for it
    const sig = `${global}:${fields.map((f) => `${f.d[0]}/${f.size}`).join(',')}`;
    const local = Object.keys(MESGS).indexOf(name);
    if (this.locals[local] !== sig) {
      this.locals[local] = sig;
      this.out.push(0x40 | local, 0, 0); // definition header, reserved, little-endian
      this.int(global, 2);
      this.out.push(fields.length);
      for (const f of fields) this.out.push(f.d[0], f.size, BASE[f.d[1]][0]);
    }
    this.out.push(local);
    for (const { d: [, base, scale = 1, offset = 0], v, bytes } of fields) {
      if (bytes) { this.out.push(...bytes); continue; }
      const [, n, invalid] = BASE[base];
      for (const x of Array.isArray(v) ? v : [v]) {
        const raw = x instanceof Date ? fitTime(x) : Math.round(((x as number) + offset) * scale);
        this.int(Number.isFinite(raw) && raw >= 0 && raw < 2 ** (8 * n) ? raw : invalid, n);
      }
    }
  }

  close() {
    const h = new Uint8Array(14);
    const data = this.out.length;
    // header size, protocol 2.0, profile version 21.32, data size, ".FIT"
    h.set([14, 0x20, 2132 & 0xff, 2132 >> 8, data & 0xff, (data >> 8) & 0xff, (data >> 16) & 0xff, data >>> 24, 0x2e, 0x46, 0x49, 0x54]);
    const hc = crc(h, 0, 12);
    h[12] = hc & 0xff; h[13] = hc >> 8;
    const file = new Uint8Array(14 + data + 2);
    file.set(h); file.set(this.out, 14);
    const c = crc(file, 0, 14 + data);
    file[14 + data] = c & 0xff; file[15 + data] = c >> 8;
    return file;
  }
}
