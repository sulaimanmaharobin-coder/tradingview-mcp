import { load, closes, ema, emaSeries, sma, rsi, rsiSeries, macd, macdSeries, atr, pivots, structure, levels, volStats, fib, pct, dstr } from '../ta-lib.mjs';
const r = (x,d=4)=> x==null?null:+x.toFixed(d);
const syms = ['BINANCE:LINKUSDT','BINANCE:AVAXUSDT','BINANCE:SUIUSDT'];
for (const sym of syms) {
  const d = load(sym); const W=d.tf['1W'], D=d.tf['1D'], H=d.tf['4H'];
  const cW=closes(W), cD=closes(D);
  const px = cD.at(-1);
  const out = {sym, nW:W.length,nD:D.length,nH:H.length, lastD:dstr(D.at(-1).time), lastW:dstr(W.at(-1).time), lastH:new Date(H.at(-1).time*1000).toISOString()};
  // weekly
  const ema50w = ema(cW,50); const rsiW = rsiSeries(cW);
  const pw = pivots(W,2);
  out.weekly = { close:px, ema50w:r(ema50w), dist:r(pct(px,ema50w),2), rsiW:r(rsiW.at(-1),1), rsiW_prev:r(rsiW.at(-2),1),
    highs: pw.hi.slice(-2).map(x=>[dstr(x.t),x.v]), lows: pw.lo.slice(-2).map(x=>[dstr(x.t),x.v]),
    last8W: W.slice(-8).map(b=>[dstr(b.time),b.open,b.high,b.low,b.close]) };
  // daily
  const e50=emaSeries(cD,50), e200=emaSeries(cD,200); const rs=rsiSeries(cD); const ms=macdSeries(cD);
  const hist5 = ms.slice(-5).map(m=>r(m.hist,4));
  const absH = hist5.map(Math.abs); const expanding = absH[4]>absH[3] && absH[3]>absH[2];
  const contracting = absH[4]<absH[3] && absH[3]<absH[2];
  // crossings last 20
  let cross=0; for(let i=D.length-20;i<D.length;i++){ const a=Math.sign(cD[i-1]-e50[i-1]), b=Math.sign(cD[i]-e50[i]); if(a!==b) cross++; }
  const a14=atr(D,14);
  out.daily = { close:px, ema50:r(e50.at(-1)), d50:r(pct(px,e50.at(-1)),2), ema200:r(e200.at(-1)), d200:r(pct(px,e200.at(-1)),2),
    ema50_vs_200: r(pct(e50.at(-1),e200.at(-1)),2), ema50_slope5: r(pct(e50.at(-1),e50.at(-6)),2),
    rsi:r(rs.at(-1),1), rsi5ago:r(rs.at(-6),1), rsiChg5:r(rs.at(-1)-rs.at(-6),1), rsi_last10: rs.slice(-10).map(x=>r(x,1)),
    macd:{line:r(ms.at(-1).macd), signal:r(ms.at(-1).signal), hist:r(ms.at(-1).hist), hist5, expanding, contracting},
    crossings20:cross, atr:r(a14), atrPct:r(a14/px*100,2),
    hi20: Math.max(...D.slice(-20).map(b=>b.high)), lo20: Math.min(...D.slice(-20).map(b=>b.low)),
    last10D: D.slice(-10).map(b=>[dstr(b.time),b.open,b.high,b.low,b.close,Math.round(b.volume)]),
    vol: (()=>{const v=volStats(D); return {last:Math.round(v.last),avg:Math.round(v.avg),ratio:r(v.ratio,2),upDown:r(v.upDownRatio,2)};})(),
    // vol excluding forming bar
    volPrev: (()=>{const v=volStats(D.slice(0,-1)); return {last:Math.round(v.last),avg:Math.round(v.avg),ratio:r(v.ratio,2),upDown:r(v.upDownRatio,2)};})(),
  };
  // levels
  out.levels = levels(D).slice(0,8).map(l=>({mid:r(l.mid,4),lo:l.lo,hi:l.hi,n:l.n}));
  // major swing: 90-bar window extremes
  const win = D.slice(-120); let iH=0,iL=0; win.forEach((b,i)=>{ if(b.high>win[iH].high) iH=i; if(b.low<win[iL].low) iL=i; });
  out.swing = { hi:[dstr(win[iH].time),win[iH].high], lo:[dstr(win[iL].time),win[iL].low], dir: iH>iL?'up (lo→hi)':'down (hi→lo)', fib: Object.fromEntries(Object.entries(fib(win[iH].high,win[iL].low)).map(([k,v])=>[k,r(v,4)])) };
  // also larger daily pivots w=5 last 6 for context
  const pd = pivots(D,5); out.dailyPivots = { hi: pd.hi.slice(-5).map(x=>[dstr(x.t),x.v]), lo: pd.lo.slice(-5).map(x=>[dstr(x.t),x.v]) };
  // 4H structure
  const s = structure(H);
  const idx = H.length-120;
  const f = x => [new Date(H[idx+x.i].time*1000).toISOString().slice(0,13), x.v];
  out.h4 = { label:s.label, detail:s.detail, highs:s.hi.slice(-2).map(f), lows:s.lo.slice(-2).map(f), allHi: s.hi.slice(-5).map(f), allLo: s.lo.slice(-5).map(f), ema50_4h: r(ema(closes(H),50)), rsi4h: r(rsi(closes(H)),1), atr4h: r(atr(H,14)) };
  // divergence last 30 daily
  const last30 = D.slice(-30); const off = D.length-30; const p30 = pivots(last30,2);
  const hh = p30.hi.slice(-2), ll = p30.lo.slice(-2);
  out.div = {
    hi: hh.map(x=>[dstr(x.t),x.v,r(rs[off+x.i],1)]), lo: ll.map(x=>[dstr(x.t),x.v,r(rs[off+x.i],1)]),
    bearish: hh.length===2 && hh[1].v>hh[0].v && rs[off+hh[1].i]<rs[off+hh[0].i],
    bullish: ll.length===2 && ll[1].v<ll[0].v && rs[off+ll[1].i]>rs[off+ll[0].i] };
  // bias
  const R = r(rs.at(-1),1); const above = px>e50.at(-1); const chop = Math.abs(pct(px,e50.at(-1)))<=2 || cross>=2;
  const bull = above && R>=45 && R<=70 && s.label==='HH/HL';
  const bear = !above && R<=45 && s.label==='LH/LL';
  const neut = chop && R>=40 && R<=60 && s.label==='mixed';
  const m=[bull&&'bullish',bear&&'bearish',neut&&'neutral'].filter(Boolean);
  out.bias = { legs:{above, chop, R, struct:s.label}, matches:m, result: m.length===1?m[0]:m.length>1?'AMBIGUOUS':'NO CLEAN MATCH' };
  console.log(JSON.stringify(out));
  console.log('-----');
}
