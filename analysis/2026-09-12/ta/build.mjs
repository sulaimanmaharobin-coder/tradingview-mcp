// Build ta-report.html from ta/summary.json + the three analyst notes.
// usage: node ta/build.mjs "13:00 MPST"
import { readFileSync, writeFileSync, existsSync } from 'fs';
const STAMP = process.argv[2] || '';
const S = JSON.parse(readFileSync('ta/summary.json', 'utf8'));
const md = g => existsSync(`ta/${g}.md`) ? readFileSync(`ta/${g}.md`, 'utf8') : `# ${g}\n\n_Note not delivered._`;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const isCap = r => String(r.sym||'').startsWith('CRYPTOCAP');
function fmtPx(v, r){ if(v==null) return '—'; if(isCap(r)){ if(r.sym.endsWith('BTC.D')) return v.toFixed(2)+'%'; return v>=1e12?(v/1e12).toFixed(3)+'T':(v/1e9).toFixed(1)+'B'; } return v>=1000?v.toLocaleString('en-US',{maximumFractionDigits:0}):v>=10?v.toFixed(2):v.toFixed(4); }
const pct=(v,d=1)=>v==null?'—':(v>=0?'+':'')+v.toFixed(d)+'%';
const biasCls={BULLISH:'bull',BEARISH:'bear',NEUTRAL:'neut',AMBIGUOUS:'amb','NO CLEAN MATCH':'none'};
const chip=b=>`<span class="chip ${biasCls[b]||'none'}">${esc(String(b))}</span>`;
const rows = S.rows.map(r => ({
  ...r,
  bias: String(r.bias||'').toUpperCase(),
  struct_4h: String(r.struct_4h||'—').split(' (')[0],
  // macro analyst reports USD indices in $B; normalise to raw USD for fmtPx
  price: (isCap(r) && !r.sym.endsWith('BTC.D') && r.price != null && r.price < 1e6) ? r.price*1e9 : r.price,
}));
const setups = rows.filter(r=>r.setup);
const M = S.macro || {};
const tr = r => `<tr><td class="sym">${esc(r.sym.split(':')[1])}<small>${r.group}</small></td><td>${chip(r.bias)}</td><td class="num">${fmtPx(r.price,r)}</td><td class="num">${r.rsi_d?.toFixed(1)??'—'}</td><td class="num">${r.rsi_w?.toFixed(1)??'—'}</td><td>${esc(String(r.struct_4h??'—'))}</td><td class="num">${r.atr_pct!=null?r.atr_pct.toFixed(1)+'%':'—'}</td><td class="num">${fmtPx(r.nearest_support,r)}</td><td class="num">${fmtPx(r.nearest_resistance,r)}</td><td class="one">${esc(r.one_line||'')}</td></tr>`;
const setupCard = r => { const s=r.setup; const dir=String(s.dir).toLowerCase().startsWith('l')||String(s.dir).toLowerCase().includes('buy')?'long':'short'; return `<article class="setup ${dir}"><header><h3>${esc(r.sym.split(':')[1])}</h3><span class="dir">${dir.toUpperCase()}</span><span class="rr">${(+s.rr).toFixed(1)}R</span></header><p class="trig">${esc(String(s.trigger))}</p><dl><div><dt>Entry</dt><dd>${fmtPx(+s.entry,r)}</dd></div><div><dt>Stop</dt><dd>${fmtPx(+s.stop,r)}</dd></div><div><dt>Target</dt><dd>${fmtPx(+s.target,r)}</dd></div><div><dt>Risk</dt><dd>${pct(Math.abs(s.entry-s.stop)/s.entry*100)}</dd></div></dl><p class="size">Size at 1% risk = 0.01 × equity ÷ |entry − stop|</p></article>`; };

const html = `<title>September 12 Desk Notes</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<style>
:root{--bg:#F3F5F8;--surface:#FFFFFF;--surface2:#E9EDF2;--ink:#172033;--muted:#5C6779;--line:#D5DBE4;--accent:#0E7C86;--accent-ink:#0A5A62;
 --bull:#1F8A4C;--bear:#C43C3C;--neut:#B0741C;--amb:#7A4FB5;--none:#6B7280;--bull-bg:#E3F3E9;--bear-bg:#F8E4E4;--neut-bg:#F6ECD9;--amb-bg:#ECE4F7;--none-bg:#E8EAEE;--pos:#1F8A4C;--neg:#C43C3C;--shadow:0 1px 2px rgba(23,32,51,.06),0 6px 20px -12px rgba(23,32,51,.18)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F141B;--surface:#161D27;--surface2:#1E2733;--ink:#E6EBF2;--muted:#94A0B2;--line:#2A3442;--accent:#3FB7C2;--accent-ink:#7FD3DA;--bull:#4CC27A;--bear:#EF6B6B;--neut:#E0A94B;--amb:#B69AE6;--none:#9AA3B2;--bull-bg:#173324;--bear-bg:#3A1F1F;--neut-bg:#372A14;--amb-bg:#2A2138;--none-bg:#232A35;--pos:#4CC27A;--neg:#EF6B6B;--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px -12px rgba(0,0,0,.6)}}
:root[data-theme="dark"]{--bg:#0F141B;--surface:#161D27;--surface2:#1E2733;--ink:#E6EBF2;--muted:#94A0B2;--line:#2A3442;--accent:#3FB7C2;--accent-ink:#7FD3DA;--bull:#4CC27A;--bear:#EF6B6B;--neut:#E0A94B;--amb:#B69AE6;--none:#9AA3B2;--bull-bg:#173324;--bear-bg:#3A1F1F;--neut-bg:#372A14;--amb-bg:#2A2138;--none-bg:#232A35;--pos:#4CC27A;--neg:#EF6B6B;--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px -12px rgba(0,0,0,.6)}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.5;padding-inline:clamp(16px,4vw,48px);padding-block:32px 64px;margin:0}
.num,td.num,.setup dd,.rr{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.9em;background:var(--surface2);padding:1px 4px;border-radius:3px}
h1,h2,h3{margin:0;text-wrap:balance;line-height:1.15}
h1{font-size:clamp(28px,4vw,40px);font-weight:800;font-stretch:80%;letter-spacing:-.01em}
h2{font-size:22px;font-weight:700;font-stretch:85%} h3{font-size:18px;font-weight:700;font-stretch:88%}
.eyebrow{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
.muted{color:var(--muted)} .pos{color:var(--pos)} .neg{color:var(--neg)}
.wrap{max-width:1180px;margin-inline:auto;display:grid;gap:40px} .wrap>*,.notes>*{min-width:0} .note{overflow-x:hidden}
.mast{display:grid;gap:14px;border-bottom:1px solid var(--line);padding-bottom:24px}
.mast .meta{display:flex;flex-wrap:wrap;gap:8px 24px;color:var(--muted);font-size:13.5px}
.gate{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;background:var(--neut-bg);border-left:3px solid var(--neut);padding:12px 16px;border-radius:0 4px 4px 0;max-width:76ch} .gate b{color:var(--neut)} .gate p{margin:0}
.regime{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:6px;padding:16px 20px;display:grid;gap:8px;max-width:90ch}
.regime .label{font-size:20px;font-weight:700;font-stretch:88%} .regime .nums{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:13px;color:var(--muted)} .regime .nums b{color:var(--ink);font-family:"IBM Plex Mono",monospace;font-weight:500}
.chip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:3px;white-space:nowrap;font-stretch:90%}
.chip.bull{background:var(--bull-bg);color:var(--bull)} .chip.bear{background:var(--bear-bg);color:var(--bear)} .chip.neut{background:var(--neut-bg);color:var(--neut)} .chip.amb{background:var(--amb-bg);color:var(--amb)} .chip.none{background:var(--none-bg);color:var(--none)}
.scan{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;width:100%} .scan table{min-width:980px}
.scan th{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--surface2)}
.scan td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px} .scan tr:last-child td{border-bottom:0}
.scan td.sym{font-weight:700;font-stretch:90%;white-space:nowrap} .scan td.sym small{display:block;font-weight:400;color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.scan th.r,.scan td.num{text-align:right;white-space:nowrap} .scan td.one{min-width:260px;color:var(--muted);font-size:13px}
.setups{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.setup{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px;display:grid;gap:10px;box-shadow:var(--shadow);border-top:3px solid var(--none)} .setup.long{border-top-color:var(--bull)} .setup.short{border-top-color:var(--bear)}
.setup header{display:flex;align-items:baseline;gap:10px} .setup .dir{font-size:11px;font-weight:700;letter-spacing:.08em} .setup.long .dir{color:var(--bull)} .setup.short .dir{color:var(--bear)} .setup .rr{margin-left:auto;font-weight:600}
.setup .trig{margin:0;font-size:13.5px} .setup dl{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0;border-top:1px solid var(--line);padding-top:10px} .setup dt{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)} .setup dd{margin:0;font-size:14px} .setup .size{margin:0;font-size:12px;color:var(--muted)}
.nosetup{color:var(--muted);font-size:14px;max-width:70ch}
.notes{display:grid;gap:36px}
.note{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:clamp(16px,3vw,32px);max-width:100%}
.note h1{font-size:24px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:18px} .note h2{font-size:20px;margin:28px 0 10px;color:var(--accent-ink)} .note h3{font-size:15.5px;margin:18px 0 6px}
.note p,.note li{max-width:78ch;font-size:14.5px} .note ul{padding-left:20px} .note li{margin-bottom:4px}
.note table{font-size:13px;margin:10px 0 14px;display:block;overflow-x:auto;max-width:100%;width:max-content;font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums} .note th{text-align:left;font-family:Archivo,sans-serif;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:5px 10px;border-bottom:1px solid var(--line);white-space:nowrap} .note td{padding:5px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.note strong{font-weight:700} .note hr{border:0;border-top:1px solid var(--line);margin:24px 0}
.tabs{display:flex;gap:6px;flex-wrap:wrap} .tabs button{font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer} .tabs button[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#fff} .tabs button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
<div class="wrap">
<header class="mast">
  <div class="eyebrow">Watchlist technical analysis · three analyst agents · shared indicator library</div>
  <h1>September 12 Desk Notes</h1>
  <div class="meta"><span>Data pulled <b>${esc(STAMP)}</b> from TradingView Desktop</span><span>9 symbols × 1W / 1D / 4H, 300 bars each</span><span>Bias per <code>rules.json</code>; MACD reported, not classified</span></div>
  <div class="gate"><b>No trades</b><p>Saturday — <code>weekend thin liquidity</code>. Every plan below is conditional on its trigger printing after the week opens, and on no CPI / FOMC that session. Max risk 1% of equity, minimum 2R.</p></div>
  ${M.regime_label?`<div class="regime"><div class="eyebrow">Regime</div><div class="label">${esc(M.regime_label)}</div><p style="margin:0;max-width:80ch">${esc(M.regime_summary||'')}</p><div class="nums"><span>TOTAL3 / TOTAL <b>${M.ratio_total3_total?.current?.toFixed(2)??'—'}%</b> vs 50D EMA <b>${M.ratio_total3_total?.ema50?.toFixed(2)??'—'}%</b> · 20d <b>${M.ratio_total3_total?.chg20_pts!=null?(M.ratio_total3_total.chg20_pts>=0?'+':'')+M.ratio_total3_total.chg20_pts.toFixed(2)+' pts':'—'}</b></span><span>BTC.D 20d <b>${M.btcd_chg20_pts!=null?(M.btcd_chg20_pts>=0?'+':'')+M.btcd_chg20_pts.toFixed(2)+' pts':'—'}</b></span><span>TOTAL 20d <b>${pct(M.total_chg20_pct,2)}</b> · 60d <b>${pct(M.total_chg60_pct)}</b></span><span>ETH share 20d <b>${M.ratio_total3_total?.eth_share_20d_ago?.toFixed(2)??'—'} → ${M.ratio_total3_total?.eth_share_now?.toFixed(2)??'—'}%</b></span></div></div>`:''}
</header>

<section>
  <h2 style="margin-bottom:12px">Scan</h2>
  <div class="scan"><table><thead><tr><th>Symbol</th><th>Bias</th><th class="r">Price</th><th class="r">RSI D</th><th class="r">RSI W</th><th>4H</th><th class="r">ATR</th><th class="r">Support</th><th class="r">Resistance</th><th>One line</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>
</section>

<section>
  <h2 style="margin-bottom:12px">Conditional plans for the week</h2>
  ${setups.length?`<div class="setups">${setups.map(setupCard).join('')}</div>`:`<p class="nosetup">No symbol offered a ≥2R setup under the rules at this pull. See each note's "what would create one".</p>`}
</section>

<section class="notes">
  <div><h2 style="margin-bottom:12px">Analyst notes</h2>
  <div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-t="majors">Majors</button><button role="tab" aria-selected="false" data-t="alts">Alts</button><button role="tab" aria-selected="false" data-t="macro">Macro</button></div></div>
  <div class="note" id="note-majors"></div>
  <div class="note" id="note-alts" hidden></div>
  <div class="note" id="note-macro" hidden></div>
</section>
</div>
<script type="text/markdown" id="md-majors">${esc(md('majors'))}</script>
<script type="text/markdown" id="md-alts">${esc(md('alts'))}</script>
<script type="text/markdown" id="md-macro">${esc(md('macro'))}</script>
<script>
(function(){
  var un = function(s){ return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); };
  ['majors','alts','macro'].forEach(function(g){
    var src = un(document.getElementById('md-'+g).textContent);
    var el = document.getElementById('note-'+g);
    el.innerHTML = (window.marked && marked.parse) ? marked.parse(src) : '<pre style="white-space:pre-wrap">'+src.replace(/</g,'&lt;')+'</pre>';
  });
  var tabs = document.querySelectorAll('.tabs button');
  tabs.forEach(function(b){ b.addEventListener('click', function(){
    tabs.forEach(function(x){ x.setAttribute('aria-selected', String(x===b)); });
    ['majors','alts','macro'].forEach(function(g){ document.getElementById('note-'+g).hidden = (g!==b.dataset.t); });
  }); });
})();
</script>`;
writeFileSync('ta-report.html', html);
console.log('wrote ta-report.html', rows.length, 'rows,', setups.length, 'setups');
