"use strict";
(()=>{
  const $=id=>document.getElementById(id);
  const MODELS=[
    {id:"production-base.en",name:"faster-whisper",short:"BASE.EN"},
    {id:"singlish-small",name:"Singlish2English",short:"SINGLISH"},
    {id:"coats-large-v2",name:"Coats Whisper",short:"COATS"}
  ];
  const PHASES=[
    {id:"control",container:"rawTickers",label:"NO PROMPT"},
    {id:"compact",container:"diffTickers",label:"TCG GLOSSARY"},
    {id:"focused",container:"domainTickers",label:"FOCUSED PROMPT"}
  ];
  const TERMS=/(pok[eé]mon|sylveon|umbreon|leafeon|espeon|glaceon|rayquaza|charizard|pikachu|eevee|booster|etb|elite trainer box|vm[a-z]?x|packs?|psa(?:\s*10)?|cards?|slabs?|bids?|claims?|shipping|price|dollars?|sgd|market value|how much)/gi;
  const SOURCE_SHA="58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de";
  const S={data:null,loaded:false,block:0,pan:true,rows:new Map(),buttons:[],last:-1};
  const audio=$("audio"),seek=$("seek"),play=$("play");
  const make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e};
  const set=(node,value)=>node.textContent=value;
  const tick=t=>{const n=Math.max(0,Number(t)||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0")};
  const sha=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
  function highlight(node,text,enable){
    node.replaceChildren();
    if(!text){node.append(make("span","muted","[Model returned no speech for this block]"));return}
    if(!enable){node.append(document.createTextNode(text));return}
    TERMS.lastIndex=0;let from=0,match;
    while((match=TERMS.exec(text))!==null){
      if(match.index>from)node.append(document.createTextNode(text.slice(from,match.index)));
      node.append(make("span","term",match[0]));
      from=TERMS.lastIndex;
      if(!match[0].length)break;
    }
    if(from<text.length)node.append(document.createTextNode(text.slice(from)));
  }
  function skeleton(){
    let number=0;
    for(const phase of PHASES){
      const slot=$(phase.container);slot.replaceChildren();
      for(const model of MODELS){
        number++;
        const id=model.id+"--"+phase.id;
        const row=make("div","ticker-row");
        const label=make("div","ticker-model");
        label.append(make("span","model-index",String(number).padStart(2,"0")));
        const title=make("div","model-title");
        title.append(make("strong","",model.name),make("small","",phase.label));
        label.append(title);
        const button=make("button","ticker-surface");
        button.type="button";button.setAttribute("aria-label","Replay source block for "+model.name+" "+phase.label);
        button.addEventListener("click",()=>go(S.block));
        const viewport=make("span","ticker-viewport");
        const line=make("span","ticker-line","AWAITING SOURCE-MATCHED ASR");
        viewport.append(line);button.append(viewport);
        const meta=make("div","ticker-meta");
        const badge=make("span","ticker-badge is-muted","NOT VERIFIED");
        const smaller=make("span","ticker-secondary","No invented transcript");
        meta.append(badge,smaller);
        row.append(label,button,meta);slot.append(row);
        S.rows.set(id,{line,viewport,meta,badge,smaller,row,model,phase});
      }
    }
  }
  function validate(d){
    if(!d||d.schema!=="hl-commercial-nine-public-v1"
       ||d.status!=="SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES"
       ||!d.source||d.source.sessionId!=="20261117T142835_038897Z_huatzaitcg"
       ||d.source.sourcePart!=="part_000019.ts"
       ||d.source.sourcePartSha256!==SOURCE_SHA
       ||d.source.sourcePartOffsetSeconds!==30||d.source.durationSeconds!==180
       ||d.source.audioFile!=="commercial-180.mp3"||!sha(d.source.audioSha256)
       ||d.source.mediaEventSyncVerified!==false
       ||!d.provenance||d.provenance.humanGoldAvailable!==false
       ||d.provenance.actualSalesVerified!==false
       ||d.provenance.wordTimingsVerified!==false
       ||!Array.isArray(d.lanes)||d.lanes.length!==9
       ||!Array.isArray(d.clips)||d.clips.length!==12
       ||!d.engagement||!Number.isFinite(d.engagement.comments)
       ||!Number.isFinite(d.engagement.uniqueActors))throw Error("Published research contract unavailable");
    const ids=new Set();
    for(const l of d.lanes){
      if(!MODELS.some(m=>m.id===l.model)
         ||!PHASES.some(p=>p.id===l.phase)
         ||l.id!==l.model+"--"+l.phase||ids.has(l.id)
         ||typeof l.revision!=="string"||l.revision.length!==40
         ||!sha(l.promptSha256)||!Number.isFinite(l.inferenceSeconds)
         ||l.inferenceSeconds<0||!Number.isFinite(l.peakRssMib)
         ||l.peakRssMib<=0||l.verifiedSourceWav!==true||l.wer!==null)
          throw Error("Not all nine independent ASR configurations verified");
      ids.add(l.id);
    }
    for(let i=0;i<12;i++){
      const c=d.clips[i];
      if(!c||c.index!==i||c.id!=="clip"+String(i).padStart(2,"0")
         ||c.start!==15*i||c.end!==15*(i+1)
         ||!sha(c.wavSha256)||!c.texts||Object.keys(c.texts).length!==9
         ||!Array.from(ids).every(id=>typeof c.texts[id]==="string"&&c.texts[id].length<=12000))
          throw Error("One or more source audio blocks/lanes missing");
    }
    if(d.chatEvidence){
      if(!Array.isArray(d.chatEvidence)||d.chatEvidence.length>25)throw Error("Chat evidence bounds invalid");
      for(const c of d.chatEvidence){
        if(!Number.isFinite(c.estimatedAudioSec)||c.estimatedAudioSec<0
           ||c.estimatedAudioSec>=180||!sha(c.sourceTextSha256)
           ||typeof c.text!=="string"||c.text.length>240
           ||typeof c.actor!=="string"||c.actor.length>100)
          throw Error("Unverified chat evidence schema");
      }
    }
  }
  function buildNav(){
    const target=$("blockNav");target.replaceChildren();S.buttons=[];
    const comments=S.data.clips.map(c=>Number(c.engagement?.comments)||0);
    const high=Math.max(1,...comments);
    for(let i=0;i<12;i++){
      const btn=make("button","block-btn");
      btn.type="button";
      btn.setAttribute("aria-label","Play source block "+(i+1)+" at "+tick(i*15));
      btn.title="Block "+(i+1)+" / "+comments[i]+" observed comments, provisional clock";
      btn.append(make("span","",String(i+1).padStart(2,"0")));
      const bar=make("i");
      bar.style.setProperty("--activity-height",(3+17*comments[i]/high)+"px");
      btn.append(bar);
      btn.addEventListener("click",()=>go(i));
      target.append(btn);S.buttons.push(btn);
    }
  }
  function inspector(clip){
    const chat=(S.data.chatEvidence||[]).filter(item=>item.estimatedAudioSec>=clip.start&&item.estimatedAudioSec<clip.end);
    if(chat.length){
      set($("inspectorHeading"),"Buyer questions near this moment");
      set($("inspectorBody"),chat.slice(0,2).map(c=>c.actor+": “"+c.text+"”").join("   ·   ")
          +" [Collector-media offset estimated; this does not prove the message reacted to the spoken phrase.]");
      set($("inspectorTag"),chat.length+" OBSERVED COMMENTS");
    }else{
      set($("inspectorHeading"),"Three engines, three configurations");
      set($("inspectorBody"),"This block lets you compare the original words returned under nine actual decoding conditions. Domain highlights identify vocabulary references, not verified entities, products, price quotes, or completed sales.");
      set($("inspectorTag"),"REVIEW UNVERIFIED SPEECH");
    }
  }
  function showBlock(i){
    if(!S.loaded)return;
    const n=Math.max(0,Math.min(11,i|0));S.block=n;S.last=-1;
    const clip=S.data.clips[n];
    set($("cueText"),"SOURCE BLOCK "+String(n+1).padStart(2,"0")+" · "+tick(clip.start)+"–"+tick(clip.end));
    set($("blockCounter"),"BLOCK "+String(n+1).padStart(2,"0")+" / 12");
    for(const [id,v] of S.rows){
      const result=S.data.lanes.find(l=>l.id===id);
      highlight(v.line,clip.texts[id],v.phase.id!=="control");
      v.badge.classList.remove("is-muted");
      set(v.badge,result.inferenceSeconds.toFixed(1)+"s / 180s");
      set(v.smaller,Math.round(result.peakRssMib).toLocaleString()+" MiB RSS · "+result.revision.slice(0,7));
      v.line.style.transform="translateX(0px)";
      v.row.classList.toggle("active",Boolean(clip.texts[id]));
    }
    S.buttons.forEach((b,j)=>{b.classList.toggle("active",j===n);b.setAttribute("aria-pressed",String(j===n))});
    inspector(clip);
  }
  function pan(t){
    if(!S.loaded)return;
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const f=Math.max(0,Math.min(1,((t%15)/15-.12)/.76));
    for(const x of S.rows.values()){
      const overflow=Math.max(0,x.line.scrollWidth-x.viewport.clientWidth+10);
      x.line.style.transform="translateX(-"+((S.pan&&!reduce?f:0)*overflow).toFixed(2)+"px)";
    }
  }
  function sync(t){
    const seconds=Math.max(0,Math.min(180,Number(t)||0));
    set($("currentClock"),tick(seconds));
    seek.value=String(seconds);
    const n=Math.min(11,Math.floor(Math.min(179.999,seconds)/15));
    if(n!==S.block||S.last<0)showBlock(n);
    S.last=seconds;pan(seconds);
  }
  function go(n){
    if(!S.loaded)return;
    audio.currentTime=Math.min(179.95,Math.max(0,n)*15);
    sync(audio.currentTime);
    audio.play().catch(()=>set($("audioStatus"),"Select play to hear the source."));
  }
  function controls(){
    play.addEventListener("click",()=>{
      if(!S.loaded)return;
      if(audio.paused)audio.play().catch(()=>set($("audioStatus"),"Play blocked by browser; try again."));
      else audio.pause();
    });
    seek.addEventListener("input",()=>{if(S.loaded){audio.currentTime=Number(seek.value);sync(audio.currentTime)}});
    $("speed").addEventListener("change",e=>audio.playbackRate=Number(e.target.value)||1);
    $("tickerMotion").addEventListener("change",e=>{S.pan=e.target.checked;pan(audio.currentTime)});
    $("zekromJump").textContent="Jump to card-price discussion ↗";
    $("zekromJump").addEventListener("click",()=>go(10));
    document.querySelectorAll("[data-evidence-second]").forEach(button=>{
      button.addEventListener("click",()=>{
        if(!S.loaded)return;
        const proposed=Number(button.dataset.evidenceSecond);
        if(!Number.isFinite(proposed)||proposed<0||proposed>=180)return;
        audio.currentTime=proposed;
        sync(proposed);
        audio.play().catch(()=>set($("audioStatus"),"Select play to hear the approximate source moment."));
      });
    });
    audio.addEventListener("timeupdate",()=>sync(audio.currentTime));
    audio.addEventListener("seeked",()=>sync(audio.currentTime));
    audio.addEventListener("play",()=>{set($("playGlyph"),"Ⅱ");play.setAttribute("aria-label","Pause original source audio")});
    audio.addEventListener("pause",()=>{set($("playGlyph"),"▶");play.setAttribute("aria-label","Play original source audio")});
    audio.addEventListener("error",()=>set($("audioStatus"),"Media not available; transcript tickers can still be reviewed."));
  }
  function ready(d){
    validate(d);S.data=d;S.loaded=true;
    buildNav();
    set($("metricComments"),d.engagement.comments.toLocaleString());
    set($("metricAccounts"),d.engagement.uniqueActors.toLocaleString());
    set($("metricEvents"),Number(d.engagement.deliberateEvents||0).toLocaleString());
    set($("metricBuyer"),Number(d.engagement.buyerIntentComments||0).toLocaleString());
    audio.src=d.source.audioFile;audio.load();
    play.disabled=false;seek.disabled=false;
    set($("audioStatus"),"Nine real decodings · immutable source · no human reference");
    set($("provenance"),"SOURCE "+d.source.sessionId+" / "+d.source.sourcePart
        +" +"+d.source.sourcePartOffsetSeconds+"s / original SHA-256 "+d.source.sourcePartSha256
        +" / MEDIA↔EVENT CLOCK ESTIMATED, NOT CALIBRATED / NO WER");
    showBlock(0);sync(0);
  }
  skeleton();controls();
  fetch("comparison.json",{cache:"no-store"})
    .then(response=>{if(!response.ok)throw Error("No approved nine-lane data");return response.json()})
    .then(ready)
    .catch(()=>{
      S.loaded=false;
      set($("audioStatus"),"Research build · nine source-matched results not yet published");
      set($("inspectorBody"),"The real source window has been chosen, but none of the nine tickers will display guessed speech. Exact source verification and model output receipt checks must complete before this comparison becomes playable.");
      set($("inspectorTag"),"RESULTS PENDING");
      set($("provenance"),"No synthetic transcription data. Source and result audit required.");
    });
})();
