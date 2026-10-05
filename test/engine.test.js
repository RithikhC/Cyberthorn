// Run: node test/engine.test.js   (no dependencies)
const assert = require('assert');
const G = require('../js/engine.js');
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };
const run = (cfg, s = 300) => G.runTwins(cfg, s);
const BASE = { year: 2040, hour: 1.5, pct: 0.6 };

console.log('SENTINEL engine tests');
t('EV adoption matches UAE policy anchors (≈10% by 2030, 50% by 2050)', () => {
  assert(Math.abs(G.evShareOfFleet(2030) - 0.10) < 0.005);
  assert(Math.abs(G.evShareOfFleet(2050) - 0.50) < 0.005);
});
t('simulation is deterministic for a given seed', () => {
  const a = new G.Simulation(Object.assign({}, BASE, { seed: 3 })).run(120).summary();
  const b = new G.Simulation(Object.assign({}, BASE, { seed: 3 })).run(120).summary();
  assert.deepStrictEqual(a, b);
});
t('quiet grid stays at 50 Hz (±0.1) with no attack', () => {
  const s = new G.Simulation({ year: 2040, hour: 1.5, benign: true, defense: false, tAttack: 9999 }).run(120);
  assert(Math.abs(s.fHz - 50) < 0.1);
});
t('nationwide overnight attack causes load shedding without SENTINEL', () => {
  const { off } = run(BASE); const a = off.summary();
  assert(a.shedMW > 0, 'expected UFLS');
  assert(a.minF < 49.0);
});
t('SENTINEL prevents load shedding and feeder trips in the same attack', () => {
  const { on } = run(BASE); const b = on.summary();
  assert.strictEqual(b.shedMW, 0); assert.strictEqual(b.feederTrips, 0);
  assert(b.minF > 49.5, 'nadir ' + b.minF);
});
t('SENTINEL throttles within 6 s (well before relay trip time)', () => {
  const b = run(BASE).on.summary();
  assert(b.detectLatency !== null && b.detectLatency <= 6, 'latency ' + b.detectLatency);
});
t('local district attack trips the feeder relay without defence, not with it', () => {
  const { off, on } = run({ year: 2040, hour: 1.5, scope: 'local', region: 'DXB', pct: 0.7 });
  assert(off.summary().feederTrips >= 1); assert.strictEqual(on.summary().feederTrips, 0);
});
t('stealth ramp + poisoned backend is still stopped', () => {
  const { off, on } = run(Object.assign({}, BASE, { style: 'ramp', poisoned: true }));
  assert(off.summary().shedMW > 0); assert.strictEqual(on.summary().shedMW, 0); assert.strictEqual(on.summary().feederTrips, 0);
});
t('legitimate synchronised tariff surge raises no throttle and quarantines nothing', () => {
  const b = run({ year: 2040, hour: 1.5, benign: true }).on.summary();
  assert.strictEqual(b.throttled, false); assert.strictEqual(b.quarantined, 0);
});
t('false quarantines are zero in every attack scenario', () => {
  [BASE, { year: 2040, hour: 1.5, scope: 'local', pct: 0.7 }, Object.assign({}, BASE, { cls: 'home' })].forEach((c) => assert.strictEqual(run(c).on.summary().falseQuarantine, 0));
});
t('daytime attack is far weaker than overnight (cars not plugged in)', () => {
  const night = run(BASE).off.summary().peakDeltaMW, day = run(Object.assign({}, BASE, { hour: 14 })).off.summary().peakDeltaMW;
  assert(day < night * 0.7, `day ${day} vs night ${night}`);
});
t('overdriving past the BMS limit makes cars cut off and defeats the attack', () => {
  const a = run(Object.assign({}, BASE, { a: 1.1 })).off.summary();
  assert(a.bmsTrips > 0); assert.strictEqual(a.shedMW, 0);
});
t('threat window opens as EV fleet grows (home chargers dominate at night)', () => {
  const r25 = G.fleetHeadroom({ year: 2025, hour: 1.5 }), r45 = G.fleetHeadroom({ year: 2045, hour: 1.5 });
  const sum = (r) => r.classes.home.mw + r.classes.pubac.mw + r.classes.dc.mw;
  assert(sum(r45) > 10 * sum(r25));
  assert(r45.classes.home.mw > 0.9 * sum(r45));
});
console.log(`\n${pass} passed${process.exitCode ? ', with failures' : ''}`);
