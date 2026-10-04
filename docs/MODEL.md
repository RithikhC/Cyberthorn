# Model, assumptions and sources

All parameters are **illustrative** and live at the top of `js/engine.js` so they can be replaced with utility data.

## Grid (frequency) model
Single-area swing equation with governor and under-frequency load shedding (UFLS), per-unit on online generation:

```
2H · dΔf/dt = ΔPm − ΔPL − D·Δf
Tg · dΔPm/dt = clip(−Δf/R, −0.10, reserve) − ΔPm
```

H = 4 s, droop R = 5%, damping D = 1, Tg = 4 s, spinning reserve = 8% of online generation, online generation = 1.15 × demand.
UFLS stages: 49.0 / 48.8 / 48.6 / 48.4 Hz shedding 10 / 10 / 15 / 15% of demand after a 0.3 s timer; collapse below 47.5 Hz.
Demand: UAE peak ≈ 34 GW treated as one interconnected system; summer-like diurnal curve (minimum ≈ 60% of peak at ~03:30).

## Feeders and relays
14 feeders = 7 emirates × {general, EV-dense district}. Rating = 1.12 × (base + planned diversified EV load). The district feeder holds 7% of the emirate's base load but a large share of its home chargers (new-build villa communities), which is why local attacks are cheap. Relay: pickup 110%, inverse-time thermal accumulator (limit 40 pu²·s).

## Fleet
Agents are clusters of real chargers (weight *w*). Classes: home AC (7.4/11 kW), public AC (22 kW post, limited by the car's on-board charger to 7.4/11 kW), DC fast (60/150 kW posts, car-limited, taper above 80% SoC). Plug-in probability by hour and class; about half of plugged cars need energy; 40% of home sessions are scheduled for an off-peak start between 23:00 and 04:00.

**Attack model:** compromised chargers raise their setpoint to *a* × (what the car's BMS accepts), default *a* = 0.95. Above 1.0 the BMS opens the contactor (the attack defeats itself). Only plugged-in cars with SoC < 98% respond. Botnet commands arrive over an 8 s window (step) or 90 s (stealth ramp).

## EV adoption
Logit-space interpolation between anchors: 2% (2025), 10% (2030), 30% (2040), 50% (2050) of the vehicle parc (4.5 M in 2025, +3%/yr). Public chargers per EV rise from 0.02 to 0.10; 60% of EVs have a home unit. "Accelerated" adds +0.7 to the logit.

## GridGuard
1 Hz control loop per feeder. Signals: EV-load ramp, CUSUM against the trusted schedule (or a slow forecast if the backend is poisoned), deviation of requested vs authorised power, synchrony index.
Risk = 0.35·dev + 0.25·sync + 0.25·ramp + 0.15·cusum (CUSUM-only evidence can reach 0.70).
WATCH ≥ 0.30; THROTTLE ≥ 0.55 for 2 s (1 s if ≥ 0.75) or projected overload; ISOLATE after 5 s of non-compliance; RECOVER after 20 s calm; staged release 5%/s.
Command latency 1.5 s; 95% of chargers enforceable (5% ignore commands, covered by the headroom clamp and UFLS). The headroom clamp keeps each feeder below 97% of rating.

## Sources (public reporting, retrieved Oct 2026 — verify before quoting)
- UAE National EV Policy targets (≈10% of fleet by 2030, 50% by 2050) and EV/charger counts (Dubai 47,944 EVs end-2025; ≈1,860 DEWA public chargers; ADNOC/TAQA 70,000 charge points in Abu Dhabi by 2030): PwC, "The future is electric: A strategy for EV adoption in the UAE" (https://www.pwc.com/m1/en/publications/documents/2024/future-is-electric-strategy-ev-adoption-uae.pdf); Rest of World, "UAE emerges as Middle East's EV leader" (https://restofworld.org/2025/uae-middle-east-ev-leader/).
- IEA Global EV Outlook 2025: >17 M electric cars sold in 2024, >20% share, >40% by 2030 on current policies (https://www.iea.org/reports/global-ev-outlook-2025/outlook-for-electric-mobility).
- UAE peak demand ≈ 34 GW (2024); DEWA peak 10.76 GW (+3.4%): Arabian Business, "Dubai's energy demand jumps 5.4% in 2024"; Statista.
