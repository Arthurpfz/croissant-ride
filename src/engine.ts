// Ride engine: workout clock, targets, ERG/SIM switching, spiral protection, pause. No DOM and no Bluetooth:
// the screen (main.ts) passes in the trainer, recorder, route and cue outputs, so the engine also runs headless.
import { live } from './state';
import { at, watts, totalDuration, type Step, type Workout } from './workouts';
import { step as physics } from './physics';

export type Mode = 'start' | 'ride' | 'paused' | 'done';

export interface RideIO {
  trainerLost(): boolean; // the workout clock holds while it is
  erg(watts: number): void;
  grade(pct: number): void;
  route: { gradeAt(d: number): number; elevAt(d: number): number };
  rec: { add(dt: number, wall: number, target: number | null): void; lap(): void; pause(): void; resume(): void };
  beep(): void;
  announce(step: Step | undefined): void; // the step starting next; undefined = none left
  banner(text: string, ms: number): void;
}

export function createRide(io: RideIO) {
  let gradeTimer = 0, lowCad = 0, under = 0;
  let stepIdx = -1, doneAt = -1;
  let cued = -1; // last step whose start was announced

  const ride = {
    mode: 'start' as Mode,
    workout: { id: '', name: '', who: '', steps: [] } as Workout,
    wT: 0, // workout clock
    offset: 0, // W added to every target (−/+ in 10 W steps)
    rolling: false, // clock starts on first pedal stroke
    feel: false, // ERG dropped by the rider for the current step
    spiral: false, // ERG released by spiral protection

    start(w: Workout) {
      Object.assign(ride, { workout: w, wT: 0, rolling: false, feel: false, mode: 'ride' });
      stepIdx = -1; doneAt = -1; cued = -1; under = 0;
      Object.assign(live, { distance: 0, elapsed: 0, ascent: 0, kj: 0, speed: 0, elevation: io.route.elevAt(0) });
    },

    // where the rider is in the workout and the target watts now (null = no ERG target: free step, free ride, done)
    target() {
      const cur = ride.mode === 'start' ? null : at(ride.workout, ride.wT);
      return { cur, target: cur && !cur.step.free ? watts(cur.pct, ride.offset) : null };
    },

    togglePause() {
      if (ride.mode === 'ride') { ride.mode = 'paused'; io.rec.pause(); live.speed = 0; }
      else if (ride.mode === 'paused') { ride.mode = 'ride'; io.rec.resume(); }
    },
    changeTarget(d: number) { ride.offset = Math.min(150, Math.max(-150, ride.offset + d)); },
    skip() {
      const cur = at(ride.workout, ride.wT);
      if (cur) ride.wT += cur.left;
    },
    toggleErg() {
      const { cur, target: t } = ride.target();
      if (t === null || (!ride.feel && cur && cur.left < 1)) return; // the next step re-engages ERG anyway
      ride.feel = !ride.feel;
      gradeTimer = 0; // switch the trainer now, not on the next grade refresh
      io.banner(ride.feel ? 'ERG off — ride by feel' : 'ERG back on', 2000);
    },
    finish() { ride.mode = 'done'; io.grade(0); },

    // one sub-step of riding (dt ≤ 0.25 s); `wall` = its wall-clock time, for the recording
    step(dt: number, wall: number) {
      const { cur, target: t } = ride.target();
      if (ride.mode === 'paused' && gradeTimer !== -99) { io.grade(0); gradeTimer = -99; }
      if (ride.mode !== 'ride') return;
      if (!ride.rolling && live.power > 0) ride.rolling = true;
      if (ride.rolling) {
        live.elapsed += dt;
        if (ride.workout.steps.length && !io.trainerLost()) ride.wT += dt; // hold the interval until the trainer is back
        live.grade = io.route.gradeAt(live.distance);
        live.speed = physics(live.speed, live.power, live.grade, dt);
        live.distance += live.speed * dt;
        const e = io.route.elevAt(live.distance);
        live.ascent += Math.max(0, e - live.elevation);
        live.elevation = e;
        live.kj += (live.power * dt) / 1000;
        io.rec.add(dt, wall, t);
      }
      // FTP test: under half the target for 10 s on the ramp = the rider is done; go straight to the cool-down
      const last = ride.workout.steps.length - 1;
      const onRamp = !!ride.workout.test && !!cur && cur.i > 0 && cur.i < last && ride.rolling && !io.trainerLost();
      under = onRamp && t !== null && live.power < t / 2 ? under + dt : 0;
      if (under > 10) {
        under = 0;
        ride.wT = totalDuration(ride.workout) - ride.workout.steps[last].dur;
        io.banner('Test done — spin easy', 4000);
      }
      // audio: beep + announce the next step 3 s ahead; steps reached without that (start, skip) are announced on arrival
      if (cur && cur.left <= 3 && cued <= cur.i) {
        cued = cur.i + 1;
        io.beep();
        io.announce(ride.workout.steps[cued]);
      }
      if (cur && cur.i !== stepIdx) {
        if (stepIdx >= 0) io.rec.lap();
        stepIdx = cur.i; ride.feel = false;
        if (cued !== cur.i) { cued = cur.i; io.announce(cur.step); }
      } else if (!cur && stepIdx >= 0 && stepIdx !== doneAt) {
        io.rec.lap(); doneAt = stepIdx; ride.feel = false; // finished: remaining riding is a free cool-down lap
        io.banner('Workout complete 🎉', 4000);
      }
      // trainer control — ERG unless the rider dropped it (E) or spiral protection (below 50 rpm for 3 s) released it until back at 60+
      gradeTimer -= dt;
      const erg = t !== null && !ride.feel;
      lowCad = erg && live.cadence > 0 && live.cadence < 50 ? lowCad + dt : 0;
      if (!ride.spiral && lowCad > 3) { ride.spiral = true; io.banner('Low cadence — spin up!', 3000); }
      if (ride.spiral && (!erg || live.cadence >= 60)) ride.spiral = false;
      if (erg && !ride.spiral) io.erg(t);
      else if (gradeTimer <= 0) { gradeTimer = 2; io.grade(ride.spiral ? 0 : live.grade); }
    },
  };
  return ride;
}
