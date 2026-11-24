"use strict";
(()=>{
const $=id=>document.getElementById(id);
const models=[["production-base.en","BASE.EN"],["singlish-small","SINGLISH SMALL"],["coats-large-v2","COATS LARGE-V2"]];
const phases=[["control","UNPROMPTED"],["compact","COMPACT GLOSSARY"],["focused","FOCUSED GLOSSARY"]];
const lanes=phases.flatMap(([p,phase])=>models.map(([m,model])=>({id:m+"--"+p,model,phase})));
const expected="8594e0d859723075454531cbc11ada7d7bc93f51d83ff31ae595bff73ff77a4a";
const reviewSha="e25445ab9fdb10c9e080013d9e0d131243661104a21e03f649975c697e0eeebb";
const fractions={"production-base.en--control":17.0,"production-base.en--compact":26.0,"production-base.en--focused":41.5,"singlish-small--control":1.33,"singlish-small--compact":0.54,"singlish-small--focused":0.66,"coats-large-v2--control":35.9,"coats-large-v2--compact":47.9,"coats-large-v2--focused":29.1};
let data=null,index=-1,part=-1,seek=null,playing=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const clock=s=>{const ms=Math.round(Math.max(0,s)*1000);return String(Math.floor(ms/60000)).padStart(2,"0")+":"+String(Math.floor(ms/1000)%60).padStart(2,"0")+"."+String(ms%1000).padStart(3,"0")};
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const audio=$("player");
function validate(d){
 if(d.schema!=="hl-nov22-nine-public-v1"||d.sessionId!=="20261122T205428_176734Z_huatzaitcg"||d.sourceManifestSha256!==expected||d.reviewSha256!==reviewSha||d.humanAccuracyVerified!==false||d.wordTelemetryAvailable!==false||d.audioLosslessVerified!==true||d.sampleRate!==16000||d.clips.length!==43||d.parts.length!==3||d.lanes.length!==9)throw Error("Source contract mismatch");
 const keys=lanes.map(l=>l.id).sort().join(",");
 if(d.lanes.map(l=>l.lane).sort().join(",")!==keys)throw Error("Lane inventory mismatch");
 let total=0;
 for(let p=0;p<3;p++){const item=d.parts[p];if(item.file!=="part-"+(p+1)+".flac"||!Number.isInteger(item.frames)||item.frames<=0||item.duration!==item.frames/16000||!/^([a-f0-9]{64})$/.test(item.sha256))throw Error("Part manifest mismatch");let end=0;for(const c of d.clips.filter(c=>c.sourcePart===item.part)){if(c.startFrame!==end||c.endFrame<=end||c.frames!==c.endFrame-c.startFrame||c.startSec!==c.startFrame/16000||c.endSec!==c.endFrame/16000)throw Error("Source timing mismatch");end=c.endFrame;}if(end!==item.frames)throw Error("Source coverage mismatch");total+=end;}
 if(total/16000!==d.audioSeconds)throw Error("Audio duration mismatch");
 d.clips.forEach((c,i)=>{if(c.id!=="clip"+String(i).padStart(3,"0")||Object.keys(c.texts).sort().join(",")!==keys||Object.keys(c.candidates).sort().join(",")!==keys||!lanes.some(l=>l.id===c.representative))throw Error("Block inventory mismatch");
 for(const l of lanes){const t=c.texts[l.id];if(typeof t!=="string"||t.length>24000)throw Error("Text invalid");for(const e of c.candidates[l.id]){if(Array.from(t).slice(e.start,e.end).join("")!==e.original)throw Error("Source span mismatch");}}});
}
function repetition(t){const seq=t.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];let max=0,unit=1;for(let n=1;n<=6;n++){for(let i=0;i+3*n<=seq.length;){let j=i+n;while(j+n<=seq.length&&seq.slice(i,i+n).every((v,k)=>seq[j+k]===v))j+=n;if(j-i>max){max=j-i;unit=n;}i=j-i>=3*n?j:i+1;}}return max/unit>=10&&max>=20?{count:max/unit,unit}:null}
function decorate(parent,text,candidates){
 const chars=Array.from(text);const spans=candidates.filter(c=>["singlish","participant"].includes(c.domain)).sort((a,b)=>a.start-b.start||b.end-a.end);let pos=0;
 for(const s of spans){if(s.start<pos)continue;parent.append(document.createTextNode(chars.slice(pos,s.start).join("")));parent.append(el("span",chars.slice(s.start,s.end).join(""),s.domain==="singlish"?"sg":"person"));pos=s.end;}
 parent.append(document.createTextNode(chars.slice(pos).join("")));
}
function render(){
 const c=data.clips[index];if(!c)return;
 $("blocks").value=String(index);$("prev").disabled=index===0;$("next").disabled=index===42;
 $("cue").textContent="BLOCK "+(index+1)+"/43 · "+c.sourcePart+" · "+clock(c.startSec)+"–"+clock(c.endSec);
 for(const [i,b] of [...$("blockStrip").children].entries())b.setAttribute("aria-pressed",String(i===index));
 for(const [i,b] of [...$("parts").children].entries())b.setAttribute("aria-pressed",String(i===part));
 const parent=$("lanes");parent.replaceChildren();let total=0;
 for(const lane of lanes){const t=c.texts[lane.id],cs=c.candidates[lane.id];total+=cs.length;const card=el("article",undefined,"lane");
 const h=el("div",undefined,"lane-head");h.append(el("span",lane.model,"model"),el("span",lane.phase,"phase"));card.append(h);
 const warning=repetition(t);if(warning)card.append(el("span","SUSPECTED LOOP · "+warning.count+" × "+warning.unit+" token unit","warn"));
 const p=el("p");p.setAttribute("aria-label",lane.model+" "+lane.phase+" original transcript");decorate(p,t,cs);if(!t)p.textContent="(Empty model output)";card.append(p);
 const b=el("button",cs.length+" review candidates · inspect");b.type="button";b.addEventListener("click",()=>{$("reviewLane").value=lane.id;$("review").open=true;showEvidence();$("review").scrollIntoView({block:"nearest"});});card.append(b);parent.append(card);}
 $("repText").textContent=c.texts[c.representative]||"(Empty model output)";$("repLabel").textContent=c.representative+" · DISTANCE "+c.meanTokenDistance.toFixed(2)+" · NOT ACCURACY";
 $("candidateCount").textContent=total+" hypotheses in this block";showEvidence();
}
function showEvidence(){
 const c=data?.clips[index];if(!c)return;
 const list=$("evidence");list.replaceChildren();const hits=c.candidates[$("reviewLane").value]||[];
 if(!hits.length){list.append(el("p","No retained candidates in this lane. This does not prove absence."));return}
 for(const e of hits){const row=el("div",undefined,"evidence-line");row.append(el("strong",e.label+"? "),el("small",e.domain+" · "+e.type+" · "+e.match+(e.ambiguous?" · ambiguous":"")),el("div","Raw span: “"+e.original+"” · chars "+e.start+"–"+e.end));list.append(row);}
}
function select(i,autoplay=false){
 if(!data||i<0||i>=43)return;
 const c=data.clips[i],nextPart=data.parts.findIndex(p=>p.part===c.sourcePart);
 index=i;
 if(nextPart!==part){part=nextPart;seek=c.startSec;playing=autoplay;audio.src=data.parts[part].file;audio.load();}
 else if(audio.readyState>=1){audio.currentTime=c.startSec;if(autoplay)audio.play().catch(()=>{});}
 else{seek=c.startSec;playing=autoplay}
 render();
}
function follow(){if(!data||part<0)return;$("clock").textContent=clock(audio.currentTime)+" / "+clock(data.parts[part].duration);
 if(seek!==null)return;let i=data.clips.findIndex(c=>c.sourcePart===data.parts[part].part&&audio.currentTime>=c.startSec&&audio.currentTime<c.endSec);
 if(i>=0&&i!==index){index=i;render();}}
audio.addEventListener("loadedmetadata",()=>{if(!data||part<0)return;const expectedDuration=data.parts[part].duration;if(Math.abs(audio.duration-expectedDuration)>.05){audio.pause();$("status").textContent="Audio duration mismatch — playback stopped";return;}const t=seek;seek=null;if(t!==null)audio.currentTime=t;if(playing){playing=false;audio.play().catch(()=>{$("status").textContent="Press play to resume at the next source part";});}follow();});
audio.addEventListener("timeupdate",follow);
audio.addEventListener("ended",()=>{if($("advance").checked&&part<2){const n=data.clips.findIndex(c=>c.sourcePart===data.parts[part+1].part);select(n,true);}});
audio.addEventListener("error",()=>{$("status").textContent="Source audio unavailable — no substitute used";});
$("prev").addEventListener("click",()=>select(index-1,!audio.paused));$("next").addEventListener("click",()=>select(index+1,!audio.paused));$("blocks").addEventListener("change",()=>select(Number($("blocks").value),!audio.paused));$("reviewLane").addEventListener("change",showEvidence);
async function load(){
 const r=await fetch("comparison.json",{cache:"no-store"});if(!r.ok)throw Error("Comparison unavailable");const bytes=await r.arrayBuffer();const digest=hex(await crypto.subtle.digest("SHA-256",bytes));
 if(digest!=="8669a3403f609db40ee427842d4446852c292c0e21b7284850d43edcd8e486e6")throw Error("Comparison checksum mismatch");
 const d=JSON.parse(new TextDecoder().decode(bytes));validate(d);data=d;
 for(const [i,p] of d.parts.entries()){const b=el("button","PART "+(i+1)+" · "+clock(p.duration));b.type="button";b.addEventListener("click",()=>select(d.clips.findIndex(c=>c.sourcePart===p.part),!audio.paused));$("parts").append(b);}
 d.clips.forEach((c,i)=>{const p=d.parts.findIndex(p=>p.part===c.sourcePart);const label="Block "+(i+1)+" · part "+(p+1)+" · "+clock(c.startSec);const o=el("option",label);o.value=String(i);$("blocks").append(o);
 const b=el("button",String(i+1).padStart(2,"0"),c.startFrame===0&&i>0?"boundary":"");b.type="button";b.title=label;b.setAttribute("aria-label",label);b.addEventListener("click",()=>select(i,!audio.paused));$("blockStrip").append(b);});
 for(const l of lanes){const o=el("option",l.model+" · "+l.phase);o.value=l.id;$("reviewLane").append(o);
 const m=d.summary[l.id],tr=el("tr");for(const v of [l.model+" / "+l.phase,m.singlishCandidates,m.clipsWithSinglish,m.participantCandidates,m.pokemonCandidates,m.inferenceSeconds.toFixed(1),fractions[l.id].toFixed(2)])tr.append(el("td",String(v)));$("metrics").append(tr);}
 for(const [k,v] of [["Session",d.sessionId],["Source manifest",d.sourceManifestSha256],["Original media manifest",d.originalManifestSha256],["Private review receipt",d.reviewSha256],["Public comparison SHA-256",digest],...d.parts.map((p,i)=>["Part "+(i+1)+" PCM SHA-256",p.pcmSha256])])$("provenance").append(el("dt",k),el("dd",v));
 $("blocks").disabled=false;$("status").textContent="43 source blocks · nine retained lanes · unreviewed";select(0);
}
load().catch(e=>{$("status").textContent="Source validation failed — "+e.message;$("lanes").replaceChildren();audio.removeAttribute("src");});
})();