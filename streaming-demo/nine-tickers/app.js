"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const MODELS = [
    {id:"production-base.en", code:"BASE", label:"Base Whisper"},
    {id:"singlish-small", code:"SING", label:"Singlish2English"},
    {id:"coats-large-v2", code:"COATS", label:"Coats Whisper"}
  ];
  const PHASES = [
    {id:"control", box:"rawTickers", code:"RAW", meaning:"No vocabulary prompt"},
    {id:"compact", box:"diffTickers", code:"TCG", meaning:"Compact TCG glossary"},
    {id:"focused", box:"domainTickers", code:"CTX", meaning:"Focused domain prompt"}
  ];
  const SRC="58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de";
  const PACK="dacb6b79f22ad3b7c16ecabe5ffb2c61af38c17e21381f21b850fb739e61d2a0";
  const TERMS=/(pok[eé]mon|sylveon|umbreon|leafeon|espeon|glaceon|rayquaza|charizard|pikachu|eevee|booster|etb|elite trainer box|vm[a-z]?x|packs?|psa(?:\s*10)?|cards?|slabs?|bids?|claims?|shipping|price|dollars?|sgd|market value|how much)/gi;
  const S={ready:false,data:null,videoManifest:null,block:0,lastTime:-1,pan:true,rows:new Map(),buttons:[]};
  const video=$("video");
  const el=(tag,cls,t)=>{
    const x=document.createElement(tag);
    if(cls)x.className=cls;
    if(t!==undefined)x.textContent=t;
    return x;
  };
  const set=(id,t)=>$(id).textContent=String(t);
  const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  const time=t=>{
    const v=Math.max(0,Math.floor(Number(t)||0));
    return String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0");
  };
  function skeleton(){
    let count=0;
    for(const phase of PHASES){
      const box=$(phase.box);
      box.replaceChildren();
      for(const model of MODELS){
        count++;
        const key=model.id+"--"+phase.id;
        const row=el("div","ticker-row");
        const label=el("div","ticker-model");
        const no=el("span","model-index",String(count).padStart(2,"0"));
        const name=el("span","model-title");
        name.append(el("strong","",model.code),el("small","",phase.code));
        label.append(no,name);
        const button=el("button","ticker-surface");
        button.type="button";
        button.title=model.label+" · "+phase.meaning+" · click to replay this 15-second source block";
        button.setAttribute("aria-label","Replay "+model.label+" "+phase.meaning+" source block");
        button.addEventListener("click",()=>seekBlock(S.block));
        const viewport=el("span","ticker-viewport");
        const line=el("span","ticker-line","[Awaiting verified model output]");
        viewport.append(line);
        button.append(viewport);
        const stats=el("div","ticker-meta");
        const number=el("span","ticker-badge","—");
        stats.append(number);
        row.append(label,button,stats);
        box.append(row);
        S.rows.set(key,{line,viewport,number,row,model,phase});
      }
    }
  }
  function checkData(d){
    if(!d||d.schema!=="hl-commercial-nine-public-v1"
      ||d.status!=="SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES"
      ||!d.source||d.source.sessionId!=="20261117T142835_038897Z_huatzaitcg"
      ||d.source.sourcePart!=="part_000019.ts"
      ||d.source.sourcePartOffsetSeconds!==30
      ||d.source.sourcePartSha256!==SRC||d.source.durationSeconds!==180
      ||!d.provenance||d.provenance.humanGoldAvailable!==false
      ||d.provenance.actualSalesVerified!==false
      ||d.source.mediaEventSyncVerified!==false
      ||d.domainPackSha256!==PACK||d.domainCandidatesAreReviewOnly!==true
      ||!Array.isArray(d.clips)||d.clips.length!==12
      ||!Array.isArray(d.lanes)||d.lanes.length!==9)
      throw Error("Source-matched nine-model study unavailable");
    const laneKeys=new Set();
    for(const l of d.lanes){
      if(l.id!==l.model+"--"+l.phase
        ||!MODELS.some(m=>m.id===l.model)
        ||!PHASES.some(p=>p.id===l.phase)
        ||laneKeys.has(l.id)
        ||l.verifiedSourceWav!==true
        ||typeof l.inferenceSeconds!=="number"||!Number.isFinite(l.inferenceSeconds)
        ||!hex(l.promptSha256)||l.wer!==null)
        throw Error("Missing verified ASR decoding");
      laneKeys.add(l.id);
    }
    for(let i=0;i<12;i++){
      const c=d.clips[i];
      if(c?.index!==i||c.id!=="clip"+String(i).padStart(2,"0")
        ||c.start!==i*15||c.end!==(i+1)*15||!hex(c.wavSha256)
        ||!c.texts||Object.keys(c.texts).length!==9
        ||Array.from(laneKeys).some(key=>typeof c.texts[key]!=="string"))
        throw Error("One or more audio-aligned transcript blocks missing");
    }
    if(!d.engagement||!Number.isFinite(d.engagement.comments)
       ||!Number.isFinite(d.engagement.uniqueActors)
       ||!Number.isFinite(d.engagement.deliberateEvents)
       ||!Number.isFinite(d.engagement.buyerIntentComments))
      throw Error("Observed engagement evidence missing");
    if(!Array.isArray(d.chatEvidence)||d.chatEvidence.length!==3
       ||d.chatEvidence.some(c=>!hex(c.sourceTextSha256)
            ||typeof c.text!=="string"
            ||typeof c.actor!=="string"
            ||!Number.isFinite(c.estimatedAudioSec)))
      throw Error("Unverified buyer question quotes");
  }
  function checkVideo(m,d){
    if(!m||m.schema!=="hl-commercial-video-source-v1"
       ||m.status!=="VERIFIED_SOURCE_VIDEO_WITH_AUDIO"
       ||m.sourcePartSha256!==SRC
       ||m.sessionId!==d.source.sessionId
       ||m.sourcePart!==d.source.sourcePart
       ||m.sourcePartOffsetSeconds!==30
       ||m.expectedDurationSeconds!==180
       ||m.encodedDurationSeconds<178.8
       ||m.encodedDurationSeconds>181
       ||m.filename!=="commercial-180.mp4"
       ||m.poster!=="commercial-preview.jpg"
       ||!hex(m.mp4Sha256)||!hex(m.posterSha256)
       ||m.originalAudioIncluded!==true
       ||m.mediaEventSyncVerified!==false)
       throw Error("Original video source verification failed");
  }
  function annotate(line,source,isHighlighted){
    line.replaceChildren();
    if(!source){line.append(el("span","muted","[No speech returned]"));return}
    if(!isHighlighted){line.append(document.createTextNode(source));return}
    let index=0,match;
    TERMS.lastIndex=0;
    while((match=TERMS.exec(source))!==null){
      if(match.index>index)line.append(document.createTextNode(source.slice(index,match.index)));
      line.append(el("span","term",match[0]));
      index=TERMS.lastIndex;
      if(!match[0].length)break;
    }
    if(index<source.length)line.append(document.createTextNode(source.slice(index)));
  }
  function buildBlocks(){
    const box=$("blockNav");
    box.replaceChildren();S.buttons=[];
    for(let i=0;i<12;i++){
      const b=el("button","block-btn",String(i+1).padStart(2,"0"));
      b.type="button";
      b.title="Seek source video "+time(i*15)+"–"+time((i+1)*15);
      b.setAttribute("aria-label","Seek source video block "+(i+1)+" starting "+time(i*15));
      b.addEventListener("click",()=>seekBlock(i));
      box.append(b);S.buttons.push(b);
    }
  }
  function renderBlock(index){
    if(!S.ready)return;
    S.block=Math.max(0,Math.min(11,index|0));
    S.lastTime=-1;
    const clip=S.data.clips[S.block];
    set("cueText","BLOCK "+String(S.block+1).padStart(2,"0")+" / "+time(clip.start)+"–"+time(clip.end));
    for(const [id,r] of S.rows){
      annotate(r.line,clip.texts[id],r.phase.id!=="control");
      const m=S.data.lanes.find(l=>l.id===id);
      r.number.textContent=m.inferenceSeconds.toFixed(1)+"s";
      r.row.title=m.model+" / "+m.phase+" / "+m.revision+" / peak "+Math.round(m.peakRssMib)+" MiB";
      r.line.style.transform="translateX(0px)";
    }
    S.buttons.forEach((b,i)=>{
      const active=i===S.block;
      b.classList.toggle("active",active);
      b.setAttribute("aria-pressed",String(active));
    });
  }
  function panLines(seconds){
    if(!S.ready)return;
    const reduced=window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const fraction=Math.max(0,Math.min(1,((seconds%15)/15-.14)/.74));
    for(const v of S.rows.values()){
      const max=Math.max(0,v.line.scrollWidth-v.viewport.clientWidth+6);
      v.line.style.transform="translateX(-"+((!reduced&&S.pan?fraction:0)*max).toFixed(1)+"px)";
    }
  }
  function syncClock(t){
    if(!S.ready)return;
    const seconds=Math.max(0,Math.min(180,Number(t)||0));
    set("currentClock",time(seconds));
    const block=Math.min(11,Math.floor(Math.min(179.999,seconds)/15));
    if(block!==S.block||S.lastTime<0)renderBlock(block);
    S.lastTime=seconds;
    panLines(seconds);
  }
  function seekSeconds(t){
    if(!S.ready)return;
    video.currentTime=Math.max(0,Math.min(179.95,t));
    syncClock(video.currentTime);
    video.play().catch(()=>set("audioStatus","Press play to hear the source video."));
  }
  function seekBlock(n){seekSeconds(Math.max(0,n)*15)}
  function bindControls(){
    $("speed").addEventListener("change",e=>{video.playbackRate=Number(e.target.value)||1});
    $("tickerMotion").addEventListener("change",e=>{S.pan=e.target.checked;panLines(video.currentTime)});
    video.addEventListener("timeupdate",()=>syncClock(video.currentTime));
    video.addEventListener("seeked",()=>syncClock(video.currentTime));
    video.addEventListener("play",()=>set("audioStatus","SOURCE VIDEO · NINE LIVE-SYNCED TRANSCRIPTS"));
    video.addEventListener("pause",()=>set("audioStatus","PAUSED · ALL NINE TRANSCRIPTS ALIGNED"));
    video.addEventListener("error",()=>{
      $("videoError").hidden=false;
      set("audioStatus","VIDEO UNAVAILABLE · TRANSCRIPT DATA PRESERVED");
    });
    document.querySelectorAll("[data-seek-sec]").forEach(b=>b.addEventListener("click",()=>{
      const t=Number(b.dataset.seekSec);
      if(Number.isFinite(t)&&0<=t&&t<180)seekSeconds(t);
    }));
  }
  function renderEvidence(d){
    set("metricComments",d.engagement.comments);
    set("metricAccounts",d.engagement.uniqueActors);
    set("metricEvents",d.engagement.deliberateEvents);
    set("metricBuyer",d.engagement.buyerIntentComments);
    set("audienceStatus",d.engagement.comments+" comments · "+d.engagement.uniqueActors+" accounts · "+d.engagement.deliberateEvents+" actions");
    const byTime=d.chatEvidence.slice().sort((a,b)=>a.estimatedAudioSec-b.estimatedAudioSec);
    document.querySelectorAll(".signal").forEach((button,i)=>{
      const c=byTime[i];
      if(!c)return;
      button.dataset.seekSec=String(c.estimatedAudioSec);
      button.querySelector("strong").textContent=c.text;
      button.querySelector("small").textContent="~"+time(c.estimatedAudioSec);
      button.title=c.actor+" · approximate collector/media location · original public chat";
    });
  }
  function ready(d,m){
    checkData(d);checkVideo(m,d);
    S.data=d;S.videoManifest=m;S.ready=true;
    buildBlocks();renderEvidence(d);
    video.src=m.filename;
    video.poster=m.poster;
    video.preload="metadata";
    video.load();
    $("videoError").hidden=true;
    set("audioStatus","SOURCE-VERIFIED ORIGINAL VIDEO · 9 DECODINGS");
    set("provenance","Source SHA-256 "+SRC+" · video SHA-256 "+m.mp4Sha256+" · no human-gold transcription");
    renderBlock(0);syncClock(0);
  }
  skeleton();
  bindControls();
  Promise.all([
    fetch("comparison.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("ASR data missing");return r.json()}),
    fetch("video-manifest.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("Original video missing");return r.json()})
  ]).then(([d,m])=>ready(d,m)).catch(()=>{
    set("audioStatus","VERIFIED ORIGINAL VIDEO OR NINE-DECODING DATA NOT READY");
    $("videoError").hidden=false;
  });
})();
