/* Timing interpolation for the visual tape only. Source data is never rewritten. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DspTiming=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const R=16000;
const words=t=>(t.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu)||[]).map(s=>s.toLowerCase().replace(/’/g,"'"));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function packedTime(w,source){let t=source*R;for(const m of w.map){if(t<m.sourceGlobalStartFrame)return m.inputStartFrame/R;if(t<=m.sourceGlobalEndFrame)return (m.inputStartFrame+t-m.sourceGlobalStartFrame)/R}return w.inputFrames/R}
function sameRange(w,a,b){return w.map.some(m=>a>=m.sourceGlobalStartFrame/R-.011&&b<=m.sourceGlobalEndFrame/R+.011)}
function align(w,cell){
 const tokens=words(cell.text||''),native=[];
 for(const a of cell.sourceWordTimestamps||[]){for(const word of words(a.text||''))native.push({word,ts:a.timestamp,multi:words(a.text||'').length>1})}
 const n=tokens.length,m=native.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=tokens[i]===native[j].word?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 let i=0,j=0,last=0;const anchors=[{t:0,pos:0}],matched=new Map();
 while(i<n&&j<m){
  if(tokens[i]===native[j].word){
   const [a,b]=native[j].ts||[];
   if(!native[j].multi&&Number.isFinite(a)&&Number.isFinite(b)&&b>a&&b-a<=3&&sameRange(w,a,b)){
    const t=packedTime(w,(a+b)/2),duration=w.inputFrames/R;
    if(t>last+1e-6&&t<duration-1e-6){anchors.push({t,pos:i+.5});matched.set(i,{start:a,end:b});last=t}
   }
   i++;j++;
  }else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;
 }
 anchors.push({t:w.inputFrames/R,pos:n});
 return {anchors,matched,n,valid:matched.size};
}
function wordPosition(timing,w,source,useTiming=true){
 const t=clamp(packedTime(w,source),0,w.inputFrames/R);
 if(!useTiming||!timing.valid)return timing.n*t/(w.inputFrames/R);
 const a=timing.anchors;let lo=0,hi=a.length-1;while(hi-lo>1){const mid=(hi+lo)>>1;if(a[mid].t<=t)lo=mid;else hi=mid}
 const l=a[lo],r=a[hi];return l.pos+(r.pos-l.pos)*clamp((t-l.t)/(r.t-l.t),0,1);
}
function even(x){const f=Math.floor(x),d=x-f;return d<.5?f:d>.5?f+1:f%2===0?f:f+1}
function quant(x){return clamp(even(Math.fround(x)*32768),-32768,32767)/32768}
const profiles={eq25:['B',.25],eq100:['B',1],voice25:['E',.25],voice50:['E',.5],voice100:['E',1],combined100:['G',1],'voice25-static':['E',.25]};
function crop(w,input){const y=new Float32Array(w.inputFrames);for(const m of w.map)y.set(input.subarray(m.sourceStartFrame,m.sourceEndFrame),m.inputStartFrame);return y}
function reconstruct(w,c,raw,filtered){
 const a=crop(w,raw),spec=profiles[c.variant];
 if(c.variant==='rms-control'){const d=c.gainDiagnostic,g=Math.fround(d.targetRms/d.rawRms);for(let i=0;i<a.length;i++)a[i]=quant(Math.fround(a[i]*g))}
 else if(spec){const b=crop(w,filtered),weight=Math.fround(spec[1]),inv=Math.fround(1-spec[1]);for(let i=0;i<a.length;i++)a[i]=quant(Math.fround(Math.fround(a[i]*inv)+Math.fround(b[i]*weight)))}
 return a;
}
function edits(ref,hyp){const x=words(ref),y=words(hyp);let p=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){let c=[i];for(let j=1;j<=y.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(x[i-1]===y[j-1]?0:1));p=c}return p[y.length]}
return {R,words,packedTime,align,wordPosition,reconstruct,profiles,edits};
});
