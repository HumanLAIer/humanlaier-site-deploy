'use strict';
// Extracted unchanged from the original source-fidelity GitHub Actions gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const p='singlish-compare/',o=JSON.parse(fs.readFileSync(p+'comparison.json','utf8'));
assert.equal(o.schema,'hl-public-singlish-production-180-v1');
assert.equal(o.status,'UNREVIEWED_THREE_MODEL_TRANSCRIPTS');
assert.equal(o.sourceSession,'20261117T142835_038897Z_huatzaitcg');
assert.equal(o.sourcePart,'part_000027.ts');
assert.equal(o.sourcePartOffsetSeconds,110);
assert.equal(o.clipCount,12);
assert.equal(o.clipDurationSeconds,15);
assert.equal(o.durationSeconds,180);
assert.equal(o.samplesAreContiguous,true);
assert.equal(o.wordTimestampsVerified,false);
assert.equal(o.humanGoldAvailable,false);
assert.equal(o.eventMediaSyncIndependentlyVerified,false);
assert.equal(o.eventMediaClock,'PROVISIONAL_FFMPEG_PROCESS_OBSERVATION_NOT_CALIBRATED');
assert.equal(o.grossProviderChargesVerified,false);
assert.match(o.sourceProvenance,/LEGACY_ARCHIVE_NO_SEALED_MANIFEST/);
assert.match(o.sourcePartSha256,/^[a-f0-9]{64}$/);
assert.equal(o.clips.length,12);
assert.equal(o.waveform.length,180);
const audio=fs.readFileSync(p+o.audioFile);
assert(audio.length>600000&&audio.length<2000000);
assert.equal(audio.subarray(0,3).toString('ascii'),'ID3');
for(let i=0;i<12;i++){
  const c=o.clips[i];
  assert.equal(c.index,i);
  assert.equal(c.id,'clip'+String(i).padStart(2,'0'));
  assert.equal(c.start,i*15);
  assert.equal(c.end,(i+1)*15);
  assert.equal(c.sourcePartOffset,110+i*15);
  assert.match(c.wavSha256,/^[a-f0-9]{64}$/);
  for (const model of ['production','singlish','coats']) assert.equal(typeof c[model],'string');
  for (const k of ['comments','likes','gifts','shares','follows','giftProgress','uniqueActors']){
    assert(Number.isSafeInteger(c.engagement[k])&&c.engagement[k]>=0);
  }
}
for(const k of ['production-base.en','singlish-small','coats-large-v2']){
  const v=o.modelMetrics[k];
  assert.match(v.revision,/^[a-f0-9]{40}$/);
  assert(v.loadSeconds>=0&&v.inferSeconds>0&&v.peakRssMib>0);
  assert.equal(v.wer,null);
}
const html=fs.readFileSync(p+'index.html','utf8');
const script=fs.readFileSync(p+'app.js','utf8');
for(const id of ['sourceAudio','productionScroll','singlishScroll','coatsScroll','activityTrack','seekSlider','waveform']){
  assert(html.includes('id="'+id+'"'));
}
assert(script.includes('timeupdate')&&script.includes('scrollModel')&&script.includes('eventMediaSyncIndependentlyVerified'));
assert(html.includes('15-second')&&html.includes('not independently calibrated'));
assert(fs.existsSync('streaming-demo/assets/human-laier-dark.svg'));
assert(fs.existsSync('streaming-demo/assets/nov17-participation.jpg'));
console.log('VERIFIED: 180s contiguous source, 12 exact excerpts, 3 models, legacy evidence warning, activity bounds, and playback controls');
