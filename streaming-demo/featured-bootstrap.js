/* Boot V4 once, with current same-origin source ASR if available.
 * Do not fork a second workstation or require a fixed transcript shape.
 * On failed/unavailable research data the original archived V4 still works.
 */
'use strict';
(()=>{
  let launched=false;
  function launch(){
    if(launched)return;
    launched=true;
    const script=document.createElement('script');
    script.src='app.js?v=video-20261123-1';
    script.onerror=()=>console.error('Signal Recorder V4 script unavailable');
    document.body.append(script);
  }
  if(!window.HL_SOURCE_ADAPTER?.normalize||typeof fetch!=='function'){
    launch();return;
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6000);
  const readJson=path=>fetch(path,{cache:'no-store',signal:controller.signal})
    .then(response=>{
      if(!response.ok)throw Error(path+' HTTP '+response.status);
      return response.json();
    });
  const comparisonTask=Promise.all([
    readJson('nine-tickers/comparison.json'),
    readJson('nine-tickers/video-manifest.json').catch(error=>{
      console.warn('Separate 180s research video unavailable; retaining source audio:',error.message);
      return null;
    })
  ]).then(([data,videoManifest])=>{
    const normalized=window.HL_SOURCE_ADAPTER.normalize(data);
    try{
      window.HL_FEATURED_SOURCE=window.HL_SOURCE_ADAPTER.attachVideo(normalized,videoManifest);
    }catch(error){
      console.warn('180s research video validation failed:',error.message);
      window.HL_FEATURED_SOURCE=normalized;
    }
  }).catch(error=>{
    window.HL_FEATURED_SOURCE=null;
    console.warn('Separate 180s source study unavailable:',error.message);
  });
  const participationTask=readJson('assets/nov17-participation-asr.json')
    .then(raw=>{
      if(!window.HL_PARTICIPATION_ASR?.attach)
        throw Error('Same-source participation ASR adapter missing');
      const accepted=window.HL_PARTICIPATION_ASR.attach(raw);
      console.info('Actual original V4 source ASR ready:',accepted.segments,
        'media-local passages',accepted.model);
    }).catch(error=>{
      // Do not invent speech, splice in the OTHER recording, or prevent the
      // already sourced 140 activity events from being browsed.
      console.error('Original Nov17 host ASR failed to load:',error.message);
    });
  Promise.allSettled([comparisonTask,participationTask])
    .finally(()=>{clearTimeout(timeout);launch();});
})();