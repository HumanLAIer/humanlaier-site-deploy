"use strict";
/* Source-first research viewer: the nine existing ticker lanes and video remain
 * untouched in their original iframe. Candidate matches are independent,
 * review-only research hints. No private data, model calls or writes. */
(() => {
  const $ = id => document.getElementById(id);
  const ROOT = "../streaming-demo/nine-tickers/";
  const EXPECTED_PART = "58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de";
  const EXPECTED_PACK = "dacb6b79f22ad3b7c16ecabe5ffb2c61af38c17e21381f21b850fb739e61d2a0";
  const EXPECTED_SOURCE = "20261117T142835_038897Z_huatzaitcg";
  const MODELS = [
    ["production-base.en", "BASE / base.en"],
    ["singlish-small", "SINGLISH / small"],
    ["coats-large-v2", "COATS / large-v2"]
  ];
  const state = {data:null, clipIndex:-1, lastTime:-1};
  // Small public demonstration only, NOT the full versioned catalogue index.
  // Source IDs derived from PokéAPI species number; actual linked source pack
  // and private receipt validation live in hl-livestream-pilot.
  const registry = [
    {id:"pokeapi:species:197", label:"Umbreon", names:[
      {text:"Umbreon",language:"en",source:"English species label"},
      {text:"ブラッキー",language:"ja",source:"Japanese localized species name"},
      {text:"月亮伊布",language:"zh-cn",source:"Chinese localized species name"},
      {text:"Bracky",language:"submitted",source:"User-supplied spelling; not verified as official"},
      {text:"mombreon",language:"observed-asr",source:"Published Base focused model, source clip 04; unverified acoustically"},
      {text:"momebrion",language:"observed-asr",source:"Published Singlish compact model, source clip 04; unverified acoustically"},
      {text:"um bombion",language:"observed-asr",source:"Published Coats unprompted model, source clip 04; unverified acoustically"}]},
    {id:"pokeapi:species:644",label:"Zekrom",names:[
      {text:"Zekrom",language:"en",source:"English species label"}]},
    {id:"pokeapi:species:384",label:"Rayquaza",names:[
      {text:"Rayquaza",language:"en",source:"English species label"}]},
    {id:"pokeapi:species:700",label:"Sylveon",names:[
      {text:"Sylveon",language:"en",source:"English species label"}]},
    {id:"pokeapi:species:133",label:"Eevee",names:[
      {text:"Eevee",language:"en",source:"English species label"}]},
    {id:"pokeapi:species:196",label:"Espeon",names:[
      {text:"Espeon",language:"en",source:"English species label"}]},
    {id:"pokeapi:species:267",label:"Beautifly",names:[
      {text:"Beautifly",language:"en",source:"English species label"}]}
  ];
  function node(tag, text, className) {
    const e = document.createElement(tag);
    if(text !== undefined) e.textContent = String(text);
    if(className) e.className = className;
    return e;
  }
  function clock(seconds) {
    const t=Math.max(0,Math.floor(seconds));
    return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");
  }
  function normalize(value) {
    return value.normalize("NFKD").toLowerCase()
      .replace(/\p{M}/gu,"")
      .replace(/(?<=\p{L})['’](?=\p{L})/gu,"")
      .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
  }
  function signature(value) {
    let key=normalize(value).replace(/ /g,"");
    if(!/^[a-z]{5,24}$/.test(key)) return "";
    key=key.replace(/ph/g,"f").replace(/ck/g,"k")
      .replace(/ch/g,"k").replace(/qu/g,"k").replace(/sh/g,"s")
      .replace(/[aeiouy]/g,"").replace(/(.)\1+/g,"$1");
    return key.length>=3?key:"";
  }
  function similarity(a,b) {
    if(Math.abs(a.length-b.length)>4) return 0;
    const old=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let previous=old[0];old[0]=i;
      for(let j=1;j<=b.length;j++){
        const last=old[j];
        old[j]=Math.min(old[j]+1,old[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));
        previous=last;
      }
    }
    return 1-old[b.length]/Math.max(a.length,b.length,1);
  }
  function candidateProbe(value) {
    const key=normalize(value);
    if(key.length<4 || key.length>60) return [];
    if(/[$€£¥]|\b(?:psa|bgs|cgc|sgd|usd|price|sold|bid)\b|\d/.test(key))
      return [];
    const phonetic=signature(key);
    const results=[];
    for(const entity of registry) {
      let best=null;
      for(const alias of entity.names) {
        const known=normalize(alias.text);
        if(key===known){
          best={entity,alias,match:"exact",score:1};
          break;
        }
        // Phonetic keys are ASCII English only. Localized names are exact.
        if(alias.language!=="en") continue;
        const ratio=similarity(key,known);
        const phoneticMatch=phonetic && phonetic===signature(known) && ratio>=.55;
        const strictFuzzy=/^[a-z ]+$/.test(key)&&/^[a-z ]+$/.test(known)&&
          ratio >= (known[0]!==key[0] ? 0.84 : 0.88);
        if(!phoneticMatch&&!strictFuzzy) continue;
        const proposal={entity,alias,match:phoneticMatch?"phonetic":"fuzzy",score:ratio};
        if(!best || proposal.score>best.score) best=proposal;
      }
      if(best) results.push(best);
    }
    return results.sort((a,b)=>b.score-a.score||a.entity.id.localeCompare(b.entity.id));
  }
  function probe(){
    const value=$("probe").value.trim();
    const output=$("probeResult");
    output.replaceChildren();
    if(!value){
      output.append(node("span","Enter a term to inspect review-only retrieval."));
      return;
    }
    if(/[$€£¥]|\b(?:psa|bgs|cgc|sgd|usd|price|sold|bid)\b|\d/i.test(value)){
      output.append(node("span","Protected money, grade or quantity context — no rewrite proposed.","warning"));
      return;
    }
    const hits=candidateProbe(value);
    if(!hits.length){
      output.append(node("strong","ABSTAIN — no supported candidate in the seven-species probe."));
      output.append(node("div","This small demonstration does not load the complete 75,673-record source catalogue.","secondary"));
      return;
    }
    for(const hit of hits.slice(0,3)){
      const line=node("div",undefined,"probe-hit");
      line.append(node("strong","REVIEW "+hit.entity.label+" · "+hit.entity.id));
      const why=hit.match==="exact"?
        "Exact name/alias: "+hit.alias.text+" ["+hit.alias.language+"]":
        hit.match==="phonetic"?
          "Consonant-phonetic match, independent of starting character":
          "Strict character similarity";
      line.append(node("div",why+" · "+hit.alias.source,"secondary"));
      if(hit.alias.language==="submitted")
        line.append(node("div","This spelling has not been authenticated as an official localized name.","warning"));
      if(hit.alias.language==="observed-asr")
        line.append(node("div","Observed ASR output is not a verified spoken entity.","warning"));
      output.append(line);
    }
    output.append(node("div","No acoustic verification, calibrated probability or exact card-printing claim.","secondary"));
  }
  function renderCandidates(clip){
    const list=$("candidateList");
    list.replaceChildren();
    const items=Array.isArray(clip.domainCandidateReview)?clip.domainCandidateReview:[];
    // Source-verified textual disagreement from block 04. Not a verdict:
    // three Whisper-family renderings are not independent human evidence.
    if(clip.index===3 &&
      /mombreon\s+please/i.test(clip.texts["production-base.en--focused"]) &&
      /momebrion\s+please/i.test(clip.texts["singlish-small--compact"]) &&
      /um bombion\s+please/i.test(clip.texts["coats-large-v2--control"])){
      const card=node("article",undefined,"candidate candidate-feature");
      card.append(node("strong","Umbreon? · pokeapi:species:197"));
      card.append(node("span","LISTEN TO VERIFY","review-badge"));
      card.append(node("span","Cross-model ASR disagreement · English species hypothesis","kind"));
      card.append(node("span","","kind"));
      card.append(node("span","Base focused: “mombreon” · Singlish compact: “momebrion” · Coats raw: “um bombion” · Coats focused: omitted. Different spellings are retrieval clues, NOT an independently heard Umbreon or a card sale.","why"));
      list.append(card);
    }
    if(!items.length && list.childElementCount===0){
      list.append(node("div","No published candidate-review entry in this block. That does not establish silence or an absent product.","empty"));
      return;
    }
    for(const item of items.slice(0,8)){
      const card=node("article",undefined,"candidate");
      card.append(node("strong",item.name));
      card.append(node("span","REVIEW ONLY","review-badge"));
      card.append(node("span",item.entityType.replace(/_/g," · "),"kind"));
      card.append(node("span","","kind"));
      const n=Array.isArray(item.sourceConfigurations)?item.sourceConfigurations.length:0;
      card.append(node("span","Present in "+n+"/9 ASR lanes · text similarity "+
        Number(item.maxSimilarity).toFixed(2)+" (NOT probability) · "+
        (item.ambiguous?"ambiguous printing / ID":"unverified identity"),"why"));
      list.append(card);
    }
  }
  function renderTranscripts(clip){
    const parent=$("sourceTranscripts");
    parent.replaceChildren();
    for(const [name,label] of MODELS){
      const value=clip.texts && clip.texts[name+"--"+$("phaseSelect").value];
      const row=node("div",undefined,"transcript");
      row.append(node("strong",label));
      row.append(node("p",typeof value==="string"?value:"Original lane unavailable"));
      parent.append(row);
    }
  }
  function renderClip(index){
    if(!state.data||index<0||index>=state.data.clips.length)return;
    const clip=state.data.clips[index], source=state.data.source;
    state.clipIndex=index;
    $("clipClock").textContent=clock(clip.start)+"–"+clock(clip.end);
    $("clipLabel").textContent="Source-local block "+String(index+1).padStart(2,"0")+
      "/12 · "+source.sourcePart+" · original ASR preserved";
    renderCandidates(clip);
    renderTranscripts(clip);
  }
  function updateSourceClock(){
    if(!state.data||$("reviewPanel").hidden)return;
    let seconds=0;
    try{
      const frame=$("sourceFrame");
      const player=frame.contentDocument&&frame.contentDocument.getElementById("video");
      if(player&&Number.isFinite(player.currentTime)) seconds=player.currentTime;
    }catch(_){
      $("labStatus").textContent="Playback context unavailable; choose original nine-ticker study.";
      return;
    }
    if(Math.abs(seconds-state.lastTime)<0.05)return;
    state.lastTime=seconds;
    const index=Math.min(11,Math.max(0,Math.floor(seconds/15)));
    if(index!==state.clipIndex)renderClip(index);
  }
  function openReview(open){
    $("reviewPanel").hidden=!open;
    $("openReview").setAttribute("aria-expanded",String(open));
    if(open){
      updateSourceClock();
      $("closeReview").focus();
    }else $("openReview").focus();
  }
  function checkData(d){
    if(!d||d.schema!=="hl-commercial-nine-public-v1"||
      d.status!=="SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES"||
      d.domainPackSha256!==EXPECTED_PACK||
      !d.source||d.source.sessionId!==EXPECTED_SOURCE||
      d.source.sourcePartSha256!==EXPECTED_PART||
      !d.provenance||d.provenance.humanGoldAvailable!==false||
      d.provenance.originalASRTextUnmodified!==true||
      !Array.isArray(d.clips)||d.clips.length!==12||
      !Array.isArray(d.lanes)||d.lanes.length!==9)
      throw Error("source_contract_mismatch");
    for(let i=0;i<12;i++){
      const row=d.clips[i];
      if(row.index!==i||row.start!==i*15||row.end!==(i+1)*15||
        !row.texts||Object.keys(row.texts).length!==9)
        throw Error("source_block_contract_mismatch");
    }
  }
  function load(){
    fetch(ROOT+"comparison.json",{cache:"no-store"})
      .then(r=>{if(!r.ok)throw Error("missing_source");return r.json();})
      .then(d=>{
        checkData(d);
        state.data=d;
        $("sourceSession").textContent=d.source.sessionId;
        $("sourcePart").textContent=d.source.sourcePart;
        $("sourceDigest").textContent=d.source.sourcePartSha256;
        $("packDigest").textContent=d.domainPackSha256;
        $("sourceStatus").textContent="SOURCE-PINNED · NINE ASR LANES UNCHANGED";
        $("labStatus").textContent="12 × 15-second blocks · public unreviewed evidence";
        renderClip(0);
        updateSourceClock();
      }).catch(()=>{
        $("labStatus").textContent="SOURCE CONTRACT UNAVAILABLE — suggestions disabled.";
        $("candidateList").replaceChildren(node("div",
          "Published source data unavailable; no candidate assertions.","empty"));
        $("sourceStatus").textContent="SOURCE CONTRACT ERROR";
      });
  }
  $("openReview").addEventListener("click",()=>openReview($("reviewPanel").hidden));
  $("closeReview").addEventListener("click",()=>openReview(false));
  $("phaseSelect").addEventListener("change",()=>{
    if(state.data)renderClip(state.clipIndex>=0?state.clipIndex:0);
  });
  $("probeForm").addEventListener("submit",event=>{event.preventDefault();probe();});
  document.querySelectorAll("[data-probe]").forEach(button=>
    button.addEventListener("click",()=>{
      $("probe").value=button.dataset.probe;
      probe();
    }));
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!$("reviewPanel").hidden)openReview(false);
  });
  setInterval(updateSourceClock,250);
  load();
})();
