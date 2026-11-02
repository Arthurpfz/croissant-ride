# Contributing

Thanks for helping. Bug reports, hardware test reports and pull requests are all welcome.

## Set up

```bash
npm install
npm run dev     # then open http://localhost:5173/?sim=1
npm run build   # type-check + build; CI runs this on every pull request
```

`?sim=1` simulates a trainer, heart rate and rider, so most work needs no hardware. In the console, `sim` lets you fake problems: `sim.mute.add('hr')` silences a sensor, `sim.trainer.status = 'lost'` drops the trainer, and `sim.ride` is the ride engine's state. `?debug=1` logs Bluetooth packets and trainer commands.

## How the code is laid out

[CLAUDE.md](CLAUDE.md) is the full map. In short:

- `src/engine.ts`: the ride itself (workout clock, targets, ERG, low-cadence protection, pause). No DOM or Bluetooth, so it can run in Node.
- `src/main.ts`: the screen around it (start screen, HUD, summary).
- `src/trainer/`: trainer drivers. `src/ble/`: heart rate and cadence.
- `src/recorder.ts` + `src/fit.ts`: recording and our own FIT writer.
- `worlds/`: routes and skins, data only.

## Common changes

- **Add a trainer:** write a driver in `src/trainer/` that fills in `TrainerDriver` (`trainer.ts`): the Bluetooth service that identifies it, `setup`, `setErg`, `setGrade`. Add it to `drivers` in `trainer.ts`, and its service to `optionalServices` in `src/ble/ble.ts` if it's new. `ftms.ts` is the example.
- **Add a world skin:** add `worlds/skins/<id>/skin.json` (colours, sky, ground, road, rider, bike, props). It's picked up automatically. Skins are data only: they can't run code or change physics.
- **Add a route:** add `worlds/routes/<id>.json` (`line` control points and `elevation`).
- **Add a built-in workout:** add an entry in `src/workouts.ts` (steps in % of FTP).
- **Add a "Post to" service:** add a line in `src/post.ts`.
- **Add a rider action or key:** add it in `bindActions` in `src/main.ts`; the shortcuts list builds itself.

## Rules

- **Licence:** contributions are under [Apache-2.0](LICENSE), like the rest of the project.
- **Your own work only.** Ideas from other projects are fine, their code is not, especially GPL/AGPL projects (e.g. Auuki, qdomyos-zwift) and proprietary SDKs. Don't add Garmin's FIT SDK: its licence doesn't allow redistribution under Apache-2.0 (`src/fit.ts` is our own writer).
- **Assets:** original, or CC0/CC-BY with the licence noted. Fonts under the SIL OFL or similar. No models, textures, names or recognisable designs from games, films or other apps.
- **No look-alikes:** no other app's logo, colours, layout styling or cue wording, and no athlete, team or brand names on workouts.
- **New dependency or bundled asset:** add its licence notice to `public/THIRD-PARTY-NOTICES.txt`.
- **Keep it small:** plain TypeScript and DOM, no framework. Match the style of the code around your change.

## Pull requests

- `npm run build` passes.
- Say how you tested it: in `?sim=1`, and on which hardware if it touches Bluetooth or ERG.
- One change per pull request; screenshots for anything visible.
