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
        await page.waitForFunction(()=>document.getElementById("labStatus")?.textContent?.includes("75,673-record retrieval report"),null,{timeout:18000});
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
        assert.match(text,/2\/3 engines · 0 exact/);
        assert.match(text,/FULL CATALOGUE/);
        await page.locator("#phaseSelect").selectOption("compact");
        assert((await page.locator(".transcript").count())===3);
        assert((await page.locator("#sourceTranscripts").textContent()).includes("momebrion"));
        // Tenth lane is a verbatim unprompted medoid, not a fabricated correction.
        const data=await (await page.request.get(root+"/streaming-demo/nine-tickers/comparison.json")).json();
        const block=data.clips[3];
        const raw=Object.entries(block.texts).filter(([id])=>id.endsWith("--control")).map(([,t])=>t);
        assert(raw.includes(await page.locator("#hlText").textContent()),"HL baseline must equal one original raw lane");
        const report=await (await page.request.get(root+"/streaming-lab/catalogue-review.json")).json();
        assert.equal(await page.locator("#hlText").textContent(),block.texts[report.rows[3].lane]);
        assert.match(await page.locator("#hlMeta").textContent(),/not accuracy or correction/);
        await page.locator("#annotationBlock").selectOption("3");
        await page.locator("#blindReview").check();
        assert.equal(await page.locator("#sourceFrame").isVisible(),false);
        assert.equal(await page.locator("#hlTrack").isVisible(),false);
        assert.equal(await page.locator("#candidateList").isVisible(),false);
        await page.locator("#listenBlock").click();
        await page.waitForFunction(()=>{
          const v=document.getElementById("sourceFrame").contentDocument.getElementById("video");
          return !v.paused && v.currentTime>=45 && v.currentTime<60;
        },null,{timeout:15000});
        await page.locator("#listenBlock").click();
        assert.match(await page.locator("#listenStatus").textContent(),/stopped/);
        assert(await page.evaluate(()=>document.getElementById("sourceFrame").contentDocument.getElementById("video").paused));
        // Deterministically exercise cancellation of an unresolved play()
        // request, including a stale rejection after starting another block.
        // The real-playback assertion above is still mandatory.
        const race=await page.evaluate(async()=>{
          const v=document.getElementById("sourceFrame").contentDocument.getElementById("video");
          const original=v.play,button=document.getElementById("listenBlock");
          const status=document.getElementById("listenStatus");
          const rejects=[];
          v.play=()=>new Promise((_,reject)=>rejects.push(reject));
          try{
            button.click();button.click();
            rejects[0](new DOMException("Playback interrupted","AbortError"));
            await Promise.resolve();await Promise.resolve();
            const stopped=status.textContent;
            button.click();button.click();button.click();
            rejects[1](new DOMException("Previous playback interrupted","AbortError"));
            await Promise.resolve();await Promise.resolve();
            const restarted=status.textContent;
            rejects[2](new DOMException("Current playback blocked","NotAllowedError"));
            await Promise.resolve();await Promise.resolve();
            return {stopped,restarted,blocked:status.textContent,button:button.textContent};
          }finally{v.play=original}
        });
        assert.match(race.stopped,/stopped/);
        assert.match(race.restarted,/Listening to/);
        assert.match(race.blocked,/Playback blocked or unavailable/);
        assert.equal(race.button,"Listen to block");
        console.log("LAB_LISTEN_CANCELLATION_RACE_PASS "+JSON.stringify({viewport:size,staleRejectionIgnored:true,currentFailureReported:true}));
        await page.locator("#referenceText").fill("SYNTHETIC browser QA draft only");
        await page.locator("#referenceStatus").selectOption("draft");
        await page.locator("#reviewerName").fill("Browser QA");
        await page.locator("#saveReference").click();
        assert.match(await page.locator("#annotationCount").textContent(),/1\/12/);
        const promise=page.waitForEvent("download");
        await page.locator("#exportReference").click();
        const download=await promise;
        const fs=require("node:fs");
        const saved=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
        assert.equal(saved.split,"development_only");
        assert.equal(saved.heldOut,false);
        assert.equal(saved.humanGoldAvailable,false);
        assert.equal(saved.rows[0].text,"SYNTHETIC browser QA draft only");
        assert.equal(saved.rows[0].partSha256,data.source.sourcePartSha256);
        assert.equal(saved.rows[0].startMs,(data.source.sourcePartOffsetSeconds+45)*1000);
        assert.equal(saved.rows[0].endMs,(data.source.sourcePartOffsetSeconds+60)*1000);
        await page.locator("#annotationBlock").selectOption("4");
        assert.equal(await page.locator("#referenceText").inputValue(),"");
        await page.locator("#annotationBlock").selectOption("3");
        assert.equal(await page.locator("#referenceText").inputValue(),"SYNTHETIC browser QA draft only");
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#reviewPanel").isVisible(),false);
        assert.equal(await page.locator("#sourceFrame").isVisible(),true);
        assert.equal(await page.locator("#hlTrack").isVisible(),true);
        assert.equal(errors.length,0,"Source and lab JS errors");
        assert.equal(bad.length,0,"Preview assets returned HTTP errors");
        console.log("STREAMING_LAB_BROWSER_PASS "+JSON.stringify({viewport:size,source,block4ReviewOnly:true,originalTextPreserved:true,probeAbstains:true}));
      }finally{await page.close();}
    }
  }finally{await browser.close();}
})().catch(err=>{console.error("STREAMING_LAB_BROWSER_FAIL",err);process.exitCode=1;});
