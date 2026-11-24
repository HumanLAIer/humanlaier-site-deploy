'use strict';
// Frozen Nov22 role-context thresholds from pilot f58c2b6. No listening labels,
// earlier role decisions, speaker count, ID ranking, or manual input to classification.
// Offline whole-recording inference replay, not a causal live classifier.
(function(root,factory){const x=factory();if(typeof module==='object'&&module.exports)module.exports=x;else root.HLRoleReplay=x})(typeof globalThis==='undefined'?this:globalThis,function(){
const RULES=Object.freeze({minIndependentWindows:8,musicContextFloor:.20,musicOverSpeechMargin:.15,speechGuard:.20,strongSpeech:.45,musicWindowFraction:.60,medianSpeechMaximum:.12,backgroundRelativeDbMaximum:3,substantialSpeechFraction:.25,medianSpeechParticipant:.35});
const H=160,RATE=16000,ADDRESS=/\b(?:thank(?:s| you)|shout[ -]?out|welcome|good to see|your (?:comment|support)|let me know|can you|do you want|you guys|everyone|any questions)\b/i;
const median=a=>{const x=a.slice().sort((a,b)=>a-b),i=Math.floor(x.length/2);return x.length?(x.length%2?x[i]:(x[i-1]+x[i])/2):null};
function music(w){return w.musicScore>=RULES.musicContextFloor&&w.musicScore>=w.spokenScore+RULES.musicOverSpeechMargin&&w.spokenScore<RULES.speechGuard}
function classify(rows,backgroundDb,interaction){
  const independent=[];let last=-1;for(const w of rows.slice().sort((a,b)=>a.startFrame-b.startFrame)){if(w.startFrame>=last){independent.push(w);last=w.endFrame}}
  const n=independent.length,med=median(independent.map(w=>w.spokenScore)),fraction=n?independent.filter(music).length/n:0,strong=n?independent.filter(w=>w.spokenScore>=RULES.strongSpeech).length/n:0,anyStrong=rows.some(w=>w.spokenScore>=RULES.strongSpeech);
  let role='uncertain_preserve';
  if(interaction||strong>=RULES.substantialSpeechFraction||(med!==null&&med>=RULES.medianSpeechParticipant))role='participant_candidate';
  else if(n>=RULES.minIndependentWindows&&fraction>=RULES.musicWindowFraction&&med!==null&&med<=RULES.medianSpeechMaximum&&Number.isFinite(backgroundDb)&&backgroundDb<=RULES.backgroundRelativeDbMaximum)role=anyStrong?'music_dominant_mixed_candidate':'background_music_candidate';
  return {role,independentWindows:n,musicContextFraction:fraction,medianSpokenScore:med,strongSpokenFraction:strong,backgroundRelativeDbProxy:backgroundDb,audienceAddressEvidence:!!interaction,anyStrongSpokenWindow:anyStrong,hardSuppress:false,likelyIncidental:role==='music_dominant_mixed_candidate'||role==='background_music_candidate'};
}
function activityFrames(g,n){const m=new Uint8Array(n);for(const [a,b,bits] of g.activity){if(a%H||b%H||a<0||b<=a||b>n*H||bits<=0||bits>255)throw Error('native activity grid');m.fill(bits,a/H,b/H)}return m}
function attribution(m,a,b){
  const lo=Math.max(0,Math.floor(a/H)),hi=Math.min(m.length,Math.ceil(b/H));let union=0;const counts=new Array(8).fill(0);
  for(let i=lo;i<hi;i++){const v=m[i];if(!v)continue;union++;for(let s=0;s<8;s++)if(v&(1<<s))counts[s]++}
  if(union<200)return null;const s=counts.indexOf(Math.max(...counts));let others=0;for(let i=lo;i<hi;i++)if(m[i]&~(1<<s))others++;
  return counts[s]/union>=.90&&others<=10?s:null;
}
function runs(m){const out=[];let a=-1;for(let i=0;i<=m.length;i++){const k=i<m.length&&!!m[i];if(k&&a<0)a=i;else if(!k&&a>=0){out.push([a,i]);a=-1}}return out}
function frames(m){return runs(m).map(([a,b])=>[a*H,b*H])}
function padded(m,parts,p){
  const n=m.length,delta=new Int32Array(n+1),rad=Math.round(p*100);
  for(const part of parts){const lo=Math.max(0,Math.floor(part.startFrame/H)),hi=Math.min(n,Math.ceil(part.endFrame/H));for(const [a,b] of runs(m.subarray(lo,hi))){delta[Math.max(lo,lo+a-rad)]++;delta[Math.min(hi,lo+b+rad)]--}}
  const out=new Uint8Array(n);let sum=0;for(let i=0;i<n;i++){sum+=delta[i];out[i]=sum>0?1:0}return out;
}
function retained(m,total){const a=frames(m),tail=m.length*H;if(tail<total){if(a.length&&a.at(-1)[1]===tail)a.at(-1)[1]=total;else a.push([tail,total])}return {ranges:a,samples:a.reduce((n,[x,y])=>n+y-x,0)}}
function fromRanges(ranges,n){const out=new Uint8Array(n);for(const [a,b] of ranges)out.fill(1,Math.floor(a/H),Math.min(n,Math.ceil(b/H)));return out}
function replay(d){
  if(d.sampleRate!==RATE||d.nativeHopSamples!==H||!Array.isArray(d.gates)||!d.totalFrames)throw Error('evidence contract');
  const total=d.totalFrames,n=Math.floor(total/H),nominal=d.gates.find(g=>g.threshold===.5&&g.paddingSeconds===0);if(!nominal)throw Error('nominal activity unavailable');
  const m=activityFrames(nominal,n),lexical=new Map();
  // Recompute attribution from native activity and verbatim existing ASR block.
  // Do not read any previous per-slot association or audience-address flag.
  for(const c of d.clips){const slot=attribution(m,c[0],c[1]);if(slot!==null&&ADDRESS.test(c[3]))lexical.set(slot,(lexical.get(slot)||0)+1)}
  const roles=[];
  // Only the measured background-relative mixture energy is read from prior
  // role rows. Neither listeningLabel nor classification is consulted.
  const background=new Map(d.roles.map(r=>[r.slot,r.features.backgroundRelativeDbProxy]));
  for(let slot=0;slot<8;slot++){
    const bit=1<<slot;if(!m.some(v=>v&bit))continue;
    const windows=d.windows.filter(w=>w.slot===slot&&w.overlapFraction===0&&w.unknownFrames===0).map(w=>({startFrame:w.startFrame,endFrame:w.endFrame,spokenScore:w.spokenScore,musicScore:w.musicScore}));
    const count=lexical.get(slot)||0;roles.push({slot,classification:classify(windows,background.get(slot)??null,count>0),audienceAddressBlocks:count});
  }
  const incidental=roles.reduce((b,r)=>r.classification.likelyIncidental?b|(1<<r.slot):b,0),gates=[];
  for(const g of d.gates){
    const active=activityFrames(g,n),keep=new Uint8Array(n),removed=new Uint8Array(n);
    for(let i=0;i<n;i++){const bits=active[i];if(!bits)continue;
      // Unknown and multiple active slots remain retained; even two music
      // candidates overlapping are kept. No label-based exclusion.
      const exclusive=(bits&(bits-1))===0;if(exclusive&&(bits&incidental)===bits)removed[i]=1;else keep[i]=1;
    }
    const mask=padded(keep,d.parts,g.paddingSeconds),result=retained(mask,total),old=fromRanges(g.roleRetained,n),deferred=new Uint8Array(n),extra=new Uint8Array(n);
    for(let i=0;i<n;i++){deferred[i]=removed[i]&&!mask[i]?1:0;extra[i]=old[i]&&!mask[i]&&deferred[i]?1:0;if(mask[i]&&!old[i])throw Error('persistent mask exceeds conservative mask')}
    const slots=roles.map(r=>{let exclusive=0,prior=0,persistent=0,overlap=0;const bit=1<<r.slot;for(let i=0;i<n;i++){if(active[i]===bit){exclusive++;prior+=old[i];persistent+=mask[i]}else if(active[i]&bit)overlap++}return {slot:r.slot,exclusiveSeconds:exclusive/100,conservativeRetainedSeconds:prior/100,persistentRetainedSeconds:persistent/100,overlapSeconds:overlap/100}});
    gates.push({...g,conservativeRetained:g.roleRetained,conservativeRetainedSamples:g.roleRetainedSamples,conservativeRemoved:g.removed,
      roleRetained:result.ranges,roleRetainedSamples:result.samples,removed:frames(deferred),additionalRemoved:frames(extra),slotCoverage:slots});
  }
  return {roles,gates,policy:'offline_persistent_role_shadow',rules:RULES,newModelCalls:0,hardSuppression:false,usesHumanLabels:false,usesPreviousRoleDecision:false,wholeRecording:true};
}
return Object.freeze({replay,classify,RULES,attribution});
});