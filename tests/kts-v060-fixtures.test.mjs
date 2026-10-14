import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createKtsQuoteHandler,KTS_PAPERS,KTS_SPEC_KEYS,KTS_UPSTREAM_URL,validateKtsSpec} from '../server/kts-quote.mjs';

// Public 0.6.0 input/output fixtures are Node-test data only. The real proxy
// and browser client run against a mocked upstream response. These cases
// verify transport, echo and opaque totals, never the live pricing engine.
const schema=JSON.parse(fs.readFileSync(new URL('./fixtures/kts-v060-schema.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/kts-v060-fixtures.json',import.meta.url),'utf8'));
const clientSource=fs.readFileSync(new URL('../widget/kts-client.js',import.meta.url),'utf8');
const ORIGIN='https://test-mam.vercel.app';
const plain=value=>JSON.parse(JSON.stringify(value));

function bridge(expected){
  const upstreamCalls=[],appCalls=[],timers=new Map();let next=0;
  const handler=createKtsQuoteHandler({env:{APP_ORIGIN:ORIGIN},fetchImpl:async(url,init)=>{
    assert.equal(url,KTS_UPSTREAM_URL);upstreamCalls.push({url,...init});
    const response=new Response(JSON.stringify(expected),{status:200,headers:{'Content-Type':'application/json'}});
    Object.defineProperty(response,'url',{value:KTS_UPSTREAM_URL});return response;
  }});
  const root={location:{origin:ORIGIN,href:ORIGIN+'/demo'}};
  const fetchImpl=async(url,init)=>{
    assert.equal(url,ORIGIN+'/api/mam-quote');appCalls.push({url,...init});
    const response=await handler(new Request(url,{...init,headers:{...init.headers,Origin:ORIGIN,'Sec-Fetch-Site':'same-origin'}}));
    Object.defineProperty(response,'url',{value:url});return response;
  };
  const context=vm.createContext({window:root,URL,AbortController,TextDecoder,TextEncoder,Uint8Array,
    setTimeout(callback,duration){const id=++next;timers.set(id,{callback,duration});return id;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext(clientSource,context,{filename:'kts-client.js'});
  const client=root.ThanhAnKtsQuote.create({endpoint:'/api/mam-quote',fetchImpl});
  return {client,papers:root.ThanhAnKtsQuote.papers,upstreamCalls,appCalls,timers};
}

test('public v0.6.0 fixture transport corpus has exactly 26 input/output cases and the pinned endpoint',()=>{
  assert.equal(schema.version,'0.6.0');assert.equal(fixtures.version,'0.6.0');assert.equal(fixtures.contains,'public input/output only');assert.equal(fixtures.cases.length,26);
  assert.equal(schema.endpoint,KTS_UPSTREAM_URL);assert.deepEqual(schema.requestFields,KTS_SPEC_KEYS);
  for(const item of fixtures.cases){assert.deepEqual(Object.keys(item.input).sort(),[...KTS_SPEC_KEYS].sort());assert.deepEqual(Object.keys(item.expected).sort(),['currency','spec','total']);assert.match(item.expected.total,/^\d+$/);assert.equal(item.expected.currency,'VND');}
});

test('schema, real proxy and real client share all fifteen exact paper IDs and labels',()=>{
  const expected=schema.papers.map(paper=>({id:paper.id,label:paper.name})),f=bridge(fixtures.cases[0].expected);
  assert.equal(expected.length,15);assert.deepEqual(KTS_PAPERS,expected);assert.deepEqual(plain(f.papers),expected);
  assert.equal(KTS_PAPERS.find(p=>p.id==='p11').label,'K02 146gsm');assert.equal(KTS_PAPERS.find(p=>p.id==='p18').label,'Boheme Tradition Neve 320gsm');assert.equal(KTS_PAPERS.some(p=>p.id==='p19'||p.id==='p22'),false);
  assert.equal(KTS_PAPERS.find(p=>p.id==='p09').label,'B350');assert.equal(KTS_PAPERS.some(p=>p.id==='p21'||/kraft/i.test(p.label)),false);
  assert.equal(f.appCalls.length,0);assert.equal(f.upstreamCalls.length,0);f.client.destroy();assert.equal(f.timers.size,0);
});

test('p21 remains invalid rather than being substituted with a standard paper',async()=>{
  const f=bridge(fixtures.cases[0].expected),spec={...fixtures.cases[0].input,paper:'p21'};
  assert.equal(validateKtsSpec(spec),null);assert.equal(await f.client.check(),true);
  assert.deepEqual(plain(await f.client.quote(spec)),{version:1,kind:'fallback',reason:'invalid'});assert.equal(f.appCalls.length,1);assert.equal(f.upstreamCalls.length,0);f.client.destroy();assert.equal(f.timers.size,0);
});

for(const [index,item]of fixtures.cases.entries())test('v0.6.0 fixture transport '+String(index+1).padStart(3,'0')+' — '+item.input.paper+' / '+item.input.quantity+' products',{timeout:5000},async t=>{
  const f=bridge(item.expected);t.after(()=>{f.client.destroy();assert.equal(f.timers.size,0);});
  assert.equal(await f.client.check(),true);assert.equal(f.upstreamCalls.length,0,'metadata must not call the price engine');
  const result=plain(await f.client.quote(item.input));
  assert.deepEqual(result,{version:1,kind:'quote',...item.expected});assert.equal(result.total,item.expected.total);assert.deepEqual(result.spec,item.expected.spec);
  assert.equal(f.appCalls.length,2);assert.equal(f.appCalls[0].method,'GET');assert.equal(f.appCalls[0].body,undefined);assert.equal(f.appCalls[1].method,'POST');assert.deepEqual(JSON.parse(f.appCalls[1].body),item.input);
  assert.equal(f.upstreamCalls.length,1);const call=f.upstreamCalls[0];assert.equal(call.method,'POST');assert.equal(call.redirect,'error');assert.deepEqual(JSON.parse(call.body),item.input);
  assert.deepEqual(Object.keys(JSON.parse(call.body)).sort(),[...KTS_SPEC_KEYS].sort());
  assert.deepEqual([...new Headers(call.headers).keys()].sort(),['accept','content-type']);assert.equal(new Headers(call.headers).get('content-type'),'application/json');
  assert.equal(f.timers.size,0);assert.equal(f.client.getState().pending,false);
});
