'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),engine=require('../streaming-lab/speaker-roles-persistent-nov22/replay.js'),raw=fs.readFileSync(path.join(root,'streaming-lab/speaker-roles-nov22/role-data.json'));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'f08740ecc8e0a5e2a4085e87f60ce0e4b78e30df7f7c7a4dfeed212ec372d1c9');
const d=JSON.parse(raw),started=performance.now(),z=engine.replay(d),elapsed=performance.now()-started;
assert.equal(z.newModelCalls,0);assert.equal(z.usesHumanLabels,false);assert.equal(z.usesPreviousRoleDecision,false);assert.equal(z.hardSuppression,false);
// Poison all known classifications, labels and sample annotations. Fresh role
// decisions and persistent mask must be byte-identical.
const poisoned=structuredClone(d);for(const r of poisoned.roles){r.listeningLabel='adversarial participant label';r.classification={role:'participant_candidate',audienceAddressEvidence:true};r.audienceAddressBlocks=999}for(const s of poisoned.samples)s.userListeningLabel='contrary';for(const c of poisoned.clips)c[4]=7;
const test=engine.replay(poisoned);assert.deepEqual(test,z);
// Slot permutation invariance including all activity bitsets. IDs cannot be
// used as shortcuts. Source is unchanged, including old comparison masks.
const permutation=[4,7,3,0,1,2,5,6],perm=structuredClone(d);
for(const r of perm.roles)r.slot=permutation[r.slot];for(const w of perm.windows)if(w.slot!==null)w.slot=permutation[w.slot];
for(const g of perm.gates)for(const a of g.activity){let bits=0;for(let s=0;s<8;s++)if(a[2]&(1<<s))bits|=1<<permutation[s];a[2]=bits}
const p=engine.replay(perm);for(const r of z.roles)assert.deepEqual(p.roles.find(x=>x.slot===permutation[r.slot]).classification,r.classification);for(let i=0;i<z.gates.length;i++)assert.deepEqual(p.gates[i].roleRetained,z.gates[i].roleRetained);
const a=(s,m,n=10)=>Array.from({length:n},(_,i)=>({startFrame:16000*i,endFrame:16000*i+15600,spokenScore:s,musicScore:m}));
assert.equal(engine.classify(a(.8,.9),-25,false).role,'participant_candidate');assert.equal(engine.classify(a(.8,.2),-10,false).role,'participant_candidate');assert.equal(engine.classify(a(.01,.9,3),-20,false).role,'uncertain_preserve');assert.equal(engine.classify(a(.01,.9),-1,true).role,'participant_candidate');assert.equal(engine.classify(a(.02,.9),-1,false).likelyIncidental,true);assert.equal(engine.classify(a(.02,.02),-25,false).likelyIncidental,false);
const overlap=(g,mask)=>{for(const [a,b,bits] of g.activity){if((bits&(bits-1))===0)continue;assert(mask.some(([x,y])=>x<=a&&y>=b),'overlapping vocal activity lost')}};
for(const g of z.gates){assert(g.roleRetainedSamples<=g.conservativeRetainedSamples);assert.equal(g.roleRetained.reduce((s,[a,b])=>s+b-a,0),g.roleRetainedSamples);overlap(g,g.roleRetained);for(const r of g.additionalRemoved)assert(!g.roleRetained.some(x=>r[0]<x[1]&&r[1]>x[0]));}
// Report, don't require a predetermined number or identity of incidental voices.
const g=z.gates.find(x=>x.threshold===.5&&x.paddingSeconds===.5),summary={elapsedMs:elapsed,roles:z.roles,threshold:g.threshold,paddingSeconds:g.paddingSeconds,allRetainedSamples:g.allRetainedSamples,conservativeRetainedSamples:g.conservativeRetainedSamples,persistentRetainedSamples:g.roleRetainedSamples,slotCoverage:g.slotCoverage,scenarios:z.gates.map(x=>({threshold:x.threshold,padding:x.paddingSeconds,old:x.conservativeRetainedSamples,new:x.roleRetainedSamples})),newModelCalls:0,blindToHumanLabels:true,slotPermutationInvariant:true};
console.log('HL_PERSISTENT_ROLE_REPLAY '+JSON.stringify(summary));
