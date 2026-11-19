/* Public V4 Signal Recorder adapter.
 * Restores the original working analysis UI without publishing raw platform UIDs,
 * HMAC-only captures, or unavailable room logs. The public handle-safe package
 * (data.js) remains unchanged and is the single source of truth.
 */
'use strict';
(() => {
  const P = window.HL_SHOWCASE_DATA;
  if (!P || P.schema !== 'hl-public-handle-showcase-v1' ||
      !P.privacy?.publicEdition || !P.privacy?.rawPlatformIdentifiersExcluded ||
      !P.privacy?.noHistoricHMAC || !P.privacy?.directHandleCapturesOnly ||
      !Array.isArray(P.sessions) || !P.sessions.length) {
    return;
  }
  const sessions = [];
  const reviews = [];
  const communityNodes = new Map();
  const communityEdges = [];
  const alignmentBySession = {};
  const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);
  const safeSecond = v => isFiniteNumber(v) && v >= 0 ? v : 0;
  for (const s of P.sessions) {
    if (!s || !Array.isArray(s.people) || !Array.isArray(s.events) ||
        !Array.isArray(s.media) || !s.people.length || !s.media.length) {
      return;
    }
    const labels = Object.create(null);
    for (const p of s.people) {
      const isObservedPublicHandle = p && typeof p.handle === 'string' &&
        /^@[A-Za-z0-9_.]{1,36}$/.test(p.handle);
      // The November 17-18 curated export uses the ORIGINAL public TikTok
      // handle as its stable graph key; no invented Viewer 001 aliases.
      // Retain compatibility with the vetted November 15 site's old opaque
      // internal keys until it is intentionally retired.
      if (!isObservedPublicHandle || !(
          p.id === p.handle || /^account-[0-9]{4,}$/.test(p.id))) {
        return;
      }
      labels[p.id] = p.handle;
      const prior = communityNodes.get(p.id);
      // Same observed handle across two real recordings means the same
      // PLATFORM ACCOUNT label, not an inferred real-world person. Aggregate
      // observations without creating edges between separate broadcasts.
      communityNodes.set(p.id, [
        p.id, (prior?.[1]||0) + (Number(p.comments)||0), 1, 1,
        (prior?.[4]||0) + (Number(p.gifts)||0),
        (prior?.[5]||0) + (Number(p.activeMinutes)||0)
      ]);
    }
    const comments = [];
    const interactions = [];
    for (const row of s.events) {
      if (!Array.isArray(row) || row.length < 4 ||
          !isFiniteNumber(row[0]) || row[0] < 0) continue;
      const time = row[0], kind = row[1];
      const actor = Object.prototype.hasOwnProperty.call(labels,row[2]) ? row[2] : null;
      if (kind === 'comment') {
        comments.push([time,actor,typeof row[4] === 'string'?row[4]:'']);
      } else if (typeof kind === 'string' && /^[a-z][a-z_]{1,48}$/.test(kind)) {
        const details = row[4] && typeof row[4] === 'object' &&
          !Array.isArray(row[4]) ? row[4] : {};
        interactions.push([time,kind,actor,
          isFiniteNumber(row[3])&&row[3]>0?row[3]:0,details]);
      }
    }
    const sourceMap = new Map();
    for (const m of s.media) {
      // The approved public export may have authentic poster stills while
      // separately approved MP4 binaries are unavailable. Never discard the
      // entire event archive merely because the media transfer is pending.
      if (!m || typeof m.key !== 'string' ||
          !/^[a-zA-Z0-9_-]{2,96}$/.test(m.key) ||
          (m.video && !/^assets\/[a-zA-Z0-9._-]+\.mp4$/i.test(m.video)) ||
          (m.audio && !/^assets\/[a-zA-Z0-9._-]+\.mp3$/i.test(m.audio)) ||
          (m.poster && !/^assets\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png)$/i.test(m.poster)) ||
          !(m.video || m.audio || m.poster)) continue;
      const preview = {
        key:m.key, sid:s.id,
        title:typeof m.title === 'string'?m.title:'Original media excerpt',
        video:m.video||null, audio:m.audio||null,
        poster:m.poster||null, storyboard:m.storyboard||null,
        videoStartMediaSec:safeSecond(m.start),
        videoDurationSec:safeSecond(m.duration),
        audioStartMediaSec:m.audio?safeSecond(m.start):null,
        audioDurationSec:m.audio?safeSecond(m.duration):null,
        mediaStitchGeneration:Number.isInteger(m.generation)?m.generation:null,
        mediaClockStatus:typeof m.mediaClockStatus==='string'?
          m.mediaClockStatus:'UNCALIBRATED_INDEPENDENT_SOURCE',
        transcript:Array.isArray(m.transcript)?m.transcript.filter(r=>
          Array.isArray(r)&&r.length>=3&&isFiniteNumber(r[0])&&
          isFiniteNumber(r[1])&&typeof r[2]==='string').map(r=>
            [r[0],r[1],r[2]]):[],
        transcriptEvidence:m.transcriptEvidence||'UNVERIFIED_MACHINE_SPEECH'
      };
      sourceMap.set(m.key,preview);
      reviews.push(preview);
    }
    if (!sourceMap.size) return;
    const shoutouts = (s.shoutouts||[]).filter(e=>
      e?.kind==='host_shoutout_candidate' &&
      Object.prototype.hasOwnProperty.call(labels,e.actor) &&
      sourceMap.has(e.sourceKey)
    ).map(e=>({
      id:String(e.id||''),
      kind:'host_shoutout_candidate',
      derivation:'DERIVED_ASR_MENTION_NOT_PLATFORM_EVENT',
      reviewStatus:'CANDIDATE_ASR_UNVERIFIED',
      speakerStatus:'SPEAKER_NOT_VERIFIED',
      matchStatus:String(e.matchStatus||'UNVERIFIED_ALIAS'),
      sourceKey:e.sourceKey,
      mediaGeneration:sourceMap.get(e.sourceKey).mediaStitchGeneration,
      mediaStartSec:safeSecond(e.mediaStart),
      mediaEndSec:safeSecond(e.mediaEnd),
      provisionalCollectorSec:isFiniteNumber(e.provisionalCollectorSec)?
        e.provisionalCollectorSec:null,
      mediaClockStatus:String(e.mediaClockStatus||'UNCALIBRATED_INDEPENDENT_SOURCE'),
      spokenAlias:String(e.spokenAlias||''),
      candidateActorId:e.actor,
      candidateHandle:labels[e.actor],
      speechExcerpt:String(e.speech||''),
      isPlatformEvent:false,
      isVerifiedReply:false
    }));
    for (const link of s.links||[]) {
      if (!Array.isArray(link) || link.length<3 ||
          !(link[0] in labels) || !(link[1] in labels)) continue;
      communityEdges.push([link[0],link[1],Number(link[2])||1]);
    }
    const publishedRows = comments.length + interactions.length;
    const originalRecords = Number(s.stats?.records)||publishedRows;
    const stats = {
      ...s.stats,
      records:publishedRows,
      sourceRecords:originalRecords,
      comments:comments.length,
      chatters:new Set(comments.map(r=>r[1]).filter(Boolean)).size,
      likes:Number(s.stats?.likes)||0,
      gifts:Number(s.stats?.gifts)||0,
      giftProgressEvents:Number(s.stats?.giftProgressEvents)||0,
      roomEvents:0,
      eventKinds:s.stats?.observedKinds||{}
    };
    const markers = (s.chapters||[]).filter(c=>
      ['chat','like','gift'].includes(c.kind) &&
      isFiniteNumber(c.at)
    ).map(c=>({
      t:c.at, kind:'peak',label:String(c.label||c.kind),
      note:String(c.description||'Observed collector interval')
    }));
    const bins = (s.bins||[]).filter(r=>Array.isArray(r)&&r.length>=7);
    // Curate only the three explicitly approved public collector-clock
    // chapters. Media-clock shout-out candidates do not become event-clock
    // highlights, and no one infers a reply, completed purchase, or sentiment.
    const chapters = (s.chapters||[]).filter(c=>
      c && ['chat','like','gift'].includes(c.kind) &&
      c.clock==='COLLECTOR' && isFiniteNumber(c.at) &&
      c.at>=0 && c.at<=s.duration).slice(0,3);
    const showcaseMoments = chapters.map((c,i)=>({
      rank:i+1, kind:c.kind,
      title:String(c.label||'Recorded activity'),
      reason:String(c.description||'Observed collector activity'),
      startSec:Math.max(0,Math.round(c.at)-30),
      endSec:Math.min(s.duration,Math.round(c.at)+90),
      anchorSec:c.at,
      evidenceClock:'COLLECTOR_OBSERVATION_ONLY',
      mediaAlignment:'NOT_INDEPENDENTLY_VERIFIED'
    }));
    const converted = {
      id:s.id,label:s.label,startUTC:s.startUTC,
      duration:s.duration,identityScheme:'direct_tiktok_account_fields_v1',
      accountLabels:labels,
      stats, bins, comments, interactions,roomEvents:[],
      markers, showcaseMoments, derivedSpeechEvents:shoutouts,
      speechDerivedStatus:'ASR_SHOUTOUT_CANDIDATES_NEED_AUDIO_REVIEW',
      sourceMediaInventory:{segments:0,bytes:0,
        playablePreviews:[...sourceMap.values()].filter(x=>x.video||x.audio).length,
        approvedPosterStills:[...sourceMap.values()].filter(x=>x.poster).length,
        syncStatus:'NOT_INDEPENDENTLY_VERIFIED'},
      mediaCoveragePct:null,
      clockEvidence:{eventMediaAlignment:'NOT_VERIFIED',eventWallclock:'SOURCE_OBSERVED'}
    };
    sessions.push(converted);
    alignmentBySession[s.id]={
      status:'PROVISIONAL',method:'SOURCE_MEDIA_UNCALIBRATED',
      verifiedAnchorCount:0,offsetSeconds:0
    };
  }
  if (!sessions.length || reviews.length===0) return;
  window.HL_SIGNAL_DATA={
    schema:'hl-v4-public-tool-bridge-v1',
    sessions,
    defaultSession:P.defaultSession||sessions[0].id,
    review:reviews,
    community:{
      nodes:[...communityNodes.values()],
      edges:communityEdges,
      edgeDefinition:'Actual same-minute co-activity only; not replies or influence'
    },
    alignmentBySession,verifiedMediaMappings:{},
    syncReviewCandidates:[],syncReviewStatus:{},
    provenance:{
      source:'PUBLIC_DIRECT_HANDLE_SAFE_EXPORT',
      identity:'OBSERVED_PUBLIC_TIKTOK_HANDLES',
      runtime:'PUBLIC_OFFLINE_FIRST_TOOL',
      rawPlatformIdentifiers:'EXCLUDED',
      eventMediaSynchronization:'NOT_VERIFIED',
      publication:'PUBLIC_STATIC_PAGES'
    }
  };
})();
