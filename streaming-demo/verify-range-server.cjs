'use strict';
// Test-only localhost server implementing HTTP byte ranges, as production
// video CDNs do. Python SimpleHTTPServer responds 200 to video seeks and can
// make a valid MP4 appear broken in headless Chrome.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png',
  '.mp4':'video/mp4','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{
  let file;
  try{
    const route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const local=path.resolve(root,'.'+route);
    file=route.endsWith('/')?path.join(local,'index.html'):local;
  }catch{res.writeHead(400);res.end();return;}
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404);res.end();return;}
    const total=st.size;
    let start=0,end=total-1,status=200;
    if(typeof req.headers.range==='string'){
      const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range.trim());
      if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':'bytes */'+total});res.end();return;}
      if(!m[1]){
        const tail=Number(m[2]);
        start=Math.max(0,total-tail);
      }else{
        start=Number(m[1]);
        if(m[2])end=Math.min(end,Number(m[2]));
      }
      if(!Number.isSafeInteger(start)||start<0||start> end||end>=total){
        res.writeHead(416,{'Content-Range':'bytes */'+total});res.end();return;
      }
      status=206;
    }
    const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream',
      'Accept-Ranges':'bytes','Content-Length':String(end-start+1),
      'Cache-Control':'no-store'};
    if(status===206)headers['Content-Range']='bytes '+start+'-'+end+'/'+total;
    res.writeHead(status,headers);
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file,{start,end});
    stream.on('error',()=>res.destroy());
    stream.pipe(res);
  });
}).listen(18764,'127.0.0.1');
