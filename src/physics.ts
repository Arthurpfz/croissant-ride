// Virtual speed from power — drag/rolling model calibrated against a real outdoor race (CdA .32, Crr .005).
import { settings } from './state';

const CDA = 0.32, CRR = 0.005, RHO = 1.2, G = 9.81, BIKE = 9;

export function step(v: number, power: number, gradePct: number, dt: number) {
  const m = settings.weight + BIKE;
  const theta = Math.atan(gradePct / 100);
  const resist = m * G * (CRR * Math.cos(theta) + Math.sin(theta)) + 0.5 * RHO * CDA * v * v;
  const drive = power / Math.max(v, 1); // avoids infinite force from standstill
  const nv = v + ((drive - resist) / m) * dt;
  return Math.max(0, power === 0 && nv < 0.3 ? 0 : nv);
}
