/* Human LAIer Signal Recorder v4 — public handle-safe evidence workstation.
   Uses one master transport. Historical media/event mapping is ESTIMATED,
   never source-verified. Raw records are immutable. No network dependency.
*/
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const D = window.HL_SIGNAL_DATA;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
  const fmt = value => { const t=Math.max(0,Math.floor(Number(value)||0));return [Math.floor(t/3600),Math.floor(t%3600/60),t%60].map(x=>String(x).padStart(2,'0')).join(':'); };
  const number = n => Number(n||0).toLocaleString('en-US');
  const shortId = v => {
    if(!v)return 'UNKNOWN';
    const key=String(v);
    const handle=D.sessions?.[state.session]?.accountLabels?.[key];
    return handle||key.slice(0,key.startsWith('u_')?10:16)+'…';
  };
  const elem = (tag,cls,txt) => {const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
  const ns='http://www.w3.org/2000/svg';
  const svgEl = name => document.createElementNS(ns,name);
  const graphWidth=680, graphHeight=430, storageLayout='hl-signal-v4-layout-1',storageOffsets='hl-signal-v4-offsets-1';
  const lanes=[
    {name:'CHAT RATE',unit:'comments/min',key:1,color:'#2c8ca6',value:b=>b[1]*2},
    {name:'COMMENTERS',unit:'unique / 30s',key:4,color:'#8876bb',value:b=>b[4]},
    {name:'LIKE UNITS',unit:'reported / 30s',key:2,color:'#3c9e91',value:b=>b[2]},
    {name:'GIFT UNITS',unit:'recorded / 30s',key:3,color:'#c19740',value:b=>b[3]},
    {name:'TEXT FLAGS*',unit:'lexical heuristic',key:5,color:'#b27762',value:b=>b[5]+b[6],heuristic:true}
  ];
  const state={
    session:0,source:null,track:'events',playing:false,eventT:0,selectedEventT:0,
    offset:0,alignment:'estimated',lastFrame:0,lastDynamic:0,lastChatBucket:-1,
    zoom:1,follow:true,graphMode:'community',graphScope:'capture',linkDensity:'strong',graphZoom:1,panX:0,panY:0,
    graphNodes:[],graphEdges:[],layout:{preset:'review',order:['media','conversation','constellation'],weights:[1,1,1]},
    mobile:'media',selectedActor:null,dragging:null,networkStamp:-1,
    graphMotion:'vivid',graphEventKind:'all',graphHistoryLimit:30,
    visualEvents:[],lastActivityKey:'',
    conversationFollow:true,lastConversationHighlight:-1,messageNodes:[]
  };
  const video=$('videoPlayer'),audio=$('audioPlayer');
  const session=()=>D.sessions[state.session];
  const findReview=()=>((D.review||[]).filter(r=>r.sid===session().id));
  const sourceStart = track => {
    if(!state.source)return 0;
    if(track==='video')return Number(state.source.videoStartMediaSec ?? state.source.audioStartMediaSec ?? state.source.transcriptOffset ?? 0);
    return Number(state.source.audioStartMediaSec ?? state.source.transcriptOffset ?? 0);
  };
  const activeMedia=()=>state.track==='video'?video:state.track==='audio'?audio:null;
  const maxDuration=()=>{
    if(state.track==='events')return Math.max(1,session().duration);
    const media=activeMedia();
    const candidate=Number(media?.duration);
    if(Number.isFinite(candidate)&&candidate>0)return candidate;
    if(state.track==='video')return Number(state.source?.videoDurationSec || 50);
    return Number(state.source?.audioDurationSec||300);
  };
  const mediaElapsed=()=>{
    const m=activeMedia();return m?Number(m.currentTime)||0:0;
  };
  function sourceAbsoluteMediaTime(){return sourceStart(state.track)+mediaElapsed();}
  function getSaved(key,fallback) {
    try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;} catch{return fallback;}
  }
  function setSaved(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
  const currentAlignment=()=>{
    if(state.track==='events'){
      return {status:'event-only',offset:0,reason:'Observed collector clock, no cross-source mapping'};
    }
    if(state.source?.mediaClockStatus==='UNCALIBRATED_INDEPENDENT_SOURCE'){
      return {status:'uncalibrated',offset:0,
        reason:'Original recording excerpt has NO defensible event-clock mapping'};
    }
    const key=session().id+'::'+(state.source?.key||'')+'::'+state.track;
    // Verified mappings are track-specific: a reviewed video anchor cannot
    // silently certify a different audio excerpt, or another recorder restart.
    const rec=(D.verifiedMediaMappings||{})[key];
    // A raw UTC field alone cannot establish transport latency or cross-clock sync.
    // Only accepted independently reviewed anchors with measured residual qualify.
    if(rec && rec.status==='VERIFIED' && rec.method==='REVIEWED_UTC_ANCHOR_FIT' &&
       Number.isFinite(Number(rec.offsetSeconds)) &&
       Number(rec.verifiedAnchorCount)>=2 &&
       Number(rec.maxResidualMs)>=0 && Number(rec.maxResidualMs)<=1000 &&
       typeof rec.reviewedUTC==='string' && rec.reviewedUTC.includes('T')) {
      return {status:'verified',offset:Number(rec.offsetSeconds),reason:'Reviewed UTC anchor fit'};
    }
    if(state.source && Number.isFinite(sourceStart(state.track)))return {status:'estimated',offset:state.offset,reason:'Best-guess matching collector/media elapsed seconds'};
    return {status:'uncalibrated',offset:0,reason:'Insufficient source timing'};
  };
  function deriveEventTime(){
    if(state.track==='events')return clamp(state.eventT,0,session().duration);
    const alignment=currentAlignment();
    if(alignment.status==='uncalibrated')return clamp(state.eventT,0,session().duration);
    return sourceAbsoluteMediaTime()+alignment.offset;
  }
  function updateAlignmentUI(){
    const info=currentAlignment(); state.alignment=info.status;
    const pill=$('syncPill'),cursor=$('cursorStatus'),detail=$('alignmentDetails');
    pill.className='sync-pill '+(info.status==='verified'?'verified':info.status==='uncalibrated'?'uncalibrated':'');
    pill.textContent=info.status==='verified'?'VERIFIED SYNC · UTC ANCHORS':
      info.status==='estimated'?'ESTIMATED SYNC · NOT VERIFIED':
      info.status==='event-only'?'OBSERVED COLLECTOR CLOCK':'UNCALIBRATED SOURCE';
    cursor.textContent=info.status==='verified'?'VERIFIED EVENT POSITION':
      info.status==='event-only'?'OBSERVED EVENT POSITION':'ESTIMATED EVENT POSITION';
    cursor.style.color=info.status==='verified'?'#17644d':'#815714';
    detail.hidden=info.status==='verified'||info.status==='uncalibrated'||info.status==='event-only';
    $('offsetSeconds').disabled=info.status!=='estimated';
    $('offsetNumber').disabled=info.status!=='estimated';
    $('alignToSelection').disabled=info.status!=='estimated';
    $('resetOffset').disabled=info.status!=='estimated';
    $('offsetSeconds').value=String(state.offset);
    $('offsetNumber').value=String(state.offset);
    $('alignmentNote').textContent=info.status==='verified'?
      'Measured UTC references and independent anchors have been accepted. Manual offset is hidden.':
      info.status==='uncalibrated'?
      'Original source media plays independently. No source-to-event clock offset can be defended.':
      'Best guess only: '+fmt(Math.abs(state.offset))+(state.offset<0?' earlier':' later')+
      ' than the provisional media origin. No independent source anchors are verified.';
    $('timelineFooter').textContent=info.status==='verified'?
      'The verified event cursor follows the selected media clock. Archived gaps remain gaps.':
      info.status==='uncalibrated'?
      'Media is independent of the collector cursor: click the timeline to inspect separately observed events. No synchronized reaction claim.':
      'The cursor follows a PROVISIONAL media-to-collector mapping. Transport latency remains unknown; manually review any claimed correspondence.';
  }
  function chooseAlignmentForSource(){
    const offsets=getSaved(storageOffsets,{});
    const key=session().id+'::'+(state.source?.key||'events');
    state.offset=clamp(Number(offsets[key] ?? 0),-900,900);
    updateAlignmentUI();
  }
  function changeOffset(next){
    if(currentAlignment().status!=='estimated')return;
    state.offset=clamp(Number(next),-900,900);
    const offsets=getSaved(storageOffsets,{});
    offsets[session().id+'::'+state.source.key]=state.offset;
    setSaved(storageOffsets,offsets);
    updateAlignmentUI();
    syncFromMaster(true);
  }
  function toast(msg){
    const t=$('toast');t.textContent=msg;t.hidden=false;
    // No auto-dismiss timer is necessary for a useful accessible status.
  }
  function getEventUTC(t){
    const ts=Date.parse(session().startUTC);return Number.isFinite(ts)?new Date(ts+t*1000).toISOString().replace('.000Z','Z'):'unknown UTC';
  }
  function stopMedia(){
    video.pause();audio.pause();state.playing=false;$('masterPlay').textContent='▶';
    $('masterPlay').setAttribute('aria-label','Play selected source');
  }
  function setPlaying(value){
    const m=activeMedia();
    if(!value){stopMedia();return;}
    if(state.track==='events'){
      state.playing=true;$('masterPlay').textContent='Ⅱ';
      $('masterPlay').setAttribute('aria-label','Pause collector events');return;
    }
    if(!m){toast('No playable source selected');return;}
    // Exactly one of the two native media elements is ever allowed to play.
    const other=m===video?audio:video;other.pause();
    const pending=m.play();
    Promise.resolve(pending).then(()=>{
      state.playing=!m.paused;
      $('masterPlay').textContent=state.playing?'Ⅱ':'▶';
      $('masterPlay').setAttribute('aria-label',state.playing?'Pause selected source':'Play selected source');
    }).catch(()=>{
      state.playing=false;$('masterPlay').textContent='▶';
      toast('Source playback requires another user action or this local media file is unavailable.');
    });
  }
  function selectTrack(track,atEvent=null){
    stopMedia();
    if(track==='video' && !state.source?.video)track=state.source?.audio?'audio':'events';
    if(track==='audio' && !state.source?.audio)track=state.source?.video?'video':'events';
    if(!['video','audio','events'].includes(track))track='events';
    state.track=track;$('sourceTrack').value=track;
    video.hidden=track!=='video';audio.hidden=track!=='audio';
    const still=track==='events'&&!state.source?.video&&!!state.source?.poster;
    $('posterPlayer').hidden=!(still||(track==='audio'&&state.source?.storyboard));
    $('mediaEmpty').hidden=track!=='events';
    $('sourceLabel').textContent=track==='video'?'ORIGINAL VIDEO · SINGLE TRANSPORT':
      track==='audio'?'ENHANCED AUDIO · SINGLE TRANSPORT':
      still?'ARCHIVED SOURCE STILL · EVENT REPLAY':'EVENT-ONLY REPLAY';
    if(track==='events'){
      state.eventT=clamp(atEvent==null?state.eventT:atEvent,0,session().duration);
      $('mediaEmpty').textContent=still?
        'Original still only · event clock is independent of the pictured frame':
        'No matching source footage · exploring actual recorded collector events.';
    }
    } else if(atEvent!==null){
      const pos=atEvent-currentAlignment().offset-sourceStart(track);
      const m=activeMedia();m.currentTime=clamp(pos,0,maxDuration());
    }
    $('muteButton').disabled=track==='events';
    $('masterSpeed').value='1';
    video.playbackRate=1;audio.playbackRate=1;
    updateAlignmentUI();
    syncFromMaster(true);
  }
  function setSource(key){
    const picks=findReview(),r=picks.find(x=>x.key===key)||picks.find(x=>x.video)||picks[0]||null;
    stopMedia();
    video.removeAttribute('src');audio.removeAttribute('src');
    video.load();audio.load();
    state.source=r;
    $('sourceSelect').value=r?r.key:'';
    if(r){
      if(r.video){video.src=r.video;video.poster=r.poster||r.storyboard||'';video.load();}
      if(r.audio){audio.src=r.audio;audio.load();}
      $('posterPlayer').src=r.storyboard||r.poster||'';
      $('mediaFootnote').textContent=(!r.video&&!r.audio)?
        'Approved source still · not synchronized to the collector event clock. Original video transfer remains pending.':
        r.title+' · recorded source media. Cross-clock alignment is not independently verified.';
    }else{
      $('mediaFootnote').textContent='No source-media excerpt exists for this capture; collector evidence remains available.';
    }
    chooseAlignmentForSource();
    selectTrack(r?.video?'video':r?.audio?'audio':'events');
    renderTranscript();
    renderHostShoutouts();
  }
  function renderSources(){
    const picks=findReview(),sel=$('sourceSelect');sel.replaceChildren();
    if(!picks.length){const option=elem('option','', 'No prepared media for this capture');option.value='';sel.append(option);}
    else for(const r of picks){
      const option=elem('option','',r.title+
        (r.video?' · video':r.audio?' · audio':' · archived still'));
      option.value=r.key;sel.append(option);
    }
    $('sourceTrack').querySelector('option[value="video"]').disabled=!picks.some(r=>r.video);
    $('sourceTrack').querySelector('option[value="audio"]').disabled=!picks.some(r=>r.audio);
    state.source=null;setSource(picks.find(r=>r.video)?.key||picks[0]?.key||null);
  }
  function renderShowcase(){
    const section=$('showcaseSection'),list=$('showcaseList');
    const moments=Array.isArray(session().showcaseMoments)?
      session().showcaseMoments.slice(0,3):[];
    section.hidden=!moments.length;
    list.replaceChildren();
    for(const moment of moments){
      if(!Number.isFinite(moment.anchorSec)||!Number.isFinite(moment.startSec)||
         !Number.isFinite(moment.endSec))continue;
      const btn=elem('button','showcase-chip');
      btn.type='button';
      const title=elem('strong','',moment.title+' · '+fmt(moment.anchorSec));
      const reason=elem('small','',moment.reason||'Original recorded activity');
      const status=elem('span','showcase-status','Observed event clock · source video not time-verified');
      btn.append(title,reason,status);
      btn.title='Inspect the actual collector-observed activity at this time. No video synchronization is implied.';
      btn.addEventListener('click',()=>{
        selectTrack('events',clamp(moment.anchorSec,0,session().duration));
        $('conversationFollow').setAttribute('aria-pressed','true');
        state.conversationFollow=true;
        $('conversationFollow').textContent='Follow: on';
        renderChat();
      });
      list.append(btn);
    }
  }
  function seekSource(t){
    const duration=maxDuration(),next=clamp(t,0,duration);
    const m=activeMedia();
    if(m) m.currentTime=next; else state.eventT=next;
    syncFromMaster(true);
  }
  function seekEvent(t){
    const time=clamp(t,0,session().duration);
    state.selectedEventT=time;
    if(state.track==='events'){state.eventT=time;syncFromMaster(true);return;}
    if(currentAlignment().status==='uncalibrated'){
      selectTrack('events',time);
      toast('Original media has no verified position on this event clock. Switched to independent collector replay.');
      return;
    }
    const at=time-currentAlignment().offset-sourceStart(state.track);
    if(at<0 || at>maxDuration()){
      // Do not pretend a missing historical media clip covers a collector peak.
      selectTrack('events',time);
      toast('No matching source footage for this moment. Switched to collector-only replay.');
      return;
    }
    const m=activeMedia();if(m)m.currentTime=at;
    syncFromMaster(true);
  }
  function syncFromMaster(force=false){
    const event=deriveEventTime(),outside=event<0||event>session().duration;
    const clamped=clamp(event,0,session().duration);
    state.eventT=clamped;
    $('estEventClock').textContent=(
      ['verified','event-only','uncalibrated'].includes(currentAlignment().status)?
        'Observed collector UTC: ':'Provisional collector UTC: ')+
      getEventUTC(clamped)+(outside?' (outside capture)':'');
    $('masterClock').textContent=fmt(state.track==='events'?state.eventT:mediaElapsed())+' / '+fmt(maxDuration());
    $('masterSeek').max=String(Math.max(1,maxDuration()));
    $('masterSeek').value=String(clamp(state.track==='events'?state.eventT:mediaElapsed(),0,maxDuration()));
    $('masterSeek').setAttribute('aria-valuetext',fmt(state.track==='events'?state.eventT:mediaElapsed())+
      (state.track==='events'?' collector elapsed':' source media elapsed')+'; '+state.alignment+' alignment');
    moveTimelineCursor(clamped,true);
    if(force || Math.floor(clamped/10)!==state.lastChatBucket){
      state.lastChatBucket=Math.floor(clamped/10);
      renderConversation();
      renderActionTimeline();
      renderRoomEvents();
    }
    const timestamp=Math.floor(clamped/5);
    if((force||timestamp!==state.networkStamp)&&state.graphMode==='moment'){
      state.networkStamp=timestamp;
      renderGraph();
    }
    // Use the media-driven playhead for all pulses; never animate a separate
    // simulated network clock.
    updateGraphActivity();
    if(force || Math.floor(clamped*2)!==state.lastConversationHighlight){
      state.lastConversationHighlight=Math.floor(clamped*2);
      highlightConversation(force);
    }
  }
  function frameTick(ms){
    const dt=state.lastFrame?clamp((ms-state.lastFrame)/1000,0,.2):0;state.lastFrame=ms;
    if(state.track==='events' && state.playing){
      state.eventT=clamp(state.eventT+dt*Number($('masterSpeed').value||1),0,session().duration);
      if(state.eventT>=session().duration)stopMedia();
    }
    if(state.track!=='events'){
      const m=activeMedia();
      if(m && m.ended){state.playing=false;$('masterPlay').textContent='▶';}
    }
    if(ms-state.lastDynamic>=95){
      state.lastDynamic=ms;syncFromMaster(false);
    }
    requestAnimationFrame(frameTick);
  }
  // A private-message-style reconstruction of TWO genuine but differently
  // timestamped evidence streams. Their juxtaposition is exploratory only.
  function conversationOffset(){
    const align=currentAlignment();
    return align.status==='verified'?align.offset:state.offset;
  }
  function speechCollectorTime(mediaTime){
    return Number(mediaTime)+conversationOffset();
  }
  function seekSpeech(mediaTime){
    const src=state.source;
    if(!src){toast('No source-media excerpt is available for this speech passage.');return;}
    const time=Number(mediaTime);
    const trackStart=sourceStart(state.track),duration=maxDuration();
    if(state.track!=='events' && time>=trackStart && time<=trackStart+duration){
      seekSource(time-trackStart);
    }else if(src.audio && Number.isFinite(Number(src.audioStartMediaSec))){
      // Switch the SAME transport to the enhanced-audio source only if this
      // original excerpt actually contains the selected speech passage.
      const start=Number(src.audioStartMediaSec),end=start+Number(src.audioDurationSec||0);
      if(time>=start && time<=end){selectTrack('audio');seekSource(time-start);}
      else seekEvent(speechCollectorTime(time));
    }else seekEvent(speechCollectorTime(time));
    state.conversationFollow=true;
    $('conversationFollow').setAttribute('aria-pressed','true');
    $('conversationFollow').textContent='Follow: on';
  }
  function renderConversation(){
    const list=$('conversationList'),oldScroll=list.scrollTop,
      range=$('chatScope').value==='near'?90:
        $('chatScope').value==='wide'?900:Infinity,
      mode=$('conversationMode').value,
      needle=$('chatSearch').value.trim().toLocaleLowerCase(),
      now=state.eventT,offset=conversationOffset();
    const keepTime=t=>Math.abs(Number(t)-now)<=range;
    const displayName=id=>shortId(id||null);
    const mentions=peerMentions();
    const mentionByIndex=new Map();
    for(const m of mentions.rows){
      if(!mentionByIndex.has(m.sourceCommentIndex))
        mentionByIndex.set(m.sourceCommentIndex,[]);
      mentionByIndex.get(m.sourceCommentIndex).push(m);
    }
    const includesMessage=mode!=='activity';
    const includesActivity=mode!=='messages';
    const comments=includesMessage?
      (session().comments||[]).map((row,i)=>({row,i})).filter(x=>
        keepTime(x.row[0]) &&
        (!state.selectedActor||x.row[1]===state.selectedActor||
          (mentionByIndex.get(x.i)||[]).some(m=>m.to===state.selectedActor)) &&
        (!needle||String(x.row[2]||'').toLowerCase().includes(needle)||
          displayName(x.row[1]).toLowerCase().includes(needle)||
          (mentionByIndex.get(x.i)||[]).some(m=>
            displayName(m.to).toLowerCase().includes(needle)))):[];
    const speech=includesMessage?(state.source?.transcript||[]).filter(row=>{
      const start=Number(row[0])+offset,end=Number(row[1])+offset;
      return start<=now+range && end>=now-range &&
        (!needle||String(row[2]||'').toLocaleLowerCase().includes(needle));
    }):[];
    // Keep EVERY source event, but combine nearby like BATCH NOTIFICATIONS
    // from the same actor into a single compact chat-system notification.
    // Never turn like units into people or streak progress into completed gifts.
    const actionRows=includesActivity?(session().interactions||[]).filter(r=>
      keepTime(r[0])&&
      (!state.selectedActor||r[2]===state.selectedActor)&&
      (!needle||displayName(r[2]).toLowerCase().includes(needle)||
        String(r[1]).toLowerCase().includes(needle)||
        String(r[4]?.observed_text||'').toLowerCase().includes(needle))):[];
    const actionGroups=new Map(),actionList=[];
    for(const row of actionRows){
      const [t,kind,actor,rawUnits]=row;
      if(!Number.isFinite(Number(t))||typeof kind!=='string')continue;
      const grouping=kind==='like'?String(actor||'room')+'|'+kind+'|'+
        Math.floor(Number(t)/12):null;
      let group=grouping?actionGroups.get(grouping):null;
      if(!group){
        group={
          kind:'reaction',t:Number(t),eventKind:kind,actor:actor||null,
          eventCount:0,units:0,details:row[4]||{},lastT:Number(t)
        };
        actionList.push(group);
        if(grouping)actionGroups.set(grouping,group);
      }
      group.eventCount++;group.units+=Math.max(0,Number(rawUnits)||0);
      group.lastT=Math.max(group.lastT,Number(t));
    }
    // Actorless, platform-wide signals are intentionally ROOM notices,
    // never messages written by a fabricated participant.
    const roomRows=includesActivity?(session().roomEvents||[]).filter(r=>
      keepTime(r[0])&&!state.selectedActor&&
      (!needle||String(r[1]).toLowerCase().includes(needle))):[];
    const roomGroups=new Map(),roomList=[];
    for(const row of roomRows){
      const t=Number(row[0]),kind=String(row[1]||'room_signal');
      if(!Number.isFinite(t))continue;
      const key=kind+'|'+Math.floor(t/20);
      let group=roomGroups.get(key);
      if(!group){
        group={kind:'room',t,eventKind:kind,eventCount:0,lastT:t};
        roomGroups.set(key,group);roomList.push(group);
      }
      group.eventCount++;group.lastT=Math.max(group.lastT,t);
    }
    const combined=[
      ...comments.map(x=>({kind:'chat',t:Number(x.row[0]),seq:x.i,
        row:x.row,mentions:mentionByIndex.get(x.i)||[]})),
      ...speech.map((row,i)=>({kind:'speech',t:Number(row[0])+offset,seq:i,row})),
      ...actionList,
      ...roomList
    ].sort((a,b)=>a.t-b.t||(a.kind==='speech'?-1:1)||(a.seq||0)-(b.seq||0));
    // Render a manageable window around the cursor, NOT an arbitrary sample
    // presented as the entire capture. Source records stay available.
    const limit=700;
    const shown=combined.length>limit?
      combined.slice().sort((a,b)=>
        Math.abs(a.t-now)-Math.abs(b.t-now)||a.t-b.t).slice(0,limit)
        .sort((a,b)=>a.t-b.t):combined;
    const fragment=document.createDocumentFragment(),nodes=[];
    for(const item of shown){
      const wrap=elem('div','message-row '+item.kind);
      wrap.dataset.time=String(item.t);
      wrap.dataset.kind=item.kind;
      const bubble=elem('div','message-bubble');
      const head=elem('div','message-head');
      const sender=elem('span','message-sender');
      const time=elem('button','message-time');
      time.type='button';
      if(item.kind==='speech'){
        sender.textContent='STREAM SPEECH · ASR';
        time.textContent='~'+fmt(item.t);
        time.title='Seek to machine transcript on independent source media clock.';
        time.addEventListener('click',()=>seekSpeech(item.row[0]));
      }else{
        sender.textContent=item.kind==='chat'?'VIEWER · '+displayName(item.row[1]):
          item.kind==='room'?'ROOM · PLATFORM EVENT':
          (item.actor?'VIEWER · '+displayName(item.actor):'ROOM · UNATTRIBUTED');
        time.textContent=fmt(item.t);
        time.title='Seek to original observed collector event time.';
        time.addEventListener('click',()=>seekEvent(item.t));
      }
      head.append(sender,time);
      if(item.kind==='chat'){
        bubble.append(head,elem('p','message-text',
          String(item.row[2]||'(empty recorded comment)')));
        if(item.mentions?.length){
          const chips=elem('div','message-mentions');
          for(const m of item.mentions){
            const exact=m.confidence==='explicit';
            const chip=elem('button','message-mention-chip '+(exact?'exact':'possible'),
              (exact?'':'≈ ')+displayName(m.to)+
              (exact?' · mentioned':' · possible call-out'));
            chip.type='button';chip.dataset.mentionConfidence=m.confidence;
            chip.title=exact?
              'Recorded exact @handle reference; not a confirmed reply.':
              'Unique nickname match with salutation cue. Tentative, not verified.';
            chip.addEventListener('click',()=>{
              state.graphEventKind='participant_mention';
              $('graphEventKind').value='participant_mention';
              updateGraphFilterNote();
              renderGraph();
              selectActor(m.to);
            });
            chips.append(chip);
          }
          bubble.append(chips);
        }
      }else if(item.kind==='speech'){
        bubble.append(head,elem('p','message-text',
          String(item.row[2]||'(empty machine transcription)')));
        bubble.append(elem('div','message-subline',
          'Machine transcript · speaker attribution and collector/media sync unverified'));
      }else if(item.kind==='reaction'){
        const icons={
          like:'♥',gift:'✦',gift_progress:'◌',follow:'+',share:'↗',
          subscribe:'★',emote_chat:'☺',question_submitted:'?',
          envelope:'✉',superfan:'✳',superfan_box:'✳'
        };
        const action=liveLabels[item.eventKind]||item.eventKind.replaceAll('_',' ');
        const observed=item.eventKind==='like'?
          number(item.units)+' reported like units ('+
            number(item.eventCount)+' notifications)':
          item.eventKind==='gift'?
            number(item.units)+' completed virtual gift units':
          item.eventKind==='gift_progress'?
            'gift-streak update · NOT an additional completed gift':
          (item.eventCount>1?number(item.eventCount)+' notifications · ':'')+action;
        const label=elem('div','reaction-compact');
        label.append(elem('span','reaction-icon',icons[item.eventKind]||'•'),
          elem('span','reaction-label',observed));
        bubble.append(head,label);
        if(item.eventKind==='gift_progress')
          bubble.append(elem('small','message-subline','Streak progress is not counted as completed gifting'));
      }else if(item.kind==='room'){
        bubble.append(head,elem('div','reaction-compact',
          number(item.eventCount)+' '+item.eventKind.replaceAll('_',' ')+' room observations'));
        bubble.append(elem('small','message-subline','Aggregate signal, not an individual viewer'));
      }
      wrap.append(bubble);fragment.append(wrap);
      nodes.push({element:wrap,kind:item.kind,t:item.t,
        end:item.kind==='speech'?Number(item.row[1])+offset:item.lastT??item.t});
    }
    if(!shown.length)fragment.append(elem('p','conversation-empty',
      'No observed chat, action notifications or preserved ASR speech matches this window.'));
    list.replaceChildren(fragment);
    state.messageNodes=nodes;
    const hasSpeech=!!state.source?.transcript?.length;
    $('conversationNote').textContent=hasSpeech?
      (currentAlignment().status==='verified'?
        'Reviewed media alignment. Speech is machine-generated and speaker attribution remains unverified. Reactions/chat are collector observations.':
        'Original ASR speech (left) and collector chat/actions (right/center) use DIFFERENT clocks. Side-by-side ordering does not establish responses.'):
      'Only recorded collector chat/actions are available for this source. Missing ASR does not mean no speech occurred.';
    $('conversationFooter').textContent=
      number(comments.length)+' comments · '+
      number(actionRows.length)+' action notifications'+
      (actionList.length!==actionRows.length?' ('+number(actionList.length)+' after like batching)':'')+
      ' · '+number(speech.length)+' ASR segments · '+
      number(mentions.exact)+' exact @references · '+
      number(mentions.candidates)+' possible nickname call-outs · '+
      (combined.length>shown.length?number(shown.length)+' nearest displayed / '+number(combined.length)+' rows':'all matched rows shown');
    $('clearParticipant').hidden=!state.selectedActor;
    if(!state.conversationFollow)list.scrollTop=oldScroll;
    highlightConversation(false);
  }
  function highlightConversation(force=false){
    const nodes=state.messageNodes||[],now=state.eventT;
    let nearestChat=null,nearestSpeech=null;
    for(const n of nodes){
      if(n.t<=now+1){
        if(['chat','reaction','room'].includes(n.kind) &&
           (!nearestChat||n.t>nearestChat.t))nearestChat=n;
        if(n.kind==='speech' && (!nearestSpeech||n.t>nearestSpeech.t))nearestSpeech=n;
      }
    }
    let focus=null;
    for(const n of nodes){
      const relevant=n.kind==='speech'?nearestSpeech===n&&now<=n.end+2:
        nearestChat===n&&Math.abs(now-n.t)<=6;
      n.element.querySelector('.message-bubble')?.classList.toggle('is-current',relevant);
      if(relevant && (!focus||n.t>focus.t))focus=n;
    }
    if(state.conversationFollow && focus && (force||state.playing) &&
       (state.lastFocusedConversation!==focus.element)){
      state.lastFocusedConversation=focus.element;
      const list=$('conversationList');
      const top=focus.element.offsetTop-list.offsetTop;
      // Keep the active evidence in view without scrolling the page itself.
      list.scrollTop=Math.max(0,top-list.clientHeight*.36);
    }
  }
  function renderChat(){renderConversation();}
  function renderTranscript(){renderConversation();}
    // Each pulse is an archived observation at the current video/event time.
  // The graph never invents a participant or a transaction.
  // Exact observed deliberate actions. No passive room event may create a node.
  const liveKinds=new Set([
    'comment','like','gift','gift_progress','follow','share','subscribe',
    'emote_chat','question_submitted','envelope','superfan','superfan_box'
  ]);
  const liveLabels={
    comment:'comments',like:'reported likes',gift:'completed gift units',
    gift_progress:'gift-streak progress events',follow:'follows',share:'shares',
    subscribe:'subscriptions',emote_chat:'chat emotes',
    question_submitted:'submitted questions',envelope:'envelope actions',
    superfan:'Super Fan events',superfan_box:'Super Fan box events'
  };
  const liveColors={
    comment:'#6de7e9',like:'#ff86b0',gift:'#fbd16b',
    gift_progress:'#c9a97d',follow:'#a7e78d',share:'#b3a5f8',
    subscribe:'#96baf5',emote_chat:'#ffb68b',
    question_submitted:'#f89ed5',envelope:'#ebbd68',
    superfan:'#e9a3f8',superfan_box:'#faad84'
  };
  const livePriority={
    comment:1,like:2,emote_chat:3,question_submitted:4,
    envelope:4,superfan:4,superfan_box:4,share:5,follow:6,
    subscribe:7,gift_progress:7,gift:8
  };
  const glowWindow=4.6;
  const HOST_NODE='__broadcast_host_role__';
  const graphHostPosition={x:340,y:207};
  const graphRoomPosition={x:609,y:53};
  const observedActionKind = kind => typeof kind==='string' && /^[a-z][a-z_]{1,48}$/.test(kind);
  const graphEventFilter=()=>state.graphEventKind||'all';
  const allowsKind=kind=>graphEventFilter()==='all'||graphEventFilter()===kind;
  // Source comments: an exact @full_handle is directly observed. Partial
  // or bare username mentions are ONLY possible directed-address candidates
  // when a unique handle stem and clear salutation/attention cue coexist.
  // Neither is verified reply/endorsement/friendship evidence.
  const peerMentionCache=new WeakMap();
  const aliasStopWords=new Set([
    'hello','thanks','thank','there','where','which','would','could',
    'please','really','morning','evening','night','people','everybody',
    'awesome','random','buyer','cards','break','today','sorry','great',
    'price','thing','follow','liked','gifts','everyone','someone',
    'stream','video','right','wrong','later','happy','green','white',
    'black','sugar','water','laugh','laughing','about','first','going',
    'again','still','these','those','their','other','drink','squeeze',
    'maybe','candy','money','sweet'
  ]);
  function peerMentions(){
    const current=session();
    const commentsCount=(current.comments||[]).length,
      accountsCount=Object.keys(current.accountLabels||{}).length;
    const cached=peerMentionCache.get(current);
    if(cached && cached.commentsCount===commentsCount &&
       cached.accountsCount===accountsCount)return cached.value;
    const roster=new Map(),ambiguousFull=new Set(),aliasToIds=new Map();
    function addAlias(alias,id){
      if(alias.length<5||aliasStopWords.has(alias))return;
      if(!aliasToIds.has(alias))aliasToIds.set(alias,new Set());
      aliasToIds.get(alias).add(id);
    }
    for(const [id,handle] of Object.entries(current.accountLabels||{})){
      if(typeof handle!=='string'||!/^@[A-Za-z0-9._]{2,36}$/.test(handle))continue;
      const full=handle.toLowerCase();
      if(roster.has(full))ambiguousFull.add(full);
      else roster.set(full,id);
      const root=full.slice(1).split(/[_.]/)[0];
      if(root.length>=5 && root!==full.slice(1))addAlias(root,id);
      if(root.length>=11)addAlias(root.slice(0,Math.min(7,root.length-1)),id);
    }
    for(const key of ambiguousFull)roster.delete(key);
    const aliases=[...aliasToIds].filter(([k,ids])=>ids.size===1&&!roster.has('@'+k))
      .sort((a,b)=>b[0].length-a[0].length);
    const rows=[];let unmatched=0,self=0,tokens=0,candidates=0,exact=0;
    const makeRow=(i,time,sender,recipient,message,method,alias)=>{
      const status=method==='exact_at'?
        'EXPLICIT_HANDLE_REFERENCE_NOT_VERIFIED_REPLY':
        'POSSIBLE_NICKNAME_ADDRESS_NOT_VERIFIED';
      rows.push({
        id:'mention-'+i+'-'+recipient+'-'+method,
        t:time,from:sender,to:recipient,text:message,alias,
        matchMethod:method,confidence:method==='exact_at'?'explicit':'candidate',
        sourceCommentIndex:i,status,origin:'OBSERVED_COLLECTOR_COMMENT_TEXT'
      });
      if(method==='exact_at')exact++;else candidates++;
    };
    for(let i=0;i<(current.comments||[]).length;i++){
      const [rawTime,sender,message]=current.comments[i];
      if(typeof message!=='string'||!Number.isFinite(Number(rawTime)))continue;
      const t=Number(rawTime),referenced=new Set();
      const explicit=/(^|[^A-Za-z0-9_@])@([A-Za-z0-9._]{2,36})(?![A-Za-z0-9._])/g;
      for(const match of message.matchAll(explicit)){
        tokens++;
        const alias='@'+match[2].toLowerCase();
        let recipient=roster.get(alias);
        if(!recipient&&alias.endsWith('.'))
          recipient=roster.get(alias.replace(/\.+$/,''));
        if(!recipient||!sender||!current.accountLabels[sender]){
          unmatched++;continue;
        }
        if(recipient===sender){self++;continue;}
        if(referenced.has(recipient))continue;
        referenced.add(recipient);
        makeRow(i,t,sender,recipient,message,'exact_at',alias);
      }
      if(!sender||!current.accountLabels[sender])continue;
      // @citrus_squeez -> unique root "citrus". Bare words require direct
      // addressing: "Good morning citrus", "Citrus, are you there?", "Citrus!"
      // rather than incidental "I like citrus juice".
      for(const [alias,ids] of aliases){
        const recipient=[...ids][0];
        if(recipient===sender||referenced.has(recipient))continue;
        // All alias roots are strictly alphanumeric (safe regex token).
        const rx=new RegExp('(^|[^A-Za-z0-9_@])('+alias+')(?![A-Za-z0-9_.])','gi');
        for(const match of message.matchAll(rx)){
          const index=match.index+match[1].length;
          const before=message.slice(Math.max(0,index-90),index);
          const after=message.slice(index+match[2].length);
          const trimmed=before.trim();
          const greeting=/(?:^|[\s,:;.!?])(?:hey|hi|hello|gm|gn|morning|evening|yo|sup|welcome|thanks|thank\s+you|thank|shout\s*out|nice\s+one|well\s+done|congrats|good\s+morning|good\s+night|good\s+job|bye)\s+(?:[A-Za-z]{1,12}\s+){0,2}$/i.test(before);
          const opening=trimmed.length===0||/[.!?]\s*$/.test(before);
          const comma=/^\s*[,!?:]\s*(?:\w|$)/.test(after);
          const standalone=opening && /^\s*[!?.]*\s*$/.test(after);
          if(!(greeting || standalone || (opening && comma)))continue;
          referenced.add(recipient);
          makeRow(i,t,sender,recipient,message,'bare_alias_candidate',match[2].toLowerCase());
          break;
        }
      }
    }
    rows.sort((a,b)=>a.t-b.t||a.sourceCommentIndex-b.sourceCommentIndex||a.to.localeCompare(b.to));
    const result={
      rows,tokens,unmatched,self,exact,candidates,
      pairs:new Set(rows.map(x=>x.from+'|'+x.to)).size,
      exactPairs:new Set(rows.filter(x=>x.confidence==='explicit').map(x=>x.from+'|'+x.to)).size
    };
    peerMentionCache.set(current,{commentsCount,accountsCount,value:result});
    return result;
  }
  function graphKindsForSession(){
    const counts=new Map();
    counts.set('comment',(session().comments||[]).length);
    for(const row of session().interactions||[]){
      if(!observedActionKind(row[1]))continue;
      counts.set(row[1],(counts.get(row[1])||0)+1);
    }
    return counts;
  }
  function populateGraphEventFilter(){
    const kinds=graphKindsForSession(),sel=$('graphEventKind'),previous=state.graphEventKind;
    sel.replaceChildren();
    const option=(kind,label,disabled=false)=>{
      const el=elem('option','',label);el.value=kind;el.disabled=disabled;sel.append(el);
    };
    option('all','All recorded participant actions');
    for(const kind of [...new Set([...liveKinds,...kinds.keys()])].sort((a,b)=>{
      if(a==='comment')return -1;if(b==='comment')return 1;
      return String(liveLabels[a]||a).localeCompare(String(liveLabels[b]||b));
    })){
      const n=kinds.get(kind)||0;
      option(kind,(liveLabels[kind]||kind.replaceAll('_',' '))+' · '+number(n)+' recorded');
    }
    const shoutouts=(session().derivedSpeechEvents||[]).filter(e=>e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED');
    option('host_shoutout_candidate','ASR name candidates · '+number(shoutouts.length));
    const mentions=peerMentions();
    option('participant_mention','Viewer mentions · '+number(mentions.exact)+' @ / '+
      number(mentions.candidates)+' possible',
      mentions.rows.length===0);
    const room=(session().roomEvents||[]).length;
    const actorless=(session().comments||[]).filter(r=>!r[1]).length+
      (session().interactions||[]).filter(r=>!r[2]).length;
    option('room','Room / unattributed · '+number(room+actorless),
      room+actorless===0);
    state.graphEventKind=[...sel.options].some(o=>o.value===previous&&!o.disabled)?
      previous:'all';
    sel.value=state.graphEventKind;
    updateGraphFilterNote();
    $('roomActivityNow').hidden=room+actorless===0;
  }
  function updateGraphFilterNote(){
    const kinds=graphKindsForSession(),actual=[...kinds].filter(([k,n])=>n>0).length;
    const roomCount=(session().roomEvents||[]).length;
    const n=(session().derivedSpeechEvents||[]).length;
    const mentions=peerMentions();
    let note='';
    if(graphEventFilter()==='all'){
      note=actual+'/'+number(liveKinds.size)+' supported deliberate kinds observed · '+
        number(n)+' unverified speech candidates · '+
        number(mentions.exact)+' exact viewer @mentions + '+
        number(mentions.candidates)+' possible name call-outs';
      if(!roomCount)note+=' · room-level records not in public export';
    }else if(graphEventFilter()==='host_shoutout_candidate'){
      note=number(n)+' unverified ASR references · source-media clock, NOT collector time';
    }else if(graphEventFilter()==='participant_mention'){
      note=number(mentions.exact)+' exact @handle references + '+
        number(mentions.candidates)+' possible nickname call-outs · '+
        number(mentions.pairs)+' directional pairs · '+
        number(mentions.unmatched)+' unresolved tags · NOT verified replies';
    }else if(graphEventFilter()==='room'){
      note=number(roomCount)+' observed room signals; actorless signals never invent viewers';
    }else{
      note=number(kinds.get(graphEventFilter())||0)+' observed '+
        (liveLabels[graphEventFilter()]||graphEventFilter().replaceAll('_',' '))+
        ' events in this capture';
    }
    $('graphEventCoverage').textContent=note;
  }
  function prepareVisualEvents(){
    const events=[];
    for(const row of session().comments||[]){
      const t=Number(row[0]);
      if(Number.isFinite(t))events.push({t,kind:'comment',actor:row[1]||null,units:1});
    }
    for(const row of session().interactions||[]){
      const [rawTime,kind,actor,rawUnits]=row,t=Number(rawTime),reportedUnits=Number(rawUnits);
      if(Number.isFinite(t)&&Number.isFinite(reportedUnits)&&reportedUnits>=0&&observedActionKind(kind))
        events.push({t,kind,actor:actor||null,
          units:Math.max(1,reportedUnits),reportedUnits,details:row[4]||{}});
    }
    events.sort((a,b)=>a.t-b.t||a.kind.localeCompare(b.kind));
    state.visualEvents=events;
  }
  function visibleActivity(t=state.eventT){
    const rows=state.visualEvents||[];
    if(!rows.length)return [];
    let lo=0,hi=rows.length;
    while(lo<hi){
      const mid=(lo+hi)>>>1;
      if(rows[mid].t<t-glowWindow)lo=mid+1;else hi=mid;
    }
    const recent=[];
    for(let i=lo;i<rows.length && rows[i].t<=t+.0001;i++)recent.push(rows[i]);
    return recent;
  }
  function updateActivityTicker(events){
    const groups=new Map();
    for(const e of events){
      const row=groups.get(e.kind)||{events:0,units:0};
      row.events++;
      // gift_progress never counts as a completed virtual gift; missing
      // like batch counts never become fabricated like units.
      row.units+=e.kind==='comment'?1:Math.max(0,Number(e.reportedUnits??e.units)||0);
      groups.set(e.kind,row);
    }
    const labels=[...groups].map(([kind,rec])=>{
      const counted=(kind==='like'||kind==='gift')&&rec.units>0;
      return number(counted?rec.units:rec.events)+' '+
        (counted?liveLabels[kind]:kind==='like'?'like observations':liveLabels[kind]||kind);
    });
    const shown=graphEventFilter()==='participant_mention'?
      number(peerMentions().rows.filter(m=>m.t<=state.eventT+.0001&&
        m.t>=state.eventT-glowWindow).length)+
        ' exact in-chat handle references · derived from comments, NOT verified replies':
      graphEventFilter()==='host_shoutout_candidate'?
      number((session().derivedSpeechEvents||[]).length)+
        ' UNVERIFIED spoken-name candidates · INDEPENDENT MEDIA CLOCK (no event-time animation)':
      graphEventFilter()==='room'?
        'Unattributed room/platform signals only · no synthetic viewer':
      labels.length?labels.join(' · ')+' · last 4.6 collector seconds':
      'No observed '+(graphEventFilter()==='all'?'participant actions':graphEventFilter())+
        ' in the last 4.6 collector seconds';
    if(state.lastActivityKey!==shown){
      state.lastActivityKey=shown;
      $('activityEventTicker').textContent=shown;
    }
    updateRoomTicker();
  }
  function recentRoomEvents(t=state.eventT){
    const rows=session().roomEvents||[];
    let lo=0,hi=rows.length;
    while(lo<hi){
      const mid=(lo+hi)>>>1;
      if(Number(rows[mid][0])<t-glowWindow)lo=mid+1;else hi=mid;
    }
    const recent=[];
    for(let i=lo;i<rows.length&&Number(rows[i][0])<=t+0.0001;i++)recent.push(rows[i]);
    return recent;
  }
  function updateRoomTicker(){
    const counts=new Map();
    for(const row of recentRoomEvents()){
      counts.set(row[1],(counts.get(row[1])||0)+1);
    }
    const labels=[...counts].slice(0,6).map(([kind,n])=>number(n)+' '+kind.replaceAll('_',' '));
    const label=labels.length?labels.join(' · '):'No observed room signal in the last 4.6 seconds';
    if($('roomActivityTicker'))$('roomActivityTicker').textContent=label;
  }
  function graphActorCounts(t=state.eventT){
    const kind=graphEventFilter(),count=new Map();
    if(kind==='room')return count;
    if(kind==='participant_mention'){
      for(const reference of peerMentions().rows){
        if(Math.abs(reference.t-t)>90)continue;
        count.set(reference.from,(count.get(reference.from)||0)+1);
        count.set(reference.to,(count.get(reference.to)||0)+1);
      }
      return count;
    }
    if(kind==='host_shoutout_candidate'){
      // Speech timestamps live on independent media clocks: never position
      // an ASR candidate at the collector playhead as a verified event.
      for(const e of session().derivedSpeechEvents||[]){
        const id=e.candidateActorId;
        if(id && session().accountLabels?.[id] &&
           e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED')
          count.set(id,(count.get(id)||0)+1);
      }
      return count;
    }
    if(kind==='all'||kind==='comment'){
      for(const row of session().comments||[]){
        if(row[1]&&Math.abs(Number(row[0])-t)<=90)
          count.set(row[1],(count.get(row[1])||0)+1);
      }
    }
    for(const row of session().interactions||[]){
      if(kind!=='all'&&row[1]!==kind)continue;
      if(row[2]&&Math.abs(Number(row[0])-t)<=90)
        count.set(row[2],(count.get(row[2])||0)+1);
    }
    return count;
  }
  function graphPool(){
    const local=graphActorCounts(),kind=graphEventFilter();
    const profiles=new Map((D.community?.nodes||[]).map(p=>[p[0],p]));
    let people=[],edges=[];
    if(kind==='room'){
      return {people:[],edges:[],local,totalLinks:0};
    }
    if(kind==='host_shoutout_candidate'){
      // No invented host-to-viewer co-activity. Only the separately styled
      // and explicitly unverified speech-derived edges will be drawn.
      people=[...local.keys()].filter(id=>profiles.has(id)).map(id=>profiles.get(id));
    }else if(kind==='participant_mention'){
      // Only observed source/target accounts. Directed references get their
      // own edge layer, never converted into same-minute coactivity links.
      const ids=new Set(peerMentions().rows.flatMap(x=>[x.from,x.to]));
      people=[...ids].filter(id=>profiles.has(id)).map(id=>profiles.get(id));
    }else if(state.graphScope==='capture'){
      const byMinute=new Map(),observedCount=new Map();
      const add=(time,id,isComment)=>{
        if(!id||!Number.isFinite(Number(time)))return;
        const minute=Math.floor(Number(time)/60);
        if(!byMinute.has(minute))byMinute.set(minute,new Set());
        byMinute.get(minute).add(id);
        observedCount.set(id,(observedCount.get(id)||0)+(isComment?1:0));
      };
      if(kind==='all'||kind==='comment'){
        for(const [t,id] of session().comments||[])add(t,id,true);
      }
      for(const [t,eventKind,id] of session().interactions||[]){
        if(kind!=='all'&&kind!==eventKind)continue;
        add(t,id,false);
      }
      const weights=new Map();
      for(const actors of byMinute.values()){
        const ids=[...actors].sort();
        for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
          const key=ids[i]+'|'+ids[j];
          weights.set(key,(weights.get(key)||0)+1);
        }
      }
      people=[...observedCount].map(([id,n])=>{
        const original=profiles.get(id)||[id,0,1,1,0,0];
        return [id,n,1,1,original[4]||0,original[5]||0];
      });
      edges=[...weights].map(([pair,w])=>{
        const [a,b]=pair.split('|');return [a,b,w];
      });
    }else if(kind==='all'){
      people=D.community?.nodes||[];
      edges=D.community?.edges||[];
    }else{
      const actors=new Set((kind==='comment'?(session().comments||[]).map(r=>r[1]):
        (session().interactions||[]).filter(r=>r[1]===kind).map(r=>r[2])).filter(Boolean));
      people=[...actors].filter(id=>profiles.has(id)).map(id=>profiles.get(id));
      edges=(D.community?.edges||[]).filter(([a,b])=>actors.has(a)&&actors.has(b));
    }
    const degrees=new Map();
    for(const [a,b,w] of edges){
      degrees.set(a,(degrees.get(a)||0)+Number(w||1));
      degrees.set(b,(degrees.get(b)||0)+Number(w||1));
    }
    const ranked=[...people].sort((a,b)=>{
      const score=p=>Number(p[1]||0)*.13+(degrees.get(p[0])||0)*3+(local.get(p[0])||0)*2;
      return score(b)-score(a)||String(a[0]).localeCompare(String(b[0]));
    });
    const chosen=ranked.slice(0,state.graphScope==='capture'?80:78);
    const chosenIds=new Set(chosen.map(p=>p[0]));
    // Keep ASR target accounts discoverable even when outside the most active
    // 80 accounts; these forced nodes never imply verified host replies.
    const candidates=(session().derivedSpeechEvents||[])
      .filter(e=>e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED');
    const targetIds=(kind==='all'||kind==='host_shoutout_candidate')?
      [...new Set(candidates.map(e=>e.candidateActorId).filter(Boolean))]:[];
    for(const id of targetIds){
      if(!chosenIds.has(id)&&profiles.has(id)){
        chosen.push(profiles.get(id));chosenIds.add(id);
      }
    }
    // Participant references require BOTH the observed writer and their
    // explicitly tagged account. Keep these discoverable even if neither is
    // among the original top-80 activity-ranked nodes.
    if(kind==='all'||kind==='participant_mention'){
      for(const id of new Set(peerMentions().rows.flatMap(m=>[m.from,m.to]))){
        if(!chosenIds.has(id)&&profiles.has(id)){
          chosen.push(profiles.get(id));chosenIds.add(id);
        }
      }
    }
    for(const id of [...local.keys()].sort()){
      if(chosen.length>=96)break;
      if(!chosenIds.has(id)&&profiles.has(id)){
        chosen.push(kind==='all'&&state.graphScope==='capture'?
          [id,local.get(id),1,1,profiles.get(id)[4]||0,0]:profiles.get(id));
        chosenIds.add(id);
      }
    }
    const relevant=edges.filter(([a,b])=>chosenIds.has(a)&&chosenIds.has(b))
      .sort((a,b)=>Number(b[2])-Number(a[2])||a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
    return {people:chosen,edges:relevant,local,totalLinks:relevant.length};
  }
  function deterministicSeed(s){
    let h=2166136261>>>0;
    for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0)/4294967295;
  }
  function stableForceLayout(pool){
    const nodes=pool.people.map(p=>{
      const a=deterministicSeed(p[0])*Math.PI*2,r=110+deterministicSeed('r'+p[0])*83;
      return {id:p[0],p,x:graphWidth/2+Math.cos(a)*r,y:graphHeight/2+Math.sin(a)*r,vx:0,vy:0};
    }),idx=new Map(nodes.map((n,i)=>[n.id,i]));
    const links=pool.edges.map(([a,b,w])=>({a:idx.get(a),b:idx.get(b),w:Number(w)||1}))
      .filter(e=>e.a!==undefined&&e.b!==undefined);
    // Deterministic spring relaxation. Positions are computed once per capture
    // and remain stable while the media cursor advances.
    for(let step=0;step<75;step++){
      const forces=nodes.map(()=>[0,0]);
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y;
        const dist=Math.max(5,Math.hypot(dx,dy)),rep=5200/(dist*dist);
        const fx=rep*dx/dist,fy=rep*dy/dist;
        forces[i][0]-=fx;forces[i][1]-=fy;
        forces[j][0]+=fx;forces[j][1]+=fy;
      }
      for(const e of links){
        const a=nodes[e.a],b=nodes[e.b],dx=b.x-a.x,dy=b.y-a.y;
        const dist=Math.max(1,Math.hypot(dx,dy));
        const strength=.011*Math.min(4,Math.sqrt(e.w)), target=65+25/Math.sqrt(Math.max(1,e.w));
        const f=strength*(dist-target),fx=f*dx/dist,fy=f*dy/dist;
        forces[e.a][0]+=fx;forces[e.a][1]+=fy;
        forces[e.b][0]-=fx;forces[e.b][1]-=fy;
      }
      nodes.forEach((n,i)=>{
        const cent=.008;
        // The center belongs to the broadcast HOST role, not an audience
        // account. Reserve that footprint without fabricating host edges.
        const hx=n.x-graphHostPosition.x,hy=n.y-graphHostPosition.y;
        const hd=Math.max(1,Math.hypot(hx,hy));
        if(hd<78){
          forces[i][0]+=(hx/hd)*(78-hd)*.21;
          forces[i][1]+=(hy/hd)*(78-hd)*.21;
        }
        forces[i][0]+=(graphWidth/2-n.x)*cent;
        forces[i][1]+=(graphHeight/2-n.y)*cent;
        n.vx=(n.vx+forces[i][0])*.77;n.vy=(n.vy+forces[i][1])*.77;
        n.x=clamp(n.x+n.vx,20,graphWidth-20);n.y=clamp(n.y+n.vy,23,graphHeight-25);
      });
    }
    for(const n of nodes){
      const dx=n.x-graphHostPosition.x,dy=n.y-graphHostPosition.y;
      const dist=Math.max(1,Math.hypot(dx,dy));
      if(dist<49){
        const a=dist<.01?deterministicSeed(n.id)*Math.PI*2:Math.atan2(dy,dx);
        n.x=clamp(graphHostPosition.x+Math.cos(a)*49,20,graphWidth-20);
        n.y=clamp(graphHostPosition.y+Math.sin(a)*49,23,graphHeight-25);
      }
    }
    return {nodes,links,edges:pool.edges};
  }
  function makeNode(node,{moment=false}={}){
    const group=svgEl('g'),n=svgEl('circle'),id=node.id,profile=node.p||[];
    group.dataset.actor=id;group.style.cursor='pointer';group.setAttribute('tabindex','0');
    group.setAttribute('role','button');group.setAttribute('aria-label','Inspect observed activity of '+shortId(id));
    n.setAttribute('class','node-core');
    n.setAttribute('cx',String(node.x));n.setAttribute('cy',String(node.y));
    n.setAttribute('r',String(moment?7:clamp(4+Math.sqrt(profile[1]||0)*.8,5,12)));
    n.setAttribute('fill',Number(profile[4])>0?'#d4ad79':'#69c8d8');
    n.setAttribute('stroke','#accad2');n.setAttribute('stroke-width','1');
    const halo=svgEl('circle');
    halo.setAttribute('class','node-halo');
    halo.setAttribute('cx',String(node.x));halo.setAttribute('cy',String(node.y));
    halo.setAttribute('r','0');halo.setAttribute('stroke','#6de7e9');
    group.append(halo,n);
    const title=svgEl('title');
    title.textContent=shortId(id)+' · '+number(profile[1]||0)+
      ' observed comments across historical captures. Click to inspect.';
    group.append(title);
    const selected=()=>selectActor(id);
    group.addEventListener('click',selected);
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selected();}});
    return group;
  }
  function drawHostNode(){
    const parent=$('networkHostNode');parent.replaceChildren();
    const g=svgEl('g'),halo=svgEl('circle'),body=svgEl('circle');
    g.setAttribute('class','host-role-node');
    g.dataset.actor=HOST_NODE;
    g.setAttribute('role','button');g.setAttribute('tabindex','0');
    g.setAttribute('aria-label','Inspect broadcast host role and unverified speech mentions');
    g.style.cursor='pointer';
    const selected=state.selectedActor===HOST_NODE;
    for(const [k,v] of [['cx',graphHostPosition.x],['cy',graphHostPosition.y],
      ['r',29],['stroke','#e5bc75'],['stroke-width',selected?3.5:1.5],
      ['stroke-opacity',selected?1:.8],['fill','#071d37']])
      halo.setAttribute(k,String(v));
    for(const [k,v] of [['cx',graphHostPosition.x],['cy',graphHostPosition.y],
      ['r',22],['stroke','#edc989'],['stroke-width',1.6],
      ['fill','#2b4a5a']])
      body.setAttribute(k,String(v));
    const name=svgEl('text');
    for(const [k,v] of [['x',graphHostPosition.x],['y',graphHostPosition.y+4],
      ['text-anchor','middle'],['fill','#fff1cf'],['font-size',12],
      ['font-weight','700']])name.setAttribute(k,String(v));
    name.textContent='HOST';
    const caption=svgEl('text');
    for(const [k,v] of [['x',graphHostPosition.x],['y',graphHostPosition.y+43],
      ['text-anchor','middle'],['fill','#edc989'],['font-size',10]])
      caption.setAttribute(k,String(v));
    caption.textContent='ROLE · AUDIO UNVERIFIED';
    const title=svgEl('title');
    title.textContent='Broadcast host role. No verified speaker identity or host-to-viewer replies.';
    g.append(halo,body,name,caption,title);
    const click=()=>selectActor(HOST_NODE);
    g.addEventListener('click',click);
    g.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();click();}
    });
    parent.append(g);
  }
  function reviewParticipantMention(reference){
    // Collector comment time is observed. Media/speech clock is independent.
    // Don't label a tentative nickname as a verified addressee.
    state.selectedActor=reference.from;
    state.graphHistoryLimit=35;
    $('chatScope').value='near';
    $('chatSearch').value='';
    seekEvent(reference.t);
    renderChat();
    renderGraphInspector();
    drawHostNode();
    updateGraphActivity();
    if(window.matchMedia('(max-width:700px)').matches)showMobile('conversation');
    toast(reference.confidence==='explicit'?
      'Observed exact @handle reference. Not proof of a reply or acknowledgment.':
      'Possible named call-out from an observed chat message. Tentative alias match, not a verified reply.');
  }
  function drawParticipantMentionEdges(positions){
    const layer=$('networkParticipantLinks');layer.replaceChildren();
    if(!['all','participant_mention'].includes(graphEventFilter()))return;
    const byPair=new Map();
    for(const r of peerMentions().rows){
      if(!positions.has(r.from)||!positions.has(r.to))continue;
      if(state.graphMode==='moment'&&Math.abs(r.t-state.eventT)>90)continue;
      const key=r.from+'|'+r.to+'|'+r.confidence;
      if(!byPair.has(key))byPair.set(key,[]);
      byPair.get(key).push(r);
    }
    for(const [pair,refs] of byPair){
      const {from:sender,to:recipient,confidence}=refs[0];
      const a=positions.get(sender),b=positions.get(recipient);
      if(!a||!b||sender===recipient)continue;
      const inferred=confidence==='candidate';
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy));
      // Offset the candidate in case the same pair also has a directly
      // observed @mention, so neither edge's meaning is hidden.
      const shift=inferred?5:0,nx=-dy/len*shift,ny=dx/len*shift;
      const x1=a.x+dx/len*15+nx,y1=a.y+dy/len*15+ny,
        x2=b.x-dx/len*18+nx,y2=b.y-dy/len*18+ny;
      const group=svgEl('g');
      group.setAttribute('class','participant-mention-edge'+
        (inferred?' mention-alias-candidate':' mention-exact'));
      group.setAttribute('role','button');group.setAttribute('tabindex','0');
      group.setAttribute('aria-label',
        'Inspect '+number(refs.length)+' '+(inferred?'possible bare-name call-out(s)':'exact @handle reference(s)')+
        ' from '+shortId(sender)+' to '+shortId(recipient)+'. Not verified replies.');
      group.setAttribute('data-from-actor',sender);
      group.setAttribute('data-to-actor',recipient);
      group.setAttribute('data-reference-count',String(refs.length));
      group.setAttribute('data-confidence',confidence);
      group.style.cursor='pointer';
      const line=(color,width,pattern)=>{
        const element=svgEl('line');
        for(const [key,value] of [['x1',x1],['y1',y1],['x2',x2],['y2',y2],
          ['stroke',color],['stroke-width',width],['stroke-opacity',.88]])
          element.setAttribute(key,String(value));
        if(pattern){
          element.setAttribute('stroke-dasharray',inferred?'5 7':'2 5');
          element.setAttribute('marker-end','url(#participantMentionArrow)');
        }
        return element;
      };
      group.append(line(inferred?'#c7a5ef':'#7ee0c9',
        graphEventFilter()==='participant_mention'?2.5:1.7,true));
      const hit=line('transparent',15,false);
      hit.setAttribute('pointer-events','stroke');group.append(hit);
      const title=svgEl('title');
      title.textContent=number(refs.length)+' '+(inferred?'UNVERIFIED unique nickname candidate(s)':'observed exact @handle reference(s)')+
        ': '+shortId(sender)+' → '+shortId(recipient)+
        '. From original comment text, NOT proof of a reply. Select to inspect.';
      group.append(title);
      const select=()=>{
        const ref=refs.reduce((best,x)=>
          Math.abs(x.t-state.eventT)<Math.abs(best.t-state.eventT)?x:best,refs[0]);
        reviewParticipantMention(ref);
      };
      group.addEventListener('click',select);
      group.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}
      });
      layer.append(group);
    }
  }
  function drawHostCandidateEdges(positions){
    const layer=$('networkHostLinks');layer.replaceChildren();
    if(!['all','host_shoutout_candidate'].includes(graphEventFilter()))return;
    const rows=(session().derivedSpeechEvents||[]).filter(e=>
      e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED' &&
      positions.has(e.candidateActorId) && e.sourceKey);
    for(const e of rows){
      const target=positions.get(e.candidateActorId);
      const group=svgEl('g');
      group.setAttribute('class','host-candidate-edge');
      group.setAttribute('role','button');group.setAttribute('tabindex','0');
      group.setAttribute('aria-label',
        'Review UNVERIFIED spoken-name candidate to '+shortId(e.candidateActorId)+' in original recording');
      group.setAttribute('data-candidate-id',e.id);
      group.setAttribute('data-target-actor',e.candidateActorId);
      group.style.cursor='pointer';
      const makeLine=(stroke,width,opacity,dashed)=>{
        const line=svgEl('line');
        const dx=target.x-graphHostPosition.x,dy=target.y-graphHostPosition.y,
          span=Math.max(1,Math.hypot(dx,dy));
        const x2=target.x-dx/span*17,y2=target.y-dy/span*17;
        for(const [k,v] of [['x1',graphHostPosition.x],['y1',graphHostPosition.y],
          ['x2',x2],['y2',y2],['stroke',stroke],['stroke-width',width],
          ['stroke-opacity',opacity]])line.setAttribute(k,String(v));
        if(dashed){
          line.setAttribute('stroke-dasharray','6 6');
          line.setAttribute('marker-end','url(#asrCandidateArrow)');
        }
        return line;
      };
      group.append(makeLine('#edc17b',graphEventFilter()==='host_shoutout_candidate'?2.8:1.9,.87,true));
      const hit=makeLine('transparent',15,1,false);
      hit.setAttribute('pointer-events','stroke');group.append(hit);
      const title=svgEl('title');title.textContent=
        'ASR candidate, NOT confirmed host reply · '+shortId(e.candidateActorId)+
        ' · click to review original audio at source-media time';
      group.append(title);
      const click=()=>reviewShoutoutCandidate(e);
      group.addEventListener('click',click);
      group.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();click();}
      });
      layer.append(group);
    }
  }
  function drawRoomNode(){
    const layer=$('networkRoomNode');layer.replaceChildren();
    const noActor=(session().comments||[]).some(r=>!r[1]) ||
      (session().interactions||[]).some(r=>!r[2]);
    const roomCount=(session().roomEvents||[]).length;
    if(!noActor&&!roomCount)return;
    const g=svgEl('g'),c=svgEl('circle'),label=svgEl('text');
    g.setAttribute('role','button');g.setAttribute('tabindex','0');
    g.setAttribute('aria-label','Inspect aggregate room-wide or unattributed events');
    g.setAttribute('class','room-signal-node');
    g.style.cursor='pointer';
    for(const [k,v] of [['cx',graphRoomPosition.x],['cy',graphRoomPosition.y],
      ['r',19],['fill','#1e5361'],['stroke','#9ccbc6'],['stroke-width',1.4]])
      c.setAttribute(k,String(v));
    for(const [k,v] of [['x',graphRoomPosition.x],['y',graphRoomPosition.y+4],
      ['text-anchor','middle'],['fill','#e6faf6'],['font-size',9],['font-weight','700']])
      label.setAttribute(k,String(v));
    label.textContent='ROOM';
    g.append(c,label);
    const title=svgEl('title');title.textContent=
      'Aggregate/unattributed platform events. This is NOT a viewer account.';
    g.append(title);
    const click=()=>{
      state.graphEventKind='room';$('graphEventKind').value='room';
      state.selectedActor=null;updateGraphFilterNote();renderGraph();
      $('graphInspector').textContent=
        'Room signals are unattributed. No synthetic user nodes or implied purchases.';
    };
    g.addEventListener('click',click);
    g.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();click();}
    });
    layer.append(g);
  }
  function renderGraph(){
    const gNodes=$('networkNodes'),gEdges=$('networkEdges');
    gNodes.replaceChildren();gEdges.replaceChildren();
    const pool=graphPool(),moment=state.graphMode==='moment';
    let participants=[],links=[];
    if(moment){
      const ids=[...pool.local.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,42);
      const m=new Map((D.community?.nodes||[]).map(p=>[p[0],p]));
      participants=ids.map(([id,count],i)=>{
        const angle=2*Math.PI*i/Math.max(1,ids.length)-Math.PI/2;
        const radius=ids.length<12?132:145+(i%3)*21;
        return {id,p:m.get(id)||[id,count,1,1,0,0],
          x:graphHostPosition.x+Math.cos(angle)*radius,
          y:graphHostPosition.y+Math.sin(angle)*radius};
      });
      // A time ring replaces the old central hub/spokes. A spoke from HOST
      // to every participant would falsely imply a direct conversation.
      const ring=svgEl('circle');
      for(const [k,v] of [['cx',graphHostPosition.x],['cy',graphHostPosition.y],
        ['r',128],['fill','none'],['stroke','#528798'],['stroke-opacity',.42],
        ['stroke-width',1],['stroke-dasharray','2 9']])
        ring.setAttribute(k,String(v));
      gEdges.append(ring);
      $('graphStatline').textContent=number(ids.length)+
        (graphEventFilter()==='host_shoutout_candidate'?
          ' possible named targets (media-time ASR; NOT event-clock replies)':
          graphEventFilter()==='participant_mention'?
          ' observed @mention endpoints within ±90 collector seconds (NOT replies)':
          ' observed accounts within ±90 collector seconds; no synthetic host spokes');
    }else{
      const keep=state.linkDensity==='all'?pool.edges.length:
        Math.min(85,Math.max(22,Math.round(pool.edges.length*.55)));
      const shown=pool.edges.slice(0,keep);
      const layout=stableForceLayout({...pool,edges:shown});
      participants=layout.nodes;links=layout.edges;
      const positions=new Map(participants.map(n=>[n.id,n]));
      for(const [a,b,w] of links){
        const aa=positions.get(a),bb=positions.get(b);if(!aa||!bb)continue;
        const line=svgEl('line');
        for(const [k,v] of [['x1',aa.x],['y1',aa.y],['x2',bb.x],['y2',bb.y],
          ['stroke','#5c9ba9'],['stroke-width',clamp(.65+Math.log1p(w)*.6,.8,4)],
          ['stroke-opacity',.53]])line.setAttribute(k,String(v));
        line.setAttribute('data-pair',a+'|'+b);
        gEdges.append(line);
      }
      $('graphStatline').textContent=number(participants.length)+' observed accounts · '+
        number(links.length)+' of '+number(pool.totalLinks)+' same-minute co-activity links · '+
        (graphEventFilter()==='all'?'all recorded action kinds':
          graphEventFilter()==='host_shoutout_candidate'?'unverified ASR links only':
          'filtered by '+graphEventFilter());
    }
    for(const n of participants)gNodes.append(makeNode(n,{moment}));
    const positions=new Map(participants.map(n=>[n.id,n]));
    drawParticipantMentionEdges(positions);
    drawHostCandidateEdges(positions);
    drawHostNode();
    drawRoomNode();
    state.graphNodes=participants;state.graphEdges=links;
    updateGraphActivity();
    applyGraphTransform();
    const source=moment?'Moment positions represent observed activity within ±90 collector seconds. ':
      'Solid links represent recorded same-minute co-activity, not replies or influence. ';
    $('graphProvenance').textContent=source+
      'Mint dotted arrows = exact @handles; violet dashes = tentative bare nicknames. Neither is a confirmed reply or friendship. '+
      'HOST is a role, not a verified ASR speaker. Gold dashed arrows = UNVERIFIED speech-name candidates on an independent media clock. '+
      'Unattributed room signals never create viewers. Gifts are not merchandise sales.';
  }
  function updateGraphActivity(){
    const local=graphActorCounts(),search=$('graphSearch').value.trim().toLowerCase();
    const events=visibleActivity().filter(e=>allowsKind(e.kind)),
      byActor=new Map(),shownIds=new Set();
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)').matches?
      'off':state.graphMotion;
    for(const e of events){
      if(!e.actor)continue;
      const age=Math.max(0,state.eventT-e.t);
      const weight=(1-age/glowWindow)*Math.min(1.9,1+.18*Math.log1p(e.units));
      const next={...e,weight,age},prev=byActor.get(e.actor);
      if(!prev||next.weight*(livePriority[e.kind]||1)>
         prev.weight*(livePriority[prev.kind]||1))byActor.set(e.actor,next);
    }
    const positions=new Map(state.graphNodes.map(n=>[n.id,n]));
    const layer=$('networkPulseLayer');
    layer.replaceChildren();
    const rendered=[];
    for(const el of $('networkNodes').children){
      const id=el.dataset.actor,selected=id===state.selectedActor;
      const activity=byActor.get(id);
      const active=local.has(id)||!!activity;
      const match=!search||id.toLowerCase().includes(search)||shortId(id).toLowerCase().includes(search);
      shownIds.add(id);
      el.style.opacity=match?(active||selected?'1':'.68'):'.13';
      const core=el.querySelector('circle.node-core'),halo=el.querySelector('circle.node-halo');
      if(!core||!halo)continue;
      const point=positions.get(id);
      const base=state.graphMode==='moment'?7:
        clamp(4+Math.sqrt(Number(point?.p?.[1]||0))*.8,5,12);
      const color=activity?(liveColors[activity.kind]||'#a9c4cd'):null,
        intensity=activity?.weight||0;
      el.dataset.pulseKind=activity?.kind||'';
      el.dataset.pulseStrength=intensity.toFixed(3);
      core.setAttribute('r',String(base+((motion!=='off')?Math.min(3,intensity*2.1):0)));
      core.setAttribute('stroke',selected?'#ffffff':color|| (active?'#e2c044':'#74a5ae'));
      core.setAttribute('stroke-width',String(selected?'3.4':activity?'3':active?'2.2':'1'));
      core.setAttribute('fill',color||(Number(point?.p?.[4]||0)>0?'#d4ad79':'#69c8d8'));
      const show=!!activity&&motion!=='off'&&match;
      halo.setAttribute('r',String(base+5+intensity*7));
      halo.setAttribute('stroke',color||liveColors.comment);
      halo.setAttribute('stroke-opacity',String(show?Math.min(.95,.3+intensity*.5):0));
      halo.setAttribute('data-visible',String(show));
      if(show&&point)rendered.push({...activity,x:point.x,y:point.y,r:base});
    }
    // Only accentuate an existing coactivity link if both actual endpoints
    // have recent events. No simulated influence travelling along edges.
    for(const line of $('networkEdges').querySelectorAll('line[data-pair]')){
      const [a,b]=line.dataset.pair.split('|');
      const both=byActor.has(a)&&byActor.has(b);
      const one=byActor.has(a)||byActor.has(b);
      const match=!search||a.toLowerCase().includes(search)||b.toLowerCase().includes(search)||
        shortId(a).toLowerCase().includes(search)||shortId(b).toLowerCase().includes(search);
      const alpha=(!match) ? 0.1 : state.selectedActor ?
        ((a===state.selectedActor||b===state.selectedActor) ? 0.9 : 0.09) :
        (both ? 0.95 : one ? 0.72 : 0.42);
      line.setAttribute('stroke-opacity',String(alpha));
      line.setAttribute('stroke',both?'#d6f5e8':'#5c9ba9');
    }
    if(motion!=='off'){
      const multiplier=motion==='subtle' ? 0.62 : 1;
      for(const ev of rendered.slice(0,80)){
        const ring=svgEl('circle'),age=ev.age/glowWindow;
        const radius=ev.r+7+age*(motion==='subtle'?10:24);
        for(const [key,value] of [['cx',ev.x],['cy',ev.y],['r',radius],
          ['stroke',liveColors[ev.kind]||'#a9c4cd'],
          ['stroke-opacity',clamp((1-age)*multiplier,.03,1)],
          ['stroke-width',motion==='subtle'?1.5:2.6]])
          ring.setAttribute(key,String(value));
        ring.setAttribute('class','network-activity-pulse');
        ring.style.setProperty('--glow',liveColors[ev.kind]||'#a9c4cd');
        layer.append(ring);
      }
      // Actorless notifications and room/platform events illuminate only the
      // independent ROOM indicator. A known account omitted by ranking does
      // NOT get mislabeled as anonymous or become an invented host reply.
      const actorless=events.filter(e=>!e.actor);
      const roomRows=(graphEventFilter()==='all'||graphEventFilter()==='room')?
        recentRoomEvents():[];
      const markers=[
        ...actorless.map(e=>({t:e.t,kind:e.kind})),
        ...roomRows.map(r=>({t:Number(r[0]),kind:'room_signal'}))
      ].sort((a,b)=>a.t-b.t);
      if(markers.length){
        const latest=markers[markers.length-1];
        const age=clamp((state.eventT-latest.t)/glowWindow,0,1);
        const ring=svgEl('circle');
        const color=latest.kind==='room_signal'?'#9bd7c8':
          (liveColors[latest.kind]||'#a9c4cd');
        for(const [key,value] of [['cx',graphRoomPosition.x],
          ['cy',graphRoomPosition.y],['r',22+age*38],
          ['stroke',color],['stroke-opacity',(1-age)*.75*multiplier],
          ['stroke-width',2.3]])
          ring.setAttribute(key,String(value));
        ring.setAttribute('class','network-activity-pulse room-signal-pulse');
        ring.style.setProperty('--glow',color);
        layer.append(ring);
      }
    }
    // Highlight a participant's original @mention or plausible nickname
    // reference on the OBSERVED COMMENT/COLLECTOR clock. Source text is the
    // evidence; glowing this edge never implies the recipient replied.
    const peerRows=peerMentions().rows;
    for(const edge of $('networkParticipantLinks').children){
      const from=edge.getAttribute('data-from-actor'),
        to=edge.getAttribute('data-to-actor'),
        confidence=edge.getAttribute('data-confidence');
      const matching=peerRows.some(r=>r.from===from&&r.to===to&&
        r.confidence===confidence&&
        r.t<=state.eventT+.0001&&r.t>=state.eventT-glowWindow);
      edge.dataset.collectorActive=String(matching);
      edge.style.opacity=state.selectedActor&&state.selectedActor!==from&&
        state.selectedActor!==to?'.23':'1';
    }
    // Animate ASR evidence ONLY on its own source-media clock. It never
    // appears as a collector-clock action and never creates coactivity edges.
    const mediaTime=state.track==='events'||!state.source?null:sourceAbsoluteMediaTime();
    let activeSpeech=0;
    const namedRefs=new Map((session().derivedSpeechEvents||[])
      .filter(e=>e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED').map(e=>[e.id,e]));
    for(const link of $('networkHostLinks').children){
      const target=link.getAttribute('data-target-actor');
      link.style.opacity=state.selectedActor&&state.selectedActor!==HOST_NODE&&
        state.selectedActor!==target?'.20':'1';
      const speech=namedRefs.get(link.getAttribute('data-candidate-id'));
      const start=Number(speech?.mediaStartSec),end=Number(speech?.mediaEndSec);
      const matching=mediaTime!==null&&Number.isFinite(start)&&
        speech?.sourceKey===state.source.key&&
        mediaTime>=start-2&&mediaTime<=Math.max(start,end)+2;
      link.dataset.mediaActive=String(matching);
      if(!matching)continue;
      activeSpeech++;
      const pos=positions.get(target);
      if(pos){
        const marker=svgEl('circle');
        for(const [key,value] of [['cx',pos.x],['cy',pos.y],['r',18],
          ['stroke','#f2ce8a'],['stroke-width',2.1],
          ['stroke-opacity',.95],['stroke-dasharray','3 4']])
          marker.setAttribute(key,String(value));
        marker.setAttribute('fill','none');
        marker.setAttribute('class','source-asr-active-marker');
        layer.append(marker);
      }
      if(motion!=='off'){
        const halo=svgEl('circle');
        for(const [key,value] of [['cx',graphHostPosition.x],
          ['cy',graphHostPosition.y],['r',40],['stroke','#f2ce8a'],
          ['stroke-width',2.1],['stroke-opacity',.75]])
          halo.setAttribute(key,String(value));
        halo.setAttribute('fill','none');
        halo.setAttribute('class','source-asr-active-marker');
        layer.append(halo);
      }
    }
    $('graphMotionNote').textContent=activeSpeech?
      'ASR candidate active on SOURCE MEDIA TIME · speaker unverified':
      'Account pulses = collector time; dashed ASR links = independent media time';
    updateActivityTicker(events);
  }
  function selectActor(id){
    if(id!==HOST_NODE&&!session().accountLabels?.[id])return;
    state.selectedActor=id;
    state.graphHistoryLimit=35;
    renderGraphInspector();
    drawHostNode();
    updateGraphActivity();
    if(window.matchMedia('(max-width:700px)').matches)showMobile('constellation');
  }
  function renderGraphInspector(){
    const box=$('graphInspector');box.replaceChildren();
    const id=state.selectedActor;
    if(!id){
      box.append(elem('p','fine',
        'Select an account or HOST to inspect source-backed event history. Event filters also filter graph pulses.'));
      return;
    }
    if(id===HOST_NODE){
      box.append(elem('strong','', 'HOST · broadcast role (speaker not verified)'));
      box.append(elem('p','fine',
        'No verified host-to-viewer responses or platform host actions are recorded. Only ASR name candidates are available at independent source-media timestamps.'));
      const candidates=(session().derivedSpeechEvents||[])
        .filter(e=>e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED');
      box.append(elem('p','fine',
        number(candidates.length)+' tentative spoken-name mentions · 0 confirmed links'));
      for(const e of candidates){
        const b=elem('button','graph-history-row',
          'ASR ~'+fmt(e.mediaStartSec)+' · '+shortId(e.candidateActorId)+
          ' · UNVERIFIED · review original audio ↗');
        b.type='button';b.dataset.historyKind='host_shoutout_candidate';
        b.addEventListener('click',()=>reviewShoutoutCandidate(e));box.append(b);
      }
      return;
    }
    const comments=(session().comments||[]).filter(r=>r[1]===id)
      .map(r=>({t:Number(r[0]),kind:'comment',units:1,text:String(r[2]||'')}));
    const actions=(session().interactions||[]).filter(r=>r[2]===id)
      .map(r=>({t:Number(r[0]),kind:r[1],units:Number(r[3])||0,
        details:r[4]||{}}));
    const candidates=(session().derivedSpeechEvents||[]).filter(e=>
      e.candidateActorId===id&&e.reviewStatus==='CANDIDATE_ASR_UNVERIFIED');
    const mentions=peerMentions().rows.filter(e=>e.from===id||e.to===id);
    const sentMentions=mentions.filter(e=>e.from===id),receivedMentions=mentions.filter(e=>e.to===id);
    const counts=new Map();
    for(const e of [...comments,...actions]){
      counts.set(e.kind,(counts.get(e.kind)||0)+1);
    }
    box.append(elem('strong','',shortId(id)+' · observed account'));
    box.append(elem('p','fine',
      number(comments.length)+' comments · '+number(actions.length)+
      ' deliberate-action notifications · '+number(candidates.length)+
      ' unverified ASR named references · '+number(sentMentions.length)+
      ' addressed others · '+number(receivedMentions.length)+' referenced this account'));
    box.append(elem('p','graph-history-summary',
      [...counts].map(([kind,n])=>number(n)+' '+(liveLabels[kind]||kind)).join(' · ')||
      'No attributed collector actions'));
    // Speech references are shown separately because a media timestamp must
    // NOT be sorted into the collector-clock event history.
    if(graphEventFilter()==='all'||graphEventFilter()==='host_shoutout_candidate'){
      for(const e of candidates){
        const b=elem('button','graph-history-row graph-asr-history',
          'ASR ~'+fmt(e.mediaStartSec)+' (MEDIA TIME) · possible named reference · review ↗');
        b.type='button';b.dataset.historyKind='host_shoutout_candidate';
        b.addEventListener('click',()=>reviewShoutoutCandidate(e));box.append(b);
      }
    }
    if(graphEventFilter()==='host_shoutout_candidate'){
      if(!candidates.length)box.append(elem('p','fine','No ASR candidate naming this account.'));
      return;
    }
    if(['all','participant_mention'].includes(graphEventFilter())){
      for(const m of mentions.slice(0,state.graphHistoryLimit)){
        const direction=m.from===id?'→ '+shortId(m.to):'← '+shortId(m.from);
        const certainty=m.confidence==='explicit'?'exact @handle':'possible bare-name';
        const b=elem('button','graph-history-row '+(m.confidence==='explicit'?
          'graph-exact-mention':'graph-possible-mention'),
          fmt(m.t)+' · '+direction+' · '+certainty+
          ' · '+m.text.slice(0,95)+' · inspect ↗');
        b.type='button';b.dataset.historyKind='participant_mention';
        b.dataset.mentionConfidence=m.confidence;
        b.addEventListener('click',()=>reviewParticipantMention(m));box.append(b);
      }
      if(mentions.length>state.graphHistoryLimit){
        const b=elem('button','graph-history-more',
          'SHOW MORE MENTIONS ('+number(mentions.length-state.graphHistoryLimit)+')');
        b.type='button';b.addEventListener('click',()=>{
          state.graphHistoryLimit+=35;renderGraphInspector();
        });box.append(b);
      }
    }
    if(graphEventFilter()==='participant_mention'){
      if(!mentions.length)box.append(elem('p','fine','No direct or candidate name references involving this account.'));
      return;
    }
    const filtered=[...comments,...actions].filter(e=>
      graphEventFilter()==='all'||e.kind===graphEventFilter())
      .filter(e=>Number.isFinite(e.t))
      .sort((a,b)=>a.t-b.t||a.kind.localeCompare(b.kind));
    if(!filtered.length){
      box.append(elem('p','fine',
        'No recorded '+(graphEventFilter()==='room'?'room-level account activity':graphEventFilter())+
        ' for this account.'));
      return;
    }
    const show=Math.min(filtered.length,state.graphHistoryLimit);
    box.append(elem('p','fine',
      number(show)+' / '+number(filtered.length)+' collector-clock observations shown · chronological'));
    for(const e of filtered.slice(0,show)){
      let description=fmt(e.t)+' · '+(liveLabels[e.kind]||e.kind.replaceAll('_',' '));
      if(e.kind==='comment')description+=' · '+e.text.slice(0,105);
      if(e.kind==='like'&&e.units>0)description+=' · '+number(e.units)+' reported units';
      if(e.kind==='gift'&&e.units>0)description+=' · '+number(e.units)+' completed virtual units';
      if(e.kind==='gift_progress')description+=' · progress only, NOT a completed gift';
      const b=elem('button','graph-history-row',description);
      b.type='button';b.dataset.historyKind=e.kind;
      b.dataset.clock='collector';
      b.addEventListener('click',()=>seekEvent(e.t));
      box.append(b);
    }
    if(filtered.length>show){
      const b=elem('button','graph-history-more',
        'SHOW NEXT '+number(Math.min(35,filtered.length-show))+
        ' · '+number(filtered.length-show)+' remain');
      b.type='button';b.addEventListener('click',()=>{
        const top=box.scrollTop;
        state.graphHistoryLimit+=35;
        renderGraphInspector();box.scrollTop=top;
      });
      box.append(b);
    }
  }
  function applyGraphTransform(){
    $('networkViewport').setAttribute('transform','translate('+state.panX+' '+state.panY+') scale('+state.graphZoom+')');
  }
  function drawTimeline(){
    const sc=$('waveScroll'),cv=$('signals'),duration=Math.max(1,session().duration);
    const width=Math.max(1450,Math.round(sc.clientWidth*1.6))*state.zoom,dpr=Math.min(2,window.devicePixelRatio||1);
    state.timelineWidth=width;cv.width=Math.round(width*dpr);cv.height=Math.round(355*dpr);
    cv.style.width=width+'px';cv.style.height='355px';$('waveStage').style.width=width+'px';
    const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#f7faf9';ctx.fillRect(0,0,width,355);
    const rows=session().bins||[];
    const axisX=t=>42+clamp(t/duration,0,1)*(width-48);
    for(let i=0;i<lanes.length;i++){
      const lane=lanes[i],top=40+i*63,bottom=top+58;
      ctx.fillStyle=i%2===0?'#edf5f3':'#fafcfc';ctx.fillRect(0,top,width,63);
      ctx.strokeStyle='#d0dede';ctx.beginPath();ctx.moveTo(0,bottom+5);ctx.lineTo(width,bottom+5);ctx.stroke();
      const peak=Math.max(1,...rows.map(lane.value));
      ctx.beginPath();
      rows.forEach((r,j)=>{
        const x=axisX(r[0]),y=bottom-49*lane.value(r)/peak;
        if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      });
      ctx.strokeStyle=lane.color;ctx.lineWidth=2;
      ctx.setLineDash(lane.heuristic?[5,5]:[]);ctx.stroke();ctx.setLineDash([]);
    }
    const step=Math.max(60,Math.ceil(duration/Math.max(6,Math.round(width/130))/60)*60);
    ctx.font='11px Consolas,monospace';ctx.fillStyle='#4d6974';
    for(let t=0;t<=duration;t+=step){
      const x=axisX(t);
      ctx.beginPath();ctx.strokeStyle='#b2c6cc';ctx.setLineDash([2,5]);
      ctx.moveTo(x,40);ctx.lineTo(x,355);ctx.stroke();ctx.setLineDash([]);
      ctx.fillText(fmt(t).slice(0,5),x+3,24);
    }
    const axis=$('laneLabels');axis.replaceChildren();
    const h=elem('div','lane-label heading');h.append('CAPTURE CLOCK',elem('small','','30-SECOND BINS'));axis.append(h);
    for(const lane of lanes){
      const l=elem('div','lane-label');l.append(elem('b','',lane.name),elem('strong','',String(Math.round(peakAt(state.eventT,lane.value)))),elem('small','',lane.unit));l.dataset.lane=String(lane.key);axis.append(l);
    }
    moveTimelineCursor(state.eventT,true);
  }
  function peakAt(t,valueFn){
    const bins=session().bins||[];if(!bins.length)return 0;
    const b=bins[clamp(Math.floor(t/30),0,bins.length-1)];return valueFn(b);
  }
  function moveTimelineCursor(t,scroll){
    const width=state.timelineWidth||1450,duration=Math.max(1,session().duration);
    const x=42+clamp(t/duration,0,1)*(width-48);
    $('playhead').style.left=x+'px';
    if(scroll&&state.follow){
      const sc=$('waveScroll'),left=clamp(x-sc.clientWidth*.45,0,Math.max(0,sc.scrollWidth-sc.clientWidth));
      if(Math.abs(sc.scrollLeft-left)>10)sc.scrollLeft=left;
    }
    if(Math.floor(t/30)!==state.lastLaneBin){
      state.lastLaneBin=Math.floor(t/30);
      for(const lane of lanes){
        const value=$('laneLabels').querySelector('[data-lane="'+lane.key+'"] strong');
        if(value)value.textContent=number(Math.round(peakAt(t,lane.value)));
      }
    }
  }
  function renderMediaStitch(){
    const section=$('mediaStitchSection'),holder=$('mediaStitchTracks'),
      details=$('mediaStitchDetails'),review=$('syncReviewSection'),list=$('syncCandidateList');
    const stitch=session().mediaStitch;
    holder.replaceChildren();list.replaceChildren();
    section.hidden=!stitch;review.hidden=!stitch;
    if(!stitch)return;
    const duration=Math.max(1,session().duration);
    const colors=['#4c98a1','#5381a0','#6b82aa'];
    const group=stitch.generations||[],segments=stitch.segments||[];
    for(const model of group){
      const track=elem('div','media-stitch-track');
      track.setAttribute('role','group');
      track.setAttribute('aria-label','Recorder generation '+(model.generation+1)+' estimated video coverage');
      const label=elem('span','media-stitch-label',
        'RECORDER '+(model.generation+1)+' · '+model.segmentCount+' parts');
      for(const seg of segments.filter(x=>x.generation===model.generation)){
        const start=clamp(Number(seg.estimatedEventStartSec)/duration,0,1);
        const stop=clamp(Number(seg.estimatedEventEndSec)/duration,0,1);
        if(stop<=start)continue;
        const piece=elem('button','media-stitch-range');
        piece.type='button';
        piece.style.left=(start*100)+'%';
        piece.style.width=(Math.max(.08,(stop-start)*100))+'%';
        piece.style.background=colors[model.generation%colors.length];
        piece.title='Recorder '+(model.generation+1)+
          ', segment '+seg.segmentOrdinal+'; collector position ~'+
          fmt(seg.estimatedEventStartSec)+' (provisional, NOT verified)';
        piece.setAttribute('aria-label',piece.title);
        piece.dataset.generation=String(model.generation);
        piece.dataset.segment=String(seg.segmentOrdinal);
        piece.addEventListener('click',()=>{
          const preferred=findReview().find(r=>r.mediaStitchGeneration===model.generation);
          if(preferred){
            setSource(preferred.key);
            seekEvent(clamp(seg.estimatedEventStartSec,0,duration));
          }else seekEvent(clamp(seg.estimatedEventStartSec,0,duration));
        });
        track.append(piece);
      }
      const row=elem('div','media-stitch-row');row.append(label,track);
      holder.append(row);
    }
    const rest=group.map(m=>
      'G'+(m.generation+1)+': fit residual p95 '+m.residualP95Seconds+
      's; drift slope '+m.slope.toFixed(5)).join(' · ');
    details.textContent=rest+' · 0 independently reviewed audiovisual anchors.';
    const reviewStatus=D.syncReviewStatus||{},candidates=(D.syncReviewCandidates||[])
      .filter(c=>findReview().some(r=>r.key===c.source));
    $('syncCandidateSummary').textContent=
      (reviewStatus.machineSpeechSegments||0)+' unreviewed ASR speech segments; '+
      candidates.length+' machine-suggested speech/chat overlaps. '+
      'All candidates require human video/audio inspection. No cross-clock match accepted.';
    if(!candidates.length){
      list.append(elem('span','fine','No sufficiently distinctive speech/chat overlap was detected in the short reviewed excerpts.'));
    }else for(const [i,c] of candidates.slice(0,15).entries()){
      const b=elem('button','',
        'Candidate '+(i+1)+' · overlap '+Math.round(c.overlap*100)+'% · delta '+
        (c.estimatedDeltaSeconds>=0?'+':'')+c.estimatedDeltaSeconds+' s');
      b.type='button';
      b.title='Machine-suggested timing comparison, not a verified reply or alignment anchor';
      b.addEventListener('click',()=>{
        setSource(c.source);
        const chosen=state.source?.transcript?.[c.speechIndex];
        if(chosen)seekEvent(chosen[0]);else seekEvent(session().comments[c.commentIndex]?.[0]||0);
        $('chatScope').value='wide';renderChat();
      });
      list.append(b);
    }
  }
  function populateEvidenceFilters(){
    const kinds=(rows,id)=>{
      const sel=$(id),prior=sel.value;
      sel.replaceChildren();
      const all=elem('option','','All observed kinds');
      all.value='all';sel.append(all);
      for(const kind of [...new Set(rows.map(x=>x[1]))].sort()){
        const op=elem('option','',kind.replaceAll('_',' '));op.value=kind;sel.append(op);
      }
      sel.value=[...sel.options].some(o=>o.value===prior)?prior:'all';
    };
    kinds(session().interactions||[],'actionKind');
    kinds(session().roomEvents||[],'roomEventKind');
  }
  function evidenceWindow(scope){
    return scope==='near'?90:scope==='wide'?900:Infinity;
  }
  function renderActionTimeline(){
    const host=$('actionEventList');host.replaceChildren();
    const events=session().interactions||[],kind=$('actionKind').value;
    const range=evidenceWindow($('actionScope').value),now=state.eventT;
    const selected=events.filter(r=>(kind==='all'||r[1]===kind)&&
      Math.abs(Number(r[0])-now)<=range);
    // The full archive is preserved; cap DOM rendering, not stored events.
    const display=selected.length>160?
      [...selected].sort((a,b)=>Math.abs(a[0]-now)-Math.abs(b[0]-now)).slice(0,160).sort((a,b)=>a[0]-b[0]):
      selected;
    $('actionEventSummary').textContent=number(selected.length)+' observed action records in scope'+
      (selected.length>display.length?'; '+number(display.length)+' nearest the playhead displayed':'');
    if(!display.length){
      host.append(elem('p','evidence-empty','No action of this type was observed in the selected collector interval.'));
    }else for(const row of display){
      const [t,k,actor,rawUnits,details]=row,units=Math.max(0,Number(rawUnits)||0);
      const note=k==='gift_progress'?'streak update, NOT completed gift':
        k==='gift'?'completed virtual gift units':
        k==='like'?'reported batch units':'observed action';
      const metadata=Object.entries(details||{}).filter(([key])=>key!=='observed_text')
        .slice(0,3).map(([key,value])=>key+'='+String(value)).join(' · ');
      const text=details?.observed_text?' · '+String(details.observed_text).slice(0,110):'';
      const b=elem('button','evidence-event',
        fmt(t)+' · '+k.replaceAll('_',' ')+' · '+(actor?shortId(actor):'actor unavailable')+
        ' · '+(units?number(units)+' units':'count not provided')+
        ' · '+note+(metadata?' · '+metadata:'')+text);
      b.type='button';b.addEventListener('click',()=>seekEvent(t));host.append(b);
    }
  }
  function renderRoomEvents(){
    const host=$('roomEventList');host.replaceChildren();
    const events=session().roomEvents||[],kind=$('roomEventKind').value;
    const range=evidenceWindow($('roomEventScope').value),now=state.eventT;
    const selected=events.filter(r=>(kind==='all'||r[1]===kind)&&
      Math.abs(Number(r[0])-now)<=range);
    const display=selected.length>160?
      [...selected].sort((a,b)=>Math.abs(a[0]-now)-Math.abs(b[0]-now)).slice(0,160).sort((a,b)=>a[0]-b[0]):
      selected;
    $('roomEventSummary').textContent=number(selected.length)+' aggregate/passive room signals in scope'+
      (selected.length>display.length?'; '+number(display.length)+' nearest the playhead displayed':'');
    if(!display.length){
      host.append(elem('p','evidence-empty','No room signal of this kind was observed in this interval.'));
    }else for(const [t,k,details] of display){
      const metadata=Object.entries(details||{}).slice(0,4)
        .map(([key,value])=>key+'='+String(value)).join(' · ');
      const b=elem('button','evidence-event',
        fmt(t)+' · '+k.replaceAll('_',' ')+(metadata?' · '+metadata:''));
      b.type='button';b.addEventListener('click',()=>seekEvent(t));host.append(b);
    }
  }
  function reviewShoutoutCandidate(e){
    const source=findReview().find(r=>r.key===e.sourceKey);
    if(!source){
      toast('The original source excerpt is unavailable. ASR mention remains unverified.');
      return;
    }
    setSource(source.key);
    const track=source.video?'video':source.audio?'audio':'events';
    if(track==='events'){
      toast('No source media exists for this speech candidate. No inferred sync.');
      return;
    }
    if(state.track!==track)selectTrack(track);
    const position=Number(e.mediaStartSec)-sourceStart(track);
    const declared=Number(source[track==='video'?'videoDurationSec':'audioDurationSec']||0);
    if(!Number.isFinite(position)||position<-.5||
       (declared>0&&position>declared+.5)){
      toast('This speech time is outside its original media excerpt; seek refused.');
      return;
    }
    seekSource(Math.max(0,position));
    $('chatScope').value='wide';renderChat();
    toast('UNVERIFIED ASR named reference. Confirm speaker and addressee in original audio; not a proven reply.');
  }
  function renderHostShoutouts(){
    const holder=$('hostShoutoutList');
    holder.replaceChildren();
    const all=session().derivedSpeechEvents||[];
    const scope=$('hostShoutoutScope').value;
    const rows=all.filter(e=>scope!=='source'||e.sourceKey===state.source?.key);
    $('hostShoutoutSummary').textContent=number(rows.length)+
      ' candidate name mentions in scope · '+number(all.length)+' total · 0 automatically verified';
    if(!rows.length){
      holder.append(elem('p','evidence-empty',
        all.length?'No candidate in this selected source. Choose all excerpts to inspect the rest.':
        'No unambiguous speech-to-handle candidate was identified in the transcribed excerpts. This does not establish that the host made no shout-outs.'));
      return;
    }
    for(const e of rows.slice(0,120)){
      const source=findReview().find(r=>r.key===e.sourceKey);
      const box=elem('button','evidence-event shoutout-candidate');
      box.type='button';
      box.dataset.kind='host_shoutout_candidate';
      box.dataset.sourceKey=e.sourceKey;
      box.dataset.reviewStatus=e.reviewStatus;
      const gen=Number.isInteger(e.mediaGeneration)?
        'Recorder '+number(e.mediaGeneration+1):'Source excerpt';
      const heading=elem('strong','',gen+' · ~'+fmt(e.mediaStartSec)+
        ' · possible shout-out to '+e.candidateHandle+
        ' (heard: "'+e.spokenAlias+'")');
      const excerpt=elem('span','shoutout-quote',
        'ASR: '+String(e.speechExcerpt||'').slice(0,270));
      const caveat=elem('small','',
        'UNVERIFIED ASR · '+String(e.matchStatus||'name alias')+
        ' · original media timing '+String(e.mediaClockStatus||'unknown')+
        ' · NOT a confirmed host reply');
      box.append(heading,excerpt,caveat);
      box.addEventListener('click',()=>reviewShoutoutCandidate(e));
      holder.append(box);
    }
  }
  function setMarkers(){
    const rail=$('eventRail');rail.replaceChildren();
    for(const marker of session().markers||[]){
      if(marker.kind!=='peak')continue;
      const b=elem('button','event-chip');
      b.type='button';b.append(fmt(marker.t)+' · '+marker.label,elem('small','',marker.note||'Recorded interval'));
      b.addEventListener('click',()=>seekEvent(marker.t));
      rail.append(b);
    }
  }
  const presets={
    review:{order:['media','conversation','constellation'],weights:[1.03,1.12,1.48]},
    community:{order:['constellation','conversation','media'],weights:[1.65,1.07,.9]},
    timeline:{order:['media','constellation','conversation'],weights:[.95,1.55,1.03]}
  };
  const layoutNames=['media','conversation','constellation'];
  function updateDockDimensions(){
    const dock=$('primaryDock'),w=state.layout.weights;
    // Every horizontal drag redistributes space; the neighboring panel
    // grows/shrinks responsively rather than overlaying the other panels.
    dock.style.gridTemplateColumns='minmax(0,'+w[0]+'fr) 10px minmax(0,'+
      w[1]+'fr) 10px minmax(0,'+w[2]+'fr)';
    dock.style.setProperty('--analysis-height',state.layout.height+'px');
    $('dockHeightGrip').setAttribute('aria-valuenow',String(state.layout.height));
    for(let index=0;index<2;index++){
      const pair=w[index]+w[index+1];
      $('dockGrip'+(index===0?'A':'B')).setAttribute('aria-valuenow',
        String(Math.round(100*w[index]/pair)));
    }
  }
  function saveLayout(){
    state.layout.preset='custom';
    $('layoutPreset').value='custom';
    setSaved(storageLayout,state.layout);
  }
  function applyLayout(preference){
    const preset=presets[preference.preset];
    const validOrder=Array.isArray(preference.order)&&
      preference.order.length===3&&new Set(preference.order).size===3&&
      preference.order.every(x=>layoutNames.includes(x));
    const order=validOrder?preference.order:preset?.order||presets.review.order;
    const weights=(Array.isArray(preference.weights)&&preference.weights.length===3?
      preference.weights:presets.review.weights).map(x=>clamp(Number(x),.55,3.6));
    const height=clamp(preference.height??430,280,780),dock=$('primaryDock');
    const panels=order.map(name=>dock.querySelector('[data-panel="'+name+'"]'));
    if(panels.some(el=>!el))throw Error('Workspace panel unavailable');
    dock.replaceChildren(
      panels[0],$('dockGripA'),panels[1],$('dockGripB'),panels[2]
    );
    state.layout={preset:preference.preset||'custom',order:[...order],weights:[...weights],height};
    updateDockDimensions();
    $('layoutPreset').value=presets[preference.preset]?preference.preset:'custom';
    setSaved(storageLayout,state.layout);
    showMobile(state.mobile);
  }
  function usePreset(type){
    if(!presets[type])return;
    applyLayout({preset:type,...presets[type],height:state.layout.height||430});
  }
  function modifyLayout(action,name){
    const order=[...state.layout.order],idx=order.indexOf(name);
    if(idx<0)return;
    const weights=[...state.layout.weights];
    if(action==='left'&&idx>0){
      [order[idx-1],order[idx]]=[order[idx],order[idx-1]];
      [weights[idx-1],weights[idx]]=[weights[idx],weights[idx-1]];
    }
    if(action==='right'&&idx<2){
      [order[idx],order[idx+1]]=[order[idx+1],order[idx]];
      [weights[idx],weights[idx+1]]=[weights[idx+1],weights[idx]];
    }
    if(action==='grow'){
      const partner=idx===2?1:idx+1,combined=weights[idx]+weights[partner];
      const growth=Math.min(.25,Math.max(0,weights[partner]-.55));
      weights[idx]+=growth;weights[partner]=combined-weights[idx];
    }
    applyLayout({preset:'custom',order,weights,height:state.layout.height});
  }
  function resizeAdjacent(index,deltaPx,basis=null,commit=true){
    const dock=$('primaryDock');
    const a=dock.querySelector('[data-panel="'+state.layout.order[index]+'"]');
    const b=dock.querySelector('[data-panel="'+state.layout.order[index+1]+'"]');
    const aw=basis?.a??a.getBoundingClientRect().width;
    const bw=basis?.b??b.getBoundingClientRect().width;
    const total=aw+bw,minSize=Math.min(245,total*.36);
    const left=clamp(aw+deltaPx,minSize,total-minSize);
    const weights=[...state.layout.weights],sum=weights[index]+weights[index+1];
    weights[index]=sum*(left/total);
    weights[index+1]=sum-weights[index];
    state.layout.weights=weights;
    updateDockDimensions();
    if(commit)saveLayout();
  }
  function setPanelHeight(next,commit=true){
    state.layout.height=clamp(next,280,780);
    updateDockDimensions();
    if(commit)saveLayout();
  }
  function wireResizers(){
    let active=null;
    const gripEls=[$('dockGripA'),$('dockGripB')];
    for(const [index,grip] of gripEls.entries()){
      grip.addEventListener('pointerdown',e=>{
        if(window.matchMedia('(max-width:1080px)').matches)return;
        e.preventDefault();
        const dock=$('primaryDock'),
          a=dock.querySelector('[data-panel="'+state.layout.order[index]+'"]'),
          b=dock.querySelector('[data-panel="'+state.layout.order[index+1]+'"]');
        active={kind:'width',index,x:e.clientX,
          basis:{a:a.getBoundingClientRect().width,b:b.getBoundingClientRect().width}};
        grip.classList.add('is-dragging');
      });
      grip.addEventListener('keydown',e=>{
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
        e.preventDefault();
        resizeAdjacent(index,e.key==='ArrowRight'?28:-28);
      });
    }
    const height=$('dockHeightGrip');
    height.addEventListener('pointerdown',e=>{
      if(window.matchMedia('(max-width:700px)').matches)return;
      e.preventDefault();active={kind:'height',y:e.clientY,height:state.layout.height};
      height.classList.add('is-dragging');
    });
    height.addEventListener('keydown',e=>{
      if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
      e.preventDefault();setPanelHeight(state.layout.height+(e.key==='ArrowDown'?35:-35));
    });
    $('dockHeightDown').addEventListener('click',()=>setPanelHeight(state.layout.height-40));
    $('dockHeightUp').addEventListener('click',()=>setPanelHeight(state.layout.height+40));
    window.addEventListener('pointermove',e=>{
      if(!active)return;
      if(active.kind==='width'){
        resizeAdjacent(active.index,e.clientX-active.x,active.basis,false);
      }else{
        setPanelHeight(active.height+e.clientY-active.y,false);
      }
    });
    const finish=()=>{
      if(!active)return;
      active=null;
      gripEls.forEach(g=>g.classList.remove('is-dragging'));
      height.classList.remove('is-dragging');
      saveLayout();
    };
    window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',finish);
  }
    function showMobile(name){
    state.mobile=name;
    for(const btn of $('mobileTabs').querySelectorAll('button[data-mobile-tab]'))
      btn.setAttribute('aria-selected',String(btn.dataset.mobileTab===name));
    for(const panel of document.querySelectorAll('.dock-panel'))
      panel.classList.toggle('mobile-active',panel.dataset.panel===name);
    $('timelinePanel').classList.toggle('mobile-active',name==='timeline');
    if(name==='timeline')drawTimeline();
  }
  function switchSession(id){
    const next=D.sessions.findIndex(s=>s.id===id);
    if(next<0)return;
    stopMedia();state.session=next;state.eventT=0;state.selectedEventT=0;
    state.selectedActor=null;state.graphMode='community';state.lastChatBucket=-1;
    state.graphEventKind='all';state.graphHistoryLimit=35;
    state.lastFocusedConversation=null;state.lastConversationHighlight=-1;
    state.networkStamp=-1;state.lastLaneBin=-1;
    $('graphCommunity').setAttribute('aria-pressed','true');
    $('graphMoment').setAttribute('aria-pressed','false');
    $('graphInspector').textContent='Select a node to inspect actual recorded contributions.';
    $('chatScope').value='near';$('chatSearch').value='';$('graphSearch').value='';
    $('sessionSelect').value=id;
    const s=session();
    const identity=s.identityScheme==='direct_tiktok_account_fields_v1'?
      number(Object.keys(s.accountLabels||{}).length)+' observed direct TikTok accounts (handles on deliberate interactions)':
      number(s.stats.chatters)+' historical HMAC commenters';
    const videoHint=s.mediaStitch?
      number(s.mediaStitch.segments.length)+' archived segments over '+
      number(s.mediaStitch.generations.length)+' recorder generations; clock mapping provisional.':
      (s.mediaCoveragePct==null?'Video coverage not audited.':'Reported archive media coverage '+s.mediaCoveragePct+'%.');
    const mediaInventory=s.sourceMediaInventory;
    const recordedVideo=mediaInventory&&mediaInventory.segments?
      ' Original R2 archive contains '+number(mediaInventory.segments)+
      ' segment objects (not automatically embedded as playable media).':'';
    $('inventoryStats').textContent=
      number(s.stats.records)+' published deliberate-action records from '+
      number(s.stats.sourceRecords||s.stats.records)+' collector source records; '+
      number(s.stats.comments)+' comments; '+identity+'. '+videoHint+
      ' Room/platform event payloads are not included in this public edition.';
    prepareVisualEvents();
    populateEvidenceFilters();
    populateGraphEventFilter();
    renderSources();renderShowcase();setMarkers();renderMediaStitch();drawTimeline();renderGraph();renderChat();
    renderActionTimeline();renderRoomEvents();renderHostShoutouts();
    renderGraphInspector();
    // Start on actual observed chat, but never imply a preview covers it.
    if(state.track==='events'){
      const top=(s.bins||[]).reduce((best,b)=>!best||b[1]>best[1]?b:best,null);
      state.eventT=top?top[0]+15:0;
    }
    syncFromMaster(true);
  }
  function wire(){
    $('sessionSelect').addEventListener('change',e=>switchSession(e.target.value));
    $('sourceSelect').addEventListener('change',e=>setSource(e.target.value));
    $('hostShoutoutScope').addEventListener('change',renderHostShoutouts);
    $('sourceTrack').addEventListener('change',e=>{
      const event=state.eventT;selectTrack(e.target.value,event);
    });
    $('masterPlay').addEventListener('click',()=>setPlaying(!state.playing));
    $('masterSeek').addEventListener('input',e=>seekSource(Number(e.target.value)));
    $('masterSpeed').addEventListener('change',e=>{
      const speed=clamp(Number(e.target.value),.25,4);
      video.playbackRate=speed;audio.playbackRate=speed;
    });
    $('muteButton').addEventListener('click',()=>{
      const m=activeMedia();if(!m)return;
      m.muted=!m.muted;$('muteButton').textContent=m.muted?'Unmute':'Mute';
    });
    for(const m of [video,audio]){
      m.controls=false;
      m.addEventListener('loadedmetadata',()=>syncFromMaster(true));
      m.addEventListener('seeked',()=>syncFromMaster(true));
      m.addEventListener('timeupdate',()=>syncFromMaster(false));
      m.addEventListener('ended',()=>{state.playing=false;$('masterPlay').textContent='▶';});
      m.addEventListener('play',()=>{if(m===activeMedia()){state.playing=true;$('masterPlay').textContent='Ⅱ';}});
      m.addEventListener('pause',()=>{if(m===activeMedia()){state.playing=false;$('masterPlay').textContent='▶';}});
    }
    $('offsetSeconds').addEventListener('input',e=>changeOffset(e.target.value));
    $('offsetNumber').addEventListener('change',e=>changeOffset(e.target.value));
    $('resetOffset').addEventListener('click',()=>changeOffset(0));
    $('alignToSelection').addEventListener('click',()=>{
      if(!state.source||state.track==='events'){toast('Select a playable video or audio source first.');return;}
      changeOffset(state.selectedEventT-sourceAbsoluteMediaTime());
    });
    $('chatSearch').addEventListener('input',renderChat);
    $('conversationMode').addEventListener('change',renderChat);
    $('chatScope').addEventListener('change',renderChat);
    $('clearParticipant').addEventListener('click',()=>{
      state.selectedActor=null;
      renderGraphInspector();drawHostNode();
      renderChat();updateGraphActivity();
    });
    $('conversationFollow').addEventListener('click',()=>{
      state.conversationFollow=!state.conversationFollow;
      $('conversationFollow').setAttribute('aria-pressed',String(state.conversationFollow));
      $('conversationFollow').textContent='Follow: '+(state.conversationFollow?'on':'off');
      if(state.conversationFollow)highlightConversation(true);
    });
    const thread=$('conversationList');
    for(const event of ['wheel','touchstart'])
      thread.addEventListener(event,()=>{
        state.conversationFollow=false;
        $('conversationFollow').setAttribute('aria-pressed','false');
        $('conversationFollow').textContent='Follow: off';
      },{passive:true});
    $('graphCommunity').addEventListener('click',()=>{
      state.graphMode='community';$('graphCommunity').setAttribute('aria-pressed','true');
      $('graphMoment').setAttribute('aria-pressed','false');renderGraph();
    });
    $('graphMoment').addEventListener('click',()=>{
      state.graphMode='moment';$('graphCommunity').setAttribute('aria-pressed','false');
      $('graphMoment').setAttribute('aria-pressed','true');renderGraph();
    });
    $('actionKind').addEventListener('change',renderActionTimeline);
    $('actionScope').addEventListener('change',renderActionTimeline);
    $('roomEventKind').addEventListener('change',renderRoomEvents);
    $('roomEventScope').addEventListener('change',renderRoomEvents);
    $('graphEventKind').addEventListener('change',e=>{
      state.graphEventKind=e.target.value;
      state.selectedActor=null;state.graphHistoryLimit=35;
      updateGraphFilterNote();
      renderGraph();renderGraphInspector();
    });
    $('graphScope').addEventListener('change',e=>{state.graphScope=e.target.value;renderGraph();});
    $('linkDensity').addEventListener('change',e=>{state.linkDensity=e.target.value;renderGraph();});
    $('graphMotion').addEventListener('change',e=>{state.graphMotion=e.target.value;updateGraphActivity();});
    $('graphSearch').addEventListener('input',updateGraphActivity);
    $('graphZoomIn').addEventListener('click',()=>{state.graphZoom=clamp(state.graphZoom*1.2,.5,3);applyGraphTransform();});
    $('graphZoomOut').addEventListener('click',()=>{state.graphZoom=clamp(state.graphZoom/1.2,.5,3);applyGraphTransform();});
    $('graphFit').addEventListener('click',()=>{state.graphZoom=1;state.panX=0;state.panY=0;applyGraphTransform();});
    let pan=null;
    $('networkSvg').addEventListener('pointerdown',e=>{
      if(e.target.closest('g[role=button]'))return;
      pan={x:e.clientX,y:e.clientY,left:state.panX,top:state.panY};
      $('networkSvg').setPointerCapture(e.pointerId);
    });
    $('networkSvg').addEventListener('pointermove',e=>{
      if(!pan)return;
      const rect=$('networkSvg').getBoundingClientRect();
      state.panX=pan.left+(e.clientX-pan.x)*graphWidth/Math.max(1,rect.width);
      state.panY=pan.top+(e.clientY-pan.y)*graphHeight/Math.max(1,rect.height);
      applyGraphTransform();
    });
    $('networkSvg').addEventListener('pointerup',()=>pan=null);
    $('networkSvg').addEventListener('pointercancel',()=>pan=null);
    $('networkSvg').addEventListener('wheel',e=>{
      e.preventDefault();state.graphZoom=clamp(state.graphZoom*(e.deltaY>0?.93:1.07),.5,3);applyGraphTransform();
    },{passive:false});
    $('signals').addEventListener('pointerdown',e=>{
      const rect=$('signals').getBoundingClientRect(),x=(e.clientX-rect.left)*(state.timelineWidth/Math.max(1,rect.width));
      const t=clamp((x-42)/(state.timelineWidth-48),0,1)*session().duration;
      seekEvent(t);
    });
    $('zoomAll').addEventListener('click',()=>{state.zoom=1;drawTimeline();});
    $('zoomNear').addEventListener('click',()=>{state.zoom=4;drawTimeline();});
    $('followCursor').addEventListener('click',()=>{
      state.follow=!state.follow;
      $('followCursor').setAttribute('aria-pressed',String(state.follow));
      $('followCursor').textContent='Follow cursor: '+(state.follow?'on':'off');
    });
    $('layoutPreset').addEventListener('change',e=>usePreset(e.target.value));
    wireResizers();
    $('resetLayout').addEventListener('click',()=>{
      try{localStorage.removeItem(storageLayout);}catch{}
      applyLayout({preset:'review',...presets.review,height:430});
    });
    for(const b of document.querySelectorAll('[data-move]'))
      b.addEventListener('click',()=>modifyLayout(b.dataset.move,b.dataset.for));
    for(const b of document.querySelectorAll('[data-grow]'))
      b.addEventListener('click',()=>modifyLayout('grow',b.dataset.grow));
    for(const head of document.querySelectorAll('[data-drag-handle]')){
      head.addEventListener('dragstart',e=>{state.dragging=head.dataset.dragHandle;e.dataTransfer.setData('text/plain',state.dragging);e.dataTransfer.effectAllowed='move';});
      head.addEventListener('dragend',()=>{state.dragging=null;for(const p of document.querySelectorAll('.dock-panel'))p.classList.remove('drag-over');});
    }
    for(const p of document.querySelectorAll('.dock-panel')){
      p.addEventListener('dragover',e=>{if(!state.dragging)return;e.preventDefault();p.classList.add('drag-over');});
      p.addEventListener('dragleave',()=>p.classList.remove('drag-over'));
      p.addEventListener('drop',e=>{
        e.preventDefault();p.classList.remove('drag-over');
        const from=state.dragging,to=p.dataset.panel;
        if(!from||!to||from===to)return;
        const a=state.layout.order.indexOf(from),b=state.layout.order.indexOf(to);
        const order=[...state.layout.order],weights=[...state.layout.weights];
        [order[a],order[b]]=[order[b],order[a]];[weights[a],weights[b]]=[weights[b],weights[a]];
        applyLayout({preset:'custom',order,weights});state.dragging=null;
      });
    }
    for(const btn of $('mobileTabs').querySelectorAll('[data-mobile-tab]'))
      btn.addEventListener('click',()=>showMobile(btn.dataset.mobileTab));
    window.addEventListener('resize',drawTimeline);
    window.addEventListener('keydown',e=>{
      // Splitter arrow keys belong to the focused separator, not media seeking.
      if(e.defaultPrevented || document.activeElement?.getAttribute('role')==='separator')return;
      if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
      if(e.code==='Space'){e.preventDefault();setPlaying(!state.playing);}
      else if(e.key==='ArrowRight'){e.preventDefault();seekSource((state.track==='events'?state.eventT:mediaElapsed())+10);}
      else if(e.key==='ArrowLeft'){e.preventDefault();seekSource((state.track==='events'?state.eventT:mediaElapsed())-10);}
    });
  }
  if(!D?.sessions?.length){
    $('inventoryStats').textContent='Published handle-aware evidence is missing. Reload the complete demo.';
    $('mediaEmpty').textContent='No published handle-aware evidence loaded.';
    return;
  }
  const select=$('sessionSelect');for(const s of D.sessions){
    const op=elem('option','',s.label);op.value=s.id;select.append(op);
  }
  const stored=getSaved(storageLayout,null);
  applyLayout(stored||{preset:'review',...presets.review});
  wire();
  switchSession(D.defaultSession||D.sessions[0].id);
  requestAnimationFrame(frameTick);
})();
