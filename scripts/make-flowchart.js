// node scripts/make-flowchart.js — poster-ready version of the per-node trust & fleet containment flowchart
// (logic taken unchanged from cyberthorn_flowchart.html; layout, colour and typography redone)
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'poster');
fs.mkdirSync(OUT, { recursive: true });

const INK = '#1b2024', MUTED = '#5d6670';
const C = {
  blue: ['#e8f1fa', '#2e6ea6'], green: ['#e9f4ee', '#2e8b5b'], amber: ['#fdf3dc', '#b9770e'], red: ['#fbeceb', '#d6453d'],
  purple: ['#efeaf8', '#6f55b0'], slate: ['#eef1f4', '#5d6670'],
};
const W = 1200, CX = 600, CW = 400; // centre column
const LX = 20, LW = 280, RX = 905, RW = 270; // left / right side boxes
const BH = 64, DH = 112;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let body = '';

function badge(x, y, n) {
  body += `<circle cx="${x}" cy="${y}" r="16" fill="${INK}"/><text x="${x}" y="${y + 7}" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">${n}</text>\n`;
}
function box(x, cy, w, title, subs, col, num, solid, h) {
  h = h || BH; const y = cy - h / 2, [fill, stroke] = solid ? [solid, solid] : C[col];
  const tc = solid ? '#fff' : INK, sc = solid ? '#f1f3f5' : MUTED;
  body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="3.5"/>\n`;
  const lines = 1 + subs.length, top = cy - (lines * 25) / 2 + 19;
  body += `<text x="${x + w / 2}" y="${top}" font-size="21" font-weight="700" fill="${tc}" text-anchor="middle">${esc(title)}</text>\n`;
  subs.forEach((s, i) => { body += `<text x="${x + w / 2}" y="${top + 24 * (i + 1)}" font-size="17" fill="${sc}" text-anchor="middle">${esc(s)}</text>\n`; });
  if (num) badge(x + 4, y + 2, num);
}
function dia(cy, lines, col, num) {
  const [fill, stroke] = C[col], w = CW, h = DH, cx = CX;
  body += `<polygon points="${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}" fill="#fff" stroke="${stroke}" stroke-width="3.5"/>\n`;
  const top = cy - (lines.length * 25) / 2 + 19;
  lines.forEach((l, i) => { body += `<text x="${cx}" y="${top + 25 * i}" font-size="21" font-weight="700" fill="${INK}" text-anchor="middle">${esc(l)}</text>\n`; });
  badge(cx + w / 4 + 24, cy - h / 4 - 10, num);
}
function arrow(d, color) {
  color = color || INK;
  body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round" marker-end="url(#ah${color === INK ? '' : 'c'})"/>\n`;
}
function line(d) { body += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>\n`; }
function yn(x, y, yes) {
  const col = yes ? '#1f6e45' : '#b33830', t = yes ? 'YES' : 'NO', w = yes ? 52 : 42;
  body += `<rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="26" rx="13" fill="#fff" stroke="${col}" stroke-width="2.5"/><text x="${x}" y="${y + 5}" font-size="16" font-weight="700" fill="${col}" text-anchor="middle">${t}</text>\n`;
}
function pill(cx, y, text, w) {
  w = w || 220;
  body += `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="30" rx="15" fill="#fff" stroke="${MUTED}" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${cx}" y="${y + 21}" font-size="16" font-weight="600" fill="${MUTED}" text-anchor="middle">${esc(text)}</text>\n`;
}

// ---- y centres
const y = { n1: 52, n2: 174, n3: 296, n4: 418, n5: 540, n6: 662, n8: 808, n11: 930, n12: 1052, n14: 1174, n15: 1296, n16: 1442, n18: 1564 };
const hw = CW / 2, bx = CX - hw;

// ---- main column nodes
box(bx, y.n1, CW, 'Read sensor & OCPP inputs', ['tamper · USB class · commanded vs metered kW'], 'blue', 1);
dia(y.n2, ['Maintenance', 'window active?'], 'blue', 2);
box(bx, y.n3, CW, 'Apply trust-vector penalties', ['tamper −40 · USB −35 · sensor fault −20'], 'amber', 3);
dia(y.n4, ['Power discrepancy', 'sustained ≥3 samples?'], 'green', 4);
box(bx, y.n5, CW, 'Compute node trust score', ['clamp 0–100, never increases mid-tick'], 'green', 5);
dia(y.n6, ['Trust < 30?', '(isolate threshold)'], 'red', 6);
dia(y.n8, ['Trust < 70?', '(throttle threshold)'], 'amber', 8);
box(bx, y.n11, CW, 'Record active vector(s)', ['feed into fleet correlator'], 'purple', 11);
dia(y.n12, ['≥3 nodes anomalous', 'within 120 s window?'], 'purple', 12);
box(bx, y.n14, CW, 'Compute blast radius', ['related nodes × MW per transformer', '+ time-to-trip projection'], 'purple', 14, null, 84);
dia(y.n15, ['Time-to-trip', '< 30 s?'], 'purple', 15);
dia(y.n16, ['Escalation events', '≥3 within 60 min?'], 'slate', 16);
box(bx, y.n18, CW, 'Auto-contained', ['resume monitoring next tick'], 'green', 18);

// ---- side nodes
box(LX, y.n2, LW, 'Suppress tamper signal', ['log INFO only, no penalty'], 'slate', null);
box(RX, y.n4, RW, 'Apply discrepancy penalty', ['−45 to trust score'], 'amber', null);
box(RX, y.n6, RW, 'Isolate node', ['force relay open: 0 kW'], 'red', 7);
box(RX, y.n8, RW, 'Throttle node', ['cap at safe AC rate (≈7.4 kW)'], 'amber', 9);
box(LX, y.n8, LW, 'Clean tick streak', ['≥3 consecutive clean ⇒ recover', '+15 trust/tick (hysteresis)'], 'green', 10, null, 84);
box(LX, y.n12, LW, 'Log node-level ticket', ['isolated incident, no campaign'], 'slate', 13);
box(LX, y.n15, LW, 'WARN alert to operator', ['monitor, no action yet'], 'amber', null);
box(RX, y.n15, RW, 'CRITICAL alert to operator', ['substation load trending to trip'], 'red', null, '#d6453d');
box(RX, y.n16, RW, 'MANUAL_LOCKOUT', ['auto-recovery disabled', 'operator reset required'], 'red', 17, '#8f2620', 84);

// ---- outcomes
const oy = 1690;
body += `<rect x="${CX - 250}" y="${oy}" width="240" height="64" rx="10" fill="#2e8b5b"/><text x="${CX - 130}" y="${oy + 28}" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">Grid stability</text><text x="${CX - 130}" y="${oy + 52}" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">maintained</text>\n`;
body += `<rect x="${CX + 10}" y="${oy}" width="240" height="64" rx="10" fill="#2e6ea6"/><text x="${CX + 130}" y="${oy + 28}" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">Full audit trail</text><text x="${CX + 130}" y="${oy + 52}" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">logged</text>\n`;

// ---- arrows (main flow)
const top = (k, h) => y[k] - (h || DH) / 2, bot = (k, h) => y[k] + (h || DH) / 2;
arrow(`M${CX},${bot('n1', BH)} V${top('n2')}`);
arrow(`M${CX},${bot('n2')} V${top('n3', BH)}`); yn(CX + 38, (bot('n2') + top('n3', BH)) / 2, false);
arrow(`M${CX},${bot('n3', BH)} V${top('n4')}`);
arrow(`M${CX},${bot('n4')} V${top('n5', BH)}`); yn(CX - 40, (bot('n4') + top('n5', BH)) / 2, false);
arrow(`M${CX},${bot('n5', BH)} V${top('n6')}`);
arrow(`M${CX},${bot('n6')} V${top('n8')}`); yn(CX + 38, (bot('n6') + top('n8')) / 2, false);
arrow(`M${CX},${bot('n8')} V${top('n11', BH)}`);
arrow(`M${CX},${bot('n11', BH)} V${top('n12')}`);
arrow(`M${CX},${bot('n12')} V${top('n14', 84)}`); yn(CX + 38, (bot('n12') + top('n14', 84)) / 2, true);
arrow(`M${CX},${bot('n14', 84)} V${top('n15')}`);
arrow(`M${CX},${bot('n15')} V${top('n16')}`);
arrow(`M${CX},${bot('n16')} V${top('n18', BH)}`); yn(CX + 38, (bot('n16') + top('n18', BH)) / 2, false);
arrow(`M${CX},${bot('n18', BH)} V1660 H${CX - 130} V${oy}`);
arrow(`M${CX},1660 H${CX + 130} V${oy}`);

// ---- YES / NO branches
arrow(`M${CX - hw},${y.n2} H${LX + LW}`); yn((CX - hw + LX + LW) / 2, y.n2 - 26, true);
arrow(`M${CX + hw},${y.n4} H${RX}`); yn((CX + hw + RX) / 2, y.n4 - 26, true);
line(`M${RX + RW / 2},${y.n4 + BH / 2} V${y.n4 + 74} H${CX}`);
arrow(`M${CX + hw},${y.n6} H${RX}`); yn((CX + hw + RX) / 2, y.n6 - 26, true);
arrow(`M${RX + RW},${y.n6} H1188 V${y.n11} H${CX + hw}`);
arrow(`M${CX + hw},${y.n8} H${RX}`); yn((CX + hw + RX) / 2, y.n8 - 26, true);
line(`M${RX + RW / 2},${y.n8 + BH / 2} V${y.n8 + 64} H${CX}`);
arrow(`M${CX - hw},${y.n8} H${LX + LW}`); yn((CX - hw + LX + LW) / 2, y.n8 - 26, false);
arrow(`M${CX - hw},${y.n12} H${LX + LW}`); yn((CX - hw + LX + LW) / 2, y.n12 - 26, false);
arrow(`M${CX - hw},${y.n15} H${LX + LW}`); yn((CX - hw + LX + LW) / 2, y.n15 - 26, false);
line(`M${LX + LW / 2},${y.n15 + BH / 2} V${y.n15 + 73} H${CX}`);
arrow(`M${CX + hw},${y.n15} H${RX}`); yn((CX + hw + RX) / 2, y.n15 - 26, true);
line(`M${RX + RW / 2},${y.n15 + BH / 2} V${y.n15 + 73} H${CX}`);
arrow(`M${CX + hw},${y.n16} H${RX}`); yn((CX + hw + RX) / 2, y.n16 - 26, true);

// ---- loop-back tags (replace the long dashed feedback lines)
pill(LX + LW / 2, y.n2 + BH / 2 + 12, '↺ back to step 1', 200);
pill(LX + LW / 2, y.n8 + 42 + 12, '↺ back to step 1', 200);
pill(LX + LW / 2, y.n12 + BH / 2 + 12, '↺ back to step 1', 200);
pill(RX + RW / 2, y.n16 + 42 + 12, 'operator reset → step 1', 250);
pill(RX + RW / 2, y.n18 - 15, '↺ resumes at step 1 next tick', 270);

const H = 1780;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', system-ui, Arial, sans-serif">
<defs>
  <marker id="ah" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto"><path d="M0,1 L15,8 L0,15 Z" fill="${INK}"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="#fff"/>
${body.replace(/marker-end="url\(#ahc\)"/g, 'marker-end="url(#ah)"')}
</svg>
`;
fs.writeFileSync(path.join(OUT, 'flowchart.svg'), svg);

const legend = [['Input & detection', '#2e6ea6'], ['Trust scoring', '#2e8b5b'], ['Penalty / throttle', '#b9770e'], ['Isolate / critical', '#d6453d'], ['Fleet correlation', '#6f55b0'], ['Log / suppress', '#5d6670']]
  .map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>CYBERTHORN — Per-node trust &amp; fleet containment logic</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: ${INK}; }
  .wrap { width: 1200px; margin: 0 auto; padding: 24px 0 16px; }
  h1 { margin: 0; font-size: 30px; letter-spacing: .02em; }
  .sub { margin: 4px 0 12px; font-size: 17px; color: ${MUTED}; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 16px; margin-bottom: 8px; }
  .legend i { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }
  svg { display: block; width: 100%; height: auto; }
</style></head><body><div class="wrap">
<h1>CYBERTHORN: per-node trust &amp; fleet containment logic</h1>
<div class="sub">One evaluation cycle (about a 1–2 s tick). Solid arrows are the primary flow; dashed tags show where a branch returns to step 1.</div>
<div class="legend">${legend}</div>
${svg.replace(/<\?xml.*?\?>/, '')}
</div></body></html>
`;
fs.writeFileSync(path.join(OUT, 'flowchart.html'), html);
console.log('wrote poster/flowchart.svg and poster/flowchart.html');
