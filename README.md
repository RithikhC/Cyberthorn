# GridGuard EV

**Protecting the power grid from compromised EV chargers** — Cyberthorn hackathon prototype
Theme: *Cybersecurity & Critical Infrastructure Protection* (aligned with the UAE National Cybersecurity Strategy)

> Hackers don't need to break the grid directly. If enough EV chargers are compromised, they can raise every charging rate at once — just under the level where each car's BMS would cut off — and push the grid past its reserve. It only works while cars are plugged in (mainly **overnight**), and the number of chargers grows every year.
>
> We don't try to stop every exploit. **We assume chargers get hacked and protect the grid**: detect the artificial load surge and throttle it *before* feeder relays or under-frequency load shedding trip.

## Run the demo (no install, no dependencies)

```bash
node scripts/serve.js          # then open http://localhost:5173
```

or just open `index.html` in a browser (plain JS, works offline). It also deploys as-is on GitHub Pages.

```bash
node test/engine.test.js       # 13 engine tests
node scripts/benchmark.js      # benchmark table (see docs/BENCHMARKS.md)
```

## What's in the prototype

| Tab | What it shows |
|---|---|
| **Live cyber-range** | A UAE-wide fleet of ~2,400 charger clusters (each stands for thousands of real chargers). Launch an attack and watch the **same attack run twice in parallel** — unprotected vs. GridGuard — on grid frequency, charging load, relay trips, load shedding, detector risk score and per-feeder defence state. 7 presets: nationwide, local, stealth ramp + poisoned backend, home-only, daytime, BMS overdrive and a **benign false-alarm test**. |
| **How many chargers?** | Sweeps the compromised share against a frequency-response model → how many chargers an attacker needs, by year and time of day; local feeder thresholds per emirate. |
| **EV growth** | EV fleet, chargers by type, global EV share; when attackable overnight load crosses the grid's reserve. |
| **Home vs stations** | Which device class is the better target (MW per device, devices needed, availability, exposure). |
| **Benchmarks** | 11 scenarios, defended vs undefended, including a false-alarm test. |
| **Architecture** | Three detection layers, staged mitigation, SCADA/IoT integration, hardware gateway plan. |

## The questions we were asked (answers from the model — illustrative, see `docs/MODEL.md`)

**How many charging stations must be compromised?** It depends on connected load and grid reserve (8% of online generation in the model). At 01:30 the attackable overnight load first exceeds the reserve around **2033–2034** on the policy-anchored EV path (about 2030 if adoption is faster). In 2040 roughly **606k chargers (≈41% of installed)** suffice to start load-shedding; the share needed falls to ≈27% by 2045 and ≈18% by 2050. A **local** attack is far easier: in 2040 only **≈26% of Dubai's EV-dense district chargers** overload that feeder's breaker. Daytime attacks are much weaker because cars are not plugged in.

**How will EV popularity grow charger numbers?** UAE policy anchors (≈10% of the fleet by 2030, 50% by 2050; Dubai 47,944 EVs at end-2025) give ≈0.5 M EVs in 2030, ≈2.1 M in 2040 and ≈4.7 M in 2050 in the model, with chargers growing faster than the grid planning around them. Globally the IEA reports >20% of new-car sales in 2024 and >40% by 2030 on current policies.

**Home units vs public stations?** At night home units supply ≈**98% of attackable load** (85% are plugged in; millions of weakly managed endpoints). DC fast chargers move the most power per device but are mostly idle overnight. For a nationwide overnight strike home units win; for a fast, low-footprint local strike, a compromised charge-point-operator *backend* gives the most megawatts per exploit. The defence is identical either way: **watch the feeder, not the charger.**

## How GridGuard works

1. **Physical layer** (trusts nothing): feeder-level EV load ramp rate, CUSUM drift vs. a slow forecast, projected overload — independent of charger firmware and backend.
2. **Cyber layer**: charger-*requested* power vs. what the charging management system *authorised*, plus a synchrony index (how many chargers stepped up together). A legitimate tariff-start surge is authorised, so no false alarm.
3. **Coordination layer**: a national coordinator correlates feeders and PMU frequency/RoCoF; a multi-feeder campaign pre-empts the remaining feeders.

Staged response per feeder: `NORMAL → WATCH → THROTTLE → ISOLATE → RECOVER` — force chargers back to the authorised profile, clamp feeder headroom, quarantine non-compliant units at 6 A safe-mode (cars still charge slowly), release in stages with hysteresis. Enforcement is meant to run on an **independent hardware gateway** (see `hardware/`), so a compromised charger cannot ignore it.

### Results (2040 fleet, night, seed 7 — full table in `docs/BENCHMARKS.md`)

| Scenario | No defence | With GridGuard |
|---|---|---|
| Nationwide, 60% compromised | 2,131 MW customers shed, 5 feeder trips, 48.94 Hz | 0 shed, 0 trips, 49.77 Hz — throttle in 3 s |
| Local EV-dense district (Dubai) | feeder breaker trips | no trip |
| Stealth 90 s ramp + poisoned backend | 2,131 MW shed | 0 shed — throttle in 9 s |
| Legit off-peak tariff surge | – | **no false alarm**, nothing quarantined |
| Overdrive past BMS limit | cars cut themselves off | attack defeats itself |

## Honest limitations

- Single-area frequency model with illustrative parameters — not a validated power-system study. The detector and simulator were written by the same team; real validation needs utility data and a hardware-in-the-loop bench.
- Charger clusters are aggregated agents; no per-charger network protocol is simulated.
- The project deliberately does **not** cover how chargers are exploited.

## Roadmap to the hardware prototype

ESP32 gateway in series with the charger (current transformer + voltage sense), independent pilot-PWM limiter and contactor, signed command channel, local fail-safe. The control logic in `js/engine.js` (`_guard`) is the reference for the gateway firmware. Details in `hardware/README.md`.

## Repo layout

```
index.html            dashboard
js/engine.js          simulation + detector + mitigator (browser & Node)
js/charts.js          dependency-free canvas charts
js/app.js             UI
test/engine.test.js   engine tests
scripts/              serve.js · benchmark.js
docs/MODEL.md         assumptions, equations, sources
docs/BENCHMARKS.md    benchmark output
hardware/README.md    gateway design notes
```
