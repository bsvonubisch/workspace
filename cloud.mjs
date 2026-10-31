import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export function nextRun(schedule,after=Date.now()){
 if(schedule.repeat==='once'){const n=Date.parse(schedule.at);if(!Number.isFinite(n)||n<=after)throw Error('Choose a future date and time.');return n}
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:schedule.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'});
 const localDay=n=>{const p=Object.fromEntries(formatter.formatToParts(n).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`};
 const lastDay=schedule.lastRun?localDay(schedule.lastRun):null;
 for(let n=Math.floor(after/60000)*60000+60000;n<after+9*86400000;n+=60000){const p=Object.fromEntries(formatter.formatToParts(n).map(p=>[p.type,p.value]));if(lastDay===`${p.year}-${p.month}-${p.day}`)continue;if(`${p.hour}:${p.minute}`===schedule.time&&(schedule.repeat==='daily'||p.weekday===schedule.weekday))return n}
 throw Error('Could not calculate the next occurrence.');
}
export function validateSchedule(body){if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>16000)throw Error('A name and prompt are required.');if(!['once','daily','weekly'].includes(body.repeat))throw Error('Invalid recurrence.');if(!/^\d\d:\d\d$/.test(body.time||'')||Number(body.time.slice(0,2))>23||Number(body.time.slice(3))>59)throw Error('Invalid time.');if(!['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(body.weekday))throw Error('Invalid weekday.');new Intl.DateTimeFormat('en',{timeZone:body.timezone});return {...body,name:body.name.trim(),prompt:body.prompt.trim()}}
export async function createCloudService(root,codex){
 const dir=path.join(root,'.control-room-data'),file=path.join(dir,'cloud.json');let db={projects:{},schedules:[],runs:[]},writing=Promise.resolve(),ticking=false;
 try{db=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('Cloud state could not be read; refusing to overwrite it.')}
 function persist(){const snapshot=JSON.stringify(db,null,2);writing=writing.catch(()=>{}).then(async()=>{await mkdir(dir,{recursive:true});await writeFile(file+'.tmp',snapshot);await rename(file+'.tmp',file)});return writing}
 for(const r of db.runs.filter(r=>r.status==='submitting')){r.status='unknown';r.error='Companion restarted during submission. Check Codex Cloud before retrying.';const s=db.schedules.find(s=>s.id===r.scheduleId);if(s)s.enabled=false}await persist();
 const validId=id=>typeof id==='string'&&/^[\w-]{1,120}$/.test(id);
 function config(id){if(!validId(id))throw Error('Invalid project.');const c=db.projects[id];if(!c?.environmentId)throw Error('Configure a published Codex Cloud environment for this project first.');return c}
 function command(args){return new Promise((resolve,reject)=>{const child=spawn(codex,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',done=false;const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(out.trim())};const timer=setTimeout(()=>{child.kill();finish(Error('Cloud submission timed out. Its outcome may be unknown; check Codex Cloud before retrying.'))},90000);child.stdout.on('data',d=>{out+=d;if(out.length>1500000){child.kill();finish(Error('Cloud output exceeded the limit.'))}});child.stderr.on('data',d=>err=(err+d).slice(-3000));child.on('error',()=>finish(Error('Could not start Codex.')));child.on('close',code=>finish(code===0?null:Error(err||out||'Codex Cloud command failed.')))})}
 async function submit(groupId,prompt,scheduleId=null){const c=config(groupId);if(typeof prompt!=='string'||!prompt.trim()||prompt.length>16000)throw Error('Enter a task prompt.');const run={id:randomUUID(),groupId,prompt,environmentId:c.environmentId,created:Date.now(),status:'submitting',scheduleId};db.runs.unshift(run);await persist();try{const args=['cloud','exec','--env',c.environmentId];if(c.branch)args.push('--branch',c.branch);args.push('--',prompt);run.output=await command(args);const match=run.output.match(/https:\/\/(?:chatgpt\.com|chat\.openai\.com)\/[^\s<>"']+/);run.url=match?.[0]||null;run.status='submitted';await persist();return run}catch(e){run.status='unknown';run.error=e.message;await persist();throw e}}
 async function tick(){if(ticking)return;ticking=true;try{for(const s of db.schedules.filter(s=>s.enabled&&s.nextRun<=Date.now())){s.lastRun=Date.now();s.enabled=s.repeat!=='once';if(s.enabled)s.nextRun=nextRun(s,Date.now());await persist();try{await submit(s.groupId,s.prompt,s.id);s.lastError=null}catch(e){s.enabled=false;s.lastError=e.message}await persist()}}finally{ticking=false}}
 const interval=setInterval(()=>tick().catch(e=>console.error('Schedule dispatcher:',e.message)),30000);interval.unref();
 async function handle(req,res,url,json,readBody){
  if(!url.pathname.startsWith('/api/cloud/'))return false;
  const groupId=url.searchParams.get('project');if(!validId(groupId)){json(res,400,{error:'Invalid project.'});return true}
  try{
   if(req.method==='GET'&&url.pathname==='/api/cloud/state'){json(res,200,{config:db.projects[groupId]||{},schedules:db.schedules.filter(s=>s.groupId===groupId),runs:db.runs.filter(r=>r.groupId===groupId).slice(0,40),dispatcher:'local'});return true}
   if(req.method==='GET'&&url.pathname==='/api/cloud/tasks'){const c=config(groupId);const output=await command(['cloud','list','--json','--limit','20','--env',c.environmentId]);json(res,200,JSON.parse(output));return true}
   if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true}
   const body=await readBody(req);
   if(url.pathname==='/api/cloud/config'){if(typeof body.environmentId!=='string'||! /^[\w:.-]{1,150}$/.test(body.environmentId)||typeof body.branch!=='string'||body.branch.length>200||body.branch.startsWith('-')||/[\s~^:?*\[\\]/.test(body.branch))throw Error('Enter a valid environment ID and optional branch.');db.projects[groupId]={environmentId:body.environmentId,branch:body.branch};await persist();json(res,200,{ok:true});return true}
   if(url.pathname==='/api/cloud/run'){json(res,200,await submit(groupId,body.prompt));return true}
   if(url.pathname==='/api/cloud/schedule'){config(groupId);const input=validateSchedule(body);const s={id:randomUUID(),groupId,name:input.name,prompt:input.prompt,repeat:input.repeat,time:input.time,weekday:input.weekday,timezone:input.timezone,at:input.at,enabled:true,created:Date.now()};s.nextRun=nextRun(s);db.schedules.push(s);await persist();json(res,200,s);return true}
   if(url.pathname==='/api/cloud/toggle'){const s=db.schedules.find(s=>s.groupId===groupId&&s.id===body.id);if(!s)throw Error('Schedule not found.');if(body.enabled===true){config(groupId);s.nextRun=nextRun(s);s.enabled=true;s.lastError=null}else{s.enabled=false}await persist();json(res,200,s);return true}
   if(url.pathname==='/api/cloud/delete'){const s=db.schedules.find(s=>s.groupId===groupId&&s.id===body.id);if(!s)throw Error('Schedule not found.');db.schedules=db.schedules.filter(s=>s.id!==body.id);await persist();json(res,200,{ok:true});return true}
   json(res,404,{error:'Unknown cloud action.'});
  }catch(e){json(res,400,{error:e.message})}return true;
 }
 return {handle,close:()=>clearInterval(interval),tick};
}
