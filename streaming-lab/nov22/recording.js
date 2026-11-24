"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const audio=$("audio"),list=$("list"),choose=$("chunk"),search=$("search");
 let data=null,chunks=[],rows=[],current=-1,selected=null,seq=0;
 const hex=s=>typeof s==="string"&&/^[0-9a-f]{64}$/.test(s);
 const clock=s=>{s=Math.floor(Math.max(0,s));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
 function validate(d){
  if(d.schema!=="hl-streaming-lab-recording-v1"||d.sessionId!=="20261122T205428_176734Z_huatzaitcg"||d.sourceManifestSha256!=="7c298edc8490246fc5461f9332e5161f188c16dd16cec40829d65bcd3ff94e6b"||d.cleanIndexSha256!=="3419994e54371f3ec8e868bbea7b57791d42dc7f658fc673a638c19765f6d36b"||d.modelSignature!=="61a4311e7c09fb822aeebb233d0aab8b34824e31546eaf6f5a353aa3f6e76356"||d.humanVerified!==false||d.benchmarkEligible!==false||d.parts.length!==3||d.chunks.length!==7||d.sourceSeconds!==628.046)throw Error("Source identity mismatch");
  let start=0,n=0,offset=0;
  for(const [i,p] of d.parts.entries()){
   if(!hex(p.sha256)||!Number.isFinite(p.durationSec)||p.durationSec<=0||Math.abs(p.recordedOffsetSec-offset)>.002)throw Error("Invalid source part");
   let off=0,idx=0;const pc=d.chunks.filter(c=>c.part===p.part);
   for(const c of pc){
    const id="p"+String(i+1).padStart(2,"0")+"-c"+String(idx+1).padStart(2,"0");
    if(c.id!==id||c.audio!==id+".flac"||c.chunk!==idx||!hex(c.audioSha256)||!hex(c.pcmSha256)||!hex(c.receiptSha256)||!Number.isFinite(c.audioDurationSec)||c.audioDurationSec<=0||!Number.isFinite(c.durationSec)||c.durationSec<=0||Math.abs(c.startSec-off)>.002||Math.abs(c.recordedOffsetSec-offset-off)>.002)throw Error("Invalid audio chunk");
    for(const r of c.rows){if(!Array.isArray(r)||r.length!==3||!Number.isFinite(r[0])||!Number.isFinite(r[1])||r[0]<off-.002||r[1]<r[0]||r[1]>off+c.durationSec+.002||typeof r[2]!=="string")throw Error("Invalid transcript passage");n++}
    off+=c.durationSec;idx++;start++;
   }
   if(Math.abs(off-p.durationSec)>.002)throw Error("Incomplete source part");
   offset+=p.durationSec;
  }
  if(start!==7||n!==d.utteranceCount||Math.abs(offset-d.sourceSeconds)>.002)throw Error("Incomplete recording");
 }
 // Verify the complete source manifest and every requested playback object.
 // Each chunk is small; verify it before assigning a blob URL to the player.
 let url=null;const blobCache=new Map();
 async function load(i,offset=0,play=false){
  if(!data||i<0||i>=chunks.length)return;
  const ticket=++seq;audio.pause();const c=chunks[i];current=i;
  choose.value=String(i);$("previous").disabled=i===0;$("next").disabled=i===chunks.length-1;
  $("location").textContent=c.part+" · "+clock(c.startSec)+"–"+clock(c.startSec+c.durationSec);
  $("clock").textContent=clock(c.recordedOffsetSec+offset)+" / "+clock(data.sourceSeconds);
  try{
   let src=blobCache.get(i);
   if(!src){
    const response=await fetch("./"+c.audio,{cache:"force-cache"});if(!response.ok)throw Error("Audio unavailable");
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==c.audioBytes||await sha(bytes)!==c.audioSha256)throw Error("Audio hash mismatch");
    if(ticket!==seq)return;
    src=URL.createObjectURL(new Blob([bytes],{type:"audio/flac"}));blobCache.set(i,src);
   }
   if(ticket!==seq)return;
   if(audio.src!==src){
    audio.src=src;
    await new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(Error("Audio decode failed"))};const cleanup=()=>{audio.removeEventListener("loadedmetadata",done);audio.removeEventListener("error",fail)};audio.addEventListener("loadedmetadata",done,{once:true});audio.addEventListener("error",fail,{once:true});if(audio.readyState>=1)done()});
   }
   if(ticket!==seq)return;
   if(Math.abs(audio.duration-c.audioDurationSec)>.12)throw Error("Audio duration mismatch");
   if(offset>audio.duration+.05)throw Error("Model seek outside regenerated audio");
   audio.currentTime=Math.min(Math.max(0,offset),Math.max(0,audio.duration-.02));
   if(play)await audio.play();
   $("status").textContent=data.utteranceCount+" passages · 7/7 verified transcript chunks · "+clock(data.sourceSeconds)+" recorded audio · unreviewed base.en";
   update();
  }catch(e){if(ticket===seq){audio.pause();$("status").textContent="Playback unavailable: "+e.message}}
 }
 function update(){
  if(current<0)return;
  const c=chunks[current],t=audio.currentTime+c.startSec;
  $("clock").textContent=clock(c.recordedOffsetSec+audio.currentTime)+" / "+clock(data.sourceSeconds);
  const hit=rows.find(r=>r.c===current&&r.a<=t&&r.b>=t);
  if(hit!==selected){if(selected)selected.el.classList.remove("active");selected=hit||null;if(hit){hit.el.classList.add("active");if($("follow").checked&&!hit.el.hidden)hit.el.scrollIntoView({block:"nearest"});}}
 }
 function filter(){
  const q=search.value.trim().toLocaleLowerCase();let count=0;
  for(const r of rows){const ix=q?r.text.toLocaleLowerCase().indexOf(q):-1;r.el.hidden=!!q&&ix<0;r.textEl.replaceChildren();if(q&&ix>=0){r.textEl.append(document.createTextNode(r.text.slice(0,ix)),el("mark",r.text.slice(ix,ix+q.length)),document.createTextNode(r.text.slice(ix+q.length)));}else r.textEl.textContent=r.text;if(!r.el.hidden)count++}
  for(const h of list.querySelectorAll(".part-heading"))h.hidden=!!q&&!rows.some(r=>r.c===Number(h.dataset.chunk)&&!r.el.hidden);
  $("count").textContent=count+"/"+rows.length;
 }
 async function boot(){
  try{
   const res=await fetch("./recording.json",{cache:"no-store"});if(!res.ok)throw Error("Transcript unavailable");
   const d=await res.json();validate(d);data=d;chunks=d.chunks;
   chunks.forEach((c,i)=>{
    choose.append(new Option(c.id.toUpperCase()+" · "+clock(c.recordedOffsetSec)+"–"+clock(c.recordedOffsetSec+c.durationSec),String(i)));
    const head=el("div",c.part+" / chunk "+(c.chunk+1)+" · "+clock(c.recordedOffsetSec)+"–"+clock(c.recordedOffsetSec+c.durationSec),"part-heading");head.dataset.chunk=i;list.append(head);
    for(const [a,b,text] of c.rows){
     const r=el("button",undefined,"passage");r.type="button";r.dataset.chunk=i;r.dataset.start=String(a);r.dataset.end=String(b);
     const time=el("small",clock(c.recordedOffsetSec+a-c.startSec));const words=el("span",text);r.append(time,words);
     r.setAttribute("aria-label",clock(c.recordedOffsetSec+a-c.startSec)+" "+text);
     r.addEventListener("click",()=>load(i,a-c.startSec,true));list.append(r);rows.push({c:i,a,b,text,el:r,textEl:words});
    }
   });
   const ev=$("evidence");for(const [name,value] of [["Capture",d.sessionId],["Original media manifest",d.sourceManifestSha256],["Clean index",d.cleanIndexSha256],["Model signature",d.modelSignature],["Source audio",d.sourceSeconds+" s"],["Regenerated audio",d.playbackSeconds+" s"]])ev.append(el("p",name+": "+value));
   const link=el("a","Acceptance run 45331291571");link.href="https://github.com/HumanLAIer/hl-livestream-pilot/actions/runs/45331291571";link.target="_blank";link.rel="noopener";ev.append(link);
   search.disabled=false;choose.disabled=false;filter();await load(0);
  }catch(e){$("status").textContent="Transcript not loaded: "+e.message;audio.pause()}
 }
 choose.addEventListener("change",()=>load(Number(choose.value)));
 $("previous").addEventListener("click",()=>load(current-1,0,!audio.paused));
 $("next").addEventListener("click",()=>load(current+1,0,!audio.paused));
 search.addEventListener("input",filter);audio.addEventListener("timeupdate",update);
 audio.addEventListener("ended",()=>{if(current+1<chunks.length)load(current+1,0,true)});
 window.addEventListener("pagehide",()=>{for(const src of blobCache.values())URL.revokeObjectURL(src)});
 boot();
})();