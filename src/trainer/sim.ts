// Simulated trainer for ?sim=1: holds ERG targets almost perfectly; on a gradient (free steps, Free Ride, ERG dropped)
// the simulated rider pushes ~190 W. Puts out nothing while the rider isn't pedalling. `mute` silences a metric.
import type { TrainerControl, TrainerIO } from './trainer';

export interface SimTrainer extends TrainerControl {
  pedalling: boolean;
  step(): number; // called every ride sub-step; returns the power put out (even when muted)
}

export function simTrainer(io: TrainerIO, mute: Set<string>): SimTrainer {
  let erg: number | null = null;
  return {
    pedalling: false,
    setErg(w) { erg = w; },
    setGrade() { erg = null; },
    step() {
      const now = performance.now();
      const p = this.pedalling ? Math.max(0, (erg ?? 190) + Math.sin(now / 700) * 6 + (Math.random() - 0.5) * 10) : 0;
      if (!mute.has('trainerPower')) io.power(p);
      if (!mute.has('cadence')) io.cadence(this.pedalling ? 88 + Math.sin(now / 3000) * 3 : 0);
      return p;
    },
  };
}
