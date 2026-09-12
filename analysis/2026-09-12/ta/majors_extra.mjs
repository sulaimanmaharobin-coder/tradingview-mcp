import { load, closes, ema, emaSeries, rsi, rsiSeries, macdSeries, atr, pivots, structure, levels, volStats, fib, pct, dstr } from '../ta-lib.mjs';
const SYMS=['BINANCE:BTCUSDT','BINANCE:ETHUSDT','BINANCE:SOLUSDT'];
const r=(x,d=2)=>x==null?null:Number(x.toFixed(d));
const ts=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
const data={};
for(const sym of SYMS){
  const d=load(sym); const W=d.tf['1W'],D=d.tf['1D'],H=d.tf['4H']; const cD=closes(D); const px=cD.at(-1);
  // all clusters within ±20% of price (levels() full list)
  const lvAll=levels(D).filter(l=>Math.abs(pct(l.mid,px))<=20).map(l=>({mid:r(l.mid),lo:r(l.lo),hi:r(l.hi),n:l.n,dist:r(pct(l.mid,px),1)})).sort((a,b)=>a.mid-b.mid);
  // recent-window clusters: last 60 bars, w=2, tol 0.8%
  const lvRecent=levels(D,2,0.8,60).map(l=>({mid:r(l.mid),lo:r(l.lo),hi:r(l.hi),n:l.n,dist:r(pct(l.mid,px),1)})).sort((a,b)=>a.mid-b.mid);
  // completed-bar volume
  const Dc=D.slice(0,-1); const vs=volStats(Dc); const v5=Dc.slice(-5).map(b=>r(b.volume/vs.avg,2));
  // window highs
  let hiD=D[0]; D.forEach(b=>{if(b.high>hiD.high)hiD=b;}); let hiW=W[0]; W.forEach(b=>{if(b.high>hiW.high)hiW=b;});
  const wkBar=W.at(-1);
  // 4H pivots sequence: last 4 highs & lows
  const st=structure(H,2,120);
  const seqH=st.hi.slice(-4).map(x=>({d:ts(x.t),v:x.v})), seqL=st.lo.slice(-4).map(x=>({d:ts(x.t),v:x.v}));
  // structure before spike bar (drop bars from 09-11 12:00 onward)
  const spikeT=Date.UTC(2026,8,11,12)/1000; const Hpre=H.filter(b=>b.time<spikeT); const stPre=structure(Hpre,2,120);
  const spike=H.find(b=>b.time===spikeT);
  // returns
  const ret=n=>r(pct(px,cD.at(-1-n)));
  const Dlow=D.slice(-120).reduce((a,b)=>b.low<a.low?b:a); 
  // divergence w=3 too
  const rs=rsiSeries(cD); const D30=D.slice(-32), rs30=rs.slice(-32); const p3=pivots(D30,3);
  const dv3={hi:p3.hi.slice(-3).map(x=>({d:dstr(x.t),v:x.v,rsi:r(rs30[x.i],1)})),lo:p3.lo.slice(-3).map(x=>({d:dstr(x.t),v:x.v,rsi:r(rs30[x.i],1)}))};
  // RSI series last 10
  const rsi10=rs.slice(-10).map(x=>r(x,1));
  const ms=macdSeries(cD); const hist10=ms.slice(-10).map(x=>r(x.hist,2));
  // 20d retrace leg for SOL/ETH/BTC: from 20d low to 20d high in time order
  data[sym]={px,lvAll,lvRecent,vol:{last_completed:r(vs.last,0),avg20:r(vs.avg,0),ratio:r(vs.ratio),upDown:r(vs.upDownRatio),v5},
    hiD:{d:dstr(hiD.time),v:hiD.high,dist:r(pct(px,hiD.high),1)}, hiW:{d:dstr(hiW.time),v:hiW.high,dist:r(pct(px,hiW.high),1)}, wkBar:{o:wkBar.open,h:wkBar.high,l:wkBar.low,c:wkBar.close},
    seqH,seqL,pre:{label:stPre.label,detail:stPre.detail,highs:stPre.highs,lows:stPre.lows}, spike:spike&&{h:spike.high,l:spike.low,o:spike.open,c:spike.close,rangePct:r((spike.high-spike.low)/spike.open*100,2)},
    ret:{d5:ret(5),d20:ret(20),d60:ret(60),fromLow:r(pct(px,Dlow.low)),lowDate:dstr(Dlow.time)}, dv3, rsi10, hist10, cD};
}
// ratios
const b=data['BINANCE:BTCUSDT'].cD, e=data['BINANCE:ETHUSDT'].cD, s=data['BINANCE:SOLUSDT'].cD;
const ratio=(x,y,n)=>r(pct((x.at(-1)/y.at(-1)),(x.at(-1-n)/y.at(-1-n))),2);
const corr=(x,y,n=30)=>{const rx=[],ry=[];for(let i=x.length-n;i<x.length;i++){rx.push(x[i]/x[i-1]-1);ry.push(y[i]/y[i-1]-1);}const mx=rx.reduce((a,b)=>a+b)/n,my=ry.reduce((a,b)=>a+b)/n;let sxy=0,sxx=0,syy=0;for(let i=0;i<n;i++){sxy+=(rx[i]-mx)*(ry[i]-my);sxx+=(rx[i]-mx)**2;syy+=(ry[i]-my)**2;}return r(sxy/Math.sqrt(sxx*syy),2);};
const rel={ETHBTC:{d5:ratio(e,b,5),d20:ratio(e,b,20),d60:ratio(e,b,60)},SOLBTC:{d5:ratio(s,b,5),d20:ratio(s,b,20),d60:ratio(s,b,60)},SOLETH:{d5:ratio(s,e,5),d20:ratio(s,e,20),d60:ratio(s,e,60)},corr30:{ETH_BTC:corr(e,b),SOL_BTC:corr(s,b),SOL_ETH:corr(s,e)}};
for(const k in data) delete data[k].cD;
console.log(JSON.stringify({data,rel},null,1));
