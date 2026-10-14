import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createKtsQuoteHandler,validateKtsSpec,KTS_PAPERS,KTS_SPEC_KEYS,KTS_UPSTREAM_URL,KTS_LIMITS} from '../server/kts-quote.mjs';

// Synthetic opaque totals only; no workbook, price table or live network calls.
const ORIGIN='https://test-mam.vercel.app';
const SPEC={paper:'p08',quantity:7,length:8.3,width:4.7,sides:2,laminate:true,roundCorners:false,micaBox:false};
const opaque=(spec=SPEC,changes={})=>({total:'12345',currency:'VND',spec:{...spec,paperLabel:KTS_PAPERS.find(paper=>paper.id===spec.paper).label},...changes});
const fallback=(reason='unavailable')=>({version:1,kind:'fallback',reason});
function upstream(value=opaque(),{status=200,raw,url=KTS_UPSTREAM_URL,redirected=false,headers={},body}={}){
  const response=new Response(body??(raw??JSON.stringify(value)),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
  Object.defineProperties(response,{url:{value:url},redirected:{value:redirected}});return response;
}
function request({spec=SPEC,raw,method='POST',headers={},origin=ORIGIN,path='/api/mam-quote',signal,body}={}){
  return new Request(origin+path,{method,headers:{origin:ORIGIN,'sec-fetch-site':'same-origin','Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:body??raw??JSON.stringify(spec)}),...(body?{duplex:'half'}:{}),...(signal?{signal}:{})});
}
function fixture({fetchImpl,env={},timers}={}){
  const calls=[];
  const network=async(url,options)=>{calls.push({url,options});return fetchImpl?fetchImpl(url,options,calls.length):upstream(opaque(JSON.parse(options.body)));};
  return {calls,handler:createKtsQuoteHandler({fetchImpl:network,env,...(timers?{timers}:{})})};
}
async function result(handler,options={}){const response=await handler(request(options));return {response,body:await response.json()};}
const settle=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
function controlledTimers(){const scheduled=new Map();let next=0;return {scheduled,setTimeout(callback,duration){const id=++next;scheduled.set(id,{callback,duration});return id;},clearTimeout(id){scheduled.delete(id);},fire(){const entry=[...scheduled.entries()].find(([,timer])=>timer.duration===KTS_LIMITS.timeoutMs);assert.ok(entry);scheduled.delete(entry[0]);entry[1].callback();}};}

test('API imports without network or secrets and metadata makes no upstream request',async()=>{
  const api=await import('../api/mam-quote.js');assert.equal(typeof api.default.fetch,'function');assert.equal(api.maxDuration,10);
  const f=fixture(),{response,body}=await result(f.handler,{method:'GET'});
  assert.deepEqual(body,{version:1,enabled:true});assert.equal(f.calls.length,0);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('v0.6.0 quote inventory contains fifteen immutable eligible paper IDs with p18 Neve',()=>{
  assert.deepEqual(KTS_PAPERS.map(paper=>paper.id),[...Array.from({length:14},(_,n)=>'p'+String(n+5).padStart(2,'0')),'p20']);
  const labels=Object.fromEntries(KTS_PAPERS.map(paper=>[paper.id,paper.label]));
  assert.equal(labels.p11,'K02 146gsm');assert.equal(labels.p18,'Boheme Tradition Neve 320gsm');assert.equal(labels.p20,'Astropack 350gsm');assert.equal(labels.p09,'B350');
  for(const id of ['p19','p21','p22'])assert.equal(labels[id],undefined);assert.ok(!KTS_PAPERS.some(paper=>/kraft|\bB300\b/i.test(paper.label)));
  assert.ok(Object.isFrozen(KTS_PAPERS));for(const paper of KTS_PAPERS)assert.ok(Object.isFrozen(paper));
  const validated=validateKtsSpec(SPEC);assert.deepEqual(validated,SPEC);assert.ok(Object.isFrozen(validated));
});

test('POST requires an exact app Origin; GET follows the same-origin read guard',async()=>{
  for(const options of [{headers:{origin:'https://attacker.invalid'}},{headers:{origin:''}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'sec-fetch-site':'same-site'}},{origin:'https://test-mam.vercel.app.attacker.invalid'}]){
    const f=fixture(),answer=await result(f.handler,options);assert.equal(answer.response.status,403);assert.deepEqual(answer.body,fallback());assert.equal(f.calls.length,0);
  }
  const f=fixture();assert.deepEqual((await result(f.handler,{method:'GET',headers:{origin:''}})).body,{version:1,enabled:true});assert.equal(f.calls.length,0);
});

test('HTTPS origin configuration and preview opt-in fail closed',async()=>{
  for(const APP_ORIGIN of ['http://test-mam.vercel.app','https://*.vercel.app','https://user:pass@test-mam.vercel.app','https://test-mam.vercel.app/']){
    const f=fixture({env:{APP_ORIGIN}});assert.deepEqual((await result(f.handler,{method:'GET'})).body,fallback());assert.equal(f.calls.length,0);
  }
  assert.deepEqual((await result(fixture({env:{VERCEL_ENV:'preview'}}).handler,{method:'GET'})).body,fallback());
  const origin='https://explicit-kts-preview.vercel.app',f=fixture({env:{VERCEL_ENV:'preview',APP_ORIGIN:origin,APP_ALLOW_PREVIEW:'true'}});
  assert.deepEqual((await result(f.handler,{method:'GET',origin,headers:{origin}})).body,{version:1,enabled:true});
});

test('only GET and POST on the exact local path without query are allowed',async()=>{
  for(const method of ['PUT','DELETE','OPTIONS']){const f=fixture(),answer=await result(f.handler,{method});assert.equal(answer.response.status,405);assert.deepEqual(answer.body,fallback('invalid'));assert.equal(f.calls.length,0);assert.equal(answer.response.headers.get('allow'),'GET, POST');}
  for(const path of ['/api/other','/api/mam-quote?url=https://attacker.invalid','/api/mam-quote#private']){const f=fixture(),answer=await result(f.handler,{path});assert.equal(answer.response.status,400);assert.deepEqual(answer.body,fallback('invalid'));assert.equal(f.calls.length,0);}
});

test('exact eight public fields reject coercion, missing fields and arbitrary context',async()=>{
  const invalid=[null,[],{},'a question',...KTS_SPEC_KEYS.map(key=>Object.fromEntries(Object.entries(SPEC).filter(([name])=>name!==key))),
    {paper:'p04'},{paper:'p21'},{paper:'p23'},{paper:'kraft'},{paper:'C300'},{paper:' p08 '},{quantity:0},{quantity:-1},{quantity:1.5},{quantity:Number.MAX_SAFE_INTEGER+1},{quantity:'7'},
    {length:0},{length:-1},{length:'8.3'},{length:null},{width:0},{width:'4.7'},{sides:0},{sides:3},{sides:'2'},{laminate:1},{roundCorners:'false'},{micaBox:null},
    {product:'tag'},{technology:'offset'},{url:'https://attacker.invalid'},{chat:'fictional private question'},{unitPrice:1}];
  for(const changes of invalid){const spec=changes&&typeof changes==='object'&&!Array.isArray(changes)&&Object.keys(changes).length>0&&Object.keys(changes).length!==7?{...SPEC,...changes}:changes;const f=fixture(),answer=await result(f.handler,{spec});assert.equal(answer.response.status,400,JSON.stringify(spec));assert.deepEqual(answer.body,fallback('invalid'));assert.equal(f.calls.length,0);}
  assert.equal(validateKtsSpec({...SPEC,length:Infinity}),null);assert.equal(validateKtsSpec({...SPEC,width:NaN}),null);
});

test('all fifteen eligible papers accept contract types without local profile or quantity caps',async()=>{
  for(const paper of KTS_PAPERS){const spec={...SPEC,paper:paper.id,quantity:Number.MAX_SAFE_INTEGER,length:18.125,width:3.625,sides:1},f=fixture(),answer=await result(f.handler,{spec});assert.equal(answer.body.kind,'quote');assert.deepEqual(answer.body.spec,{...spec,paperLabel:paper.label});assert.equal(f.calls.length,1);}
});

test('v0.6.0 paper echoes require exact current labels rather than obsolete or substituted descriptions',async()=>{
  for(const [paper,wrongLabels] of [['p11',['k02 246gsm','K02 246gsm']],['p18',['giấy Boheme tradition 320 gsm','Boheme tradition 320gsm','old mill avorio 350gsm']],['p20',['Old Mill Biancon 350gsm','old mill premium white 350gsm']]]){
    const spec={...SPEC,paper};
    for(const paperLabel of wrongLabels){const f=fixture({fetchImpl:async()=>upstream(opaque(spec,{spec:{...opaque(spec).spec,paperLabel}}))}),answer=await result(f.handler,{spec});assert.deepEqual(answer.body,fallback());assert.equal(answer.response.status,503);assert.equal(f.calls.length,1);}
  }
});

test('eligible art papers retain custom, single-sided and small-order specs when upstream requests consultation',async()=>{
  for(const paper of ['p11','p18','p20']){
    for(const changes of [{quantity:99,length:9,width:5.4,sides:2},{quantity:100,length:9,width:5.4,sides:1},{quantity:100,length:8.3,width:4.7,sides:2}]){
      const spec={...SPEC,paper,...changes},f=fixture({fetchImpl:async()=>upstream({code:'vpqq_consultation',message:'private upstream detail'},{status:422})}),answer=await result(f.handler,{spec});assert.deepEqual(answer.body,fallback('consultation'));assert.equal(answer.response.status,422);assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(f.calls[0].options.body),spec);
    }
  }
});

test('unapproved p19, legacy p22 alias, B300 and Kraft fail before any upstream request',async()=>{
  for(const paper of ['p19','p22','B300','Kraft']){
    const spec={...SPEC,paper},f=fixture(),answer=await result(f.handler,{spec});
    assert.equal(validateKtsSpec(spec),null);assert.equal(answer.response.status,400);assert.deepEqual(answer.body,fallback('invalid'));assert.equal(f.calls.length,0);
  }
});

test('wire quantity is an exact integer token and duplicate JSON keys are rejected',async()=>{
  const original=JSON.stringify(SPEC);
  for(const raw of [original.replace('"quantity":7','"quantity":9007199254740991.1'),original.replace('"quantity":7','"quantity":7.0'),original.replace('"quantity":7','"quantity":7e0'),original.replace('"quantity":7','"quantity":8,"quantity":7'),original.replace('"paper":"p08"','"paper":{"chat":"private"},"paper":"p08"')]){
    const f=fixture(),answer=await result(f.handler,{raw});assert.deepEqual(answer.body,fallback('invalid'));assert.equal(f.calls.length,0);
  }
  const raw=JSON.stringify(Object.fromEntries(Object.entries(SPEC).reverse())).replace('"quantity"','"\\u0071uantity"'),f=fixture();assert.equal((await result(f.handler,{raw})).body.kind,'quote');
});

test('request MIME, actual bytes and malformed UTF-8/JSON are bounded before upstream',async()=>{
  const invalid=[{raw:'not JSON'},{raw:' '.repeat(4097),headers:{'Content-Length':'1'}},{raw:JSON.stringify(SPEC),headers:{'Content-Length':'4097'}},{headers:{'Content-Type':'text/plain'}},{headers:{'Content-Type':'application/json; charset=latin1'}},{body:new ReadableStream({start(controller){controller.enqueue(Uint8Array.from([0xff]));controller.close();}})}];
  for(const options of invalid){const f=fixture(),answer=await result(f.handler,options);assert.equal(answer.body.kind,'fallback');assert.equal(answer.body.reason,'invalid');assert.equal(f.calls.length,0);}
});

test('outbound request is one pinned POST of a copied spec with no visitor headers',async()=>{
  const f=fixture(),answer=await result(f.handler,{headers:{cookie:'private-cookie',authorization:'private-auth','x-forwarded-for':'198.51.100.7','x-upstream-url':'https://attacker.invalid'}});
  assert.equal(answer.body.kind,'quote');assert.equal(f.calls.length,1);const {url,options}=f.calls[0];assert.equal(url,KTS_UPSTREAM_URL);assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),SPEC);
  assert.deepEqual(options.headers,{Accept:'application/json','Content-Type':'application/json'});assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.referrerPolicy,'no-referrer');assert.ok(!JSON.stringify(options).includes('private'));assert.ok(!JSON.stringify(options).includes('198.51.100.7'));
});

test('success allowlist strips unexpected upstream details and keeps opaque total unchanged',async()=>{
  const total='987654321012345678901234567890',f=fixture({fetchImpl:async()=>upstream({...opaque(SPEC,{total}),raw:'private-upstream-field',details:{internal:'private'},spec:{...opaque().spec,internal:'private'}})});
  const {response,body}=await result(f.handler);assert.deepEqual(body,{version:1,kind:'quote',total,currency:'VND',spec:opaque().spec});assert.equal(response.status,200);assert.ok(!JSON.stringify(body).includes('private'));assert.match(response.headers.get('cache-control'),/no-store/);
});

test('every echoed field must match the request and paperLabel must be reviewed',async()=>{
  for(const key of [...KTS_SPEC_KEYS,'paperLabel']){
    const changed={...opaque().spec,[key]:typeof opaque().spec[key]==='boolean'?!opaque().spec[key]:typeof opaque().spec[key]==='number'?opaque().spec[key]+1:'wrong'},f=fixture({fetchImpl:async()=>upstream(opaque(SPEC,{spec:changed}))});
    const answer=await result(f.handler);assert.equal(answer.response.status,503,key);assert.deepEqual(answer.body,fallback());
  }
});

test('response quantity rejects fractional rounding, noncanonical integer tokens and duplicate echoes',async()=>{
  const original=JSON.stringify(opaque());
  const invalid=['7.0000000000000001','7.0','7e0','"7"'].map(raw=>original.replace('"quantity":7','"quantity":'+raw));
  invalid.push(original.replace('"quantity":7','"quantity":8,"quantity":7'),original.replace('"quantity":7','"quantity":7,"\\u0071uantity":7'),original.replace('"spec":{','"spec":{},"spec":{'));
  for(const raw of invalid){const f=fixture({fetchImpl:async()=>upstream(null,{raw})}),answer=await result(f.handler);assert.equal(answer.response.status,503);assert.deepEqual(answer.body,fallback());assert.equal(f.calls.length,1);}
  const spec={...SPEC,quantity:Number.MAX_SAFE_INTEGER},raw=JSON.stringify(opaque(spec)).replace('"quantity":9007199254740991','"quantity":9007199254740991.1'),f=fixture({fetchImpl:async()=>upstream(null,{raw})});assert.deepEqual((await result(f.handler,{spec})).body,fallback());
});

test('escaped spec keys and decimal dimensions remain valid while unrelated quantity decoys are ignored',async()=>{
  const value={...opaque(),details:{quantity:7.0000000000000001,spec:{quantity:7},text:'"spec":{"quantity":7.0000000000000001}'},list:[{quantity:8}]};
  const raw=JSON.stringify(value).replace('"spec":{','"\\u0073pec":{').replace('"quantity":7,','"\\u0071uantity":7,').replace('"length":8.3','"length":8.3e0'),f=fixture({fetchImpl:async()=>upstream(null,{raw})});assert.deepEqual((await result(f.handler)).body,{version:1,kind:'quote',total:'12345',currency:'VND',spec:opaque().spec});
});

test('numeric, fractional, signed, formatted or oversized totals and wrong currency are not quotes',async()=>{
  for(const value of [{total:12345},{total:''},{total:'12.5'},{total:'-12'},{total:'+12'},{total:'1e3'},{total:'12,345'},{total:'1'.repeat(257)},{currency:'USD'},{spec:null},null,[]]){
    const f=fixture({fetchImpl:async()=>upstream(value&&typeof value==='object'&&!Array.isArray(value)?opaque(SPEC,value):value)}),answer=await result(f.handler);assert.equal(answer.response.status,503);assert.deepEqual(answer.body,fallback());
  }
});

test('known upstream statuses become typed safe fallback with fixed busy wait and no retry',async()=>{
  for(const [status,reason] of [[400,'invalid'],[422,'consultation'],[429,'busy'],[503,'unavailable']]){
    const f=fixture({fetchImpl:async()=>upstream({code:'private',message:'<script>private</script>',data:{internal:'private'}},{status,headers:{'Retry-After':'9999'}})}),answer=await result(f.handler);
    assert.equal(answer.response.status,status);assert.deepEqual(answer.body,fallback(reason));assert.equal(answer.response.headers.get('retry-after'),status===429?'60':null);assert.equal(f.calls.length,1);
  }
});

test('redirects, URL substitution, unexpected status and invalid response bounds fail closed',async()=>{
  const faults=[{redirected:true},{url:'https://attacker.invalid/'},{status:302},{status:201},{status:500},{headers:{'Content-Type':'text/html'}},{headers:{'Content-Length':'16385'}},{headers:{'Content-Length':'wrong'}},{raw:'invalid JSON'},{raw:' '.repeat(16385),headers:{'Content-Length':'1'}},{body:new ReadableStream({start(controller){controller.enqueue(Uint8Array.from([0xff]));controller.close();}})}];
  for(const options of faults){const f=fixture({fetchImpl:async()=>upstream(opaque(),options)}),answer=await result(f.handler);assert.deepEqual(answer.body,fallback());assert.equal(f.calls.length,1);}
  const f=fixture({fetchImpl:async()=>{throw Error('private upstream failure');}});assert.deepEqual((await result(f.handler)).body,fallback());
});

test('request and response chunk floods are canceled without leaking bytes',async()=>{
  let canceled=0;
  const flood=()=>new ReadableStream({start(controller){for(let n=0;n<257;n++)controller.enqueue(new Uint8Array(0));},cancel(){canceled++;}});
  const incoming=fixture();assert.deepEqual((await result(incoming.handler,{body:flood()})).body,fallback('invalid'));assert.equal(incoming.calls.length,0);
  const outgoing=fixture({fetchImpl:async()=>upstream(opaque(),{body:flood()})});assert.deepEqual((await result(outgoing.handler)).body,fallback());assert.equal(canceled,2);
});

test('deadline settles even when upstream ignores abort and releases its timer',async()=>{
  const timers=controlledTimers();let resolveNetwork,signal;
  const f=fixture({timers,fetchImpl:async(_,options)=>{signal=options.signal;return await new Promise(resolve=>{resolveNetwork=resolve;});}}),pending=result(f.handler);await settle();assert.equal(f.calls.length,1);
  timers.fire();assert.deepEqual((await pending).body,fallback());assert.equal(signal.aborted,true);assert.equal(timers.scheduled.size,0);resolveNetwork(upstream());await settle();assert.equal(f.calls.length,1);
});

test('deadline also covers a stalled request body before any upstream request',async()=>{
  let canceled=0;const body=new ReadableStream({cancel(){canceled++;}}),timers=controlledTimers(),f=fixture({timers}),pending=result(f.handler,{body});await settle();timers.fire();assert.deepEqual((await pending).body,fallback());assert.equal(f.calls.length,0);assert.equal(canceled,1);assert.equal(timers.scheduled.size,0);
});

test('aborted incoming request cannot return a late quote',async()=>{
  const controller=new AbortController(),timers=controlledTimers();let complete,signal;
  const f=fixture({timers,fetchImpl:async(_,options)=>{signal=options.signal;return await new Promise(resolve=>{complete=resolve;});}}),pending=result(f.handler,{signal:controller.signal});await settle();controller.abort();assert.deepEqual((await pending).body,fallback());assert.equal(signal.aborted,true);complete(upstream());await settle();assert.equal(timers.scheduled.size,0);
});
