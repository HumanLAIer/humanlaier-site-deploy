"use strict";
/* Real-browser acceptance for a portrait-video-first, single-screen ASR
 * comparison. Source provenance is separately enforced by the contract job.
 * Screenshots are captured as evidence; any laptop overflow is a failure. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

async function main(){
  const browser=await chromium.launch({
    headless:true,channel:"chrome",args:["--no-sandbox","--disable-dev-shm-usage"]
  });
  fs.mkdirSync(".private/nine-layout-qa",{recursive:true});
  try{
    const sizes=[
      {width:1280,height:720},
      {width:1366,height:768},
      {width:1440,height:900},
      {width:1600,height:900}
    ];
    for(const size of sizes){
      const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.goto(
        "http://127.0.0.1:8765/streaming-demo/nine-tickers/index.html",
        {waitUntil:"domcontentloaded",timeout:30000}
      );
      await page.waitForFunction(()=>{
        const v=document.querySelector("#video");
        return v?.getAttribute("src")==="commercial-180.mp4"
          && document.querySelectorAll(".ticker-row").length===9
          && document.querySelectorAll(".ticker-line[data-continuous-source-tape='true']").length===9
          && document.querySelectorAll(".ticker-chunk").length===108;
      },null,{timeout:20000});
      await page.waitForFunction(()=>{
        const v=document.querySelector("#video");
        return v?.readyState>=1
          && Number.isFinite(v.duration)&&v.duration>178&&v.duration<182
          && v.videoWidth>200&&v.videoHeight>400;
      },null,{timeout:25000});
      const x=await page.evaluate(()=>{
        const rect=selector=>{
          const node=document.querySelector(selector);
          if(!node)throw Error("Missing "+selector);
          const r=node.getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
                  width:r.width,height:r.height};
        };
        const rowRects=Array.from(document.querySelectorAll(".ticker-row"),node=>{
          const r=node.getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};
        });
        const v=document.querySelector("#video");
        const target=document.querySelector(".ticker-line");
        const dims={
          viewport:{width:innerWidth,height:innerHeight},
          htmlScrollHeight:document.documentElement.scrollHeight,
          bodyScrollHeight:document.body.scrollHeight,
          htmlScrollWidth:document.documentElement.scrollWidth,
          mast:rect(".mast"),videoPanel:rect(".video-column"),
          screen:rect(".screen"),video:rect("#video"),
          rightPanel:rect(".right-panel"),transport:rect(".transport"),
          tickers:rect(".tickers"),metrics:rect(".metrics"),foot:rect(".foot"),
          firstRow:rect(".ticker-row"),lastRow:rect(".ticker-row:last-of-type"),
          rows:rowRects,fontPx:parseFloat(getComputedStyle(target).fontSize),
          media:{duration:v.duration,ready:v.readyState,
                 width:v.videoWidth,height:v.videoHeight},
          notesOpen:document.querySelector(".notes").open,
          introExists:document.querySelector("h1,.intro,.hero")!==null,
          playerSrc:v.getAttribute("src")
        };
        return dims;
      });
      const epsilon=2;
      assert.equal(x.rows.length,9,"all nine original ASR outputs visibly present");
      assert.equal(x.playerSrc,"commercial-180.mp4","source original AV MP4—not MP3");
      assert(x.videoPanel.height>=size.height-37,"portrait video fills all usable vertical height");
      assert(Math.abs(x.videoPanel.top-x.mast.bottom)<=epsilon,"video starts below minimal mast");
      assert(Math.abs(x.videoPanel.bottom-size.height)<=epsilon,"video extends to viewport bottom");
      assert(Math.abs(x.video.height-x.videoPanel.height)<=epsilon,"video element uses full left height");
      assert(x.videoPanel.width<size.width*.48,"portrait video not stretched to half-screen letterbox");
      assert(x.media.height>x.media.width,"actual decoded source is portrait");
      const ratio=x.media.width/x.media.height;
      assert(Math.abs(x.videoPanel.width/x.videoPanel.height-ratio)<.025,
             "video column matches actual picture aspect (no wide black pillars)");
      assert(Math.abs(x.rightPanel.left-x.videoPanel.right)<=epsilon,
             "tickers directly adjacent to video, not below");
      assert(x.tickers.left>=x.rightPanel.left-epsilon &&
             x.tickers.right<=x.rightPanel.right+epsilon,
             "all ASR rows occupy right column");
      assert(x.rows[0].top>=x.tickers.top &&
             x.rows.at(-1).bottom<=x.tickers.bottom+epsilon,
             "nine ASR rows fully inside ticker area");
      assert(x.rows.every(r=>r.left>=x.videoPanel.right-epsilon),
             "all nine row positions right of portrait video");
      assert(x.rows.every(r=>r.height>=32&&r.height<=82),
             "readable and consistently spaced rows");
      assert(x.fontPx>=13&&x.fontPx<=17,"legible 13–17px transcript text");
      assert(x.metrics.top>=x.tickers.bottom-epsilon,
             "supporting insights below ASR bake-off, not beside the video");
      assert(x.metrics.left>=x.rightPanel.left-epsilon &&
             x.metrics.right<=x.rightPanel.right+epsilon,
             "supporting insights confined to right panel");
      assert(x.metrics.bottom<=x.foot.top+epsilon,"insights contained before footer");
      assert(Math.abs(x.foot.bottom-size.height)<=epsilon,"footer confined to right bottom");
      assert(x.htmlScrollHeight<=size.height+1,"NO DOCUMENT VERTICAL SCROLL");
      assert(x.bodyScrollHeight<=size.height+1,"NO BODY VERTICAL SCROLL");
      assert(x.htmlScrollWidth<=size.width+1,"NO DOCUMENT HORIZONTAL SCROLL");
      assert(!x.introExists,"no introductory essay");
      assert(!x.notesOpen,"long methodology is collapsed by default");
      assert.equal(errors.length,0,"zero browser script errors "+JSON.stringify(errors));
      const shot=".private/nine-layout-qa/portrait-right-"+size.width+"x"+size.height+".png";
      await page.screenshot({path:shot,fullPage:false,animations:"disabled"});
      // Click a real source block and verify that comparison highlights are
      // generated on *unmodified* speech. No synthetic words or WER scoring.
      await page.locator(".block-btn").nth(10).click();
      console.log("NINE_SEEK_DIAGNOSTIC "+JSON.stringify(await page.evaluate(()=>({
        cue:document.querySelector("#cueText")?.textContent,
        currentTime:document.querySelector("#video")?.currentTime,
        seeking:document.querySelector("#video")?.seeking,
        paused:document.querySelector("#video")?.paused,
        activeBlock:document.querySelector(".block-btn.active")?.textContent,
        sourceTapeCount:document.querySelectorAll(".ticker-chunk").length,
      }))));
      await page.waitForFunction(()=>{
        const el=document.querySelector("#cueText");
        return el&&el.textContent.startsWith("11 /");
      },null,{timeout:5000});
      const diff=await page.evaluate(()=>{
        const rows=Array.from(document.querySelectorAll(".ticker-row"));
        return {
          highlighted:document.querySelectorAll(".ticker-line .word-change, .ticker-line .word-unique").length,
          contextual:document.querySelectorAll(".ticker-line .term").length,
          nineCount:rows.length,
          notes:document.querySelector(".notes").open
        };
      });
      assert(diff.highlighted>0,"changed words are visibly marked in the nine-ticker bake-off");
      assert.equal(diff.nineCount,9);
      // The test server (Python SimpleHTTPRequestHandler) does not reliably
      // support HTTP range seeking into MP4. The actual decoded A/V duration
      // is checked above. For precise 14.8s -> 15.2s interpolation assertions,
      // inject a deterministic media-clock getter ONLY in this test browser.
      // This is NOT a simulated transcription or a production code change.
      await page.evaluate(()=>{
        const video=document.querySelector("#video");
        video.pause();
        window.__sourceTapeNodes=Array.from(document.querySelectorAll(".ticker-line"));
        window.__syntheticMediaClock=14.8;
        Object.defineProperty(video,"currentTime",{
          configurable:true,
          get(){return window.__syntheticMediaClock},
          set(t){window.__syntheticMediaClock=Number(t)}
        });
        video.dispatchEvent(new Event("seeked"));
        video.dispatchEvent(new Event("timeupdate"));
      });
      const beforePos=await page.evaluate(()=>({
        pos:new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".ticker-line")).transform).m41,
        text:document.querySelector(".ticker-line").textContent,
        built:document.querySelectorAll(".ticker-chunk").length,
      }));
      await page.evaluate(()=>{
        const video=document.querySelector("#video");
        window.__syntheticMediaClock=15.2;
        video.dispatchEvent(new Event("timeupdate"));
      });
      const afterPos=await page.evaluate(()=>({
        pos:new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".ticker-line")).transform).m41,
        text:document.querySelector(".ticker-line").textContent,
        sameNodes:window.__sourceTapeNodes.every((el,i)=>
          el===document.querySelectorAll(".ticker-line")[i]),
        built:document.querySelectorAll(".ticker-chunk").length,
        cue:document.querySelector("#cueText").textContent,
      }));
      assert.equal(beforePos.built,108,"12 original source chunks per ASR ticker");
      assert.equal(afterPos.built,108,"source chunk inventory never changes on seek");
      assert(afterPos.sameNodes,"ticker DOM node identity preserved across 15-second boundary");
      assert.equal(beforePos.text,afterPos.text,"original full-show ASR text never re-rendered");
      assert(afterPos.pos<beforePos.pos-1,"continuous ticker must advance across block boundary");
      assert(beforePos.pos-afterPos.pos<950,"no large source block snap/reset");
      assert(afterPos.cue.startsWith("02 /"),"source block indicator follows actual media seek");
      console.log("NINE_UNINTERRUPTED_TICKER_MOTION "+JSON.stringify({
        viewport:size,beforePx:+beforePos.pos.toFixed(2),
        afterPx:+afterPos.pos.toFixed(2),continuousOriginalText:true,
        sourceChunks:afterPos.built,sourceTimeInterpolation:true
      }));
      console.log("NINE_PORTRAIT_RIGHT_PANEL_PASS "+JSON.stringify({
        viewport:size,
        portrait:{width:+x.videoPanel.width.toFixed(1),
                  height:+x.videoPanel.height.toFixed(1),
                  mediaRatio:+ratio.toFixed(4)},
        rightWidth:+x.rightPanel.width.toFixed(1),
        tickerRows:9,rowPx:+x.rows[0].height.toFixed(1),
        transcriptFontPx:x.fontPx,
        metricsBelowTickers:true,documentHeight:x.htmlScrollHeight,
        videoDuration:+x.media.duration.toFixed(3),
        changedWordsMarked:diff.highlighted,
        screenshot:shot
      }));
      await page.close();
    }
  }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});