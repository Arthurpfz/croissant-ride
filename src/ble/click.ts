// Zwift Click (the original one-pod remote, on firmware without encryption) as a handlebar remote: + / − = target ±10 W.
// Protocol facts from public notes (makinolo.com); our own code. Controllers that only talk over an encrypted link
// (Click v2, old firmware) are refused on purpose: getting around their lock breaks Zwift's terms (vault: roadmap N23).
import { connectSensor, subscribe, uuid, DEBUG, hex, ZWIFT_SERVICES, type Sensor } from './ble';
import { press, type ActionId } from '../actions';

export const click: Sensor = { name: '', status: 'idle' };
export let lastPress = ''; // shown on the start-screen chip, to check the pairing

const ZWIFT_ID = 0x094a; // Bluetooth company ID in the controllers' advertising
const KEYPAD = 0x37; // Click button status: protobuf, field 1 = plus, field 2 = minus; 0 = pressed, 1 = released
const BUTTONS: Record<number, [ActionId, string]> = { 1: ['harder', '＋'], 2: ['easier', '−'] };
const RIDE_ON = new TextEncoder().encode('RideOn');

// protobuf varint fields of a message (other wire types skipped)
function fields(v: DataView, o: number) {
  const out = new Map<number, number>();
  const varint = () => { let x = 0, s = 0, b; do { b = v.getUint8(o++); x |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return x; };
  while (o < v.byteLength) {
    const tag = varint();
    if ((tag & 7) === 0) out.set(tag >> 3, varint());
    else if ((tag & 7) === 2) o += varint();
    else break;
  }
  return out;
}

export const connectClick = (device?: BluetoothDevice) =>
  connectSensor(click, [{ manufacturerData: [{ companyIdentifier: ZWIFT_ID }] }, { namePrefix: 'Zwift Click' }], async (server) => {
    let svc: BluetoothRemoteGATTService | undefined;
    for (const u of ZWIFT_SERVICES) svc ??= await server.getPrimaryService(uuid(u)).catch(() => undefined);
    if (!svc) throw new Error('Not a Zwift controller');
    // by property, so both service layouts work: notify = button messages, indicate = replies, write = commands
    const chars = await svc.getCharacteristics();
    const by = (f: (p: BluetoothCharacteristicProperties) => boolean) => chars.find((c) => f(c.properties));
    const data = by((p) => p.notify), reply = by((p) => p.indicate && !p.write), cmd = by((p) => (p.write || p.writeWithoutResponse) && !p.indicate);
    if (!data || !reply || !cmd) throw new Error('Not a Zwift controller');

    // greeting: "RideOn" back means a plain link; a reply carrying a key means the encrypted one, which we don't do
    const answer = new Promise<DataView | null>((r) => { reply.addEventListener('characteristicvaluechanged', () => r(reply.value!), { once: true }); setTimeout(() => r(null), 3000); });
    await reply.startNotifications();
    const held = new Set<number>();
    await subscribe(server, svc.uuid, data.uuid, (v) => {
      if (v.getUint8(0) !== KEYPAD) return; // idle and battery messages
      for (const [f, val] of fields(v, 1)) {
        const b = BUTTONS[f];
        if (!b) continue;
        if (val === 0 && !held.has(f)) { held.add(f); lastPress = b[1]; press(b[0]); }
        if (val !== 0) held.delete(f);
      }
    });
    await cmd.writeValue(RIDE_ON);
    const a = await answer;
    if (DEBUG) console.info('click', 'reply', a ? hex(a) : 'none');
    if (a && a.byteLength > RIDE_ON.length + 2) {
      server.disconnect();
      throw new Error('This Zwift controller only works over Zwift’s encrypted link, which Croissant Ride doesn’t support (Zwift’s terms forbid getting around it). The original Zwift Click works.');
    }
  }, device);
