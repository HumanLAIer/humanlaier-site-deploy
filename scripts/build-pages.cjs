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
  'streaming-lab/index.html','streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
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
for(const item of required)
  if(!fs.existsSync(path.join(dest,item)))throw Error('Missing deployed asset: '+item);
assert.equal(fs.readFileSync(path.join(dest,'CNAME'),'utf8').trim(),'humanlaier.com');
// A new release always gets a new JavaScript/CSS URL, even when the source
// HTML or its fixed historical query strings are unchanged.
for(const page of ['index.html','thanks.html','streaming-demo/index.html',
                   'streaming-demo/nine-tickers/index.html','streaming-lab/index.html',
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
const checks={};
for(const asset of ['index.html','streaming-demo/index.html',
  'streaming-demo/ux.css','streaming-demo/app.js','streaming-demo/featured-bootstrap.js',
  'streaming-demo/participation-source-asr.js',
  'streaming-demo/assets/nov17-participation-asr.json',
  'streaming-demo/nine-tickers/comparison.json',
  'streaming-lab/index.html','streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
  'streaming-demo/nine-tickers/video-manifest.json',
  'streaming-demo/nine-tickers/commercial-180.mp4',
  'streaming-demo/nine-tickers/commercial-180.mp3',
  'streaming-demo/assets/nov17-participation.mp4']){
  const filepath=path.join(dest,asset);
  checks[asset]={sha256:sha(filepath),bytes:fs.statSync(filepath).size};
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
