"use strict";
// Browser-level acceptance, not a CSS guess: all 9 rows + original video
// and 50/50 commercial metrics must be on one 1280x720 laptop viewport.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

async function main(){
  const browser=await chromium.launch({headless:true,channel:"chrome",args:["--no-sandbox","--disable-dev-shm-usage"]});
  fs.mkdirSync(".private/nine-layout-qa",{recursive:true});
  try {
    const sizes=[
      {width:1280,height:720},
      {width:1366,height:768},
      {width:1440,height:900},
      {width:1600,height:900},
    ];
    for(const size of sizes){
      const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.goto("http://127.0.0.1:8765/streaming-demo/nine-tickers/index.html",{
        waitUntil:"domcontentloaded",timeout:30000
      });
      await page.waitForFunction(()=>{
        const v=document.querySelector("#video");
        return v?.getAttribute("src")==="commercial-180.mp4"
          && document.querySelectorAll(".ticker-row").length===9
          && document.querySelector(".ticker-line")?.textContent
             !== "[Awaiting verified model output]";
      },null,{timeout:20000});
      const x=await page.evaluate(()=>{
        const rect=sel=>{
          const r=document.querySelector(sel).getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
                  width:r.width,height:r.height};
        };
        const rows=Array.from(document.querySelectorAll(".ticker-row"));
        const rowRects=rows.map(n=>{
          const r=n.getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,height:r.height};
        });
        const font=parseFloat(getComputedStyle(document.querySelector(".ticker-line")).fontSize);
        return {
          viewport:{width:innerWidth,height:innerHeight},
          htmlScrollHeight:document.documentElement.scrollHeight,
          bodyScrollHeight:document.body.scrollHeight,
          htmlScrollWidth:document.documentElement.scrollWidth,
          video:rect("#video"),
          screen:rect(".screen"),
          metrics:rect(".metrics"),
          tickers:rect(".tickers"),
          foot:rect(".foot"),
          mast:rect(".mast"),
          rowRects,font,
          source:document.querySelector("#video").getAttribute("src"),
          firstLine:document.querySelector(".ticker-line").textContent.slice(0,100),
          notesOpen:document.querySelector(".notes").open,
        };
      });
      assert.equal(x.rowRects.length,9,"exact nine source-verified ticker rows");
      assert.equal(x.source,"commercial-180.mp4","real video source attached");
      assert(x.video.width>400&&x.video.height>200,"video visibly large");
      assert(x.screen.width>400&&x.metrics.width>400,"50/50 upper columns");
      assert(Math.abs(x.screen.width-x.metrics.width)<=3,"equal-width video and metrics columns");
      assert(Math.abs(x.screen.top-x.metrics.top)<=2,"video and metrics aligned vertically");
      assert(x.tickers.top>=x.screen.bottom-1,"all tickers below video");
      assert(x.rowRects[0].top>=x.tickers.top,"ticker rows begin inside lower half");
      assert(x.rowRects.at(-1).bottom<=x.foot.top+1,"ninth row fully above footer");
      assert(x.rowRects.every(y=>y.height>=19&&y.height<=29),"CNBC-size <=29px ticker strips");
      assert(x.font>=10&&x.font<=12,"roughly ten-pixel dense ticker text");
      assert(x.htmlScrollHeight<=size.height+1,"NO PAGE VERTICAL SCROLL");
      assert(x.bodyScrollHeight<=size.height+1,"NO BODY VERTICAL SCROLL");
      assert(x.htmlScrollWidth<=size.width+1,"NO PAGE HORIZONTAL SCROLL");
      assert(!x.notesOpen,"notes collapsed by default");
      assert.equal(errors.length,0,"no page script errors: "+JSON.stringify(errors));
      console.log("NINE_VIEWPORT_GEOMETRY_PASS "+JSON.stringify({
        viewport:size,rows:x.rowRects.length,
        tickerRowPx:+x.rowRects[0].height.toFixed(1),
        fontPx:x.font,videoPanelPx:{w:x.screen.width,h:x.screen.height},
        metricsPanelPx:{w:x.metrics.width,h:x.metrics.height},
        pageHeight:x.htmlScrollHeight,lastRowBottom:x.rowRects.at(-1).bottom
      }));
      const shot=".private/nine-layout-qa/"+size.width+"x"+size.height+".png";
      await page.screenshot({path:shot,fullPage:false,animations:"disabled"});
      const video=page.locator("#video");
      await video.evaluate(v=>v.load());
      try {
        await page.waitForFunction(()=>{
          const v=document.querySelector("#video");
          return Number.isFinite(v.duration)&&v.duration>178&&v.duration<182
                &&v.readyState>=1;
        },null,{timeout:25000});
      } catch(error) {
        const state=await video.evaluate(v=>({
          readyState:v.readyState,networkState:v.networkState,
          errorCode:v.error?.code,errorMessage:v.error?.message,
          currentSrc:v.currentSrc,canPlayH264:v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
        }));
        console.error("NINE_VIDEO_METADATA_DIAGNOSTIC "+JSON.stringify(state));
        throw error;
      }
      const time=await video.evaluate(v=>({duration:v.duration,readyState:v.readyState}));
      assert(time.duration>178&&time.duration<182,"actual playable 180s media metadata");
      console.log("NINE_LAYOUT_PASS "+JSON.stringify({
        viewport:size,rows:x.rowRects.length,tickerRowPx:+x.rowRects[0].height.toFixed(1),
        fontPx:x.font,videoPx:{w:x.video.width,h:x.video.height},
        metricsPx:{w:x.metrics.width,h:x.metrics.height},
        documentHeight:x.htmlScrollHeight,ninthRowBottom:x.rowRects.at(-1).bottom,
        videoDuration:+time.duration.toFixed(3),screenshot:shot
      }));
      await page.close();
    }
  }finally{await browser.close()}
}

main().catch(err=>{console.error(err);process.exitCode=1});
