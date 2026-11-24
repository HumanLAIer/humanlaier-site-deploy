#!/usr/bin/env node
"use strict";
// Deterministic contract tests; never access private media or invoke inference.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const html=read("streaming-lab/index.html");
const script=read("streaming-lab/lab.js");
const css=read("streaming-lab/lab.css");
const source=JSON.parse(read("streaming-demo/nine-tickers/comparison.json"));
const originalHtml=read("streaming-demo/nine-tickers/index.html");
assert(html.includes('src="../streaming-demo/nine-tickers/"'),"Must reuse nine-ticker study unchanged");
assert(html.includes("frame-src 'self'")&&html.includes('id="sourceFrame"'));
assert(/id="reviewPanel"[^>]*\bhidden\b/.test(html),"Review drawer must be initially closed");
assert(html.includes('id="probeForm"')&&html.includes('id="candidateList"'));
assert(html.includes('name="robots" content="noindex,nofollow,noarchive,nosnippet"'));
assert(html.includes('id="closeReview"')&&html.includes('id="phaseSelect"'));
assert(!html.includes("fetch('https://")&&!html.includes('iframe src="https://'));
assert(!html.includes("AUTH_REQUIRED"),"Preview must not demand login");
assert(css.includes(".review-panel[hidden]{display:none}"));
assert(source.schema==="hl-commercial-nine-public-v1");
assert(source.status==="SOURCE_MATCHED_PUBLIC_UNREVIEWED_NINE_DECODES");
assert(source.domainPackSha256==="dacb6b79f22ad3b7c16ecabe5ffb2c61af38c17e21381f21b850fb739e61d2a0");
assert(source.source.sourcePartSha256==="58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de");
assert.equal(source.provenance.humanGoldAvailable,false);
assert.equal(source.provenance.originalASRTextUnmodified,true);
assert.equal(source.lanes.length,9);
assert.equal(source.clips.length,12);
for(const [index,clip] of source.clips.entries()){
  assert.equal(clip.index,index);
  assert.equal(Object.keys(clip.texts).length,9);
}
const case4=source.clips[3];
assert.match(case4.texts["production-base.en--focused"],/mombreon please/i);
assert.match(case4.texts["singlish-small--compact"],/momebrion please/i);
assert.match(case4.texts["coats-large-v2--control"],/um bombion please/i);
assert.equal(case4.domainCandidateReview.length,0,"New inferred candidate stays in separate overlay");
for(const clue of ["mombreon","momebrion","um bombion"]){
  assert(script.includes(clue),"Missing published distortion clue "+clue);
}
assert(script.includes('pokeapi:species:197')&&script.includes('pokeapi:species:644'));
assert(script.includes("original ASR preserved")&&script.includes("REVIEW ONLY"));
assert(script.includes("ABSTAIN")&&script.includes("No acoustic verification"));
assert(script.includes('getElementById("video")'));
assert(originalHtml.includes('id="rawTickers"')&&originalHtml.includes('id="diffTickers"')&&
       originalHtml.includes('id="domainTickers"'));
for(const p of ["streaming-lab/index.html","streaming-lab/lab.css","streaming-lab/lab.js"])
  assert(fs.statSync(path.join(root,p)).size>500);
console.log("STREAMING_LAB_CONTRACT_PASS "+JSON.stringify({
  originalTracks:9,sourceClips:12,sourceExampleBlock:4,originalMediaPreserved:true,
  humanGold:false,publicAccess:true,defaultDrawerClosed:true
}));
