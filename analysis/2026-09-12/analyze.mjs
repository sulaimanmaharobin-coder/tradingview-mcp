import { readFileSync, writeFileSync } from 'fs';
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const closes = b => b.map(x => x.close);

function ema(vals, p) {
  if (vals.length < p) return null;
  const k = 2 / (p + 1);
  let e = vals.slice(0, p).reduce((a, b) => a + b, 0) / p; // SMA seed
  for (let i = p; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}
function emaSeries(vals, p) {
  if (vals.length < p) return [];
  const k = 2 / (p + 1);
  let e = vals.slice(0, p).reduce((a, b) => a + b, 0) / p;
  const out = new Array(p - 1).fill(null); out.push(e);
  for (let i = p; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); out.push(e); }
  return out;
}
// Wilder RSI
function rsi(vals, p = 14) {
  if (vals.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = vals[i] - vals[i - 1]; d >= 0 ? g += d : l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function macd(vals) {
  const f = emaSeries(vals, 12), s = emaSeries(vals, 26);
  if (!f.length || !s.length) return null;
  const line = vals.map((_, i) => (f[i] != null && s[i] != null) ? f[i] - s[i] : null);
  const defined = line.filter(v => v != null);
  if (defined.length < 9) return null;
  const sig = emaSeries(defined, 9);
  const m = defined[defined.length - 1], sg = sig[sig.length - 1];
  return { macd: m, signal: sg, hist: m - sg };
}
// Fractal swing pivots
function pivots(bars, w = 2) {
  const hi = [], lo = [];
  for (let i = w; i < bars.length - w; i++) {
    let isH = true, isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isH = false;
      if (bars[j].low <= bars[i].low) isL = false;
    }
    if (isH) hi.push({ i, v: bars[i].high });
    if (isL) lo.push({ i, v: bars[i].low });
  }
  return { hi, lo };
}
function structure(bars4h) {
  const recent = bars4h.slice(-120);
  const { hi, lo } = pivots(recent, 2);
  if (hi.length < 2 || lo.length < 2) return { label: 'insufficient', detail: `${hi.length}H/${lo.length}L pivots` };
  const h = hi.slice(-2), l = lo.slice(-2);
  const HH = h[1].v > h[0].v, HL = l[1].v > l[0].v;
  const LH = h[1].v < h[0].v, LL = l[1].v < l[0].v;
  if (HH && HL) return { label: 'HH/HL', detail: 'higher highs + higher lows' };
  if (LH && LL) return { label: 'LH/LL', detail: 'lower highs + lower lows' };
  return { label: 'mixed', detail: `${HH ? 'HH' : 'LH'} + ${HL ? 'HL' : 'LL'}` };
}

const rows = [];
for (const [sym, d] of Object.entries(raw)) {
  const D = d.tf?.['1D']?.bars || [], W = d.tf?.['1W']?.bars || [], H4 = d.tf?.['4H']?.bars || [];
  const row = { sym, group: d.group, missing: [] };
  for (const [k, arr] of [['1W', W], ['1D', D], ['4H', H4]]) if (!arr.length) row.missing.push(k);
  if (!D.length || !H4.length) { row.bias = 'NO DATA'; rows.push(row); continue; }

  const dc = closes(D);
  row.price = dc[dc.length - 1];
  row.ema50 = ema(dc, 50);
  row.ema200 = dc.length >= 200 ? ema(dc, 200) : null;
  row.ema200_bars = dc.length;
  row.rsi = rsi(dc, 14);
  row.macd = macd(dc);
  row.wk_rsi = W.length ? rsi(closes(W), 14) : null;
  row.wk_ema50 = W.length >= 50 ? ema(closes(W), 50) : null;
  row.struct = structure(H4);
  row.distPct = ((row.price - row.ema50) / row.ema50) * 100;

  // "chopping around the 50 EMA": within 2% OR >=2 crossings in last 20 daily bars
  const e50s = emaSeries(dc, 50);
  let cross = 0;
  for (let i = dc.length - 20; i < dc.length; i++) {
    if (i < 1 || e50s[i] == null || e50s[i - 1] == null) continue;
    const a = dc[i - 1] - e50s[i - 1], b = dc[i] - e50s[i];
    if (a === 0 || b === 0) continue;
    if (Math.sign(a) !== Math.sign(b)) cross++;
  }
  row.crossings20 = cross;
  const chop = Math.abs(row.distPct) < 2 || cross >= 2;
  row.chop = chop;

  const above = row.price > row.ema50, below = row.price < row.ema50;
  // RSI is rounded to one decimal before comparing, so a value that displays as
  // 45.0 is treated as 45.0 (e.g. 45.0014 qualifies for "at or below 45").
  const rsiR = Math.round(row.rsi * 10) / 10;
  row.rsi_rounded = rsiR;
  const bull = above && rsiR >= 45 && rsiR <= 70 && row.struct.label === 'HH/HL';
  const bear = below && rsiR <= 45 && row.struct.label === 'LH/LL';
  const neut = chop && rsiR >= 40 && rsiR <= 60 && !['HH/HL', 'LH/LL'].includes(row.struct.label);

  const hits = [bull && 'BULLISH', bear && 'BEARISH', neut && 'NEUTRAL'].filter(Boolean);
  row.bias = hits.length === 1 ? hits[0] : hits.length > 1 ? `AMBIGUOUS (${hits.join('/')})` : 'NO CLEAN MATCH';
  row.fail = { above, below, rsi: row.rsi, struct: row.struct.label, chop };
  rows.push(row);
}
writeFileSync(process.argv[3], JSON.stringify(rows, null, 2));
const f = n => n == null ? 'n/a' : (Math.abs(n) >= 1000 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(4));
for (const r of rows) {
  if (r.bias === 'NO DATA') { console.log(`${r.sym.padEnd(20)} NO DATA (missing ${r.missing.join(',')})`); continue; }
  console.log(`${r.sym.padEnd(20)} ${String(r.bias).padEnd(22)} px=${f(r.price)} ema50=${f(r.ema50)} (${r.distPct>=0?'+':''}${r.distPct.toFixed(1)}%) ema200=${f(r.ema200)} rsi=${r.rsi==null?'n/a':r.rsi.toFixed(1)} 4H=${r.struct.label} chop=${r.chop} xs=${r.crossings20}${r.missing.length?' MISSING:'+r.missing.join(','):''}`);
}
