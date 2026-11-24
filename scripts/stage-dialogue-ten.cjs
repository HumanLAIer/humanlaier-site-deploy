#!/usr/bin/env node
'use strict';
// Run only after the real public-export job succeeds. No generated/fake text,
// no mutation of the original study, no unverified artifacts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.resolve(process.argv[2]||'.missing'),expected=process.argv[3]||'';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.match(expected,/^[0-9a-f]{64}$/,'Require independently retrieved export manifest SHA-256');
assert.equal(sha(fs.readFileSync(path.join(source,'export-manifest.json'))),expected,'Export manifest changed');
cp.execFileSync(process.execPath,[path.join(root,'scripts/verify-dialogue-ten.cjs'),source],{stdio:'inherit'});
const d=JSON.parse(fs.readFileSync(path.join(source,'comparison.json'))),e=JSON.parse(fs.readFileSync(path.join(source,'export-manifest.json')));
const out=path.join(root,'streaming-lab/ten-tickers-nov22');
assert(!fs.existsSync(out),'Existing experiment immutable; use new versioned route for future studies');
fs.mkdirSync(out,{recursive:true});
for(const name of ['comparison.json','export-manifest.json','dialogue-1.wav','dialogue-2.wav','dialogue-3.wav'])fs.copyFileSync(path.join(source,name),path.join(out,name));
const template=path.join(root,'scripts/dialogue-ten-template');
for(const name of ['index.html','styles.css'])fs.copyFileSync(path.join(template,name),path.join(out,name));
let app=fs.readFileSync(path.join(template,'app.js'),'utf8');
for(const [a,b] of [['__REVIEW_SHA__',d.reviewSha256],['__DIALOGUE_SHA__',d.dialogueManifestSha256],['__COMPARISON_SHA__',e.files['comparison.json'].sha256]]){
 assert(app.includes(a));app=app.replace(a,b);
}
fs.writeFileSync(path.join(out,'app.js'),app);
const assets=['index.html','app.js','styles.css','comparison.json','export-manifest.json','dialogue-1.wav','dialogue-2.wav','dialogue-3.wav'].map(n=>'streaming-lab/ten-tickers-nov22/'+n);
const quoted=assets.map(n=>"'"+n+"'").join(',');
function edit(rel,fn){const p=path.join(root,rel),s=fs.readFileSync(p,'utf8'),t=fn(s);assert.notEqual(t,s,'No change to '+rel);fs.writeFileSync(p,t)}
const anchor="'streaming-lab/nine-tickers-nov22/part-3.mp4',";
edit('scripts/build-pages.cjs',s=>{
 assert.equal(s.split(anchor).length-1,2);s=s.replaceAll(anchor,anchor+'\n  '+quoted+',');
 const k="'streaming-lab/nine-tickers-nov22/index.html',\n                   'singlish-compare/index.html'";
 assert(s.includes(k));return s.replace(k,"'streaming-lab/nine-tickers-nov22/index.html','streaming-lab/ten-tickers-nov22/index.html',\n                   'singlish-compare/index.html'");
});
edit('scripts/verify-live-pages.cjs',s=>{
 assert(s.includes(anchor));s=s.replace(anchor,anchor+'\n  '+quoted+',');
 const k=" const originalVideo=await get(";
 assert(s.includes(k));return s.replace(k," for(let i=1;i<=3;i++){const a=await get('/streaming-lab/ten-tickers-nov22/dialogue-'+i+'.wav',{Range:'bytes=0-31'});assert.equal(a.status,206);assert.equal(a.bytes.toString('ascii',0,4),'RIFF');}\n"+k);
});
edit('scripts/build-research-pages.cjs',s=>{
 const k="'streaming-lab/catalogue-review.json'";assert(s.includes(k));return s.replace(k,k+',\n  '+quoted);
});
edit('streaming-lab/index.html',s=>{
 const k='<a href="./nine-tickers-nov22/" title="Full November 22 nine-ticker original video comparison">22 Nov study</a>';
 assert(s.includes(k));return s.replace(k,k+'\n    <a href="./ten-tickers-nov22/" title="Dialogue-only nine lanes and untreated stock Whisper">22 Nov dialogue study</a>');
});
edit('.github/workflows/ci-gated-pages.yml',s=>{
 const k='        run: node scripts/verify-nov22-nine.cjs';assert(s.includes(k));s=s.replace(k,k+'\n      - name: Verify all ten real dialogue/raw lanes and audio receipts\n        run: node scripts/verify-dialogue-ten.cjs');
 const j='          node scripts/verify-nov22-nine-browser.cjs';assert.equal(s.split(j).length-1,2);return s.replaceAll(j,j+'\n          node scripts/verify-nov22-ten-browser.cjs');
});
console.log('NOV22_TEN_RELEASE_STAGED '+JSON.stringify({assets,comparisonSha256:e.files['comparison.json'].sha256,originalVideoShared:true,originalStudyPreserved:true}));
