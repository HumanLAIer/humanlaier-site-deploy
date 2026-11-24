#!/usr/bin/env node
"use strict";
// Browser QA against the same bundled source media and nine-ticker player.
// Run after build-pages.cjs using the range-capable local test server or HTTPS.
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const root=(process.env.HL_SITE_PUBLIC_BASE||"http://127.0.0.1:18764").replace(/\/+$/,"");
(async()=>{
  const browser=await chromium.launch({headless:true,channel:"chrome",
    args:["--no-sandbox","--disable-dev-shm-usage"]});
  try{
    for(const size of [{width:1366,height:768},{width:390,height:844}]){
      const page=await browser.newPage({viewport:size});
      const errors=[];
      page.on("pageerror",error=>errors.push(error.message));
      const bad=[];
      page.on("response",r=>{
        if(r.url().startsWith(root)&&r.status()>=400)bad.push([r.status(),r.url()]);
      });
      try{
        await page.goto(root+"/streaming-lab/",{waitUntil:"domcontentloaded",timeout:35000});
        await page.waitForFunction(()=>{
          const frame=document.getElementById("sourceFrame");
          return frame?.contentDocument?.querySelectorAll(".ticker-row").length===9 &&
            frame.contentDocument.getElementById("video")?.getAttribute("src")==="commercial-180.mp4";
        },null,{timeout:22000});
        await page.waitForFunction(()=>document.getElementById("labStatus")?.textContent?.includes("12 × 15-second"),null,{timeout:18000});
        assert.equal(await page.locator("#reviewPanel").isVisible(),false);
        assert.equal(await page.locator("#openReview").getAttribute("aria-expanded"),"false");
        const source=await page.evaluate(()=>{
          const f=document.getElementById("sourceFrame");
          return {src:f.getAttribute("src"),
            tickers:f.contentDocument.querySelectorAll(".ticker-row").length,
            blocks:f.contentDocument.querySelectorAll(".ticker-chunk").length,
            sourceVideo:f.contentDocument.getElementById("video").getAttribute("src"),
            htmlWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        });
        assert.equal(source.tickers,9);
        assert.equal(source.blocks,108);
        assert.equal(source.sourceVideo,"commercial-180.mp4");
        assert(source.htmlWidth<=size.width+2,"Research preview must not overflow width");
        await page.locator("#openReview").click();
        assert.equal(await page.locator("#reviewPanel").isVisible(),true);
        await page.locator('[data-probe="Mbreon"]').click();
        assert.match(await page.locator("#probeResult").textContent(),/REVIEW Umbreon · pokeapi:species:197/);
        await page.locator('[data-probe="Bracky"]').click();
        assert.match(await page.locator("#probeResult").textContent(),/User-supplied spelling/);
        await page.locator('[data-probe="月亮伊布"]').click();
        assert.match(await page.locator("#probeResult").textContent(),/REVIEW Umbreon/);
        await page.locator('[data-probe="ordinary conversation"]').click();
        assert.match(await page.locator("#probeResult").textContent(),/ABSTAIN/);
        // Compare actual original model output in its source block.
        await page.waitForFunction(()=>{
          const player=document.querySelector("#sourceFrame")?.contentDocument?.getElementById("video");
          return player && player.readyState>=1;
        },null,{timeout:25000});
        await page.evaluate(()=>{
          document.getElementById("sourceFrame").contentDocument.getElementById("video").currentTime=48;
        });
        await page.waitForFunction(()=>document.getElementById("clipClock").textContent==="00:45–01:00",null,{timeout:13000});
        const text=await page.locator("#candidateList").textContent();
        assert.match(text,/Umbreon\?/);
        for(const cue of ["mombreon","momebrion","um bombion"]) assert(text.includes(cue));
        assert.match(text,/LISTEN TO VERIFY/);
        await page.locator("#phaseSelect").selectOption("compact");
        assert((await page.locator(".transcript").count())===3);
        assert((await page.locator("#sourceTranscripts").textContent()).includes("momebrion"));
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#reviewPanel").isVisible(),false);
        assert.equal(errors.length,0,"Source and lab JS errors");
        assert.equal(bad.length,0,"Preview assets returned HTTP errors");
        console.log("STREAMING_LAB_BROWSER_PASS "+JSON.stringify({viewport:size,source,block4ReviewOnly:true,originalTextPreserved:true,probeAbstains:true}));
      }finally{await page.close();}
    }
  }finally{await browser.close();}
})().catch(err=>{console.error("STREAMING_LAB_BROWSER_FAIL",err);process.exitCode=1;});
