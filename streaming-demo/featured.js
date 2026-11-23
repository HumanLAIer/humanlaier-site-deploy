/* Public original-source ASR viewer. All transcript text and public comments
 * are loaded from the existing SHA-traced nine-ticker source artifact.
 * Source audio and collector event clocks are intentionally not conflated.
 */
"use strict";
(() => {
  const root=document.getElementById("featuredTranscript");
  if(!root)return;
  const get=id=>document.getElementById(id);
  const audio=get("featuredAudio");
  const rows=get("featuredAsrRows");
  const model=get("featuredAsrModel");
  const position=get("featuredSourcePosition");
  const comments=get("featuredChatExcerpts");
  const SOURCE_SHA="58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de";
  const AUDIO_SHA="ce403fdf33f4bd26f678f3cbedac5a0d8eb2accb620b8e56ce1d45e80962196b";
  const ENGINES=new Set([
    "production-base.en--control","singlish-small--control","coats-large-v2--control",
    "production-base.en--focused","singlish-small--focused","coats-large-v2--focused"
  ]);
  let data=null;
  let active=-1;
  let blocks=[];
  const format=n=>{
    const t=Math.max(0,Math.floor(Number(n)||0));
    return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");
  };
  const make=(tag,className,value)=>{
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(value!==undefined)element.textContent=String(value);
    return element;
  };
  const error=message=>{
    rows.replaceChildren(make("p","featured-asr-error",message));
    position.textContent="Original audio is still available; transcript could not be loaded.";
    comments.textContent="Observed comment excerpts unavailable.";
  };
  function verify(d){
    if(!d || d.schema!=="hl-commercial-nine-public-v1" ||
      d.status!=="SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES" ||
      d.source?.sourcePartSha256!==SOURCE_SHA || d.source?.audioSha256!==AUDIO_SHA ||
      d.source?.sessionId!=="20261117T142835_038897Z_huatzaitcg" ||
      d.source?.durationSeconds!==180 || d.source?.sourcePartOffsetSeconds!==30 ||
      d.source?.mediaEventSyncVerified!==false ||
      d.provenance?.humanGoldAvailable!==false ||
      d.provenance?.wordTimingsVerified!==false ||
      d.provenance?.eventMediaClockCalibrated!==false ||
      !Array.isArray(d.lanes) || d.lanes.length!==9 ||
      !Array.isArray(d.clips) || d.clips.length!==12 ||
      !Array.isArray(d.chatEvidence) || !d.engagement ||
      d.engagement.comments!==22 || d.engagement.deliberateEvents!==46 ||
      d.engagement.uniqueActors!==30)throw Error("Source and transcription provenance mismatch");
    for(let i=0;i<12;i++){
      const c=d.clips[i];
      if(!c || c.index!==i || c.start!==15*i || c.end!==15*(i+1) ||
        typeof c.wavSha256!=="string" || !/^[a-f0-9]{64}$/.test(c.wavSha256) ||
        !c.texts || !Array.from(ENGINES).every(id=>typeof c.texts[id]==="string" &&
          c.texts[id].length<12000))throw Error("Missing real source-matched transcript blocks");
    }
    for(const e of d.chatEvidence){
      if(typeof e.actor!=="string" || !/^@[A-Za-z0-9_.]{1,36}$/.test(e.actor) ||
         typeof e.text!=="string" || e.text.length>240 ||
         e.timebase!=="PROVISIONAL_RECORDER_PROCESS_OBSERVATION")throw Error("Unexpected chat evidence");
    }
  }
  function highlight(){
    if(!data)return;
    const second=Math.min(179.999,Math.max(0,Number(audio.currentTime)||0));
    const block=Math.floor(second/15);
    position.textContent="SOURCE AUDIO "+format(second)+" / 03:00 · block "+
      String(block+1).padStart(2,"0")+" / 12 (not word-aligned)";
    if(block===active)return;
    active=block;
    blocks.forEach((b,i)=>{
      b.classList.toggle("is-active",i===block);
      if(i===block)b.setAttribute("aria-current","true");
      else b.removeAttribute("aria-current");
    });
    const selected=blocks[block];
    if(selected && !rows.matches(":focus-within"))
      selected.scrollIntoView({block:"nearest",behavior:"instant"});
  }
  function renderTranscript(){
    if(!data)return;
    if(!ENGINES.has(model.value)){error("Unsupported transcript selection.");return;}
    rows.replaceChildren();
    blocks=[];
    const fragment=document.createDocumentFragment();
    for(const c of data.clips){
      const button=make("button","featured-asr-block");
      button.type="button";
      button.setAttribute("role","listitem");
      button.setAttribute("aria-label","Seek original audio "+format(c.start)+" through "+format(c.end)+
        ", transcript block "+(c.index+1));
      const clock=make("span","featured-asr-clock",format(c.start)+"–"+format(c.end));
      const transcript=c.texts[model.value];
      const line=make("span","featured-asr-text",
        transcript.trim()||"[No words returned by this engine for this block]");
      button.append(clock,line);
      button.addEventListener("click",()=>{
        audio.currentTime=c.start;
        highlight();
        const task=audio.play();
        if(task && typeof task.catch==="function")task.catch(()=>{});
      });
      fragment.appendChild(button);
      blocks.push(button);
    }
    rows.appendChild(fragment);
    active=-1;
    highlight();
  }
  function renderActivity(){
    comments.replaceChildren();
    const fragment=document.createDocumentFragment();
    const intro=make("span","featured-chat-source","Selected actual viewer comments · collector timestamps independent of source audio");
    fragment.appendChild(intro);
    for(const e of data.chatEvidence){
      const item=make("div","featured-chat-line");
      const handle=make("strong","",e.actor);
      const quote=make("span","",e.text);
      item.append(handle,quote);
      fragment.appendChild(item);
    }
    const tail=make("span","featured-chat-source",
      "Three source-verified excerpts from 22 observed comments. Approximate media placement is intentionally not used as a verified reply or audio timestamp.");
    fragment.appendChild(tail);
    comments.appendChild(fragment);
  }
  model.addEventListener("change",renderTranscript);
  audio.addEventListener("timeupdate",highlight);
  audio.addEventListener("seeked",highlight);
  audio.addEventListener("loadedmetadata",()=>{
    if(Math.abs(audio.duration-180)>1){
      audio.pause();
      error("Audio duration does not match the verified 180-second source. Please use the full nine-ticker archive.");
    }
  });
  fetch("nine-tickers/comparison.json",{cache:"no-store"})
    .then(response=>{
      if(!response.ok)throw Error("Source transcript HTTP "+response.status);
      return response.json();
    })
    .then(d=>{
      verify(d);
      data=d;
      renderTranscript();
      renderActivity();
    })
    .catch(err=>{
      console.error("Featured transcript unavailable:",err);
      error("The original machine transcript could not be verified or loaded. Open the full nine-ticker comparison from the link below.");
    });
})();