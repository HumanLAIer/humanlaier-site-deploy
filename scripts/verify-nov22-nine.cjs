#!/usr/bin/env node
'use strict';
// Offline exact-media and unchanged historical-study contracts. No model calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'streaming-lab/nine-tickers-nov22');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const d=JSON.parse(fs.readFileSync(path.join(dir,'comparison.json')));
const ids=['production-base.en','singlish-small','coats-large-v2'].flatMap(m=>['control','compact','focused'].map(p=>m+'--'+p)).sort();
const eqKeys=o=>assert.deepEqual(Object.keys(o).sort(),ids);
assert.equal(d.schema,'hl-nov22-nine-public-v1');assert.equal(d.sessionId,'20261122T205428_176734Z_huatzaitcg');
assert.equal(d.sourceManifestSha256,'8594e0d859723075454531cbc11ada7d7bc93f51d83ff31ae595bff73ff77a4a');
assert.equal(d.reviewSha256,'e25445ab9fdb10c9e080013d9e0d131243661104a21e03f649975c697e0eeebb');
assert.equal(d.originalManifestSha256,'7c298edc8490246fc5461f9332e5161f188c16dd16cec40829d65bcd3ff94e6b');
assert.equal(d.humanAccuracyVerified,false);assert.equal(d.formalBenchmarkEligible,false);assert.equal(d.wordTelemetryAvailable,false);assert.equal(d.audioLosslessVerified,true);assert.equal(d.sampleRate,16000);
assert.equal(d.clips.length,43);assert.equal(d.parts.length,3);assert.deepEqual(d.lanes.map(x=>x.lane).sort(),ids);
eqKeys(d.summary);
let frames=0,rows=0;
const orig=['b7c3ab99be789c6e76752dd2a92813477000ce14b4aac7f489d29defa11192b4','cdf7c1245b2e2ef2ceb3c668dfdad04a8468b2752eaeded1c482a1aea2dd5827','2780fb944f50ce8ce117b7a1cc226baa9163b0d4ad572d3caa790adeee8ef988'];
function wav(pcm){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm])}
for(const [i,p] of d.parts.entries()){
 assert.equal(p.file,'part-'+(i+1)+'.flac');assert.equal(p.originalSha256,orig[i]);assert.equal(p.duration,p.frames/16000);
 const file=path.join(dir,p.file),media=fs.readFileSync(file);assert.equal(media.length,p.bytes);assert.equal(sha(media),p.sha256);
 const decoded=cp.spawnSync('ffmpeg',['-v','error','-i',file,'-f','s16le','-acodec','pcm_s16le','-ar','16000','-ac','1','pipe:1'],{maxBuffer:24*1024*1024,timeout:60000});
 assert.equal(decoded.status,0,String(decoded.stderr));assert.equal(decoded.stdout.length,p.frames*2);assert.equal(sha(decoded.stdout),p.pcmSha256);
 let end=0;
 for(const c of d.clips.filter(c=>c.sourcePart===p.part)){assert.equal(c.id,'clip'+String(rows).padStart(3,'0'));rows++;assert.equal(c.startFrame,end);assert.equal(c.frames,c.endFrame-c.startFrame);assert.equal(c.startSec,c.startFrame/16000);assert.equal(c.endSec,c.endFrame/16000);assert.equal(sha(wav(decoded.stdout.subarray(c.startFrame*2,c.endFrame*2))),c.wavSha256);eqKeys(c.texts);eqKeys(c.candidates);assert(c.representative.endsWith('--control'));
 for(const id of ids){assert.equal(typeof c.texts[id],'string');for(const e of c.candidates[id]){assert(e.start>=0&&e.end>e.start);assert.equal(Array.from(c.texts[id]).slice(e.start,e.end).join(''),e.original);}}
 end=c.endFrame;
 }assert.equal(end,p.frames);frames+=end;
}
assert.equal(rows,43);assert.equal(frames/16000,d.audioSeconds);assert.equal(frames,10042710);
assert.equal(sha(fs.readFileSync(path.join(root,'streaming-demo/nine-tickers/comparison.json'))),'141f0c9ee47f7c49d5bc1f546814fff12c740de69f59dde27c23bdd85f8178be');
assert.equal(sha(fs.readFileSync(path.join(root,'streaming-demo/nine-tickers/commercial-180.mp4'))),'9fdbdff777391886cfc39b220a053f3e10a49dd72454fe14d7443aacc0176f92');
assert(fs.readFileSync(path.join(root,'streaming-lab/index.html'),'utf8').includes('./nine-tickers-nov22/'));
console.log('NOV22_NINE_EXACT_CONTRACT_PASS '+JSON.stringify({clips:rows,outputs:rows*9,frames,seconds:frames/16000,losslessParts:3,originalStudyPreserved:true,comparisonSha256:sha(fs.readFileSync(path.join(dir,'comparison.json')))}));
