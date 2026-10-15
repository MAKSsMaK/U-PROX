import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const env=z.object({PORT:z.coerce.number().default(3001),MOCK_UPROX:z.enum(['true','false']).default('true'),UPROX_BASE_URL:z.string().url().optional(),UPROX_USERNAME:z.string().optional(),UPROX_PASSWORD:z.string().optional(),CONTROL_RATE_LIMIT_PER_MINUTE:z.coerce.number().default(12)}).parse(process.env);
const app=Fastify({logger:{level:process.env.LOG_LEVEL||'info'}});
await app.register(rateLimit,{global:false});
type Session={sid:string;expiresAt:number};let session:Session|undefined;
const md5=(s:string)=>createHash('md5').update(s).digest('hex');
function passwordHash(password:string){return md5(md5(md5(password)+'F593B01C562548C6B7A31B30884BDE53'));}
async function uproxx(path:string,body:unknown){
  if(env.MOCK_UPROX==='true') return mockResponse(path);
  if(!env.UPROX_BASE_URL||!env.UPROX_USERNAME||!env.UPROX_PASSWORD) throw new Error('U-PROX credentials/base URL are not configured');
  if(!session||session.expiresAt<Date.now()){
    const r=await fetch(new URL('/json/Authenticate',env.UPROX_BASE_URL),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({UserName:env.UPROX_USERNAME,PasswordHash:passwordHash(env.UPROX_PASSWORD)})});
    if(!r.ok) throw new Error(`U-PROX Authenticate failed: HTTP ${r.status}`);
    const data=await r.json() as {UserSID?:string}; if(!data.UserSID) throw new Error('U-PROX Authenticate returned no UserSID'); session={sid:data.UserSID,expiresAt:Date.now()+20*60_000};
  }
  const r=await fetch(new URL(`/json/${path}`,env.UPROX_BASE_URL),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body as Record<string,unknown>,UserSID:session.sid})});
  if(!r.ok) throw new Error(`U-PROX ${path} failed: HTTP ${r.status}`); return r.json();
}
function mockResponse(path:string){
  const samples:Record<string,unknown>={
    VersionGet:{Version:'MOCK U-PROX 3.057.7988'},
    DoorGetList:{Door:[{Token:23902,Name:'Двері 3-01'}]},
    DeviceGetList:{Device:[{Token:23880,Name:'Контролер 3 поверх',Online:true}]},
    EventGetListV2:{Event:[]},
    DesktopLayoutGet:{Language:'uk',UserToken:0,EventColumns:[]}
  }; return samples[path]??{Event:[]};
}
app.get('/api/health',async()=>({ok:true,mode:env.MOCK_UPROX==='true'?'mock':'uproxx',uproxxBase:env.MOCK_UPROX==='true'?null:env.UPROX_BASE_URL}));
app.get('/api/events',async()=>uproxx('EventGetList',{Language:'ru',SubscriptionEnabled:false,Limit:100,StartToken:0,Employees:[],IssuedFrom:`\\/Date(${Date.now()-3600_000})\\/`,IssuedTo:`\\/Date(${Date.now()})\\/`}));
const probes={version:{path:'VersionGet',body:{}},doors:{path:'DoorGetList',body:{Language:'uk',Limit:100,StartToken:0}},devices:{path:'DeviceGetList',body:{Language:'uk',Limit:100,StartToken:0}},events:{path:'EventGetListV2',body:{Language:'uk',SubscriptionEnabled:false,Limit:10,StartToken:0}},desktopLayout:{path:'DesktopLayoutGet',body:{Language:'uk'}}} as const;
app.get('/api/integration/test/:probe',async(req,reply)=>{const probe=(req.params as {probe:string}).probe as keyof typeof probes;const test=probes[probe];if(!test)return reply.code(404).send({error:'Unknown probe'});const started=Date.now();const result=await uproxx(test.path,test.body);return {ok:true,probe,endpoint:`/json/${test.path}`,durationMs:Date.now()-started,result};});
app.get('/api/integration/test',async()=>{const entries=await Promise.all(Object.entries(probes).map(async([probe,test])=>{const started=Date.now();try{return {probe,endpoint:`/json/${test.path}`,ok:true,durationMs:Date.now()-started,result:await uproxx(test.path,test.body)}}catch(error){return {probe,endpoint:`/json/${test.path}`,ok:false,durationMs:Date.now()-started,error:error instanceof Error?error.message:'Unknown error'}}}));return {mode:env.MOCK_UPROX==='true'?'mock':'uproxx',tests:entries};});
const action=z.object({doorToken:z.union([z.string(),z.number()])});
app.post('/api/actions/:kind',{config:{rateLimit:{max:env.CONTROL_RATE_LIMIT_PER_MINUTE,timeWindow:'1 minute'}}},async(req,reply)=>{
  const parsed=action.safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:'Invalid doorToken'});
  const kind=(req.params as {kind:string}).kind;
  // Request shape for control endpoints must be confirmed against the installed U-PROX build before enabling.
  if(env.MOCK_UPROX==='true') return {ok:true,mock:true,action:kind,target:parsed.data.doorToken};
  return reply.code(501).send({error:'Control endpoints intentionally disabled until DoorAccess request contract is verified for this U-PROX version.'});
});
app.setErrorHandler((err,_req,reply)=>{app.log.error({err},'request failed');reply.code(502).send({error:'U-PROX integration request failed'});});
await app.listen({port:env.PORT,host:'0.0.0.0'});
