// node scripts/worstcase.js — sweep for scenarios where SENTINEL performs worst
const G = require('../js/engine.js');
const rows = [];
const grid = {
  year: [2040, 2050], pct: [0.6, 1.0], style: ['step', 'ramp'], poisoned: [false, true],
  enforceProb: [0.95, 0.7, 0.5, 0.3], latency: [1.5, 5, 15], scope: ['national', 'local'],
};
for (const year of grid.year) for (const pct of grid.pct) for (const style of grid.style) for (const poisoned of grid.poisoned)
  for (const enforceProb of grid.enforceProb) for (const latency of grid.latency) for (const scope of grid.scope) {
    const cfg = { year, pct, style, poisoned, enforceProb, latency, scope, region: 'DXB', hour: 1.5 };
    const on = new G.Simulation(Object.assign({}, cfg, { defense: true })).run(300).summary();
    rows.push({ cfg, on });
  }
const score = (r) => r.on.shedMW + r.on.lossMW * 0.5 + (r.on.collapsed ? 1e5 : 0) + (49.5 - r.on.minF) * 100;
rows.sort((a, b) => score(b) - score(a));
console.log('total runs', rows.length, '| with shed>0:', rows.filter(r => r.on.shedMW > 0).length, '| with trips>0:', rows.filter(r => r.on.feederTrips > 0).length, '| collapsed:', rows.filter(r => r.on.collapsed).length);
rows.slice(0, 8).forEach((r) => console.log(JSON.stringify(r.cfg), '=>', JSON.stringify({ minF: r.on.minF, shed: r.on.shedMW, trips: r.on.feederTrips, lat: r.on.detectLatency, loss: r.on.lossMW })));
// weakest-assumption boundary: how much enforcement/latency can SENTINEL tolerate on the baseline attack?
console.log('\nBaseline nationwide 60% 2040, defended — enforcement vs latency:');
for (const e of [0.95, 0.7, 0.5, 0.3, 0.1]) {
  console.log('enforce', e, [1.5, 5, 15, 30].map(l => { const s = new G.Simulation({ year: 2040, pct: 0.6, enforceProb: e, latency: l }).run(300).summary(); return `lat${l}s: ${s.minF.toFixed(2)}Hz/${s.shedMW}MW/${s.feederTrips}tr`; }).join('  '));
}
