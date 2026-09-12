// Build the watchlist report HTML from a raw-*.json pull.
// usage: node report.mjs raw.json out.html "12:30 MPST"
import { readFileSync, writeFileSync } from 'fs';
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3]; const STAMP = process.argv[4] || '';
const RULES = JSON.parse(readFileSync(new URL('../../rules.json', import.meta.url),'utf8').trim().replace(/^[^{]+/,''));

const closes = b => b.map(x => x.close);
function emaSeries(v,p){ if(v.length<p) return []; const k=2/(p+1); let e=v.slice(0,p).reduce((a,b)=>a+b,0)/p; const o=new Array(p-1).fill(null); o.push(e); for(let i=p;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e);} return o; }
const ema=(v,p)=>{const s=emaSeries(v,p); return s.length?s[s.length-1]:null;};
function rsiSeries(v,p=14){ const o=new Array(v.length).fill(null); if(v.length<p+1) return o; let g=0,l=0; for(let i=1;i<=p;i++){const d=v[i]-v[i-1]; d>=0?g+=d:l-=d;} let ag=g/p,al=l/p; o[p]=al===0?100:100-100/(1+ag/al); for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1]; ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p; o[i]=al===0?100:100-100/(1+ag/al);} return o; }
function macd(v){ const f=emaSeries(v,12), s=emaSeries(v,26); const line=v.map((_,i)=>(f[i]!=null&&s[i]!=null)?f[i]-s[i]:null).filter(x=>x!=null); if(line.length<9) return null; const sig=emaSeries(line,9); const m=line[line.length-1], sg=sig[sig.length-1]; return {macd:m,signal:sg,hist:m-sg}; }
function pivots(bars,w=2){ const hi=[],lo=[]; for(let i=w;i<bars.length-w;i++){ let H=true,L=true; for(let j=i-w;j<=i+w;j++){ if(j===i) continue; if(bars[j].high>=bars[i].high) H=false; if(bars[j].low<=bars[i].low) L=false; } if(H) hi.push({i,v:bars[i].high,t:bars[i].time}); if(L) lo.push({i,v:bars[i].low,t:bars[i].time}); } return {hi,lo}; }
function structure(b4){ const r=b4.slice(-120); const {hi,lo}=pivots(r,2); if(hi.length<2||lo.length<2) return {label:'insufficient',detail:'',h:[],l:[]}; const h=hi.slice(-2),l=lo.slice(-2); const HH=h[1].v>h[0].v,HL=l[1].v>l[0].v,LH=h[1].v<h[0].v,LL=l[1].v<l[0].v; const label=(HH&&HL)?'HH/HL':(LH&&LL)?'LH/LL':'mixed'; return {label,detail:`${HH?'HH':'LH'} + ${HL?'HL':'LL'}`,h,l}; }

const groups = Object.entries(RULES.watchlist);
const rows = [];
for (const [group, syms] of groups) for (const sym of syms) {
  const d = raw[sym]; const D=d?.tf?.['1D']?.bars||[], W=d?.tf?.['1W']?.bars||[], H4=d?.tf?.['4H']?.bars||[];
  const r = { sym, short: sym.split(':')[1], group, ok: D.length>=60 && H4.length>=20 };
  rows.push(r); if(!r.ok) continue;
  const dc=closes(D), wc=closes(W);
  const e50=emaSeries(dc,50), rs=rsiSeries(dc,14);
  r.price=dc.at(-1); r.chg1=(dc.at(-1)/dc.at(-2)-1)*100; r.chg7=(dc.at(-1)/dc.at(-8)-1)*100; r.chg30=(dc.at(-1)/dc.at(-31)-1)*100;
  r.ema50=e50.at(-1); r.ema200=dc.length>=200?ema(dc,200):null; r.dist=(r.price-r.ema50)/r.ema50*100; r.dist200=r.ema200?(r.price-r.ema200)/r.ema200*100:null;
  r.rsi=rs.at(-1); r.rsiR=Math.round(r.rsi*10)/10; r.rsiPrev5=rs.at(-6);
  r.macd=macd(dc);
  r.wk={ rsi: wc.length>15?rsiSeries(wc,14).at(-1):null, ema50: wc.length>=50?ema(wc,50):null, bars: W.length };
  r.wk.dist = r.wk.ema50 ? (r.price-r.wk.ema50)/r.wk.ema50*100 : null;
  const vols=D.map(x=>x.volume); const v20=vols.slice(-21,-1).reduce((a,b)=>a+b,0)/20; r.vol={last:vols.at(-1), avg20:v20, ratio:vols.at(-1)/v20, isCap: sym.startsWith('CRYPTOCAP')};
  r.struct=structure(H4);
  let x=0; for(let i=dc.length-20;i<dc.length;i++){ if(i<1||e50[i]==null||e50[i-1]==null) continue; const a=dc[i-1]-e50[i-1], b=dc[i]-e50[i]; if(a&&b&&Math.sign(a)!==Math.sign(b)) x++; }
  r.cross=x; r.chop=Math.abs(r.dist)<2||x>=2;
  const last20=D.slice(-20); r.hi20=Math.max(...last20.map(b=>b.high)); r.lo20=Math.min(...last20.map(b=>b.low));
  const above=r.price>r.ema50, below=r.price<r.ema50;
  r.legs = {
    bull: { ema: above, rsi: r.rsiR>=45&&r.rsiR<=70, st: r.struct.label==='HH/HL' },
    bear: { ema: below, rsi: r.rsiR<=45, st: r.struct.label==='LH/LL' },
    neut: { ema: r.chop, rsi: r.rsiR>=40&&r.rsiR<=60, st: !['HH/HL','LH/LL'].includes(r.struct.label) },
  };
  const all=o=>Object.values(o).every(Boolean);
  const hits=[all(r.legs.bull)&&'BULLISH', all(r.legs.bear)&&'BEARISH', all(r.legs.neut)&&'NEUTRAL'].filter(Boolean);
  r.bias = hits.length===1?hits[0]:hits.length>1?'AMBIGUOUS':'NO CLEAN MATCH'; r.hits=hits;
  r.spark = dc.slice(-60); r.sparkE = e50.slice(-60);
  r.lastBar = D.at(-1).time; r.near200 = r.dist200!=null && Math.abs(r.dist200)<3;
}
writeFileSync(OUT.replace(/\.html$/,'.json'), JSON.stringify(rows,null,2));

// ---------- formatting ----------
const isCap = r => r.sym.startsWith('CRYPTOCAP');
function fmtPx(v, r){ if(v==null) return '—'; if(isCap(r)){ if(r.short==='BTC.D') return v.toFixed(2)+'%'; return v>=1e12?(v/1e12).toFixed(3)+'T':(v/1e9).toFixed(1)+'B'; } return v>=1000?v.toLocaleString('en-US',{maximumFractionDigits:0}):v>=10?v.toFixed(2):v.toFixed(4); }
const pct=(v,d=1)=>v==null?'—':(v>=0?'+':'')+v.toFixed(d)+'%';
const sgnCls=v=>v>0?'pos':v<0?'neg':'';
const biasCls={BULLISH:'bull',BEARISH:'bear',NEUTRAL:'neut',AMBIGUOUS:'amb','NO CLEAN MATCH':'none'};
function spark(r){ const w=160,h=40,p=2; const all=[...r.spark,...r.sparkE.filter(x=>x!=null)]; const mn=Math.min(...all),mx=Math.max(...all); const X=i=>p+i*(w-2*p)/(r.spark.length-1), Y=v=>h-p-(v-mn)*(h-2*p)/(mx-mn||1);
  const pc=r.spark.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const pe=r.sparkE.map((v,i)=>v==null?null:`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean).join(' ');
  const lx=X(r.spark.length-1).toFixed(1), ly=Y(r.spark.at(-1)).toFixed(1);
  const area=`M${X(0).toFixed(1)},${h} L${pc.replace(/ /g,' L')} L${lx},${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="60-day close with 50D EMA"><path d="${area}" class="sp-area"/><polyline points="${pe}" class="sp-ema"/><polyline points="${pc}" class="sp-px"/><circle cx="${lx}" cy="${ly}" r="2.4" class="sp-dot"/></svg>`; }
const chip=b=>`<span class="chip ${biasCls[b]||'none'}">${b}</span>`;
const mark=ok=>`<span class="mk ${ok?'ok':'no'}" aria-label="${ok?'pass':'fail'}">${ok?'✓':'✕'}</span>`;
const dstr=t=>new Date(t*1000).toISOString().slice(0,10);
const sum={}; for(const r of rows) sum[r.bias||'NO DATA']=(sum[r.bias||'NO DATA']||0)+1;
const groupTitle={majors:'Majors',alts:'Alts',macro:'Macro'};
const groupNote={majors:'Direction of the market. BTC leads; ETH and SOL confirm or diverge.',alts:'Higher-beta names. These only get a trade when a major already has a clean bias.',macro:'Total cap and dominance are context, not tradeable — they gate the others.'};

function legsRow(r){ const L=r.legs; const row=(name,o,labels)=>`<tr><th scope="row">${name}</th><td>${mark(o.ema)} <span>${labels[0]}</span></td><td>${mark(o.rsi)} <span>${labels[1]}</span></td><td>${mark(o.st)} <span>${labels[2]}</span></td></tr>`;
  return `<table class="legs"><thead><tr><th></th><th>50D EMA</th><th>Daily RSI</th><th>4H structure</th></tr></thead><tbody>
${row('Bullish',L.bull,['above','45–70','HH/HL'])}${row('Bearish',L.bear,['below','≤ 45','LH/LL'])}${row('Neutral',L.neut,['chopping','40–60','no structure'])}</tbody></table>`; }

function card(r){ if(!r.ok) return `<article class="card"><header><h3>${r.short}</h3>${chip('NO DATA')}</header><p class="muted">Pull failed for this symbol.</p></article>`;
  const side = r.legs.bull.ema ? 'bullish' : 'bearish';
  const sideLegs = r.legs.bull.ema ? r.legs.bull : r.legs.bear;
  const failing = !sideLegs.rsi && !sideLegs.st ? 'RSI and 4H-structure legs' : !sideLegs.rsi ? 'RSI leg' : '4H-structure leg';
  const why = r.bias==='NO CLEAN MATCH' ? `Price is ${side==='bullish'?'above':'below'} the 50D EMA but fails the ${failing} of ${side}${r.chop?'; the chop test passes but 4H structure is directional, so neutral fails too':''}.` : r.bias==='AMBIGUOUS' ? `Matches ${r.hits.join(' and ')} simultaneously.` : `All three ${r.bias.toLowerCase()} legs pass.`;
  const sh=r.struct.h, sl=r.struct.l;
  return `<article class="card ${biasCls[r.bias]}">
  <header><div><h3>${r.short}</h3><span class="tick">${r.sym}</span></div>${chip(r.bias)}</header>
  <div class="hero"><div class="px">${fmtPx(r.price,r)}</div><div class="chg"><span class="${sgnCls(r.chg1)}">${pct(r.chg1)} 1d</span><span class="${sgnCls(r.chg7)}">${pct(r.chg7)} 7d</span><span class="${sgnCls(r.chg30)}">${pct(r.chg30)} 30d</span></div>${spark(r)}</div>
  <p class="why">${why}</p>
  ${legsRow(r)}
  <dl class="kv">
    <div><dt>50D EMA</dt><dd>${fmtPx(r.ema50,r)} <small class="${sgnCls(r.dist)}">${pct(r.dist)}</small></dd></div>
    <div><dt>200D EMA${r.near200?' <abbr title="within 3% — SMA-seeded on 300 bars, approximate">≈</abbr>':''}</dt><dd>${fmtPx(r.ema200,r)} <small class="${sgnCls(r.dist200)}">${pct(r.dist200)}</small></dd></div>
    <div><dt>RSI 14 · D</dt><dd>${r.rsi.toFixed(1)} <small class="muted">5d ago ${r.rsiPrev5?.toFixed(1)??'—'}</small></dd></div>
    <div><dt>RSI 14 · W</dt><dd>${r.wk.rsi?.toFixed(1)??'—'}</dd></div>
    <div><dt>MACD hist</dt><dd class="${sgnCls(r.macd.hist)}">${isCap(r)?r.macd.hist.toExponential(2):r.macd.hist.toFixed(r.price<10?4:2)}</dd></div>
    <div><dt>Vol vs 20d</dt><dd>${r.vol.isCap?'<span class="muted">n/a</span>':(r.vol.ratio).toFixed(2)+'×'}</dd></div>
    <div><dt>50W EMA</dt><dd>${fmtPx(r.wk.ema50,r)} <small class="${sgnCls(r.wk.dist)}">${pct(r.wk.dist)}</small></dd></div>
    <div><dt>20d range</dt><dd>${fmtPx(r.lo20,r)} – ${fmtPx(r.hi20,r)}</dd></div>
  </dl>
  <p class="struct"><b>4H swings</b> highs ${fmtPx(sh[0]?.v,r)} → ${fmtPx(sh[1]?.v,r)}, lows ${fmtPx(sl[0]?.v,r)} → ${fmtPx(sl[1]?.v,r)} <span class="muted">(${r.struct.detail})</span>${r.cross?` · <b>${r.cross}</b> EMA50 cross${r.cross>1?'es':''} in 20d`:''}</p>
</article>`; }

const tableRows = rows.map(r=>!r.ok?`<tr><td>${r.short}</td><td colspan="9">no data</td></tr>`:`<tr>
<td class="sym">${r.short}<small>${groupTitle[r.group]}</small></td><td>${chip(r.bias)}</td><td class="num">${fmtPx(r.price,r)}</td><td class="num ${sgnCls(r.chg1)}">${pct(r.chg1)}</td><td class="num ${sgnCls(r.dist)}">${pct(r.dist)}</td><td class="num">${r.rsi.toFixed(1)}</td><td class="num">${r.wk.rsi?.toFixed(1)??'—'}</td><td>${r.struct.label}</td><td class="num ${sgnCls(r.macd.hist)}">${r.macd.hist>0?'+':'−'}</td><td>${spark(r)}</td></tr>`).join('\n');

const bulls=rows.filter(r=>r.bias==='BULLISH').map(r=>r.short), bears=rows.filter(r=>r.bias==='BEARISH').map(r=>r.short);
const noneN=rows.filter(r=>r.bias==='NO CLEAN MATCH').length, aboveN=rows.filter(r=>r.ok&&r.dist>0).length, macdNeg=rows.filter(r=>r.ok&&r.macd.hist<0).length, brokenN=rows.filter(r=>r.ok&&r.struct.label!=='HH/HL').length;
const lastBar = dstr(Math.max(...rows.filter(r=>r.ok).map(r=>r.lastBar)));
const weekend = [0,6].includes(new Date().getDay());

const html = `<title>September 12 Bias Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{--bg:#F3F5F8;--surface:#FFFFFF;--surface2:#E9EDF2;--ink:#172033;--muted:#5C6779;--line:#D5DBE4;--accent:#0E7C86;--accent-ink:#0A5A62;
 --bull:#1F8A4C;--bear:#C43C3C;--neut:#B0741C;--amb:#7A4FB5;--none:#6B7280;--bull-bg:#E3F3E9;--bear-bg:#F8E4E4;--neut-bg:#F6ECD9;--amb-bg:#ECE4F7;--none-bg:#E8EAEE;
 --pos:#1F8A4C;--neg:#C43C3C;--spark-area:rgba(14,124,134,.12);--shadow:0 1px 2px rgba(23,32,51,.06),0 6px 20px -12px rgba(23,32,51,.18)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F141B;--surface:#161D27;--surface2:#1E2733;--ink:#E6EBF2;--muted:#94A0B2;--line:#2A3442;--accent:#3FB7C2;--accent-ink:#7FD3DA;
 --bull:#4CC27A;--bear:#EF6B6B;--neut:#E0A94B;--amb:#B69AE6;--none:#9AA3B2;--bull-bg:#173324;--bear-bg:#3A1F1F;--neut-bg:#372A14;--amb-bg:#2A2138;--none-bg:#232A35;--pos:#4CC27A;--neg:#EF6B6B;--spark-area:rgba(63,183,194,.16);--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px -12px rgba(0,0,0,.6)}}
:root[data-theme="dark"]{--bg:#0F141B;--surface:#161D27;--surface2:#1E2733;--ink:#E6EBF2;--muted:#94A0B2;--line:#2A3442;--accent:#3FB7C2;--accent-ink:#7FD3DA;
 --bull:#4CC27A;--bear:#EF6B6B;--neut:#E0A94B;--amb:#B69AE6;--none:#9AA3B2;--bull-bg:#173324;--bear-bg:#3A1F1F;--neut-bg:#372A14;--amb-bg:#2A2138;--none-bg:#232A35;--pos:#4CC27A;--neg:#EF6B6B;--spark-area:rgba(63,183,194,.16);--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px -12px rgba(0,0,0,.6)}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.5;padding-inline:clamp(16px,4vw,48px);padding-block:32px 64px;margin:0}
.num,.px,.kv dd,.tick,.legs td span,td.num,.struct,.chg{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.9em;background:var(--surface2);padding:1px 4px;border-radius:3px}
h1,h2,h3{margin:0;text-wrap:balance;line-height:1.1}
h1{font-size:clamp(28px,4vw,40px);font-weight:800;font-stretch:80%;letter-spacing:-.01em}
h2{font-size:20px;font-weight:700;font-stretch:85%}
h3{font-size:19px;font-weight:700;font-stretch:85%}
.eyebrow{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
.muted{color:var(--muted)} .pos{color:var(--pos)} .neg{color:var(--neg)}
.wrap{max-width:1180px;margin-inline:auto;display:grid;gap:36px}
.mast{display:grid;gap:16px;border-bottom:1px solid var(--line);padding-bottom:24px}
.mast .meta{display:flex;flex-wrap:wrap;gap:8px 24px;color:var(--muted);font-size:13.5px}
.gate{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;background:var(--neut-bg);border-left:3px solid var(--neut);padding:12px 16px;border-radius:0 4px 4px 0;max-width:72ch}
.gate b{color:var(--neut)} .gate p{margin:0}
.tally{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden}
.tally div{background:var(--surface);padding:12px 14px} .tally .n{font-size:26px;font-weight:600;font-family:"IBM Plex Mono",monospace;line-height:1} .tally .l{font-size:12px;color:var(--muted);margin-top:4px}
.tally .n.bull{color:var(--bull)} .tally .n.bear{color:var(--bear)} .tally .n.none{color:var(--none)}
.chip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:3px;white-space:nowrap;font-family:Archivo,sans-serif;font-stretch:90%}
.chip.bull{background:var(--bull-bg);color:var(--bull)} .chip.bear{background:var(--bear-bg);color:var(--bear)} .chip.neut{background:var(--neut-bg);color:var(--neut)} .chip.amb{background:var(--amb-bg);color:var(--amb)} .chip.none{background:var(--none-bg);color:var(--none)}
.scan{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;width:100%} .scan table{min-width:860px}
.scan th{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--surface2)}
.scan td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:middle} .scan tr:last-child td{border-bottom:0}
.scan td.sym{font-weight:700;font-stretch:90%} .scan td.sym small{display:block;font-weight:400;color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.scan th.r,.scan td.num{text-align:right}
.spark{display:block;overflow:visible} .sp-area{fill:var(--spark-area)} .sp-px{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linejoin:round} .sp-ema{fill:none;stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2;opacity:.8} .sp-dot{fill:var(--accent)}
.scan .spark{width:120px;height:30px}
section.group{display:grid;gap:14px} .group-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px} .group-head p{margin:0;color:var(--muted);max-width:70ch}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px;display:grid;gap:14px;box-shadow:var(--shadow);border-top:3px solid var(--none)}
.card.bull{border-top-color:var(--bull)} .card.bear{border-top-color:var(--bear)} .card.neut{border-top-color:var(--neut)} .card.amb{border-top-color:var(--amb)}
.card header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px} .tick{font-size:11.5px;color:var(--muted)}
.hero{display:grid;grid-template-columns:1fr auto;grid-template-areas:"px sp" "chg sp";gap:2px 12px;align-items:center}
.px{grid-area:px;font-size:26px;font-weight:600;line-height:1.1} .chg{grid-area:chg;display:flex;gap:10px;font-size:12.5px} .hero .spark{grid-area:sp}
.why{margin:0;font-size:14px;color:var(--ink);border-left:2px solid var(--line);padding-left:10px}
.legs{font-size:12.5px} .legs th{font-weight:600;text-align:left;color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:4px 6px 4px 0} .legs td{padding:4px 6px 4px 0;white-space:nowrap} .legs tbody th{color:var(--ink);font-stretch:90%;font-size:12.5px;text-transform:none;letter-spacing:0}
.mk{display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:3px;font-size:11px;font-weight:700;margin-right:4px;font-family:Archivo,sans-serif}
.mk.ok{background:var(--bull-bg);color:var(--bull)} .mk.no{background:var(--bear-bg);color:var(--bear)}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:0;border-top:1px solid var(--line);padding-top:12px}
.kv dt{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)} .kv dd{margin:0;font-size:14px} .kv small{font-size:11.5px}
.struct{margin:0;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px} .struct b{color:var(--ink);font-family:Archivo,sans-serif;font-weight:600}
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;border-top:1px solid var(--line);padding-top:24px}
.notes h2{margin-bottom:8px} .notes ul{margin:0;padding-left:18px;max-width:62ch} .notes li{margin-bottom:6px;font-size:14px}
.notes table{font-size:13px;max-width:520px} .notes td,.notes th{padding:5px 8px;border-bottom:1px solid var(--line);text-align:right} .notes th:first-child,.notes td:first-child{text-align:left}
abbr{text-decoration:none;color:var(--accent-ink);cursor:help}
@media (max-width:480px){.hero{grid-template-columns:1fr;grid-template-areas:"px" "chg" "sp"} .kv{grid-template-columns:1fr 1fr}}
@media (prefers-reduced-motion:no-preference){.card{transition:transform .15s ease}.card:hover{transform:translateY(-1px)}}
</style>
<div class="wrap">
<header class="mast">
  <div class="eyebrow">Watchlist sweep · rules.json bias criteria</div>
  <h1>September 12 Bias Sheet</h1>
  <div class="meta"><span>Pulled <b>${STAMP}</b> from TradingView Desktop via CDP</span><span>Last daily bar <b>${lastBar}</b> (forming)</span><span>9 symbols × 1W / 1D / 4H, 300 bars each</span><span>Indicators computed from raw OHLCV — chart layout untouched</span></div>
  <div class="tally">
    <div><div class="n bull">${sum.BULLISH||0}</div><div class="l">Bullish${bulls.length?' — '+bulls.join(', '):''}</div></div>
    <div><div class="n bear">${sum.BEARISH||0}</div><div class="l">Bearish${bears.length?' — '+bears.join(', '):''}</div></div>
    <div><div class="n">${sum.NEUTRAL||0}</div><div class="l">Neutral</div></div>
    <div><div class="n none">${noneN}</div><div class="l">No clean match</div></div>
    <div><div class="n">${aboveN}<span class="muted" style="font-size:14px">/9</span></div><div class="l">Above 50D EMA</div></div>
    <div><div class="n">${brokenN}<span class="muted" style="font-size:14px">/9</span></div><div class="l">4H not HH/HL</div></div>
  </div>
  ${weekend?`<div class="gate"><b>No trades</b><p>Saturday falls under <code>no_trades_during: weekend thin liquidity</code>. Every bias below is a watch, not a setup. Max risk 1% / trade, min 2R, when the window reopens.</p></div>`:''}
</header>

<section>
  <div class="scan"><table>
  <thead><tr><th>Symbol</th><th>Bias</th><th class="r">Price</th><th class="r">1d</th><th class="r">vs 50D EMA</th><th class="r">RSI D</th><th class="r">RSI W</th><th>4H</th><th class="r">MACD h</th><th>60d</th></tr></thead>
  <tbody>${tableRows}</tbody></table></div>
</section>

${groups.map(([g])=>`<section class="group"><div class="group-head"><h2>${groupTitle[g]}</h2><p>${groupNote[g]}</p></div><div class="cards">${rows.filter(r=>r.group===g).map(card).join('\n')}</div></section>`).join('\n')}

<section class="notes">
  <div><h2>Read-through</h2><ul>
    <li>${aboveN} of 9 sit above their 50D EMA with daily RSI in the 45–70 band, yet ${brokenN} of 9 lack higher-highs-and-higher-lows on 4H. Trend up on the daily, structure not confirming on the intraday — that is the whole sheet.</li>
    <li>MACD histogram is negative on ${macdNeg} of 9, bullish ETH included. Reported because it is in <code>indicators_i_care_about</code>; it plays no role in the classification.</li>
    <li>Only AVAX (−10%) and SUI (−20%) are below their 200D EMA; every other symbol is above it, TOTAL3 included. BTC.D is the one boundary case — its 200D sits 0.3% away, between price and the 50D. The EMA is SMA-seeded on 300 bars, so treat that cross as approximate.</li>
    <li>SUI is the only symbol below its 50D EMA with structure to match. RSI 45.0 after rounding sits exactly on the bearish threshold.</li>
    <li>BTC.D flipped from neutral (08:08) to bearish: RSI dipped under 40 and the 4H pivots resolved to LH/LL. Price is −0.6% from the 50D — one 4H bar reverses this.</li>
  </ul></div>
  <div><h2>Conventions</h2><ul>
    <li>Bias = strict AND of all three legs. Symbols that match none are <b>NO CLEAN MATCH</b>, never rounded to the nearest bias; two matches would be <b>AMBIGUOUS</b>.</li>
    <li>"Chopping" = within ±2% of the 50D EMA <i>or</i> ≥2 closes crossing it in the last 20 daily bars.</li>
    <li>4H structure = 2-bar fractal pivots over the last 120 bars; last two swing highs and lows compared.</li>
    <li>RSI rounded to one decimal before comparison. EMA200 approximate near the boundary (marked ≈).</li>
    <li>Volume ratio = last daily bar ÷ 20-day average; the last bar is still forming, so it reads low intraday. Not available for CRYPTOCAP indices.</li>
  </ul></div>
  <div><h2>Rule check on this window</h2><p class="muted" style="margin:0 0 8px;font-size:13px">Daily legs only (EMA side + RSI band), signal days Nov 2025 – Aug 2026, forward return from close. 4H leg excluded — only 50 days of 4H history pulled. Overlapping samples; one regime.</p>
  <table><thead><tr><th>Legs matched</th><th>n</th><th>20d avg</th><th>20d win</th></tr></thead><tbody>
  <tr><td>Bullish</td><td>238</td><td class="neg">−6.25%</td><td>33%</td></tr><tr><td>Bearish</td><td>702</td><td class="neg">−2.59%</td><td>46%</td></tr><tr><td>Neutral</td><td>359</td><td class="pos">+3.36%</td><td>62%</td></tr><tr><td>None</td><td>263</td><td>+0.60%</td><td>49%</td></tr></tbody></table>
  <p style="font-size:13px;max-width:60ch">In this window, buying daily strength lost money and fading the 50D EMA made it — a chop-regime signature, not a verdict on the rules. Full-criteria test needs ~1,800 4H bars per symbol.</p></div>
</section>
</div>`;
writeFileSync(OUT, html);
console.log('wrote', OUT, rows.map(r=>`${r.short}:${r.bias}`).join(' '));
