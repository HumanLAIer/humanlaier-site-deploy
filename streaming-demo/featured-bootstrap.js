/* Signal Recorder V4 boot order.
 * CORE: original activity-backed video and its same-source ASR.
 * OPTIONAL: independent 180s nine-ticker research comparison.
 * The optional research adapter/requests must NEVER suppress default speech.
 */
'use strict';
(()=>{
  let launched=false;
  const core=window.HL_PARTICIPATION_ASR?.contract;
  function readiness(status,reason,details){
    window.HL_DEMO_READINESS=Object.freeze({
      status,captureId:core?.captureId||'nov17-participation',
      reason:reason||null,details:details||null
    });
    document.documentElement.dataset.showcaseState=status;
  }
  readiness('loading');
  function launch(){
    if(launched)return;
    launched=true;
    const script=document.createElement('script');
    script.src='app.js?v=video-20261123-1';
    script.onerror=()=>console.error('Signal Recorder V4 script unavailable');
    document.body.append(script);
  }
  async function readJson(path,timeoutMs){
    if(typeof fetch!=='function'||typeof AbortController!=='function')
      throw Error('Browser cannot retrieve required source evidence');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(path,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error(path+' HTTP '+response.status);
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  async function hydrateCore(){
    let last;
    // Source ASR is small and source-critical. It gets its OWN timeout and
    // bounded retry, independent of the experiment's comparison.json.
    for(let attempt=1;attempt<=2;attempt++){
      try{
        if(!core||!window.HL_PARTICIPATION_ASR?.attach)
          throw Error('Required original-source transcription adapter missing');
        const raw=await readJson(core.asr,9000);
        const accepted=window.HL_PARTICIPATION_ASR.attach(raw);
        readiness('ready',null,accepted);
        return;
      }catch(error){
        last=error;
        console.warn('Core demo evidence attempt '+attempt+' failed:',error.message);
      }
    }
    readiness('failed','Original source transcript failed validation or loading');
    console.error('Default recording is INCOMPLETE: same-source host ASR unavailable.',
      last?.message||'unknown error');
  }
  async function hydrateOptionalStudy(){
    // A missing experimental model comparator is NOT a dependency of core V4.
    if(!window.HL_SOURCE_ADAPTER?.normalize)return;
    try{
      const [data,manifest]=await Promise.all([
        readJson('nine-tickers/comparison.json',5000),
        readJson('nine-tickers/video-manifest.json',5000).catch(error=>{
          console.warn('Optional comparison video manifest unavailable:',error.message);
          return null;
        })
      ]);
      const normalized=window.HL_SOURCE_ADAPTER.normalize(data);
      try{
        window.HL_FEATURED_SOURCE=window.HL_SOURCE_ADAPTER.attachVideo(normalized,manifest);
      }catch(error){
        console.warn('Optional comparison video failed identity verification:',error.message);
        window.HL_FEATURED_SOURCE=normalized; // Its independent original audio remains.
      }
    }catch(error){
      window.HL_FEATURED_SOURCE=null;
      console.warn('Optional 180s model research unavailable; main speech unaffected:',error.message);
    }
  }
  Promise.allSettled([hydrateCore(),hydrateOptionalStudy()])
    .finally(launch);
})();