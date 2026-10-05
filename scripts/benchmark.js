// node scripts/benchmark.js > docs/BENCHMARKS.md   — runs the benchmark suite headless
const G = require('../js/engine.js');
const BASE = { year: 2040, hour: 1.5, scope: 'national', region: 'DXB', pct: 0.6, cls: 'all', a: 0.95, enforceProb: 0.95, style: 'step', poisoned: false, benign: false, tAttack: 30 };
const S = [
  ['National strike, 60% compromised, synchronised', {}], ['National strike, 30% compromised', { pct: 0.3 }], ['Dubai emirate-wide, 60%', { scope: 'region' }],
  ['Local EV-dense district (Dubai), 70%', { scope: 'local', pct: 0.7 }], ['Stealth ramp over 90 s, 60%', { style: 'ramp' }], ['Backend poisoned, 60%', { poisoned: true }],
  ['Backend poisoned + stealth ramp, 60%', { poisoned: true, style: 'ramp' }], ['Home-unit botnet only, 70%', { cls: 'home', pct: 0.7 }],
  ['Daytime attempt (14:00), 60%', { hour: 14 }], ['BMS overdrive (110%)', { a: 1.1 }], ['FALSE-ALARM TEST: legit off-peak tariff surge', { benign: true }], ['WORST CASE: 2050, 100% compromised, only 30% of chargers enforceable', { year: 2050, pct: 1, enforceProb: 0.3 }],
];
console.log('# Benchmark results (2040 fleet, 01:30, 300 s, seed 7)\n');
console.log('| Scenario | Compromised | No defence: nadir Hz | shed MW | feeder trips | SENTINEL: nadir Hz | shed MW | trips | throttle after | surge cut |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [name, o] of S) {
  const cfg = Object.assign({}, BASE, o), { off, on } = G.runTwins(cfg, 300), a = off.summary(), b = on.summary();
  const cut = a.peakDeltaMW > 0 && !cfg.benign ? Math.round((1 - b.peakDeltaMW / a.peakDeltaMW) * 100) + '%' : '–';
  console.log(`| ${name} | ${cfg.benign ? 0 : Math.round(off.compDevices).toLocaleString('en-US')} | ${a.minF.toFixed(2)} | ${a.shedMW.toLocaleString('en-US')} | ${a.feederTrips} | ${b.minF.toFixed(2)} | ${b.shedMW.toLocaleString('en-US')} | ${b.feederTrips} | ${b.detectLatency != null ? b.detectLatency + ' s' : '–'} | ${cut} |`);
}
