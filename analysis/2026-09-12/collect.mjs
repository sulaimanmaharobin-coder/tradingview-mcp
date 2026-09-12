import { setSymbol, setTimeframe, getState } from '../../src/core/chart.js';
import { getOhlcv } from '../../src/core/data.js';
import { launch } from '../../src/core/health.js';
import { disconnect } from '../../src/connection.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const OUT = process.argv[2];
const RESTORE = { symbol: 'CRYPTOCOM:ZBCNUSD', tf: '1D' };

const RULES = JSON.parse(
  readFileSync(new URL('../../rules.json', import.meta.url), 'utf8').trim().replace(/^[^{]+/, '')
);
const wl = RULES.watchlist;
const SYMBOLS = [
  ...wl.majors.map(s => ({ sym: s, group: 'majors' })),
  ...wl.alts.map(s => ({ sym: s, group: 'alts' })),
  ...wl.macro.map(s => ({ sym: s, group: 'macro' })),
];
const TFS = RULES.timeframes_to_check;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// FIX: TradingView reports 1W/1D literally but 4H as minutes ("240").
// Accept every known spelling rather than assuming one.
const RES_OK = { '1W': ['1W', 'W'], '1D': ['1D', 'D'], '4H': ['240', '4H', 'H4'] };
const resMatches = (tf, r) => RES_OK[tf].includes(String(r));

// RESUME: reload prior progress and skip what we already have.
let out = {};
if (existsSync(OUT)) {
  try { out = JSON.parse(readFileSync(OUT, 'utf8')); } catch { out = {}; }
}
const done = (sym, tf) => out[sym]?.tf?.[tf]?.bars?.length > 0;
const save = () => writeFileSync(OUT, JSON.stringify(out));

const isDead = e => /CDP connection failed|fetch failed|WebSocket|socket hang up/i.test(String(e?.message || e));

async function revive() {
  process.stdout.write('  ! CDP down — relaunching TradingView\n');
  try { await disconnect(); } catch { /* older builds */ }
  await launch({ kill_existing: true });
  await sleep(4000);
  try { await disconnect(); } catch { /* noop */ }
  for (let i = 0; i < 20; i++) {
    try { await getState(); process.stdout.write('  + back up\n'); return true; } catch { await sleep(1500); }
  }
  return false;
}

async function settle(sym, tf, timeout = 25000) {
  const start = Date.now();
  let last = null, stable = 0;
  while (Date.now() - start < timeout) {
    const st = await getState();
    if (st && st.symbol === sym && resMatches(tf, st.resolution)) {
      const sig = `${st.symbol}|${st.resolution}`;
      stable = sig === last ? stable + 1 : 0;
      last = sig;
      if (stable >= 2) { await sleep(400); return true; }
    } else stable = 0;
    await sleep(300);
  }
  return false;
}

async function pull(sym, tf) {
  await setSymbol({ symbol: sym });
  await sleep(300);
  await setTimeframe({ timeframe: tf });
  const ok = await settle(sym, tf);
  const st = await getState();
  if (st.symbol !== sym || !resMatches(tf, st.resolution)) {
    throw new Error(`chart on ${st.symbol}/${st.resolution}, wanted ${sym}/${tf}`);
  }
  const r = await getOhlcv({ count: 300 });
  if (!r.bars || !r.bars.length) throw new Error('no bars returned');
  return { settled: ok, resolution: st.resolution, bar_count: r.bars.length,
           total_available: r.total_available ?? null, bars: r.bars };
}

let skipped = 0;
for (const { sym, group } of SYMBOLS) {
  out[sym] ||= { group, tf: {} };
  out[sym].group = group;
  for (const tf of TFS) {
    if (done(sym, tf)) { skipped++; process.stdout.write(`skip ${sym} ${tf} (have ${out[sym].tf[tf].bar_count})\n`); continue; }
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        out[sym].tf[tf] = await pull(sym, tf);
        save();
        process.stdout.write(`ok   ${sym} ${tf} -> ${out[sym].tf[tf].bar_count} bars @${out[sym].tf[tf].resolution}\n`);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (isDead(e)) { if (!(await revive())) break; }
        else { await sleep(1200); }
      }
    }
    if (lastErr) {
      out[sym].tf[tf] = { error: String(lastErr.message || lastErr), bars: [] };
      save();
      process.stdout.write(`FAIL ${sym} ${tf}: ${lastErr.message || lastErr}\n`);
    }
    await sleep(500); // pacing
  }
}

// Restore the user's original chart
try {
  await setSymbol({ symbol: RESTORE.symbol });
  await sleep(300);
  await setTimeframe({ timeframe: RESTORE.tf });
  process.stdout.write(`restored chart -> ${RESTORE.symbol} ${RESTORE.tf}\n`);
} catch (e) { process.stdout.write(`restore failed: ${e.message}\n`); }

save();
process.stdout.write(`DONE (skipped ${skipped} already-collected)\n`);
process.exit(0);
