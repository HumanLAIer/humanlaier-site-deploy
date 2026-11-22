/* Human LAIer Signal Lab / 002 — three-model, source-backed 180s replay.
 * Strict source contract: 12 identical contiguous audio blocks per model.
 * Follow is block-level (15s), not fabricated word timestamps.
 * Engagement is observed on a provisional FFmpeg process clock ONLY.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const audio = $("sourceAudio");
  const play = $("playButton");
  const seek = $("seekSlider");
  const canvas = $("waveform");
  const follow = $("autoFollow");
  const differ = $("showDiff");
  const models = [
    {key:"production", report:"production-base.en", label:"Production faster-whisper base.en"},
    {key:"singlish", report:"singlish-small", label:"Singlish2English-small"},
    {key:"coats", report:"coats-large-v2", label:"Coats Whisper large-v2 NSC"}
  ];
  const tracks = {production:[],singlish:[],coats:[]};
  const phrases = {production:[],singlish:[],coats:[]};
  const slots = [];
  let data = null;
  let index = -1;
  let selectedModel = "production";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(t) {
    const sec = Math.max(0,Math.floor(Number(t)||0));
    return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");
  }
  function create(tag,className,content) {
    const el = document.createElement(tag);
    if (className) el.className=className;
    if (content !== undefined && content !== null) el.textContent=String(content);
    return el;
  }
  function wordSet(value) {
    return new Set((String(value).toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)||[]));
  }
  function renderText(target, text, otherTexts) {
    target.replaceChildren();
    const actual=String(text);
    if (!actual.trim()) {
      target.classList.add("empty");
      target.textContent="No words returned in this block.";
      return;
    }
    target.classList.remove("empty");
    if (!differ.checked) {
      target.textContent=actual;
      return;
    }
    const alternatives = otherTexts.map(wordSet);
    const tokens=actual.match(/\s+|[^\s]+/gu)||[actual];
    for (const token of tokens) {
      const norm=token.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,"");
      if (norm && alternatives.every(set=>!set.has(norm))) {
        target.appendChild(create("mark","word-diff",token));
      } else {
        target.appendChild(document.createTextNode(token));
      }
    }
  }
  function repaintText() {
    if (!data) return;
    for (const clip of data.clips) for (const m of models) {
      renderText(phrases[m.key][clip.index], clip[m.key],
        models.filter(other=>other.key!==m.key).map(other=>clip[other.key]));
    }
  }
  function makeTranscript(m,clip) {
    const pane=$(m.key+"Scroll");
    const row=create("article","transcript-chunk");
    row.tabIndex=0;
    row.dataset.index=String(clip.index);
    row.setAttribute("role","button");
    row.setAttribute("aria-label","Replay from "+fmt(clip.start)+": "+m.label);
    const header=create("div","chunk-meta");
    header.append(create("span","chunk-num",String(clip.index+1).padStart(2,"0")+" / "+fmt(clip.start)+"—"+fmt(clip.end)),
      create("span","","SOURCE BLOCK"));
    const words=create("p","chunk-text");
    const src=create("div","chunk-source","ORIGINAL PART 27 · +"+fmt(clip.sourcePartOffset));
    row.append(header,words,src,create("div","chunk-progress"));
    const clicked=()=>jump(clip.start,true);
    row.addEventListener("click",clicked);
    row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();clicked();}});
    pane.appendChild(row);
    tracks[m.key].push(row);
    phrases[m.key].push(words);
  }
  function makeActivity(clip,scale) {
    const b=create("button","activity-slot");
    b.type="button";
    b.setAttribute("aria-label","Seek to "+fmt(clip.start)+"; approximate observed "+clip.engagement.comments+" comments, "+
      clip.engagement.likes+" like events and "+clip.engagement.gifts+" gifts");
    const bars=create("span","activity-bars");
    for (const [kind,name] of [["comments","comments"],["likes","likes"],["gifts","gifts"]]) {
      const bar=create("i",name);
      const n=Number(clip.engagement[kind])||0;
      bar.style.height=(n?Math.max(5,Math.round(70*n/scale)):2)+"%";
      bar.title=n+" "+kind+" observed";
      bars.appendChild(bar);
    }
    b.append(create("span","activity-number",String(clip.engagement.comments)),
      bars,create("span","",fmt(clip.start)));
    b.addEventListener("click",()=>jump(clip.start,true));
    $("activityTrack").appendChild(b);
    slots.push(b);
  }
  function redraw() {
    if (!data || !canvas.getContext) return;
    const rect=canvas.getBoundingClientRect();
    if (!rect.width||!rect.height) return;
    const scale=Math.min(window.devicePixelRatio||1,3);
    const w=rect.width,h=rect.height;
    const rw=Math.round(w*scale),rh=Math.round(h*scale);
    if (canvas.width!==rw||canvas.height!==rh) {canvas.width=rw;canvas.height=rh;}
    const ctx=canvas.getContext("2d");
    ctx.setTransform(scale,0,0,scale,0,0);
    ctx.clearRect(0,0,w,h);
    const wave=data.waveform;
    const max=Math.max(.01,...wave);
    const pitch=w/wave.length;
    const time=Math.max(0,Math.min(180,audio.currentTime||0));
    for (let i=0;i<wave.length;i++) {
      const amp=Math.min(1,Math.max(.11,Math.sqrt(Math.max(0,wave[i])/max)));
      const bh=Math.max(4,amp*(h-11));
      ctx.fillStyle=i<time?"#66e0d1":"#335668";
      ctx.fillRect(i*pitch,(h-bh)/2,Math.max(1,pitch-1),bh);
    }
    ctx.strokeStyle="#ffffff42";ctx.lineWidth=1;ctx.setLineDash([3,5]);
    for(let i=1;i<12;i++){
      const x=w*i/12;
      ctx.beginPath();ctx.moveTo(x,3);ctx.lineTo(x,h-3);ctx.stroke();
    }
    ctx.setLineDash([]);ctx.strokeStyle="#fffef9";ctx.lineWidth=2;
    const x=w*time/180;
    ctx.beginPath();ctx.moveTo(x,2);ctx.lineTo(x,h-2);ctx.stroke();
  }
  function scrollModel(key,i) {
    const pane=$(key+"Scroll"),row=tracks[key][i];
    if (!pane||!row) return;
    pane.scrollTo({top:Math.max(0,row.offsetTop-18),behavior:reduceMotion?"instant":"smooth"});
  }
  function showPlayback() {
    if (!data) return;
    const now=Math.max(0,Math.min(180,audio.currentTime||0));
    const n=Math.max(0,Math.min(11,Math.floor(Math.min(now,179.999)/15)));
    $("playerClock").textContent=fmt(now)+" / 03:00";
    seek.value=String(now);
    if (index!==n) {
      index=n;
      for (const m of models) {
        tracks[m.key].forEach((row,k)=>{
          row.classList.toggle("active",k===n);
          row.classList.toggle("completed",k<n);
          row.setAttribute("aria-current",k===n?"true":"false");
        });
        if (follow.checked && (window.innerWidth>1000 || m.key===selectedModel)) scrollModel(m.key,n);
      }
      slots.forEach((slot,k)=>{
        slot.classList.toggle("active",k===n);
        slot.setAttribute("aria-current",k===n?"true":"false");
      });
      const c=data.clips[n];
      $("playerStatus").textContent="Block "+(n+1)+"/12 · original source +"+fmt(c.sourcePartOffset)+
        " · "+c.engagement.comments+" observed comments (clock provisional)";
    }
    const progress=Math.max(0,Math.min(1,(now-n*15)/15));
    for (const m of models) tracks[m.key][n].style.setProperty("--clip-progress",String(progress));
    redraw();
  }
  function jump(seconds,doPlay) {
    if (!data) return;
    const value=Math.min(179.96,Math.max(0,Number(seconds)||0));
    try {audio.currentTime=value;} catch {}
    showPlayback();
    if (doPlay) start();
  }
  function buttonState() {
    const running=!audio.paused&&!audio.ended;
    $("playGlyph").textContent=running?"❚❚":"▶";
    play.setAttribute("aria-label",running?"Pause source recording":"Play source recording");
  }
  async function start() {
    try {await audio.play();}
    catch { $("playerStatus").textContent="Browser playback did not start. Try the play control again."; }
    buttonState();
  }
  function setModel(key) {
    selectedModel=key;
    document.querySelectorAll(".model-tabs button").forEach(btn=>{
      btn.setAttribute("aria-pressed",btn.dataset.model===key?"true":"false");
    });
    document.querySelectorAll(".transcript-panel").forEach(panel=>{
      panel.setAttribute("data-selected",panel.dataset.model===key?"true":"false");
    });
    if (index>=0&&follow.checked) scrollModel(key,index);
  }
  function validate(x) {
    if (!x || x.schema!=="hl-public-singlish-production-180-v1"||
      x.status!=="UNREVIEWED_THREE_MODEL_TRANSCRIPTS"||
      x.sourceSession!=="20261117T142835_038897Z_huatzaitcg"||
      x.sourcePart!=="part_000027.ts"||x.sourcePartOffsetSeconds!==110||
      x.durationSeconds!==180||x.clipDurationSeconds!==15||x.clipCount!==12||
      x.samplesAreContiguous!==true||x.humanGoldAvailable!==false||
      x.wordTimestampsVerified!==false||x.eventMediaSyncIndependentlyVerified!==false||
      x.audioFile!=="high-engagement-180.mp3"||
      !Array.isArray(x.waveform)||x.waveform.length!==180||
      !Array.isArray(x.clips)||x.clips.length!==12||
      !x.engagement||!x.modelMetrics) throw Error("Unexpected or incomplete comparison source");
    for(let i=0;i<12;i++){
      const c=x.clips[i];
      if(c.id!=="clip"+String(i).padStart(2,"0")||c.index!==i||
        c.start!==i*15||c.end!==(i+1)*15||
        c.sourcePartOffset!==110+i*15||
        typeof c.production!=="string"||typeof c.singlish!=="string"||typeof c.coats!=="string"||
        !c.engagement||typeof c.engagement.comments!=="number")
        throw Error("Comparison clip contract mismatch");
    }
    for(const m of models) {
      const v=x.modelMetrics[m.report];
      if(!v||typeof v.revision!=="string"||v.revision.length!==40||
        !Number.isFinite(v.inferSeconds)||v.inferSeconds<=0||
        !Number.isFinite(v.peakRssMib)||v.peakRssMib<=0||v.wer!==null)
        throw Error("Model comparison contract mismatch");
    }
  }
  function load(x) {
    validate(x);
    data=x;
    const engagement=x.engagement;
    $("metricComments").textContent=engagement.comments.toLocaleString();
    $("metricAccounts").textContent=engagement.uniqueActors.toLocaleString();
    const total=Number(engagement.comments||0)+Number(engagement.likes||0)+Number(engagement.gifts||0)+
       Number(engagement.shares||0)+Number(engagement.follows||0)+Number(engagement.giftProgress||0);
    $("metricActions").textContent=total.toLocaleString();
    $("metricGifts").textContent=engagement.gifts+" / "+engagement.shares;
    const maxTime=Math.max(...models.map(m=>x.modelMetrics[m.report].inferSeconds));
    for (const m of models) {
      const report=x.modelMetrics[m.report];
      $(m.key+"Time").textContent=report.inferSeconds.toFixed(2)+"s";
      $(m.key+"Revision").textContent="revision "+report.revision.slice(0,10);
      $(m.key+"Bar").style.width=(100*report.inferSeconds/maxTime)+"%";
    }
    $("provenance").textContent="SOURCE "+x.sourceSession+
      " / "+x.sourcePart+" +01:50 / SHA-256 "+x.sourcePartSha256.slice(0,24)+"… "+
      " / PRODUCTION "+x.modelMetrics["production-base.en"].revision.slice(0,12)+
      " / SINGLISH "+x.modelMetrics["singlish-small"].revision.slice(0,12)+
      " / COATS "+x.modelMetrics["coats-large-v2"].revision.slice(0,12);
    const maxActivity=Math.max(1,...x.clips.map(c=>Math.max(c.engagement.comments,c.engagement.likes,c.engagement.gifts)));
    for(const c of x.clips) {
      makeActivity(c,maxActivity);
      for(const m of models) makeTranscript(m,c);
    }
    repaintText();
    audio.src=x.audioFile;
    audio.load();
    seek.max="180";seek.disabled=false;play.disabled=false;
    $("playerStatus").textContent="Ready · 03:00 original audio · 3 model transcripts";
    setModel("production");
    showPlayback();
  }
  function setup() {
    play.addEventListener("click",()=>audio.paused?start():audio.pause());
    seek.addEventListener("input",()=>jump(Number(seek.value),false));
    $("speedSelect").addEventListener("change",e=>audio.playbackRate=Number(e.target.value)||1);
    follow.addEventListener("change",()=>{if(follow.checked&&index>=0){
      if(window.innerWidth>1000){for(const m of models)scrollModel(m.key,index);}
      else scrollModel(selectedModel,index);
    }});
    differ.addEventListener("change",repaintText);
    document.querySelectorAll(".model-tabs button").forEach(b=>b.addEventListener("click",()=>setModel(b.dataset.model)));
    for (const event of ["timeupdate","seeked","durationchange"]) audio.addEventListener(event,showPlayback);
    for (const event of ["play","pause","ended"]) audio.addEventListener(event,buttonState);
    audio.addEventListener("error",()=>{$("playerStatus").textContent="Audio failed to load; original transcript blocks remain readable.";});
    window.addEventListener("resize",redraw);
    setModel("production");
  }
  async function init(){
    setup();
    try {
      const response=await fetch("comparison.json",{cache:"no-store"});
      if(!response.ok)throw Error("Comparison data HTTP "+response.status);
      load(await response.json());
    }catch(error){
      const message=String(error&&error.message||error);
      $("playerStatus").textContent="Source comparison unavailable: "+message;
      for(const m of models) $(m.key+"Scroll").appendChild(create("p","chunk-text","Real model transcript data could not be loaded."));
      console.error("Human LAIer source comparison:",error);
    }
  }
  init();
})();
