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
    minSpeechSpanFraction:0.65
  });
  function normalize(raw){
    if(!raw||raw.schema!=='hl-source-asr-public-v1'||
       raw.captureId!==contract.captureId||raw.media!==contract.video||
       raw.mediaSha256!==contract.mediaSha256||
       !Number.isFinite(raw.mediaDurationSeconds)||
       raw.mediaDurationSeconds<118||raw.mediaDurationSeconds>122||
       raw.clock!==contract.mediaClock||raw.humanReviewed!==false||
       typeof raw.model!=='string'||
       !/^faster-whisper\/[a-z0-9._-]{2,40}$/.test(raw.model)||
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
    return {rows,sourceSha256:raw.mediaSha256,model:raw.model,
      language:String(raw.language||'unknown'),humanReviewed:false,
      coverageEndSeconds:lastEnd};
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
    review.transcriptMediaSha256=parsed.sourceSha256;
    media.transcript=parsed.rows;
    media.transcriptEvidence=review.transcriptEvidence;
    return {captureId:contract.captureId,segments:parsed.rows.length,
      model:parsed.model,mediaSha256:parsed.sourceSha256,
      humanReviewed:false,calibratedToCollector:false};
  }
  return Object.freeze({contract,normalize,attach});
})();