/*
 * GridGuard EV — simulation + defence engine
 * Cyberthorn hackathon prototype (theme: Cybersecurity & Critical Infrastructure Protection)
 *
 * Contents
 *   1. Parameters + demographic models (EV fleet, charger counts, load curves)
 *   2. Fleet builder (agent-based: each agent = a cluster of `w` real chargers)
 *   3. Reduced grid model (swing equation + governor + UFLS) used by the threat-math sweeps
 *   4. Simulation: fleet + feeders + relays + grid + the GridGuard detector/mitigator
 *
 * Works in the browser (window.GG) and in Node (require).
 * All numbers are ILLUSTRATIVE and parameterised; see docs/MODEL.md for the assumptions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const clamp01 = (x) => clamp(x, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }

  /* ------------------------------------------------------------ 1. parameters */
  const GRID = {
    f0: 50,
    peakMW: 34000, // UAE peak demand ~34 GW (2024, public reporting) — treated as one interconnected system
    H: 4.0, // aggregate inertia constant [s]
    R: 0.05, // governor droop
    D: 1.0, // load damping
    Tg: 4.0, // turbine-governor lag [s]
    reserve: 0.08, // spinning reserve as fraction of online generation
    onlineMargin: 1.15, // online generation = 1.15 x demand
    ufls: [
      { f: 49.0, shed: 0.1 },
      { f: 48.8, shed: 0.1 },
      { f: 48.6, shed: 0.15 },
      { f: 48.4, shed: 0.15 },
    ],
    uflsDelay: 0.3,
    collapseF: 47.5,
    rocofAlarm: 1.0, // Hz/s
  };
  const FEEDER = {
    margin: 0.12, // rating = (1+margin) x planned load (base + diversified EV load)
    pickup: 1.1, // relay pickup (x rating)
    heatLimit: 40, // inverse-time accumulator (pu^2*s)
    hotBaseFrac: 0.07, // EV-dense neighbourhood feeder: 7% of region base load ...
    hotProb: [0.4, 0.15, 0.05], // ... but this share of home / public-AC / DC chargers
  };

  // Schematic emirate layout (x,y in 0..1). loadShare / evShare are illustrative.
  const REGIONS = [
    { id: 'AUH', name: 'Abu Dhabi', loadShare: 0.4, evShare: 0.28, x: 0.26, y: 0.7 },
    { id: 'DXB', name: 'Dubai', loadShare: 0.3, evShare: 0.5, x: 0.56, y: 0.43 },
    { id: 'SHJ', name: 'Sharjah', loadShare: 0.1, evShare: 0.1, x: 0.64, y: 0.34 },
    { id: 'AJM', name: 'Ajman', loadShare: 0.04, evShare: 0.03, x: 0.69, y: 0.27 },
    { id: 'UAQ', name: 'Umm Al Quwain', loadShare: 0.03, evShare: 0.02, x: 0.72, y: 0.2 },
    { id: 'RAK', name: 'Ras Al Khaimah', loadShare: 0.07, evShare: 0.04, x: 0.8, y: 0.1 },
    { id: 'FUJ', name: 'Fujairah', loadShare: 0.06, evShare: 0.03, x: 0.9, y: 0.34 },
  ];
  const CLASSES = [
    { id: 0, key: 'home', name: 'Home AC unit' },
    { id: 1, key: 'pubac', name: 'Public AC post' },
    { id: 2, key: 'dc', name: 'DC fast charger' },
  ];

  // ---- EV adoption (interpolated in logit space between policy anchors)
  const EV_ANCHORS = [
    [2024, 0.015],
    [2025, 0.02], // ~2% (Dubai 47,944 EVs end-2025; UAE ~100k)
    [2030, 0.1], // UAE National EV Policy: ~10% of fleet by 2030
    [2040, 0.3],
    [2050, 0.5], // UAE National EV Policy: 50% of fleet by 2050
  ];
  const logit = (p) => Math.log(p / (1 - p));
  const sigm = (x) => 1 / (1 + Math.exp(-x));
  function evShareOfFleet(year, accel) {
    const A = EV_ANCHORS;
    let l;
    if (year <= A[0][0]) l = logit(A[0][1]);
    else if (year >= A[A.length - 1][0]) l = logit(A[A.length - 1][1]) + (year - A[A.length - 1][0]) * 0.08;
    else {
      let k = 0;
      while (year > A[k + 1][0]) k++;
      const t = (year - A[k][0]) / (A[k + 1][0] - A[k][0]);
      l = lerp(logit(A[k][1]), logit(A[k + 1][1]), t);
    }
    return sigm(l + (accel ? 0.7 : 0));
  }
  const vehicleParc = (year) => 4.5e6 * Math.pow(1.03, year - 2025);
  const evCount = (year, accel) => vehicleParc(year) * evShareOfFleet(year, accel);
  function chargerCounts(year, accel) {
    const ev = evCount(year, accel);
    const pubPerEv = clamp(0.02 + (year - 2025) * 0.008, 0.02, 0.1);
    const pub = ev * pubPerEv;
    return { ev, home: ev * 0.6, pubac: pub * 0.88, dc: pub * 0.12, public: pub, total: ev * 0.6 + pub };
  }

  // ---- diurnal curves (h = hour of day 0..24)
  const baseLoadFrac = (h) => 0.8 + 0.2 * Math.cos((2 * Math.PI * (h - 15.5)) / 24); // UAE summer-like
  const plugProb = [
    (h) => 0.55 + 0.3 * Math.cos((2 * Math.PI * (h - 2)) / 24), // home: ~85% at 02:00
    (h) => 0.35 + 0.25 * Math.cos((2 * Math.PI * (h - 13)) / 24), // public AC: office/mall hours
    (h) => 0.25 + 0.2 * Math.cos((2 * Math.PI * (h - 15)) / 24), // DC: daytime travel
  ];
  const dcTaper = (soc) => (soc < 0.8 ? 1 : Math.max(0.1, 1 - ((soc - 0.8) / 0.2) * 0.9));

  /* ------------------------------------------------------------- 2. fleet */
  function buildFleet(cfg) {
    const rng = rng32(cfg.seed);
    const counts = chargerCounts(cfg.year, cfg.accel);
    const N = cfg.agents || 2400;
    const classShare = [0.5, 0.25, 0.25];
    const devByClass = [counts.home, counts.pubac, counts.dc];
    const A = {
      n: 0, region: [], feeder: [], cls: [], w: [], maxKW: [], norm: [], plugged: [], soc: [], batt: [], target: [], startT: [],
      x: [], y: [],
    };
    const hh = cfg.hour < 12 ? cfg.hour + 24 : cfg.hour;
    REGIONS.forEach((reg, ri) => {
      for (let c = 0; c < 3; c++) {
        const n = Math.max(6, Math.round(N * classShare[c] * reg.evShare));
        const w = (devByClass[c] * reg.evShare) / n;
        for (let k = 0; k < n; k++) {
          const hot = rng() < FEEDER.hotProb[c] ? 1 : 0;
          let maxKW;
          if (c === 0) {
            const rated = rng() < 0.7 ? 7.4 : 11;
            maxKW = Math.min(rated, rng() < 0.55 ? 7.4 : 11);
          } else if (c === 1) maxKW = rng() < 0.55 ? 7.4 : 11; // 22 kW post, car on-board charger limits
          else {
            const rated = rng() < 0.5 ? 60 : 150;
            maxKW = Math.min(rated, [50, 100, 150][Math.floor(rng() * 3)]);
          }
          const plugged = rng() < plugProb[c](cfg.hour) ? 1 : 0;
          const needs = rng() < 0.5; // half of plugged cars actually need energy now
          let soc, target;
          if (c === 2) { soc = 0.1 + rng() * 0.5; target = 0.8; }
          else if (needs) { soc = 0.2 + rng() * 0.55; target = 0.8 + rng() * 0.2; }
          else { soc = 0.85 + rng() * 0.14; target = 0.8 + rng() * 0.15; }
          let startT = -1;
          if (c === 0 && rng() < 0.4) startT = (23 + rng() * 5 - hh) * 3600; // scheduled off-peak start 23:00-04:00
          // schematic scatter around emirate centre
          const ang = rng() * 6.283, rad = Math.sqrt(rng()) * (hot ? 0.025 : 0.06);
          A.region.push(ri); A.feeder.push(ri * 2 + hot); A.cls.push(c); A.w.push(w); A.maxKW.push(maxKW);
          A.norm.push(0.55 + rng() * 0.45); A.plugged.push(plugged); A.soc.push(soc); A.batt.push(50 + rng() * 50);
          A.target.push(target); A.startT.push(startT);
          A.x.push(reg.x + Math.cos(ang) * rad * 1.1 + (hot ? 0.015 : 0)); A.y.push(reg.y + Math.sin(ang) * rad);
          A.n++;
        }
      }
    });
    return { A, counts };
  }

  /* ------------------------------------------- 3. reduced grid (for sweeps) */
  // Single-area frequency response to a step of dP_pu (on online-generation base)
  function gridStep(dPpu, opts) {
    const g = Object.assign({}, GRID, opts || {});
    const dt = 0.05, T = (opts && opts.T) || 60;
    let df = 0, pm = 0, minF = 50, maxRocof = 0, shed = 0, t = 0, prevF = 50;
    const stageTimer = g.ufls.map(() => 0), stageDone = g.ufls.map(() => false);
    for (; t < T; t += dt) {
      const f = g.f0 * (1 + df);
      const pmCmd = clamp(-df / g.R, -0.1, g.reserve);
      pm += ((pmCmd - pm) / g.Tg) * dt;
      df += ((pm - (dPpu - shed) - g.D * df) / (2 * g.H)) * dt;
      const fNew = g.f0 * (1 + df);
      if (fNew < minF) minF = fNew;
      maxRocof = Math.max(maxRocof, (prevF - fNew) / dt);
      prevF = fNew;
      g.ufls.forEach((s, i) => {
        if (stageDone[i]) return;
        stageTimer[i] = fNew <= s.f ? stageTimer[i] + dt : 0;
        if (stageTimer[i] >= g.uflsDelay) { stageDone[i] = true; shed += s.shed * (opts && opts.shedBase ? opts.shedBase : 1 / g.onlineMargin); }
      });
      void f;
    }
    return { minF, maxRocof, shedStages: stageDone.filter(Boolean).length, finalF: g.f0 * (1 + df) };
  }
  // smallest step (pu of online generation) that trips UFLS stage 1
  function uflsThresholdPu(opts) {
    let lo = 0, hi = 0.6;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      gridStep(mid, Object.assign({ T: 40 }, opts)).shedStages > 0 ? (hi = mid) : (lo = mid);
    }
    return hi;
  }

  /* ---------------------------------------------------------- 4. simulation */
  const ST = { NORMAL: 0, WATCH: 1, THROTTLE: 2, ISOLATE: 3, RECOVER: 4 };
  const ST_NAME = ['NORMAL', 'WATCH', 'THROTTLE', 'ISOLATE', 'RECOVER'];

  const DEFAULTS = {
    year: 2035, accel: false, hour: 1.5, seed: 7,
    scope: 'national', // local (one hot-spot feeder) | region | national
    region: 'DXB', pct: 0.4, cls: 'all', // all | home | public
    a: 0.95, // attack setpoint as fraction of what the car's BMS will accept (>1 => BMS cuts the car off)
    style: 'step', jitter: 8, rampDur: 90, // step = botnet fires within `jitter` s; ramp = stealthy rise over rampDur s
    poisoned: false, // CSMS/aggregator compromised: attacker's setpoints look authorised
    benign: false, // legit synchronised off-peak tariff start instead of an attack
    defense: true, enforceProb: 0.95, latency: 1.5,
    tAttack: 30, dt: 0.25, agents: 2400,
  };

  class Simulation {
    constructor(userCfg) {
      const cfg = (this.cfg = Object.assign({}, DEFAULTS, userCfg || {}));
      const { A, counts } = buildFleet(cfg);
      this.counts = counts;
      const n = (this.n = A.n);
      this.region = Int8Array.from(A.region); this.feeder = Int8Array.from(A.feeder); this.cls = Int8Array.from(A.cls);
      this.w = Float32Array.from(A.w); this.maxKW = Float32Array.from(A.maxKW); this.norm = Float32Array.from(A.norm);
      this.plugged = Int8Array.from(A.plugged); this.soc = Float32Array.from(A.soc); this.batt = Float32Array.from(A.batt);
      this.target = Float32Array.from(A.target); this.startT = Float32Array.from(A.startT);
      this.x = Float32Array.from(A.x); this.y = Float32Array.from(A.y);
      this.P = new Float32Array(n); this.Pslow = new Float32Array(n); this.req = new Float32Array(n); this.auth = new Float32Array(n);
      this.comp = new Int8Array(n); this.bms = new Int8Array(n); this.quar = new Int8Array(n); this.enforced = new Int8Array(n);
      this.cmdDelay = new Float32Array(n); this.quarAt = new Float32Array(n).fill(1e9); this.limited = new Int8Array(n);
      this.ring = new Float32Array(n * 6);
      const rngC = rng32(cfg.seed + 101), rngE = rng32(cfg.seed + 303);
      this.rngN = rng32(cfg.seed + 202);

      // --- choose compromised devices
      let compDevices = 0, candDevices = 0;
      for (let i = 0; i < n; i++) {
        const reg = REGIONS[this.region[i]];
        let cand = cfg.scope === 'national' ? true : cfg.scope === 'region' ? reg.id === cfg.region : reg.id === cfg.region && this.feeder[i] % 2 === 1;
        if (cfg.cls === 'home' && this.cls[i] !== 0) cand = false;
        if (cfg.cls === 'public' && this.cls[i] === 0) cand = false;
        const u = rngC(), d = rngC();
        if (cand) candDevices += this.w[i];
        if (!cfg.benign && cand && u < cfg.pct) {
          this.comp[i] = 1; compDevices += this.w[i];
          this.cmdDelay[i] = cfg.style === 'ramp' ? d * cfg.rampDur : d * cfg.jitter;
        }
        this.enforced[i] = rngE() < cfg.enforceProb ? 1 : 0;
      }
      this.compDevices = compDevices; this.candDevices = candDevices;

      // --- benign synchronised tariff start: 45% of waiting home chargers start inside 120 s
      if (cfg.benign) {
        const rb = rng32(cfg.seed + 404);
        for (let i = 0; i < n; i++) {
          if (this.startT[i] > 0 && rb() < 0.45) this.startT[i] = cfg.tAttack + rb() * 120;
        }
      }

      // --- feeders
      const nF = (this.nF = REGIONS.length * 2);
      const Bt = GRID.peakMW * baseLoadFrac(cfg.hour);
      this.Bt = Bt;
      this.F = {
        base: new Float64Array(nF), rating: new Float64Array(nF), noise: new Float64Array(nF), E: new Float64Array(nF), E0: new Float64Array(nF),
        heat: new Float64Array(nF), tripped: new Int8Array(nF), trippedAt: new Float64Array(nF).fill(-1),
        state: new Int8Array(nF), ex: new Float64Array(nF).fill(1), exTarget: new Float64Array(nF).fill(1), exApplyAt: new Float64Array(nF).fill(-1), pendEx: new Float64Array(nF).fill(1), holdUntil: new Float64Array(nF),
        clamp: new Float64Array(nF).fill(1), ewma: new Float64Array(nF), cusum: new Float64Array(nF), risk: new Float64Array(nF),
        sRamp: new Float64Array(nF), sDev: new Float64Array(nF), sSync: new Float64Array(nF), sCus: new Float64Array(nF),
        hiTicks: new Int16Array(nF), calmTicks: new Int16Array(nF), thrTicks: new Int16Array(nF), ratioHist: [], enteredThrottle: new Float64Array(nF).fill(-1),
        ratio: new Float64Array(nF), devMW: new Float64Array(nF), excessMW: new Float64Array(nF), Eh: [],
      };
      REGIONS.forEach((reg, ri) => {
        this.F.base[ri * 2] = Bt * reg.loadShare * (1 - FEEDER.hotBaseFrac);
        this.F.base[ri * 2 + 1] = Bt * reg.loadShare * FEEDER.hotBaseFrac;
      });
      for (let f = 0; f < nF; f++) { this.F.ratioHist.push([]); this.F.Eh.push([]); }

      // --- steady state at t=0
      this.t = 0;
      for (let i = 0; i < n; i++) {
        const { auth } = this._demand(i, -1);
        this.P[i] = this.Pslow[i] = auth;
        for (let k = 0; k < 6; k++) this.ring[i * 6 + k] = auth;
        this.F.E0[this.feeder[i]] += (auth * this.w[i]) / 1000;
      }
      for (let f = 0; f < nF; f++) {
        this.F.E[f] = this.F.E0[f];
        this.F.rating[f] = (this.F.base[f] + this.F.E0[f]) * (1 + FEEDER.margin);
        this.F.ewma[f] = this.F.E0[f];
      }
      this.L0 = 0; for (let f = 0; f < nF; f++) this.L0 += this.F.base[f] + this.F.E0[f];
      this.Sbase = Bt * GRID.onlineMargin;
      this.E0total = this.F.E0.reduce((s, v) => s + v, 0);

      // --- grid state
      this.df = 0; this.pm = 0; this.fHz = 50; this.rocof = 0; this.natNoise = 0; this.shedMW = 0;
      this.uflsTimer = GRID.ufls.map(() => 0); this.uflsDone = GRID.ufls.map(() => false); this.uflsAt = GRID.ufls.map(() => -1);
      this.fHist = [50, 50, 50, 50]; this.collapsed = false;
      this.hist = { t: [], f: [], load: [], ev: [], dEv: [], risk: [], shed: [], trip: [] };
      this.log = []; this.pending = [];
      this.metrics = {
        minF: 50, maxRocof: 0, firstShedAt: -1, peakShedMW: 0, peakDeltaMW: 0, firstDetectAt: -1, firstThrottleAt: -1,
        attackStart: cfg.benign ? -1 : cfg.tAttack, feederTrips: 0, tripLoadMW: 0, quarantined: 0, bmsTrips: 0, wentThrottle: false,
        everWatch: false, falseQuarantine: 0, collapsedAt: -1, lossMW: 0,
      };
      this.tick = 0; this.nextTick = 1;
      this.say(0, 'info', cfg.benign ? 'Scenario: legitimate synchronised off-peak tariff start (benign).' : `Attack armed: ${Math.round(compDevices).toLocaleString()} compromised chargers (${Math.round((compDevices / Math.max(1, candDevices)) * 100)}% of ${cfg.scope} scope).`);
    }

    say(t, level, msg) { this.log.push({ t, level, msg }); if (this.log.length > 400) this.log.shift(); }

    mxEff(i) { return this.cls[i] === 2 ? this.maxKW[i] * dcTaper(this.soc[i]) : this.maxKW[i]; }

    // authorised (CSMS) power and what the charger firmware actually requests
    _demand(i, t) {
      if (!this.plugged[i]) return { auth: 0, req: 0, known: 0 };
      const mx = this.mxEff(i);
      const auth = t >= this.startT[i] && this.soc[i] < this.target[i] ? this.norm[i] * mx : 0;
      let req = auth, known = auth;
      if (this.comp[i] && !this.bms[i] && t >= this.cfg.tAttack + this.cmdDelay[i] && this.soc[i] < 0.98) {
        req = this.cfg.a * mx;
        if (this.cfg.poisoned) known = req; // poisoned CSMS: attacker's profile is "authorised"
      }
      return { auth, req, known };
    }

    step() {
      const cfg = this.cfg, dt = cfg.dt, F = this.F, n = this.n, t = (this.t += dt);
      const guard = cfg.defense;
      // base-load noise (AR1)
      const rho = Math.exp(-dt / 20), sg = Math.sqrt(1 - rho * rho);
      for (let f = 0; f < this.nF; f++) F.noise[f] = F.noise[f] * rho + gauss(this.rngN) * 0.004 * F.base[f] * sg;
      this.natNoise = this.natNoise * rho + gauss(this.rngN) * 0.0015 * this.Bt * sg;
      // apply delayed guard commands
      for (let f = 0; f < this.nF; f++) if (F.exApplyAt[f] >= 0 && t >= F.exApplyAt[f]) { F.exTarget[f] = F.pendEx[f]; F.exApplyAt[f] = -1; }
      F.E.fill(0);
      const rampUp = 0.5, rampDn = 1.0;
      for (let i = 0; i < n; i++) {
        const f = this.feeder[i];
        if (F.tripped[f]) { this.P[i] = 0; this.req[i] = 0; this.auth[i] = 0; continue; }
        const d = this._demand(i, t);
        const mx = this.mxEff(i);
        // BMS cut-off if the attacker overdrives the setpoint beyond what the pack accepts
        if (this.comp[i] && cfg.a > 1.0 && !this.bms[i] && t >= cfg.tAttack + this.cmdDelay[i] + 1.0 && d.req > 0) {
          this.bms[i] = 1; this.metrics.bmsTrips += this.w[i]; d.req = 0;
        }
        this.req[i] = d.req; this.auth[i] = d.known;
        let tgt = d.req, lim = 0;
        if (guard && this.enforced[i]) {
          if (t >= this.quarAt[i]) this.quar[i] = 1;
          if (this.quar[i]) { tgt = Math.min(tgt, this.cls[i] === 2 ? 0 : 1.4); lim = 1; }
          else if (F.state[f] >= ST.THROTTLE) {
            const basis = cfg.poisoned ? Math.min(this.Pslow[i] * 1.1 + 0.2, mx) : d.auth;
            const cap = basis + F.ex[f] * (mx - basis);
            if (cap < tgt) { tgt = cap; lim = 1; }
          }
          if (F.clamp[f] < 1 && tgt > 0) { tgt *= F.clamp[f]; lim = 1; }
        }
        this.limited[i] = lim;
        const p = this.P[i];
        const np = p + clamp(tgt - p, -mx * rampDn * dt, mx * rampUp * dt);
        this.P[i] = np < 0 ? 0 : np;
        this.soc[i] = Math.min(1, this.soc[i] + (this.P[i] * dt) / 3600 / this.batt[i]);
        if (F.state[f] === ST.NORMAL) this.Pslow[i] += (this.P[i] - this.Pslow[i]) * (dt / 30);
        F.E[f] += (this.P[i] * this.w[i]) / 1000;
      }
      // guard ex slew
      for (let f = 0; f < this.nF; f++) {
        const target = F.exTarget[f], e = F.ex[f];
        F.ex[f] = target < e ? Math.max(target, e - 1.0 * dt) : Math.min(target, e + 0.05 * dt);
      }
      // feeder relays (inverse-time thermal accumulator)
      let load = 0, lossNow = 0;
      for (let f = 0; f < this.nF; f++) {
        if (F.tripped[f]) { lossNow += F.base[f] + F.E0[f]; continue; }
        const tot = F.base[f] + F.noise[f] + F.E[f];
        F.ratio[f] = tot / F.rating[f];
        if (F.ratio[f] > FEEDER.pickup) F.heat[f] += (Math.pow(F.ratio[f] / FEEDER.pickup, 2) - 1) * dt;
        else F.heat[f] = Math.max(0, F.heat[f] - 0.5 * dt);
        if (F.heat[f] >= FEEDER.heatLimit) {
          F.tripped[f] = 1; F.trippedAt[f] = t; this.metrics.feederTrips++; this.metrics.tripLoadMW += F.base[f] + F.E0[f];
          this.say(t, 'crit', `Breaker tripped on ${this.feederName(f)} feeder at ${(F.ratio[f] * 100).toFixed(0)}% of rating.`);
          lossNow += F.base[f] + F.E0[f];
        } else load += tot;
      }
      load += this.natNoise - this.shedMW;
      // grid frequency
      if (!this.collapsed) {
        const dPpu = (load - this.L0) / this.Sbase;
        const pmCmd = clamp(-this.df / GRID.R, -0.1, GRID.reserve);
        this.pm += ((pmCmd - this.pm) / GRID.Tg) * dt;
        this.df += ((this.pm - dPpu - GRID.D * this.df) / (2 * GRID.H)) * dt;
        this.fHz = GRID.f0 * (1 + this.df);
        this.fHist.push(this.fHz); const old = this.fHist.shift();
        this.rocof = (this.fHz - old) / (3 * dt);
        GRID.ufls.forEach((s, k) => {
          if (this.uflsDone[k]) return;
          this.uflsTimer[k] = this.fHz <= s.f ? this.uflsTimer[k] + dt : 0;
          if (this.uflsTimer[k] >= GRID.uflsDelay) {
            this.uflsDone[k] = true; this.uflsAt[k] = t;
            const mw = s.shed * this.Bt; this.shedMW += mw;
            if (this.metrics.firstShedAt < 0) this.metrics.firstShedAt = t;
            this.say(t, 'crit', `Load shedding stage ${k + 1} at ${this.fHz.toFixed(2)} Hz: ${Math.round(mw).toLocaleString()} MW of customers disconnected.`);
          }
        });
        if (this.fHz < GRID.collapseF) { this.collapsed = true; this.metrics.collapsedAt = t; this.say(t, 'crit', 'Frequency collapse: generators trip in cascade, system blackout.'); }
      }
      const m = this.metrics;
      if (this.fHz < m.minF) m.minF = this.fHz;
      if (-this.rocof > m.maxRocof) m.maxRocof = -this.rocof;
      const evTot = F.E.reduce((s, v) => s + v, 0);
      m.peakDeltaMW = Math.max(m.peakDeltaMW, evTot - this.E0total);
      m.peakShedMW = Math.max(m.peakShedMW, this.shedMW);
      m.lossMW = Math.max(m.lossMW, this.shedMW + lossNow);
      // control tick @1 Hz
      if (t >= this.nextTick - 1e-9) { this.nextTick += 1; this.tick++; this._control(evTot, load); }
    }

    feederName(f) { return REGIONS[f >> 1].name + (f % 2 ? ' (EV-dense district)' : ' (general)'); }

    /* ---------------------------------------------- GridGuard (1 Hz control) */
    _control(evTot, load) {
      const cfg = this.cfg, F = this.F, t = this.t, n = this.n, nF = this.nF;
      // per-feeder aggregates from charger-side telemetry
      const authSum = new Float64Array(nF), dev = new Float64Array(nF), excess = new Float64Array(nF), syncW = new Float64Array(nF), pluggedW = new Float64Array(nF), reqSum = new Float64Array(nF);
      const slot = this.tick % 6, oldSlot = (this.tick + 1) % 6;
      for (let i = 0; i < n; i++) {
        const f = this.feeder[i];
        this.ring[i * 6 + slot] = this.P[i];
        if (F.tripped[f] || !this.plugged[i]) continue;
        const w = this.w[i], mx = this.mxEff(i);
        pluggedW[f] += w; reqSum[f] += (this.req[i] * w) / 1000; authSum[f] += (this.auth[i] * w) / 1000;
        dev[f] += (Math.max(0, this.req[i] - this.auth[i]) * w) / 1000; // pre-limit demand vs CSMS-authorised
        const basis = cfg.poisoned ? Math.min(this.Pslow[i] * 1.1 + 0.2, mx) : this.auth[i];
        excess[f] += (Math.max(0, this.req[i] - basis) * w) / 1000;
        if (this.P[i] - this.ring[i * 6 + oldSlot] >= 0.25 * mx) syncW[f] += w;
      }
      if (this.cfg.defense) this._guard(dev, excess, syncW, pluggedW, authSum);
      else for (let f = 0; f < nF; f++) F.risk[f] = 0;
      const hs = this.hist;
      hs.t.push(t); hs.f.push(this.fHz); hs.load.push(load); hs.ev.push(evTot); hs.dEv.push(evTot - this.E0total);
      hs.risk.push(Math.max(...F.risk)); hs.shed.push(this.shedMW); hs.trip.push(this.metrics.feederTrips);
    }

    _guard(dev, excess, syncW, pluggedW, authSum) {
      const cfg = this.cfg, F = this.F, t = this.t, nF = this.nF;
      let nThrottle = 0;
      for (let f = 0; f < nF; f++) {
        if (F.tripped[f]) continue;
        const C = F.rating[f], E = F.E[f];
        const denom = Math.max(F.ewma[f], 0.02 * C) + 1e-9;
        // slope of EV load over 3 s window (relative per second)
        const h = F.Eh[f]; h.push(E); if (h.length > 4) h.shift();
        const slopeRel = h.length === 4 ? (h[3] - h[0]) / 3 / denom : 0;
        const rh = F.ratioHist[f]; rh.push(F.ratio[f]); if (rh.length > 4) rh.shift();
        const slopeTot = rh.length === 4 ? (rh[3] - rh[0]) / 3 : 0;
        // CUSUM against slow forecast
        // expected load: trusted CSMS schedule if available, otherwise slow statistical forecast
        const expected = cfg.poisoned ? F.ewma[f] : authSum[f];
        const r = (E - expected) / (Math.max(expected, 0.02 * C) + 1e-9);
        F.cusum[f] = Math.max(0, F.cusum[f] + r - 0.05);
        const tau = F.state[f] === ST.NORMAL ? 60 : 400;
        F.ewma[f] += (E - F.ewma[f]) / tau;
        const devRel = cfg.poisoned ? 0 : dev[f] / (Math.max(E, 0) + 0.02 * C);
        const syncFrac = syncW[f] / Math.max(1, pluggedW[f]);
        F.sRamp[f] = clamp01((slopeRel - 0.01) / 0.06);
        F.sDev[f] = clamp01((devRel - 0.15) / 0.5);
        F.sSync[f] = clamp01((syncFrac - 0.04) / 0.2);
        F.sCus[f] = clamp01(F.cusum[f] / 0.8);
        let risk = 0.35 * F.sDev[f] + 0.25 * F.sSync[f] + 0.25 * F.sRamp[f] + 0.15 * F.sCus[f];
        risk = Math.max(risk, clamp01((F.cusum[f] - 0.8) / 1.6) * 0.7);
        F.risk[f] = risk;
        const proj = F.ratio[f] + 10 * Math.max(0, slopeTot);
        const physical = proj > 1.04 && slopeTot > 0.002;
        const exRel = excess[f] / (Math.max(E, 0) + 0.02 * C);
        F.devMW[f] = dev[f]; F.excessMW[f] = excess[f];
        const st = F.state[f];
        // ---- state machine
        if (st === ST.NORMAL) {
          if (risk >= 0.3) { this._setState(f, ST.WATCH, `risk ${(risk * 100).toFixed(0)}% — tightening telemetry`); F.hiTicks[f] = 0; F.calmTicks[f] = 0; this.metrics.everWatch = true; }
        } else if (st === ST.WATCH) {
          F.hiTicks[f] = risk >= 0.55 ? F.hiTicks[f] + 1 : 0;
          F.calmTicks[f] = risk < 0.3 ? F.calmTicks[f] + 1 : 0;
          if (F.hiTicks[f] >= (risk >= 0.75 ? 1 : 2) || physical) this._enterThrottle(f, physical && F.hiTicks[f] < 1 ? 'projected feeder overload' : 'coordinated load surge');
          else if (F.calmTicks[f] >= 12 && t >= F.holdUntil[f]) { F.state[f] = ST.NORMAL; F.cusum[f] = 0; }
        } else if (st === ST.THROTTLE || st === ST.ISOLATE) {
          F.thrTicks[f]++;
          if (st === ST.THROTTLE && F.thrTicks[f] >= 5 && exRel > 0.15) this._enterIsolate(f);
          F.calmTicks[f] = risk < 0.2 && exRel < 0.05 ? F.calmTicks[f] + 1 : 0;
          if (F.calmTicks[f] >= 20) { this._setState(f, ST.RECOVER, 'threat cleared — staged release'); F.exTarget[f] = 1; F.pendEx[f] = 1; F.calmTicks[f] = 0; }
        } else if (st === ST.RECOVER) {
          if (risk >= 0.55 || exRel > 0.15) this._enterThrottle(f, 're-surge during recovery');
          else if (F.ex[f] >= 0.999) { F.calmTicks[f]++; if (F.calmTicks[f] >= 10) { F.state[f] = ST.NORMAL; F.cusum[f] = 0; F.ewma[f] = F.E[f]; } }
        }
        // ---- headroom clamp (dynamic load management; protects the feeder from any cause)
        if (F.ratio[f] > 0.97) F.clamp[f] = Math.max(0.2, F.clamp[f] * 0.9);
        else if (F.ratio[f] < 0.9) F.clamp[f] = Math.min(1, F.clamp[f] + 0.05);
        if (F.state[f] >= ST.THROTTLE && F.state[f] !== ST.RECOVER) nThrottle++;
      }
      // national coordination: several feeders under attack => assume campaign, pre-empt the rest
      const rocofAlert = this.rocof < -0.25 && this.fHz < 49.85;
      if (nThrottle >= 2 || (rocofAlert && nThrottle >= 1)) {
        let esc = 0;
        for (let f = 0; f < nF; f++) {
          if (F.tripped[f]) continue;
          if (F.state[f] === ST.NORMAL) { this._setState(f, ST.WATCH, 'national coordinator: campaign suspected'); F.holdUntil[f] = t + 40; }
          else if (F.state[f] === ST.WATCH && F.risk[f] >= 0.3) { this._enterThrottle(f, 'national coordinator pre-emption'); esc++; }
        }
        if (esc && !this._natLogged) { this._natLogged = true; this.say(t, 'warn', 'National coordinator: several feeders under attack at once, throttling the rest in advance.'); }
      }
    }

    _setState(f, s, why) {
      this.F.state[f] = s;
      const lvl = s >= ST.THROTTLE ? 'warn' : 'info';
      this.say(this.t, lvl, `${this.feederName(f)}: ${ST_NAME[s].toLowerCase()}${why ? ' (' + why + ')' : ''}`);
    }
    _enterThrottle(f, why) {
      const F = this.F;
      this._setState(f, ST.THROTTLE, why);
      F.thrTicks[f] = 0; F.calmTicks[f] = 0; F.enteredThrottle[f] = this.t;
      F.pendEx[f] = 0; F.exApplyAt[f] = this.t + this.cfg.latency;
      if (!this.metrics.wentThrottle) {
        this.metrics.wentThrottle = true; this.metrics.firstThrottleAt = this.t;
        this.say(this.t, 'good', `GridGuard started throttling ${(this.t - this.cfg.tAttack).toFixed(1)} s after the attack began, forcing chargers back to their scheduled rate.`);
      }
      if (this.cfg.benign) this.metrics.falseThrottle = (this.metrics.falseThrottle || 0) + 1;
    }
    _enterIsolate(f) {
      const F = this.F, cfg = this.cfg;
      this._setState(f, ST.ISOLATE, 'persistent non-compliance');
      let cnt = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.feeder[i] !== f || this.quar[i] || !this.plugged[i]) continue;
        const mx = this.mxEff(i);
        const basis = cfg.poisoned ? Math.min(this.Pslow[i] * 1.1 + 0.2, mx) : (this._demand(i, this.t).auth);
        if (this.req[i] - basis >= 0.25 * mx) { this.quarAt[i] = this.t + cfg.latency; cnt += this.w[i]; if (!this.comp[i]) this.metrics.falseQuarantine += this.w[i]; }
      }
      this.metrics.quarantined += cnt;
      this.say(this.t, 'warn', `${Math.round(cnt).toLocaleString()} non-compliant chargers quarantined at ${this.feederName(f)} (held at 6 A for operator review).`);
    }

    // Per feeder: MW an attacker could add if every connected charger were compromised, and the
    // compromised fraction that pushes the feeder past relay pickup. (valid on a fresh t=0 simulation)
    feederHeadroom() {
      const nF = this.nF, F = this.F, head = new Float64Array(nF), devices = new Float64Array(nF);
      for (let i = 0; i < this.n; i++) {
        const f = this.feeder[i];
        devices[f] += this.w[i];
        if (!this.plugged[i]) continue;
        const mx = this.mxEff(i), atk = this.soc[i] < 0.98 ? this.cfg.a * mx : 0;
        head[f] += (Math.max(0, atk - this._demand(i, 0).auth) * this.w[i]) / 1000;
      }
      const pStar = new Float64Array(nF);
      for (let f = 0; f < nF; f++) pStar[f] = (FEEDER.pickup * F.rating[f] - F.base[f] - F.E0[f]) / Math.max(1e-9, head[f]);
      return { head, devices, pStar };
    }

    run(seconds) {
      const steps = Math.round(seconds / this.cfg.dt);
      for (let i = 0; i < steps; i++) this.step();
      return this;
    }

    // ---- read-outs for UI / tests
    agentStatus(i) {
      if (!this.plugged[i]) return 4;
      if (this.F.tripped[this.feeder[i]]) return 5;
      if (this.quar[i]) return 3;
      if (this.comp[i] && this.req[i] > this.auth[i] + 0.1 && this.t >= this.cfg.tAttack) return this.limited[i] && this.P[i] < this.req[i] * 0.8 ? 2 : 1;
      return 0;
    }
    evLoadMW() { return this.F.E.reduce((s, v) => s + v, 0); }
    summary() {
      const m = this.metrics;
      return {
        minF: +m.minF.toFixed(3), maxRocof: +m.maxRocof.toFixed(3), shedMW: Math.round(m.peakShedMW), feederTrips: m.feederTrips,
        firstShedAt: m.firstShedAt, collapsed: this.collapsed, peakDeltaMW: Math.round(m.peakDeltaMW),
        detectLatency: m.firstThrottleAt >= 0 && m.attackStart >= 0 ? +(m.firstThrottleAt - m.attackStart).toFixed(1) : null,
        quarantined: Math.round(m.quarantined), falseQuarantine: Math.round(m.falseQuarantine), throttled: m.wentThrottle, watched: m.everWatch,
        lossMW: Math.round(m.lossMW), bmsTrips: Math.round(m.bmsTrips),
      };
    }
  }

  // convenience: run protected + unprotected twins for a scenario
  function runTwins(cfg, seconds) {
    const off = new Simulation(Object.assign({}, cfg, { defense: false })).run(seconds);
    const on = new Simulation(Object.assign({}, cfg, { defense: true })).run(seconds);
    return { off, on };
  }

  /* -------- headroom analytics: how much extra MW can a compromised class add? */
  function fleetHeadroom(cfg) {
    const base = Object.assign({}, DEFAULTS, cfg, { benign: true, defense: false });
    const { A, counts } = buildFleet(base);
    const out = { home: { dev: counts.home, plugged: 0, mw: 0, norm: 0 }, pubac: { dev: counts.pubac, plugged: 0, mw: 0, norm: 0 }, dc: { dev: counts.dc, plugged: 0, mw: 0, norm: 0 } };
    const keys = ['home', 'pubac', 'dc'];
    for (let i = 0; i < A.n; i++) {
      const o = out[keys[A.cls[i]]];
      if (!A.plugged[i]) continue;
      const mx = A.cls[i] === 2 ? A.maxKW[i] * dcTaper(A.soc[i]) : A.maxKW[i];
      const auth = 0 >= A.startT[i] && A.soc[i] < A.target[i] ? A.norm[i] * mx : 0;
      const atk = A.soc[i] < 0.98 ? base.a * mx : 0;
      o.plugged += A.w[i]; o.mw += (Math.max(0, atk - auth) * A.w[i]) / 1000; o.norm += (auth * A.w[i]) / 1000;
    }
    const Bt = GRID.peakMW * baseLoadFrac(base.hour);
    return { classes: out, Bt, Sbase: Bt * GRID.onlineMargin, counts };
  }

  return {
    GRID, FEEDER, REGIONS, CLASSES, DEFAULTS, ST, ST_NAME,
    evShareOfFleet, evCount, vehicleParc, chargerCounts, baseLoadFrac, plugProb, dcTaper,
    buildFleet, gridStep, uflsThresholdPu, fleetHeadroom, Simulation, runTwins, rng32, clamp,
  };
});
