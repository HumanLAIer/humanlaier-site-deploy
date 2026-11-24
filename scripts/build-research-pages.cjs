#!/usr/bin/env node
'use strict';
// Build ONLY the independent nine-ticker / Streaming Lab research surfaces
// for the research acceptance suite. The full production Pages artifact still
// uses build-pages.cjs, whose default V4 contract is mandatory and fail-closed.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const destination=path.join(root,'.research-build');
if(fs.existsSync(destination))fs.rmSync(destination,{recursive:true,force:true});
const directories=['streaming-demo/nine-tickers','streaming-lab'];
for(const rel of directories){
  const source=path.join(root,rel),target=path.join(destination,rel);
  assert(fs.existsSync(source),'Research source missing: '+rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(source,target,{
    recursive:true,force:false,errorOnExist:true,dereference:false,
    filter:file=>{
      if(fs.lstatSync(file).isSymbolicLink())
        throw Error('Research artifact refuses symbolic links: '+file);
      return !/(^|\/)(?:node_modules|\.private)(\/|$)/.test(
        path.relative(root,file).split(path.sep).join('/'));
    }
  });
}
// The research page shares ONLY the published wordmark with V4; copy that
// precise image, not the V4 media, transcripts, data or app.
for(const rel of ['streaming-demo/assets/human-laier-dark.svg']){
  const source=path.join(root,rel),target=path.join(destination,rel);
  assert(fs.existsSync(source),'Shared research logo missing: '+rel);
  assert(!fs.lstatSync(source).isSymbolicLink(),'Research logo cannot be a symlink');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}
for(const rel of [
  'streaming-demo/assets/human-laier-dark.svg',
  'streaming-demo/nine-tickers/index.html',
  'streaming-demo/nine-tickers/app.js',
  'streaming-demo/nine-tickers/styles.css',
  'streaming-demo/nine-tickers/comparison.json',
  'streaming-demo/nine-tickers/video-manifest.json',
  'streaming-demo/nine-tickers/commercial-180.mp4',
  'streaming-demo/nine-tickers/commercial-180.mp3',
  'streaming-lab/index.html',
  'streaming-lab/lab.js','streaming-lab/lab.css','streaming-lab/catalogue-review.json',
  'streaming-lab/ten-tickers-nov22/index.html','streaming-lab/ten-tickers-nov22/app.js','streaming-lab/ten-tickers-nov22/styles.css','streaming-lab/ten-tickers-nov22/comparison.json','streaming-lab/ten-tickers-nov22/export-manifest.json','streaming-lab/ten-tickers-nov22/dialogue-1.wav','streaming-lab/ten-tickers-nov22/dialogue-2.wav','streaming-lab/ten-tickers-nov22/dialogue-3.wav',
  'streaming-lab/nine-tickers-nov22/index.html','streaming-lab/nine-tickers-nov22/video-manifest.json','streaming-lab/nine-tickers-nov22/part-1.mp4','streaming-lab/nine-tickers-nov22/part-2.mp4','streaming-lab/nine-tickers-nov22/part-3.mp4'
])assert(fs.existsSync(path.join(destination,rel)),
  'Research acceptance missing source asset: '+rel);
assert(!fs.existsSync(path.join(destination,'streaming-demo/app.js')),
  'Independent research QA must not depend on the client V4 demo');
assert(!fs.existsSync(path.join(destination,'streaming-demo/assets/nov17-participation-asr.json')),
  'Research QA must not depend on the client host transcript');
console.log('INDEPENDENT_RESEARCH_ARTIFACT_READY '+JSON.stringify({
  output:'.research-build',products:directories,
  originalVideoBytes:fs.statSync(path.join(destination,
    'streaming-demo/nine-tickers/commercial-180.mp4')).size
}));
