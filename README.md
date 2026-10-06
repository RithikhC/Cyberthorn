<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/sentinel-logo.svg">
    <img src="assets/sentinel-logo-light.svg" alt="SENTINEL" width="380">
  </picture>
</p>

# SENTINEL

**Live demo: https://rithikhc.github.io/Cyberthorn/**

**A0 poster:** [`poster/SENTINEL-A0-poster.pdf`](poster/SENTINEL-A0-poster.pdf) (print-ready, 841 x 1189 mm). Source in `poster/poster.html`; regenerate the figures with `node scripts/make-poster-figs.js`.

A simulation of what happens when EV chargers are hacked and told to charge hard at the same moment, and how SENTINEL stops it. Built for Cyberthorn under the theme *Cybersecurity & Critical Infrastructure Protection*.

## The problem

If enough chargers are compromised, an attacker can raise every charging rate at once, staying just under the point where each car's battery management would cut the car off. The surge can overload feeders or drag grid frequency down far enough to force load shedding. It only works while cars are plugged in (mostly overnight), and the number of chargers grows every year.

We don't look at how chargers get hacked. We assume some will be, and protect the grid: spot the artificial surge and throttle it before breakers or under-frequency relays trip.

## What the demo shows

The page runs the same attack twice on a model of the UAE grid, once unprotected and once with SENTINEL, and compares them live: grid frequency, charging load, breaker trips, load shedding, the detector's risk score and the state of each feeder.

Scenarios you can pick (or build with the sliders):

- nationwide overnight attack
- local attack on Dubai's EV-dense districts
- slow ramp with a compromised charging backend
- home chargers only
- daytime attempt (cars unplugged, so little happens)
- attacker overdrives the batteries (cars cut off, attack defeats itself)
- false-alarm test: a legitimate scheduled tariff surge
- worst case: 2050, everything hacked, SENTINEL controls only 30% of chargers

## How SENTINEL decides

Each feeder gets a risk score once a second from four signals: how fast charging load is rising, whether it keeps drifting above plan, how far chargers' requests exceed what the backend authorised, and how many chargers stepped up together. Weights and thresholds are in `docs/MODEL.md`.

- Watch at 0.30, throttle at 0.55 (held for 2 s).
- Throttle forces chargers back to their schedule; persistent offenders are quarantined at 6 A, which still charges slowly; release is gradual.
- A national coordinator spreads the alert when several feeders are hit at once.
- Enforcement is meant to run on an independent hardware gateway, so a compromised charger cannot ignore it (`hardware/README.md`).

## Results

2040 fleet, 01:30, 300 s, seed 7. Full table in `docs/BENCHMARKS.md`.

| Scenario | No defence | With SENTINEL |
|---|---|---|
| Nationwide, 60% compromised | 2,131 MW shed, 5 breakers tripped, 48.94 Hz | nothing shed, no trips, 49.77 Hz, throttle in 3 s |
| Local EV-dense district (Dubai) | breaker trips | no trip |
| Slow ramp, backend compromised | 2,131 MW shed | nothing shed, throttle in 9 s |
| Legitimate tariff surge | n/a | no false alarm, nothing quarantined |
| Worst case (2050, 30% control) | 10,656 MW shed, 7 trips | 4,262 MW shed, 6 trips (partly contained) |

The worst case is the honest limit: SENTINEL can only throttle the chargers it can physically control.

## Limitations

- Single-area frequency model with illustrative parameters. It is not a validated power-system study, and the detector and simulator were written by the same team.
- Charger clusters are aggregated; no real charger protocol is simulated.
- The feeder load clamp reacts instantly in the model, which makes results look better than a real command delay would allow.
- UAE and IEA figures come from public reporting (sources in `docs/MODEL.md`); check them before quoting.

## Run it locally

No install needed. Open `index.html`, or:

```bash
node scripts/serve.js     # http://localhost:5173
node test/engine.test.js  # 13 engine tests
node scripts/benchmark.js # benchmark table
node scripts/worstcase.js # sweep for SENTINEL's weakest case
```

## Layout

```
index.html         the live simulation page
css/style.css      styles
js/engine.js       grid, fleet, detector and mitigator
js/charts.js       small canvas chart helper
js/app.js          page controls and rendering
test/              engine tests
scripts/           local server, benchmark, worst-case sweep
docs/              model assumptions and benchmark output
hardware/          gateway design notes (next phase)
```
