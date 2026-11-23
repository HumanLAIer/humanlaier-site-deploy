/* Source-pinned, transcript-shape-tolerant adapter for existing Signal Recorder V4. */
'use strict';
window.HL_SOURCE_ADAPTER=(()=>{
  const PART_SHA='58e8dd7b568a65203d9a5c204f72f1a3538da58951c7a3f178844547c5fc91de';
  const AUDIO_SHA='ce403fdf33f4bd26f678f3cbedac5a0d8eb2accb620b8e56ce1d45e80962196b';
  const SESSION='20261117T142835_038897Z_huatzaitcg';
  const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
  function normalize(raw){
    if(!raw||raw.schema!=='hl-commercial-nine-public-v1'||!raw.source||
       raw.source.sessionId!==SESSION||raw.source.sourcePart!=='part_000019.ts'||
       raw.source.sourcePartOffsetSeconds!==30||raw.source.sourcePartSha256!==PART_SHA||
       raw.source.audioSha256!==AUDIO_SHA||raw.source.audioFile!=='commercial-180.mp3'||
       raw.source.durationSeconds!==180||!raw.provenance||
       typeof raw.provenance.humanGoldAvailable!=='boolean'||
       typeof raw.provenance.wordTimingsVerified!=='boolean'||
       typeof raw.provenance.eventMediaClockCalibrated!=='boolean')
      throw Error('Original media source or provenance mismatch');
    const duration=raw.source.durationSeconds;
    const input=Array.isArray(raw.transcriptSegments)?raw.transcriptSegments:raw.clips;
    if(!Array.isArray(input)||input.length<1||input.length>2400)
      throw Error('Missing or unbounded source transcript segments');
    const transcriptBlocks=[],supported=new Set();
    for(const r of input){
      if(!r||!finite(r.start)||!finite(r.end)||r.start<0||
         r.end<=r.start||r.end>duration+.05||!r.texts||
         typeof r.texts!=='object'||Array.isArray(r.texts))
        throw Error('Invalid source-local ASR segment timing');
      const texts={};
      for(const [id,value] of Object.entries(r.texts)){
        if(!/^[A-Za-z0-9_.-]{2,80}$/.test(id)||typeof value!=='string'||value.length>24000)
          throw Error('Invalid recorded ASR model output');
        texts[id]=value;supported.add(id);
      }
      if(!Object.keys(texts).length)throw Error('No original output for segment');
      transcriptBlocks.push({start:r.start,end:r.end,texts});
    }
    transcriptBlocks.sort((a,b)=>a.start-b.start||a.end-b.end);
    const modelIds=Array.isArray(raw.lanes)?raw.lanes.map(l=>l&&l.id).filter(x=>supported.has(x)):[];
    const models=[...new Set([...modelIds,...supported])];
    const defaultModel=models.includes('production-base.en--control')?
      'production-base.en--control':models[0];
    const chat=[];
    for(const e of (Array.isArray(raw.chatEvidence)?raw.chatEvidence:[])){
      if(!e||typeof e.actor!=='string'||!/^@[A-Za-z0-9_.]{1,36}$/.test(e.actor)||
         typeof e.text!=='string'||e.text.length>1000||!sha(e.sourceTextSha256))
        throw Error('Invalid source-observed public comment');
      const at=finite(e.estimatedAudioSec)&&e.estimatedAudioSec>=0&&
        e.estimatedAudioSec<duration?e.estimatedAudioSec:null;
      chat.push({handle:e.actor,text:e.text,estimatedAudioSec:at,
        timebase:String(e.timebase||'NOT_CALIBRATED'),sourceTextSha256:e.sourceTextSha256});
    }
    const labels={};
    const names={'production-base.en':'faster-whisper','singlish-small':'Singlish2English',
      'coats-large-v2':'Coats Whisper'};
    for(const id of models){
      const i=id.lastIndexOf('--'),name=i>=0?id.slice(0,i):id;
      labels[id]=(names[name]||name)+' · '+(i>=0?id.slice(i+2):'recorded output');
    }
    let covered=0,latest=0;
    for(const b of transcriptBlocks){
      covered+=Math.max(0,b.end-Math.max(latest,b.start));
      latest=Math.max(latest,b.end);
    }
    const eng=raw.engagement||{};
    return {
      schema:'hl-featured-source-chat-v2',
      source:{sessionId:raw.source.sessionId,sourcePartSha256:raw.source.sourcePartSha256,
        audioSha256:raw.source.audioSha256,
        audioFile:'nine-tickers/'+raw.source.audioFile,durationSeconds:duration,
        recordingDate:raw.source.recordingDate},
      provenance:{humanGoldAvailable:raw.provenance.humanGoldAvailable,
        wordTimingsVerified:raw.provenance.wordTimingsVerified,
        eventMediaClockCalibrated:raw.provenance.eventMediaClockCalibrated},
      counts:{comments:count(eng.comments),deliberateEvents:count(eng.deliberateEvents),
        uniqueActors:count(eng.uniqueActors)},
      transcriptBlocks,chatExcerpts:chat,models,defaultModel,labels,
      coverageSeconds:covered
    };
  }
  return Object.freeze({normalize});
})();