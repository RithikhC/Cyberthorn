# SENTINEL gateway — hardware prototype (next phase)

Independent enforcement point in series with a charger, so a compromised charger cannot ignore throttling.

| Block | Part (suggested) | Purpose |
|---|---|---|
| MCU | ESP32-S3 | Telemetry, local control loop, signed-command check, TLS/MQTT |
| Current / voltage sense | split-core CT + ADC (e.g. ADS1115), ZMPT101B | Independent power measurement per charger |
| Limiter | IEC 61851 / J1772 pilot-PWM generator (MCU timer) | Caps offered current regardless of charger firmware |
| Disconnect | contactor + driver | Quarantine / hard stop |
| Watchdog | external supervisor | Fail-safe: loss of control → clamp to a safe default rate (6 A) |

State machine and thresholds to port: `_guard()` in `../js/engine.js` (WATCH → THROTTLE → ISOLATE → RECOVER).

Bench plan: replay engine scenarios as MQTT/OCPP traffic into the gateway (hardware-in-the-loop) and compare its decisions with the simulator.
