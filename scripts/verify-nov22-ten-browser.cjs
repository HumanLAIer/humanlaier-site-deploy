#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=(process.env.HL_SITE_PUBLIC_BASE||'http://127.0.0.1:18764').replace(/\/+$/,'');
const sizes=[{width:1280,height:720},{width:1440,height:900},{width:390,height:844}];
const shape=()=>Object.fromEntries(['.mast','.video-column','.right-panel','.transport','.tickers','.metrics','.foot'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{top:r.top,height:r.height,bottom:r.bottom}]}));
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const viewport of sizes){
 const canonical=await b.newPage({viewport});const p=await b.newPage({viewport});const errors=[];
 try{
  p.on('pageerror',e=>errors.push(e.message));
  await Promise.all([canonical.goto(root+'/streaming-demo/nine-tickers/',{waitUntil:'domcontentloaded',timeout:40000}),p.goto(root+'/streaming-lab/ten-tickers-nov22/',{waitUntil:'domcontentloaded',timeout:40000})]);
  await canonical.waitForFunction(()=>document.querySelectorAll('.ticker-chunk').length===108&&document.querySelector('#video').readyState>=1,null,{timeout:35000});
  await p.waitForFunction(()=>document.querySelectorAll('.ticker-chunk').length===430&&document.querySelector('#video').readyState>=1&&document.querySelector('#audioStatus').textContent.includes('SOURCE-VERIFIED'),null,{timeout:35000});
  assert.equal(await p.locator('.ticker-row').count(),10);
  assert.equal(await p.locator('.ticker-line[data-continuous-source-tape="true"]').count(),10);
  assert.equal(await p.locator('#blockNav button').count(),43);
  assert.equal(await p.locator('#stockTickers .ticker-row').count(),1);
  assert.equal(await p.locator('#stockTickers .ticker-chunk .term').count(),0);
  assert.equal(await p.locator('.notes').getAttribute('open'),null);
  assert.equal(await p.locator('#review').getAttribute('open'),null);
  assert.equal(await p.locator('#results').getAttribute('open'),null);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  const [actual,expected]=await Promise.all([p.evaluate(shape),canonical.evaluate(shape)]);
  for(const k of Object.keys(expected))for(const metric of ['top','height','bottom'])
    assert(Math.abs(actual[k][metric]-expected[k][metric])<=2,k+' '+metric+' differs: '+JSON.stringify({actual:actual[k],expected:expected[k]}));
  assert(await p.evaluate(()=>{const v=document.querySelector('#video'),r=v.getBoundingClientRect();return v.videoWidth===640&&v.videoHeight===1280&&r.height>280&&r.width>100}));
  assert(await p.evaluate(()=>Array.from(document.styleSheets).some(s=>s.href&&new URL(s.href).pathname==='/streaming-demo/nine-tickers/styles.css')));
  assert.equal(await p.locator('#metricComments').textContent(),'43');assert.equal(await p.locator('#metricBuyer').textContent(),'430');
  await p.evaluate(async()=>{const v=document.querySelector('#video');await v.play()});
  await p.waitForFunction(()=>document.querySelector('#video').currentTime>.35,null,{timeout:15000});
  const firstTransform=await p.locator('.ticker-line').first().evaluate(n=>n.style.transform);
  await p.waitForFunction(x=>document.querySelector('.ticker-line').style.transform!==x,firstTransform,{timeout:8000});
  await p.evaluate(()=>document.querySelector('#video').pause());
  const seek=async(i,part,sec)=>{
   await p.locator('#blockNav button').nth(i).click();
   await p.waitForFunction(({part,sec})=>{const v=document.querySelector('#video');return v.getAttribute('src')==='../nine-tickers-nov22/part-'+part+'.mp4'&&v.readyState>=1&&Math.abs(v.currentTime-sec)<.7&&v.dataset.sourceSeekRequested===''}, {part,sec},{timeout:30000});
   await p.evaluate(()=>document.querySelector('#video').pause());
   assert.equal(await p.locator('#blockNav button').nth(i).getAttribute('aria-pressed'),'true');
  };
  await seek(23,2,30);await seek(42,3,15);
  assert.match(await p.locator('#cueText').textContent(),/^43 \/ /);
  await seek(0,1,.023);
  await p.evaluate(async()=>{const v=document.querySelector('#video');v.currentTime=v.duration-.2;await v.play()});
  await p.waitForFunction(()=>{const v=document.querySelector('#video');return v.getAttribute('src')==='../nine-tickers-nov22/part-2.mp4'&&v.readyState>=1&&v.dataset.sourceSeekRequested===''},null,{timeout:30000});
  await p.evaluate(()=>document.querySelector('#video').pause());
  await p.locator('.notes>summary').click();await p.locator('#review>summary').click();
  assert(await p.locator('#candidateCount').textContent());await p.locator('#results>summary').click();
  assert.equal(await p.locator('#metrics tr').count(),10);
  await p.locator('.notes>summary').click();assert.deepEqual(errors,[]);
  console.log('NOV22_TEN_LAYOUT_PARITY_PASS '+JSON.stringify({viewport,sourceParts:3,blocks:43,tickers:10,originalVideo:true,shape:actual,automaticPartAdvance:true}));
 }finally{await canonical.close();await p.close()}
}}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
