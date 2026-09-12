// Fast offline backtest of rules.json bias legs on the daily bars already pulled.
// Signal on day t uses only bars <= t. Forward returns measured close(t) -> close(t+N).
// 4H structure leg is NOT included: only ~50 days of 4H history were pulled, too short.
import { readFileSync } from 'fs';
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
function emaSeries(v, p){ const k=2/(p+1); let e=v.slice(0,p).reduce((a,b)=>a+b,0)/p; const o=new Array(p-1).fill(null); o.push(e); for(let i=p;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e);} return o; }
function rsiSeries(v, p=14){ const o=new Array(v.length).fill(null); let g=0,l=0; for(let i=1;i<=p;i++){const d=v[i]-v[i-1]; d>=0?g+=d:l-=d;} let ag=g/p,al=l/p; o[p]=al===0?100:100-100/(1+ag/al); for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1]; ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p; o[i]=al===0?100:100-100/(1+ag/al);} return o; }
const H=[5,10,20];
const agg={};
const add=(k,h,r)=>{(agg[k]??={})[h]??=[];agg[k][h].push(r);};
const per=[];
for(const [sym,d] of Object.entries(raw)){
  const b=d.tf?.['1D']?.bars||[]; if(b.length<100) continue;
  const c=b.map(x=>x.close), e=emaSeries(c,50), r=rsiSeries(c,14);
  const cnt={BULL:0,BEAR:0,NEUT:0,NONE:0}, sums={};
  for(let t=60;t<c.length-20;t++){
    const rr=Math.round(r[t]*10)/10, dist=(c[t]-e[t])/e[t]*100;
    let x=0; for(let i=t-19;i<=t;i++){const a=c[i-1]-e[i-1],bb=c[i]-e[i]; if(a&&bb&&Math.sign(a)!==Math.sign(bb))x++;}
    const chop=Math.abs(dist)<2||x>=2;
    const bull=c[t]>e[t]&&rr>=45&&rr<=70, bear=c[t]<e[t]&&rr<=45, neut=chop&&rr>=40&&rr<=60;
    const hits=[bull&&'BULL',bear&&'BEAR',neut&&'NEUT'].filter(Boolean);
    const k=hits.length===1?hits[0]:hits.length>1?'AMBIG':'NONE';
    cnt[k]=(cnt[k]||0)+1;
    for(const h of H){ const fr=(c[t+h]/c[t]-1)*100; add(k,h,fr); ((sums[k]??={})[h]??=[]).push(fr);} }
  per.push({sym:sym.split(':')[1],cnt,sums});
}
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length, wr=a=>a.filter(v=>v>0).length/a.length*100;
console.log('Per-symbol: daily legs only (EMA50 side + RSI band), 300 bars, ~220 signal days each\n');
console.log('SYM       | BULL n  avg20d  win20 | BEAR n  avg20d  win20 | NEUT n  avg20d  win20');
for(const p of per){ const f=k=>{const a=p.sums[k]?.[20]; return a&&a.length?`${String(a.length).padStart(3)} ${mean(a).toFixed(1).padStart(6)}% ${wr(a).toFixed(0).padStart(4)}%`:'  -              ';};
  console.log(`${p.sym.padEnd(9)} | ${f('BULL')} | ${f('BEAR')} | ${f('NEUT')}`); }
console.log('\nPooled across 9 symbols — forward return after signal day:');
for(const k of ['BULL','BEAR','NEUT','AMBIG','NONE']){ if(!agg[k]) continue; const line=H.map(h=>{const a=agg[k][h]; return `${h}d: avg ${mean(a).toFixed(2).padStart(6)}% win ${wr(a).toFixed(0)}%`;}).join(' | '); console.log(`${k.padEnd(6)} n=${String(agg[k][5].length).padStart(4)}  ${line}`); }
