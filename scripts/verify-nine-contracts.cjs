'use strict';
// Extracted unchanged from the original source-fidelity GitHub Actions gate.
const assert=require("node:assert/strict"),fs=require("node:fs"),crypto=require("node:crypto");
const dir="streaming-demo/nine-tickers/";
const read=x=>fs.readFileSync(dir+x);
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const html=read("index.html").toString("utf8");
const js=read("app.js").toString("utf8");
const css=read("styles.css").toString("utf8");
for(const id of ["video","videoError","blockNav","rawTickers","diffTickers",
      "domainTickers","metricComments","metricAccounts","metricEvents",
      "metricBuyer","chatSignals","cueText","audioStatus"]){
  assert(html.includes('id="'+id+'"'),"missing "+id);
}
assert(!html.includes("<h1"),"no introductory hero/essay");
assert(html.includes('class="video-column"')&&html.includes('class="right-panel"'),"portrait video to left, transcript column to right");
assert(html.indexOf('class="tickers"')<html.indexOf('class="metrics"'),"metrics below nine source-model outputs");
assert(css.includes("--video-ratio:.5625")&&css.includes("var(--video-ratio)"),"video column sized to actual portrait aspect");
assert(css.includes("grid-template-rows:var(--mast-h) minmax(0,1fr)"),"original video fills usable viewport height");
assert(css.includes("grid-template-rows:27px repeat(9,minmax(0,1fr))"),"nine legible continuous source tracks");
assert(js.includes("function buildTimelines()")&&js.includes("function panLines(seconds)"),"source text assembled as continuous non-resetting ribbons");
assert(js.includes("requestAnimationFrame(renderFrame)"),"smooth media-clock-driven crawl while playing");
assert(js.includes("SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES"));
assert(!js.includes("audio.src="),"video must replace audio player");
const d=JSON.parse(read("comparison.json"));
const v=JSON.parse(read("video-manifest.json"));
assert.equal(d.schema,"hl-commercial-nine-public-v1");
assert.equal(d.status,"SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES");
const original="58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de";
assert.equal(d.source.sourcePartSha256,original);
assert.equal(d.source.sourcePart,"part_000019.ts");
assert.equal(d.source.sourcePartOffsetSeconds,30);
assert.equal(d.source.durationSeconds,180);
assert.equal(d.source.mediaEventSyncVerified,false);
assert.equal(d.provenance.humanGoldAvailable,false);
assert.equal(d.provenance.actualSalesVerified,false);
assert.equal(d.provenance.wordTimingsVerified,false);
assert.equal(d.domainPackSha256,"dacb6b79f22ad3b7c16ecabe5ffb2c61af38c17e21381f21b850fb739e61d2a0");
assert.equal(d.domainCandidatesAreReviewOnly,true);
assert.equal(d.lanes.length,9);
assert.equal(d.clips.length,12);
const lanes=new Set(d.lanes.map(x=>x.id));
assert.equal(lanes.size,9);
for(const m of ["production-base.en","singlish-small","coats-large-v2"])
  for(const p of ["control","compact","focused"])
    assert(lanes.has(m+"--"+p),"missing "+m+"/"+p);
for(let i=0;i<12;i++){
  const c=d.clips[i];
  assert.equal(c.index,i);assert.equal(c.id,"clip"+String(i).padStart(2,"0"));
  assert.equal(c.start,15*i);assert.equal(c.end,15*(i+1));
  assert(hex(c.wavSha256));assert.equal(Object.keys(c.texts).length,9);
  for(const id of lanes)assert.equal(typeof c.texts[id],"string");
}
for(const l of d.lanes){
  assert.equal(l.verifiedSourceWav,true);assert.equal(l.wer,null);
  assert(hex(l.promptSha256));
  assert(Number.isFinite(l.inferenceSeconds)&&l.inferenceSeconds>=0);
}
assert.equal(d.engagement.comments,22);
assert.equal(d.engagement.uniqueActors,30);
assert.equal(d.chatEvidence.length,3);
assert.equal(v.schema,"hl-commercial-video-source-v1");
assert.equal(v.status,"VERIFIED_SOURCE_VIDEO_WITH_AUDIO");
assert.equal(v.sessionId,d.source.sessionId);
assert.equal(v.sourcePart,d.source.sourcePart);
assert.equal(v.sourcePartSha256,original);
assert.equal(v.sourcePartOffsetSeconds,30);
assert.equal(v.expectedDurationSeconds,180);
assert(v.encodedDurationSeconds>178.8&&v.encodedDurationSeconds<181);
assert.equal(v.filename,"commercial-180.mp4");
assert.equal(v.poster,"commercial-preview.jpg");
assert.equal(v.originalAudioIncluded,true);
assert.equal(v.mediaEventSyncVerified,false);
const mp4=read(v.filename),poster=read(v.poster);
assert.equal(mp4.length,14043262);
assert.equal(mp4.length,v.mp4Bytes);
assert.equal(hash(mp4),"9fdbdff777391886cfc39b220a053f3e10a49dd72454fe14d7443aacc0176f92");
assert.equal(hash(mp4),v.mp4Sha256);
assert.equal(mp4.toString("ascii",4,8),"ftyp");
assert.equal(poster.length,v.posterBytes);
assert.equal(hash(poster),v.posterSha256);
assert(poster[0]===255&&poster[1]===216,"JPEG poster bytes");
assert(!fs.existsSync(dir+".video-parts"),"no temporary source transfer segments published");
console.log("NINE_SOURCE_VIDEO_AAC_ASR_SHA_PASS "+JSON.stringify({
  videoBytes:mp4.length,models:3,decodings:9,clips:12,comments:22,
  videoSha256:v.mp4Sha256,mediaEventClockCalibrated:false,
  humanGold:false
}));
