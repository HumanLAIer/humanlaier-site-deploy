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
  const S={ready:false,data:null,videoManifest:null,block:0,lastTime:-1,pan:true,rows:new Map(),buttons:[],frame:0,seekIntent:null,seekTimer:0,part:-1,offsets:[]};
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
        button.title=model.label+" · "+phase.meaning+" · click to replay this source block";
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

  const lanes=PHASES.flatMap(p=>MODELS.map(m=>({id:m.id+"--"+p.id,model:m.label,phase:p.meaning})));
  const expected="8594e0d859723075454531cbc11ada7d7bc93f51d83ff31ae595bff73ff77a4a";
  const reviewSha="e25445ab9fdb10c9e080013d9e0d131243661104a21e03f649975c697e0eeebb";
  const manifestDigest="37779680b025e15785342dc06ea03f9efd8c672b75bb451d2c9a1175b3a5237b";
  const comparisonDigest="8669a3403f609db40ee427842d4446852c292c0e21b7284850d43edcd8e486e6";
  const fractions={"production-base.en--control":17.0,"production-base.en--compact":26.0,"production-base.en--focused":41.5,"singlish-small--control":1.33,"singlish-small--compact":0.54,"singlish-small--focused":0.66,"coats-large-v2--control":35.9,"coats-large-v2--compact":47.9,"coats-large-v2--focused":29.1};
  async function verifiedJSON(path,digest){
    const r=await fetch(path,{cache:"no-store"});if(!r.ok)throw Error(path+" unavailable");
    const bytes=await r.arrayBuffer();
    const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
    if(sha!==digest)throw Error(path+" checksum mismatch");
    return JSON.parse(new TextDecoder().decode(bytes));
  }
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

  function checkVideo(m,d){
    if(m.schema!=="hl-nov22-original-video-v1"||m.sessionId!==d.sessionId||
      m.originalManifestSha256!==d.originalManifestSha256||m.sourceAudioSeconds!==d.audioSeconds||
      m.sampleRate!==d.sampleRate||m.parts.length!==d.parts.length||m.wordTimingVerified!==false||
      m.broadcastCompletenessIndependentlyProven!==false||m.r2Writes!==0||m.modelCalls!==0)
      throw Error("Original video manifest mismatch");
    m.parts.forEach((p,i)=>{
      const a=d.parts[i];
      if(p.part!==a.part||p.filename!=="part-"+(i+1)+".mp4"||
        p.sourcePartSha256!==a.originalSha256||p.sourcePcmSha256!==a.pcmSha256||
        p.sourceFrames!==a.frames||p.sourceSeconds!==a.duration||p.pcmExact!==true||
        p.exactOverlapFrames!==a.frames||p.originalVideoBitstream!==true||p.originalAudioBitstream!==true||
        p.videoWidth!==640||p.videoHeight!==1280||!hex(p.sha256)||
        !Number.isFinite(p.pcmOriginMediaSeconds)||p.pcmOriginMediaSeconds<0||
        Math.abs(p.mediaSeconds-p.sourceSeconds)>1||
        p.pcmOriginMediaSeconds+p.sourceSeconds>p.mediaSeconds+.3)
        throw Error("Video part not sample-matched to ASR inputs");
    });
  }
  function annotate(line,source,diff,candidates){
    line.replaceChildren();
    if(!source){line.append(el("span","muted","[No speech returned]"));return}
    // Match terms against the unaltered full string first, so multi-word
    // names and business phrases ("Elite Trainer Box", "how much") stay
    // highlighted without rewriting or splitting their source words.
    TERMS.lastIndex=0;
    const domainRanges=Array.from(source.matchAll(TERMS),
      m=>[m.index,m.index+m[0].length]);
    const offsets=[0];for(const ch of source)offsets.push(offsets[offsets.length-1]+ch.length);
    for(const c of candidates||[])if(["singlish","participant","pokemon"].includes(c.domain))
      domainRanges.push([offsets[c.start],offsets[c.end]]);
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
      annotate(segment,source,r.diffs[index],S.data.clips[index].candidates[r.model.id+"--"+r.phase.id]);
      segment.title=loop
        ?"Original unmodified ASR output ("+loop.count+" repetitions of “"+
         loop.phrase+"”); click FOLD to condense."
        :"Source block "+(index+1)+" original model text";
      segment.dataset.loopCollapsed="false";
    }
  }
  function buildTimelines(){
    const laneById=new Map(S.data.lanes.map(l=>[l.lane,l]));
    for(const [id,r] of S.rows){
      r.line.replaceChildren();
      r.segments=[];
      r.diffs=[];
      r.loops.clear();
      for(let i=0;i<S.data.clips.length;i++){
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
        segment.title="Source block "+(i+1)+" ("+time(clip.start)+"–"+time(clip.end)+
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
        " / peak "+Math.round(result.peakRssMiB)+" MiB / "+S.data.clips.length+" source-aligned blocks";
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
    panLines(clockNow());
  }

  function buildBlocks(){
    const box=$("blockNav");box.replaceChildren();S.buttons=[];
    S.data.clips.forEach((clip,i)=>{
      const b=el("button","block-btn",String(i+1).padStart(2,"0"));b.type="button";
      if(clip.startFrame===0&&i>0)b.classList.add("boundary");
      b.title="Seek source video "+time(clip.start)+"–"+time(clip.end)+" · part "+(clip.partIndex+1);
      b.setAttribute("aria-label","Seek source video block "+(i+1)+" starting "+time(clip.start));
      b.addEventListener("click",()=>seekBlock(i));box.append(b);S.buttons.push(b);
    });
  }
  function renderBlock(index){
    if(!S.ready)return;
    S.block=Math.max(0,Math.min(S.data.clips.length-1,index|0));
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
          "-repeat ASR transcript in block "+(S.block+1));
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

    const box=$("blockNav"),active=S.buttons[S.block];
    if(active){
      const a=active.getBoundingClientRect(),r=box.getBoundingClientRect();
      if(a.left<r.left)box.scrollLeft-=r.left-a.left;
      else if(a.right>r.right)box.scrollLeft+=a.right-r.right;
    }
    const total=Object.values(clip.candidates).reduce((n,c)=>n+c.length,0);
    set("metricContext","BLOCK "+(S.block+1)+" · "+total+" candidate spans · "+clip.representative+" raw medoid · REVIEW ONLY");
    set("candidateCount",total+" hypotheses in this block");
    set("repText",clip.texts[clip.representative]||"(Empty model output)");
    set("repLabel",clip.representative+" · distance "+clip.meanTokenDistance.toFixed(2)+" · not accuracy");
    showEvidence();
  }
  function showEvidence(){
    if(!S.ready)return;
    const clip=S.data.clips[S.block],list=$("evidence");list.replaceChildren();
    const hits=clip.candidates[$("reviewLane").value]||[];
    if(!hits.length){list.append(el("p","","No retained candidates in this lane. This does not prove absence."));return}
    for(const e of hits){
      const row=el("div","evidence-line");
      row.append(el("strong","",e.label+"? "),el("small","",e.domain+" · "+e.type+" · "+e.match+(e.ambiguous?" · ambiguous":"")),
        el("div","","Raw span: “"+e.original+"” · chars "+e.start+"–"+e.end));
      list.append(row);
    }
  }
  function blockAt(t){const i=S.data.clips.findIndex(c=>t<c.end);return i<0?S.data.clips.length-1:i}
  function clockNow(){
    if(!S.ready)return 0;
    if(S.seekIntent)return S.seekIntent.global;
    if(S.part<0)return 0;
    const p=S.videoManifest.parts[S.part];
    return S.offsets[S.part]+Math.max(0,Math.min(p.sourceSeconds,(video.currentTime||0)-p.pcmOriginMediaSeconds));
  }
  function panLines(seconds){
    if(!S.ready)return;
    const reduced=window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const t=Math.max(0,Math.min(S.data.audioSeconds,Number(seconds)||0)),i=blockAt(t),clip=S.data.clips[i];
    const progress=Math.max(0,Math.min(1,(t-clip.start)/(clip.end-clip.start)));
    for(const r of S.rows.values()){
      if(r.anchors.length!==S.data.clips.length+1)continue;
      const start=r.anchors[i],end=r.anchors[i+1],px=S.pan&&!reduced?start+(end-start)*progress:start;
      r.line.style.transform="translate3d("+(r.playheadPx-px).toFixed(3)+"px,0,0)";
    }
  }
  function syncClock(t){
    if(!S.ready)return;
    const seconds=Math.max(0,Math.min(S.data.audioSeconds,Number(t)||0));
    const label=time(seconds);if($("currentClock").textContent!==label)set("currentClock",label);
    const i=blockAt(seconds);if(i!==S.block||S.lastTime<0)renderBlock(i);
    S.lastTime=seconds;panLines(seconds);
  }
  function renderFrame(){S.frame=0;if(!S.ready)return;syncClock(clockNow());if(!video.paused&&!video.ended&&!S.frame)S.frame=requestAnimationFrame(renderFrame)}
  function startFrames(){if(!S.frame)S.frame=requestAnimationFrame(renderFrame)}
  function stopFrames(){if(S.frame){cancelAnimationFrame(S.frame);S.frame=0}syncClock(clockNow())}
  function finishSeek(){
    const intent=S.seekIntent;
    if(!intent||intent.part!==S.part||video.readyState<1||video.seeking||Math.abs(video.currentTime-intent.media)>.18)return;
    clearTimeout(S.seekTimer);S.seekIntent=null;video.dataset.sourceSeekRequested="";
    syncClock(clockNow());
    if(intent.autoplay)video.play().catch(()=>set("audioStatus","SOURCE SEEK COMPLETE · PRESS PLAY TO RESUME"));
    else set("audioStatus","SOURCE-VERIFIED ORIGINAL VIDEO · 43 BLOCKS · 9 DECODINGS");
  }
  function applySeek(){
    const intent=S.seekIntent;if(!intent||intent.part!==S.part||video.readyState<1)return;
    try{if(Math.abs(video.currentTime-intent.media)>.001)video.currentTime=intent.media;if(!video.seeking)finishSeek()}
    catch(e){failSeek("VIDEO SEEK NOT SUPPORTED BY THIS BROWSER")}
  }
  function failSeek(message){clearTimeout(S.seekTimer);S.seekIntent=null;video.dataset.sourceSeekRequested="";set("audioStatus",message);syncClock(clockNow())}
  function seekSeconds(seconds,autoplay=true){
    if(!S.ready)return;
    const global=Math.max(0,Math.min(S.data.audioSeconds-.001,Number(seconds)||0));
    const clip=S.data.clips[blockAt(global)],p=S.videoManifest.parts[clip.partIndex];
    const media=global-S.offsets[clip.partIndex]+p.pcmOriginMediaSeconds;
    clearTimeout(S.seekTimer);S.seekIntent={global,media,part:clip.partIndex,autoplay};
    video.dataset.sourceSeekRequested=global.toFixed(3);video.pause();
    set("audioStatus","SEEKING ORIGINAL VIDEO · TICKERS HELD AT REQUESTED BLOCK");
    if(S.part!==clip.partIndex||video.getAttribute("src")!==p.filename){S.part=clip.partIndex;video.src=p.filename;video.load()}
    else applySeek();
    syncClock(clockNow());
    if(S.seekIntent)S.seekTimer=setTimeout(()=>{if(S.seekIntent)failSeek("VIDEO SEEK TIMED OUT · TICKERS RETURNED TO ACTUAL MEDIA TIME")},20000);
  }
  function seekBlock(i,autoplay=true){if(S.ready&&S.data.clips[i])seekSeconds(S.data.clips[i].start,autoplay)}
  function bindControls(){
    $("speed").addEventListener("change",e=>{video.playbackRate=Number(e.target.value)||1});
    $("tickerMotion").addEventListener("change",e=>{S.pan=e.target.checked;panLines(clockNow())});
    $("reviewLane").addEventListener("change",showEvidence);
    video.addEventListener("loadedmetadata",()=>{
      if(!S.ready||S.part<0)return;const p=S.videoManifest.parts[S.part];
      if(video.getAttribute("src")!==p.filename)return;
      if(Math.abs(video.duration-p.mediaSeconds)>.25||video.videoWidth!==p.videoWidth||video.videoHeight!==p.videoHeight){
        video.pause();failSeek("SOURCE VIDEO CONTRACT MISMATCH · PLAYBACK STOPPED");$("videoError").hidden=false;return;
      }
      document.documentElement.style.setProperty("--video-ratio",(video.videoWidth/video.videoHeight).toFixed(6));
      video.playbackRate=Number($("speed").value)||1;$("videoError").hidden=true;measureTimelines();applySeek();
    });
    window.addEventListener("resize",()=>{if(S.ready)measureTimelines()});
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(S.ready)measureTimelines()});
    video.addEventListener("timeupdate",()=>syncClock(clockNow()));
    video.addEventListener("seeked",()=>{if(S.seekIntent)finishSeek();else syncClock(clockNow())});
    video.addEventListener("play",()=>{if(!S.seekIntent)set("audioStatus","PLAYING · CONTINUOUS SOURCE-SYNCED TICKERS · PART "+(S.part+1)+"/3");startFrames()});
    video.addEventListener("pause",()=>{if(!S.seekIntent)set("audioStatus","PAUSED · CONTINUOUS TICKERS HOLD POSITION");stopFrames()});
    video.addEventListener("ratechange",()=>syncClock(clockNow()));
    video.addEventListener("ended",()=>{stopFrames();if(S.ready&&S.part<S.videoManifest.parts.length-1)seekSeconds(S.offsets[S.part+1],true);else set("audioStatus","SOURCE VIDEO COMPLETE · ALL 43 BLOCKS")});
    video.addEventListener("error",()=>{if(S.ready){failSeek("ORIGINAL VIDEO UNAVAILABLE · TRANSCRIPT DATA PRESERVED");$("videoError").hidden=false}});
    document.querySelectorAll("[data-part]").forEach(b=>b.addEventListener("click",()=>{if(S.ready)seekSeconds(S.offsets[Number(b.dataset.part)])}));
  }
  function renderEvidence(d,m){
    set("metricComments",d.clips.length);set("metricAccounts",d.observedAccounts);set("metricEvents",d.aliasCount);set("metricBuyer",d.clips.length*d.lanes.length);set("endClock",time(d.audioSeconds));
    document.querySelectorAll("[data-part]").forEach((b,i)=>{const p=m.parts[i];b.querySelector("strong").textContent="Original "+p.part+" · "+p.sourceSeconds.toFixed(3)+" s";b.querySelector("small").textContent=time(S.offsets[i]);b.title="Seek source part "+(i+1)});
    for(const lane of lanes){
      const o=el("option","",lane.model+" · "+lane.phase);o.value=lane.id;$("reviewLane").append(o);
      const a=d.summary[lane.id],tr=el("tr");
      for(const v of [lane.model+" / "+lane.phase,a.singlishCandidates,a.clipsWithSinglish,a.participantCandidates,a.pokemonCandidates,a.inferenceSeconds.toFixed(1),fractions[lane.id].toFixed(2)])tr.append(el("td","",String(v)));
      $("metrics").append(tr);
    }
    for(const [k,v] of [["Session",d.sessionId],["Source manifest",d.sourceManifestSha256],["Original sealed media manifest",d.originalManifestSha256],["Private review receipt",d.reviewSha256],["Public comparison SHA-256",comparisonDigest],["Public video manifest SHA-256",manifestDigest],...m.parts.flatMap((p,i)=>[["Part "+(i+1)+" original SHA-256",p.sourcePartSha256],["Part "+(i+1)+" PCM SHA-256",p.sourcePcmSha256],["Part "+(i+1)+" MP4 SHA-256",p.sha256]])])$("sourceReceipts").append(el("dt","",k),el("dd","",v));
  }
  function ready(d,m){
    validate(d);checkVideo(m,d);
    let t=0;S.offsets=d.parts.map(p=>{const start=t;t+=p.duration;return start});
    d.clips.forEach(c=>{c.partIndex=d.parts.findIndex(p=>p.part===c.sourcePart);c.start=S.offsets[c.partIndex]+c.startSec;c.end=S.offsets[c.partIndex]+c.endSec});
    S.data=d;S.videoManifest=m;S.ready=true;
    buildBlocks();renderEvidence(d,m);buildTimelines();
    set("provenance","All three original A/V bitstreams preserved; "+m.parts.reduce((n,p)=>n+p.exactOverlapFrames,0)+" exact PCM samples matched. No new ASR inference.");
    renderBlock(0);seekBlock(0,false);
  }
  skeleton();bindControls();
  Promise.all([verifiedJSON("comparison.json",comparisonDigest),verifiedJSON("video-manifest.json",manifestDigest)])
    .then(([d,m])=>ready(d,m)).catch(e=>{S.ready=false;set("audioStatus","SOURCE VALIDATION FAILED · "+e.message);$("videoError").hidden=false});
})();
