#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'streaming-lab/coats-guarded-nov22');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prior=fs.readFileSync(path.join(root,'streaming-lab/ten-tickers-nov22/comparison.json'));
const raw=fs.readFileSync(path.join(dir,'paired-results.json'));
assert.equal(sha(prior),'926e53149c424a7498205eecb1657e8acbf1394d42c033dcd77cef4bbecb1ffc');
assert.equal(sha(raw),'b354a1b575b6ba09858bcd781e995247f4eb4649e55f34f68b5fa91381ee8f70');
const d=JSON.parse(prior),g=JSON.parse(raw);
assert.equal(g.privateReportSha256,'ef1c300534b7c93cc64a1149d95482141865e840a8aa49bcb9058b3b91d43cde');
assert.equal(g.sourceManifestSha256,d.dialogueManifestSha256);assert.equal(g.baselinePublicSha256,sha(prior));
assert.equal(g.runId,45476538340);assert.equal(g.noAudioChanges,true);assert.equal(g.nativeTelemetryRetained,true);
assert.equal(g.humanAccuracyVerified,false);assert.equal(g.formalBenchmarkEligible,false);
const targets={control:[4,11,14,19,27,28],compact:[3,13,27,35,36],focused:[4,5,11,13,19,21,24,26,27,28,33,34,35,36,38]};
const id=i=>'clip'+String(i).padStart(3,'0');
const keys=new Set(Object.entries(targets).flatMap(([p,ids])=>ids.map(i=>p+'/combined/'+id(i))).concat(['fallback','penalty','ngram'].flatMap(p=>[4,27,38].map(i=>'focused/'+p+'/'+id(i)))));
assert.equal(keys.size,35);assert.equal(g.rows.length,35);
for(const r of g.rows){const k=[r.phase,r.profile,r.id].join('/');assert(keys.delete(k),k);const c=d.clips.find(c=>c.id===r.id);
 assert.equal(r.before,c.texts['coats-large-v2--'+r.phase]);assert.equal(r.dialogueSha256,c.dialogueSha256);
 for(const f of ['sourcePart','startFrame','endFrame','startSec','endSec'])assert.equal(r[f],c[f]);
 assert.equal(r.beforeDiagnostics.words.flagged,true);assert.equal(r.afterDiagnostics.words.flagged,false);assert(r.after.trim());
 assert.equal(g.baselineReceipts[r.phase].sha256,d.lanes.find(l=>l.lane==='coats-large-v2--'+r.phase).receiptSha256);
 assert.match(r.receipt.sha256,/^[0-9a-f]{64}$/);assert(!('leaf' in r.receipt));assert(!('leaf' in g.baselineReceipts[r.phase]));
}
assert.equal(keys.size,0);
for(const p of Object.keys(targets)){const s=g.summary[p+'/combined'];assert.equal(s.clips,targets[p].length);assert.equal(s.afterFlagged,0);assert.equal(s.afterRepeatWords,0);assert.equal(s.newEmpty,0)}
console.log('NOV22_COATS_GUARD_CONTRACT_PASS '+JSON.stringify({pairedReruns:26,ablations:9,unchangedAudio:true,originalPreserved:true}));
