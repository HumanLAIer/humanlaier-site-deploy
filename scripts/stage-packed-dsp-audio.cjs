'use strict';
// Build-only deterministic PCM reconstruction. The browser never needs to
// decode full-clock FLAC or reproduce a floating point DSP calculation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const T=require('../streaming-lab/dsp-analysis-nov22/timing.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function stageDspAudio(root,dest){
 const rel='streaming-lab/dsp-analysis-nov22',out=path.join(dest,rel),data=JSON.parse(fs.readFileSync(path.join(root,rel,'comparison.json')));
 const audioDir=path.join(out,'inputs');fs.mkdirSync(audioDir,{recursive:true});
 const assets={},tracks=new Map();let part=null,total=0,unique=0;
 function load(p,label){
   if(part!==p.part){tracks.clear();part=p.part}
   if(tracks.has(label))return tracks.get(label);
   const t=label==='raw'?p.rawAudio:p.tracks[label],src=path.join(root,'streaming-lab',label==='raw'?'nine-tickers-nov22':'architecture-decision-nov22',t.filename);
   assert.equal(sha(fs.readFileSync(src)),t.sha256);
   const result=cp.spawnSync('flac',['--silent','--decode','--force-raw-format','--endian=little','--sign=signed','--stdout',src],{maxBuffer:32*1024*1024,timeout:30000});
   if(result.error||result.status!==0)throw Error('FLAC decode failed: '+String(result.stderr||result.error));
   const b=result.stdout;assert.equal(b.length,t.frames*2);assert.equal(sha(b),label==='raw'?p.sourcePcmSha256:t.pcmS16Sha256);
   const x=new Float32Array(t.frames);for(let i=0;i<x.length;i++)x[i]=b.readInt16LE(2*i)/32768;
   tracks.set(label,x);return x
 }
 for(const w of data.windows){
  const p=data.parts.find(p=>p.part===w.part),raw=load(p,'raw');
  for(const c of w.cells){
   if(c.status==='not_decoded')continue;
   const spec=T.profiles[c.variant],filtered=spec?load(p,spec[0]):null,x=T.reconstruct(w,c,raw,filtered);
   const f32=Buffer.allocUnsafe(x.length*4),s16=Buffer.allocUnsafe(x.length*2);
   for(let i=0;i<x.length;i++){f32.writeFloatLE(x[i],i*4);const n=x[i]*32768;assert(Number.isInteger(n)&&n>=-32768&&n<=32767);s16.writeInt16LE(n,i*2)}
   assert.equal(sha(f32),c.inputPcmSha256,'Exact PCM mismatch '+w.id+' '+c.variant);assert.equal(x.length,w.inputFrames);total++;
   const key=c.inputPcmSha256;if(assets[key]){assert.equal(assets[key].frames,x.length);continue}
   const packed=zlib.gzipSync(s16,{level:6}),file=key+'.pcmz';
   assert.deepEqual(zlib.gunzipSync(packed),s16);
   fs.writeFileSync(path.join(audioDir,file),packed);
   assets[key]={file:'inputs/'+file,frames:x.length,sha256:sha(packed),bytes:packed.length};unique++;
  }
 }
 const manifest={schema:'hl-packed-dsp-inputs-v1',comparisonSha256:sha(fs.readFileSync(path.join(root,rel,'comparison.json'))),sampleRate:16000,encoding:'gzip signed 16-bit little-endian mono',verifiedCells:total,uniqueInputs:unique,assets};
 fs.writeFileSync(path.join(out,'audio-inputs.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('DSP_INPUT_PCM_PASS '+JSON.stringify({verifiedCells:total,uniqueInputs:unique,compressedBytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0)}));
 return manifest
}
module.exports={stageDspAudio};
