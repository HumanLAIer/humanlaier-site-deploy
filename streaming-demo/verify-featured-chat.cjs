'use strict';
// Contract-only regression: source evidence, live-chat placement and no invented events.
// No external network, provider calls or heavy browser dependencies.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const dir='streaming-demo/';
const page=read(dir+'index.html'),app=read(dir+'app.js'),css=read(dir+'ux.css');
const original=JSON.parse(read(dir+'nine-tickers/comparison.json'));
const sandbox={window:{}};
vm.runInNewContext(read(dir+'featured-evidence.js'),sandbox,{timeout:5000});
const featured=JSON.parse(JSON.stringify(sandbox.window.HL_FEATURED_SOURCE));
assert.equal(featured.schema,'hl-featured-source-chat-v1');
assert.equal(featured.source.sessionId,original.source.sessionId);
assert.equal(featured.source.sourcePartSha256,original.source.sourcePartSha256);
assert.equal(featured.source.audioSha256,original.source.audioSha256);
const audio=fs.readFileSync(dir+'nine-tickers/commercial-180.mp3');
assert.equal(crypto.createHash('sha256').update(audio).digest('hex'),featured.source.audioSha256);
assert.equal(featured.source.durationSeconds,180);
assert.equal(featured.provenance.humanGoldAvailable,false);
assert.equal(featured.provenance.wordTimingsVerified,false);
assert.equal(featured.provenance.eventMediaClockCalibrated,false);
assert.equal(featured.transcriptBlocks.length,12);
for(let i=0;i<12;i++){
  const a=featured.transcriptBlocks[i],b=original.clips[i];
  assert.equal(a.start,i*15);assert.equal(a.end,(i+1)*15);
  assert.equal(a.originalWavSha256,b.wavSha256);
  assert.deepEqual(a.texts,b.texts);
}
assert.equal(featured.chatExcerpts.length,3);
for(let i=0;i<3;i++){
  const a=featured.chatExcerpts[i],b=original.chatEvidence[i];
  assert.equal(a.handle,b.actor);assert.equal(a.text,b.text);
  assert.equal(a.estimatedAudioSec,b.estimatedAudioSec);
  assert.equal(a.timebase,'PROVISIONAL_RECORDER_PROCESS_OBSERVATION');
  assert.equal(a.sourceTextSha256,b.sourceTextSha256);
}
assert.equal(featured.counts.comments,22);
assert.equal(featured.counts.deliberateEvents,46);
assert.equal(featured.counts.uniqueActors,30);
assert(!page.includes('id="featuredTranscript"'),'No second giant transcript panel');
assert(!page.includes('id="featuredAsrRows"'),'No detached 12-button mass');
for(const id of ['conversationList','featuredModel','featuredModelBar','featuredClockNote',
                  'featuredAudioSlate','audioPlayer','sessionSelect','networkSvg'])
  assert(page.includes('id="'+id+'"'),'Missing '+id);
assert(page.indexOf('featured-evidence.js?v=')<page.indexOf('app.js?v='));
assert(page.includes('ux.css?v=chatroom-20261123-1'),'Cache-busted production styles');
assert(app.includes('function renderFeaturedConversation()'));
assert(app.includes("message-row '+item.kind"),'Use native speech/chat bubble roles');
assert(app.includes('if(isFeatured())return renderFeaturedConversation();'));
assert(app.includes('comments:[],interactions:[],roomEvents:[]'),
       'No fabricated individual actions from aggregate counts');
assert(app.includes('UNAVAILABLE / AUDIO CLOCK ONLY'),'No invented media UTC');
assert(app.includes('not a verified reply'));
assert(app.includes("featuredModel').addEventListener"));
assert(css.includes('.message-row.chat{justify-content:flex-end}'));
assert(css.includes('.message-row.speech{justify-content:flex-start}'));
assert(css.includes('.featured-clock-note{'));
assert(css.includes('.media-viewport.featured-audio-active{'));
new vm.Script(app,{filename:'app.js'});
new vm.Script(read(dir+'bridge.js'),{filename:'bridge.js'});
console.log('PASS: integrated source-audio host ASR and original comments live in V4 chat, 12 exact blocks, original audio SHA verified, no manufactured actions or cross-clock claims.');
