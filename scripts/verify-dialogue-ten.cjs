#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const root=path.resolve(__dirname,'..');
const dir=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'streaming-lab/ten-tickers-nov22');
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const read=name=>fs.readFileSync(path.join(dir,name));
const e=JSON.parse(read('export-manifest.json'));
assert.equal(e.schema,'hl-dialogue-ten-public-export-v1');
assert.equal(e.sourceManifestSha256,'8594e0d859723075454531cbc11ada7d7bc93f51d83ff31ae595bff73ff77a4a');
assert.equal(e.noOriginalMutation,true);assert.equal(e.publicBaselineNotEnriched,true);
assert(hex(e.dialogueManifestSha256));assert(hex(e.reviewSha256));
const expectedFiles=['comparison.json','dialogue-1.wav','dialogue-2.wav','dialogue-3.wav'];
assert.deepEqual(Object.keys(e.files).sort(),expectedFiles.sort());
for(const name of expectedFiles){const b=read(name);assert.equal(b.length,e.files[name].bytes);assert.equal(sha(b),e.files[name].sha256)}
const old=JSON.parse(fs.readFileSync(path.join(root,'streaming-lab/nine-tickers-nov22/comparison.json')));
const d=JSON.parse(read('comparison.json'));
assert.equal(d.schema,'hl-nov22-dialogue-ten-public-v1');assert.equal(d.sessionId,old.sessionId);
assert.equal(d.sourceManifestSha256,old.sourceManifestSha256);assert.equal(d.originalManifestSha256,old.originalManifestSha256);
assert.equal(d.dialogueManifestSha256,e.dialogueManifestSha256);assert.equal(d.reviewSha256,e.reviewSha256);
assert.equal(d.sampleRate,16000);assert.equal(d.audioSeconds,627.669375);assert.equal(d.formalBenchmarkEligible,false);
assert.equal(d.nativeTelemetryRetained,true);assert.equal(d.wordTimingVerified,false);assert.equal(d.humanAccuracyVerified,false);
assert.equal(d.rawControlLane,'stock-whisper--raw');assert.equal(d.laneCount,10);
assert.equal(d.dialogueModelRevision,'22da7d4cd3ea63f9365181008bff1c0d2ab6fb2b');
assert.deepEqual(d.parts,old.parts);
const lanes=old.lanes.map(x=>x.lane).concat(d.rawControlLane).sort();
assert.deepEqual(d.lanes.map(x=>x.lane).sort(),lanes);
for(const l of d.lanes){
 assert(hex(l.receiptSha256));assert(hex(l.revision.padEnd(64,'0')));
 assert.equal(l.rawControl,l.lane===d.rawControlLane);
 assert.equal(l.inputPolicy,l.rawControl?'EXACT_ORIGINAL_PCM':'DBS_TIGER_DIALOGUE_NO_TIME_DELETION');
 if(l.rawControl){assert.equal(l.repo,'Systran/faster-whisper-base.en');assert.equal(l.promptSha256,sha(Buffer.alloc(0)))}
}
assert.equal(d.clips.length,43);
for(const [i,c] of d.clips.entries()){
 const before=old.clips[i];for(const k of ['id','sourcePart','startFrame','endFrame','startSec','endSec','frames','wavSha256'])assert.equal(c[k],before[k]);
 assert(hex(c.dialogueSha256));assert.deepEqual(Object.keys(c.texts).sort(),lanes);assert.deepEqual(Object.keys(c.candidates).sort(),lanes);
 assert.deepEqual(Object.keys(c.nativeTelemetryCoverage).sort(),lanes);
 assert.deepEqual(c.candidates[d.rawControlLane],[]);
 for(const id of lanes){const t=c.texts[id];assert.equal(typeof t,'string');for(const x of c.candidates[id])assert.equal(Array.from(t).slice(x.start,x.end).join(''),x.original)}
}
for(const [i,p] of d.parts.entries()){
 const b=read('dialogue-'+(i+1)+'.wav');assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
 let off=12,fmt,data;while(off+8<=b.length){const id=b.toString('ascii',off,off+4),size=b.readUInt32LE(off+4);if(id==='fmt ')fmt=b.subarray(off+8,off+8+size);if(id==='data')data=b.subarray(off+8,off+8+size);off+=8+size+(size%2)}
 assert(fmt&&data);assert.equal(fmt.readUInt16LE(0),3);assert.equal(fmt.readUInt16LE(2),1);assert.equal(fmt.readUInt32LE(4),16000);assert.equal(fmt.readUInt16LE(14),32);assert.equal(data.length,p.frames*4);
 for(let j=0;j<data.length;j+=4)assert(Number.isFinite(data.readFloatLE(j)),'Nonfinite dialogue sample');
}
console.log('NOV22_DIALOGUE_TEN_CONTRACT_PASS '+JSON.stringify({blocks:43,outputs:430,sourceFrames:d.parts.reduce((n,p)=>n+p.frames,0),nativeTelemetryRetained:true,rawControlUnenriched:true}));
