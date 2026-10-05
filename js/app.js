/* GridGuard EV — live attack simulation UI */
(function () {
  'use strict';
  const G = window.GG, C = window.Charts;
  const $ = (id) => document.getElementById(id);
  const n0 = (v) => Math.round(v).toLocaleString('en-US');
  const hh = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + (h % 1 ? '30' : '00');
  const mmss = (t) => 'T+' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const COL = { off: '#e5534b', on: '#4caf7d', warn: '#d9a441', accent: '#7aa2d6' };
  const DURATION = 300, T_ATTACK = 30;

  /* ----------------------------------------------------------- presets */
  const BASE = { year: 2040, hour: 1.5, scope: 'national', region: 'DXB', pct: 0.6, cls: 'all', a: 0.95, style: 'step', poisoned: false, benign: false, enforceProb: 0.95 };
  const PRESETS = [
    { name: 'Nationwide overnight attack', cfg: {} },
    { name: 'Local attack on Dubai districts', cfg: { scope: 'local', region: 'DXB', pct: 0.7 } },
    { name: 'Slow ramp with compromised backend', cfg: { style: 'ramp', poisoned: true } },
    { name: 'Home chargers only', cfg: { cls: 'home', pct: 0.7 } },
    { name: 'Daytime attempt (cars unplugged)', cfg: { hour: 14 } },
    { name: 'Attacker overdrives the car batteries', cfg: { a: 1.1 } },
    { name: 'False-alarm test: legitimate tariff surge', cfg: { benign: true } },
    { name: 'Worst case: 2050, everything hacked, little control', cfg: { year: 2050, pct: 1, enforceProb: 0.3 } },
  ];
  PRESETS.forEach((p, i) => $('preset').add(new Option(p.name, i)));
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
    $('lbYear').textContent = ctl.year.value;
    $('lbHour').textContent = hh(+ctl.hour.value);
    $('lbPct').textContent = Math.round(ctl.pct.value * 100) + '%';
    $('lbA').textContent = Math.round(ctl.a.value * 100) + '% of limit';
    $('lbEnf').textContent = Math.round(ctl.enforceProb.value * 100) + '%';
    $('aNote').textContent = +ctl.a.value > 1
      ? 'Above 100% the car’s battery management opens its contactor, so the cars drop off and the attack defeats itself.'
      : 'Held just under what each car’s battery management will accept, so cars do not cut off.';
    ctl.region.disabled = ctl.scope.value === 'national';
  }
  $('preset').addEventListener('change', () => { setCtl(Object.assign({}, BASE, PRESETS[+$('preset').value].cfg)); resetSim(); });
  Object.values(ctl).forEach((e) => e.addEventListener('input', () => { labels(); resetSim(); }));

  /* ------------------------------------------------------- simulation */
  const S = { off: null, on: null, running: false, speed: 4, view: 'on', acc: 0, last: 0, done: false, cfg: null, logN: { off: 0, on: 0 }, lastChart: 0 };
  function resetSim() {
    S.cfg = Object.assign(readCfg(), { tAttack: T_ATTACK });
    S.off = new G.Simulation(Object.assign({}, S.cfg, { defense: false }));
    S.on = new G.Simulation(Object.assign({}, S.cfg, { defense: true }));
    S.running = false; S.done = false; S.acc = 0; S.logN = { off: 0, on: 0 };
    $('logOff').innerHTML = ''; $('logOn').innerHTML = '';
    $('btnRun').textContent = 'Launch attack'; $('btnPause').textContent = 'Pause';
    draw(true);
  }
  $('btnRun').addEventListener('click', () => {
    if (S.done || S.off.t > 0) resetSim();
    S.running = true; S.last = performance.now();
    $('btnRun').textContent = 'Restart'; $('btnPause').textContent = 'Pause';
  });
  $('btnPause').addEventListener('click', () => {
    if (S.off.t === 0 || S.done) return;
    S.running = !S.running; S.last = performance.now();
    $('btnPause').textContent = S.running ? 'Pause' : 'Resume';
  });
  $('btnSkip').addEventListener('click', () => {
    if (S.done) return;
    while (S.on.t < DURATION) { S.off.step(); S.on.step(); }
    S.running = false; S.done = true; $('btnRun').textContent = 'Restart'; draw(true);
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
      const dt = S.off.cfg.dt, steps = Math.floor(S.acc / dt); S.acc -= steps * dt;
      for (let i = 0; i < steps; i++) { S.off.step(); S.on.step(); if (S.on.t >= DURATION) break; }
      if (S.on.t >= DURATION) { S.running = false; S.done = true; }
      draw(S.done);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- panels */
  const KP = [
    { k: 'Grid frequency', f: (s) => s.fHz.toFixed(2) + ' Hz' },
    { k: 'Charging load above plan', f: (s) => '+' + n0(Math.max(0, s.evLoadMW() - s.E0total)) + ' MW' },
    { k: 'Customers load-shed', f: (s) => n0(s.shedMW) + ' MW' },
    { k: 'Feeders tripped', f: (s) => s.metrics.feederTrips + ' of 14' },
    { k: 'Time to throttle', f: (s) => (s.cfg.defense ? (s.metrics.firstThrottleAt >= 0 && s.metrics.attackStart >= 0 ? (s.metrics.firstThrottleAt - s.metrics.attackStart).toFixed(1) + ' s' : 'not yet') : 'no defence') },
  ];
  $('kpis').innerHTML = KP.map((p, i) => `<div class="kpi"><div class="k">${p.k}</div><div class="r off"><span>Unprotected</span><b id="kOff${i}"></b></div><div class="r on"><span>GridGuard</span><b id="kOn${i}"></b></div></div>`).join('');

  const chips = [];
  (function () {
    for (let row = 0; row < 2; row++) {
      $(row ? 'chipsH' : 'chipsG').innerHTML = G.REGIONS.map((r, ri) => `<div class="chip s0" id="chip${ri * 2 + row}"><b>${r.id}</b><span>normal</span></div>`).join('');
    }
    for (let f = 0; f < 14; f++) chips.push($('chip' + f));
  })();

  function setBanner(cls, msg) { $('banner').className = 'status ' + cls; $('bannerMsg').innerHTML = msg; }
  function verdict() {
    const a = S.off.summary(), b = S.on.summary(), c = S.cfg;
    if (c.benign) {
      return b.throttled || b.quarantined
        ? ['bad', `<b>False alarm.</b> GridGuard throttled a legitimate surge.`]
        : ['ok', `<b>No false alarm.</b> The scheduled surge (+${n0(b.peakDeltaMW)} MW) was recognised as legitimate. GridGuard ${b.watched ? 'only moved to watch' : 'stayed normal'}, throttled nothing and quarantined nothing.`];
    }
    const harmed = a.shedMW > 0 || a.feederTrips > 0 || a.collapsed;
    if (a.bmsTrips > 0 && !harmed) return ['ok', `<b>The attack defeated itself.</b> Forcing the rate past the battery limit made ${n0(a.bmsTrips)} cars cut off, so no extra load reached the grid.`];
    if (!harmed) return ['ok', `<b>No real impact on the grid.</b> Unprotected frequency bottomed out at ${a.minF.toFixed(2)} Hz (+${n0(a.peakDeltaMW)} MW). ${b.throttled ? 'GridGuard still throttled it within ' + b.detectLatency + ' s.' : 'Not enough connected load to matter. Try a later year, a larger share or night-time.'}`];
    const parts = [];
    if (a.shedMW) parts.push(`${n0(a.shedMW)} MW of customers shed (low point ${a.minF.toFixed(2)} Hz)`);
    if (a.feederTrips) parts.push(`${a.feederTrips} feeder breaker${a.feederTrips > 1 ? 's' : ''} tripped (${n0(a.lossMW)} MW blacked out)`);
    const saved = b.shedMW === 0 && b.feederTrips === 0;
    return [saved ? 'ok' : 'bad', `<b>${saved ? 'Blackout prevented.' : 'Only partly contained.'}</b> Unprotected: ${parts.join(', ')}. With GridGuard: low point ${b.minF.toFixed(2)} Hz, ${n0(b.shedMW)} MW shed, ${b.feederTrips} breakers tripped. Throttle started ${b.detectLatency ?? '?'} s after the attack and cut the surge by ${Math.round((1 - b.peakDeltaMW / Math.max(1, a.peakDeltaMW)) * 100)}%.`];
  }
  function banner() {
    $('clock').textContent = mmss(S.off.t);
    if (S.done) { const [c, m] = verdict(); return setBanner(c, m); }
    const c = S.cfg, t = S.off.t;
    if (t === 0) return setBanner('', 'Ready. Press Launch attack to start the clock; the attack begins at T+00:30.');
    if (t < T_ATTACK) return setBanner('', c.benign ? 'Normal overnight operation. A scheduled charging surge starts at T+00:30.' : 'Normal overnight operation. The botnet fires at T+00:30.');
    if (S.off.shedMW > 0 || S.off.F.tripped.some((x) => x)) return setBanner('bad', '<b>The unprotected grid is failing:</b> load is being shed and feeder breakers are tripping. The map shows the GridGuard side.');
    setBanner('', c.benign ? 'A legitimate surge is under way. Watching whether GridGuard overreacts.' : '<b>Attack in progress.</b> Chargers are ramping together and GridGuard is scoring the surge.');
  }

  const STCOL = ['#5b7a8c', '#e5534b', '#d9a441', '#9a86c9', null, '#555'];
  const OUTLINE = [[0.04, 0.88], [0.1, 0.78], [0.2, 0.63], [0.34, 0.56], [0.48, 0.48], [0.6, 0.37], [0.7, 0.24], [0.76, 0.08], [0.83, 0.05], [0.87, 0.16], [0.95, 0.3], [0.96, 0.42], [0.88, 0.54], [0.72, 0.62], [0.6, 0.72], [0.52, 0.92], [0.3, 0.98], [0.1, 0.98]];
  const RING = ['#2f6b4d', '#d9a441', '#e5534b', '#9a86c9', '#7aa2d6'];
  function drawMap() {
    const cv = $('map'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const sim = S.view === 'on' ? S.on : S.off;
    ctx.beginPath(); OUTLINE.forEach((p, i) => (i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h))); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
    let last = -1;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < sim.n; i++) {
      const st = sim.agentStatus(i);
      if (st === 4) { if (pass === 0) { ctx.fillStyle = 'rgba(138,148,158,0.16)'; ctx.fillRect(sim.x[i] * w - 0.5, sim.y[i] * h - 0.5, 1.2, 1.2); } continue; }
      const hot = st === 1 || st === 2 || st === 3;
      if ((pass === 0) === hot) continue;
      if (st !== last) { ctx.fillStyle = STCOL[st]; last = st; }
      ctx.beginPath(); ctx.arc(sim.x[i] * w, sim.y[i] * h, hot ? 2.2 : 1.7, 0, 6.283); ctx.fill();
    }
    ctx.font = '11.5px system-ui, sans-serif'; ctx.textAlign = 'center';
    G.REGIONS.forEach((r, ri) => {
      const fs = [ri * 2, ri * 2 + 1];
      const tripped = fs.some((f) => sim.F.tripped[f]), worst = Math.max(...fs.map((f) => sim.F.state[f]));
      ctx.strokeStyle = tripped ? '#e5534b' : RING[worst]; ctx.lineWidth = tripped || worst ? 2 : 1;
      ctx.beginPath(); ctx.arc(r.x * w, r.y * h, 20, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = tripped ? '#f08a84' : '#b9c0c7'; ctx.fillText(r.name + (tripped ? ' (out)' : ''), r.x * w, r.y * h - 26);
    });
    if (sim.collapsed) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f08a84'; ctx.font = '600 26px system-ui'; ctx.fillText('System collapse', w / 2, h / 2); }
  }

  function updateKpis() {
    KP.forEach((p, i) => { $('kOff' + i).textContent = p.f(S.off); $('kOn' + i).textContent = p.f(S.on); });
    [S.off, S.on].forEach((s, k) => { $((k ? 'kOn' : 'kOff') + '0').style.color = s.fHz < 49.0 ? '#f08a84' : s.fHz < 49.7 ? '#d9a441' : ''; });
    for (let f = 0; f < 14; f++) {
      const tripped = S.on.F.tripped[f], st = S.on.F.state[f];
      chips[f].className = 'chip ' + (tripped ? 'trip' : 's' + st);
      chips[f].lastChild.textContent = tripped ? 'tripped' : G.ST_NAME[st].toLowerCase();
    }
  }
  function updateLogs() {
    ['off', 'on'].forEach((k) => {
      const sim = S[k], box = $(k === 'off' ? 'logOff' : 'logOn'), all = sim.log;
      let added = false;
      for (let i = Math.min(S.logN[k], all.length); i < all.length; i++) {
        const l = all[i], d = document.createElement('div'); d.className = l.level;
        d.innerHTML = `<span class="tt">${mmss(l.t)}</span>${l.msg}`; box.appendChild(d); added = true;
      }
      S.logN[k] = all.length;
      if (added) box.scrollTop = box.scrollHeight;
    });
  }
  function drawCharts() {
    const xf = (v) => Math.round(v) + 's', xl = 'time since scenario start (s)';
    const vl = [{ x: T_ATTACK, label: S.cfg.benign ? 'surge' : 'attack', color: S.cfg.benign ? COL.warn : COL.off }];
    const pts = (sim, key) => sim.hist.t.map((t, i) => [t, sim.hist[key][i]]);
    C.line($('chF'), {
      xMin: 0, xMax: DURATION, yMin: 48.4, yMax: 50.15, yFmt: (v) => v.toFixed(1), xFmt: xf, yLabel: 'Hz', xLabel: xl,
      series: [{ label: 'unprotected', color: COL.off, data: pts(S.off, 'f') }, { label: 'with GridGuard', color: COL.on, data: pts(S.on, 'f') }],
      hlines: [{ y: 50, color: '#4a535c' }, { y: 49.0, label: 'load shedding starts (49.0 Hz)', color: COL.warn }, { y: 48.4, label: 'final stage', color: '#a04540' }], vlines: vl,
    });
    const ymax = Math.max(500, ...S.off.hist.dEv, ...S.on.hist.dEv) * 1.1;
    C.line($('chL'), {
      xMin: 0, xMax: DURATION, yMin: 0, yMax: ymax, yFmt: n0, xFmt: xf, yLabel: 'MW', xLabel: xl,
      series: [{ label: 'unprotected', color: COL.off, data: pts(S.off, 'dEv'), fill: true }, { label: 'with GridGuard', color: COL.on, data: pts(S.on, 'dEv'), fill: true }], vlines: vl,
    });
    C.line($('chR'), {
      xMin: 0, xMax: DURATION, yMin: 0, yMax: 1, yFmt: (v) => v.toFixed(1), xFmt: xf, legend: false, yLabel: 'risk score (0-1)', xLabel: xl,
      series: [{ color: COL.accent, data: pts(S.on, 'risk') }], hlines: [{ y: 0.3, label: 'watch', color: COL.warn }, { y: 0.55, label: 'throttle', color: COL.off }], vlines: vl,
    });
  }
  function draw(force) {
    const now = performance.now();
    drawMap(); updateKpis(); banner(); updateLogs();
    if (force || now - S.lastChart > 120) { drawCharts(); S.lastChart = now; }
  }

  /* ------------------------------------------------------------- boot */
  setCtl(BASE);
  resetSim();
  window.addEventListener('resize', () => draw(true));
  requestAnimationFrame(frame);
})();
