// Macro regime compute: CRYPTOCAP:TOTAL, TOTAL3, BTC.D. No volume (not meaningful on CRYPTOCAP indices).
import { load, closes, ema, emaSeries, rsi, rsiSeries, macdSeries, atr, pivots, structure, levels, fib, pct, dstr } from '../ta-lib.mjs';
const SYMS = ['CRYPTOCAP:TOTAL','CRYPTOCAP:TOTAL3','CRYPTOCAP:BTC.D'];
const r = (x,d=2)=> x==null?null:Number(x.toFixed(d));
const dt = t => new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
const out = {}; const daily = {};
for (const sym of SYMS) {
  const d = load(sym); const W=d.tf['1W'], D=d.tf['1D'], H=d.tf['4H'];
  const cW=closes(W), cD=closes(D), cH=closes(H);
  daily[sym]=D;
  const px = cD.at(-1);
  const scale = sym.endsWith('BTC.D') ? 1 : 1e9; // USD indices reported in $B
  const S = x => x==null?null: (sym.endsWith('BTC.D') ? r(x,2) : r(x/scale,1));
  // ---- weekly
  const e50w = ema(cW,50), rWs=rsiSeries(cW), stW = structure(W,2,120); const pw = pivots(W,2);
  const wk = { last:dstr(W.at(-1).time), e50w:S(e50w), d50w:r(pct(px,e50w)), rsiW:r(rWs.at(-1),1), rsiW_prev:r(rWs.at(-2),1),
    swHi: pw.hi.slice(-2).map(x=>({d:dstr(x.t),v:S(x.v)})), swLo: pw.lo.slice(-2).map(x=>({d:dstr(x.t),v:S(x.v)})),
    label:stW.label, detail:stW.detail, wk_chg: r(pct(px, W.at(-2).close)), wkHi:S(W.at(-1).high), wkLo:S(W.at(-1).low) };
  // ---- daily
  const e50=ema(cD,50), e200=ema(cD,200), e50s=emaSeries(cD,50), e200s=emaSeries(cD,200);
  const rs=rsiSeries(cD); const rD=rs.at(-1), rD5=rs.at(-6);
  const ms=macdSeries(cD); const m=ms.at(-1); const hist5=ms.slice(-5).map(x=>S(x.hist));
  const absH=ms.slice(-5).map(x=>Math.abs(x.hist)); const expanding = absH.at(-1)>absH[0];
  const a=atr(D);
  let crosses=0; for(let i=cD.length-20;i<cD.length;i++){ const s0=cD[i-1]-e50s[i-1], s1=cD[i]-e50s[i]; if(s0*s1<0) crosses++; }
  const within2 = Math.abs(pct(px,e50))<=2; const chop = within2 || crosses>=2;
  // days above/below e50 in last 20; e50 slope over 10 bars; e200 slope
  const above20 = cD.slice(-20).filter((c,i)=>c>e50s[cD.length-20+i]).length;
  const e50slope = r(pct(e50s.at(-1), e50s.at(-11)),2), e200slope = r(pct(e200s.at(-1), e200s.at(-11)),2);
  // ---- 4H
  const st = structure(H,2,120);
  const hs = st.hi.slice(-2).map(x=>({d:dt(x.t),v:S(x.v)})), ls = st.lo.slice(-2).map(x=>({d:dt(x.t),v:S(x.v)}));
  const e50h=ema(cH,50), rH=rsi(cH);
  // ---- levels
  const lv = levels(D).slice(0,8).map(l=>({mid:S(l.mid),lo:S(l.lo),hi:S(l.hi),n:l.n}));
  const l20 = D.slice(-20); const h20=Math.max(...l20.map(b=>b.high)), lo20=Math.min(...l20.map(b=>b.low));
  const h20d = dstr(l20.find(b=>b.high===h20).time), lo20d=dstr(l20.find(b=>b.low===lo20).time);
  const p5 = pivots(D.slice(-200),5); const lastHi=p5.hi.at(-1), lastLo=p5.lo.at(-1);
  const fmtFib = f => Object.fromEntries(Object.entries(f).map(([k,v])=>[k,S(v)]));
  let swing;
  if (lastHi.t>lastLo.t) swing={kind:'up (low->high)', from:{d:dstr(lastLo.t),v:S(lastLo.v)}, to:{d:dstr(lastHi.t),v:S(lastHi.v)}, fib:fmtFib(fib(lastHi.v,lastLo.v)), retraced:r((lastHi.v-px)/(lastHi.v-lastLo.v)*100,1)};
  else swing={kind:'down (high->low)', from:{d:dstr(lastHi.t),v:S(lastHi.v)}, to:{d:dstr(lastLo.t),v:S(lastLo.v)}, fib:fmtFib(fib(lastHi.v,lastLo.v)), retraced:r((px-lastLo.v)/(lastHi.v-lastLo.v)*100,1)};
  const D120 = D.slice(-120); let hiB=D120[0], loB=D120[0]; D120.forEach(b=>{ if(b.high>hiB.high) hiB=b; if(b.low<loB.low) loB=b; });
  const major={hi:{d:dstr(hiB.time),v:S(hiB.high)}, lo:{d:dstr(loB.time),v:S(loB.low)}, fib:fmtFib(fib(hiB.high,loB.low))};
  // 300-bar range extremes
  let hiA=D[0], loA=D[0]; D.forEach(b=>{ if(b.high>hiA.high) hiA=b; if(b.low<loA.low) loA=b; });
  const allLv=[...levels(D).slice(0,8).map(l=>l.mid), h20, lo20, e50, e200].filter(x=>x!=null);
  const above=S(allLv.filter(x=>x>px).sort((a,b)=>a-b)[0]), below=S(allLv.filter(x=>x<px).sort((a,b)=>b-a)[0]);
  // ---- divergence last 30 daily bars
  const D30=D.slice(-32); const rs30=rs.slice(-32); const pv=pivots(D30,2); const div=[];
  if(pv.hi.length>=2){const a1=pv.hi.at(-2),b1=pv.hi.at(-1); if(b1.v>a1.v && rs30[b1.i]<rs30[a1.i]) div.push(`bearish: price HH ${S(a1.v)}->${S(b1.v)} (${dstr(a1.t)}->${dstr(b1.t)}), RSI LH ${r(rs30[a1.i],1)}->${r(rs30[b1.i],1)}`);}
  if(pv.lo.length>=2){const a1=pv.lo.at(-2),b1=pv.lo.at(-1); if(b1.v<a1.v && rs30[b1.i]>rs30[a1.i]) div.push(`bullish: price LL ${S(a1.v)}->${S(b1.v)} (${dstr(a1.t)}->${dstr(b1.t)}), RSI HL ${r(rs30[a1.i],1)}->${r(rs30[b1.i],1)}`);}
  const pvHi=pv.hi.slice(-2).map(x=>({d:dstr(x.t),v:S(x.v),rsi:r(rs30[x.i],1)})), pvLo=pv.lo.slice(-2).map(x=>({d:dstr(x.t),v:S(x.v),rsi:r(rs30[x.i],1)}));
  const rsHi30=r(Math.max(...rs.slice(-30)),1), rsLo30=r(Math.min(...rs.slice(-30)),1);
  // ---- bias
  const rr=Number(rD.toFixed(1));
  const bull={a:px>e50, b:rr>=45&&rr<=70, c:st.label==='HH/HL'};
  const bear={a:px<e50, b:rr<=45, c:st.label==='LH/LL'};
  const neut={a:chop, b:rr>=40&&rr<=60, c:st.label==='mixed'};
  const matches=[['bullish',bull],['bearish',bear],['neutral',neut]].filter(([,x])=>x.a&&x.b&&x.c).map(([n])=>n);
  const bias = matches.length===1?matches[0]:matches.length>1?'AMBIGUOUS':'NO CLEAN MATCH';
  const last5=D.slice(-5).map(b=>({d:dstr(b.time),o:S(b.open),h:S(b.high),l:S(b.low),c:S(b.close)}));
  const chg = n => r(pct(px, cD.at(-1-n)),2);
  out[sym]={ px:S(px), unit: sym.endsWith('BTC.D')?'%':'$B', wk,
    day:{ last:dstr(D.at(-1).time), e50:S(e50), e200:S(e200), d50:r(pct(px,e50)), d200:r(pct(px,e200)), e50slope10:e50slope, e200slope10:e200slope, above20,
      rsi:r(rD,1), rsi5ago:r(rD5,1), rsiChg5:r(rD-rD5,1), rsHi30, rsLo30,
      macd:{line:S(m.macd),signal:S(m.signal),hist:S(m.hist)}, hist5, expanding, atr:S(a), atrPct:r(a/px*100), crosses, within2, chop,
      chg5:chg(5), chg10:chg(10), chg20:chg(20), chg60:chg(60), last5 },
    h4:{ label:st.label, detail:st.detail, highs:hs, lows:ls, e50h:S(e50h), d50h:r(pct(px,e50h)), rsiH:r(rH,1), lastBar:dt(H.at(-1).time) },
    lv, h20:{v:S(h20),d:h20d}, lo20:{v:S(lo20),d:lo20d}, range300:{hi:{v:S(hiA.high),d:dstr(hiA.time)},lo:{v:S(loA.low),d:dstr(loA.time)}}, swing, major, nearest:{above,below},
    div, pvHi, pvLo, bias:{bias,bull,bear,neut,matches} };
}
// ---- synthesis: TOTAL3/TOTAL ratio
const T=daily['CRYPTOCAP:TOTAL'], T3=daily['CRYPTOCAP:TOTAL3'], BD=daily['CRYPTOCAP:BTC.D'];
const n=Math.min(T.length,T3.length);
const ratio=[]; for(let i=0;i<n;i++){ const a=T.at(-n+i), b=T3.at(-n+i); if(a.time!==b.time) throw new Error('time mismatch '+i); ratio.push(b.close/a.close*100); }
const rE50=emaSeries(ratio,50), rE200=emaSeries(ratio,200);
const rRsi=rsi(ratio);
const ratioOut={ current:r(ratio.at(-1),2), ema50:r(rE50.at(-1),2), ema200:r(rE200.at(-1),2), d50:r(pct(ratio.at(-1),rE50.at(-1)),2),
  chg5:r(ratio.at(-1)-ratio.at(-6),2), chg20:r(ratio.at(-1)-ratio.at(-21),2), chg20_pct:r(pct(ratio.at(-1),ratio.at(-21)),2), chg60:r(ratio.at(-1)-ratio.at(-61),2),
  hi300:r(Math.max(...ratio),2), lo300:r(Math.min(...ratio),2), rsi:r(rRsi,1),
  hi300d: dstr(T.at(-n+ratio.indexOf(Math.max(...ratio))).time), lo300d: dstr(T.at(-n+ratio.indexOf(Math.min(...ratio))).time),
  last10: ratio.slice(-10).map(x=>r(x,2)) };
// BTC.D vs TOTAL 20d
const c=(arr,k)=>r(pct(arr.at(-1).close, arr.at(-1-k).close),2);
const rel={ total_chg20:c(T,20), total3_chg20:c(T3,20), btcd_chg20_pts:r(BD.at(-1).close-BD.at(-21).close,2), btcd_chg20_pct:c(BD,20),
  total_chg5:c(T,5), total3_chg5:c(T3,5), btcd_chg5_pts:r(BD.at(-1).close-BD.at(-6).close,2),
  total_chg60:c(T,60), total3_chg60:c(T3,60), btcd_chg60_pts:r(BD.at(-1).close-BD.at(-61).close,2) };
// 20-day correlation of daily returns BTC.D vs TOTAL
const ret=(arr,k)=>arr.slice(-k-1).map((b,i,a)=>i?Math.log(b.close/a[i-1].close):null).slice(1);
const corr=(x,y)=>{const mx=x.reduce((a,b)=>a+b)/x.length,my=y.reduce((a,b)=>a+b)/y.length; let sxy=0,sx=0,sy=0; for(let i=0;i<x.length;i++){sxy+=(x[i]-mx)*(y[i]-my);sx+=(x[i]-mx)**2;sy+=(y[i]-my)**2;} return sxy/Math.sqrt(sx*sy);};
rel.corr20_btcd_total=r(corr(ret(BD,20),ret(T,20)),2); rel.corr60_btcd_total=r(corr(ret(BD,60),ret(T,60)),2);
// implied ETH share = 100 - BTC.D - TOTAL3/TOTAL
rel.eth_share_now=r(100-BD.at(-1).close-ratio.at(-1),2); rel.eth_share_20ago=r(100-BD.at(-21).close-ratio.at(-21),2);
out.synth={ratio:ratioOut, rel};
console.log(JSON.stringify(out,null,1));
