'use strict';
/* Regression against source integrity AND future changes in transcript shape. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root='streaming-demo/';
const read=name=>fs.readFileSync(root+name,'utf8');
const page=read('index.html'),app=read('app.js'),css=read('ux.css'),
      boot=read('featured-bootstrap.js'),adapterSource=read('featured-evidence.js');
const raw=JSON.parse(read('nine-tickers/comparison.json'));
const sandbox={window:{}};
vm.runInNewContext(adapterSource,sandbox,{timeout:3000});
const normalize=sandbox.window.HL_SOURCE_ADAPTER.normalize;
const attachVideo=sandbox.window.HL_SOURCE_ADAPTER.attachVideo;
const videoManifest=JSON.parse(read('nine-tickers/video-manifest.json'));
function expectedFailure(json,label){
  assert.throws(()=>normalize(json),undefined,label);
}
const current=JSON.parse(JSON.stringify(normalize(raw)));
assert.equal(current.schema,'hl-featured-source-chat-v2');
assert.equal(current.source.sessionId,raw.source.sessionId);
assert.equal(current.source.sourcePartSha256,raw.source.sourcePartSha256);
assert.equal(current.source.audioSha256,raw.source.audioSha256);
assert.equal(current.source.durationSeconds,raw.source.durationSeconds);
const withVideo=JSON.parse(JSON.stringify(attachVideo(normalize(raw),videoManifest)));
assert.equal(withVideo.source.videoFile,'nine-tickers/commercial-180.mp4');
assert.equal(withVideo.source.poster,'nine-tickers/commercial-preview.jpg');
assert.equal(withVideo.source.videoDurationSeconds,videoManifest.encodedDurationSeconds);
const video=fs.readFileSync(root+withVideo.source.videoFile);
assert.equal(video.length,videoManifest.mp4Bytes);
assert.equal(crypto.createHash('sha256').update(video).digest('hex'),withVideo.source.videoSha256);
assert.equal(attachVideo(normalize(raw),null).source.videoFile,undefined,
  'Missing manifest retains original source audio');
const tamperedVideo=JSON.parse(JSON.stringify(videoManifest));
tamperedVideo.mp4Sha256='0'.repeat(64);
assert.throws(()=>attachVideo(normalize(raw),tamperedVideo),
  undefined,'Mismatched video must not be silently substituted');
const audio=fs.readFileSync(root+'nine-tickers/commercial-180.mp3');
assert.equal(crypto.createHash('sha256').update(audio).digest('hex'),current.source.audioSha256);
assert.equal(current.transcriptBlocks.length,raw.clips.length);
assert.equal(current.models.length,9);
assert.equal(current.chatExcerpts.length,raw.chatEvidence.length);
assert.equal(current.counts.comments,raw.engagement.comments);
assert.equal(current.counts.deliberateEvents,raw.engagement.deliberateEvents);
for(let i=0;i<raw.clips.length;i++){
  assert.equal(current.transcriptBlocks[i].start,raw.clips[i].start);
  assert.equal(current.transcriptBlocks[i].end,raw.clips[i].end);
  assert.deepEqual(current.transcriptBlocks[i].texts,raw.clips[i].texts);
}
for(let i=0;i<current.chatExcerpts.length;i++){
  assert.equal(current.chatExcerpts[i].handle,raw.chatEvidence[i].actor);
  assert.equal(current.chatExcerpts[i].text,raw.chatEvidence[i].text);
  assert.equal(current.chatExcerpts[i].sourceTextSha256,raw.chatEvidence[i].sourceTextSha256);
}
// Future revisions: different utterance/block counts, irregular but accurate
// source-local timings, changed wording, fewer/more models and absent chat.
const changed=JSON.parse(JSON.stringify(raw));
changed.lanes=[];
changed.chatEvidence=[];
changed.clips=[
  {start:0,end:7.2,texts:{'new-model--v2':'First novel transcription'}},
  {start:8.4,end:39.15,texts:{'new-model--v2':'Word ordering is completely different'}},
  {start:39.15,end:180,texts:{'new-model--v2':'', 'new-model--v3':'Alternative model'}}
];
const next=JSON.parse(JSON.stringify(normalize(changed)));
assert.equal(next.transcriptBlocks.length,3);
assert.deepEqual(next.models,['new-model--v2','new-model--v3']);
assert.equal(next.defaultModel,'new-model--v2');
assert.equal(next.chatExcerpts.length,0);
assert.equal(next.transcriptBlocks[1].texts[next.defaultModel],
  'Word ordering is completely different');
assert.equal(attachVideo(normalize(changed),videoManifest).source.videoFile,
  'nine-tickers/commercial-180.mp4',
  'Updating transcript wording/timing or models must not disable matching video');
assert(next.coverageSeconds<180&&next.coverageSeconds>178);
const withUnplaced=JSON.parse(JSON.stringify(raw));
delete withUnplaced.chatEvidence[0].estimatedAudioSec;
assert.equal(normalize(withUnplaced).chatExcerpts[0].estimatedAudioSec,null);
const withMissingBlockModel=JSON.parse(JSON.stringify(raw));
delete withMissingBlockModel.clips[4].texts['production-base.en--control'];
const validMissing=normalize(withMissingBlockModel);
assert.equal(validMissing.transcriptBlocks[4].texts['production-base.en--control'],undefined);
const wrongAudio=JSON.parse(JSON.stringify(raw));
wrongAudio.source.audioSha256='f'.repeat(64);
expectedFailure(wrongAudio,'unapproved audio identity');
const badRange=JSON.parse(JSON.stringify(raw));
badRange.clips[0].end=185;
expectedFailure(badRange,'source time beyond duration');
const badText=JSON.parse(JSON.stringify(raw));
badText.clips[0].texts['production-base.en--control']={invented:true};
expectedFailure(badText,'invalid model output');
const noTranscript=JSON.parse(JSON.stringify(raw));noTranscript.clips=[];
expectedFailure(noTranscript,'empty segment inventory');
// The ORIGINAL V4 markup, player and chat bubble renderer are retained.
assert(!page.includes('id="featuredTranscript"'),'No top-of-page mass of buttons');
assert(!page.includes('id="featuredAsrRows"'),'No detached transcript widget');
assert(!page.includes('id="featuredAudioSlate"'),'No custom media redesign');
assert(!page.includes('id="featuredClockNote"'),'No extra banner');
for(const id of ['conversationList','conversationOptions','featuredModel',
  'featuredModelLabel','audioPlayer','sessionSelect','networkSvg','masterPlay','masterSeek'])
  assert(page.includes('id="'+id+'"'),'Missing V4 control '+id);
assert(page.indexOf('id="featuredModel"')>page.indexOf('id="conversationOptions"'));
assert(page.indexOf('featured-evidence.js?v=')<page.indexOf('featured-bootstrap.js?v='));
assert(!page.includes('<script src="app.js'),'Old direct app load could race async source data');
assert(app.includes('function renderFeaturedConversation()'));
assert(app.includes("message-row '+item.kind"),'Native left/right chat bubbles missing');
assert(app.includes('if(isFeatured())return renderFeaturedConversation()'));
assert(app.includes('comments:[],interactions:[],roomEvents:[]'),
  'Aggregate counts cannot become fictional participant events');
assert(app.includes('UNAVAILABLE / AUDIO CLOCK ONLY'));
assert(app.includes('video:FEATURED.source.videoFile||null'),
  'Matching source video must be attached to V4 media review');
assert(!app.includes("if(isFeatured())track='audio'"),
  'Featured recording must not forcibly downgrade to audio');
assert(app.includes("Original source video unavailable in this browser"),
  'Video playback errors must fall back to original audio, not silent failure');
assert(boot.includes("readJson('nine-tickers/video-manifest.json')"),
  'Source video manifest must be loaded and validated');
assert(app.includes('for(const id of FEATURED.models)'),
  'Model selector should be driven by actual available models');
assert(app.includes('[No recorded output from this engine for this passage]'),
  'Partial model outputs must degrade cleanly');
assert(!app.includes('r.start===i*15'),'UI must not assume 15s blocks');
assert(css.includes('.message-row.chat{justify-content:flex-end}'));
assert(css.includes('.message-row.speech{justify-content:flex-start}'));
assert(!css.includes('.featured-audio-slate{'),'Do not rewrite V4 styling');
assert(boot.includes('finally(()=>{clearTimeout(timeout);launch();})'),
  'Load baseline app even if transcript JSON fails');
new vm.Script(app,{filename:'app.js'});
new vm.Script(boot,{filename:'featured-bootstrap.js'});
new vm.Script(read('bridge.js'),{filename:'bridge.js'});
console.log(JSON.stringify({result:'PASS',originalASRBlocks:current.transcriptBlocks.length,
  availableModels:current.models.length,viewerExcerpts:current.chatExcerpts.length,
  mutatedBlocks:next.transcriptBlocks.length,mutatedModels:next.models.length,
  design:'ORIGINAL_V4',userFacingTranscript:'IN_CONVERSATION_ONLY',
  videoSource:'SHA_VERIFIED_ORIGINAL_H264',videoBytes:video.length,
  fallback:'ORIGINAL_AUDIO_AND_ARCHIVED_CAPTURES_AVAILABLE'},null,2));
