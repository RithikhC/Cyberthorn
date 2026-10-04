# Benchmark results (2040 fleet, 01:30, 300 s, seed 7)

| Scenario | Compromised | No defence: nadir Hz | shed MW | feeder trips | GridGuard: nadir Hz | shed MW | trips | throttle after | surge cut |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| National strike, 60% compromised, synchronised | 925,208 | 48.94 | 2,131 | 5 | 49.77 | 0 | 0 | 3 s | 65% |
| National strike, 30% compromised | 470,961 | 49.81 | 0 | 1 | 49.85 | 0 | 0 | 3 s | 56% |
| Dubai emirate-wide, 60% | 456,224 | 49.82 | 0 | 1 | 49.91 | 0 | 0 | 4 s | 63% |
| Local EV-dense district (Dubai), 70% | 202,375 | 49.91 | 0 | 1 | 49.95 | 0 | 0 | 4 s | 74% |
| Stealth ramp over 90 s, 60% | 925,208 | 48.99 | 2,131 | 5 | 49.92 | 0 | 0 | 9 s | 82% |
| Backend poisoned, 60% | 925,208 | 48.94 | 2,131 | 5 | 49.77 | 0 | 0 | 3 s | 65% |
| Backend poisoned + stealth ramp, 60% | 925,208 | 48.99 | 2,131 | 5 | 49.91 | 0 | 0 | 9 s | 79% |
| Home-unit botnet only, 70% | 905,452 | 48.91 | 2,131 | 6 | 49.73 | 0 | 0 | 3 s | 64% |
| Daytime attempt (14:00), 60% | 925,208 | 49.88 | 0 | 0 | 49.93 | 0 | 0 | 2 s | 62% |
| BMS overdrive (110%) | 925,208 | 49.95 | 0 | 0 | 49.95 | 0 | 0 | 7 s | 0% |
| FALSE-ALARM TEST: legit off-peak tariff surge | 0 | 49.95 | 0 | 0 | 49.95 | 0 | 0 | – | – |
| WORST CASE: 2050, 100% compromised, only 30% of chargers enforceable | 3,297,700 | 48.37 | 10,656 | 7 | 48.71 | 4,262 | 6 | 2 s | 41% |
