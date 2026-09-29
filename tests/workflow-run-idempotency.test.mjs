import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {loadTypeScript} from './helpers/load-typescript.mjs';
const input={workflowDefinitionId:'d1',displayName:'Example',idempotencyKey:'k',input:{answer:42}};
async function fixture({missingVersion=false,parseFailure=false,seedFailure=false,missingReload=false}={}){
 const calls=[];const runs=new Map();const tx={};const definition={initialStepKey:'start'};const error=new Error('injected failure');
 const m=await loadTypeScript('src/services/workflow-run-service.ts',{root:path.resolve('.'),stubs:{
  'next/server':{NextResponse:{}},'@/lib/auth/permissions':{hasPermission:()=>false},'@/lib/auth/session':{getUserFromSessionToken:async()=>null,SESSION_COOKIE_NAME:'unused'},
  '@/lib/db':{db:{$transaction:async fn=>{calls.push(['tx']);const value=await fn(tx);calls.push(['tx-done']);return value;}}},
  '@/lib/workflows/definition-schema':{workflowDefinitionSchema:{parse:value=>{assert.equal(value,definition);calls.push(['parse']);if(parseFailure)throw error;return value;}}},
  '@/repositories/workflow-definition-repository':{findActiveWorkflowVersionForDefinition:async id=>{assert.equal(id,'d1');calls.push(['version']);return missingVersion?null:{id:'v1',definition};}},
  '@/repositories/workflow-run-repository':{
   listWorkflowRuns:async()=>[],
   findWorkflowRunByIdempotencyKey:async key=>{calls.push(['lookup',key]);return runs.get(key)||null;},
   createWorkflowRun:async(client,data)=>{assert.equal(client,tx);calls.push(['create',data]);const row={id:'run-'+runs.size,...data};runs.set(data.idempotencyKey,row);return row;},
   findWorkflowRunById:async(id,user)=>{calls.push(['reload',id,user.id]);return missingReload?null:[...runs.values()].find(x=>x.id===id&&x.startedById===user.id);}
  },
  '@/services/workflow-engine-service':{seedRunExecution:async args=>{calls.push(['seed',args]);assert.equal(args.definition,definition);if(seedFailure)throw error;}}
 }});
 return {calls,runs,error,start:(id='u1',request=input)=>m.startWorkflowRun({id},request)};
}
test('same-user replay avoids creation and another user gets distinct key and exact version payload',async()=>{
 const f=await fixture();const first=await f.start();assert.deepEqual(f.calls.map(x=>x[0]),['lookup','version','parse','tx','create','tx-done','seed','reload']);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[4][1])),{workflowVersionId:'v1',startedById:'u1',displayName:'Example',idempotencyKey:'u1:k',input:{answer:42},context:{answer:42},status:'PENDING',currentStepKey:'start'});
 f.calls.length=0;assert.equal(await f.start('u1',{...input,displayName:'Changed'}),first);assert.deepEqual(f.calls,[['lookup','u1:k']]);
 f.calls.length=0;const other=await f.start('u2');assert.notEqual(other.id,first.id);assert.equal(other.idempotencyKey,'u2:k');assert.equal(f.runs.size,2);
});
test('missing active version raises actual ApiError 404 before parse or transaction',async()=>{
 const f=await fixture({missingVersion:true});await assert.rejects(()=>f.start(),e=>e.status===404);assert.deepEqual(f.calls.map(x=>x[0]),['lookup','version']);assert.equal(f.runs.size,0);
});
test('definition parse failure preserves identity before transaction creation',async()=>{
 const f=await fixture({parseFailure:true});await assert.rejects(()=>f.start(),e=>e===f.error);assert.deepEqual(f.calls.map(x=>x[0]),['lookup','version','parse']);assert.equal(f.runs.size,0);
});
test('seed failure follows completed create callback and replay does not seed again',async()=>{
 const f=await fixture({seedFailure:true});await assert.rejects(()=>f.start(),e=>e===f.error);assert.deepEqual(f.calls.map(x=>x[0]),['lookup','version','parse','tx','create','tx-done','seed']);assert.equal(f.runs.size,1);
 f.calls.length=0;assert.equal(await f.start(),f.runs.get('u1:k'));assert.deepEqual(f.calls,[['lookup','u1:k']]);
});
test('missing post-seed reload returns actual 500 without another create',async()=>{
 const f=await fixture({missingReload:true});await assert.rejects(()=>f.start(),e=>e.status===500);assert.equal(f.runs.size,1);assert.equal(f.calls.filter(x=>x[0]==='create').length,1);assert.equal(f.calls.at(-1)[0],'reload');
});
