// node scripts/make-ev-figure.js — combined poster figure: EV share of UAE new-vehicle sales + EV charging market size
// Data transcribed from the two source charts supplied by the team:
//   (a) share of EVs vs ICE vehicles sold in the UAE, 2024-2035 (source of this chart: to be added by the team)
//   (b) UAE EV charging infrastructure market: USD 84.8 M (2026) -> USD 212.7 M (2032), 16.57% CAGR, base year 2025 (MarkNtel Advisors)
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'poster', 'figs');
fs.mkdirSync(OUT, { recursive: true });

const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
const evShare = [3, 6, 8, 8, 9, 11, 15, 17, 20, 21, 22, 25]; // % of new vehicles sold
const mkt = { 2026: 84.8, 2032: 212.7 }; // USD million
const cagr = 0.1657;

const FONT = "font-family=\"'Segoe UI', system-ui, Arial, sans-serif\"";
const INK = '#1b2024', MUTED = '#5d6670', GRID = '#d9dde1', BAR = '#3b6ea8', LINE = '#c2570c';
const W = 1200, H = 720, m = { l: 120, r: 140, t: 160, b: 100 };
const pw = W - m.l - m.r, ph = H - m.t - m.b, band = pw / years.length;
const LMAX = 30, RMAX = 240;
const xc = (i) => m.l + band * (i + 0.5);
const yL = (v) => m.t + (1 - v / LMAX) * ph;
const yR = (v) => m.t + (1 - v / RMAX) * ph;

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>\n<rect width="${W}" height="${H}" fill="#fff"/>\n`;
// grid + both axes (6 intervals each so gridlines align)
for (let k = 0; k <= 6; k++) {
  const y = m.t + (1 - k / 6) * ph;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="2"/>`;
  s += `<text x="${m.l - 14}" y="${y + 10}" font-size="27" fill="${BAR}" text-anchor="end">${k * 5}%</text>`;
  s += `<text x="${W - m.r + 14}" y="${y + 10}" font-size="27" fill="${LINE}" text-anchor="start">${k * 40}</text>\n`;
}
// bars
years.forEach((yr, i) => {
  const bw = band * 0.66, x = xc(i) - bw / 2, top = yL(evShare[i]);
  s += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(m.t + ph - top).toFixed(1)}" fill="${BAR}"/>`;
  const inside = m.t + ph - top > 44;
  s += `<text x="${xc(i).toFixed(1)}" y="${inside ? top + 32 : top - 10}" font-size="27" font-weight="700" fill="${inside ? '#fff' : BAR}" text-anchor="middle">${evShare[i]}%</text>`;
  s += `<text x="${xc(i).toFixed(1)}" y="${m.t + ph + 40}" font-size="27" fill="${INK}" text-anchor="middle">${yr}</text>\n`;
});
s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${INK}" stroke-width="3"/>\n`;
// implied market path at the stated CAGR (interpolated between the two published points)
const pts = [];
for (let yr = 2026; yr <= 2032; yr++) pts.push([xc(years.indexOf(yr)), yR(mkt[2026] * Math.pow(1 + cagr, yr - 2026))]);
s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')}" fill="none" stroke="${LINE}" stroke-width="5" stroke-dasharray="14 9" stroke-linecap="round"/>\n`;
[2026, 2032].forEach((yr, k) => {
  const x = xc(years.indexOf(yr)), y = yR(mkt[yr]);
  s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${LINE}" stroke="#fff" stroke-width="4"/>`;
  s += `<text x="${(x + (k ? 24 : -24)).toFixed(1)}" y="${(y + (k ? 4 : -18)).toFixed(1)}" font-size="29" font-weight="700" fill="${LINE}" text-anchor="${k ? 'start' : 'end'}">USD ${mkt[yr]} M</text>\n`;
});
// CAGR callout (top-left of the plot, clear of bars and line)
s += `<rect x="${m.l + 20}" y="${m.t + 14}" width="450" height="50" rx="6" fill="#fff" stroke="${LINE}" stroke-width="2.5"/><text x="${m.l + 20 + 225}" y="${m.t + 48}" font-size="27" font-weight="700" fill="${LINE}" text-anchor="middle">Market CAGR 16.57% (2026-2032)</text>\n`;
// axis titles
s += `<text transform="translate(34 ${m.t + ph / 2}) rotate(-90)" font-size="28" fill="${BAR}" text-anchor="middle">EV share of new vehicle sales (%)</text>`;
s += `<text transform="translate(${W - 26} ${m.t + ph / 2}) rotate(90)" font-size="28" fill="${LINE}" text-anchor="middle">Charging market size (USD million)</text>\n`;
// legend
s += `<rect x="${m.l}" y="20" width="34" height="26" fill="${BAR}"/><text x="${m.l + 46}" y="42" font-size="28" fill="${INK}">EV share of new vehicle sales (left axis)</text>`;
s += `<line x1="${m.l}" x2="${m.l + 34}" y1="75" y2="75" stroke="${LINE}" stroke-width="5" stroke-dasharray="10 6"/><circle cx="${m.l + 17}" cy="75" r="9" fill="${LINE}"/><text x="${m.l + 46}" y="85" font-size="28" fill="${INK}">EV charging infrastructure market (right axis)</text>`;
s += `<text x="${m.l}" y="124" font-size="23" fill="${MUTED}">Dots are published values; the dashed path between them is interpolated at the stated CAGR.</text>\n`;
s += `</svg>\n`;
fs.writeFileSync(path.join(OUT, 'ev-growth.svg'), s);
console.log('wrote', path.join(OUT, 'ev-growth.svg'), '| implied 2032 at CAGR:', (mkt[2026] * Math.pow(1 + cagr, 6)).toFixed(1), 'vs published 212.7');
