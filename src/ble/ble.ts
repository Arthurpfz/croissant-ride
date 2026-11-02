// Shared Web Bluetooth plumbing: pick or reuse a device, subscribe, auto-reconnect on drop.

// ?debug — log raw packets and control-point writes, expose GATT servers as window.gatt for console poking
export const DEBUG = new URLSearchParams(location.search).has('debug');
export const hex =(v: DataView) => [...new Uint8Array(v.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

export type Status = 'idle' | 'connecting' | 'connected' | 'lost';

export interface Sensor {
  name: string;
  status: Status;
  onStatus?: (s: Status) => void;
}

export async function connectSensor(
  sensor: Sensor,
  service: BluetoothServiceUUID | BluetoothServiceUUID[], // picker lists devices with any of these
  setup: (server: BluetoothRemoteGATTServer) => Promise<void>,
  device?: BluetoothDevice,
): Promise<BluetoothDevice> {
  const set = (s: Status) => { sensor.status = s; sensor.onStatus?.(s); };
  device ??= await navigator.bluetooth.requestDevice({
    filters: [service].flat().map((s) => ({ services: [s] })),
    optionalServices: [0x1826, 'cycling_power', 'cycling_speed_and_cadence', 'heart_rate'],
  });
  const dev = device;
  sensor.name = dev.name ?? 'device';
  const open = async () => {
    set('connecting');
    const server = await dev.gatt!.connect();
    if (DEBUG) ((window as any).gatt ??= {})[sensor.name] = server;
    await setup(server);
    set('connected');
  };
  dev.addEventListener('gattserverdisconnected', async () => {
    set('lost');
    for (let i = 0; i < 30 && !dev.gatt!.connected; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try { await open(); } catch { /* keep retrying */ }
    }
  });
  await open();
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
