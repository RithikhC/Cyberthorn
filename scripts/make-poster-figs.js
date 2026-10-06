// node scripts/make-poster-figs.js — draws the poster figures from the simulation (poster/figs/*.svg)
const fs = require('fs'), path = require('path');
const G = require('../js/engine.js');
const OUT = path.join(__dirname, '..', 'poster', 'figs');
fs.mkdirSync(OUT, { recursive: true });
const FONT = "font-family=\"'Segoe UI', system-ui, Arial, sans-serif\"";
const INK = '#1b2024', MUTED = '#5d6670', GRID = '#d9dde1', RED = '#d6453d', GREEN = '#2e8b5b', AMBER = '#b9770e';

// same attack twice: nationwide, 60% compromised, 2040, 01:30 (the default demo scenario)
const { off, on } = G.runTwins({ year: 2040, hour: 1.5, scope: 'national', pct: 0.6, seed: 7, tAttack: 30 }, 300);

function chart({ file, series, yMin, yMax, yTicks, yFmt, yLabel, hlines = [], T = 300, w = 1200, h = 560 }) {
  const m = { l: 150, r: 30, t: 70, b: 110 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  const X = (t) => m.l + (t / T) * pw, Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * ph;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${FONT}>\n<rect width="${w}" height="${h}" fill="#fff"/>\n`;
  yTicks.forEach((v) => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${GRID}" stroke-width="2"/><text x="${m.l - 14}" y="${Y(v) + 10}" font-size="30" fill="${MUTED}" text-anchor="end">${yFmt(v)}</text>\n`; });
  [0, 60, 120, 180, 240, 300].forEach((t) => { s += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="${GRID}" stroke-width="2"/><text x="${X(t)}" y="${m.t + ph + 40}" font-size="30" fill="${MUTED}" text-anchor="middle">${t}</text>\n`; });
  s += `<text x="${m.l + pw / 2}" y="${h - 14}" font-size="32" fill="${INK}" text-anchor="middle">seconds since scenario start</text>\n`;
  s += `<text transform="translate(34 ${m.t + ph / 2}) rotate(-90)" font-size="32" fill="${INK}" text-anchor="middle">${yLabel}</text>\n`;
  hlines.forEach((l) => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="${l.color}" stroke-width="3" stroke-dasharray="14 10"/><text x="${w - m.r - 8}" y="${Y(l.y) - 12}" font-size="28" fill="${l.color}" text-anchor="end">${l.label}</text>\n`; });
  s += `<line x1="${X(30)}" x2="${X(30)}" y1="${m.t}" y2="${m.t + ph}" stroke="${INK}" stroke-width="2.5" stroke-dasharray="4 6"/>\n`;
  s += `<clipPath id="c"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath><g clip-path="url(#c)">\n`;
  series.forEach((se) => {
    const d = se.data.map(([t, v], i) => (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="6" stroke-linejoin="round"/>\n`;
  });
  s += `</g>\n`;
  s += `<rect x="${X(30) + 8}" y="${m.t + ph - 56}" width="200" height="44" fill="#fff" stroke="${INK}" stroke-width="1.5"/><text x="${X(30) + 18}" y="${m.t + ph - 25}" font-size="28" fill="${INK}">attack starts</text>\n`;
  let lx = m.l; series.forEach((se) => { s += `<rect x="${lx}" y="22" width="40" height="8" fill="${se.color}"/><text x="${lx + 52}" y="34" font-size="32" fill="${INK}">${se.label}</text>\n`; lx += 52 + se.label.length * 17 + 50; });
  s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${INK}" stroke-width="2"/></svg>\n`;
  fs.writeFileSync(path.join(OUT, file), s);
}
const pts = (sim, k) => sim.hist.t.map((t, i) => [t, sim.hist[k][i]]);
chart({
  file: 'freq.svg', yMin: 48.4, yMax: 50.2, yTicks: [48.5, 49, 49.5, 50], yFmt: (v) => v.toFixed(1), yLabel: 'grid frequency (Hz)',
  series: [{ label: 'Unprotected', color: RED, data: pts(off, 'f') }, { label: 'With SENTINEL', color: GREEN, data: pts(on, 'f') }],
  hlines: [{ y: 49.0, color: AMBER, label: 'load shedding starts: 49.0 Hz' }],
});
const ymax = 3200;
chart({
  file: 'load.svg', yMin: 0, yMax: ymax, yTicks: [0, 1000, 2000, 3000], yFmt: (v) => v.toLocaleString('en-US'), yLabel: 'extra charging load (MW)',
  series: [{ label: 'Unprotected', color: RED, data: pts(off, 'dEv') }, { label: 'With SENTINEL', color: GREEN, data: pts(on, 'dEv') }],
});

// architecture figure (compact vertical flow)
const BH = 92, AH = 34;
const box = (i, fill, stroke, title, sub) => {
  const y = 6 + i * (BH + AH);
  return `<rect x="14" y="${y}" width="672" height="${BH}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
<text x="350" y="${y + 38}" font-size="34" font-weight="700" fill="${INK}" text-anchor="middle">${title}</text>
<text x="350" y="${y + 74}" font-size="26" fill="${MUTED}" text-anchor="middle">${sub}</text>
`;
};
const arrow = (i, label, color = INK) => {
  const y = 6 + i * (BH + AH) + BH;
  return `<path d="M350 ${y + 2} V${y + AH - 8}" stroke="${color}" stroke-width="5"/><path d="M337 ${y + AH - 18} L350 ${y + AH - 2} L363 ${y + AH - 18}" fill="${color}"/><text x="376" y="${y + 25}" font-size="24" fill="${color}">${label}</text>
`;
};
const H = 6 + 5 * BH + 4 * AH + 6;
let a2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 ${H}" ${FONT}>
<rect width="700" height="${H}" fill="#fff"/>
`;
a2 += box(0, '#fbeceb', RED, 'Attack', 'hacked chargers or backend raise all rates at once');
a2 += arrow(0, 'surge of load', RED);
a2 += box(1, '#e9f4ee', GREEN, 'SENTINEL gateway at each charger', 'independent hardware limiter');
a2 += arrow(1, 'telemetry / enforce');
a2 += box(2, '#f3f5f7', '#8a949e', 'Feeder controller (1 Hz)', 'load ramp, drift, requests vs authorised');
a2 += arrow(2, 'alerts');
a2 += box(3, '#f3f5f7', '#8a949e', 'National coordinator', 'correlates feeders and grid frequency');
a2 += arrow(3, 'escalate');
a2 += box(4, '#f3f5f7', '#8a949e', 'Utility control room', 'operator review and manual override');
a2 += '</svg>\n';
fs.writeFileSync(path.join(OUT, 'arch.svg'), a2);
console.log('figures written to', OUT, '| unprotected low', off.summary().minF, 'protected low', on.summary().minF);
