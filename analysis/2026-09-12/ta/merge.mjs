// Merge the three analyst JSON outputs into one summary table (stdout) + ta/summary.json
import { readFileSync, writeFileSync, existsSync } from 'fs';
const rd = f => existsSync(f) ? JSON.parse(readFileSync(f,'utf8')) : null;
const majors = rd('ta/majors.json') || [], alts = rd('ta/alts.json') || [], macro = rd('ta/macro.json');
const rows = [...majors.map(r=>({...r,group:'majors'})), ...alts.map(r=>({...r,group:'alts'})), ...((macro?.indices)||[]).map(r=>({...r,group:'macro',price:r.value}))];
const f = (v,d=2) => v==null?'—':typeof v==='number'?(Math.abs(v)>=1e9?(v/1e9).toFixed(1)+'B':Math.abs(v)>=1000?v.toFixed(0):v.toFixed(d)):String(v);
console.log('SYM'.padEnd(18),'BIAS'.padEnd(15),'PX'.padStart(10),'RSI_D'.padStart(6),'4H'.padEnd(7),'ATR%'.padStart(5),'SUP'.padStart(10),'RES'.padStart(10),'SETUP');
for (const r of rows) console.log(r.sym.padEnd(18), String(r.bias).padEnd(15), f(r.price).padStart(10), f(r.rsi_d,1).padStart(6), String(r.struct_4h).padEnd(7), f(r.atr_pct,1).padStart(5), f(r.nearest_support).padStart(10), f(r.nearest_resistance).padStart(10), r.setup? `${r.setup.dir} ${f(r.setup.entry)}→${f(r.setup.target)} stop ${f(r.setup.stop)} (${f(r.setup.rr,1)}R)` : 'none');
if (macro) console.log('\nREGIME:', macro.regime_label, '| TOTAL3/TOTAL', f(macro.ratio_total3_total?.current,4), 'ema50', f(macro.ratio_total3_total?.ema50,4), '20d', f(macro.ratio_total3_total?.chg20_pct,1)+'%', '| BTC.D 20d', f(macro.btcd_chg20_pct,2)+'pp', '| TOTAL 20d', f(macro.total_chg20_pct,1)+'%');
writeFileSync('ta/summary.json', JSON.stringify({rows, macro}, null, 2));
console.log('\nfiles present:', ['majors','alts','macro'].map(g=>g+':'+(existsSync(`ta/${g}.md`)?'md':'-')+(existsSync(`ta/${g}.json`)?'+json':'')).join(' '));
