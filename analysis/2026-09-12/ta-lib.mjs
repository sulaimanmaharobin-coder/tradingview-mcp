// Shared TA helpers so every analyst agent computes the same numbers.
// import { load, ema, sma, rsi, macd, atr, pivots, structure, levels, volStats, fib } from './ta-lib.mjs'
import { readFileSync } from 'fs';

export const load = (sym) => JSON.parse(readFileSync(new URL(`./symbols/${sym.replace(':','_')}.json`, import.meta.url), 'utf8'));
export const closes = b => b.map(x => x.close);

export function emaSeries(v, p) { if (v.length < p) return []; const k = 2/(p+1); let e = v.slice(0,p).reduce((a,b)=>a+b,0)/p; const o = new Array(p-1).fill(null); o.push(e); for (let i=p;i<v.length;i++){ e = v[i]*k + e*(1-k); o.push(e);} return o; }
export const ema = (v,p) => { const s = emaSeries(v,p); return s.length ? s.at(-1) : null; };
export const sma = (v,p) => v.length < p ? null : v.slice(-p).reduce((a,b)=>a+b,0)/p;
export function rsiSeries(v,p=14){ const o=new Array(v.length).fill(null); if(v.length<p+1) return o; let g=0,l=0; for(let i=1;i<=p;i++){const d=v[i]-v[i-1]; d>=0?g+=d:l-=d;} let ag=g/p,al=l/p; o[p]=al===0?100:100-100/(1+ag/al); for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1]; ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p; o[i]=al===0?100:100-100/(1+ag/al);} return o; }
export const rsi = (v,p=14) => rsiSeries(v,p).at(-1);
export function macdSeries(v){ const f=emaSeries(v,12), s=emaSeries(v,26); const line=v.map((_,i)=>(f[i]!=null&&s[i]!=null)?f[i]-s[i]:null); const def=line.filter(x=>x!=null); const sig=emaSeries(def,9); const pad=line.length-def.length; return line.map((m,i)=>{ const sg=sig[i-pad]; return (m==null||sg==null)?null:{macd:m,signal:sg,hist:m-sg}; }); }
export const macd = v => macdSeries(v).at(-1);
export function atr(bars,p=14){ if(bars.length<p+1) return null; const tr=[]; for(let i=1;i<bars.length;i++){ const b=bars[i],pc=bars[i-1].close; tr.push(Math.max(b.high-b.low, Math.abs(b.high-pc), Math.abs(b.low-pc))); } let a=tr.slice(0,p).reduce((x,y)=>x+y,0)/p; for(let i=p;i<tr.length;i++) a=(a*(p-1)+tr[i])/p; return a; }
export function pivots(bars,w=2){ const hi=[],lo=[]; for(let i=w;i<bars.length-w;i++){ let H=true,L=true; for(let j=i-w;j<=i+w;j++){ if(j===i) continue; if(bars[j].high>=bars[i].high) H=false; if(bars[j].low<=bars[i].low) L=false; } if(H) hi.push({i,v:bars[i].high,t:bars[i].time}); if(L) lo.push({i,v:bars[i].low,t:bars[i].time}); } return {hi,lo}; }
// rules.json convention: 2-bar fractal pivots over last 120 bars, compare last two swing highs and lows
export function structure(bars,w=2,look=120){ const r=bars.slice(-look); const {hi,lo}=pivots(r,w); if(hi.length<2||lo.length<2) return {label:'insufficient',hi,lo}; const h=hi.slice(-2),l=lo.slice(-2); const HH=h[1].v>h[0].v,HL=l[1].v>l[0].v,LH=h[1].v<h[0].v,LL=l[1].v<l[0].v; return {label:(HH&&HL)?'HH/HL':(LH&&LL)?'LH/LL':'mixed', detail:`${HH?'HH':'LH'} + ${HL?'HL':'LL'}`, highs:h.map(x=>x.v), lows:l.map(x=>x.v), hi, lo}; }
// cluster pivot prices within tol% into support/resistance levels, ranked by touches
export function levels(bars,w=3,tolPct=0.6,look=200){ const r=bars.slice(-look); const {hi,lo}=pivots(r,w); const pts=[...hi.map(x=>({v:x.v,k:'R'})),...lo.map(x=>({v:x.v,k:'S'}))].sort((a,b)=>a.v-b.v); const out=[]; for(const p of pts){ const c=out.at(-1); if(c && Math.abs(p.v-c.mid)/c.mid*100<tolPct){ c.n++; c.mid=(c.mid*(c.n-1)+p.v)/c.n; c.lo=Math.min(c.lo,p.v); c.hi=Math.max(c.hi,p.v);} else out.push({mid:p.v,lo:p.v,hi:p.v,n:1}); } return out.sort((a,b)=>b.n-a.n); }
export function volStats(bars,p=20){ const v=bars.map(b=>b.volume); const avg=v.slice(-p-1,-1).reduce((a,b)=>a+b,0)/p; const upV=bars.slice(-p).filter(b=>b.close>=b.open).reduce((a,b)=>a+b.volume,0); const dnV=bars.slice(-p).filter(b=>b.close<b.open).reduce((a,b)=>a+b.volume,0); return {last:v.at(-1), avg, ratio:v.at(-1)/avg, upDownRatio: dnV? upV/dnV : null}; }
export function fib(hi,lo){ const d=hi-lo; return {0:hi, 0.236:hi-0.236*d, 0.382:hi-0.382*d, 0.5:hi-0.5*d, 0.618:hi-0.618*d, 0.786:hi-0.786*d, 1:lo}; }
export const pct = (a,b) => (a/b-1)*100;
export const dstr = t => new Date(t*1000).toISOString().slice(0,10);
