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

  // Compare original model words, never rewrite them or confuse agreement
  // with human-verified accuracy. Only the presentation is annotated.
  const WORD_RE=/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;
  const simplify=s=>s.normalize("NFKC").toLocaleLowerCase("en")
    .replace(/['’]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
  function getWords(source){
    WORD_RE.lastIndex=0;
    return Array.from(source.matchAll(WORD_RE),m=>({
      start:m.index,end:m.index+m[0].length,text:m[0],key:simplify(m[0])
    }));
  }
  function compareWords(source,reference){
    const newer=getWords(source),older=getWords(reference);
    const n=newer.length,m=older.length, changed=new Set();
    if(!n)return {words:newer,changed,added:0,removed:m};
    if(!m)return {words:newer,changed:new Set(newer.map((_,i)=>i)),added:n,removed:0};
    let matched=0;
    if(n*m>120000){
      // Bounded fallback for pathological repetition. Still only a visual
      // hint, not an accuracy score. Prefer no fabricated word alignment.
      const left=new Map();
      for(const x of older)left.set(x.key,(left.get(x.key)||0)+1);
      for(let i=0;i<n;i++){
        const key=newer[i].key,available=left.get(key)||0;
        if(available){left.set(key,available-1);matched++}
        else changed.add(i);
      }
    }else{
      const stride=m+1;
      const dp=new Uint16Array((n+1)*stride);
      for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
        dp[i*stride+j]=newer[i].key===older[j].key
          ?dp[(i+1)*stride+j+1]+1
          :Math.max(dp[(i+1)*stride+j],dp[i*stride+j+1]);
      }
      let i=0,j=0;
      while(i<n&&j<m){
        if(newer[i].key===older[j].key){matched++;i++;j++}
        else if(dp[(i+1)*stride+j]>=dp[i*stride+j+1]){changed.add(i);i++}
        else j++;
      }
      while(i<n)changed.add(i++);
    }
    return {words:newer,changed,added:n-matched,removed:m-matched};
  }
  function differences(source,reference,otherRaw){
    if(otherRaw){
      const known=new Set(otherRaw.flatMap(text=>getWords(text).map(x=>x.key)));
      const words=getWords(source),changed=new Set();
      words.forEach((w,i)=>{if(w.key.length>=3&&!known.has(w.key))changed.add(i)});
      return {words,changed,added:changed.size,removed:0,mode:"unique"};
    }
    return {...compareWords(source,reference),mode:"changed"};
  }
  // Surface probable decoder degeneration without modifying an evidence source.
  // Require >=10 repeated phrases spanning >=80% of words to avoid flagging
  // an ordinary speaker repetition. This is a review warning, not a WER score.
  function detectDecodeLoop(source){
    const words=getWords(source);
    if(words.length<20)return null;
    let best=null;
    const keys=words.map(x=>x.key);
    for(let start=0;start<Math.min(8,words.length);start++){
      for(let width=1;width<=5;width++){
        if(start+width*10>words.length)continue;
        let repeats=1;
        while(start+(repeats+1)*width<=words.length){
          const next=start+repeats*width;
          let equal=true;
          for(let k=0;k<width;k++)if(keys[start+k]!==keys[next+k]){equal=false;break}
          if(!equal)break;
          repeats++;
        }
        const fraction=repeats*width/words.length;
        if(repeats>=10&&fraction>=.8&&(!best||fraction>best.fraction||
           (fraction===best.fraction&&width<best.width))){
          best={start,width,repeats,fraction};
        }
      }
    }
    if(!best)return null;
    const phrase=source.slice(words[best.start].start,
                              words[best.start+best.width-1].end);
    return {phrase,count:best.repeats,coverage:best.fraction,
            sourceText:source};
  }
  const S={ready:false,data:null,videoManifest:null,block:0,lastTime:-1,pan:true,rows:new Map(),buttons:[],frame:0,seekIntent:null,seekTimer:0};
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
        const line=el("span","ticker-line ticker-tape","[Awaiting verified source timeline]");
        viewport.append(line);
        button.append(viewport);
        const stats=el("div","ticker-meta");
        const delta=el("span","ticker-change is-empty","—");
        const number=el("span","ticker-badge","—");
        const rawToggle=el("button","ticker-raw-toggle","RAW");
        rawToggle.type="button";
        rawToggle.hidden=true;
        rawToggle.setAttribute("aria-label","Show the original uncompressed model output");
        stats.append(delta,number,rawToggle);
        row.append(label,button,stats);
        box.append(row);
        const lane={line,viewport,number,delta,rawToggle,row,model,phase,
                    segments:[],diffs:[],anchors:[],loops:new Map(),rawLoops:new Set()};
        S.rows.set(key,lane);
        rawToggle.addEventListener("click",()=>{
          if(!S.ready||!lane.loops.has(S.block))return;
          if(lane.rawLoops.has(S.block))lane.rawLoops.delete(S.block);
          else lane.rawLoops.add(S.block);
          renderTapeSegment(lane,S.block);
          measureTimelines();
          renderBlock(S.block);
        });
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
  function annotate(line,source,diff){
    line.replaceChildren();
    if(!source){line.append(el("span","muted","[No speech returned]"));return}
    // Match terms against the unaltered full string first, so multi-word
    // names and business phrases ("Elite Trainer Box", "how much") stay
    // highlighted without rewriting or splitting their source words.
    TERMS.lastIndex=0;
    const domainRanges=Array.from(source.matchAll(TERMS),
      m=>[m.index,m.index+m[0].length]);
    let pos=0;
    for(let i=0;i<diff.words.length;i++){
      const token=diff.words[i];
      if(token.start>pos)line.append(document.createTextNode(source.slice(pos,token.start)));
      const isDomain=domainRanges.some(([a,b])=>token.start>=a&&token.end<=b);
      const changed=diff.changed.has(i);
      if(isDomain||changed){
        const classes=[];
        if(isDomain)classes.push("term");
        if(changed)classes.push(diff.mode==="unique"?"word-unique":"word-change");
        line.append(el("span",classes.join(" "),token.text));
      }else line.append(document.createTextNode(token.text));
      pos=token.end;
    }
    if(pos<source.length)line.append(document.createTextNode(source.slice(pos)));
  }
  // The default ticker uses an explicit warning summary rather than
  // endlessly scrolling duplicated tokens. RAW restores the exact model text
  // for inspection. The model results and comparison.json never change.
  function renderTapeSegment(r,index){
    const segment=r.segments[index];
    const source=S.data.clips[index].texts[r.model.id+"--"+r.phase.id];
    const loop=r.loops.get(index);
    segment.classList.toggle("ticker-loop-flag",Boolean(loop));
    if(loop&&!r.rawLoops.has(index)){
      segment.replaceChildren(el("span","ticker-loop-summary",
        "⚠ SUSPECTED ASR LOOP · “"+loop.phrase+"” ×"+loop.count+
        " · RAW AVAILABLE"));
      segment.title="Compressed display of a repeated model output, NOT a "+
        "transcription correction. Original output: "+loop.sourceText;
      segment.dataset.loopCollapsed="true";
    }else{
      annotate(segment,source,r.diffs[index]);
      segment.title=loop
        ?"Original unmodified ASR output ("+loop.count+" repetitions of “"+
         loop.phrase+"”); click FOLD to condense."
        :"Source block "+(index+1)+" original model text";
      segment.dataset.loopCollapsed="false";
    }
  }
  // Every lane owns one immutable 180-second ribbon of 12 real ASR blocks.
  // We annotate text once. Nothing is replaced when the source crosses 15s.
  function buildTimelines(){
    const laneById=new Map(S.data.lanes.map(l=>[l.id,l]));
    for(const [id,r] of S.rows){
      r.line.replaceChildren();
      r.segments=[];
      r.diffs=[];
      r.loops.clear();
      for(let i=0;i<12;i++){
        const clip=S.data.clips[i];
        const original=clip.texts[id];
        const raw=clip.texts[r.model.id+"--control"];
        const others=r.phase.id==="control"
          ?MODELS.filter(m=>m.id!==r.model.id)
                 .map(m=>clip.texts[m.id+"--control"])
          :null;
        const diff=differences(original,raw,others);
        const segment=el("span","ticker-chunk");
        segment.dataset.sourceBlock=String(i+1);
        segment.title="Source block "+(i+1)+" ("+time(i*15)+"–"+time((i+1)*15)+
          "): original "+r.model.label+" "+r.phase.code+" transcript";
        r.segments.push(segment);
        r.diffs.push(diff);
        const loop=detectDecodeLoop(original);
        if(loop)r.loops.set(i,loop);
        renderTapeSegment(r,i);
        r.line.append(segment);
      }
      r.line.dataset.continuousSourceTape="true";
      const result=laneById.get(id);
      r.number.textContent=result.inferenceSeconds.toFixed(1)+"s";
      r.row.title=result.model+" / "+result.phase+" / "+result.revision+
        " / peak "+Math.round(result.peakRssMib)+" MiB / 180s source-aligned, 12 contiguous blocks";
    }
    measureTimelines();
  }
  function measureTimelines(){
    if(!S.ready)return;
    for(const r of S.rows.values()){
      let px=0;
      r.anchors=[0];
      for(const chunk of r.segments){
        // getBoundingClientRect includes subpixel text advance; no guessed
        // word timestamps. The whole source span gets exactly 15 seconds.
        const width=chunk.getBoundingClientRect().width;
        px+=Math.max(width,1);
        r.anchors.push(px);
      }
      // Each row's approximate source "now" point is pinned to the same
      // fraction of the ticker width for easy side-by-side comparison.
      r.playheadPx=r.viewport.clientWidth*.24;
    }
    panLines(video.currentTime);
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
  // Active block updates only navigation and a small delta indicator; the
  // actual ticker DOM/text is built once and never refreshed or reset.
  function renderBlock(index){
    if(!S.ready)return;
    S.block=Math.max(0,Math.min(11,index|0));
    const clip=S.data.clips[S.block];
    set("cueText",String(S.block+1).padStart(2,"0")+" / "+time(clip.start)+"–"+time(clip.end));
    for(const r of S.rows.values()){
      const diff=r.diffs[S.block];
      if(!diff)continue;
      const loop=r.loops.get(S.block);
      r.row.classList.toggle("has-decode-loop",Boolean(loop));
      r.rawToggle.hidden=!loop;
      r.rawToggle.textContent=r.rawLoops.has(S.block)?"FOLD":"RAW";
      r.rawToggle.setAttribute("aria-pressed",String(r.rawLoops.has(S.block)));
      if(loop){
        r.delta.textContent="⚠×"+loop.count;
        r.delta.classList.remove("is-empty");
        r.delta.classList.add("is-decode-loop");
        r.delta.title="Probable model repetition: “"+loop.phrase+
                      "” repeated "+loop.count+" times (not an accuracy score)";
        r.rawToggle.setAttribute("aria-label",
          (r.rawLoops.has(S.block)?"Condense":"Show")+" the original "+loop.count+
          "-repeat Singlish ASR transcript in block "+(S.block+1));
      }else{
        r.delta.classList.remove("is-decode-loop");
        r.delta.textContent=(diff.mode==="unique"?"≠":"+")+diff.added;
        r.delta.classList.toggle("is-empty",diff.added===0);
        r.delta.title=diff.mode==="unique"
          ?diff.added+" tokens absent in both other unprompted engines for this same source block"
          :diff.added+" newly present words; "+diff.removed+" baseline words absent in this same source block";
      }
    }
    S.buttons.forEach((b,i)=>{
      const active=i===S.block;
      b.classList.toggle("active",active);
      b.setAttribute("aria-pressed",String(active));
    });
    // Source-backed multi-ASR disagreement, not a corrected transcript.
    // This is a hypothesis raised for human listening review.
    const entityFoot=$("metricContext");
    const umbrella=(S.block===3 &&
      /mombreon\s+please/i.test(clip.texts["production-base.en--focused"]) &&
      /momebrion\s+please/i.test(clip.texts["singlish-small--compact"]) &&
      /um bombion\s+please/i.test(clip.texts["coats-large-v2--control"]));
    entityFoot.classList.toggle("is-review-candidate",umbrella);
    entityFoot.textContent=umbrella
      ?"REVIEW ONLY · Umbreon? · Base CTX: mombreon · Sing TCG: momebrion · Coats RAW: um bombion · Coats CTX omits · LISTEN TO VERIFY"
      :"Illustrative questions only · no confirmed product, purchase, or revenue";
  }
  // A CNBC-style continuous crawl. All word positions within a verified
  // 15-second block receive a uniform, linear time interpolation. We have
  // NO verified word timestamps, so this is an approximate visual timebase.
  // At t=15n the transform equals the previous span's exact end and the
  // next span's exact start: no jump, DOM replacement or reset.
  function panLines(seconds){
    if(!S.ready)return;
    const reduced=window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const t=Math.max(0,Math.min(180,Number(seconds)||0));
    const clip=Math.min(11,Math.floor(Math.min(179.999999,t)/15));
    const progress=Math.max(0,Math.min(1,(t-15*clip)/15));
    for(const r of S.rows.values()){
      if(r.anchors.length!==13)continue;
      const start=r.anchors[clip],end=r.anchors[clip+1];
      // Default advances the written left-to-right transcript from right
      // to left, as a genuine broadcast ticker. Reduced-motion / opt-out
      // anchors the current block instead of animating its words.
      const px=(S.pan&&!reduced)?start+(end-start)*progress:start;
      r.line.style.transform="translate3d("+(r.playheadPx-px).toFixed(3)+"px,0,0)";
    }
  }
  function syncClock(t){
    if(!S.ready)return;
    const seconds=Math.max(0,Math.min(180,Number(t)||0));
    const label=time(seconds);
    if($("currentClock").textContent!==label)set("currentClock",label);
    const block=Math.min(11,Math.floor(Math.min(179.999,seconds)/15));
    if(block!==S.block||S.lastTime<0)renderBlock(block);
    S.lastTime=seconds;
    panLines(seconds);
  }
  function renderFrame(){
    S.frame=0;
    if(!S.ready)return;
    syncClock(S.seekIntent!==null?S.seekIntent:video.currentTime);
    if(!video.paused&&!video.ended&&!S.frame){
      S.frame=requestAnimationFrame(renderFrame);
    }
  }
  function startFrames(){
    if(!S.frame)S.frame=requestAnimationFrame(renderFrame);
  }
  function stopFrames(){
    if(S.frame){cancelAnimationFrame(S.frame);S.frame=0}
    syncClock(S.seekIntent!==null?S.seekIntent:video.currentTime);
  }
  function seekSeconds(t){
    if(!S.ready)return;
    // Pause the old video clock while the real decoder seeks. Do not start
    // playback until the video has confirmed the requested position.
    const dest=Math.max(0,Math.min(179.95,t));
    video.pause();
    S.seekIntent=dest;
    video.dataset.sourceSeekRequested=dest.toFixed(3);
    clearTimeout(S.seekTimer);
    set("audioStatus","SEEKING ORIGINAL VIDEO · TICKERS HELD AT REQUESTED BLOCK");
    try{
      video.currentTime=dest;
    }catch(error){
      S.seekIntent=null;
      set("audioStatus","VIDEO SEEK NOT SUPPORTED BY THIS BROWSER");
      syncClock(video.currentTime);
      return;
    }
    syncClock(dest);
    S.seekTimer=setTimeout(()=>{
      if(S.seekIntent===dest){
        S.seekIntent=null;
        video.dataset.sourceSeekRequested="";
        set("audioStatus","VIDEO SEEK TIMED OUT · TICKERS RETURNED TO ACTUAL MEDIA TIME");
        syncClock(video.currentTime);
      }
    },9000);
  }
  function seekBlock(n){seekSeconds(Math.max(0,n)*15)}
  function bindControls(){
    $("speed").addEventListener("change",e=>{video.playbackRate=Number(e.target.value)||1});
    $("tickerMotion").addEventListener("change",e=>{S.pan=e.target.checked;panLines(video.currentTime)});
    video.addEventListener("loadedmetadata",()=>{
      const ratio=video.videoWidth/video.videoHeight;
      if(Number.isFinite(ratio)&&ratio>.4&&ratio<.75)
        document.documentElement.style.setProperty("--video-ratio",ratio.toFixed(6));
    });
    window.addEventListener("resize",()=>{if(S.ready)measureTimelines()});
    if(document.fonts&&document.fonts.ready)
      document.fonts.ready.then(()=>{if(S.ready)measureTimelines()});
    video.addEventListener("timeupdate",()=>syncClock(S.seekIntent!==null?S.seekIntent:video.currentTime));
    video.addEventListener("seeked",()=>{
      if(S.seekIntent!==null){
        if(Math.abs(video.currentTime-S.seekIntent)>1.25){
          // A stale decoder event must not claim that a different source
          // block was reached. The pending-seek timeout handles failure.
          return;
        }
        clearTimeout(S.seekTimer);
        S.seekTimer=0;
        S.seekIntent=null;
        video.dataset.sourceSeekRequested="";
        syncClock(video.currentTime);
        video.play().catch(()=>set("audioStatus","Source seek complete; press play to resume."));
        return;
      }
      syncClock(video.currentTime);
    });
    video.addEventListener("play",()=>{
      set("audioStatus","PLAYING · CONTINUOUS SOURCE-SYNCED TICKERS");
      startFrames();
    });
    video.addEventListener("pause",()=>{
      set("audioStatus","PAUSED · CONTINUOUS TICKERS HOLD POSITION");
      stopFrames();
    });
    video.addEventListener("ended",stopFrames);
    video.addEventListener("ratechange",()=>syncClock(video.currentTime));
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
    buildBlocks();renderEvidence(d);buildTimelines();
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
