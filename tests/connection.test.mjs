import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function connectionLabel()'),source.indexOf('\nasync function generate('));
const badge={textContent:'',title:''},note={textContent:''},button={disabled:false,innerHTML:''};
let calls=0,fail=true,release=null;
const c=vm.createContext({AbortSignal,console,location:{hostname:'127.0.0.1'},toast(){},render(){throw Error('Status checks must not rerender or erase the composer')},$$:s=>s==='[data-check-connection]'?[badge]:s==='[data-connection-note]'?[note]:s==='[data-generate-button]'?[button]:[],fetch:async(url,options)=>{calls++;assert.equal(url,'/api/status');assert.equal(options.cache,'no-store');if(fail)throw Error('Temporary network failure');if(release)await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({connected:true,message:'Ready'})}}});
vm.runInContext("let connected=false,busy=false,connectionStatus='checking',connectionMessage='',connectionInFlight=null;"+code,c);
await vm.runInContext('checkConnection()',c);
assert.match(badge.textContent,/Reconnecting/);assert.match(note.textContent,/Temporary network failure/);
fail=false;await vm.runInContext('checkConnection()',c);
assert.equal(badge.textContent,'● Codex connected');assert.match(button.innerHTML,/Create with Codex/);assert.equal(note.textContent,'Ready');
const before=calls;release=true;const first=vm.runInContext('checkConnection()',c);const second=vm.runInContext('checkConnection()',c);assert.equal(calls,before+1);release();await Promise.all([first,second]);release=null;
vm.runInContext("location.hostname='control-room.example';",c);fail=true;await vm.runInContext('checkConnection()',c);assert.match(badge.textContent,/Use local workspace/);assert.doesNotMatch(badge.textContent,/offline/i);
console.log('PASS failed-status recovery, actionable error, coalesced checks, hosted wording, and status updates without page rerender.');

// The home page has no schedule buttons. Binding must use the list selector.
const bindStart=source.indexOf('function bindCloud(on)');
const bindEnd=source.indexOf("\n\n$('#project-picker')",bindStart);
vm.runInNewContext(source.slice(bindStart,bindEnd)+'\nbindCloud(()=>{});',{$:()=>null,$$:()=>[],loadCloud(){},scheduleDialog(){}});
console.log('PASS home-page startup when no schedule buttons exist.');
