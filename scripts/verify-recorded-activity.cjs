'use strict';
// Evidence gate for ORIGINAL, published participant event logs.
// Every individually recorded comment/action is preserved into V4 and may be
// represented by one collector-clock tick; aggregate engagement counts cannot
// silently become graph nodes or attributed events.
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root='streaming-demo/';
const read=n=>fs.readFileSync(root+n,'utf8');
const context={window:{}};
vm.runInNewContext(read('data.js'),context,{timeout:4000});
const pub=JSON.parse(JSON.stringify(context.window.HL_SHOWCASE_DATA));
assert.equal(pub.schema,'hl-public-handle-showcase-v1');
assert(pub.sessions.length>=4);
const source=pub.sessions.find(s=>s.id==='nov17-participation');
assert(source,'Public original Nov17 participant action capture must remain available');
assert(source.media.some(m=>m.video==='assets/nov17-participation.mp4'));
assert(source.events.length>=140,'Do not silently remove recorded baseline activity events');
assert(source.people.length>=42,'Do not silently remove recorded participant handles');
assert(source.events.length>0&&source.events.length===source.stats.records);
const byKind=new Map();
const actors=new Set(source.people.map(p=>p.id));
const unique=new Set();
for(const event of source.events){
  assert(Array.isArray(event)&&event.length>=4);
  const [time,kind,actor]=event;
  assert(Number.isFinite(time)&&time>=0&&time<=source.duration,'Invalid source collector seconds');
  assert(typeof kind==='string'&&/^[a-z][a-z_]{1,48}$/.test(kind),'Invalid event kind');
  assert(actors.has(actor),'No invented or missing account mapping for published source action');
  byKind.set(kind,(byKind.get(kind)||0)+1);
  unique.add(actor);
}
assert.equal(unique.size,source.people.length);
const expectedKinds=['comment','like','gift','gift_progress','follow','share'];
for(const kind of expectedKinds){
  assert((byKind.get(kind)||0)>0,'Missing source-backed event kind '+kind);
}
for(const [kind,total] of Object.entries(source.stats.observedKinds)){
  assert.equal(byKind.get(kind),total,'Published original kind count changed unexpectedly: '+kind);
}
assert.equal([...byKind.values()].reduce((a,b)=>a+b,0),source.events.length);
vm.runInNewContext(read('bridge.js'),context,{timeout:4000});
const D=JSON.parse(JSON.stringify(context.window.HL_SIGNAL_DATA));
assert(D&&D.schema==='hl-v4-public-tool-bridge-v1');
const actual=D.sessions.find(s=>s.id==='nov17-participation');
assert(actual);
assert.equal(D.defaultSession,source.id,'Activity-first baseline must be the published default');
// The same event-rich default now MUST contain host/stream speech transcribed
// from that exact original MP4, not a different research recording.
const asr=JSON.parse(read('assets/nov17-participation-asr.json'));
assert.equal(asr.schema,'hl-source-asr-public-v1');
assert.equal(asr.captureId,source.id);
assert.equal(asr.media,'assets/nov17-participation.mp4');
assert.equal(asr.clock,'SOURCE_MEDIA_LOCAL_UNCALIBRATED_TO_COLLECTOR');
assert.equal(asr.humanReviewed,false);
assert(asr.utterances.length>=2,'The video audibly contains speech; release must include original-source ASR');
const videoBytes=fs.readFileSync(root+asr.media);
const originalSha=crypto.createHash('sha256').update(videoBytes).digest('hex');
assert.equal(originalSha,asr.mediaSha256,'Source ASR must use this EXACT public MP4, not a mismatched excerpt');
assert.equal(originalSha,'a823a0c53babe333e51500dff9f8364bcdd351e3a24868786c8afa519174bfbf',
  'Do not silently replace the source video after deriving this transcript');
assert(asr.mediaDurationSeconds>118&&asr.mediaDurationSeconds<122);
vm.runInNewContext(read('participation-source-asr.js'),context,{timeout:4000});
const decoded=context.window.HL_PARTICIPATION_ASR.normalize(asr);
assert.equal(decoded.rows.length,asr.utterances.length);
const attached=context.window.HL_PARTICIPATION_ASR.attach(asr);
assert.equal(attached.calibratedToCollector,false);
const hydratedReview=context.window.HL_SIGNAL_DATA.review.find(m=>m.sid===source.id);
assert.equal(hydratedReview.video,asr.media);
assert.equal(hydratedReview.transcript.length,asr.utterances.length);
assert.equal(hydratedReview.transcriptEvidence,'SAME_SOURCE_MACHINE_ASR_UNREVIEWED');
for(let i=0;i<asr.utterances.length;i++){
  const [start,end,text]=asr.utterances[i];
  assert(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&
    end<=asr.mediaDurationSeconds+1);
  assert(text.trim(),'No blank source speech passages');
  assert.equal(JSON.stringify(hydratedReview.transcript[i]),
    JSON.stringify([start,end,text]),'Source ASR words and local times must survive unchanged');
}
// Model updates may change language, text and SEGMENT COUNT, but must still
// represent the same media and cover the audibly spoken timeline.
const parser=context.window.HL_PARTICIPATION_ASR;
const amended=structuredClone(asr);
amended.model='faster-whisper/large-v3';
amended.utterances=[
  asr.utterances[0],
  asr.utterances[Math.floor(asr.utterances.length/2)],
  asr.utterances.at(-1)
].map((r,i)=>[r[0],r[1],'Entirely different model wording '+i]);
assert.equal(parser.normalize(amended).rows.length,3,
  'No fixed 32-segment layout, model, wording or uniform time chunk');
assert.equal(parser.normalize(amended).model,'faster-whisper/large-v3');
function rejectChange(label,mutate){
  const changed=structuredClone(asr);
  mutate(changed);
  assert.throws(()=>parser.normalize(changed),undefined,
    'Reject '+label+' before loading the default V4');
}
rejectChange('missing ASR',r=>{r.utterances=[];});
rejectChange('partial ASR with no meaningful speech span',r=>{
  r.utterances=r.utterances.slice(0,3);
});
rejectChange('same-shape but unrelated source MP4 hash',r=>{
  r.mediaSha256='f'.repeat(64);
});
rejectChange('different capture with borrowed source speech',r=>{
  r.captureId='nov15-citrus';
});
rejectChange('wrong video path',r=>{
  r.media='assets/nov18-trade.mp4';
});
rejectChange('falsely verified collector clock',r=>{
  r.clock='VERIFIED';
});
rejectChange('fabricated human-reviewed status',r=>{
  r.humanReviewed=true;
});
rejectChange('invalid source media timings',r=>{
  r.utterances[0]=[0,800,'Invented'];
});
const activeData=context.window.HL_SIGNAL_DATA;
const activeSource=context.window.HL_SHOWCASE_DATA;
const originalDefault=activeData.defaultSession;
activeData.defaultSession='nov15-citrus';
assert.throws(()=>parser.attach(asr),undefined,
  'Source-backed default cannot silently switch to unrelated capture');
activeData.defaultSession=originalDefault;
const originalEvents=activeSource.sessions.find(s=>s.id==='nov17-participation').events;
activeSource.sessions.find(s=>s.id==='nov17-participation').events=[];
assert.throws(()=>parser.attach(asr),undefined,
  'Transcript alone cannot replace original attributed event inventory');
activeSource.sessions.find(s=>s.id==='nov17-participation').events=originalEvents;
assert.equal(parser.attach(asr).segments,asr.utterances.length,
  'Restoring original source must produce complete, source-matched readiness');
const boot=read('featured-bootstrap.js');
assert(boot.includes('window.HL_DEMO_READINESS')&&
  boot.includes('async function hydrateCore()')&&
  boot.includes('async function hydrateOptionalStudy()')&&
  boot.includes('Promise.allSettled([hydrateCore(),hydrateOptionalStudy()])'),
  'Mandatory source/ASR loading must be isolated from OPTIONAL model research');
assert(!boot.includes('const controller=new AbortController();\n  const timeout=setTimeout'),
  'No shared request timeout may downgrade critical ASR when an optional study stalls');
assert(app.includes("warning.dataset.showcaseError='host-asr'")&&
  app.includes('DEMO INCOMPLETE'),
  'Missing host ASR MUST be visible as an incomplete demo, not silent comments');
assert.equal(actual.comments.length,byKind.get('comment'));
assert.equal(actual.comments.length+actual.interactions.length,source.events.length,
  'All original individual event markers must pass through V4 adapter intact');
assert.equal(actual.interactions.length,source.events.length-byKind.get('comment'));
assert.equal(Object.keys(actual.accountLabels).length,source.people.length);
assert.equal(actual.roomEvents.length,0,'Do not invent passive room signals absent from public source');
const mapped=new Map();
for(const row of actual.comments) {
  const k='comment';mapped.set(k,(mapped.get(k)||0)+1);
}
for(const row of actual.interactions){
  const k=row[1];mapped.set(k,(mapped.get(k)||0)+1);
}
for(const [kind,n] of byKind)assert.equal(mapped.get(kind),n,'V4 lost kind '+kind);
const communityIds=new Set(D.community.nodes.map(row=>row[0]));
for(const id of unique)assert(communityIds.has(id),'Missing constellation participant '+id);
const publicLinks=new Set(D.community.edges.map(r=>r[0]+'|'+r[1]));
for(const link of source.links){
  const forward=link[0]+'|'+link[1],reverse=link[1]+'|'+link[0];
  assert(publicLinks.has(forward)||publicLinks.has(reverse),
    'Observed co-activity link missing from constellation source');
}
// Regression: the 15 November Citrus capture has five platform accounts,
// but one observed account (@junetlt) reported 20 likes in THREE batches.
// Neither 20 units nor three notifications imply new participant nodes.
const citrus=pub.sessions.find(s=>s.id==='nov15-citrus');
assert(citrus,'Preserve original Citrus evidence');
const citrusLikes=citrus.events.filter(row=>row[1]==='like');
const likeActors=new Set(citrusLikes.map(row=>row[2]).filter(Boolean));
const likeUnits=citrusLikes.reduce((sum,row)=>sum+Number(row[3]||0),0);
const targetLikes=citrusLikes.filter(row=>row[2]==='@junetlt');
assert.equal(citrus.people.length,5);
assert.equal(citrusLikes.length,6,'Original six like notifications must not be multiplied into accounts');
assert.equal(likeUnits,46,'Preserve 46 reported unit counts');
assert.equal(likeActors.size,4,'Only four accounts actually recorded liking this excerpt');
assert.equal(targetLikes.length,3);
assert.equal(targetLikes.reduce((sum,row)=>sum+Number(row[3]||0),0),20);
const citrusV4=D.sessions.find(s=>s.id==='nov15-citrus');
assert(citrusV4,'Citrus must remain a selectable capture');
assert.equal(Object.keys(citrusV4.accountLabels).length,5);
assert.equal(citrusV4.interactions.filter(row=>row[1]==='like').length,6);
assert.equal(citrusV4.interactions.filter(row=>row[1]==='like')
 .reduce((sum,row)=>sum+Number(row[3]||0),0),46);
const app=read('app.js');
assert(app.includes('D.sessions.push({')&&!app.includes('D.defaultSession=FEATURED_ID'),
  'Aggregate-only speech excerpt must not replace activity-backed default');
assert(app.includes('cv.dataset.recordedMarkerCount=String(marks.length)'),
  'Timeline must expose individual marker count for original collector events');
assert(app.includes('const marks=(state.visualEvents||[]).filter'),
  'All event markers must originate from individual rows, not aggregate bins');
assert(app.includes('const alternative=D.sessions.find'),
  'Missing-activity source must explain and offer an event-backed recording');
assert(app.includes('new Set([...s.comments.map'),
  'Selection must require individually attributed activity');
assert(app.includes('function reportedLikeEvidence()')&&
       app.includes('likes ≠ unique viewers'),
  'Constellation must distinguish like units, notifications, and distinct accounts');
assert(app.includes('reported like units (')&&app.includes('HOST is not a viewer'),
  'Live like ticker and graph must explain account/like-batch mismatch');
console.log('SOURCE_ACTIVITY_CONSTELLATION_CONTRACT_PASS '+JSON.stringify({
  source:source.id,seconds:source.duration,accounts:unique.size,
  markers:source.events.length,comments:actual.comments.length,
  actionRecords:actual.interactions.length,
  observedKinds:Object.fromEntries(byKind),originalLinks:source.links.length,
  likeExample:{capture:'nov15-citrus',participants:5,likeUnits:46,
    likeNotifications:6,likingAccounts:4,oneAccount:{notifications:3,units:20}},
  mainSourceASR:{segments:asr.utterances.length,mediaSha256:originalSha,
    model:asr.model,language:asr.language,humanReviewed:false},
  negativeContracts:['empty','truncated','wrong-media-hash','wrong-capture',
    'wrong-video-path','false-clock','false-review','bad-timing',
    'default-mismatch','missing-events'],
  roomSignalsUnpublished:true,mediaEventAlignmentVerified:false
}));
