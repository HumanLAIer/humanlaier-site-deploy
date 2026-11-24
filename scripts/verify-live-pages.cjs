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
 for(const name of ['index.html','streaming-demo/index.html','streaming-demo/app.js',
   'streaming-demo/featured-bootstrap.js','streaming-demo/nine-tickers/comparison.json',
   'streaming-demo/participation-source-asr.js','streaming-demo/assets/nov17-participation-asr.json',
   'streaming-lab/index.html','streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
   'streaming-demo/assets/nov17-participation.mp4']){
   const x=await get('/'+name);
   assert.equal(x.status,200,'Missing production file: '+name);
   assert.equal(x.bytes.length,m.assets[name].bytes,'Wrong production asset size: '+name);
   assert.equal(sha(x.bytes),m.assets[name].sha256,'Stale production asset: '+name);
 }
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
