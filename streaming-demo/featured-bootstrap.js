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
  Promise.all([
    readJson('nine-tickers/comparison.json'),
    readJson('nine-tickers/video-manifest.json').catch(error=>{
      // Video is optional. Transcript changes and unavailable video cannot
      // prevent the existing original-audio + V4 playback experience.
      console.warn('Video manifest unavailable; retaining original audio:',error.message);
      return null;
    })
  ]).then(([data,videoManifest])=>{
    const normalized=window.HL_SOURCE_ADAPTER.normalize(data);
    try{
      window.HL_FEATURED_SOURCE=window.HL_SOURCE_ADAPTER.attachVideo(normalized,videoManifest);
    }catch(error){
      console.warn('Video source validation failed; retaining verified audio:',error.message);
      window.HL_FEATURED_SOURCE=normalized;
    }
  }).catch(error=>{
    window.HL_FEATURED_SOURCE=null;
    console.warn('Original ASR unavailable; preserved archived V4 remains playable:',error.message);
  }).finally(()=>{clearTimeout(timeout);launch();});
})();