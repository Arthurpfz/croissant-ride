// Shared Web Bluetooth plumbing: pick or reuse a device, subscribe, auto-reconnect on drop.

// ?debug — log raw packets and control-point writes, expose GATT servers as window.gatt for console poking
export const DEBUG = new URLSearchParams(location.search).has('debug');
export const hex =(v: DataView) => [...new Uint8Array(v.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

// Zwift controllers' own service: the 128-bit one, and the 16-bit one newer Ride firmware moved to
export const ZWIFT_SERVICES: BluetoothServiceUUID[] = ['00000001-19ca-4651-86e5-fa29dcdd09d1', 0xfc82];

export type Status = 'idle' | 'connecting' | 'connected' | 'lost';

export interface Sensor {
  name: string;
  status: Status;
  onStatus?: (s: Status) => void;
}

export async function connectSensor(
  sensor: Sensor,
  service: BluetoothServiceUUID | BluetoothServiceUUID[] | BluetoothLEScanFilter[], // picker lists devices with any of these services (or matching these filters)
  setup: (server: BluetoothRemoteGATTServer) => Promise<void>,
  device?: BluetoothDevice,
): Promise<BluetoothDevice> {
  const set = (s: Status) => { sensor.status = s; sensor.onStatus?.(s); };
  device ??= await navigator.bluetooth.requestDevice({
    filters: [service].flat().map((s) => (typeof s === 'object' ? s : { services: [s] })),
    optionalServices: [0x1826, 'cycling_power', 'cycling_speed_and_cadence', 'heart_rate', ...ZWIFT_SERVICES],
  });
  const dev = device;
  sensor.name = dev.name ?? 'device';
  let ever = false; // only a device that once worked is reconnected
  const open = async () => {
    set('connecting');
    const server = await dev.gatt!.connect();
    if (DEBUG) ((window as any).gatt ??= {})[sensor.name] = server;
    await setup(server);
    set('connected');
    ever = true;
  };
  dev.addEventListener('gattserverdisconnected', async () => {
    if (!ever) return;
    set('lost');
    for (let i = 0; i < 30 && !dev.gatt!.connected; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try { await open(); } catch { /* keep retrying */ }
    }
  });
  try { await open(); } catch (e) { if (!ever) set('idle'); throw e; }
  return dev;
}

// Devices this origin was granted before (Chrome), so a reload doesn't need the picker again.
export async function rememberedDevices(): Promise<BluetoothDevice[]> {
  try { return (await navigator.bluetooth.getDevices?.()) ?? []; } catch { return []; }
}

export async function subscribe(
  server: BluetoothRemoteGATTServer,
  service: BluetoothServiceUUID,
  char: BluetoothCharacteristicUUID,
  onData: (v: DataView) => void,
) {
  const c = await (await server.getPrimaryService(service)).getCharacteristic(char);
  let n = 0;
  c.addEventListener('characteristicvaluechanged', () => {
    if (DEBUG && n++ % 20 < 2) console.info('ble', String(char), hex(c.value!));
    onData(c.value!);
  });
  await c.startNotifications();
  return c;
}
