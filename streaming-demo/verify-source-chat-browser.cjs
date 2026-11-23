'use strict';
// Execute the actual published V4 in headless Chrome against local, unmodified
// source HTML/CSS/JS; inspect rendered bubbles AND computed original styles.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(process.cwd(),'streaming-demo');
const chrome=cp.spawnSync('which',['google-chrome'],{encoding:'utf8'});
if(chrome.status!==0)throw Error('Expected preinstalled Chrome for visual DOM acceptance');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const checkFile='__source-chat-qa';
const probe=String.raw`(()=>{
  let tries=0;
  function check(){
    const list=document.getElementById('conversationList');
    const speech=[...list.querySelectorAll('.message-row.speech')];
    const chat=[...list.querySelectorAll('.message-row.chat')];
    const video=document.getElementById('videoPlayer');
    // Wait until actual source video has decoded a frame, not merely until a
    // <video> tag or source URL exists.
    if((!speech.length||video.readyState<2) && tries++<180){
      setTimeout(check,100);return;
    }
    const left=speech[0]&&getComputedStyle(speech[0]).justifyContent;
    const right=chat[0]&&getComputedStyle(chat[0]).justifyContent;
    const dock=document.getElementById('primaryDock');
    const rowStyle=speech[0]&&getComputedStyle(speech[0].querySelector('.message-bubble')).backgroundColor;
    const before=video.currentTime;
    // The same V4 master-play button used by a viewer should advance VIDEO,
    // not the separate MP3 or an invented timer.
    document.getElementById('masterPlay').click();
    setTimeout(()=>{
    const result={
      speech:speech.length,viewers:chat.length,sourceSelected:document.getElementById('sessionSelect').value,
      track:document.getElementById('sourceTrack').value,
      videoSrc:video.currentSrc,
      videoReady:video.readyState,
      videoSize:[video.videoWidth,video.videoHeight],
      videoDuration:video.duration,
      videoHidden:video.hidden,
      videoPlaying:!video.paused,
      videoAdvanced:video.currentTime>before+.05,
      videoError:video.error?.code||null,
      left,right,dockDisplay:getComputedStyle(dock).display,
      speechBubbleColor:rowStyle,modelOptions:document.getElementById('featuredModel').options.length,
      extraPanel:!!document.getElementById('featuredTranscript'),
      nonemptySpeech:speech.some(el=>el.textContent.includes('Thank you for the popular vote')),
      sourceTimeLabel:document.getElementById('sourceLabel').textContent
    };
    const elem=document.createElement('pre');elem.id='__source_chat_qa_result';
    elem.textContent=JSON.stringify(result);
    document.body.appendChild(elem);
    },1200);
  }
  check();
})();`;
const originalPage=path.join(root,'index.html');
const testPage=path.join(root,checkFile+'.html');
const testScript=path.join(root,checkFile+'.js');
fs.writeFileSync(testPage,html.replace('</body>','<script src="'+checkFile+'.js"></script></body>'));
fs.writeFileSync(testScript,probe);
const server=cp.spawn('python3',['-m','http.server','18764','--bind','127.0.0.1'],{stdio:'ignore'});
const cleanup=()=>{server.kill();try{fs.unlinkSync(testPage);}catch{}try{fs.unlinkSync(testScript);}catch{}};
(async()=>{
  try{
    await new Promise(resolve=>setTimeout(resolve,900));
    const result=cp.spawnSync(chrome.stdout.trim(),[
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars','--window-size=1450,1000','--virtual-time-budget=22000',
      '--dump-dom','http://127.0.0.1:18764/streaming-demo/'+checkFile+'.html'
    ],{encoding:'utf8',timeout:75000,maxBuffer:16*1024*1024});
    if(result.error||result.status!==0)
      throw Error('Chrome failed: '+(result.error||result.stderr).toString().slice(-1500));
    const match=result.stdout.match(/<pre id="__source_chat_qa_result">([^<]+)<\/pre>/);
    if(!match)throw Error('No rendered source-chat diagnostics in Chrome: '+
      result.stdout.slice(-1700));
    const data=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    if(data.speech!==12||data.viewers!==3||
       data.sourceSelected!=='source-nov17-original-audio-180'||
       data.left!=='flex-start'||data.right!=='flex-end'||
       data.dockDisplay!=='grid'||data.modelOptions!==9||data.extraPanel||
       !data.nonemptySpeech||!data.sourceTimeLabel.includes('ORIGINAL SOURCE VIDEO')||
       data.track!=='video'||!data.videoSrc.endsWith('/streaming-demo/nine-tickers/commercial-180.mp4')||
       data.videoReady<2||data.videoSize[0]<100||data.videoSize[1]<100||
       Math.abs(data.videoDuration-180)>1||data.videoHidden||
       !data.videoPlaying||!data.videoAdvanced||data.videoError!==null)
      throw Error('Source chat visual acceptance failed: '+JSON.stringify(data));
    console.log('CHROME PASS ORIGINAL V4 + REAL SOURCE VIDEO PLAYBACK: '+JSON.stringify(data));
  }catch(e){console.error(e);process.exitCode=1;}
  finally{cleanup();}
})();