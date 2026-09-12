// Overnight watch → daily actionable-setups report.
// usage: node analysis/watch/daily.mjs [--no-pull]   (run from anywhere)
// Steps: pull fresh bars (collect.mjs) → classify bias per rules.json → read TradingView alerts fired
// since last run → evaluate setups.json against 4H bars → rank → write <date>/report.{json,md,html} + latest.html
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as L from '../2026-09-12/ta-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const NOPULL = process.argv.includes('--no-pull');
const now = new Date();
const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const DIR = join(HERE, localDate); mkdirSync(DIR, { recursive: true });
const RAW = join(DIR, 'raw.json');
const STATE = join(HERE, 'state.json');
const RULES = JSON.parse(readFileSync(join(REPO, 'rules.json'), 'utf8').trim().replace(/^[^{]+/, ''));
const SETUPS = JSON.parse(readFileSync(join(HERE, 'setups.json'), 'utf8'));
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { last_run: null, alert_fired: {} };
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

// ── 1. pull ────────────────────────────────────────────────────────────────
if (!NOPULL || !existsSync(RAW)) {
  log(`[pull] collect.mjs → ${RAW}`);
  const r = spawnSync(process.execPath, [join(HERE, '..', '2026-09-12', 'collect.mjs'), RAW], { stdio: 'inherit', cwd: DIR });
  if (r.status !== 0) log(`[pull] collect exited ${r.status} — continuing with whatever was saved`);
}
const raw = JSON.parse(readFileSync(RAW, 'utf8'));

// ── 2. bias per rules.json (same math as report.mjs) ───────────────────────
const wl = RULES.watchlist; const order = [...wl.majors, ...wl.alts, ...wl.macro];
const rows = {};
for (const sym of order) {
  const d = raw[sym]; const D = d?.tf?.['1D']?.bars || [], W = d?.tf?.['1W']?.bars || [], H4 = d?.tf?.['4H']?.bars || [];
  if (D.length < 60 || H4.length < 20) { rows[sym] = { sym, ok: false }; continue; }
  const dc = L.closes(D), e50 = L.emaSeries(dc, 50);
  const r = { sym, ok: true, price: dc.at(-1), ema50: e50.at(-1), ema200: dc.length >= 200 ? L.ema(dc, 200) : null, rsi: L.rsi(dc), wk_rsi: W.length > 15 ? L.rsi(L.closes(W)) : null, macd: L.macd(dc), atr: L.atr(D) };
  r.dist = (r.price - r.ema50) / r.ema50 * 100; r.rsiR = Math.round(r.rsi * 10) / 10; r.struct = L.structure(H4).label;
  let x = 0; for (let i = dc.length - 20; i < dc.length; i++) { if (i < 1 || e50[i] == null || e50[i-1] == null) continue; const a = dc[i-1]-e50[i-1], b = dc[i]-e50[i]; if (a && b && Math.sign(a) !== Math.sign(b)) x++; }
  r.chop = Math.abs(r.dist) < 2 || x >= 2;
  const bull = r.price > r.ema50 && r.rsiR >= 45 && r.rsiR <= 70 && r.struct === 'HH/HL';
  const bear = r.price < r.ema50 && r.rsiR <= 45 && r.struct === 'LH/LL';
  const neut = r.chop && r.rsiR >= 40 && r.rsiR <= 60 && !['HH/HL','LH/LL'].includes(r.struct);
  const hits = [bull && 'BULLISH', bear && 'BEARISH', neut && 'NEUTRAL'].filter(Boolean);
  r.bias = hits.length === 1 ? hits[0] : hits.length > 1 ? 'AMBIGUOUS' : 'NO CLEAN MATCH';
  r.chg1 = (dc.at(-1) / dc.at(-2) - 1) * 100; r.H4 = H4; r.D = D;
  rows[sym] = r;
}
const prev = state.bias || {};
const biasChanges = order.filter(s => rows[s].ok && prev[s] && prev[s] !== rows[s].bias).map(s => ({ sym: s, from: prev[s], to: rows[s].bias }));
const majorBull = wl.majors.filter(s => rows[s].bias === 'BULLISH'), majorBear = wl.majors.filter(s => rows[s].bias === 'BEARISH');

// ── 3. alerts fired since last run (via CDP; tolerate TradingView being down) ─
let alertsFired = [], alertNote = '';
try {
  const A = await import('../../src/core/alerts.js'); const C = await import('../../src/connection.js');
  const res = await A.list();
  for (const a of res.alerts || []) {
    const lf = a.last_fired || null; const seen = state.alert_fired[a.alert_id] || null;
    if (lf && lf !== seen) alertsFired.push({ id: a.alert_id, sym: a.symbol, type: a.type, message: a.message, fired: lf, active: a.active });
    state.alert_fired[a.alert_id] = lf;
  }
  state.alert_count = (res.alerts || []).length;
  try { await C.disconnect(); } catch {}
} catch (e) { alertNote = `alert check failed: ${e.message}`; }

// ── 4. evaluate setups against 4H bars since last run (min 24h) ───────────
const since = Math.max(state.last_run ? state.last_run - 3600 : 0, Math.floor(now.getTime()/1000) - 24*3600);
const gateOk = g => g === 'none' ? true : g === 'major_clean_bullish' ? majorBull.length > 0 : g === 'major_clean_bearish' ? majorBear.length > 0 : true;
const evals = SETUPS.setups.map(s => {
  const r = rows[s.sym]; if (!r?.ok) return { ...s, status: 'no data' };
  const recent = r.H4.filter(b => b.time >= since); const last = r.H4.at(-1); const px = r.price;
  const [zlo, zhi] = s.zone; const long = s.dir === 'long';
  const touched = recent.some(b => b.low <= zhi && b.high >= zlo);
  const inZone = px >= zlo && px <= zhi;
  const invalidated = long ? recent.some(b => b.close < s.stop) || px < s.stop : recent.some(b => b.close > s.stop) || px > s.stop;
  const invalid2 = s.invalidation != null && (long ? r.D.at(-2).close < s.invalidation : r.D.at(-2).close > s.invalidation);
  const holding = long ? last.close >= zlo : last.close <= zhi;
  const rr = long ? (s.target - px) / (px - s.stop) : (px - s.target) / (s.stop - px);
  const distToZone = long ? (px - zhi) / px * 100 : (zlo - px) / px * 100; // + = not yet reached
  const biasOk = long ? r.price > r.ema50 : r.price < r.ema50;
  const gate = gateOk(s.gate);
  let status = 'pending';
  if (invalidated || invalid2) status = 'invalidated';
  else if (touched && holding && biasOk && gate && rr >= RULES.risk_rules.min_rr_ratio) status = 'ACTIONABLE';
  else if (touched && holding && (!gate || !biasOk)) status = 'triggered-but-gated';
  else if (touched && !holding) status = 'touched-not-holding';
  else if (touched && rr < 2) status = 'touched-rr<2';
  else if (distToZone < 1.5) status = 'approaching';
  const size = `0.01 × equity ÷ ${Math.abs(px - s.stop).toPrecision(4)}`;
  return { ...s, status, price: px, touched, inZone, holding, invalidated: invalidated || invalid2, rr: +rr.toFixed(2), distToZone: +distToZone.toFixed(2), biasOk, gate, bias: r.bias, size_formula: size, atr_pct: +(r.atr / px * 100).toFixed(2) };
});
const rank = { 'ACTIONABLE': 0, 'approaching': 1, 'triggered-but-gated': 2, 'touched-not-holding': 3, 'touched-rr<2': 4, 'pending': 5, 'invalidated': 6, 'no data': 7 };
evals.sort((a, b) => rank[a.status] - rank[b.status] || (b.rr || 0) - (a.rr || 0));
const regime = SETUPS.regime_levels.map(l => { const r = rows[l.sym]; if (!r?.ok) return { ...l, hit: null }; const hit = l.above != null ? r.price > l.above : r.price < l.below; return { ...l, price: r.price, hit }; });
const dow = now.getDay(); const weekend = dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 20);
const tradeWindow = weekend ? 'CLOSED — weekend thin liquidity (risk_rules)' : 'open — check CPI/FOMC calendar manually before entering';
const actionable = evals.filter(e => e.status === 'ACTIONABLE');

// ── 5. write outputs ──────────────────────────────────────────────────────
const fmt = (v, sym) => v == null ? '—' : sym?.startsWith('CRYPTOCAP') ? (sym.endsWith('BTC.D') ? v.toFixed(2) + '%' : v >= 1e12 ? (v / 1e12).toFixed(3) + 'T' : (v / 1e9).toFixed(1) + 'B') : v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 10 ? v.toFixed(2) : v.toFixed(4);
const pct = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const report = { date: localDate, generated: now.toISOString(), trade_window: tradeWindow, majors_clean: { bullish: majorBull, bearish: majorBear }, actionable, setups: evals, bias: order.map(s => { const r = rows[s]; return r.ok ? { sym: s, bias: r.bias, price: r.price, chg1: +r.chg1.toFixed(2), dist50: +r.dist.toFixed(2), rsi: +r.rsi.toFixed(1), struct: r.struct } : { sym: s, bias: 'NO DATA' }; }), bias_changes: biasChanges, alerts_fired: alertsFired, alert_note: alertNote, regime };
writeFileSync(join(DIR, 'report.json'), JSON.stringify(report, null, 2));

const md = [`# Overnight watch — ${localDate}`, '', `Generated ${now.toLocaleString()} · Trade window: **${tradeWindow}** · Clean majors: bullish [${majorBull.map(s=>s.split(':')[1]).join(', ')||'none'}] bearish [${majorBear.map(s=>s.split(':')[1]).join(', ')||'none'}]`, '',
  `## Actionable now (${actionable.length})`, '',
  ...(actionable.length ? actionable.map(e => `- **${e.name}** ${e.dir.toUpperCase()} @ ${fmt(e.price, e.sym)} · zone ${fmt(e.zone[0], e.sym)}–${fmt(e.zone[1], e.sym)} · stop ${fmt(e.stop, e.sym)} · target ${fmt(e.target, e.sym)} · **${e.rr}R** from here · size = ${e.size_formula} · ${e.note}`) : ['- none — no plan has a touched zone that is holding with bias, gate and ≥2R all satisfied.']), '',
  '## All setups', '', '| Setup | Status | Price | Zone | Stop | Target | R:R now | To zone | Bias | Gate |', '|---|---|---|---|---|---|---|---|---|---|',
  ...evals.map(e => `| ${e.name} | ${e.status} | ${fmt(e.price, e.sym)} | ${fmt(e.zone[0], e.sym)}–${fmt(e.zone[1], e.sym)} | ${fmt(e.stop, e.sym)} | ${fmt(e.target, e.sym)} | ${e.rr ?? '—'} | ${e.distToZone != null ? pct(e.distToZone) : '—'} | ${e.bias ?? '—'} | ${e.gate === false ? 'blocked' : 'ok'} |`), '',
  `## Alerts fired since last run (${alertsFired.length})${alertNote ? ' — ' + alertNote : ''}`, '', ...(alertsFired.length ? alertsFired.map(a => `- ${a.fired} · ${a.sym} · ${a.message}${a.active ? '' : ' (now inactive — replace it)'}`) : ['- none']), '',
  `## Bias changes (${biasChanges.length})`, '', ...(biasChanges.length ? biasChanges.map(c => `- ${c.sym}: ${c.from} → ${c.to}`) : ['- none']), '',
  '## Regime levels', '', ...regime.map(l => `- ${l.sym} ${l.above != null ? '> ' + fmt(l.above, l.sym) : '< ' + fmt(l.below, l.sym)}: ${l.hit == null ? 'no data' : l.hit ? '**HIT**' : 'not hit'} (now ${fmt(l.price, l.sym)}) — ${l.meaning}`), '',
  '## Bias scan', '', '| Symbol | Bias | Price | 1d | vs 50D | RSI D | 4H |', '|---|---|---|---|---|---|---|',
  ...report.bias.map(b => b.bias === 'NO DATA' ? `| ${b.sym} | NO DATA | | | | | |` : `| ${b.sym.split(':')[1]} | ${b.bias} | ${fmt(b.price, b.sym)} | ${pct(b.chg1)} | ${pct(b.dist50)} | ${b.rsi.toFixed(1)} | ${b.struct} |`), ''].join('\n');
writeFileSync(join(DIR, 'report.md'), md);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cls = b => ({ BULLISH: 'bull', BEARISH: 'bear', NEUTRAL: 'neut', AMBIGUOUS: 'amb' })[b] || 'none';
const scls = s => s === 'ACTIONABLE' ? 'act' : s === 'invalidated' ? 'inv' : s === 'approaching' ? 'app' : 'pend';
const html = `<title>Overnight Watch</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{--bg:#F3F5F8;--surface:#FFF;--surface2:#E9EDF2;--ink:#172033;--muted:#5C6779;--line:#D5DBE4;--accent:#0E7C86;--bull:#1F8A4C;--bear:#C43C3C;--neut:#B0741C;--amb:#7A4FB5;--none:#6B7280;--bull-bg:#E3F3E9;--bear-bg:#F8E4E4;--neut-bg:#F6ECD9;--amb-bg:#ECE4F7;--none-bg:#E8EAEE}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F141B;--surface:#161D27;--surface2:#1E2733;--ink:#E6EBF2;--muted:#94A0B2;--line:#2A3442;--accent:#3FB7C2;--bull:#4CC27A;--bear:#EF6B6B;--neut:#E0A94B;--amb:#B69AE6;--none:#9AA3B2;--bull-bg:#173324;--bear-bg:#3A1F1F;--neut-bg:#372A14;--amb-bg:#2A2138;--none-bg:#232A35}}
:root[data-theme="dark"]{--bg:#0F141B;--surface:#161D27;--surface2:#1E2733;--ink:#E6EBF2;--muted:#94A0B2;--line:#2A3442;--accent:#3FB7C2;--bull:#4CC27A;--bear:#EF6B6B;--neut:#E0A94B;--amb:#B69AE6;--none:#9AA3B2;--bull-bg:#173324;--bear-bg:#3A1F1F;--neut-bg:#372A14;--amb-bg:#2A2138;--none-bg:#232A35}
*{box-sizing:border-box} body{background:var(--bg);color:var(--ink);font-family:Archivo,Arial,sans-serif;font-size:15px;line-height:1.5;margin:0;padding-inline:clamp(16px,4vw,48px);padding-block:32px 64px}
.wrap{max-width:1100px;margin-inline:auto;display:grid;gap:32px} .wrap>*{min-width:0}
h1{font-size:clamp(26px,4vw,38px);font-weight:800;font-stretch:80%;margin:0;line-height:1.1} h2{font-size:20px;font-weight:700;font-stretch:85%;margin:0 0 10px}
.eyebrow{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600} .meta{color:var(--muted);font-size:13.5px;display:flex;flex-wrap:wrap;gap:6px 22px}
.gate{background:${weekend ? 'var(--neut-bg)' : 'var(--bull-bg)'};border-left:3px solid ${weekend ? 'var(--neut)' : 'var(--bull)'};padding:10px 14px;border-radius:0 4px 4px 0;max-width:80ch}
.num{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.chip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:3px;white-space:nowrap} .bull{background:var(--bull-bg);color:var(--bull)} .bear{background:var(--bear-bg);color:var(--bear)} .neut{background:var(--neut-bg);color:var(--neut)} .amb{background:var(--amb-bg);color:var(--amb)} .none{background:var(--none-bg);color:var(--none)}
.act{background:var(--bull-bg);color:var(--bull)} .inv{background:var(--bear-bg);color:var(--bear)} .app{background:var(--neut-bg);color:var(--neut)} .pend{background:var(--none-bg);color:var(--none)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px} .card{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--bull);border-radius:8px;padding:16px;display:grid;gap:8px} .card.short{border-left-color:var(--bear)} .card h3{margin:0;font-size:17px;font-stretch:88%} .card dl{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0} .card dt{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)} .card dd{margin:0;font-size:14px} .card p{margin:0;font-size:13px;color:var(--muted)}
.scan{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)} table{border-collapse:collapse;width:100%;min-width:760px} th{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);background:var(--surface2)} td{padding:8px 12px;border-bottom:1px solid var(--line);font-size:14px;vertical-align:top} tr:last-child td{border-bottom:0} td.r,th.r{text-align:right}
ul{margin:0;padding-left:18px;max-width:90ch} li{margin-bottom:5px;font-size:14px} .muted{color:var(--muted)}
</style>
<div class="wrap">
<header style="display:grid;gap:10px;border-bottom:1px solid var(--line);padding-bottom:20px">
 <div class="eyebrow">Overnight watch · rules.json · desk-note setups</div><h1>Overnight Watch</h1>
 <div class="meta"><span>Report for <b>${localDate}</b></span><span>generated ${esc(now.toLocaleString())}</span><span>${state.alert_count ?? '—'} TradingView alerts monitored</span><span>clean majors: bullish <b>${majorBull.map(s=>s.split(':')[1]).join(', ')||'none'}</b>, bearish <b>${majorBear.map(s=>s.split(':')[1]).join(', ')||'none'}</b></span></div>
 <div class="gate"><b>Trade window:</b> ${esc(tradeWindow)}</div>
</header>
<section><h2>Actionable now — ${actionable.length}</h2>${actionable.length ? `<div class="cards">${actionable.map(e => `<article class="card ${e.dir}"><h3>${esc(e.name)} · ${e.dir.toUpperCase()} · <span class="num">${e.rr}R</span></h3><dl><div><dt>Price</dt><dd class="num">${fmt(e.price,e.sym)}</dd></div><div><dt>Zone</dt><dd class="num">${fmt(e.zone[0],e.sym)}–${fmt(e.zone[1],e.sym)}</dd></div><div><dt>Stop</dt><dd class="num">${fmt(e.stop,e.sym)}</dd></div><div><dt>Target</dt><dd class="num">${fmt(e.target,e.sym)}</dd></div></dl><p>Size at 1% risk = ${esc(e.size_formula)} · ATR ${e.atr_pct}%</p><p>${esc(e.note)}</p></article>`).join('')}</div>` : '<p class="muted" style="margin:0;max-width:80ch">None — no plan has a touched zone that is holding with bias, gate and ≥2R all satisfied. Closest candidates are marked <i>approaching</i> below.</p>'}</section>
<section><h2>All setups</h2><div class="scan"><table><thead><tr><th>Setup</th><th>Status</th><th class="r">Price</th><th class="r">Zone</th><th class="r">Stop</th><th class="r">Target</th><th class="r">R:R now</th><th class="r">To zone</th><th>Bias</th><th>Gate</th></tr></thead><tbody>${evals.map(e => `<tr><td><b>${esc(e.name)}</b><br><span class="muted" style="font-size:12px">${esc(e.note)}</span></td><td><span class="chip ${scls(e.status)}">${esc(e.status)}</span></td><td class="r num">${fmt(e.price,e.sym)}</td><td class="r num">${fmt(e.zone[0],e.sym)}–${fmt(e.zone[1],e.sym)}</td><td class="r num">${fmt(e.stop,e.sym)}</td><td class="r num">${fmt(e.target,e.sym)}</td><td class="r num">${e.rr ?? '—'}</td><td class="r num">${e.distToZone != null ? pct(e.distToZone) : '—'}</td><td>${e.bias ? `<span class="chip ${cls(e.bias)}">${e.bias}</span>` : '—'}</td><td>${e.gate === false ? '<span class="chip inv">blocked</span>' : '<span class="chip act">ok</span>'}</td></tr>`).join('')}</tbody></table></div></section>
<section><h2>Alerts fired since last run — ${alertsFired.length}</h2>${alertNote ? `<p class="muted">${esc(alertNote)}</p>` : ''}<ul>${alertsFired.length ? alertsFired.map(a => `<li><span class="num">${esc(a.fired)}</span> · <b>${esc(a.sym)}</b> · ${esc(a.message)}${a.active ? '' : ' <span class="chip inv">now inactive — replace</span>'}</li>`).join('') : '<li class="muted">none</li>'}</ul></section>
<section><h2>Bias changes — ${biasChanges.length}</h2><ul>${biasChanges.length ? biasChanges.map(c => `<li><b>${esc(c.sym.split(':')[1])}</b>: <span class="chip ${cls(c.from)}">${c.from}</span> → <span class="chip ${cls(c.to)}">${c.to}</span></li>`).join('') : '<li class="muted">none</li>'}</ul></section>
<section><h2>Regime levels</h2><ul>${regime.map(l => `<li><b>${esc(l.sym.split(':')[1])}</b> ${l.above != null ? '&gt; ' + fmt(l.above,l.sym) : '&lt; ' + fmt(l.below,l.sym)} — ${l.hit == null ? 'no data' : l.hit ? '<span class="chip act">HIT</span>' : '<span class="chip pend">not hit</span>'} <span class="num muted">(now ${fmt(l.price,l.sym)})</span> · ${esc(l.meaning)}</li>`).join('')}</ul></section>
<section><h2>Bias scan</h2><div class="scan"><table><thead><tr><th>Symbol</th><th>Bias</th><th class="r">Price</th><th class="r">1d</th><th class="r">vs 50D</th><th class="r">RSI D</th><th>4H</th></tr></thead><tbody>${report.bias.map(b => b.bias === 'NO DATA' ? `<tr><td>${esc(b.sym)}</td><td colspan="6" class="muted">no data</td></tr>` : `<tr><td><b>${esc(b.sym.split(':')[1])}</b></td><td><span class="chip ${cls(b.bias)}">${b.bias}</span></td><td class="r num">${fmt(b.price,b.sym)}</td><td class="r num">${pct(b.chg1)}</td><td class="r num">${pct(b.dist50)}</td><td class="r num">${b.rsi.toFixed(1)}</td><td>${esc(b.struct)}</td></tr>`).join('')}</tbody></table></div></section>
</div>`;
writeFileSync(join(DIR, 'report.html'), html); writeFileSync(join(HERE, 'latest.html'), html);

state.last_run = Math.floor(now.getTime() / 1000); state.bias = Object.fromEntries(order.map(s => [s, rows[s].bias || 'NO DATA'])); state.last_report = DIR;
writeFileSync(STATE, JSON.stringify(state, null, 2));
log(`\n[done] ${DIR}\n  actionable: ${actionable.length ? actionable.map(e => `${e.name} ${e.rr}R`).join('; ') : 'none'}\n  approaching: ${evals.filter(e => e.status === 'approaching').map(e => e.name).join(', ') || 'none'}\n  alerts fired: ${alertsFired.length}  bias changes: ${biasChanges.length}  window: ${tradeWindow}`);
process.exit(0);
