/* GridGuard EV — dashboard UI */
(function () {
  'use strict';
  const G = window.GG, C = window.Charts;
  const $ = (id) => document.getElementById(id);
  const n0 = (v) => Math.round(v).toLocaleString('en-US');
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hh = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + (h % 1 ? '30' : '00');
  const mmss = (t) => 'T+' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const kfmt = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(Math.round(v)));
  const COL = { off: '#ff5468', on: '#3ddc84', accent: '#36d6c3', amber: '#ffb84a', blue: '#5aa9ff', purple: '#b18cff', grey: '#8fa1c0' };

  /* ------------------------------------------------------------- tabs */
  const tabBtns = document.querySelectorAll('#tabs button');
  const rendered = {};
  function showTab(id) {
    tabBtns.forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + id));
    if (id === 'math') renderMath();
    if (id === 'growth') renderGrowth();
    if (id === 'homevs') renderHomeVs();
    if (id === 'arch' && !rendered.arch) { $('archSvg').innerHTML = ARCH_SVG; rendered.arch = true; }
    if (id === 'live') draw(true);
    history.replaceState(null, '', '#' + id);
  }
  tabBtns.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  /* ----------------------------------------------------------- presets */
  const BASE = { year: 2040, hour: 1.5, scope: 'national', region: 'DXB', pct: 0.6, cls: 'all', a: 0.95, style: 'step', poisoned: false, benign: false, enforceProb: 0.95 };
  const PRESETS = [
    { name: 'Nationwide overnight strike', cfg: {} },
    { name: 'Local district overload — Dubai', cfg: { scope: 'local', region: 'DXB', pct: 0.7 } },
    { name: 'Stealth ramp + poisoned backend', cfg: { style: 'ramp', poisoned: true } },
    { name: 'Home-unit botnet only', cfg: { cls: 'home', pct: 0.7 } },
    { name: 'Daytime attempt (cars not plugged in)', cfg: { hour: 14 } },
    { name: 'BMS overdrive — attacker overreaches', cfg: { a: 1.1 } },
    { name: 'False-alarm test: legit off-peak surge', cfg: { benign: true } },
    { name: 'WORST CASE: 2050, 100% hacked, only 30% enforceable', cfg: { year: 2050, pct: 1, enforceProb: 0.3 } },
  ];
  const P = $('preset');
  PRESETS.forEach((p, i) => P.add(new Option(p.name, i)));
  G.REGIONS.forEach((r) => $('region').add(new Option(r.name, r.id)));

  const ctl = { year: $('year'), hour: $('hour'), scope: $('scope'), region: $('region'), pct: $('pct'), cls: $('cls'), a: $('a'), style: $('style'), enforceProb: $('enf'), poisoned: $('poisoned'), benign: $('benign') };
  function setCtl(cfg) {
    Object.keys(ctl).forEach((k) => { if (ctl[k].type === 'checkbox') ctl[k].checked = !!cfg[k]; else ctl[k].value = cfg[k]; });
    labels();
  }
  function readCfg() {
    const c = {};
    Object.keys(ctl).forEach((k) => { const e = ctl[k]; c[k] = e.type === 'checkbox' ? e.checked : e.type === 'range' ? +e.value : e.value; });
    return c;
  }
  function labels() {
    $('lbYear').textContent = ctl.year.value; $('lbHour').textContent = hh(+ctl.hour.value);
    $('lbPct').textContent = Math.round(ctl.pct.value * 100) + '%'; $('lbA').textContent = (+ctl.a.value * 100).toFixed(0) + '%'; $('lbEnf').textContent = Math.round(ctl.enforceProb.value * 100) + '%';
    $('aNote').textContent = +ctl.a.value > 1 ? '⚠ Above 100% the car’s BMS opens its contactor and the car drops off — the attack defeats itself.' : 'Attackers stay just under the BMS limit so cars do not cut off.';
  }
  P.addEventListener('change', () => { setCtl(Object.assign({}, BASE, PRESETS[+P.value].cfg)); resetSim(); });
  Object.values(ctl).forEach((e) => e.addEventListener('input', () => { labels(); resetSim(); }));

  /* ------------------------------------------------------- simulation */
  const DURATION = 300;
  const S = { off: null, on: null, running: false, speed: 4, view: 'on', acc: 0, last: 0, done: false, cfg: null, logN: { off: 0, on: 0 }, lastChart: 0 };
  function resetSim() {
    S.cfg = readCfg();
    S.cfg.tAttack = 30;
    S.off = new G.Simulation(Object.assign({}, S.cfg, { defense: false }));
    S.on = new G.Simulation(Object.assign({}, S.cfg, { defense: true }));
    S.running = false; S.done = false; S.acc = 0; S.logN = { off: 0, on: 0 };
    $('logOff').innerHTML = ''; $('logOn').innerHTML = '';
    $('btnRun').textContent = '▶ Launch attack'; $('btnPause').textContent = '⏸ Pause';
    setBanner('', '');
    draw(true);
  }
  $('btnRun').addEventListener('click', () => {
    if (S.done || S.off.t > 0) resetSim();
    S.running = true; S.last = performance.now(); $('btnRun').textContent = '↻ Restart'; $('btnPause').textContent = '⏸ Pause';
  });
  $('btnPause').addEventListener('click', () => {
    if (S.off.t === 0 || S.done) return;
    S.running = !S.running; S.last = performance.now(); $('btnPause').textContent = S.running ? '⏸ Pause' : '▶ Resume';
  });
  $('btnSkip').addEventListener('click', () => {
    if (S.done) return;
    while (S.on.t < DURATION) { S.off.step(); S.on.step(); }
    S.running = false; S.done = true; $('btnRun').textContent = '↻ Restart'; draw(true);
  });
  document.querySelectorAll('#speedSeg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#speedSeg button').forEach((x) => x.classList.toggle('on', x === b)); S.speed = +b.dataset.s;
  }));
  document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#viewSeg button').forEach((x) => x.classList.toggle('on', x === b)); S.view = b.dataset.v; draw(true);
  }));

  function frame(ts) {
    if (S.running && !S.done) {
      S.acc += Math.min(0.1, (ts - S.last) / 1000) * S.speed; S.last = ts;
      const steps = Math.floor(S.acc / S.off.cfg.dt); S.acc -= steps * S.off.cfg.dt;
      for (let i = 0; i < steps; i++) { S.off.step(); S.on.step(); if (S.on.t >= DURATION) break; }
      if (S.on.t >= DURATION) { S.running = false; S.done = true; }
      draw(S.done);
    }
    requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------- rendering */
  const KP = [
    { k: 'Frequency (Hz)', f: (s) => s.fHz.toFixed(2) },
    { k: 'Charging load above plan', f: (s) => '+' + n0(Math.max(0, s.evLoadMW() - s.E0total)) + ' MW' },
    { k: 'Customers shed (UFLS)', f: (s) => n0(s.shedMW) + ' MW' },
    { k: 'Feeders tripped', f: (s) => s.metrics.feederTrips + ' / 14' },
    { k: 'Time to throttle', f: (s) => (s.cfg.defense ? (s.metrics.firstThrottleAt >= 0 && s.metrics.attackStart >= 0 ? (s.metrics.firstThrottleAt - s.metrics.attackStart).toFixed(1) + ' s' : '—') : 'no defence') },
  ];
  $('kpis').innerHTML = KP.map((p, i) => `<div class="kpi"><div class="k">${p.k}</div><div class="v"><div><i>without</i><span class="off" id="kOff${i}"></span></div><div><i>with</i><span class="on" id="kOn${i}"></span></div></div></div>`).join('');

  const chips = [];
  (function () {
    let h = '';
    for (let row = 0; row < 2; row++) for (let r = 0; r < 7; r++) h += `<div class="chip s0" id="chip${r * 2 + row}"><b>${G.REGIONS[r].id}</b>${row ? 'district' : 'general'}</div>`;
    $('chips').innerHTML = h;
    for (let f = 0; f < 14; f++) chips.push($('chip' + f));
  })();

  function setBanner(cls, msg) {
    const b = $('banner'); b.className = 'banner ' + cls;
    $('bannerMsg').innerHTML = msg || 'Pick a scenario and press <b>Launch attack</b>. The same attack runs twice in parallel: once on an unprotected grid, once with GridGuard.';
  }
  function verdict() {
    const a = S.off.summary(), b = S.on.summary(), c = S.cfg;
    if (c.benign) {
      return b.throttled || b.quarantined ? ['alert', `<b>False alarm.</b> GridGuard throttled a legitimate tariff surge (${b.quarantined} quarantined).`]
        : ['ok', `<b>No false alarm.</b> A legitimate synchronised tariff-start surge (+${n0(b.peakDeltaMW)} MW) passed: GridGuard ${b.watched ? 'raised WATCH only' : 'stayed NORMAL'}, no throttling, no quarantine.`];
    }
    const harmed = a.shedMW > 0 || a.feederTrips > 0 || a.collapsed;
    if (a.bmsTrips > 0 && !harmed) return ['ok', `<b>Attack defeated itself.</b> Overdriving above the BMS limit made ${n0(a.bmsTrips)} cars cut off — no extra load reached the grid.`];
    if (!harmed) return ['ok', `<b>No grid impact.</b> Nadir ${a.minF.toFixed(2)} Hz unprotected (+${n0(a.peakDeltaMW)} MW) — ${b.throttled ? 'GridGuard still throttled it in ' + b.detectLatency + ' s' : 'not enough connected load to matter'}. Try a larger share, a later year, or night-time.`];
    const parts = [];
    if (a.shedMW) parts.push(`${n0(a.shedMW)} MW of customers shed (nadir ${a.minF.toFixed(2)} Hz)`);
    if (a.feederTrips) parts.push(`${a.feederTrips} feeder relay trip${a.feederTrips > 1 ? 's' : ''} (${n0(a.lossMW)} MW blacked out)`);
    const saved = b.shedMW === 0 && b.feederTrips === 0;
    return [saved ? 'ok' : 'alert', `<b>${saved ? 'Blackout prevented.' : 'Partly mitigated.'}</b> Unprotected: ${parts.join(' + ')}. With GridGuard: nadir ${b.minF.toFixed(2)} Hz, ${n0(b.shedMW)} MW shed, ${b.feederTrips} trips — throttle engaged ${b.detectLatency ?? '—'} s after the attack began; load surge cut ${Math.round((1 - b.peakDeltaMW / Math.max(1, a.peakDeltaMW)) * 100)}%.`];
  }
  function banner() {
    $('clock').textContent = mmss(S.off.t);
    if (S.done) { const [c, m] = verdict(); setBanner(c, m); return; }
    if (S.off.t === 0) return;
    const c = S.cfg;
    if (S.off.t < 30) return setBanner('', c.benign ? 'Normal overnight operation. A legitimate scheduled-charging surge starts at T+00:30…' : 'Normal overnight operation. Botnet command fires at T+00:30…');
    if (S.off.shedMW > 0 || S.off.F.tripped.some((x) => x)) return setBanner('alert', '<b>Unprotected grid is failing</b> — load shedding / feeder trips underway. GridGuard twin shown in green.');
    setBanner('', c.benign ? 'Legitimate surge in progress — watching whether GridGuard overreacts…' : '<b>Attack in progress.</b> Chargers are ramping together; GridGuard is scoring the surge.');
  }

  const STCOL = ['#2f8f86', '#ff5468', '#ffb84a', '#b18cff', null, '#555'];
  const OUTLINE = [[0.04, 0.88], [0.1, 0.78], [0.2, 0.63], [0.34, 0.56], [0.48, 0.48], [0.6, 0.37], [0.7, 0.24], [0.76, 0.08], [0.83, 0.05], [0.87, 0.16], [0.95, 0.3], [0.96, 0.42], [0.88, 0.54], [0.72, 0.62], [0.6, 0.72], [0.52, 0.92], [0.3, 0.98], [0.1, 0.98]];
  function drawMap() {
    const cv = $('map'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const sim = S.view === 'on' ? S.on : S.off;
    ctx.beginPath(); OUTLINE.forEach((p, i) => (i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h))); ctx.closePath();
    ctx.fillStyle = 'rgba(54,214,195,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(54,214,195,0.25)'; ctx.stroke();
    let last = -1;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < sim.n; i++) {
      const st = sim.agentStatus(i);
      if (st === 4) { if (pass === 0) { ctx.fillStyle = 'rgba(143,161,192,0.18)'; ctx.fillRect(sim.x[i] * w - 0.5, sim.y[i] * h - 0.5, 1.2, 1.2); } continue; }
      const hot = (st === 1 || st === 2 || st === 3);
      if ((pass === 0) === hot) continue;
      if (st !== last) { ctx.fillStyle = STCOL[st]; last = st; }
      const r = hot ? 2.2 : 1.7; ctx.beginPath(); ctx.arc(sim.x[i] * w, sim.y[i] * h, r, 0, 6.283); ctx.fill();
    }
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    G.REGIONS.forEach((r, ri) => {
      const fs = [ri * 2, ri * 2 + 1];
      const tripped = fs.some((f) => sim.F.tripped[f]), worst = Math.max(...fs.map((f) => sim.F.state[f]));
      ctx.strokeStyle = tripped ? '#ff5468' : ['#1d4d3a', '#ffb84a', '#ff5468', '#b18cff', '#5aa9ff'][worst];
      ctx.lineWidth = tripped || worst ? 2 : 1; ctx.beginPath(); ctx.arc(r.x * w, r.y * h, 20, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = tripped ? '#ff5468' : '#c8d4ea'; ctx.fillText(r.name + (tripped ? ' ⚡ OUT' : ''), r.x * w, r.y * h - 26);
    });
    if (sim.collapsed) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ff5468'; ctx.font = '700 28px system-ui'; ctx.fillText('SYSTEM COLLAPSE', w / 2, h / 2); }
  }

  function updateKpis() {
    KP.forEach((p, i) => { $('kOff' + i).textContent = p.f(S.off); $('kOn' + i).textContent = p.f(S.on); });
    const frq = (s, i) => { const e = $((s === S.off ? 'kOff' : 'kOn') + i); e.style.color = s.fHz < 49.0 ? '#ff5468' : s.fHz < 49.7 ? '#ffb84a' : ''; };
    frq(S.off, 0); frq(S.on, 0);
    for (let f = 0; f < 14; f++) {
      const el = chips[f], tripped = S.on.F.tripped[f], st = S.on.F.state[f];
      el.className = 'chip ' + (tripped ? 'trip' : 's' + st);
      el.lastChild.textContent = tripped ? 'TRIPPED' : G.ST_NAME[st].toLowerCase();
    }
  }
  function updateLogs() {
    ['off', 'on'].forEach((k) => {
      const sim = S[k], box = $(k === 'off' ? 'logOff' : 'logOn');
      const all = sim.log; let added = false;
      // log array is capped at 400 and shifts; track by t+msg identity using count since last
      const startIdx = Math.max(0, all.length - (sim.log.length - Math.min(S.logN[k], sim.log.length)));
      for (let i = Math.min(S.logN[k], all.length); i < all.length; i++) {
        const l = all[i], d = document.createElement('div'); d.className = l.level;
        d.innerHTML = `<span class="tt">${mmss(l.t)}</span>${l.msg}`; box.appendChild(d); added = true;
      }
      void startIdx; S.logN[k] = all.length;
      if (added) box.scrollTop = box.scrollHeight;
    });
  }
  function drawCharts() {
    const xf = (v) => Math.round(v) + 's';
    const tA = S.cfg.tAttack, vl = S.cfg.benign ? [{ x: tA, label: 'surge', color: COL.amber }] : [{ x: tA, label: 'attack', color: COL.off }];
    const pts = (sim, key) => sim.hist.t.map((t, i) => [t, sim.hist[key][i]]);
    C.line($('chF'), {
      xMin: 0, xMax: DURATION, yMin: 48.4, yMax: 50.15, yFmt: (v) => v.toFixed(1), xFmt: xf, yLabel: 'Hz', xLabel: 'time since scenario start (s)',
      series: [{ label: 'without GridGuard', color: COL.off, data: pts(S.off, 'f') }, { label: 'with GridGuard', color: COL.on, data: pts(S.on, 'f') }],
      hlines: [{ y: 50, color: '#4b5d82' }, { y: 49.0, label: 'under-frequency load shedding (49.0 Hz)', color: COL.amber }, { y: 48.4, label: 'stage 4', color: '#c44' }], vlines: vl,
    });
    const ymax = Math.max(500, ...S.off.hist.dEv, ...S.on.hist.dEv) * 1.1;
    C.line($('chL'), {
      xMin: 0, xMax: DURATION, yMin: 0, yMax: ymax, yFmt: (v) => n0(v), xFmt: xf, yLabel: 'MW', xLabel: 'time since scenario start (s)', series: [{ label: 'without', color: COL.off, data: pts(S.off, 'dEv'), fill: true }, { label: 'with', color: COL.on, data: pts(S.on, 'dEv'), fill: true }], vlines: vl,
    });
    C.line($('chR'), {
      xMin: 0, xMax: DURATION, yMin: 0, yMax: 1, yFmt: (v) => v.toFixed(1), xFmt: xf, legend: false, yLabel: 'risk score (0–1)', xLabel: 'time since scenario start (s)',
      series: [{ color: COL.accent, data: pts(S.on, 'risk') }], hlines: [{ y: 0.3, label: 'WATCH', color: COL.amber }, { y: 0.55, label: 'THROTTLE', color: COL.off }], vlines: vl,
    });
  }
  function draw(force) {
    const now = performance.now();
    drawMap(); updateKpis(); banner(); updateLogs();
    if (force || now - S.lastChart > 120) { drawCharts(); S.lastChart = now; }
  }

  /* ---------------------------------------------------- threat maths */
  const thrPu = G.uflsThresholdPu();
  const memo = {};
  function headroom(year, hour, a, accel) {
    const k = [year, hour, a, accel].join('|');
    return memo[k] || (memo[k] = G.fleetHeadroom({ year, hour, a, accel }));
  }
  const tot = (r, keys) => keys.reduce((s, k) => s + r.classes[k].mw, 0);
  function renderMath() {
    const year = +$('mYear').value, hour = +$('mHour').value, a = +$('mA').value, accel = $('mAccel').checked;
    $('mYearL').textContent = year; $('mHourL').textContent = hh(hour); $('mAL').textContent = (a * 100).toFixed(0) + '%';
    const r = headroom(year, hour, a, accel), ALL = ['home', 'pubac', 'dc'], PUB = ['pubac', 'dc'];
    const mwAll = tot(r, ALL), thrMW = thrPu * r.Sbase, devAll = r.counts.total;
    const pStar = thrMW / Math.max(1, mwAll);
    const plugged = ALL.reduce((s, k) => s + r.classes[k].plugged, 0) / devAll;
    const reach = pStar <= 1;
    $('mCards').innerHTML = [
      ['Chargers to compromise for first load-shedding', reach ? `<span class="big">${kfmt(pStar * devAll)}</span><span class="note">${(pStar * 100).toFixed(0)}% of ${kfmt(devAll)} installed</span>` : `<span class="big" style="color:var(--good)">not reachable</span><span class="note">even 100% would add only ${n0(mwAll)} MW</span>`],
      ['Load an attacker can add (100% compromised)', `<span class="big">${n0(mwAll)} MW</span><span class="note">${(mwAll / r.Sbase * 100).toFixed(1)}% of online generation</span>`],
      ['Reserve + droop headroom before UFLS', `<span class="big">${n0(thrMW)} MW</span><span class="note">${(thrPu * 100).toFixed(1)}% of ${n0(r.Sbase)} MW online</span>`],
      ['Chargers plugged in right now', `<span class="big">${(plugged * 100).toFixed(0)}%</span><span class="note">${hh(hour)} — only connected cars can be pushed</span>`],
    ].map(([l, v]) => `<div class="stat"><span class="l">${l}</span>${v}</div>`).join('');
    // nadir sweep
    const mk = (keys) => { const d = []; const m = tot(r, keys); for (let p = 0; p <= 1.0001; p += 0.025) d.push([p * 100, G.gridStep((p * m) / r.Sbase, { T: 40 }).minF]); return d; };
    C.line($('chNadir'), {
      xMin: 0, xMax: 100, yMin: 47.6, yMax: 50.1, xFmt: (v) => v + '%', yFmt: (v) => v.toFixed(1), yLabel: 'Hz (lowest)',
      series: [{ label: 'all chargers', color: COL.accent, data: mk(ALL) }, { label: 'home only', color: COL.blue, data: mk(['home']) }, { label: 'public only', color: COL.amber, data: mk(PUB) }],
      hlines: [{ y: 49.0, label: 'load-shedding starts (49.0 Hz)', color: COL.off }, { y: 47.5, label: 'collapse', color: '#c44' }],
    });
    $('nadirNote').textContent = `Spinning reserve (${(G.GRID.reserve * 100).toFixed(0)}% of ${n0(r.Sbase)} MW) absorbs the first part of the step. Beyond it frequency keeps falling until under-frequency load shedding cuts customers off.`;
    // required devices by year
    const nightAll = [], dayAll = [];
    for (let y = 2025; y <= 2050; y++) {
      const rn = headroom(y, 1.5, a, accel), rd = headroom(y, 14, a, accel);
      nightAll.push([y, Math.min(1, (thrPu * rn.Sbase) / Math.max(1, tot(rn, ALL))) * 100]);
      dayAll.push([y, Math.min(1, (thrPu * rd.Sbase) / Math.max(1, tot(rd, ALL))) * 100]);
    }
    C.line($('chNeed'), {
      xMin: 2025, xMax: 2050, yMin: 0, yMax: 105, xFmt: (v) => String(v), yFmt: (v) => v + '%', yLabel: '% of installed chargers',
      series: [{ label: 'night (01:30)', color: COL.accent, data: nightAll }, { label: 'daytime (14:00)', color: COL.amber, data: dayAll }],
      hlines: [{ y: 100, label: 'not reachable above this line', color: '#4b5d82' }], vlines: [{ x: year, color: '#ffffff44' }],
    });
    // local
    const sim = new G.Simulation({ year, hour, a, accel, benign: true, defense: false }), fh = sim.feederHeadroom();
    let rows = '<tr><th>Emirate</th><th class="num">District feeder</th><th class="num">General feeders</th></tr>';
    G.REGIONS.forEach((reg, ri) => {
      const h = fh.pStar[ri * 2 + 1], g = fh.pStar[ri * 2], fd = (p, f) => (p <= 1 ? `<b>${(p * 100).toFixed(0)}%</b> <span class="note">(${kfmt(p * fh.devices[f])} chargers)</span>` : '<span class="note">not reachable</span>');
      rows += `<tr><td>${reg.name}</td><td class="num">${fd(h, ri * 2 + 1)}</td><td class="num">${fd(g, ri * 2)}</td></tr>`;
    });
    $('localTbl').innerHTML = rows;
    // take-away
    const dub = fh.pStar[3];
    $('mTake').innerHTML = reach
      ? `<b>In ${year} at ${hh(hour)}:</b> compromising about <b>${kfmt(pStar * devAll)} chargers (${(pStar * 100).toFixed(0)}%)</b> would add ${n0(thrMW)} MW in seconds — enough to exhaust spinning reserve and start load-shedding${dub <= 1 ? `; a <b>local</b> attack on Dubai's EV-dense districts needs only <b>${(dub * 100).toFixed(0)}%</b> of them to overload the feeder breaker` : ''}. This scenario has ${kfmt(r.counts.ev)} EVs and ${kfmt(devAll)} chargers; the window keeps widening as adoption grows.`
      : `<b>In ${year} at ${hh(hour)}</b> the connected charging fleet is too small to threaten system frequency (max ${n0(mwAll)} MW vs ${n0(thrMW)} MW needed)${dub <= 1 ? `, but a <b>local</b> attack on Dubai's EV-dense districts already needs only <b>${(dub * 100).toFixed(0)}%</b> of them to overload a feeder` : ''}. Move the year slider forward to see the nationwide window open.`;
  }
  ['mYear', 'mHour', 'mA', 'mAccel'].forEach((id) => $(id).addEventListener('input', renderMath));

  /* --------------------------------------------------------- growth */
  function renderGrowth() {
    const ys = []; for (let y = 2024; y <= 2050; y++) ys.push(y);
    const ev = (acc) => ys.map((y) => [y, G.evCount(y, acc) / 1e6]);
    C.line($('chEv'), { xMin: 2024, xMax: 2050, yMin: 0, xFmt: String, yFmt: (v) => v.toFixed(1), yLabel: 'million EVs', series: [{ label: 'policy-anchored', color: COL.accent, data: ev(false) }, { label: 'accelerated', color: COL.amber, data: ev(true), dash: [5, 4] }], vlines: [{ x: 2030, label: '10% target', color: '#4b5d82' }] });
    const ch = (k) => ys.map((y) => [y, G.chargerCounts(y, false)[k] / 1e3]);
    C.line($('chChg'), { xMin: 2024, xMax: 2050, yMin: 0, xFmt: String, yFmt: (v) => v.toFixed(0), yLabel: 'thousand chargers', series: [{ label: 'home', color: COL.blue, data: ch('home') }, { label: 'public AC', color: COL.accent, data: ch('pubac') }, { label: 'DC fast', color: COL.amber, data: ch('dc') }] });
    const exp = (acc, keys) => ys.map((y) => [y, tot(headroom(y, 1.5, 0.95, acc), keys)]);
    const thr = thrPu * G.GRID.peakMW * G.baseLoadFrac(1.5) * G.GRID.onlineMargin;
    const e1 = exp(false, ['home', 'pubac', 'dc']), e2 = exp(true, ['home', 'pubac', 'dc']);
    C.line($('chExp'), { xMin: 2024, xMax: 2050, yMin: 0, xFmt: String, yFmt: (v) => n0(v), yLabel: 'MW at 01:30', series: [{ label: 'attackable (policy)', color: COL.off, data: e1 }, { label: 'attackable (accelerated)', color: COL.amber, data: e2, dash: [5, 4] }], hlines: [{ y: thr, label: 'reserve + droop headroom — beyond this, load-shedding', color: COL.on }] });
    const cross = (d) => { const k = d.find((p) => p[1] >= thr); return k ? k[0] : null; };
    const c1 = cross(e1), c2 = cross(e2);
    $('expNote').textContent = `Nationwide threat window opens ≈ ${c1 ?? '>2050'} (policy path) / ≈ ${c2 ?? '>2050'} (accelerated), when the attackable overnight charging load first exceeds the reserve — and a single EV-dense district is exposed years earlier.`;
    const g = [[2020, 4], [2021, 9], [2022, 14], [2023, 18], [2024, 20]], gp = [[2024, 20], [2025, 25], [2030, 40]];
    C.line($('chGlob'), { xMin: 2020, xMax: 2030, yMin: 0, yMax: 50, xFmt: String, yFmt: (v) => v + '%', yLabel: '% of new cars', series: [{ label: 'reported', color: COL.accent, data: g }, { label: 'IEA projection (lower bound)', color: COL.amber, data: gp, dash: [5, 4] }] });
    const c = G.chargerCounts(2030, false), c35 = G.chargerCounts(2040, false);
    $('gTake').innerHTML = `<b>Why this matters:</b> chargers grow faster than the grid planning around them — from ≈${kfmt(G.chargerCounts(2025).total)} today to ≈${kfmt(c.total)} by 2030 and ≈${kfmt(c35.total)} by 2040 in this model. Each is a networked, high-power load an attacker can reach, and most are home units connected overnight when generation is thinnest. Fixed-capacity defences at the charger cannot scale to that; a grid-side detector at the feeder and substation can.`;
  }

  /* ------------------------------------------------------- home vs station */
  function renderHomeVs() {
    const year = +$('hYear').value, hour = +$('hHour').value;
    $('hYearL').textContent = year; $('hHourL').textContent = hh(hour);
    const r = headroom(year, hour, 0.95, false), thrMW = thrPu * r.Sbase;
    const rows = [['home', 'Home AC units', COL.blue], ['pubac', 'Public AC posts', COL.accent], ['dc', 'DC fast chargers', COL.amber]];
    const totMW = tot(r, ['home', 'pubac', 'dc']);
    C.bars($('chHV'), { items: rows.map(([k, l, c]) => ({ label: l, value: r.classes[k].mw, color: c })), fmt: (v) => n0(v) + ' MW' });
    C.bars($('chHN'), { items: rows.map(([k, l, c]) => { const m = r.classes[k].mw; return { label: l, value: m >= thrMW ? (thrMW / m) * r.classes[k].dev : 0, color: c }; }), fmt: (v) => (v ? kfmt(v) + ' devices' : 'cannot alone') });
    $('hvNote').textContent = `Threshold to start load-shedding ≈ ${n0(thrMW)} MW. All classes together could add ${n0(totMW)} MW at ${hh(hour)}.`;
    const note = { home: 'Millions of consumer-grade endpoints on residential Wi-Fi; mixed vendors and firmware; slow patching; rarely monitored 24/7.', pubac: 'Operated by charge-point operators with central back-ends (OCPP); fewer vendors; one backend controls thousands of posts.', dc: 'High-power, better-engineered security, utility-grade monitoring; few units and mostly used in daytime.' };
    let t = '<tr><th>Class</th><th class="num">Installed</th><th class="num">Connected now</th><th class="num">Attackable MW</th><th class="num">kW per connected</th><th class="num">Share of attack capacity</th><th>Security exposure</th></tr>';
    rows.forEach(([k, l]) => { const c = r.classes[k]; t += `<tr><td><b>${l}</b></td><td class="num">${kfmt(c.dev)}</td><td class="num">${(c.plugged / c.dev * 100).toFixed(0)}%</td><td class="num">${n0(c.mw)}</td><td class="num">${(c.mw * 1000 / Math.max(1, c.plugged)).toFixed(1)}</td><td class="num">${(c.mw / Math.max(1, totMW) * 100).toFixed(0)}%</td><td>${note[k]}</td></tr>`; });
    $('hvTbl').innerHTML = t;
    const hm = r.classes.home, dcm = r.classes.dc, shareH = hm.mw / Math.max(1, totMW);
    $('hvTake').innerHTML = `<b>Verdict at ${hh(hour)}, ${year}:</b> home units supply <b>${(shareH * 100).toFixed(0)}%</b> of attackable load because ${(hm.plugged / hm.dev * 100).toFixed(0)}% are plugged in and there are far more of them, whereas DC fast chargers move the most power per device (${(dcm.mw * 1000 / Math.max(1, dcm.plugged)).toFixed(0)} kW) but only ${(dcm.plugged / dcm.dev * 100).toFixed(0)}% are in use at this hour. <ul class="tight"><li><b>Nationwide, overnight:</b> home units are the better target — volume, availability and the weakest security.</li><li><b>Fast, local, low-footprint:</b> a compromised public-charger operator back-end (or aggregator app) gives the most megawatts per exploit — one foothold commands thousands of devices.</li><li><b>Defence is the same either way:</b> watch the feeder and the aggregate, not the individual charger.</li></ul>`;
  }
  ['hYear', 'hHour'].forEach((id) => $(id).addEventListener('input', renderHomeVs));

  /* ------------------------------------------------------------ bench */
  const BENCH = [
    ['National strike — 60% compromised, synchronised', {}],
    ['National strike — 30% compromised', { pct: 0.3 }],
    ['Dubai emirate-wide — 60%', { scope: 'region', region: 'DXB' }],
    ['Local EV-dense district (Dubai) — 70%', { scope: 'local', region: 'DXB', pct: 0.7 }],
    ['Stealth ramp over 90 s — 60%', { style: 'ramp' }],
    ['Backend poisoned (attack looks authorised) — 60%', { poisoned: true }],
    ['Backend poisoned + stealth ramp — 60%', { poisoned: true, style: 'ramp' }],
    ['Home-unit botnet only — 70%', { cls: 'home', pct: 0.7 }],
    ['Daytime attempt (14:00, cars unplugged) — 60%', { hour: 14 }],
    ['BMS overdrive (setpoint 110%) — attack defeats itself', { a: 1.1 }],
    ['FALSE-ALARM TEST: legit off-peak tariff surge', { benign: true }],
    ['WORST CASE: 2050, 100% compromised, only 30% of chargers enforceable', { year: 2050, pct: 1, enforceProb: 0.3 }],
  ];
  $('btnBench').addEventListener('click', async () => {
    const btn = $('btnBench'); btn.disabled = true;
    let html = '<tr><th rowspan="2">Scenario (2040, 01:30 unless noted)</th><th rowspan="2" class="num">Compromised</th><th colspan="3" style="text-align:center;color:var(--bad)">Without GridGuard</th><th colspan="4" style="text-align:center;color:var(--good)">With GridGuard</th><th rowspan="2">Result</th></tr><tr><th class="num">Nadir</th><th class="num">Shed MW</th><th class="num">Trips</th><th class="num">Nadir</th><th class="num">Shed MW</th><th class="num">Trips</th><th class="num">Throttle after</th></tr>';
    let prevented = 0, harmful = 0, fa = null;
    for (let i = 0; i < BENCH.length; i++) {
      $('benchStatus').textContent = `running ${i + 1}/${BENCH.length}…`;
      await new Promise((r) => setTimeout(r, 20));
      const [name, over] = BENCH[i], cfg = Object.assign({}, BASE, over, { tAttack: 30 });
      const { off, on } = G.runTwins(cfg, DURATION), a = off.summary(), b = on.summary();
      const harm = a.shedMW > 0 || a.feederTrips > 0; let res;
      if (cfg.benign) { fa = b.throttled || b.quarantined > 0; res = fa ? '<span class="pill r">false alarm</span>' : '<span class="pill g">no false alarm</span>'; }
      else if (a.bmsTrips > 0 && !harm) res = '<span class="pill y">self-defeating</span>';
      else if (harm) { harmful++; const ok = b.shedMW === 0 && b.feederTrips === 0; if (ok) prevented++; res = ok ? '<span class="pill g">blackout prevented</span>' : '<span class="pill y">partly mitigated</span>'; }
      else res = '<span class="pill y">no grid impact</span>';
      const cut = a.peakDeltaMW > 0 && !cfg.benign ? ` <span class="note">(surge −${Math.round((1 - b.peakDeltaMW / a.peakDeltaMW) * 100)}%)</span>` : '';
      html += `<tr><td>${name}</td><td class="num">${cfg.benign ? '0' : kfmt(off.compDevices)}</td><td class="num">${a.minF.toFixed(2)}</td><td class="num">${n0(a.shedMW)}</td><td class="num">${a.feederTrips}</td><td class="num">${b.minF.toFixed(2)}</td><td class="num">${n0(b.shedMW)}</td><td class="num">${b.feederTrips}</td><td class="num">${b.detectLatency != null ? b.detectLatency + ' s' : '—'}${cut}</td><td>${res}</td></tr>`;
      $('benchTbl').innerHTML = html;
    }
    $('benchStatus').textContent = 'done';
    const tk = $('benchTake'); tk.style.display = 'block';
    tk.innerHTML = `<b>${prevented} of ${harmful}</b> attacks that caused load-shedding or feeder trips on the unprotected grid were fully stopped by GridGuard; ${fa === false ? 'the legitimate tariff surge produced <b>no false alarm</b>' : 'review the false-alarm row'}. Attacks that stay under the BMS limit are the dangerous ones — pushing past it makes cars cut off by themselves.`;
    btn.disabled = false;
  });

  /* ---------------------------------------------------- architecture svg */
  const ARCH_SVG = `<svg viewBox="0 0 1100 470" role="img" aria-label="GridGuard architecture">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8fa1c0"/></marker><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff5468"/></marker></defs>
  <g font-size="13" fill="#e6edf7">
  <rect x="20" y="20" width="250" height="90" rx="10" fill="#2a1019" stroke="#ff5468"/><text x="145" y="48" text-anchor="middle" font-weight="700" fill="#ff8a98">Attacker</text><text x="145" y="70" text-anchor="middle" fill="#c9a0a8" font-size="12">botnet · compromised CSMS</text><text x="145" y="88" text-anchor="middle" fill="#c9a0a8" font-size="12">aggregator app · bad firmware</text>
  <rect x="20" y="170" width="250" height="150" rx="10" fill="#111a2b" stroke="#2f8f86"/><text x="145" y="195" text-anchor="middle" font-weight="700" fill="#36d6c3">EV chargers (IoT)</text><text x="145" y="217" text-anchor="middle" fill="#8fa1c0" font-size="12">home AC · public AC · DC fast</text>
  <rect x="45" y="235" width="200" height="66" rx="8" fill="#0e2a2a" stroke="#36d6c3" stroke-width="2"/><text x="145" y="259" text-anchor="middle" font-weight="700">GridGuard gateway</text><text x="145" y="278" text-anchor="middle" fill="#8fa1c0" font-size="11.5">CT sensor · pilot-PWM limiter</text><text x="145" y="293" text-anchor="middle" fill="#8fa1c0" font-size="11.5">contactor · signed cmds</text>
  <path d="M145 110V168" stroke="#ff5468" stroke-width="2" marker-end="url(#arr)"/><text x="155" y="146" fill="#ff8a98" font-size="12">malicious setpoints</text>
  <rect x="340" y="140" width="260" height="210" rx="10" fill="#111a2b" stroke="#5aa9ff"/><text x="470" y="165" text-anchor="middle" font-weight="700" fill="#7fbcff">Feeder edge controller</text><text x="470" y="183" text-anchor="middle" fill="#8fa1c0" font-size="12">substation RTU · 1 Hz</text>
  <rect x="358" y="198" width="224" height="36" rx="6" fill="#16213a"/><text x="470" y="221" text-anchor="middle" font-size="12.5">L1 physical: ramp · CUSUM · overload</text>
  <rect x="358" y="240" width="224" height="36" rx="6" fill="#16213a"/><text x="470" y="263" text-anchor="middle" font-size="12.5">L2 cyber: requested vs authorised · sync</text>
  <rect x="358" y="282" width="224" height="52" rx="6" fill="#16213a"/><text x="470" y="303" text-anchor="middle" font-size="12.5">state machine</text><text x="470" y="322" text-anchor="middle" fill="#8fa1c0" font-size="11.5">WATCH → THROTTLE → ISOLATE → RECOVER</text>
  <path d="M270 268H338" stroke="#8fa1c0" stroke-width="2" marker-end="url(#ar)"/><path d="M338 300H272" stroke="#36d6c3" stroke-width="2" marker-end="url(#ar)"/><text x="276" y="258" fill="#8fa1c0" font-size="11">telemetry</text><text x="276" y="322" fill="#36d6c3" font-size="11">enforce</text>
  <rect x="680" y="60" width="400" height="140" rx="10" fill="#111a2b" stroke="#b18cff"/><text x="880" y="86" text-anchor="middle" font-weight="700" fill="#c9afff">National coordinator (L3)</text><text x="880" y="108" text-anchor="middle" fill="#8fa1c0" font-size="12">correlates feeders · PMU frequency &amp; RoCoF</text><text x="880" y="128" text-anchor="middle" fill="#8fa1c0" font-size="12">multi-feeder campaign ⇒ pre-empt the rest</text><text x="880" y="160" text-anchor="middle" fill="#8fa1c0" font-size="12">IEC 61850 · DNP3 · IEEE C37.118 · mTLS</text>
  <rect x="680" y="260" width="400" height="120" rx="10" fill="#111a2b" stroke="#ffb84a"/><text x="880" y="286" text-anchor="middle" font-weight="700" fill="#ffd089">Utility SCADA / EMS + operator</text><text x="880" y="308" text-anchor="middle" fill="#8fa1c0" font-size="12">alerts · quarantine review · manual override</text><text x="880" y="328" text-anchor="middle" fill="#8fa1c0" font-size="12">under-frequency load shedding stays as last resort</text>
  <path d="M600 200H678" stroke="#8fa1c0" stroke-width="2" marker-end="url(#ar)"/><path d="M680 150H602" stroke="#b18cff" stroke-width="2" marker-end="url(#ar)"/><path d="M600 300H678" stroke="#8fa1c0" stroke-width="2" marker-end="url(#ar)"/>
  <rect x="340" y="395" width="740" height="55" rx="10" fill="#0e2519" stroke="#3ddc84"/><text x="710" y="419" text-anchor="middle" font-weight="700" fill="#3ddc84">Goal: stop the artificial surge before the feeder relay (minutes) or UFLS (seconds) acts</text><text x="710" y="438" text-anchor="middle" fill="#8fa1c0" font-size="12">detection ≈ 3–5 s · command latency 1.5 s · charger slew ≈ 2 s</text>
  </g></svg>`;

  /* ------------------------------------------------------------- boot */
  setCtl(Object.assign({}, BASE));
  ['mYear', 'hYear'].forEach((id) => ($(id).value = 2040)); ['mHour', 'hHour'].forEach((id) => ($(id).value = 1.5)); $('mA').value = 0.95;
  resetSim();
  window.addEventListener('resize', () => draw(true));
  requestAnimationFrame(frame);
  const initial = location.hash.slice(1);
  if (['math', 'growth', 'homevs', 'bench', 'arch'].includes(initial)) showTab(initial);
  window.GGApp = { S, resetSim };
})();
