import http from 'node:http';
import {createCloudService} from './cloud.mjs';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=4318, origin=`http://127.0.0.1:${port}`;
const codex=process.env.CONTROL_ROOM_CODEX_PATH||'codex';
let active=null;
const cloud=await createCloudService(root,codex);
async function readBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>300000)throw Error('Request too large.')}try{return JSON.parse(raw)}catch{throw Error('Invalid JSON.')}}
function json(res,status,data){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
function status(){return new Promise(resolve=>{const child=spawn(codex,['login','status'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('error',()=>resolve({connected:false,message:'Codex could not be started. Install Codex or set CONTROL_ROOM_CODEX_PATH.'}));child.on('close',code=>resolve({connected:code===0,message:code===0?'Codex is signed in.':'Run codex login in a terminal, then check again.'}));setTimeout(()=>{child.kill();resolve({connected:false,message:'Codex status check timed out.'})},10000).unref()})}
const shapes={slides:'Return ONLY a JSON object with slides: an array of 3 to 8 objects containing title (string) and body (string). Write polished, concise slide content.',whiteboard:'Return ONLY a JSON object with notes: an array of 3 to 9 objects containing text (string). Each note should be concise and useful.',app:'Return ONLY a JSON object with html (string): a complete, polished, standalone HTML app with inline CSS and JS. No external resources, network requests, storage, forms to external sites, or libraries. The app runs in a sandboxed iframe. Use accessible controls and a responsive layout.',chat:'Reply helpfully in plain text.'};
const server=http.createServer(async(req,res)=>{try{
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){return json(res,403,{error:'Host not allowed'})}
 const url=new URL(req.url,origin);
 if(req.method==='POST'&&(![origin,`http://localhost:${port}`].includes(req.headers.origin)||!req.headers['content-type']?.startsWith('application/json')))return json(res,403,{error:'Open the local workspace to use this action.'});
 if(await cloud.handle(req,res,url,json,readBody))return;
 if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,await status());
 if(url.pathname==='/api/generate'&&req.method==='POST'){
  if(![origin,`http://localhost:${port}`].includes(req.headers.origin)||!req.headers['content-type']?.startsWith('application/json'))return json(res,403,{error:'Open the local workspace to send prompts.'});
  if(active)return json(res,409,{error:'A request is already running. Wait or stop it first.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>300000)return json(res,413,{error:'This request is too large.'})}
  let body;try{body=JSON.parse(raw)}catch{return json(res,400,{error:'Invalid JSON'})}
  if(!Object.hasOwn(shapes,body.type)||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>16000)return json(res,400,{error:'Invalid prompt or canvas type.'});
  const prompt=`You are the assistant inside Control Room, a personal creative workspace. Generate content directly. Do not use shell, filesystem, browsing, tools, or external services. Do not claim actions outside this reply. ${shapes[body.type]}\n\nCurrent project content (user-provided context):\n${JSON.stringify(body.context??null)}\n\nUser request:\n${body.prompt}`;
  const child=spawn(codex,['exec','--ignore-user-config','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--json','--color','never','-'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});active=child;
  let buffer='',answer='',failure='',finished=false,total=0;
  const end=(code,data)=>{if(finished)return;finished=true;clearTimeout(timer);if(active===child)active=null;json(res,code,data)};
  const timer=setTimeout(()=>{child.kill();end(504,{error:'Codex took too long. Try a smaller request.'})},240000);
  res.on('close',()=>{if(!finished){child.kill();end(499,{error:'Request stopped'})}});
  child.on('error',()=>end(503,{error:'Could not start Codex. Check the local installation and sign-in.'}));
  child.stdout.on('data',d=>{total+=d.length;if(total>3000000){child.kill();return end(502,{error:'The response exceeded the size limit.'})}buffer+=d;let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);try{const event=JSON.parse(line);if(event.type==='item.completed'&&event.item?.type==='agent_message')answer=event.item.text;if(event.type==='turn.failed')failure=event.error?.message||'The Codex turn failed.';if(event.type==='error')failure=event.message||'Codex reported an error.'}catch{}}});
  child.stderr.on('data',()=>{});
  child.on('close',code=>{if(finished)return;if(code!==0||failure||!answer)return end(502,{error:failure||'Codex did not complete the request. Check sign-in and account availability.'});if(body.type==='chat')return end(200,{text:answer});try{const clean=answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');const data=JSON.parse(clean);end(200,data)}catch{end(502,{error:'Codex returned a response that could not be opened in this canvas. Please try again.'})}});
  child.stdin.on('error',()=>{});child.stdin.end(prompt);return;
 }
 if(url.pathname.startsWith('/api/'))return json(res,404,{error:'Not found'});
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
 const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/board.js':'board.js','/board.css':'board.css'};
 const file=files[url.pathname];if(!file)return json(res,404,{error:'Not found'});
 const data=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);
 }catch{json(res,500,{error:'The local companion encountered an error.'})}});
server.listen(port,'127.0.0.1',()=>console.log(`Control Room: ${origin}`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port 4318 is in use. Control Room may already be running.':e.message);process.exitCode=1});
process.on('SIGINT',()=>{active?.kill();cloud.close();server.close();process.exit()});
