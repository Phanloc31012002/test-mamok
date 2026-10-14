import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {KTS_PAPERS} from '../server/kts-quote.mjs';

// Browser transport fixtures use only synthetic opaque totals and local mocks.
const source=fs.readFileSync(new URL('../widget/kts-client.js',import.meta.url),'utf8');
const ENDPOINT='https://mam.example/api/mam-quote';
const SPEC={paper:'p08',quantity:7,length:8.3,width:4.7,sides:2,laminate:true,roundCorners:false,micaBox:false};
const quote=(spec=SPEC,changes={})=>({version:1,kind:'quote',total:'12345',currency:'VND',spec:{...spec,paperLabel:KTS_PAPERS.find(paper=>paper.id===spec.paper).label},...changes});
const fallback=reason=>({version:1,kind:'fallback',reason});
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
function response(value,{status=200,raw,url=ENDPOINT,redirected=false,headers={},body}={}){
  const result=new Response(body??raw??JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});Object.defineProperties(result,{url:{value:url},redirected:{value:redirected}});return result;
}
function fixture(handler){
  const calls=[],timers=new Map();let next=0;
  const root={location:{href:'https://mam.example/demo',origin:'https://mam.example'}};
  const fetchImpl=async(url,init)=>{calls.push({url,init});return handler?handler(url,init,calls.length):response(init.method==='GET'?{version:1,enabled:true}:quote(JSON.parse(init.body)));};
  root.fetch=fetchImpl;
  const context=vm.createContext({window:root,URL,AbortController,TextDecoder,TextEncoder,Uint8Array,setTimeout(callback,duration){const id=++next;timers.set(id,{callback,duration});return id;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext(source,context,{filename:'kts-client.js'});
  return {api:root.ThanhAnKtsQuote,calls,timers,create:options=>root.ThanhAnKtsQuote.create({endpoint:'/api/mam-quote',...options}),fire(){const entry=[...timers.entries()].find(([,timer])=>timer.duration===7000);assert.ok(entry);timers.delete(entry[0]);entry[1].callback();}};
}
async function ready(handler){const f=fixture(handler),client=f.create();assert.equal(await client.check(),true);return {...f,client};}

test('client public inventory is immutable and matches the server contract',()=>{
  const f=fixture(),client=f.create();assert.deepEqual(plain(f.api.papers),KTS_PAPERS);assert.ok(Object.isFrozen(f.api));assert.ok(Object.isFrozen(f.api.papers));for(const paper of f.api.papers)assert.ok(Object.isFrozen(paper));assert.ok(Object.isFrozen(client));assert.equal(f.calls.length,0);
  assert.deepEqual(plain(client.getState()),{enabled:false,checked:false,destroyed:false,pending:false});
});

test('client endpoint must be same-origin HTTP without credentials, query or fragment',()=>{
  const f=fixture();for(const endpoint of [undefined,'','https://other.example/api','http://mam.example/api','//other.example/api','javascript:alert(1)','data:text/plain,x','https://user:pass@mam.example/api','/api?chat=private','/api#private'])assert.throws(()=>f.create({endpoint}),/same-origin/);
  assert.doesNotThrow(()=>f.create({endpoint:ENDPOINT}));assert.equal(f.calls.length,0);
});

test('availability is exact, memoized metadata and never contains or sends quote/chat input',async()=>{
  const f=fixture(),client=f.create();assert.equal(await client.check(),true);assert.equal(await client.check(),true);assert.equal(f.calls.length,1);
  const {url,init}=f.calls[0];assert.equal(url,ENDPOINT);assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.deepEqual(plain(init.headers),{Accept:'application/json'});assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(f.timers.size,0);
  for(const metadata of [{version:1,enabled:false},{version:2,enabled:true},{version:1,enabled:'true'},{version:1,enabled:true,papers:[]},{version:1,enabled:true,raw:'private'},null,[]]){const g=fixture(()=>response(metadata));assert.equal(await g.create().check(),false);assert.equal(g.calls.length,1);}
});

test('quote is gated by availability and unsupported input does not send anything',async()=>{
  const f=fixture(),client=f.create();assert.deepEqual(plain(await client.quote(SPEC)),fallback('unavailable'));assert.deepEqual(plain(await client.quote('a raw question')),fallback('invalid'));assert.equal(f.calls.length,0);
});

test('POST contains exactly a copied public spec and output preserves an opaque large total',async()=>{
  const total='987654321012345678901234567890',f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:quote(JSON.parse(init.body),{total}))),original={...SPEC};
  const result=await f.client.quote(original,'fictional raw chat ignored');original.quantity=123;
  assert.deepEqual(plain(result),quote(SPEC,{total}));assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.spec));assert.equal(result.total,total);assert.equal(f.calls.length,2);
  const {url,init}=f.calls[1];assert.equal(url,ENDPOINT);assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),SPEC);assert.deepEqual(plain(init.headers),{Accept:'application/json','Content-Type':'application/json'});assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.referrerPolicy,'no-referrer');assert.ok(!init.body.includes('fictional'));assert.equal(f.timers.size,0);
});

test('all fifteen eligible paper IDs, MAX_SAFE_INTEGER and arbitrary finite dimensions are transport-valid',async()=>{
  const f=await ready();for(const paper of KTS_PAPERS){const spec={...SPEC,paper:paper.id,quantity:Number.MAX_SAFE_INTEGER,length:18.125,width:3.625,sides:1};assert.deepEqual(plain(await f.client.quote(spec)),quote(spec));}
  assert.equal(f.calls.length,16);
});

test('v0.6.0 public labels use p18 Neve and reject obsolete or substituted echoes',async()=>{
  const f=fixture(),labels=Object.fromEntries(f.api.papers.map(paper=>[paper.id,paper.label]));assert.equal(f.api.papers.length,15);assert.equal(labels.p11,'K02 146gsm');assert.equal(labels.p18,'Boheme Tradition Neve 320gsm');assert.equal(labels.p20,'Astropack 350gsm');assert.equal(labels.p09,'B350');
  for(const id of ['p19','p21','p22'])assert.equal(labels[id],undefined);assert.ok(!f.api.papers.some(paper=>/kraft|\bB300\b/i.test(paper.label)));
  for(const [paper,wrongLabels] of [['p11',['k02 246gsm','K02 246gsm']],['p18',['giấy Boheme tradition 320 gsm','Boheme tradition 320gsm','old mill avorio 350gsm']],['p20',['Old Mill Biancon 350gsm','old mill premium white 350gsm']]]){
    const spec={...SPEC,paper};for(const paperLabel of wrongLabels){const g=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:quote(spec,{spec:{...quote(spec).spec,paperLabel}})));assert.deepEqual(plain(await g.client.quote(spec)),fallback('unavailable'));assert.equal(g.calls.length,2);}
  }
});

test('eligible art papers use upstream consultation without resizing or replacing a specification',async()=>{
  for(const paper of ['p11','p18','p20']){
    const spec={...SPEC,paper,quantity:99,length:8.3,width:4.7,sides:1},f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:{code:'vpqq_consultation',message:'private'},{status:init.method==='GET'?200:422}));assert.deepEqual(plain(await f.client.quote(spec)),fallback('consultation'));assert.deepEqual(JSON.parse(f.calls[1].init.body),spec);assert.equal(f.calls.length,2);
  }
});

test('unapproved p19, legacy p22 alias, B300 and Kraft never leave the browser',async()=>{
  const f=await ready();
  for(const paper of ['p19','p22','B300','Kraft']){
    const spec={...SPEC,paper};assert.equal(f.api.validateSpec(spec),null);assert.deepEqual(plain(await f.client.quote(spec)),fallback('invalid'));
  }
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.method,'GET');assert.equal(f.client.getState().pending,false);assert.equal(f.timers.size,0);
});

test('missing, extra and incorrectly typed spec fields never leave the browser',async()=>{
  const f=await ready(),invalid=[null,[],{},'private question',...Object.keys(SPEC).map(key=>Object.fromEntries(Object.entries(SPEC).filter(([name])=>name!==key))),
    {paper:'C300'},{paper:'p21'},{paper:'p23'},{paper:'kraft'},{quantity:0},{quantity:-1},{quantity:1.5},{quantity:Number.MAX_SAFE_INTEGER+1},{quantity:'7'},
    {length:0},{length:Infinity},{length:'8.3'},{width:NaN},{width:-1},{sides:3},{sides:'2'},{laminate:1},{roundCorners:'false'},{micaBox:null},
    {chat:'private'},{product:'tag'},{technology:'offset'},{url:'https://attacker.invalid'},{unitPrice:1}];
  for(const changes of invalid){const spec=changes&&typeof changes==='object'&&!Array.isArray(changes)&&Object.keys(changes).length>0&&Object.keys(changes).length!==7?{...SPEC,...changes}:changes;assert.deepEqual(plain(await f.client.quote(spec)),fallback('invalid'));}
  assert.equal(f.calls.length,1);
});

test('mismatched echoed fields, paper labels and extra local details never become quotes',async()=>{
  const invalid=[...Object.keys(quote().spec).map(key=>quote(SPEC,{spec:{...quote().spec,[key]:typeof quote().spec[key]==='boolean'?!quote().spec[key]:typeof quote().spec[key]==='number'?quote().spec[key]+1:'wrong'}})),quote(SPEC,{raw:'private'}),quote(SPEC,{spec:{...quote().spec,internal:'private'}}),quote(SPEC,{version:2}),quote(SPEC,{kind:'information'}),quote(SPEC,{currency:'USD'})];
  for(const value of invalid){const f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:value));assert.deepEqual(plain(await f.client.quote(SPEC)),fallback('unavailable'));}
});

test('quote quantity rejects fractional rounding, noncanonical tokens and duplicate raw echoes',async()=>{
  const original=JSON.stringify(quote()),invalid=['7.0000000000000001','7.0','7e0','"7"'].map(raw=>original.replace('"quantity":7','"quantity":'+raw));
  invalid.push(original.replace('"quantity":7','"quantity":8,"quantity":7'),original.replace('"quantity":7','"quantity":7,"\\u0071uantity":7'),original.replace('"spec":{','"spec":{},"spec":{'));
  for(const raw of invalid){const f=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(null,{raw}));assert.deepEqual(plain(await f.client.quote(SPEC)),fallback('unavailable'));assert.equal(f.calls.length,2);}
  const spec={...SPEC,quantity:Number.MAX_SAFE_INTEGER},raw=JSON.stringify(quote(spec)).replace('"quantity":9007199254740991','"quantity":9007199254740991.1'),f=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(null,{raw}));assert.deepEqual(plain(await f.client.quote(spec)),fallback('unavailable'));
});

test('single escaped spec/quantity keys and decimal dimension tokens are accepted',async()=>{
  const raw=JSON.stringify(quote()).replace('"spec":{','"\\u0073pec":{').replace('"quantity":7','"\\u0071uantity":7').replace('"length":8.3','"length":8.3e0'),f=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(null,{raw}));assert.deepEqual(plain(await f.client.quote(SPEC)),quote());
});

test('total stays an integer string; numeric, signed, fractional and formatted values fail closed',async()=>{
  for(const total of [12345,'','12.5','-12','+12','1e3','12,345','1'.repeat(257),null]){const f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:quote(SPEC,{total})));assert.deepEqual(plain(await f.client.quote(SPEC)),fallback('unavailable'));}
});

test('HTTP fallback reasons are safe and raw error details never reach the caller or retry',async()=>{
  for(const [status,reason] of [[400,'invalid'],[422,'consultation'],[429,'busy'],[503,'unavailable'],[403,'unavailable'],[500,'unavailable']]){
    const f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:{message:'private',raw:'<script>private</script>'},{status:init.method==='GET'?200:status}));assert.deepEqual(plain(await f.client.quote(SPEC)),fallback(reason));assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
  }
  for(const value of [{version:1,kind:'fallback',reason:'private'},{...fallback('busy'),message:'private'}]){const f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:value));assert.deepEqual(plain(await f.client.quote(SPEC)),fallback('unavailable'));}
});

test('HTTP 200 typed fallback without spec preserves its exact reason through the wire guard',async()=>{
  for(const reason of ['consultation','invalid','busy','unavailable']){
    const f=await ready((_,init)=>response(init.method==='GET'?{version:1,enabled:true}:fallback(reason)));
    assert.deepEqual(plain(await f.client.quote(SPEC)),fallback(reason));assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
  }
});

test('response redirects, substitutions, MIME, JSON and byte bounds are rejected',async()=>{
  for(const options of [{url:'https://attacker.invalid/'},{redirected:true},{headers:{'Content-Type':'text/html'}},{headers:{'Content-Length':'16385'}},{headers:{'Content-Length':'wrong'}},{raw:'invalid JSON'},{raw:' '.repeat(16385),headers:{'Content-Length':'1'}},{body:new ReadableStream({start(controller){controller.enqueue(Uint8Array.from([0xff]));controller.close();}})}]){
    const f=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(quote(),options));assert.deepEqual(plain(await f.client.quote(SPEC)),fallback('unavailable'));assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
  }
});

test('UTF-8 stream fragments are accepted while a chunk flood is canceled',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify(quote()));let canceled=0;
  const stream=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,25));controller.enqueue(bytes.slice(25));controller.close();}}),f=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(null,{body:stream}));assert.deepEqual(plain(await f.client.quote(SPEC)),quote());
  const flood=new ReadableStream({start(controller){for(let n=0;n<257;n++)controller.enqueue(new Uint8Array(0));},cancel(){canceled++;}}),g=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(null,{body:flood}));assert.deepEqual(plain(await g.client.quote(SPEC)),fallback('unavailable'));assert.equal(canceled,1);
});

test('aborting a quote suppresses late completion and preserves metadata readiness',async()=>{
  let complete,signal;const f=await ready((_,init)=>{if(init.method==='GET')return response({version:1,enabled:true});signal=init.signal;return new Promise(resolve=>{complete=resolve;});}),pending=f.client.quote(SPEC);await settle();
  assert.deepEqual(plain(await f.client.quote({...SPEC,quantity:8})),fallback('busy'));assert.equal(f.calls.length,2);f.client.abort();assert.equal(await pending,null);assert.equal(signal.aborted,true);assert.equal(f.client.getState().enabled,true);assert.equal(f.client.getState().pending,false);complete(response(quote()));await settle();assert.equal(await f.client.check(),true);assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
});

test('close/reset abort cannot cancel an in-flight metadata check',async()=>{
  let complete,signal;const f=fixture((_,init)=>{signal=init.signal;return new Promise(resolve=>{complete=resolve;});}),client=f.create(),first=client.check(),second=client.check();assert.equal(f.calls.length,1);client.abort();assert.equal(signal.aborted,false);complete(response({version:1,enabled:true}));assert.equal(await first,true);assert.equal(await second,true);assert.equal(client.getState().enabled,true);assert.equal(f.timers.size,0);
});

test('deadline returns null for a quote even if fetch ignores abort and releases timers',async()=>{
  let complete,signal;const f=await ready((_,init)=>{if(init.method==='GET')return response({version:1,enabled:true});signal=init.signal;return new Promise(resolve=>{complete=resolve;});}),pending=f.client.quote(SPEC);await settle();f.fire();assert.equal(await pending,null);assert.equal(signal.aborted,true);assert.equal(f.client.getState().pending,false);assert.equal(f.client.getState().enabled,true);assert.equal(f.timers.size,0);complete(response(quote()));await settle();
});

test('deadline cancels a stalled response reader and settles independently of reads',async()=>{
  let canceled=0;const body=new ReadableStream({cancel(){canceled++;}}),f=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):response(null,{body})),pending=f.client.quote(SPEC);await settle();f.fire();assert.equal(await pending,null);assert.equal(canceled,1);assert.equal(f.timers.size,0);
});

test('destroy stops both quote and metadata operations and cannot be reopened',async()=>{
  let signal;const f=fixture((_,init)=>{signal=init.signal;return new Promise(()=>{});}),client=f.create(),checking=client.check();client.destroy();assert.equal(await checking,false);assert.equal(signal.aborted,true);assert.equal(await client.check(),false);assert.equal(await client.quote(SPEC),null);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);assert.equal(client.getState().destroyed,true);
  const g=await ready((_,init)=>init.method==='GET'?response({version:1,enabled:true}):new Promise(()=>{})),pending=g.client.quote(SPEC);g.client.destroy();assert.equal(await pending,null);assert.equal(g.client.getState().enabled,false);assert.equal(g.timers.size,0);
});
