'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {stageEditorial,runtime}=require('./stage-editorial-previews.cjs');
function fixture(root,pr=42){
  const project=path.join(root,'editorial','pr-'+pr),sha='a'.repeat(40);
  for(const name of runtime){const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');}
  fs.writeFileSync(path.join(project,'index.html'),'<meta name="robots" content="noindex,nofollow">UNPUBLISHED EDITORIAL DRAFT '+sha.slice(0,12));
  fs.writeFileSync(path.join(project,'revision.json'),JSON.stringify({pr,head_sha:sha}));
  return project;
}
function temporary(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-test-'));try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('no editorial namespace leaves a normal release unchanged',()=>temporary(root=>assert.deepEqual(stageEditorial(root,path.join(root,'dest')),[])));
test('independent preview projects coexist without affecting any other path',()=>temporary(root=>{
  const dest=path.join(root,'dest');fs.mkdirSync(path.join(dest,'streaming-demo'),{recursive:true});fs.writeFileSync(path.join(dest,'streaming-demo','index.html'),'preserved');
  fixture(root,42);fixture(root,43);assert.deepEqual(stageEditorial(root,dest).sort(),['pr-42','pr-43']);
  assert.equal(fs.readFileSync(path.join(dest,'streaming-demo','index.html'),'utf8'),'preserved');
  assert(fs.existsSync(path.join(dest,'editorial','pr-42','revision.json')));
  assert(fs.existsSync(path.join(dest,'editorial','pr-43','revision.json')));
}));
test('reject extra files, forms, wrong identity and symlinks',()=>temporary(root=>{
  const p=fixture(root);const extra=path.join(p,'private.txt');fs.writeFileSync(extra,'fixture');
  assert.throws(()=>stageEditorial(root,null));fs.unlinkSync(extra);
  const index=path.join(p,'index.html'),html=fs.readFileSync(index,'utf8');fs.appendFileSync(index,'<form>');assert.throws(()=>stageEditorial(root,null));fs.writeFileSync(index,html);
  const revision=path.join(p,'revision.json');fs.writeFileSync(revision,JSON.stringify({pr:43,head_sha:'a'.repeat(40)}));assert.throws(()=>stageEditorial(root,null));fs.writeFileSync(revision,JSON.stringify({pr:42,head_sha:'a'.repeat(40)}));
  fs.symlinkSync(index,path.join(p,'alias'));assert.throws(()=>stageEditorial(root,null));
}));
