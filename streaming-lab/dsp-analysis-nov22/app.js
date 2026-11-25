'use strict';
(()=>{
const T=DspTiming,R=T.R,$=id=>document.getElementById(id),v=$('video'),expected='0eef6036a42eb9e8515ae301c2a04ecafeb663d11a4ab930ee750f01cc9fc1cc',base='../nine-tickers-nov22/',arch='../architecture-decision-nov22/',KEY='hl-dsp-review:'+expected;
const names={control:'No DSP',eq25:'EQ 25%',eq100:'EQ 100%',voice25:'Voice 25%',voice50:'Voice 50%',voice100:'Voice 100%',combined100:'Combined 100%','rms-control':'Volume only',static:'Static vocab','voice25-static':'Voice 25% + vocab'};
const variants=Object.keys(names),rows={},reviewCues={repetition:[33,49],'focus-fighters':[57.37,64],'start-bid':[160.21,177],'been-a-while':[331,340],togekiss:[369,396],'normal-milk':[424,437.18],'shout-out':[567,580]};
const S={data:null,index:0,part:0,pending:null,end:null,review:null,notes:{},blind:false,raf:0,audioContext:null,audioNode:null,audioGen:0,inputs:null};
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x};
const status=t=>$('status').textContent=t, audioStatus=t=>$('audioStatus').textContent=t;
const fmt=s=>{s=Math.max(0,s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')};
const exact=s=>fmt(s)+'.'+String(Math.floor(s%1*100)).padStart(2,'0');
const current=()=>S.data.windows[S.index],part=()=>S.data.parts[S.part],cell=(w,k)=>w.cells.find(c=>c.variant===k);
async function digest(b){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('')}
async function bytes(url,sha){const res=await fetch(url,{cache:'force-cache'});if(!res.ok)throw Error('Asset unavailable: '+url);const b=await res.arrayBuffer();if(await digest(b)!==sha)throw Error('Evidence SHA mismatch: '+url);return b}
function sourceClock(){return (part().offset+Math.max(0,Math.min(part().sourceFrames,(v.currentTime-part().pcmOriginMediaSeconds)*R)))/R}
function bounds(w){return [w.startFrame/R,w.endFrame/R]}
function stopAudio(){S.audioGen++;if(S.audioNode){try{S.audioNode.stop()}catch{}S.audioNode.disconnect();S.audioNode=null}$('stopAudio').disabled=true;audioStatus('Original video audio')}
function seek(i,when=null,play=false,end=null){
 if(!S.data)return;stopAudio();const w=S.data.windows[i],p=S.data.parts.findIndex(x=>x.part===w.part),t=when===null?w.startFrame/R:Math.max(w.startFrame/R,Math.min(w.endFrame/R-.001,when));S.index=i;S.end=end;render();const local=t-S.data.parts[p].offset/R+S.data.parts[p].pcmOriginMediaSeconds;
 v.pause();if(S.part!==p||!v.getAttribute('src')||v.readyState<1){S.part=p;S.pending={local,play};v.src=base+part().filename;v.load()}else{v.currentTime=local;if(play)v.play().catch(()=>status('Press Play to listen'));kick()}
}
function jump(r,play=false){S.review=r;const w=S.data.windows[r.window],b=bounds(w),cue=reviewCues[r.slug]||b;seek(r.window,Math.max(b[0],cue[0]),play,play?Math.min(b[1],cue[1]):null);$('reviewNotes').open=true;render()}
function handleHash(){if(!S.data)return;const slug=decodeURIComponent(location.hash.slice(1));const r=S.data.reviews.find(x=>x.slug===slug);if(r){jump(r);return}const match=/^window-(\d+)$/.exec(slug);if(match&&+match[1]>=1&&+match[1]<=21){S.review=null;seek(+match[1]-1)}else{S.review=null;seek(0)}}
function build(){
 for(const k of variants){const line=el('span','ticker-line ticker-tape'),viewport=el('div','ticker-viewport'),surface=el('div','ticker-surface'),label=el('div','ticker-model'),title=el('div','model-title'),meta=el('div','ticker-meta'),row=el('div','ticker-row');row.dataset.variant=k;label.append(el('span','model-index',String(variants.indexOf(k)+1).padStart(2,'0')));title.append(el('strong','',names[k]));label.append(title);viewport.append(line);surface.append(viewport);row.append(label,surface,meta);$('lanes').append(row);rows[k]={line,viewport,meta,chunks:[]};
  for(const w of S.data.windows){const c=cell(w,k),chunk=el('span','ticker-chunk'),wordEls=[],baseline=new Set(T.words(cell(w,'control').text)),timing=T.align(w,c);chunk.dataset.window=w.id;chunk.dataset.anchored=String(timing.valid);
   if(c.status==='not_decoded'){chunk.append(el('span','muted','[not decoded: headroom]'))}else if(!c.text.trim()){chunk.append(el('span','muted','[empty output]'))}else{for(const p of c.text.split(/([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?)/gu)){if(T.words(p).length===1&&/^[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?$/u.test(p)){const index=wordEls.length,span=el('span','ticker-word'+(k!=='control'&&!baseline.has(T.words(p)[0])?' word-change':''),p);const ts=timing.matched.get(index);if(ts){span.dataset.start=ts.start;span.dataset.end=ts.end;span.title=exact(ts.start)+' – '+exact(ts.end)+' (model alignment)'}wordEls.push(span);chunk.append(span)}else chunk.append(document.createTextNode(p))}}
   line.append(chunk);rows[k].chunks.push({chunk,wordEls,timing,c});
  }
 }
 for(const w of S.data.windows){const b=el('button','block-btn',String(w.index+1).padStart(2,'0'));b.title=exact(w.startFrame/R)+' – '+exact(w.endFrame/R);b.addEventListener('click',()=>{if(location.hash==='#window-'+(w.index+1)){S.review=null;seek(w.index)}else location.hash='window-'+(w.index+1)});$('blockNav').append(b)}
 for(const r of S.data.reviews){const a=el('a','',r.label);a.href='#'+r.slug;a.addEventListener('click',e=>{if(location.hash===a.hash){e.preventDefault();jump(r)}});$('reviewLinks').append(a)}
 for(const k of variants){const opt=el('option','',names[k]);opt.value=k;$('audioTrack').append(opt)}
 summary();render();
}
function summary(){for(const k of variants){let scores=0,n=0,e=0,rms=0,count=0,anchor=0,word=0;for(const w of S.data.windows){const c=cell(w,k);if(c.status==='not_decoded')continue;const ti=rows[k].chunks[w.index].timing;scores+=(c.meanSelectedTokenLogScore||0)*c.scoreCount;n+=c.scoreCount;e+=T.edits(cell(w,'control').text,c.text);rms+=c.acoustics.rmsChangeDb;count++;anchor+=ti.valid;word+=ti.n}const tr=el('tr');for(const value of [names[k],n?(scores/n).toFixed(4):'—',e,count?(rms/count).toFixed(2):'—',anchor+'/'+word])tr.append(el('td','',String(value)));$('summary').append(tr)}}
function render(){
 if(!S.data)return;const w=current(),q=S.review&&S.review.window===S.index?S.review:null;
 $('cue').textContent=(S.index+1)+'/21 · '+fmt(w.startFrame/R);
 for(const [i,b] of [...$('blockNav').children].entries()){b.classList.toggle('active',i===S.index);b.setAttribute('aria-pressed',String(i===S.index))}
 for(const a of $('reviewLinks').children)a.setAttribute('aria-current',String(q&&a.hash==='#'+q.slug||false));
 for(const k of variants){const {c,timing}=rows[k].chunks[S.index];const value=c.status==='not_decoded'?'SKIPPED':(c.meanSelectedTokenLogScore==null?'—':c.meanSelectedTokenLogScore.toFixed(3));rows[k].meta.replaceChildren(el('span','',value),el('span','',timing.valid+'/'+timing.n+' timed'))}
 $('question').textContent=q?q.label+' · '+q.question:'Window '+(S.index+1)+' · '+exact(w.startFrame/R)+'–'+exact(w.endFrame/R)+' · '+(w.inputFrames/R).toFixed(2)+'s retained';
 $('reviewLabel').textContent=q?q.label+' — your interpretation':'What do you hear in window '+(S.index+1)+'?';
 $('reviewText').value=S.notes[noteKey()]?.text||'';$('noteStatus').textContent=S.notes[noteKey()]?'Saved locally.':'';
 $('reviewed').textContent=S.data.reviews.filter(r=>S.notes[r.slug]).length+'/7';$('replayCue').disabled=!q;
}
function positionFor(chunkInfo,w,source){
 const {chunk,wordEls,timing}=chunkInfo,pos=T.wordPosition(timing,w,source,$('wordTiming').checked);if(!wordEls.length)return chunk.offsetLeft;
 const centers=[0,...wordEls.map(e=>e.offsetLeft+e.offsetWidth/2),Math.max(chunk.offsetWidth-28,0)];
 if(pos<=.5)return chunk.offsetLeft+(centers[1]||0)*Math.max(0,pos*2);
 if(pos>=wordEls.length-.5){const p=Math.min(1,Math.max(0,(pos-(wordEls.length-.5))*2));return chunk.offsetLeft+centers.at(-2)+(centers.at(-1)-centers.at(-2))*p}
 const i=Math.max(0,Math.floor(pos-.5)),f=pos-.5-i;return chunk.offsetLeft+centers[i+1]+(centers[i+2]-centers[i+1])*f;
}
function tick(){
 if(!S.data||S.pending)return;const t=sourceClock(),w=S.data.windows.find(x=>t>=x.startFrame/R&&t<x.endFrame/R)||S.data.windows.filter(x=>x.part===part().part).at(-1);$('clock').textContent=fmt(t);
 if(w&&w.index!==S.index){S.index=w.index;if(S.review?.window!==w.index)S.review=null;render()}
 for(const k of variants){const row=rows[k],info=row.chunks[S.index];if(!info)continue;const position=positionFor(info,current(),t);row.line.style.transform='translate3d('+(-Math.max(0,position-row.viewport.clientWidth*.24))+'px,0,0)';for(const [i,e] of info.wordEls.entries()){const ts=info.timing.matched.get(i);e.classList.toggle('current',$('wordTiming').checked&&!!ts&&t>=ts.start&&t<ts.end)}}
 if(S.end!==null&&t>=S.end){S.end=null;v.pause()}
 if(!v.paused&&!v.ended)S.raf=requestAnimationFrame(tick)
}
function kick(){cancelAnimationFrame(S.raf);S.raf=requestAnimationFrame(tick)}
function noteKey(){return S.review?.window===S.index?S.review.slug:'window-'+(S.index+1)}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(S.notes));return true}catch{return false}}
function reviewText(){return S.data.reviews.filter(r=>S.notes[r.slug]).map(r=>r.label+' ('+fmt(S.data.windows[r.window].startFrame/R)+'): '+S.notes[r.slug].text).concat(Object.entries(S.notes).filter(([k])=>k.startsWith('window-')).map(([k,v])=>k+': '+v.text)).join('\n\n')}
function setBlind(b){S.blind=b;document.body.classList.toggle('blind',b);$('blind').setAttribute('aria-pressed',String(b));$('blind').textContent=b?'Reveal transcripts':'Blind review';$('revealReview').hidden=!b;if(b){$('transcripts').close();$('reviewNotes').open=true;$('reviewText').focus()}}
async function audition(){
 stopAudio();v.pause();const gen=S.audioGen,w=current(),c=cell(w,$('audioTrack').value);if(c.status==='not_decoded'){audioStatus('No valid gain control for this window');return}
 try{
  if(!S.audioContext)S.audioContext=new AudioContext();const ctx=S.audioContext;await ctx.resume();
  if(gen!==S.audioGen)return;
  audioStatus('Loading and verifying exact PCM…');$('stopAudio').disabled=false;
  if(!S.inputs){const response=await fetch('audio-inputs.json',{cache:'no-cache'});if(!response.ok)throw Error('Input inventory unavailable');const m=await response.json();if(m.schema!=='hl-packed-dsp-inputs-v1'||m.comparisonSha256!==expected||m.sampleRate!==R)throw Error('Input inventory mismatch');S.inputs=m}
  const a=S.inputs.assets[c.inputPcmSha256];if(!a||a.frames!==w.inputFrames||a.file!=='inputs/'+c.inputPcmSha256+'.pcmz')throw Error('Exact input unavailable');
  const compressed=await bytes(a.file,a.sha256);if(compressed.byteLength!==a.bytes)throw Error('Input bytes mismatch');
  const decompressed=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(decompressed.byteLength!==w.inputFrames*2)throw Error('Input PCM extent mismatch');
  const raw=new DataView(decompressed),x=new Float32Array(w.inputFrames),f32=new DataView(new ArrayBuffer(w.inputFrames*4));
  for(let i=0;i<x.length;i++){x[i]=raw.getInt16(i*2,true)/32768;f32.setFloat32(i*4,x[i],true)}
  if(await digest(f32.buffer)!==c.inputPcmSha256)throw Error('Packed PCM SHA mismatch; audition disabled');if(gen!==S.audioGen)return;
  const buffer=ctx.createBuffer(1,x.length,R);buffer.copyToChannel(x,0);const node=ctx.createBufferSource();node.buffer=buffer;node.connect(ctx.destination);node.playbackRate.value=Number($('speed').value);S.audioNode=node;node.onended=()=>{if(S.audioNode===node){S.audioNode=null;$('stopAudio').disabled=true;audioStatus('Verified input finished')}};node.start();audioStatus('SHA-VERIFIED · '+names[c.variant]+' · '+(x.length/R).toFixed(2)+'s packed audio (video paused)');
 }catch(e){if(gen===S.audioGen){$('stopAudio').disabled=true;audioStatus(e.message)}}
}
$('audition').onclick=audition;$('stopAudio').onclick=stopAudio;$('audioTrack').onchange=stopAudio;$('speed').onchange=()=>{v.playbackRate=Number($('speed').value);if(S.audioNode)S.audioNode.playbackRate.value=v.playbackRate};$('wordTiming').onchange=kick;
$('replayWindow').onclick=()=>{const w=current();seek(w.index,null,true,w.endFrame/R)};$('replayCue').onclick=()=>{if(S.review)jump(S.review,true)};
$('blind').onclick=()=>setBlind(!S.blind);$('revealReview').onclick=()=>setBlind(false);
$('saveReview').onclick=()=>{const text=$('reviewText').value.trim();if(!text){$('noteStatus').textContent='Enter an interpretation or explicitly note uncertainty.';return}S.notes[noteKey()]={text,window:current().id,sourceStartFrame:current().startFrame,sourceEndFrame:current().endFrame,blind:S.blind};const ok=persist();render();$('noteStatus').textContent=ok?'Saved locally.':'Local storage unavailable; copy or export before leaving.'};
$('clearReview').onclick=()=>{delete S.notes[noteKey()];persist();render()};
$('copyReview').onclick=async()=>{try{await navigator.clipboard.writeText(reviewText());$('noteStatus').textContent='Notes copied.'}catch{$('noteStatus').textContent='Clipboard unavailable; use Export JSON.'}};
$('exportReview').onclick=()=>{const blob=new Blob([JSON.stringify({schema:'hl-dsp-development-notes-v1',comparisonSha256:expected,sessionId:S.data.sessionId,notes:S.notes},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='dsp-review-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('fullText').onclick=()=>{if(S.blind)return;const box=$('dialogBody');box.replaceChildren();for(const c of current().cells){const item=el('article');item.append(el('strong','',names[c.variant]),el('p','',c.status==='not_decoded'?'Not decoded':c.text||'[empty output]'));if(c.prompt)item.append(el('small','',c.prompt));box.append(item)}$('transcripts').showModal();$('fullText').setAttribute('aria-expanded','true')};$('closeText').onclick=()=>$('transcripts').close();$('transcripts').addEventListener('close',()=>$('fullText').setAttribute('aria-expanded','false'));
v.addEventListener('loadedmetadata',()=>{if(S.pending){const p=S.pending;S.pending=null;v.currentTime=p.local;v.playbackRate=Number($('speed').value);if(p.play)v.play().catch(()=>status('Press Play to listen'))}kick()});v.addEventListener('play',()=>{stopAudio();kick()});for(const event of ['pause','seeked','playing','timeupdate','ratechange'])v.addEventListener(event,kick);v.addEventListener('ended',()=>{if(S.end!==null){S.end=null;return}if(S.part<2){S.review=null;seek(S.data.windows.find(w=>w.part===S.data.parts[S.part+1].part).index,null,true)}});v.addEventListener('error',()=>{$('videoError').hidden=false;$('videoError').textContent='Original video unavailable; no substitute footage.';stopAudio()});window.addEventListener('hashchange',handleHash);window.addEventListener('resize',kick);
(async()=>{try{const d=JSON.parse(new TextDecoder().decode(await bytes('comparison.json',expected)));if(d.schema!=='hl-packed-dsp-lab-v1'||d.windows.length!==21||d.sourceFrames!==10042710||d.retainedFrames!==9309590||d.humanAccuracyVerified!==false||d.wordTimingVerified!==false)throw Error('Evidence contract');S.data=d;try{const old=JSON.parse(localStorage.getItem(KEY)||'{}');for(const [k,n] of Object.entries(old))if(typeof n.text==='string'&&d.windows.some(w=>w.id===n.window&&w.startFrame===n.sourceStartFrame&&w.endFrame===n.sourceEndFrame))S.notes[k]=n}catch{}build();handleHash();status('SOURCE VERIFIED · word-timed crawl · '+d.windows.length+' windows')}catch(e){status('Evidence verification failed: '+e.message);$('videoError').hidden=false;$('videoError').textContent='Evidence unavailable; no invented results.'}})();
})();
