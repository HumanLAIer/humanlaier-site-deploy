/* Source-local ASR for exact original participation MP4; no event-clock alignment.
 * Data words, utterance count and model language are independent of V4 layout.
 */
'use strict';
window.HL_PARTICIPATION_ASR=(()=>{
  const ID='nov17-participation';
  const FILE='assets/nov17-participation.mp4';
  function normalize(raw){
    if(!raw||raw.schema!=='hl-source-asr-public-v1'||raw.captureId!==ID||
       raw.media!==FILE||typeof raw.mediaSha256!=='string'||
       !/^[0-9a-f]{64}$/.test(raw.mediaSha256)||
       !(typeof raw.mediaDurationSeconds==='number'&&raw.mediaDurationSeconds>118&&raw.mediaDurationSeconds<122)||
       raw.clock!=='SOURCE_MEDIA_LOCAL_UNCALIBRATED_TO_COLLECTOR'||
       raw.humanReviewed!==false||typeof raw.model!=='string'||
       !/^faster-whisper\/[a-z0-9._-]{2,40}$/.test(raw.model)||
       !Array.isArray(raw.utterances)||raw.utterances.length<2||raw.utterances.length>3000)
      throw Error('Source ASR does not match the approved original V4 video');
    let last=-1;
    const rows=[];
    for(const r of raw.utterances){
      if(!Array.isArray(r)||r.length!==3||
         !Number.isFinite(r[0])||!Number.isFinite(r[1])||
         r[0]<0||r[0]<last||r[1]<=r[0]||
         r[1]>raw.mediaDurationSeconds+1||
         typeof r[2]!=='string'||!r[2].trim()||r[2].length>24000)
        throw Error('Invalid original source-local ASR utterance');
      rows.push([r[0],r[1],r[2]]);
      last=r[0];
    }
    return {rows,sourceSha256:raw.mediaSha256,model:raw.model,
      language:String(raw.language||'unknown'),humanReviewed:false};
  }
  function attach(raw){
    const parsed=normalize(raw);
    const d=window.HL_SIGNAL_DATA;
    const review=d?.review?.find(r=>r.sid===ID&&r.video===FILE);
    const orig=window.HL_SHOWCASE_DATA?.sessions?.find(s=>s.id===ID);
    const media=orig?.media?.find(m=>m.video===FILE);
    if(!review||!media||!orig?.events?.length)
      throw Error('Original activity capture and unchanged V4 source video required');
    review.transcript=parsed.rows;
    review.transcriptEvidence='SAME_SOURCE_MACHINE_ASR_UNREVIEWED';
    review.transcriptModel=parsed.model;
    review.transcriptMediaSha256=parsed.sourceSha256;
    media.transcript=parsed.rows;
    media.transcriptEvidence=review.transcriptEvidence;
    return {segments:parsed.rows.length,model:parsed.model,
      mediaSha256:parsed.sourceSha256,calibratedToCollector:false};
  }
  return Object.freeze({normalize,attach});
})();