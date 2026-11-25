#!/usr/bin/env node
'use strict';
// Deterministic, allowlisted static Pages artifact. Keep source and CI files
// out of public output; preserve CNAME, .nojekyll and all existing site assets.
// Release identifiers are generated only in the artifact, never in Git.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dest=path.join(root,'.pages-build');
const allow=['index.html','thanks.html','CNAME','.nojekyll','robots.txt','sitemap.xml',
  'assets','css','js','singlish-compare','streaming-demo','streaming-lab'];
const required=[
  'index.html','CNAME','.nojekyll','streaming-demo/index.html',
  'streaming-demo/app.js','streaming-demo/ux.css',
  'streaming-demo/featured-bootstrap.js','streaming-demo/featured-evidence.js',
  'streaming-demo/participation-source-asr.js',
  'streaming-demo/assets/nov17-participation-asr.json',
  'streaming-demo/nine-tickers/comparison.json',
  'streaming-demo/manual-review/index.html','streaming-demo/manual-review/review.js','streaming-demo/manual-review/review.css','streaming-demo/manual-review/review-data.json',
  'streaming-lab/index.html','streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
  'streaming-lab/nine-tickers-nov22/index.html','streaming-lab/nine-tickers-nov22/app.js','streaming-lab/nine-tickers-nov22/styles.css','streaming-lab/nine-tickers-nov22/comparison.json',
  'streaming-lab/nine-tickers-nov22/part-1.flac','streaming-lab/nine-tickers-nov22/part-2.flac','streaming-lab/nine-tickers-nov22/part-3.flac',
  'streaming-lab/nine-tickers-nov22/video-manifest.json','streaming-lab/nine-tickers-nov22/part-1.mp4','streaming-lab/nine-tickers-nov22/part-2.mp4','streaming-lab/nine-tickers-nov22/part-3.mp4',
  'streaming-lab/ten-tickers-nov22/index.html','streaming-lab/ten-tickers-nov22/app.js','streaming-lab/ten-tickers-nov22/styles.css','streaming-lab/ten-tickers-nov22/comparison.json','streaming-lab/ten-tickers-nov22/export-manifest.json','streaming-lab/ten-tickers-nov22/dialogue-1.wav','streaming-lab/ten-tickers-nov22/dialogue-2.wav','streaming-lab/ten-tickers-nov22/dialogue-3.wav',
  'streaming-lab/coats-guarded-nov22/index.html','streaming-lab/coats-guarded-nov22/app.js','streaming-lab/coats-guarded-nov22/styles.css','streaming-lab/coats-guarded-nov22/paired-results.json',
  'streaming-lab/speaker-roles-nov22/index.html','streaming-lab/speaker-roles-nov22/app.js','streaming-lab/speaker-roles-nov22/styles.css','streaming-lab/speaker-roles-nov22/role-data.json',
  'streaming-lab/speaker-roles-persistent-nov22/index.html','streaming-lab/speaker-roles-persistent-nov22/app.js','streaming-lab/speaker-roles-persistent-nov22/replay.js','streaming-lab/speaker-roles-persistent-nov22/styles.css',
  'streaming-lab/dsp-analysis-nov22/index.html','streaming-lab/dsp-analysis-nov22/app.js','streaming-lab/dsp-analysis-nov22/timing.js','streaming-lab/dsp-analysis-nov22/styles.css','streaming-lab/dsp-analysis-nov22/comparison.json','streaming-lab/dsp-analysis-nov22/evidence.json',
  'streaming-lab/architecture-decision-nov22/index.html','streaming-lab/architecture-decision-nov22/app.js','streaming-lab/architecture-decision-nov22/styles.css','streaming-lab/architecture-decision-nov22/comparison.json','streaming-lab/architecture-decision-nov22/export-manifest.json','streaming-lab/architecture-decision-nov22/listen-B-1.flac','streaming-lab/architecture-decision-nov22/listen-B-2.flac','streaming-lab/architecture-decision-nov22/listen-B-3.flac','streaming-lab/architecture-decision-nov22/listen-C-1.flac','streaming-lab/architecture-decision-nov22/listen-C-2.flac','streaming-lab/architecture-decision-nov22/listen-C-3.flac','streaming-lab/architecture-decision-nov22/listen-D-1.flac','streaming-lab/architecture-decision-nov22/listen-D-2.flac','streaming-lab/architecture-decision-nov22/listen-D-3.flac','streaming-lab/architecture-decision-nov22/listen-E-1.flac','streaming-lab/architecture-decision-nov22/listen-E-2.flac','streaming-lab/architecture-decision-nov22/listen-E-3.flac','streaming-lab/architecture-decision-nov22/listen-F-1.flac','streaming-lab/architecture-decision-nov22/listen-F-2.flac','streaming-lab/architecture-decision-nov22/listen-F-3.flac','streaming-lab/architecture-decision-nov22/listen-G-1.flac','streaming-lab/architecture-decision-nov22/listen-G-2.flac','streaming-lab/architecture-decision-nov22/listen-G-3.flac','streaming-lab/architecture-decision-nov22/listen-H-1.flac','streaming-lab/architecture-decision-nov22/listen-H-2.flac','streaming-lab/architecture-decision-nov22/listen-H-3.flac','streaming-lab/architecture-decision-nov22/listen-gate-1.flac','streaming-lab/architecture-decision-nov22/listen-gate-2.flac','streaming-lab/architecture-decision-nov22/listen-gate-3.flac',
  'streaming-demo/nine-tickers/styles.css',
  'streaming-demo/nine-tickers/video-manifest.json',
  'streaming-demo/nine-tickers/commercial-180.mp4',
  'streaming-demo/nine-tickers/commercial-180.mp3',
  'streaming-demo/assets/nov17-participation.mp4',
  'singlish-compare/index.html',
  'singlish-compare/comparison.json'];
const isTest=relative=>/(^|\/)(?:verify-[^/]+\.cjs|__source-chat-qa[^/]*|\.private|node_modules)(?:\/|$)/.test(relative);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const releaseSha=(process.env.GITHUB_SHA||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()).trim();
assert.match(releaseSha,/^[0-9a-f]{40}$/);
// Even a standalone packaging attempt must reject a comments-only default.
// This check deliberately validates the *source* rather than presence of
// a copied JSON filename. No failed or incomplete showcase reaches Pages.
const evidence=cp.spawnSync(process.execPath,['scripts/verify-recorded-activity.cjs'],{
  cwd:root,encoding:'utf8',timeout:30000
});
if(evidence.error||evidence.status!==0)
  throw Error('Cannot package incomplete source/video/ASR/Constellation evidence: '+
    (evidence.stderr||evidence.stdout||evidence.error?.message||evidence.status));
if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(dest,{recursive:true});
for(const entry of allow){
  const source=path.join(root,entry);
  if(!fs.existsSync(source))throw Error('Required site path missing: '+entry);
  fs.cpSync(source,path.join(dest,entry),{
    recursive:true,force:false,errorOnExist:true,dereference:false,
    filter:sourcePath=>{
      const relative=path.relative(root,sourcePath).split(path.sep).join('/');
      if(relative && isTest(relative))return false;
      if(fs.lstatSync(sourcePath).isSymbolicLink())
        throw Error('Pages artifact refuses symbolic links: '+relative);
      return true;
    }
  });
}
// Editorial previews have their own optional, strict runtime allowlist.
require('./stage-editorial-previews.cjs').stageEditorial(root,dest);
for(const item of required)
  if(!fs.existsSync(path.join(dest,item)))throw Error('Missing deployed asset: '+item);
assert.equal(fs.readFileSync(path.join(dest,'CNAME'),'utf8').trim(),'humanlaier.com');
// A new release always gets a new JavaScript/CSS URL, even when the source
// HTML or its fixed historical query strings are unchanged.
for(const page of ['index.html','thanks.html','streaming-demo/index.html',
                   'streaming-demo/nine-tickers/index.html','streaming-demo/manual-review/index.html','streaming-lab/index.html','streaming-lab/nine-tickers-nov22/index.html','streaming-lab/ten-tickers-nov22/index.html','streaming-lab/coats-guarded-nov22/index.html','streaming-lab/speaker-roles-nov22/index.html','streaming-lab/speaker-roles-persistent-nov22/index.html','streaming-lab/architecture-decision-nov22/index.html','streaming-lab/dsp-analysis-nov22/index.html',
                   'singlish-compare/index.html']){
  const filepath=path.join(dest,page);
  const html=fs.readFileSync(filepath,'utf8').replace(
    /\b(src|href)=(["'])([^"'?#]+?\.(?:js|css))(?:\?[^"'#]*)?\2/g,
    (whole,attr,quote,asset)=>{
      if(/^(?:https?:|\/\/|data:)/i.test(asset))return whole;
      return attr+'='+quote+asset+'?release='+releaseSha.slice(0,12)+quote;
    }
  );
  fs.writeFileSync(filepath,html);
}
// The dynamic source loader inserts app.js itself. Bust that URL as well.
const bootstrap=path.join(dest,'streaming-demo/featured-bootstrap.js');
fs.writeFileSync(bootstrap,fs.readFileSync(bootstrap,'utf8')
  .replace(/app\.js\?v=[a-z0-9_.-]+/g,'app.js?release='+releaseSha.slice(0,12)));
const dspInputs=require('./stage-packed-dsp-audio.cjs').stageDspAudio(root,dest);
const checks={};
for(const asset of ['index.html','streaming-demo/index.html',
  'streaming-demo/ux.css','streaming-demo/app.js','streaming-demo/featured-bootstrap.js',
  'streaming-demo/participation-source-asr.js',
  'streaming-demo/assets/nov17-participation-asr.json',
  'streaming-demo/nine-tickers/comparison.json',
  'streaming-lab/index.html','streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
  'streaming-lab/nine-tickers-nov22/index.html','streaming-lab/nine-tickers-nov22/app.js','streaming-lab/nine-tickers-nov22/styles.css','streaming-lab/nine-tickers-nov22/comparison.json',
  'streaming-lab/nine-tickers-nov22/part-1.flac','streaming-lab/nine-tickers-nov22/part-2.flac','streaming-lab/nine-tickers-nov22/part-3.flac',
  'streaming-lab/nine-tickers-nov22/video-manifest.json','streaming-lab/nine-tickers-nov22/part-1.mp4','streaming-lab/nine-tickers-nov22/part-2.mp4','streaming-lab/nine-tickers-nov22/part-3.mp4',
  'streaming-lab/ten-tickers-nov22/index.html','streaming-lab/ten-tickers-nov22/app.js','streaming-lab/ten-tickers-nov22/styles.css','streaming-lab/ten-tickers-nov22/comparison.json','streaming-lab/ten-tickers-nov22/export-manifest.json','streaming-lab/ten-tickers-nov22/dialogue-1.wav','streaming-lab/ten-tickers-nov22/dialogue-2.wav','streaming-lab/ten-tickers-nov22/dialogue-3.wav',
  'streaming-lab/coats-guarded-nov22/index.html','streaming-lab/coats-guarded-nov22/app.js','streaming-lab/coats-guarded-nov22/styles.css','streaming-lab/coats-guarded-nov22/paired-results.json',
  'streaming-lab/speaker-roles-nov22/index.html','streaming-lab/speaker-roles-nov22/app.js','streaming-lab/speaker-roles-nov22/styles.css','streaming-lab/speaker-roles-nov22/role-data.json',
  'streaming-lab/speaker-roles-persistent-nov22/index.html','streaming-lab/speaker-roles-persistent-nov22/app.js','streaming-lab/speaker-roles-persistent-nov22/replay.js','streaming-lab/speaker-roles-persistent-nov22/styles.css',
  'streaming-lab/dsp-analysis-nov22/index.html','streaming-lab/dsp-analysis-nov22/app.js','streaming-lab/dsp-analysis-nov22/timing.js','streaming-lab/dsp-analysis-nov22/styles.css','streaming-lab/dsp-analysis-nov22/comparison.json','streaming-lab/dsp-analysis-nov22/evidence.json',
  'streaming-lab/architecture-decision-nov22/index.html','streaming-lab/architecture-decision-nov22/app.js','streaming-lab/architecture-decision-nov22/styles.css','streaming-lab/architecture-decision-nov22/comparison.json','streaming-lab/architecture-decision-nov22/export-manifest.json','streaming-lab/architecture-decision-nov22/listen-B-1.flac','streaming-lab/architecture-decision-nov22/listen-B-2.flac','streaming-lab/architecture-decision-nov22/listen-B-3.flac','streaming-lab/architecture-decision-nov22/listen-C-1.flac','streaming-lab/architecture-decision-nov22/listen-C-2.flac','streaming-lab/architecture-decision-nov22/listen-C-3.flac','streaming-lab/architecture-decision-nov22/listen-D-1.flac','streaming-lab/architecture-decision-nov22/listen-D-2.flac','streaming-lab/architecture-decision-nov22/listen-D-3.flac','streaming-lab/architecture-decision-nov22/listen-E-1.flac','streaming-lab/architecture-decision-nov22/listen-E-2.flac','streaming-lab/architecture-decision-nov22/listen-E-3.flac','streaming-lab/architecture-decision-nov22/listen-F-1.flac','streaming-lab/architecture-decision-nov22/listen-F-2.flac','streaming-lab/architecture-decision-nov22/listen-F-3.flac','streaming-lab/architecture-decision-nov22/listen-G-1.flac','streaming-lab/architecture-decision-nov22/listen-G-2.flac','streaming-lab/architecture-decision-nov22/listen-G-3.flac','streaming-lab/architecture-decision-nov22/listen-H-1.flac','streaming-lab/architecture-decision-nov22/listen-H-2.flac','streaming-lab/architecture-decision-nov22/listen-H-3.flac','streaming-lab/architecture-decision-nov22/listen-gate-1.flac','streaming-lab/architecture-decision-nov22/listen-gate-2.flac','streaming-lab/architecture-decision-nov22/listen-gate-3.flac',
  'streaming-demo/nine-tickers/styles.css',
  'streaming-demo/nine-tickers/video-manifest.json',
  'streaming-demo/nine-tickers/commercial-180.mp4',
  'streaming-demo/nine-tickers/commercial-180.mp3',
  'streaming-demo/assets/nov17-participation.mp4']){
  const filepath=path.join(dest,asset);
  checks[asset]={sha256:sha(filepath),bytes:fs.statSync(filepath).size};
}
for(const name of ['audio-inputs.json',...Object.values(dspInputs.assets).map(a=>a.file)]){
 const rel='streaming-lab/dsp-analysis-nov22/'+name,filename=path.join(dest,rel);
 checks[rel]={sha256:sha(filename),bytes:fs.statSync(filename).size};
}
const originalMedia=checks['streaming-demo/assets/nov17-participation.mp4'];
const originalAsr=JSON.parse(fs.readFileSync(
  path.join(dest,'streaming-demo/assets/nov17-participation-asr.json'),'utf8'));
assert.equal(originalAsr.mediaSha256,originalMedia.sha256,
  'Original source video hash must match original source ASR at package time');
const manifest={schema:'hl-pages-release-v1',repository:'HumanLAIer/humanlaier-site-deploy',
  commit:releaseSha,domain:'humanlaier.com',builtAt:new Date().toISOString(),
  sourceAudioVideoClockCalibrated:false,
  primaryShowcase:{
    captureId:originalAsr.captureId,media:originalAsr.media,
    mediaSha256:originalMedia.sha256,
    transcriptPassages:originalAsr.utterances.length,
    transcriptModel:originalAsr.model,transcriptTrack:originalAsr.trackId,
    transcriptLanguage:originalAsr.language,transcriptTask:originalAsr.task,
    transcriptRevision:originalAsr.revision,transcriptPromptSha256:originalAsr.promptSha256,
    transcriptTracks:[originalAsr,...originalAsr.alternatives].map(t=>({
      id:t.trackId,model:t.model,passages:t.utterances.length
    })),
    humanReviewed:false,collectorClockCalibrated:false
  },
  assets:checks};
fs.writeFileSync(path.join(dest,'release.json'),JSON.stringify(manifest,null,2)+'\n');
assert(!fs.existsSync(path.join(dest,'.github')));
assert(!fs.existsSync(path.join(dest,'scripts')));
assert(!fs.existsSync(path.join(dest,'streaming-demo/verify-featured-chat.cjs')));
assert(!fs.existsSync(path.join(dest,'streaming-demo/verify-source-chat-browser.cjs')));
console.log('PAGES_ARTIFACT_READY '+JSON.stringify({commit:releaseSha,
  output:'.pages-build',expectedAssets:Object.keys(checks).length,
  videoBytes:checks['streaming-demo/nine-tickers/commercial-180.mp4'].bytes}));
