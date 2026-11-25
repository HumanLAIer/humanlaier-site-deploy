#!/usr/bin/env node
'use strict';
// Post-deploy public HTTPS smoke. Distinguishes "artifact published" from
// "this exact commit and its source/video assets reached production".
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const root=(process.env.HL_PAGES_PUBLIC_ORIGIN||'https://humanlaier.com').replace(/\/+$/,'');
const commit=(process.env.GITHUB_SHA||'').trim();
assert.match(commit,/^[a-f0-9]{40}$/,'Expected complete tested Git commit SHA');
const retryMs=Number(process.env.HL_PAGES_PROPAGATION_MS||180000);
const until=Date.now()+retryMs;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path,headers={}){
 const url=root+path+(path.includes('?')?'&':'?')+'release_check='+commit.slice(0,16);
 const resp=await fetch(url,{headers:{'Cache-Control':'no-cache',
   'User-Agent':'HumanLAIer-CI-Production-Release-Verification',...headers},
   signal:AbortSignal.timeout(25000),redirect:'follow'});
 return {status:resp.status,headers:resp.headers,bytes:Buffer.from(await resp.arrayBuffer())};
}
async function verify(){
 const manifestResp=await get('/release.json');
 assert.equal(manifestResp.status,200,'Production release.json must be visible');
 const m=JSON.parse(manifestResp.bytes.toString('utf8'));
 assert.equal(m.schema,'hl-pages-release-v1');
 assert.equal(m.commit,commit,'A different commit is live; not claiming this release');
 assert.equal(m.domain,'humanlaier.com');
 for(const name of ['index.html','streaming-demo/index.html','streaming-demo/ux.css','streaming-demo/app.js',
   'streaming-demo/featured-bootstrap.js','streaming-demo/nine-tickers/comparison.json',
   'streaming-demo/participation-source-asr.js','streaming-demo/assets/nov17-participation-asr.json',
   'streaming-demo/manual-review/index.html','streaming-demo/manual-review/review.js','streaming-demo/manual-review/review.css','streaming-demo/manual-review/review-data.json','streaming-demo/manual-review/configurations.json',
   'streaming-lab/index.html','streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
   'streaming-lab/nine-tickers-nov22/index.html','streaming-lab/nine-tickers-nov22/app.js',
   'streaming-lab/nine-tickers-nov22/styles.css','streaming-lab/nine-tickers-nov22/comparison.json',
   'streaming-lab/nine-tickers-nov22/part-1.flac','streaming-lab/nine-tickers-nov22/part-2.flac',
   'streaming-lab/nine-tickers-nov22/part-3.flac',
  'streaming-lab/nine-tickers-nov22/video-manifest.json','streaming-lab/nine-tickers-nov22/part-1.mp4','streaming-lab/nine-tickers-nov22/part-2.mp4','streaming-lab/nine-tickers-nov22/part-3.mp4',
  'streaming-lab/ten-tickers-nov22/index.html','streaming-lab/ten-tickers-nov22/app.js','streaming-lab/ten-tickers-nov22/styles.css','streaming-lab/ten-tickers-nov22/comparison.json','streaming-lab/ten-tickers-nov22/export-manifest.json','streaming-lab/ten-tickers-nov22/dialogue-1.wav','streaming-lab/ten-tickers-nov22/dialogue-2.wav','streaming-lab/ten-tickers-nov22/dialogue-3.wav',
  'streaming-lab/coats-guarded-nov22/index.html','streaming-lab/coats-guarded-nov22/app.js','streaming-lab/coats-guarded-nov22/styles.css','streaming-lab/coats-guarded-nov22/paired-results.json',
  'streaming-lab/speaker-roles-nov22/index.html','streaming-lab/speaker-roles-nov22/app.js','streaming-lab/speaker-roles-nov22/styles.css','streaming-lab/speaker-roles-nov22/role-data.json',
  'streaming-lab/speaker-roles-persistent-nov22/index.html','streaming-lab/speaker-roles-persistent-nov22/app.js','streaming-lab/speaker-roles-persistent-nov22/replay.js','streaming-lab/speaker-roles-persistent-nov22/styles.css',
  'streaming-lab/dsp-analysis-nov22/index.html','streaming-lab/dsp-analysis-nov22/app.js','streaming-lab/dsp-analysis-nov22/timing.js','streaming-lab/dsp-analysis-nov22/styles.css','streaming-lab/dsp-analysis-nov22/comparison.json','streaming-lab/dsp-analysis-nov22/evidence.json',
  'streaming-lab/architecture-decision-nov22/index.html','streaming-lab/architecture-decision-nov22/app.js','streaming-lab/architecture-decision-nov22/styles.css','streaming-lab/architecture-decision-nov22/comparison.json','streaming-lab/architecture-decision-nov22/export-manifest.json','streaming-lab/architecture-decision-nov22/listen-B-1.flac','streaming-lab/architecture-decision-nov22/listen-B-2.flac','streaming-lab/architecture-decision-nov22/listen-B-3.flac','streaming-lab/architecture-decision-nov22/listen-C-1.flac','streaming-lab/architecture-decision-nov22/listen-C-2.flac','streaming-lab/architecture-decision-nov22/listen-C-3.flac','streaming-lab/architecture-decision-nov22/listen-D-1.flac','streaming-lab/architecture-decision-nov22/listen-D-2.flac','streaming-lab/architecture-decision-nov22/listen-D-3.flac','streaming-lab/architecture-decision-nov22/listen-E-1.flac','streaming-lab/architecture-decision-nov22/listen-E-2.flac','streaming-lab/architecture-decision-nov22/listen-E-3.flac','streaming-lab/architecture-decision-nov22/listen-F-1.flac','streaming-lab/architecture-decision-nov22/listen-F-2.flac','streaming-lab/architecture-decision-nov22/listen-F-3.flac','streaming-lab/architecture-decision-nov22/listen-G-1.flac','streaming-lab/architecture-decision-nov22/listen-G-2.flac','streaming-lab/architecture-decision-nov22/listen-G-3.flac','streaming-lab/architecture-decision-nov22/listen-H-1.flac','streaming-lab/architecture-decision-nov22/listen-H-2.flac','streaming-lab/architecture-decision-nov22/listen-H-3.flac','streaming-lab/architecture-decision-nov22/listen-gate-1.flac','streaming-lab/architecture-decision-nov22/listen-gate-2.flac','streaming-lab/architecture-decision-nov22/listen-gate-3.flac',
  'streaming-demo/nine-tickers/styles.css','streaming-demo/assets/nov17-participation.mp4']){
   const x=await get('/'+name);
   assert.equal(x.status,200,'Missing production file: '+name);
   assert.equal(x.bytes.length,m.assets[name].bytes,'Wrong production asset size: '+name);
   assert.equal(sha(x.bytes),m.assets[name].sha256,'Stale production asset: '+name);
 }
 const dsp=await get('/streaming-lab/dsp-analysis-nov22/audio-inputs.json');
 assert.equal(dsp.status,200);assert.equal(sha(dsp.bytes),m.assets['streaming-lab/dsp-analysis-nov22/audio-inputs.json'].sha256);
 const di=JSON.parse(dsp.bytes);assert.equal(di.schema,'hl-packed-dsp-inputs-v1');assert.equal(di.verifiedCells,210);
 for(const a of Object.values(di.assets)){const k='streaming-lab/dsp-analysis-nov22/'+a.file;assert.equal(m.assets[k].sha256,a.sha256);assert.equal(m.assets[k].bytes,a.bytes)}
 // Browser smoke verifies actual selected input bytes and decoded float32 hashes.
 // Public release must contain a complete default demo, not merely an
 // HTTP 200 for some transcript file. The runtime and CI share source IDs.
 const showcase=m.primaryShowcase;
 assert.equal(showcase?.captureId,'nov17-participation');
 assert.equal(showcase?.media,'assets/nov17-participation.mp4');
 assert(showcase.transcriptPassages>=2,'Public release has missing default host transcript');
 assert.equal(showcase.humanReviewed,false);
 assert.equal(showcase.collectorClockCalibrated,false);
 assert.equal(showcase.mediaSha256,
   m.assets['streaming-demo/assets/nov17-participation.mp4'].sha256);
 const sourceAsr=await get('/streaming-demo/assets/nov17-participation-asr.json');
 assert.equal(sourceAsr.status,200);
 const asr=JSON.parse(sourceAsr.bytes.toString('utf8'));
 assert.equal(asr.mediaSha256,showcase.mediaSha256);
 assert.equal(asr.captureId,showcase.captureId);
 assert.equal(asr.utterances.length,showcase.transcriptPassages);
 assert.equal(asr.trackId,'sing-ctx');
 assert.equal(asr.model,'singlish-small');
 assert.equal(asr.language,'en');
 assert.equal(asr.task,'transcribe');
 assert.equal(asr.languageSelection,'explicit-en');
 assert.equal(asr.revision,'0835ed29d2f8893e4fcf63d5ac531dcb086b6ee1');
 assert.equal(asr.promptSha256,'1f332bf0ae7df5ac7f6cd4188987ef378dcd96ce6f8f4be94dcac0c6b4e2849d');
 assert.equal(showcase.transcriptTrack,asr.trackId);
 assert.equal(showcase.transcriptLanguage,asr.language);
 assert.equal(showcase.transcriptTask,asr.task);
 assert.equal(showcase.transcriptRevision,asr.revision);
 assert.equal(showcase.transcriptPromptSha256,asr.promptSha256);
 assert.deepEqual(showcase.transcriptTracks,[asr,...asr.alternatives].map(t=>({
   id:t.trackId,model:t.model,passages:t.utterances.length
 })));
 const home=await get('/');
 assert.equal(home.status,200);
 assert(home.bytes.toString('utf8').includes('humanlaier'),
   'Public homepage is unexpectedly not the company website');
 const video=await get('/streaming-demo/nine-tickers/commercial-180.mp4',
   {Range:'bytes=0-31'});
 assert.equal(video.status,206,'CDN must support MP4 HTTP Range seeking');
 assert.equal(video.bytes.length,32,'Unexpected MP4 range length');
 assert.equal(video.bytes.toString('ascii',4,8),'ftyp','Wrong MP4 source bytes');
 assert.match(video.headers.get('content-range')||'',/^bytes 0-31\/\d+$/);
 for(let i=1;i<=3;i++){
   const audio=await get('/streaming-lab/nine-tickers-nov22/part-'+i+'.flac',{Range:'bytes=0-31'});
   assert.equal(audio.status,206,'FLAC range seeking unavailable');
   assert.equal(audio.bytes.length,32);
   assert.equal(audio.bytes.toString('ascii',0,4),'fLaC');
   assert.match(audio.headers.get('content-range')||'',/^bytes 0-31\/\d+$/);
   const mp4=await get('/streaming-lab/nine-tickers-nov22/part-'+i+'.mp4',{Range:'bytes=0-31'});
   assert.equal(mp4.status,206,'Nov22 MP4 range seeking unavailable');
   assert.equal(mp4.bytes.length,32);assert.equal(mp4.bytes.toString('ascii',4,8),'ftyp');
   assert.match(mp4.headers.get('content-range')||'',/^bytes 0-31\/\d+$/);
 }
 for(let i=1;i<=3;i++){const a=await get('/streaming-lab/ten-tickers-nov22/dialogue-'+i+'.wav',{Range:'bytes=0-31'});assert.equal(a.status,206);assert.equal(a.bytes.toString('ascii',0,4),'RIFF');}
 for(const k of ['B','C','D','E','F','G','H','gate'])for(let i=1;i<=3;i++){const a=await get('/streaming-lab/architecture-decision-nov22/listen-'+k+'-'+i+'.flac',{Range:'bytes=0-31'});assert.equal(a.status,206,'Architecture FLAC range unavailable');assert.equal(a.bytes.length,32);assert.equal(a.bytes.toString('ascii',0,4),'fLaC');assert.match(a.headers.get('content-range')||'',/^bytes 0-31\/\d+$/);}
 const originalVideo=await get('/streaming-demo/assets/nov17-participation.mp4',
   {Range:'bytes=0-31'});
 assert.equal(originalVideo.status,206,'Original V4 source MP4 must support HTTP byte-range seeking');
 assert.equal(originalVideo.bytes.length,32);
 assert.equal(originalVideo.bytes.toString('ascii',4,8),'ftyp');
 assert.match(originalVideo.headers.get('content-range')||'',/^bytes 0-31\/\d+$/);
 const script=await get('/streaming-demo/featured-evidence.js');
 assert.equal(script.status,200);
 const js=await get('/streaming-demo/featured-bootstrap.js');
 assert.equal(js.status,200);
 assert(js.bytes.toString('utf8').includes("video-manifest.json"),
   'Production video fallback bootstrap absent');
 console.log('PUBLIC_HTTPS_EXACT_COMMIT_PASS '+JSON.stringify({
   root,commit,checks:Object.keys(m.assets).length,
   rangeVideo:'206 bytes 0-31',videoBytes:m.assets['streaming-demo/nine-tickers/commercial-180.mp4'].bytes,
   originalVideoBytes:m.assets['streaming-demo/assets/nov17-participation.mp4'].bytes,
   primarySpeechPassages:showcase.transcriptPassages
 }));
}
(async()=>{
 let attempt=0,last;
 while(Date.now()<until){
   attempt++;
   try{await verify();return;}catch(error){
     last=error;
     console.warn('Public site propagation check '+attempt+': '+error.message);
     await pause(6000);
   }
 }
 console.error('LIVE_RELEASE_VERIFICATION_FAILED',last);
 process.exitCode=1;
})();
