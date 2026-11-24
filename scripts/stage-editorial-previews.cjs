'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runtime=[
  'index.html','revision.json','assets/brand/human-laier-dark.svg',
  'assets/brand/human-laier-light.svg','assets/brand/human-laier-square.svg',
  'css/styles.css','css/tokens.css','js/main.js','js/metrics.js','js/network.js',
  'js/surveys.js','js/synthetic-data.js'
];
const allowed=new Set(runtime),dirs=new Set(['assets','assets/brand','css','js']);
function inventory(project){
  const found=new Set();
  function walk(dir,rel=''){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name),name=rel?rel+'/'+entry.name:entry.name;
      const stat=fs.lstatSync(file);
      assert(!stat.isSymbolicLink(),'Editorial symlink refused: '+name);
      if(stat.isDirectory()){
        assert(dirs.has(name),'Unexpected editorial directory: '+name);
        walk(file,name);
      }else{
        assert(stat.isFile()&&allowed.has(name),'Unexpected editorial file: '+name);
        found.add(name);
      }
    }
  }
  walk(project);
  assert.deepEqual([...found].sort(),[...allowed].sort(),'Editorial runtime inventory mismatch');
}
function stageEditorial(root,dest){
  const editorial=path.join(root,'editorial');
  if(!fs.existsSync(editorial))return [];
  const top=fs.lstatSync(editorial);
  assert(top.isDirectory()&&!top.isSymbolicLink(),'Invalid editorial namespace');
  const projects=[];
  for(const entry of fs.readdirSync(editorial,{withFileTypes:true})){
    assert(/^pr-[1-9][0-9]{0,8}$/.test(entry.name)&&entry.isDirectory()&&!entry.isSymbolicLink(),'Invalid editorial project');
    const project=path.join(editorial,entry.name);
    inventory(project);
    const revision=JSON.parse(fs.readFileSync(path.join(project,'revision.json'),'utf8'));
    assert.deepEqual(Object.keys(revision).sort(),['head_sha','pr']);
    assert.equal(revision.pr,Number(entry.name.slice(3)));
    assert(typeof revision.head_sha==='string'&&/^[a-f0-9]{40}$/.test(revision.head_sha),'Invalid editorial revision');
    const html=fs.readFileSync(path.join(project,'index.html'),'utf8');
    assert(html.includes('UNPUBLISHED EDITORIAL DRAFT')&&html.includes('noindex,nofollow')&&html.includes(revision.head_sha.slice(0,12)),'Missing editorial identity or noindex marker');
    assert(!/<form\b|\baccess_key\b|api\.web3forms\.com\/submit|formsubmit\.co\/|<link\b[^>]*\brel="canonical"/i.test(html),'Live form or canonical tag in preview');
    if(dest){
      const target=path.join(dest,'editorial',entry.name);
      assert(!fs.existsSync(target),'Refusing editorial overwrite');
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.cpSync(project,target,{recursive:true,force:false,errorOnExist:true,dereference:false});
    }
    projects.push(entry.name);
  }
  return projects;
}
module.exports={stageEditorial,runtime};
if(require.main===module){
  const result=stageEditorial(path.resolve(__dirname,'..'),null);
  console.log('Editorial namespace validated: '+result.length+' projects.');
}
