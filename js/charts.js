/* Tiny dependency-free canvas charts (works offline, no CDN) */
(function (root) {
  'use strict';
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const r = step0 / mag, step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  /* o: { series:[{label,color,data:[[x,y]],dash,width,fill}], xMin,xMax,yMin,yMax, hlines:[{y,label,color}], vlines:[{x,label,color}],
          xFmt,yFmt, xLabel, yLabel, legend:true, logY } */
  function line(canvas, o) {
    const { ctx, w, h } = setup(canvas);
    const m = { l: 52, r: 14, t: o.legend === false ? 10 : 24, b: o.xLabel ? 44 : 30 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    let xMin = o.xMin, xMax = o.xMax, yMin = o.yMin, yMax = o.yMax;
    const all = o.series.flatMap((s) => s.data);
    if (xMin == null) xMin = Math.min(...all.map((d) => d[0]));
    if (xMax == null) xMax = Math.max(...all.map((d) => d[0]));
    if (yMin == null) yMin = Math.min(...all.map((d) => d[1]));
    if (yMax == null) yMax = Math.max(...all.map((d) => d[1]));
    if (yMax === yMin) yMax = yMin + 1;
    const X = (x) => m.l + ((x - xMin) / (xMax - xMin || 1)) * pw;
    const Y = (y) => m.t + (1 - (y - yMin) / (yMax - yMin)) * ph;
    const grid = css('--grid'), txt = css('--muted');
    ctx.font = '11px ui-monospace, Consolas, monospace'; ctx.fillStyle = txt; ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(yMin, yMax, 5).forEach((v) => {
      const y = Y(v); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillText(o.yFmt ? o.yFmt(v) : String(v), m.l - 6, y);
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    niceTicks(xMin, xMax, Math.max(3, Math.floor(pw / 90))).forEach((v) => {
      const x = X(v); ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
      ctx.fillText(o.xFmt ? o.xFmt(v) : String(v), x, m.t + ph + 6);
    });
    if (o.xLabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xLabel, m.l + pw / 2, h - 3); }
    if (o.yLabel) { ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(o.yLabel, 0, 0); ctx.restore(); }
    // reference lines
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    (o.hlines || []).forEach((l) => {
      if (l.y < yMin || l.y > yMax) return;
      ctx.strokeStyle = l.color || txt; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(m.l, Y(l.y)); ctx.lineTo(w - m.r, Y(l.y)); ctx.stroke();
      if (l.label) { ctx.setLineDash([]); ctx.fillStyle = l.color || txt; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(l.label, m.l + 6, Y(l.y) - 2); }
    });
    (o.vlines || []).forEach((l) => {
      if (l.x < xMin || l.x > xMax) return;
      ctx.strokeStyle = l.color || txt; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(l.x), m.t); ctx.lineTo(X(l.x), m.t + ph); ctx.stroke();
      if (l.label) { ctx.setLineDash([]); ctx.fillStyle = l.color || txt; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(l.label, X(l.x) + 4, m.t + 2); }
    });
    ctx.setLineDash([]);
    o.series.forEach((s) => {
      if (!s.data.length) return;
      ctx.beginPath();
      s.data.forEach((d, i) => (i ? ctx.lineTo(X(d[0]), Y(d[1])) : ctx.moveTo(X(d[0]), Y(d[1]))));
      if (s.fill) { ctx.save(); ctx.lineTo(X(s.data[s.data.length - 1][0]), Y(yMin)); ctx.lineTo(X(s.data[0][0]), Y(yMin)); ctx.closePath(); ctx.globalAlpha = 0.12; ctx.fillStyle = s.color; ctx.fill(); ctx.restore(); ctx.beginPath(); s.data.forEach((d, i) => (i ? ctx.lineTo(X(d[0]), Y(d[1])) : ctx.moveTo(X(d[0]), Y(d[1])))); }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
    if (o.legend !== false) {
      let x = m.l; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '11px system-ui, sans-serif';
      o.series.forEach((s) => {
        if (!s.label) return;
        ctx.fillStyle = s.color; ctx.fillRect(x, 8, 14, 3);
        ctx.fillStyle = txt; ctx.fillText(s.label, x + 19, 10); x += ctx.measureText(s.label).width + 36;
      });
    }
    return { X, Y };
  }

  /* Horizontal bars: items [{label,value,color,note}] */
  function bars(canvas, o) {
    const { ctx, w, h } = setup(canvas);
    const m = { l: 130, r: 120, t: 8, b: 8 };
    const max = o.max || Math.max(...o.items.map((i) => i.value), 1e-9);
    const bh = (h - m.t - m.b) / o.items.length;
    ctx.font = '12px system-ui, sans-serif';
    o.items.forEach((it, i) => {
      const y = m.t + i * bh, bw = ((w - m.l - m.r) * it.value) / max;
      ctx.fillStyle = css('--muted'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(it.label, m.l - 8, y + bh / 2);
      ctx.fillStyle = it.color; ctx.fillRect(m.l, y + bh * 0.2, Math.max(2, bw), bh * 0.6);
      ctx.fillStyle = css('--text'); ctx.textAlign = 'left'; ctx.fillText(o.fmt ? o.fmt(it.value) : String(it.value), m.l + Math.max(2, bw) + 6, y + bh / 2);
    });
  }

  root.Charts = { line, bars };
})(window);
