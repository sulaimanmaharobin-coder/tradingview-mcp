import { load, closes, ema, emaSeries, rsi, rsiSeries, macd, macdSeries, atr, pivots, structure, levels, volStats, fib, pct, dstr } from '../ta-lib.mjs';
const SYMS = ['BINANCE:BTCUSDT','BINANCE:ETHUSDT','BINANCE:SOLUSDT'];
const r = (x,d=2)=> x==null?null:Number(x.toFixed(d));
const out = {};
for (const sym of SYMS) {
  const d = load(sym); const W=d.tf['1W'], D=d.tf['1D'], H=d.tf['4H'];
  const cW=closes(W), cD=closes(D), cH=closes(H);
  const px = cD.at(-1);
  // weekly
  const e50w = ema(cW,50), rW = rsi(cW), stW = structure(W,2,120);
  const pw = pivots(W,2); 
  const wk = { last:dstr(W.at(-1).time), px, e50w:r(e50w), d50w:r(pct(px,e50w)), rsiW:r(rW,1), rsiW_prev:r(rsiSeries(cW).at(-2),1),
    swHi: pw.hi.slice(-2).map(x=>({d:dstr(x.t),v:x.v})), swLo: pw.lo.slice(-2).map(x=>({d:dstr(x.t),v:x.v})), label:stW.label, detail:stW.detail,
    wk_open: W.at(-1).open, wk_chg: r(pct(px, W.at(-2).close)) };
  // daily
  const e50=ema(cD,50), e200=ema(cD,200), e50s=emaSeries(cD,50);
  const rs=rsiSeries(cD); const rD=rs.at(-1), rD5=rs.at(-6);
  const ms=macdSeries(cD); const m=ms.at(-1); const hist5=ms.slice(-5).map(x=>r(x.hist,2));
  const absH=hist5.map(Math.abs); const expanding = absH.at(-1)>absH[0];
  const a=atr(D); 
  // chop check: within ±2% or ≥2 closes crossing in last 20 bars
  let crosses=0; for(let i=cD.length-20;i<cD.length;i++){ const s0=cD[i-1]-e50s[i-1], s1=cD[i]-e50s[i]; if(s0*s1<0) crosses++; }
  const within2 = Math.abs(pct(px,e50))<=2;
  const chop = within2 || crosses>=2;
  // 4H structure
  const st = structure(H,2,120);
  const hs = st.hi.slice(-2).map(x=>({d:new Date(x.t*1000).toISOString().slice(0,16).replace('T',' '),v:x.v}));
  const ls = st.lo.slice(-2).map(x=>({d:new Date(x.t*1000).toISOString().slice(0,16).replace('T',' '),v:x.v}));
  // levels
  const lv = levels(D).slice(0,8).map(l=>({mid:r(l.mid,2),lo:r(l.lo,2),hi:r(l.hi,2),n:l.n}));
  const l20 = D.slice(-20); const h20=Math.max(...l20.map(b=>b.high)), lo20=Math.min(...l20.map(b=>b.low));
  const h20i = l20.findIndex(b=>b.high===h20), lo20i=l20.findIndex(b=>b.low===lo20);
  // major daily swing: pivots w=3 on last 200; take highest high and lowest low of last 120 bars and order by time
  const D120 = D.slice(-120); let hiB=D120[0], loB=D120[0]; D120.forEach(b=>{ if(b.high>hiB.high) hiB=b; if(b.low<loB.low) loB=b; });
  // also: the most recent swing = from last major pivot low to last major pivot high (or vice versa) using w=5 pivots
  const p5 = pivots(D.slice(-200),5);
  const lastHi=p5.hi.at(-1), lastLo=p5.lo.at(-1);
  let swing;
  if (lastHi.t>lastLo.t) swing={kind:'up (low→high)', from:{d:dstr(lastLo.t),v:lastLo.v}, to:{d:dstr(lastHi.t),v:lastHi.v}, fib:fib(lastHi.v,lastLo.v)};
  else swing={kind:'down (high→low)', from:{d:dstr(lastHi.t),v:lastHi.v}, to:{d:dstr(lastLo.t),v:lastLo.v}, fib:fib(lastHi.v,lastLo.v)};
  const major={hi:{d:dstr(hiB.time),v:hiB.high}, lo:{d:dstr(loB.time),v:loB.low}, fib: fib(hiB.high, loB.low)};
  // nearest S/R from levels + 20d
  const allLv=[...lv.map(l=>l.mid), h20, lo20, r(e50), r(e200)].filter(x=>x!=null);
  const above=allLv.filter(x=>x>px).sort((a,b)=>a-b)[0], below=allLv.filter(x=>x<px).sort((a,b)=>b-a)[0];
  // divergence last 30 daily bars: pivots w=2
  const D30=D.slice(-32); const rs30=rs.slice(-32); const pv=pivots(D30,2);
  const div=[];
  if(pv.hi.length>=2){const a1=pv.hi.at(-2),b1=pv.hi.at(-1); if(b1.v>a1.v && rs30[b1.i]<rs30[a1.i]) div.push(`bearish: price HH ${a1.v}→${b1.v} (${dstr(a1.t)}→${dstr(b1.t)}), RSI LH ${r(rs30[a1.i],1)}→${r(rs30[b1.i],1)}`);}
  if(pv.lo.length>=2){const a1=pv.lo.at(-2),b1=pv.lo.at(-1); if(b1.v<a1.v && rs30[b1.i]>rs30[a1.i]) div.push(`bullish: price LL ${a1.v}→${b1.v} (${dstr(a1.t)}→${dstr(b1.t)}), RSI HL ${r(rs30[a1.i],1)}→${r(rs30[b1.i],1)}`);}
  const pvHi=pv.hi.slice(-2).map(x=>({d:dstr(x.t),v:x.v,rsi:r(rs30[x.i],1)})), pvLo=pv.lo.slice(-2).map(x=>({d:dstr(x.t),v:x.v,rsi:r(rs30[x.i],1)}));
  const vs=volStats(D);
  // completed-bar vol (yesterday) as well
  const vsPrev=volStats(D.slice(0,-1));
  // bias
  const rr=Number(rD.toFixed(1));
  const bull={a:px>e50, b:rr>=45&&rr<=70, c:st.label==='HH/HL'};
  const bear={a:px<e50, b:rr<=45, c:st.label==='LH/LL'};
  const neut={a:chop, b:rr>=40&&rr<=60, c:st.label==='mixed'};
  const matches=[['bullish',bull],['bearish',bear],['neutral',neut]].filter(([,x])=>x.a&&x.b&&x.c).map(([n])=>n);
  const bias = matches.length===1?matches[0]:matches.length>1?'AMBIGUOUS':'NO CLEAN MATCH';
  // last 5 daily bars
  const last5=D.slice(-5).map(b=>({d:dstr(b.time),o:b.open,h:b.high,l:b.low,c:b.close,v:r(b.volume,0)}));
  // 4H recent info
  const e50h=ema(cH,50), rH=rsi(cH), aH=atr(H);
  out[sym]={ px, wk, day:{ last:dstr(D.at(-1).time), e50:r(e50), e200:r(e200), d50:r(pct(px,e50)), d200:r(pct(px,e200)), rsi:r(rD,1), rsi5ago:r(rD5,1), rsiChg5:r(rD-rD5,1),
      macd:{line:r(m.macd),signal:r(m.signal),hist:r(m.hist)}, hist5, expanding, atr:r(a), atrPct:r(a/px*100), crosses, within2, chop, last5 },
    h4:{ label:st.label, detail:st.detail, highs:hs, lows:ls, e50h:r(e50h), rsiH:r(rH,1), atrH:r(aH), lastBar:new Date(H.at(-1).time*1000).toISOString().slice(0,16) },
    lv, h20:{v:h20,d:dstr(l20[h20i].time)}, lo20:{v:lo20,d:dstr(l20[lo20i].time)}, swing, major, nearest:{above,below},
    div, pvHi, pvLo, vol:{last:r(vs.last,0),avg:r(vs.avg,0),ratio:r(vs.ratio),upDown:r(vs.upDownRatio), prevRatio:r(vsPrev.ratio)},
    bias:{bias,bull,bear,neut,matches} };
}
console.log(JSON.stringify(out,null,1));
