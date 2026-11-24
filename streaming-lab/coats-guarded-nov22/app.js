"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const MODELS = [
    {id:"coats-large-v2", code:"COATS", label:"Original Coats"},
    {id:"coats-guarded", code:"GUARD", label:"Guarded Coats"},
    {id:"singlish-small", code:"SING", label:"Singlish2English reference"}
  ];
  const PHASES = [
    {id:"control", box:"rawTickers", code:"RAW", meaning:"No vocabulary prompt"},
    {id:"compact", box:"diffTickers", code:"TCG", meaning:"Compact TCG glossary"},
    {id:"focused", box:"domainTickers", code:"CTX", meaning:"Focused domain prompt"},
    {id:"raw", box:"stockTickers", code:"RAW MIX", meaning:"Untreated audio / no prompt", stock:true}
  ];
  const STOCK={id:"stock-whisper",code:"STOCK",label:"Stock Whisper Base English"};
  const phaseModels=p=>p.stock?[STOCK]:MODELS;
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
  // Same broad text diagnostic as the decoder study. All source text stays
  // available through RAW; no inference, deletion, or purported WER here.
  function detectDecodeLoop(source){
    const tokens=Array.from(source.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu),m=>({start:m.index,end:m.index+m[0].length,key:m[0].toLowerCase()}));
    const keys=tokens.map(w=>w.key);let best=null;const flagged=new Set();
    for(let start=0;start<keys.length;start++)for(let width=1;width<=8;width++){
      if(start+5*width>keys.length)continue;
      let repeats=1;while(start+(repeats+1)*width<=keys.length&&keys.slice(start+repeats*width,start+(repeats+1)*width).every((w,i)=>w===keys[start+i]))repeats++;
      if(repeats<5||repeats*width<10)continue;
      for(let i=start;i<start+repeats*width;i++)flagged.add(i);
      if(!best||repeats*width>best.repeats*best.width)best={start,width,repeats};
    }
    if(!best)return null;
    return {phrase:source.slice(tokens[best.start].start,tokens[best.start+best.width-1].end),count:best.repeats,coverage:flagged.size/keys.length,sourceText:source};
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
      for(const model of phaseModels(phase)){
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

  const lanes=PHASES.flatMap(p=>phaseModels(p).map(m=>({id:m.id+"--"+p.id,model:m.label,phase:p.meaning,stock:!!p.stock})));
  const expected="8594e0d859723075454531cbc11ada7d7bc93f51d83ff31ae595bff73ff77a4a";
  const reviewSha="5aec806d8a83127246b3342f0ca18d730a3a40b5b4eab6dbd73a29375abd3956";
  const dialogueSha="9b4bdd606e4717fb6141aafa0b0fe586483fa5961170046d72ac8503a3dde7b3";
  const manifestDigest="37779680b025e15785342dc06ea03f9efd8c672b75bb451d2c9a1175b3a5237b";
  const comparisonDigest="926e53149c424a7498205eecb1657e8acbf1394d42c033dcd77cef4bbecb1ffc";
  const guardDigest="b354a1b575b6ba09858bcd781e995247f4eb4649e55f34f68b5fa91381ee8f70";
  const privateReportDigest="ef1c300534b7c93cc64a1149d95482141865e840a8aa49bcb9058b3b91d43cde";
  const phases=["control","compact","focused"];
  const oldIds=["production-base.en","singlish-small","coats-large-v2"].flatMap(m=>phases.map(p=>m+"--"+p)).concat("stock-whisper--raw");
  const targets={control:["clip004","clip011","clip014","clip019","clip027","clip028"],compact:["clip003","clip013","clip027","clip035","clip036"],focused:["clip004","clip005","clip011","clip013","clip019","clip021","clip024","clip026","clip027","clip028","clip033","clip034","clip035","clip036","clip038"]};
  const ablationIds=["clip004","clip027","clip038"];
  const key=(phase,profile,id)=>phase+"/"+profile+"/"+id;
  let guardRows=new Map(),guardReport=null;
  async function verifiedJSON(path,digest){
    const r=await fetch(path,{cache:"no-store"});if(!r.ok)throw Error(path+" unavailable");
    const bytes=await r.arrayBuffer();
    const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
    if(sha!==digest)throw Error(path+" checksum mismatch");
    return JSON.parse(new TextDecoder().decode(bytes));
  }
function validate(d){
 if(d.schema!=="hl-nov22-dialogue-ten-public-v1"||d.sessionId!=="20261122T205428_176734Z_huatzaitcg"||d.sourceManifestSha256!==expected||d.reviewSha256!==reviewSha||d.humanAccuracyVerified!==false||d.nativeTelemetryRetained!==true||d.wordTimingVerified!==false||d.dialogueManifestSha256!==dialogueSha||d.rawControlLane!=="stock-whisper--raw"||d.formalBenchmarkEligible!==false||d.audioLosslessVerified!==true||d.sampleRate!==16000||d.clips.length!==43||d.parts.length!==3||d.lanes.length!==10)throw Error("Source contract mismatch");
 const keys=oldIds.slice().sort().join(",");
 if(d.lanes.map(l=>l.lane).sort().join(",")!==keys||d.lanes.some(l=>l.rawControl!==(l.lane==="stock-whisper--raw")||l.inputPolicy!==(l.rawControl?"EXACT_ORIGINAL_PCM":"DBS_TIGER_DIALOGUE_NO_TIME_DELETION")))throw Error("Lane inventory mismatch");
 let total=0;
 for(let p=0;p<3;p++){const item=d.parts[p];if(item.file!=="part-"+(p+1)+".flac"||!Number.isInteger(item.frames)||item.frames<=0||item.duration!==item.frames/16000||!/^([a-f0-9]{64})$/.test(item.sha256))throw Error("Part manifest mismatch");let end=0;for(const c of d.clips.filter(c=>c.sourcePart===item.part)){if(c.startFrame!==end||c.endFrame<=end||c.frames!==c.endFrame-c.startFrame||c.startSec!==c.startFrame/16000||c.endSec!==c.endFrame/16000)throw Error("Source timing mismatch");end=c.endFrame;}if(end!==item.frames)throw Error("Source coverage mismatch");total+=end;}
 if(total/16000!==d.audioSeconds)throw Error("Audio duration mismatch");
 d.clips.forEach((c,i)=>{if(c.id!=="clip"+String(i).padStart(3,"0")||Object.keys(c.texts).sort().join(",")!==keys||Object.keys(c.candidates).sort().join(",")!==keys||!oldIds.includes(c.representative))throw Error("Block inventory mismatch");
 for(const l of oldIds.map(id=>({id,stock:id==="stock-whisper--raw"}))){const t=c.texts[l.id];if(typeof t!=="string"||t.length>24000||!hex(c.dialogueSha256)||!c.nativeTelemetryCoverage[l.id]||(l.stock&&c.candidates[l.id].length))throw Error("Text/evidence invalid");for(const e of c.candidates[l.id]){if(Array.from(t).slice(e.start,e.end).join("")!==e.original)throw Error("Source span mismatch");}}});
}

  function checkGuard(g,d){
    if(g.schema!=="hl-coats-decoder-guard-report-v1"||g.sessionId!==d.sessionId||
      g.sourceManifestSha256!==d.dialogueManifestSha256||g.baselinePublicSha256!==comparisonDigest||
      g.privateReportSha256!==privateReportDigest||g.runId!==45476538340||g.baselineRunId!==45453804518||
      g.noAudioChanges!==true||g.nativeTelemetryRetained!==true||g.humanAccuracyVerified!==false||
      g.formalBenchmarkEligible!==false||g.combinedPairs!==26||g.additionalAblations!==9||g.rows.length!==35)
      throw Error("Guard report contract mismatch");
    const expectedKeys=new Set(phases.flatMap(p=>targets[p].map(id=>key(p,"combined",id))).concat(["fallback","penalty","ngram"].flatMap(p=>ablationIds.map(id=>key("focused",p,id)))));
    const byId=new Map(d.clips.map(c=>[c.id,c]));
    for(const row of g.rows){
      const k=key(row.phase,row.profile,row.id),c=byId.get(row.id),lane="coats-large-v2--"+row.phase;
      if(!expectedKeys.delete(k)||!c||row.before!==c.texts[lane]||row.dialogueSha256!==c.dialogueSha256||
        ["sourcePart","startFrame","endFrame","startSec","endSec"].some(k=>row[k]!==c[k])||
        typeof row.after!=="string"||row.after.length>24000||!hex(row.receipt.sha256)||"leaf" in row.receipt||
        g.baselineReceipts[row.phase].sha256!==d.lanes.find(l=>l.lane===lane).receiptSha256||
        row.beforeDiagnostics.words.flagged!==true||row.afterDiagnostics.words.flagged!==false||
        detectDecodeLoop(row.after)!==null||!row.after.trim())throw Error("Paired Coats evidence mismatch: "+k);
      guardRows.set(k,row);
    }
    if(expectedKeys.size||guardRows.size!==35)throw Error("Guarded comparison coverage mismatch");
    guardReport=g;
  }
  function adapt(d){
    // View-only mapping; do not claim a fresh full-lane decode. All unchanged
    // guarded cells are exact retained baseline text, not fabricated variants.
    for(const c of d.clips){
      c.reruns={};
      for(const phase of phases){
        const prior="coats-large-v2--"+phase,updated="coats-guarded--"+phase;
        const row=guardRows.get(key(phase,"combined",c.id));
        c.texts[updated]=row?row.after:c.texts[prior];
        c.reruns[phase]=Boolean(row);
      }
    }
    return d;
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
    const domainRanges=candidates===null?[]:Array.from(source.matchAll(TERMS),
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
        "⚠ REPETITIVE OUTPUT · ATTRIBUTION UNRESOLVED · “"+loop.phrase+"” ×"+loop.count+
        " · RAW AVAILABLE"));
      segment.title="Compressed display of a repeated model output, NOT a "+
        "transcription correction. Original output: "+loop.sourceText;
      segment.dataset.loopCollapsed="true";
    }else{
      annotate(segment,source,r.diffs[index],null);
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
        const guarded=r.model.id==="coats-guarded";
        const raw=guarded?clip.texts["coats-large-v2--"+r.phase.id]:original;
        const diff=differences(original,raw,null);
        const segment=el("span","ticker-chunk");
        segment.dataset.sourceBlock=String(i+1);
        segment.dataset.rerun=String(guarded&&clip.reruns[r.phase.id]);
        if(guarded&&clip.reruns[r.phase.id])segment.classList.add("guard-rerun");
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
      r.row.dataset.lane=id;
      r.row.title=r.model.label+" / "+r.phase.meaning+" · identical source-local audio blocks";
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
      if(Object.values(clip.reruns).some(Boolean)){b.classList.add("guard-target");b.dataset.guardTarget="true";}
      b.title="Seek source video "+time(clip.start)+"–"+time(clip.end)+" · part "+(clip.partIndex+1)+(b.dataset.guardTarget?" · Coats rerun available":"");
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
      const isGuard=r.model.id==="coats-guarded";
      const rerun=isGuard&&clip.reruns[r.phase.id];
      r.number.textContent=isGuard?(rerun?"NEW":"KEEP"):r.phase.stock?"RAW":r.model.id==="coats-large-v2"?"OLD":"REF";
      r.row.dataset.rerun=String(Boolean(rerun));
      r.number.title=isGuard?(rerun?"Actual new guarded decode of this exact block":"Not rerun: unchanged original Coats text"):"Original recorded model result";
      r.row.classList.toggle("has-decode-loop",Boolean(loop));
      r.rawToggle.hidden=!loop;
      r.rawToggle.textContent=r.rawLoops.has(S.block)?"FOLD":"RAW";
      r.rawToggle.setAttribute("aria-pressed",String(r.rawLoops.has(S.block)));
      if(loop){
        r.delta.textContent="⚠×"+loop.count;
        r.delta.classList.remove("is-empty");
        r.delta.classList.add("is-decode-loop");
        r.delta.title="Repetition, source unresolved: “"+loop.phrase+
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
          :diff.added+" newly present words; "+diff.removed+" prior words absent in this same source block";
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
    const count=Object.values(clip.reruns).filter(Boolean).length;
    set("metricContext","BLOCK "+(S.block+1)+" · "+count+" Coats rerun"+(count===1?"":"s")+" · "+(count?"NEW = actual new output; KEEP = retained":"No new decode in this block"));
    set("candidateCount",count+" actual combined reruns in this block");
    showEvidence();
  }
  function showEvidence(){
    if(!S.ready)return;
    const clip=S.data.clips[S.block],list=$("evidence");list.replaceChildren();
    const phase=$("reviewLane").value;
    const r=guardRows.get(key(phase,"combined",clip.id));
    if(!r){list.append(el("p","","This phase was not rerun in this block. Guarded row retains the original output exactly."));return}
    const view=(label,text,d)=>{const e=el("div","evidence-line");
      e.append(el("strong","",label),el("p","",text||"(Empty model output)"),el("small","",
        d.words.words+" words · "+d.words.flaggedWords+" flagged repeated words · "+d.inferenceSeconds.toFixed(2)+" s · "+d.nativeWords+" native words · compression ratios "+d.nativeCompressionRatios.map(x=>x.toFixed(2)).join(", ")));
      list.append(e);
    };
    view("Original Coats",r.before,r.beforeDiagnostics);
    view("Guarded Coats",r.after,r.afterDiagnostics);
    for(const profile of ["fallback","penalty","ngram"]){
      const other=guardRows.get(key(phase,profile,clip.id));
      if(other)view(profile+" only",other.after,other.afterDiagnostics);
    }
    list.append(el("small","","Scores are native diagnostics, not calibrated confidence or independent accuracy. Receipt "+r.receipt.sha256));
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
    else set("audioStatus","SOURCE-VERIFIED ORIGINAL VIDEO · 43 BLOCKS · 10 DECODINGS");
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
    if(S.part!==clip.partIndex||video.getAttribute("src")!==("../nine-tickers-nov22/"+p.filename)){S.part=clip.partIndex;video.src="../nine-tickers-nov22/"+p.filename;video.load()}
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
      if(video.getAttribute("src")!==("../nine-tickers-nov22/"+p.filename))return;
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
    set("metricComments",43);set("metricAccounts",26);set("metricEvents",35);set("metricBuyer",0);set("endClock",time(d.audioSeconds));
    document.querySelectorAll("[data-part]").forEach((b,i)=>{const p=m.parts[i];b.querySelector("strong").textContent="Original "+p.part+" · "+p.sourceSeconds.toFixed(3)+" s";b.querySelector("small").textContent=time(S.offsets[i]);b.title="Seek source part "+(i+1)});
    for(const phase of phases){const o=el("option","",phase);o.value=phase;$("reviewLane").append(o)}
    const entries=Object.entries(guardReport.summary);
    for(const [label,a] of entries){
      const tr=el("tr");
      for(const v of [label,a.clips,a.beforeFlagged,a.afterFlagged,a.beforeRepeatWords,a.afterRepeatWords,a.beforeInferenceSeconds.toFixed(1),a.afterInferenceSeconds.toFixed(1)])tr.append(el("td","",String(v)));
      $("metrics").append(tr);
    }
    for(const [k,v] of [["Session",d.sessionId],["Dialogue preparation manifest",d.dialogueManifestSha256],["Original public comparison SHA-256",comparisonDigest],["Private paired report SHA-256",privateReportDigest],["Public paired report SHA-256",guardDigest],["Original video manifest SHA-256",manifestDigest]])$("sourceReceipts").append(el("dt","",k),el("dd","",v));
    $("nextAffected").addEventListener("click",()=>{const n=S.data.clips.length;for(let i=1;i<=n;i++){const j=(S.block+i)%n;if(Object.values(S.data.clips[j].reruns).some(Boolean)){seekBlock(j);break}}});
  }
  function ready(d,m,g){
    validate(d);checkVideo(m,d);checkGuard(g,d);adapt(d);
    let t=0;S.offsets=d.parts.map(p=>{const start=t;t+=p.duration;return start});
    d.clips.forEach(c=>{c.partIndex=d.parts.findIndex(p=>p.part===c.sourcePart);c.start=S.offsets[c.partIndex]+c.startSec;c.end=S.offsets[c.partIndex]+c.endSec});
    S.data=d;S.videoManifest=m;S.ready=true;
    buildBlocks();renderEvidence(d,m);buildTimelines();
    set("provenance","All three original A/V bitstreams preserved; "+m.parts.reduce((n,p)=>n+p.exactOverlapFrames,0)+" exact original PCM samples matched. Exact dialogue inputs unchanged; 26 guarded reruns and nine additional ablations. Original outputs and native telemetry retained.");
    renderBlock(0);seekBlock(0,false);
  }
  skeleton();bindControls();
  Promise.all([verifiedJSON("../ten-tickers-nov22/comparison.json",comparisonDigest),verifiedJSON("../nine-tickers-nov22/video-manifest.json",manifestDigest),verifiedJSON("paired-results.json",guardDigest)])
    .then(([d,m,g])=>ready(d,m,g)).catch(e=>{S.ready=false;set("audioStatus","SOURCE VALIDATION FAILED · "+e.message);$("videoError").hidden=false});
})();
