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
    script.src='app.js?v=chatroom-20261123-2';
    script.onerror=()=>console.error('Signal Recorder V4 script unavailable');
    document.body.append(script);
  }
  if(!window.HL_SOURCE_ADAPTER?.normalize||typeof fetch!=='function'){
    launch();return;
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6000);
  fetch('nine-tickers/comparison.json',{cache:'no-store',signal:controller.signal})
    .then(response=>{
      if(!response.ok)throw Error('HTTP '+response.status);
      return response.json();
    })
    .then(data=>{
      window.HL_FEATURED_SOURCE=window.HL_SOURCE_ADAPTER.normalize(data);
    })
    .catch(error=>{
      window.HL_FEATURED_SOURCE=null;
      console.warn('Original ASR unavailable; preserved archived V4 remains playable:',error.message);
    })
    .finally(()=>{clearTimeout(timeout);launch();});
})();