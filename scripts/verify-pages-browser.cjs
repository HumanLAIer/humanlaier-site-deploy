#!/usr/bin/env node
'use strict';
// Real elapsed-time Playwright acceptance for ORIGINAL V4, archived captures,
// source-driven ASR, and the distinct nine-ticker study. No CSS redesign.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const {chromium}=require('playwright');
const remote=!!process.env.HL_SITE_PUBLIC_BASE;
const origin=(process.env.HL_SITE_PUBLIC_BASE||'http://127.0.0.1:18764').replace(/\/+$/,'');
let server=null;
async function retry(fn,limit=15){
 let last;
 for(let i=0;i<limit;i++){
   try{return await fn()}catch(e){last=e;await new Promise(r=>setTimeout(r,250));}
 }
 throw last;
}
function observe(page){
 const errors=[],bad=[];
 page.on('pageerror',err=>errors.push(err.message));
 page.on('response',res=>{
   if(res.url().startsWith(origin)&&res.status()>=400)bad.push([res.status(),res.url()]);
 });
 return {errors,bad};
}
async function sourceChat(browser){
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const observeResult=observe(page);
 try{
   await page.goto(origin+'/streaming-demo/',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>{
     const source=window.HL_FEATURED_SOURCE;
     return source && source.transcriptBlocks.length>0 &&
       document.querySelectorAll('.message-row.speech').length===source.transcriptBlocks.length &&
       document.querySelectorAll('.message-row.chat').length===source.chatExcerpts.length;
   },null,{timeout:25000});
   const state=await page.evaluate(()=>{
     const source=window.HL_FEATURED_SOURCE;
     const v=document.getElementById('videoPlayer');
     const thread=document.getElementById('conversationList');
     const speech=[...thread.querySelectorAll('.message-row.speech')];
     const chat=[...thread.querySelectorAll('.message-row.chat')];
     return {
       selected:document.getElementById('sessionSelect').value,
       videoSrc:v.currentSrc,
       videoHidden:v.hidden,videoReady:v.readyState,
       sourceVideo:source.source.videoFile,
       audioSrc:source.source.audioFile,
       speechCount:speech.length,chatCount:chat.length,
       actualSpeech:source.transcriptBlocks.length,actualComments:source.chatExcerpts.length,
       modelOptions:document.getElementById('featuredModel').options.length,
       actualModels:source.models.length,
       firstSpeechText:speech[0]?.querySelector('.message-text')?.textContent,
       expectedFirstSpeech:source.transcriptBlocks[0].texts[source.defaultModel],
       speechAlignment:speech[0]&&getComputedStyle(speech[0]).justifyContent,
       chatAlignment:chat[0]&&getComputedStyle(chat[0]).justifyContent,
       layout:getComputedStyle(document.getElementById('primaryDock')).display,
       disconnectedTranscript:!!document.querySelector('#featuredTranscript,#featuredAsrRows'),
       widthOverflow:document.documentElement.scrollWidth-innerWidth
     };
   });
   assert.equal(state.selected,'source-nov17-original-audio-180');
   assert(state.sourceVideo&&state.videoSrc.endsWith('/'+state.sourceVideo),'Original video actually attached');
   assert.equal(state.videoHidden,false);
   assert.equal(state.speechCount,state.actualSpeech);
   assert.equal(state.chatCount,state.actualComments);
   assert.equal(state.modelOptions,state.actualModels);
   assert.equal(state.firstSpeechText,state.expectedFirstSpeech.trim()||
     '[No speech returned by this engine for this source block]');
   assert(['flex-start','flow-start'].includes(state.speechAlignment),
     'Native host chat stays on inline-start side');
   if(state.chatCount)assert(['flex-end','flow-end'].includes(state.chatAlignment),
     'Viewer chat stays on inline-end side');
   assert.equal(state.layout,'grid');
   assert.equal(state.disconnectedTranscript,false);
   assert(state.widthOverflow<=2,'Original V4 workspace has no horizontal overflow');
   await page.waitForFunction(()=>{
     const v=document.getElementById('videoPlayer');
     return v.readyState>=2&&v.videoWidth>100&&v.videoHeight>100&&v.duration>179;
   },null,{timeout:35000});
   await page.locator('#masterPlay').click();
   await page.waitForFunction(()=>{
     const v=document.getElementById('videoPlayer');
     return !v.paused&&v.currentTime>0.7&&v.readyState>=2;
   },null,{timeout:14000});
   const progressed=await page.locator('#videoPlayer').evaluate(v=>v.currentTime);
   assert(progressed>0.7,'Play must progress under real wall-clock time');
   await page.locator('#masterPlay').click();
   const paused=await page.locator('#videoPlayer').evaluate(v=>v.paused);
   assert(paused,'Pause must actually pause source video');
   await page.locator('#masterSeek').evaluate(el=>{
     el.value='45';el.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await page.waitForFunction(()=>Math.abs(document.getElementById('videoPlayer').currentTime-45)<2,
     null,{timeout:18000});
   await page.locator('#masterSpeed').selectOption('2');
   assert.equal(await page.locator('#videoPlayer').evaluate(v=>v.playbackRate),2);
   await page.locator('#muteButton').click();
   assert.equal(await page.locator('#videoPlayer').evaluate(v=>v.muted),true);
   const optionValues=await page.locator('#featuredModel option').evaluateAll(els=>els.map(el=>el.value));
   if(optionValues.length>1){
     const details=page.locator('#conversationOptions');
     if(!await details.evaluate(el=>el.open))
       await details.locator('summary').click();
     await page.locator('#featuredModel').selectOption(optionValues[1]);
     const updated=await page.locator('.message-row.speech .message-text').first().textContent();
     const actual=await page.evaluate(id=>window.HL_FEATURED_SOURCE.transcriptBlocks[0].texts[id]||
       '[No recorded output from this engine for this passage]',optionValues[1]);
     assert.equal(updated.trim(),actual.trim(),'ASR choice must change native chat bubble');
   }
   const oldCaptures=await page.locator('#sessionSelect option').evaluateAll(els=>
     els.map(e=>e.value).filter(v=>v&&v!=='source-nov17-original-audio-180'));
   assert(oldCaptures.length>=3,'Original archived captures must be retained');
   await page.locator('#sessionSelect').selectOption(oldCaptures[0]);
   await page.waitForTimeout(350);
   assert.equal(await page.locator('#featuredModel').isHidden(),true);
   assert((await page.locator('#sourceSelect option').count())>0,'Original capture media remains available');
   assert.deepEqual(observeResult.errors,[],'V4 runtime script errors');
   assert.deepEqual(observeResult.bad,[],'V4 critical local assets must not be HTTP errors');
   console.log('V4_REAL_TIME_VIDEO_AND_GROUP_CHAT_PASS '+JSON.stringify({
     speech:state.speechCount,chat:state.chatCount,models:state.modelOptions,
     progressedSeconds:+progressed.toFixed(2),seekSeconds:45,oldCaptures:oldCaptures.length}));
 }finally{await page.close();}
}
async function videoFallback(browser){
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 try{
   await page.route('**/nine-tickers/commercial-180.mp4',route=>route.abort('failed'));
   await page.goto(origin+'/streaming-demo/',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>{
     const src=document.getElementById('audioPlayer').currentSrc;
     return document.getElementById('sourceTrack').value==='audio'&&
       src.includes('commercial-180.mp3')&&
       document.querySelectorAll('.message-row.speech').length>0;
   },null,{timeout:30000});
   const state=await page.evaluate(()=>({
     audio:document.getElementById('audioPlayer').currentSrc,
     speech:document.querySelectorAll('.message-row.speech').length,
     selected:document.getElementById('sourceTrack').value
   }));
   assert.equal(state.selected,'audio');
   console.log('V4_SOURCE_AUDIO_FALLBACK_PASS '+JSON.stringify(state));
 }finally{await page.close();}
}
async function mobile(browser){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
   await page.goto(origin+'/streaming-demo/',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>document.querySelectorAll('.message-row.speech').length>0,
     null,{timeout:20000});
   await page.locator('[data-mobile-tab="conversation"]').click();
   const metrics=await page.evaluate(()=>{
     const t=document.getElementById('conversationList');
     const r=t.getBoundingClientRect();
     return {visible:getComputedStyle(t).display!=='none'&&r.width>0,
       viewport:innerWidth,htmlWidth:document.documentElement.scrollWidth,
       speech:document.querySelectorAll('.message-row.speech').length,
       left:r.left,right:r.right};
   });
   assert(metrics.visible&&metrics.speech>0,'Mobile chat is visible on its native tab');
   assert(metrics.htmlWidth<=metrics.viewport+3,'No mobile page horizontal overflow');
   assert(metrics.left>=-2&&metrics.right<=metrics.viewport+3,'Conversation stays within viewport');
   console.log('V4_MOBILE_CHAT_PASS '+JSON.stringify(metrics));
 }finally{await page.close();}
}
async function nine(browser){
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const obs=observe(page);
 try{
   await page.goto(origin+'/streaming-demo/nine-tickers/',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>
     document.querySelectorAll('.ticker-row').length===9&&
     document.getElementById('video')?.getAttribute('src')==='commercial-180.mp4',
     null,{timeout:20000});
   await page.waitForFunction(()=>document.getElementById('video')?.readyState>=2,
     null,{timeout:35000});
   await page.locator('#video').evaluate(v=>v.play());
   await page.waitForFunction(()=>document.getElementById('video').currentTime>0.5,
     null,{timeout:14000});
   const media=await page.locator('#video').evaluate(v=>({
     duration:v.duration,width:v.videoWidth,height:v.videoHeight,time:v.currentTime}));
   assert(media.duration>179&&media.duration<182);
   assert(media.width>100&&media.height>100);
   assert.equal(obs.errors.length,0,'Nine ticker page script errors');
   assert.equal(obs.bad.length,0,'Nine ticker assets HTTP failures');
   console.log('NINE_TICKER_REAL_TIME_VIDEO_PASS '+JSON.stringify(media));
 }finally{await page.close();}
}
async function rootPages(browser){
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const obs=observe(page);
 try{
   for(const target of ['/','/thanks.html']){
     await page.goto(origin+target,{waitUntil:'domcontentloaded',timeout:35000});
     assert((await page.locator('body').textContent()).trim().length>150,
       'Original website page content missing '+target);
   }
   assert.equal(obs.errors.length,0,'Original website Javascript errors');
   assert.equal(obs.bad.length,0,'Original website assets HTTP failures');
   console.log('ORIGINAL_SITE_PAGES_PASS');
 }finally{await page.close();}
}
(async()=>{
 try{
   if(!remote){
     server=cp.spawn(process.execPath,[path.resolve('streaming-demo/verify-range-server.cjs')],
       {stdio:'ignore'});
     await retry(async()=>{
       const r=await fetch(origin+'/streaming-demo/index.html');
       if(!r.ok)throw Error('Local range server not ready');
     });
   }
   const target=String(process.env.HL_TEST_TARGET||'main');
   assert(['main','bakeoff','site'].includes(target),'Choose an independent page acceptance target');
   const browser=await chromium.launch({headless:true,channel:'chrome',
     args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
   try{
     if(target==='main'){
       await sourceChat(browser);
       if(!remote)await videoFallback(browser); // Don't intentionally disrupt live media.
       await mobile(browser);
       await rootPages(browser);
     }else if(target==='bakeoff'){
       await nine(browser);
     }else{
       await rootPages(browser);
     }
   }finally{await browser.close();}
 }catch(err){console.error('RELEASE_BROWSER_ACCEPTANCE_FAILED',err);process.exitCode=1;}
 finally{if(server)server.kill();}
})();
