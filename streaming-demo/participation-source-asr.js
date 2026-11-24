/* Default client-demo source contract: ONE original MP4, its OWN source-local
 * machine transcript, and original independently clocked participant activity.
 * Words, ASR engine and segment boundaries are not hard-coded.
 */
'use strict';
window.HL_PARTICIPATION_ASR=(()=>{
  const contract=Object.freeze({
    schema:'hl-main-showcase-evidence-v1',
    captureId:'nov17-participation',
    video:'assets/nov17-participation.mp4',
    asr:'assets/nov17-participation-asr.json',
    mediaSha256:'a823a0c53babe333e51500dff9f8364bcdd351e3a24868786c8afa519174bfbf',
    mediaClock:'SOURCE_MEDIA_LOCAL_UNCALIBRATED_TO_COLLECTOR',
    minSpeechSpanFraction:0.65,
    defaultTrack:'sing-ctx',
    singlishRevision:'0835ed29d2f8893e4fcf63d5ac531dcb086b6ee1',
    focusedPromptSha256:'1f332bf0ae7df5ac7f6cd4188987ef378dcd96ce6f8f4be94dcac0c6b4e2849d'
  });
  function normalizeTrack(raw){
    // Explicit English recognition, not translation or automatic language
    // detection. Keep the prior accidental Malay output out of the catalogue.
    if(!raw||raw.language!=='en'||raw.languageSelection!=='explicit-en'||
       raw.task!=='transcribe')
      throw Error('Showcase requires explicit English/Singlish transcription, never language autodetection or translation');
    const isSing=raw.model==='singlish-small';
    if(isSing){
      if(raw.trackId!==contract.defaultTrack||
         raw.repository!=='ivabojic/whisper-small-sing2eng-transcribe'||
         raw.revision!==contract.singlishRevision||
         raw.phase!=='focused'||raw.promptSha256!==contract.focusedPromptSha256||
         raw.timingStatus!=='15S_BLOCK_ONLY_NO_VERIFIED_WORD_TIMES'||
         !Array.isArray(raw.blocks)||raw.blocks.length!==8||
         raw.blocks.some((b,i)=>b.index!==i||b.start!==i*15||
           b.end!==(i+1)*15||!/^[a-f0-9]{64}$/.test(b.wavSha256)||
           typeof b.text!=='string'||b.text.length>12000))
        throw Error('Sing/CTX must use the exact pinned nine-ticker focused configuration and source blocks');
      const actual=raw.blocks.filter(b=>b.text.trim()).map(b=>[b.start,b.end,b.text]);
      if(JSON.stringify(actual)!==JSON.stringify(raw.utterances))
        throw Error('Sing/CTX passages must preserve verbatim source-block output');
    }else if(!/^faster-whisper\/[a-z0-9._-]{2,40}$/.test(raw.model||'')||
             !/^[a-z0-9-]{2,50}$/.test(raw.trackId||'')||
             raw.trackId===contract.defaultTrack){
      throw Error('Unrecognized source transcript engine');
    }
    if(!raw||raw.schema!=='hl-source-asr-public-v1'||
       raw.captureId!==contract.captureId||raw.media!==contract.video||
       raw.mediaSha256!==contract.mediaSha256||
       !Number.isFinite(raw.mediaDurationSeconds)||
       raw.mediaDurationSeconds<118||raw.mediaDurationSeconds>122||
       raw.clock!==contract.mediaClock||raw.humanReviewed!==false||
       !Array.isArray(raw.utterances)||raw.utterances.length<2||
       raw.utterances.length>3000)
      throw Error('Default showcase ASR must match its approved original MP4 and evidence clock');
    let lastStart=-1,lastEnd=0,characters=0;
    const rows=[];
    for(const r of raw.utterances){
      if(!Array.isArray(r)||r.length!==3||
         !Number.isFinite(r[0])||!Number.isFinite(r[1])||
         r[0]<0||r[0]<lastStart||r[1]<=r[0]||
         r[1]>raw.mediaDurationSeconds+1||
         typeof r[2]!=='string'||!r[2].trim()||
         r[2].length>24000)
        throw Error('Invalid original source-local ASR passage');
      rows.push([r[0],r[1],r[2]]);
      lastStart=r[0];
      lastEnd=Math.max(lastEnd,r[1]);
      characters+=r[2].trim().length;
    }
    // Two short test snippets in a two-minute video are not a usable host
    // transcript. Coverage is based on time SPAN, not assumed continuous
    // speech, and permits arbitrary future segmentation and wording.
    if(rows[0][0]>raw.mediaDurationSeconds*0.2||
       lastEnd<raw.mediaDurationSeconds*contract.minSpeechSpanFraction||
       characters<32)
      throw Error('Showcase ASR is truncated; recorded source speech coverage is inadequate');
    return {id:raw.trackId,rows,sourceSha256:raw.mediaSha256,model:raw.model,
      label:isSing?'Sing / CTX (default)':raw.model.replace('faster-whisper/','')+' · unprompted',
      language:'en',task:'transcribe',languageSelection:'explicit-en',
      phase:isSing?'focused':'control',
      timingStatus:isSing?'15S_BLOCK_ONLY_NO_VERIFIED_WORD_TIMES':'ASR_SEGMENT_TIMES_UNREVIEWED',
      humanReviewed:false,coverageEndSeconds:lastEnd};
  }
  function normalize(raw){
    const selected=normalizeTrack(raw);
    if(selected.id!==contract.defaultTrack||selected.model!=='singlish-small')
      throw Error('Default showcase engine must remain Sing / CTX');
    if(!Array.isArray(raw.alternatives)||raw.alternatives.length>12)
      throw Error('Invalid same-source transcript catalogue');
    const tracks=[selected,...raw.alternatives.map(normalizeTrack)];
    if(new Set(tracks.map(t=>t.id)).size!==tracks.length)
      throw Error('Duplicate transcript track identity');
    return {...selected,tracks};
  }
  function verifyActivityAndMedia(parsed){
    const d=window.HL_SIGNAL_DATA;
    const original=window.HL_SHOWCASE_DATA;
    const source=original?.sessions?.find(s=>s.id===contract.captureId);
    const session=d?.sessions?.find(s=>s.id===contract.captureId);
    const review=d?.review?.find(r=>r.sid===contract.captureId&&r.video===contract.video);
    const media=source?.media?.find(m=>m.video===contract.video);
    if(d?.defaultSession!==contract.captureId||!source||!session||!media||!review||
       !(Number(media.duration)>118&&Number(media.duration)<122)||
       !Array.isArray(source.events)||!Array.isArray(source.people)||
       !Array.isArray(session.comments)||!Array.isArray(session.interactions)||
       !Array.isArray(d.community?.nodes)||
       source.events.length<1||source.people.length<2||
       session.comments.length<1||session.interactions.length<1||
       session.comments.length+session.interactions.length!==source.events.length||
       Object.keys(session.accountLabels||{}).length!==source.people.length)
      throw Error('Default showcase requires source-matched video, original activity and attributed accounts');
    const recordedAccounts=new Set(source.people.map(p=>p.id));
    const renderedAccounts=new Set(d.community.nodes.map(p=>p[0]));
    if([...recordedAccounts].some(id=>!renderedAccounts.has(id)))
      throw Error('Default showcase Constellation has lost attributed participant evidence');
    if(parsed.rows[0][0]<0||parsed.coverageEndSeconds>Number(media.duration)+1)
      throw Error('Transcript timing incompatible with original source video duration');
    return review;
  }
  function attach(raw){
    const parsed=normalize(raw);
    const review=verifyActivityAndMedia(parsed);
    const source=window.HL_SHOWCASE_DATA.sessions.find(s=>s.id===contract.captureId);
    const media=source.media.find(m=>m.video===contract.video);
    // Apply only after BOTH independent contracts pass; never leave a
    // partially attached speech/matched-video state.
    review.transcript=parsed.rows;
    review.transcriptEvidence='SAME_SOURCE_MACHINE_ASR_UNREVIEWED';
    review.transcriptModel=parsed.model;
    review.transcriptTrackId=parsed.id;
    review.transcriptDefaultTrack=parsed.id;
    review.transcriptTracks=parsed.tracks;
    review.transcriptLanguage=parsed.language;
    review.transcriptTimingStatus=parsed.timingStatus;
    review.transcriptMediaSha256=parsed.sourceSha256;
    media.transcript=parsed.rows;
    media.transcriptEvidence=review.transcriptEvidence;
    return {captureId:contract.captureId,segments:parsed.rows.length,
      model:parsed.model,mediaSha256:parsed.sourceSha256,
      trackId:parsed.id,language:parsed.language,task:parsed.task,
      tracks:parsed.tracks.map(t=>({id:t.id,model:t.model,segments:t.rows.length})),
      humanReviewed:false,calibratedToCollector:false};
  }
  return Object.freeze({contract,normalize,attach});
})();