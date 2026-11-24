#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');const {chromium}=require('playwright');
const root=(process.env.HL_SITE_PUBLIC_BASE||'http://127.0.0.1:18764').replace(/\/+$/,'');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
const p=await b.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(root+'/streaming-lab/nine-tickers-nov22/',{waitUntil:'domcontentloaded',timeout:40000});
await p.waitForFunction(()=>document.querySelectorAll('.lane').length===9&&document.querySelector('#player').readyState>=1,null,{timeout:30000});
assert.equal(await p.locator('#blocks option').count(),43);assert.equal(await p.locator('#blockStrip button').count(),43);
assert.equal(await p.locator('#review').getAttribute('open'),null);assert.equal(await p.locator('#results').getAttribute('open'),null);
assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
assert.match(await p.locator('#status').textContent(),/43 source blocks/);
await p.evaluate(async()=>{const a=document.querySelector('#player');await a.play();});
await p.waitForFunction(()=>document.querySelector('#player').currentTime>.25,null,{timeout:10000});
await p.evaluate(()=>document.querySelector('#player').pause());
await p.locator('#blocks').selectOption('23');
await p.waitForFunction(()=>document.querySelector('#player').getAttribute('src')==='part-2.flac'&&document.querySelector('#player').readyState>=1&&Math.abs(document.querySelector('#player').currentTime-30)<.08,null,{timeout:25000});
assert.match(await p.locator('#cue').textContent(),/BLOCK 24\/43/);
await p.locator('#blocks').selectOption('42');
await p.waitForFunction(()=>document.querySelector('#player').getAttribute('src')==='part-3.flac'&&document.querySelector('#player').readyState>=1&&Math.abs(document.querySelector('#player').currentTime-15)<.08,null,{timeout:25000});
assert.match(await p.locator('#cue').textContent(),/BLOCK 43\/43/);
assert.equal(await p.locator('#next').isDisabled(),true);
await p.locator('.lane button').first().click();assert.equal(await p.locator('#review').getAttribute('open'),'');
assert.equal(await p.locator('#metrics tr').count(),9);
assert.deepEqual(errors,[]);
await p.close();}
console.log('NOV22_NINE_BROWSER_PASS desktop/mobile exact three-part playback and seeking');}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
