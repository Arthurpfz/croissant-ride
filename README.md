# Croissant Ride

![15 seconds of a VO₂max interval: the Night Draft world, then a switch to Cosmic Circuit mid-ride](docs/demo.gif)

An indoor trainer app that runs in the browser. Pair your smart trainer and heart-rate strap, pick a structured workout, and the trainer holds your target watts (ERG) while you ride a 3D loop. At the end you get a summary and a .FIT file to post to Intervals.icu, Strava, Garmin Connect or TrainingPeaks.

One rider, no accounts, no backend: everything stays in your browser.

**Try it:** [croissantride.com](https://croissantride.com) · **No trainer?** Pick any workout and choose demo mode: a simulated trainer, heart rate and rider.

## Features

- **ERG workouts:** six built-in sessions in % of FTP, plus Free Ride. Import your own as Zwift-format `.zwo` files (what TrainingPeaks, Intervals.icu and others export), including coach notes.
- **Ramp FTP test:** the target rises every minute until you can't hold it; the summary works out your FTP (75 % of your best minute) and saves it on one click.
- **Live data:** power (3 s average), heart rate, cadence, virtual speed and distance; target, time left in the step and the whole workout as a bar chart.
- **Rider controls:** target ±10 W, ride a step by feel (ERG off), skip, pause. Keyboard shortcuts; a Bluetooth presentation clicker or the original Zwift Click works as a handlebar remote.
- **Floating mini window:** watch something in another tab while you ride: a small always-on-top card keeps the watts, heart rate, time left and next step in view (Chrome/Edge; `F` or the ⧉ button).
- **Cues:** a 3-2-1 countdown, a beep and a spoken summary before each step change. ERG is released automatically when cadence drops too low (and comes back when you spin up).
- **Worlds:** three switchable looks (night sketch, space, valley), generated in code.
- **Recording:** 1 s samples, saved every 5 s so a crash or closed tab doesn't lose the ride; FIT export with laps per step and heart-rate variability (RR intervals).
- **Summary:** power against the targets, time in each zone, NP, TSS, average heart rate; "Post to" buttons that download the file and open the site's upload page.

## What you need

- **Browser:** Chrome or Edge on desktop or Android. They have Web Bluetooth; Safari, Firefox and every iPhone/iPad browser don't (on iOS, the Bluefy browser works).
- **Smart trainer:** one that speaks Bluetooth FTMS (most trainers from the last few years). See the tested list below.
- **Optional:** a Bluetooth heart-rate strap, and a cadence sensor or power meter for cadence if your trainer doesn't report it.

## Tested hardware

Ridden for real with the app. Yours isn't listed? [Tell us whether it works](https://github.com/Arthurpfz/croissant-ride/issues/new?template=trainer-report.yml), even in one line.

| Device | Kind | Works | Notes |
|---|---|---|---|
| Van Rysel D100 (Decathlon) | Smart trainer, FTMS | ✅ ERG, power | No cadence from the trainer: pair a cadence sensor or power meter for it. The D100 is Bluetooth only, so bike computers can't run ERG sessions on it; this app can. |
| SRAM Quarq power meter | Cadence | ✅ Cadence | Used for cadence only. |
| Amazfit Helio Strap | Heart rate | ✅ Heart rate | |

## Run it locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/?sim=1`. The simulator fakes a trainer, heart rate and a rider, so you can work on the app without hardware. Web Bluetooth works on `localhost`, so you can also pair a real trainer.

`npm run build` type-checks and builds the static site into `dist/`.

| URL flag | What it does |
|---|---|
| `?sim=1` | Simulated trainer, heart rate and rider |
| `?observe=1` | Read-only trainer: never takes control (e.g. beside another app) |
| `?debug=1` | Logs raw Bluetooth packets and trainer commands |

**Ride shortcuts:** `Space` pause · `+`/`-` (or Page Up/Down) target ±10 W · `E` ERG ⇄ ride by feel · `M` mute cues · `W` next world · `?` all shortcuts.

## Host your own

It's a static site: run `npm run build` and serve `dist/` from any static host (Netlify, Vercel, GitHub Pages, nginx). Web Bluetooth needs HTTPS (or `localhost`). There is nothing else to set up: no server, no database, no keys. Optional settings (your address, legal pages, analytics) are in [.env.example](.env.example).

## Privacy

No accounts, no cookies, no uploads. Settings (FTP, weight) and the ride in progress live in your browser's local storage. Rides leave your computer only when you post the .FIT file yourself. The app has no analytics unless its host turns them on: the hosted copy at croissantride.com counts visits with self-hosted, cookieless Umami (see its privacy page).

## Support

Croissant Ride is free and stays free. If it saves you a subscription, you can [buy me a croissant on Ko-fi](https://ko-fi.com/arthurpfalzgraf). Reports from your trainer help just as much.

## Help wanted

- **More trainers:** Tacx FE-C over Bluetooth, Wahoo's older trainer protocol, trainers with only a resistance mode. A trainer is one driver file (see [CONTRIBUTING.md](CONTRIBUTING.md)).
- **Hilly routes:** a route with real climbs for Free Ride.
- **Testing on hardware:** reports from other trainers, heart-rate straps and cadence sensors.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). [CLAUDE.md](CLAUDE.md) has a detailed map of the code.

## Licence

[Apache-2.0](LICENSE). Bundled third-party software, fonts and map data are listed in [public/THIRD-PARTY-NOTICES.txt](public/THIRD-PARTY-NOTICES.txt). The Col du Galibier contains IGN data (BD TOPO®, RGE ALTI®, ORTHO-EXPRESS), Licence Ouverte 2.0.

## Name and logo

The code is yours to use under Apache-2.0, but the licence doesn't cover the name "Croissant Ride" or the croissant logo (section 6). A copy you run for yourself, your club or your team can keep them. A copy you offer to the public under your own address, changed or not, needs its own name and logo (the title in `index.html` and `public/logo.svg`); "based on Croissant Ride" is welcome. Writing about the project or linking to it by name is always fine.

Croissant Ride is an independent project, not affiliated with or endorsed by Zwift, Strava, Garmin, TrainingPeaks, Intervals.icu or any trainer maker. Their names are used only to say which file formats and services work with it.
