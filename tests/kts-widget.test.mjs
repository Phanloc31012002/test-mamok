import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepared,microtasks,noTyping,typing,noInformationUi} from './helpers/widget-fixture.mjs';

// Real parser, HTTP client, policy and widget; only the same-origin endpoint,
// mascot, small DOM and clock are fixtures. These totals are arbitrary mocks.
const TOTAL='12345678901234567890';
const DISPLAY='12.345.678.901.234.567.890 ₫';
const CARD='Danh thiếp in nhanh C300 5 hộp 2 mặt có cán màng không bo góc có hộp mica';
const SPEC={paper:'p08',quantity:500,length:9,width:5.4,sides:2,laminate:true,roundCorners:false,micaBox:true};
const exactKeys=Object.keys(SPEC).sort();
const integration=(name,fn)=>test(name,{timeout:3000},fn);
const last=f=>f.bots().at(-1);
const reply=f=>last(f)?.querySelector('.ta-message-bubble')?.textContent||'';
const dto=f=>JSON.parse(f.ktsPosts().at(-1).body);
const fixture=(t,options={})=>prepared(t,{kts:{total:TOTAL,...options},realAi:{}});
async function finishReply(f,before,promise){await microtasks();typing(f);await f.clock.advance(319);assert.equal(f.bots().length,before);typing(f);await f.clock.advance(1);await promise;assert.equal(f.bots().length,before+1);noTyping(f);return last(f);}
async function send(f,text){const before=f.bots().length,p=f.widget.send(text);return finishReply(f,before,p);}
async function choose(f,label){const button=last(f).querySelectorAll('button').find(b=>b.textContent===label);assert.ok(button,'Missing current choice '+label);const before=f.bots().length;button.click();return finishReply(f,before);}
function noFabricatedQuote(f){assert.equal(last(f)?.querySelector('.ta-quote-total'),null);assert.equal(last(f)?.classList.contains('ta-message-quote'),false);assert.equal(f.posts().length,0);}

integration('card choices collect one missing field at a time and convert boxes only once',async t=>{
  const f=await fixture(t);
  await send(f,'Card in nhanh');assert.equal(f.ktsSession.getState().pendingField,'paper');assert.equal(f.ktsPosts().length,0);
  await choose(f,'C300');assert.equal(f.ktsSession.getState().pendingField,'quantity');
  await send(f,'5 hộp');assert.equal(f.ktsSession.getState().pendingField,'sides');assert.equal(f.ktsSession.getState().slots.quantity,500);
  await choose(f,'2 mặt');assert.equal(f.ktsSession.getState().pendingField,'laminate');
  await choose(f,'Có');assert.equal(f.ktsSession.getState().pendingField,'roundCorners');
  await choose(f,'Không');assert.equal(f.ktsSession.getState().pendingField,'micaBox');assert.equal(f.ktsPosts().length,0);
  await choose(f,'Có');assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),SPEC);assert.equal(last(f).querySelector('.ta-quote-total').textContent,'500 cái: '+DISPLAY);assert.equal(f.posts().length,0);noTyping(f);
});

integration('card offers exactly fifteen approved papers with one canonical Neve choice and no baseline-pending paper',async t=>{
  const f=await fixture(t);await send(f,'Card in nhanh');const labels=last(f).querySelector('.ta-kts-choices').querySelectorAll('button').map(b=>b.textContent);
  assert.equal(labels.length,15);assert.ok(labels.includes('K02 146gsm'));assert.ok(labels.includes('Astropack 350gsm'));assert.equal(labels.filter(label=>/Boheme|Neve/i.test(label)).length,1);assert.ok(labels.includes('Boheme Tradition Neve 320gsm'));assert.ok(labels.includes('B350'));assert.ok(!labels.some(label=>/Biancon|Kraft|B300|246/i.test(label)));assert.equal(f.ktsPosts().length,0);
});

for(const product of ['Tag chữ nhật KTS','In voucher'])integration(product+' offers only C300 and never silently substitutes a different requested paper',async t=>{
  const f=await fixture(t);await send(f,product);assert.deepEqual(last(f).querySelector('.ta-kts-choices').querySelectorAll('button').map(b=>b.textContent),['C300']);assert.equal(f.ktsPosts().length,0);
  await send(f,product+' C150 100 cái 10 × 5 cm 2 mặt có cán màng không bo góc không hộp mica');assert.equal(f.ktsPosts().length,0);noFabricatedQuote(f);
  assert.deepEqual(last(f).querySelector('.ta-kts-choices').querySelectorAll('button').map(b=>b.textContent),['C300']);await choose(f,'C300');assert.equal(f.ktsPosts().length,1);assert.equal(dto(f).paper,'p08');assert.equal(dto(f).length,10);assert.equal(dto(f).width,5);
});

for(const [alias,paper]of [['K02','p11'],['Boheme Neve','p18'],['Boheme tradition 320 gsm','p18'],['Boheme Tradition Neve 320gsm','p18'],['Neve','p18'],['old mill avorio 350gsm','p12'],['old mill premium white 350gsm','p14']])integration('card alias '+alias+' uses its approved canonical paper '+paper,async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp KTS giấy '+alias+' 100 cái 2 mặt không bo góc có hộp mica');assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),{...SPEC,paper,quantity:100,laminate:false});assert.equal(last(f).querySelector('.ta-quote-total').textContent,'100 cái: '+DISPLAY);
});

for(const obsolete of ['K02 246g','K02 246 g'])integration('obsolete density '+obsolete+' requires paper confirmation instead of mapping to K02 146gsm',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp KTS giấy '+obsolete+' 100 cái 2 mặt không bo góc có hộp mica');assert.equal(f.ktsPosts().length,0);assert.equal(f.ktsSession.getState().pendingField,'paper');assert.equal(f.ktsSession.getState().slots.paper,undefined);noFabricatedQuote(f);
});

for(const paper of ['Biancon','Old Mill Biancon 350gsm','p19'])integration('baseline-pending '+paper+' offers consultation and cannot use the calculator before an approved paper is selected',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp KTS giấy '+paper+' 100 cái 2 mặt không bo góc không hộp mica');
  assert.equal(f.ktsPosts().length,0);noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));
  await send(f,'Tổng tiền');assert.equal(f.ktsPosts().length,0);noFabricatedQuote(f);assert.equal(f.ktsSession.getState().slots.paper,undefined);assert.equal(f.ktsSession.getState().pendingField,'paper');
});

for(const paper of ['đổi sang Kraft','Kraft 350gsm','B300','Biancon'])integration('an active C300 order cannot reuse its old paper after the visitor asks for '+paper,async t=>{
  const f=await fixture(t);await send(f,CARD);assert.equal(f.ktsPosts().length,1);
  for(const text of [paper,'Tổng tiền']){await send(f,text);assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);assert.equal(f.ktsSession.getState().slots.paper,undefined);}
  await send(f,'Giấy p08');assert.equal(f.ktsPosts().length,2);assert.deepEqual(dto(f),SPEC);
});

integration('a voucher asks one short missing specification at a time including the dimension unit',async t=>{
  const f=await fixture(t);
  const turns=[['In voucher C300','quantity'],['20 cái','size'],['18 × 5,4','sizeUnit'],['cm','sides'],['2 mặt','laminate'],['Có cán màng','roundCorners']];
  for(const [text,pending]of turns){await send(f,text);assert.equal(f.ktsSession.getState().pendingField,pending);assert.equal(f.ktsPosts().length,0);assert.equal((reply(f).match(/\?/g)||[]).length,1);assert.equal(reply(f).includes('\n'),false);assert.ok(reply(f).length<=100,'Missing-field reply is too long: '+reply(f));}
  await choose(f,'Có');assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),{...SPEC,quantity:20,length:18,roundCorners:true,micaBox:false});assert.equal(reply(f).split('\n').length,2);
});

// Replay public 0.6.0 response anchors captured by the parent. Mock transport
// proves exact request/echo and display only; no engine arithmetic or live call.
for(const anchor of [
  {name:'C300 500 with laminate, corners and mica',query:CARD.replace('không bo góc','có bo góc'),spec:{...SPEC,roundCorners:true},total:'400000',display:'500 cái: 400.000 ₫'},
  {name:'voucher 20 with corners and area-locked mica',query:'In voucher C300 20 cái 18 × 5,4 cm 2 mặt có cán màng có bo góc không hộp mica',spec:{...SPEC,quantity:20,length:18,roundCorners:true,micaBox:false},total:'90000',display:'20 cái: 90.000 ₫'},
  {name:'voucher 50 with corners and area-locked mica',query:'In voucher C300 50 cái 18 × 5,4 cm 2 mặt có cán màng có bo góc không hộp mica',spec:{...SPEC,quantity:50,length:18,roundCorners:true,micaBox:false},total:'150000',display:'50 cái: 150.000 ₫'}
])integration('public API anchor '+anchor.name+' is shown unchanged without a second corner fee or percentage',async t=>{
  const f=await fixture(t,{total:anchor.total});await send(f,anchor.query);assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),anchor.spec);assert.deepEqual(Object.keys(dto(f)).sort(),exactKeys);
  assert.equal(last(f).querySelector('.ta-quote-total').textContent,anchor.display);assert.equal(reply(f).split('\n').length,2);assert.doesNotMatch(last(f).textContent,/%|phụ phí|5\.000|markup|coefficient|formula/);assert.equal(f.posts().length,0);
});

for(const paper of ['p11','p18','p20'])integration('custom approved paper '+paper+' preserves the requested spec on HTTP422 instead of falling back to a standard card',async t=>{
  const f=await fixture(t,{status:422});await send(f,'Danh thiếp KTS giấy '+paper+' 10 cái 12 × 8 cm 1 mặt không bo góc không hộp mica');assert.equal(f.ktsPosts().length,1);
  assert.deepEqual(dto(f),{...SPEC,paper,quantity:10,length:12,width:8,sides:1,laminate:false,micaBox:false});noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));assert.equal(f.ktsSession.getState().slots.length,12);assert.equal(f.ktsSession.getState().slots.width,8);
});

integration('custom-size wording on an initial new-paper card asks dimensions before any quote request',async t=>{
  const f=await fixture(t,{status:422});await send(f,'Danh thiếp KTS p20 100 cái khổ riêng 2 mặt không bo góc không hộp mica');assert.equal(f.ktsPosts().length,0);assert.equal(f.ktsSession.getState().pendingField,'size');assert.equal(f.ktsSession.getState().slots.length,undefined);assert.equal(f.ktsSession.getState().slots.width,undefined);noFabricatedQuote(f);
  await send(f,'12 × 8 cm');assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),{...SPEC,paper:'p20',quantity:100,length:12,width:8,laminate:false,micaBox:false});noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));
});

integration('changing an active card to custom size drops its old dimensions and preserves HTTP422 without a standard fallback',async t=>{
  const transport={total:TOTAL},f=await prepared(t,{kts:transport,realAi:{}});await send(f,'Danh thiếp KTS p20 100 cái 2 mặt không bo góc có hộp mica');assert.equal(f.ktsPosts().length,1);
  transport.status=422;await send(f,'đổi khổ riêng');assert.equal(f.ktsPosts().length,1);assert.equal(f.ktsSession.getState().pendingField,'size');assert.equal(f.ktsSession.getState().slots.length,undefined);assert.equal(f.ktsSession.getState().slots.width,undefined);noFabricatedQuote(f);
  await send(f,'12 × 8 cm');assert.equal(f.ktsPosts().length,2);assert.deepEqual(dto(f),{...SPEC,paper:'p20',quantity:100,length:12,width:8,laminate:false,micaBox:false});noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));
});

integration('a complete KTS request bypasses legacy prices and sends exactly eight public fields without chat',async t=>{
  const f=await fixture(t);await send(f,'Giờ làm việc');const legacyTurns=f.answers;await send(f,CARD);assert.equal(f.answers,legacyTurns);
  assert.equal(f.ktsRequests[0].method,'GET');assert.equal(f.ktsRequests.filter(c=>c.method==='GET').length,1);assert.equal(f.ktsPosts().length,1);
  const call=f.ktsPosts()[0];assert.deepEqual(Object.keys(dto(f)).sort(),exactKeys);assert.deepEqual(dto(f),SPEC);
  assert.equal(call.url,'https://mam.test/api/mam-quote');assert.equal(call.credentials,'omit');assert.equal(call.referrerPolicy,'no-referrer');assert.equal(call.redirect,'error');
  assert.doesNotMatch(call.body,/history|message|product|technology|Giờ làm việc|Danh thiếp|hộp|total|price|cost|formula|coefficient/);
  assert.equal(f.posts().length,0);assert.equal(last(f).querySelector('.ta-quote-total').textContent,'500 cái: '+DISPLAY);
  assert.doesNotMatch(last(f).textContent,/VAT|vận chuyển|giá vốn|lợi nhuận|Giá làm căn cứ/);assert.equal(last(f).querySelectorAll('.ta-source').length,1);
});

integration('an opaque total above MAX_SAFE_INTEGER is displayed losslessly without changing the mock value',async t=>{
  const f=await fixture(t);await send(f,CARD);assert.equal(last(f).querySelector('.ta-quote-total').textContent.split(': ')[1],DISPLAY);assert.equal(reply(f).split('\n').length,2);assert.equal(f.ktsPosts().length,1);
});

integration('local FAQ interruptions retain KTS slots and never call either quote or Gemini',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp in nhanh C300 5 hộp');const before=JSON.stringify(f.ktsSession.getState()),turns=f.ktsAnswers;
  await send(f,'Giờ làm việc');await send(f,'kt a4 là bao nhiêu');assert.match(reply(f),/21 × 29,7 cm/);assert.equal(JSON.stringify(f.ktsSession.getState()),before);assert.equal(f.ktsAnswers,turns);assert.equal(f.ktsPosts().length,0);assert.equal(f.posts().length,0);
  for(const text of ['2 mặt','Có cán màng','Không bo góc','Có hộp mica'])await send(f,text);
  assert.deepEqual(dto(f),SPEC);assert.equal(f.ktsPosts().length,1);
});

integration('legacy card waiting for printing method moves to KTS when the visitor chooses In nhanh',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp C300 5 hộp');assert.match(reply(f),/in offset hay in nhanh/);assert.equal(f.ktsSession.getState().product,null);
  await send(f,'In nhanh');assert.equal(f.ktsSession.getState().product,'card');assert.equal(f.ktsSession.getState().pendingField,'sides');assert.equal(f.ktsPosts().length,0);noFabricatedQuote(f);
  for(const text of ['2 mặt','Có cán màng','Không bo góc','Có hộp mica'])await send(f,text);
  assert.deepEqual(dto(f),SPEC);assert.equal(f.ktsPosts().length,1);
});

integration('explicit offset remains in its existing local policy and never uses the KTS endpoint',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp in offset 12 hộp');assert.equal(f.ktsPosts().length,0);assert.equal(f.ktsAnswers,0);assert.equal(f.ktsSession.getState().product,null);assert.equal(f.posts().length,0);assert.equal(last(f)?.querySelector('.ta-kts-choices'),null);
});

for(const quantity of ['5 hộp','100 cái'])integration('KTS to offset with '+quantity+' requires explicit package selection and asks its own box quantity',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp KTS C150 '+quantity+' 12 × 8 cm 1 mặt không cán màng có bo góc không hộp mica');assert.equal(f.ktsPosts().length,1);
  await send(f,'In offset');assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));assert.equal(f.ktsSession.getState().product,null);
  await choose(f,'Chọn gói offset');assert.match(reply(f),/bao nhiêu hộp/);assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);assert.equal(f.ktsSession.getState().product,null);
});

integration('tag dimensions in millimetres and piece quantity are not replaced with card defaults',async t=>{
  const f=await fixture(t);for(const text of ['Tag chữ nhật KTS C300 100 cái','50 × 90 mm','2 mặt','Có cán màng','Có bo góc','Không hộp mica'])await send(f,text);
  assert.deepEqual(dto(f),{...SPEC,quantity:100,length:5,width:9,roundCorners:true,micaBox:false});assert.match(reply(f),/Tag chữ nhật/);assert.match(reply(f),/5 × 9 cm/);assert.equal(f.ktsPosts().length,1);
});

integration('voucher arbitrary dimensions preserve area-based mica locking',async t=>{
  const f=await fixture(t);await send(f,'In voucher C300 100 cái 18 × 5,4 cm 2 mặt có cán màng không bo góc có hộp mica');
  assert.deepEqual(dto(f),{...SPEC,quantity:100,length:18,width:5.4,micaBox:false});assert.equal(f.ktsSession.getState().locks.micaBox,true);assert.match(reply(f),/18 × 5,4 cm/);
});

integration('mica eligibility uses total area rather than an individual side length',async t=>{
  const f=await fixture(t);await send(f,'Tag chữ nhật KTS C300 100 cái 16 × 3 cm 2 mặt có cán màng không bo góc có hộp mica');
  assert.deepEqual(dto(f),{...SPEC,quantity:100,length:16,width:3});assert.equal(f.ktsSession.getState().locks.micaBox,false);
});

integration('art paper forces laminate false before sending its complete quote specification',async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp KTS giấy p10 1 hộp 2 mặt có cán màng không bo góc không hộp mica');
  assert.deepEqual(dto(f),{...SPEC,paper:'p10',quantity:100,laminate:false,micaBox:false});assert.equal(f.ktsSession.getState().locks.laminate,true);assert.match(reply(f),/ARCOPRINT1 EXTRA WHITE 300GSM/);assert.match(reply(f),/không cán màng/);
});

integration('die-cut requests and synthetic private inputs lead to consultation without a quote POST',async t=>{
  const f=await fixture(t);await send(f,'Tag chữ nhật KTS C300 100 cái bế hình');noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));
  await send(f,'Card in nhanh C300 5 hộp');await send(f,'2 mặt fictional@example.invalid');noFabricatedQuote(f);assert.equal(f.ktsPosts().length,0);assert.equal(f.posts().length,0);
});

integration('unsupported die-cut intent remains sticky across quantity and total edits until straight cutting is confirmed',async t=>{
  const f=await fixture(t);await send(f,'Tag chữ nhật KTS C300 100 cái 5 × 9 cm 2 mặt có cán màng không bo góc không hộp mica');assert.equal(f.ktsPosts().length,1);
  for(const text of ['Bế hình','200 cái','Tổng tiền']){await send(f,text);assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));assert.equal(f.ktsSession.getState().blockedUnsupported,true);}
  await send(f,'Quy cách cắt thẳng');assert.equal(f.ktsSession.getState().blockedUnsupported,false);assert.equal(f.ktsPosts().length,2);assert.ok(last(f).querySelector('.ta-quote-total'));
});

for(const [status,reason]of [[400,'invalid'],[422,'consultation'],[429,'busy'],[503,'unavailable']])integration('HTTP '+status+' stays a KTS '+reason+' handoff without substituting a local price',async t=>{
  const f=await fixture(t,{status});await send(f,CARD);assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));await f.clock.advance(20000);assert.equal(f.ktsPosts().length,1);noTyping(f);
});

integration('busy retry is an explicit visitor action using the unchanged specification',async t=>{
  const transport={status:429,total:TOTAL},f=await prepared(t,{kts:transport,realAi:{}});await send(f,CARD);assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);
  transport.status=200;await choose(f,'Tính lại');assert.equal(f.ktsPosts().length,2);assert.equal(f.ktsPosts()[0].body,f.ktsPosts()[1].body);assert.equal(last(f).querySelector('.ta-quote-total').textContent,'500 cái: '+DISPLAY);
});

for(const [name,replyFactory]of [
  ['mismatched specification',spec=>({version:1,kind:'quote',total:TOTAL,currency:'VND',spec:{...spec,quantity:spec.quantity+1,paperLabel:'C300'}})],
  ['invented cost field',spec=>({version:1,kind:'quote',total:TOTAL,currency:'VND',spec:{...spec,paperLabel:'C300'},cost:1})],
  ['wrong currency',spec=>({version:1,kind:'quote',total:TOTAL,currency:'USD',spec:{...spec,paperLabel:'C300'}})]
])integration(name+' never becomes a widget quote or a legacy fallback price',async t=>{
  const f=await fixture(t,{reply:replyFactory});await send(f,CARD);assert.equal(f.ktsPosts().length,1);noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));
});

integration('disabled metadata and offline transport never fabricate a quote',async t=>{
  const f=await fixture(t,{metadata:{version:1,enabled:false}});await send(f,CARD);assert.equal(f.ktsPosts().length,0);noFabricatedQuote(f);assert.ok(last(f).querySelector('.ta-consult-cta'));
  const g=await fixture(t,{offline:true});await send(g,CARD);assert.equal(g.ktsPosts().length,1);noFabricatedQuote(g);assert.ok(last(g).querySelector('.ta-consult-cta'));
});

integration('a stalled quote times out and an ignored-abort completion cannot replace its handoff',async t=>{
  const f=await fixture(t,{pending:true}),p=f.widget.send(CARD);await microtasks();assert.equal(f.ktsPosts().length,1);typing(f);await f.clock.advance(7000);await p;
  assert.equal(f.ktsPosts()[0].signal.aborted,true);noFabricatedQuote(f);const before=f.find('.ta-log').textContent;f.resolveKts();await microtasks();await f.clock.advance(320);assert.equal(f.find('.ta-log').textContent,before);assert.equal(f.ktsPosts().length,1);noTyping(f);
});

for(const action of ['clear','close','destroy'])integration(action+' cancels a pending quote and suppresses its late total',async t=>{
  const f=await fixture(t,{pending:true});let done=false;const p=f.widget.send(CARD).then(()=>{done=true;});await microtasks();assert.equal(f.ktsPosts().length,1);typing(f);
  if(action==='clear')f.find('.ta-clear').click();else f.widget[action]();await microtasks();assert.equal(done,true);await p;assert.equal(f.ktsPosts()[0].signal.aborted,true);
  if(action==='clear'){await f.clock.advance(320);assert.equal(f.ktsSession.getState().product,null);assert.equal(f.users().length,0);assert.equal(f.bots().length,1);}
  if(action==='close')f.widget.open();const before=f.find('.ta-log').textContent;f.resolveKts();await microtasks();await f.clock.advance(320);assert.equal(f.find('.ta-log').textContent,before);assert.equal(f.all('.ta-quote-total').length,0);noTyping(f);
  if(action==='destroy'){assert.equal(f.ktsClient.getState().destroyed,true);assert.equal(f.widget.host.isConnected,false);assert.equal(f.clock.pending.size,0);}
});

integration('a new quantity cancels the old request and only the new spec can render',async t=>{
  const f=await fixture(t,{pending:true});const old=f.widget.send(CARD);await microtasks();await f.clock.advance(100);const current=f.widget.send('7 hộp');await microtasks();await old;
  assert.equal(f.ktsPosts().length,2);assert.equal(f.ktsPosts()[0].signal.aborted,true);assert.equal(JSON.parse(f.ktsPosts()[0].body).quantity,500);assert.equal(dto(f).quantity,700);
  f.resolveKts();await microtasks();assert.equal(f.all('.ta-quote-total').length,0);f.resolveKts();await microtasks();await f.clock.advance(320);await current;assert.equal(f.all('.ta-quote-total').length,1);assert.equal(last(f).querySelector('.ta-quote-total').textContent,'700 cái: '+DISPLAY);noTyping(f);
});

integration('duplicate pending input shares its request and user bubble',async t=>{
  const f=await fixture(t,{pending:true}),first=f.widget.send(CARD),second=f.widget.send(CARD);assert.equal(first,second);await microtasks();assert.equal(f.ktsPosts().length,1);assert.equal(f.users().length,1);f.resolveKts();await microtasks();await f.clock.advance(320);await first;assert.equal(f.all('.ta-quote-total').length,1);
});

for(const action of ['clear','close'])integration(action+' during metadata settles the old turn while preserving readiness for a new quote',async t=>{
  const f=await fixture(t,{pendingMetadata:true});let done=false;const old=f.widget.send(CARD).then(()=>{done=true;});await microtasks();assert.equal(f.ktsPosts().length,0);typing(f);
  if(action==='clear')f.find('.ta-clear').click();else f.widget.close();await microtasks();assert.equal(done,true);await old;assert.equal(f.ktsRequests[0].signal.aborted,false);
  f.resolveKts('GET');await microtasks();assert.equal(f.ktsPosts().length,0);if(action==='close')f.widget.open();else await f.clock.advance(320);
  await send(f,CARD);assert.equal(f.ktsRequests.filter(c=>c.method==='GET').length,1);assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),SPEC);assert.equal(last(f).querySelector('.ta-quote-total').textContent,'500 cái: '+DISPLAY);
});

integration('destroy during metadata settles the waiting turn and aborts GET without a late POST',async t=>{
  const f=await fixture(t,{pendingMetadata:true});let done=false;const p=f.widget.send(CARD).then(()=>{done=true;});await microtasks();f.widget.destroy();await microtasks();assert.equal(done,true);await p;
  assert.equal(f.ktsRequests[0].signal.aborted,true);f.resolveKts('GET');await microtasks();assert.equal(f.ktsPosts().length,0);assert.equal(f.clock.pending.size,0);assert.equal(f.widget.host.isConnected,false);
});

integration('removed information UI has no replacement while the calculator receives only quote fields and never persists chat',async t=>{
  const f=await fixture(t);noInformationUi(f);await send(f,'Giờ làm việc');await send(f,CARD);noInformationUi(f);
  assert.equal(f.ktsPosts().length,1);assert.deepEqual(Object.keys(dto(f)).sort(),exactKeys);assert.deepEqual(dto(f),SPEC);assert.doesNotMatch(f.ktsPosts()[0].body,/history|message|chat|Giờ làm việc|Danh thiếp|total|price|cost|formula|coefficient/);assert.equal(f.posts().length,0);assert.deepEqual(f.storage,[]);assert.deepEqual(f.network,[]);
});

integration('a rounded-corner order below one hundred pieces preserves the eight-field spec and displays the opaque total without a local surcharge',async t=>{
  const f=await fixture(t);await send(f,CARD.replace('5 hộp','10 cái').replace('không bo góc','có bo góc'));
  assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),{...SPEC,quantity:10,roundCorners:true});assert.deepEqual(Object.keys(dto(f)).sort(),exactKeys);assert.equal(last(f).querySelector('.ta-quote-total').textContent,'10 cái: '+DISPLAY);assert.doesNotMatch(last(f).textContent,/phụ phí|5\.000|VAT|giá vốn|lợi nhuận/);assert.equal(f.posts().length,0);
});

for(const paper of ['C150','C200','C250','C300','B350','ARCOPRINT1 EXTRA WHITE 300GSM','K02 146gsm','old mill avorio 350gsm','Magic coma white 300gsm','old mill premium white 350gsm','ARCOPRINT1 EXTRA WHITE 350GSM','s16 285gsm','giấy CONQUEROR IRIDESCENT GOLDEN HAZE 250GSM','Boheme Tradition Neve 320gsm','Astropack 350gsm'])integration('paper button echoes its friendly label and preserves matching API paper: '+paper,async t=>{
  const f=await fixture(t);await send(f,'Danh thiếp KTS 500 cái 2 mặt không cán màng không bo góc có hộp mica');await choose(f,paper);
  const selected=f.ktsSession.getState().slots.paper;assert.equal(f.ktsPosts().length,1);
  const expected=f.root.ThanhAnKtsQuote.papers.find(item=>item.label===paper);assert.equal(dto(f).paper,expected.id);assert.equal(selected,expected.id);
  assert.doesNotMatch(f.users().at(-1).textContent,/\bp\d{2}\b/i);assert.ok(f.users().at(-1).textContent.includes(paper));assert.ok(reply(f).includes(paper));
  await send(f,expected.id.toUpperCase());assert.equal(dto(f).paper,expected.id);assert.equal(dto(f).quantity,500);
  await send(f,'Giấy C300');if(f.ktsSession.getState().pendingField==='laminate')await send(f,'Không cán màng');
  assert.equal(dto(f).paper,'p08');assert.equal(dto(f).quantity,500);
  await send(f,'Giấy p08');assert.equal(dto(f).paper,'p08');assert.equal(dto(f).quantity,500);
});
integration('art-paper question, C300 button and recap retain a full voucher after connection failure',async t=>{
  const options={metadataStatus:403,total:TOTAL},f=await prepared(t,{kts:options,realAi:{}});
  await send(f,'In voucher 20 cái 18 x 5,4 cm 2 mặt có cán màng');await send(f,'có in giấy mĩ thuật k');
  assert.match(reply(f),/mỹ thuật/);assert.match(reply(f),/C300/);assert.equal(f.ktsSession.getState().slots.quantity,20);assert.equal(f.ktsPosts().length,0);
  await send(f,'Giấy C300');assert.equal(f.ktsSession.getState().pendingField,'roundCorners');assert.equal(f.ktsSession.getState().slots.quantity,20);
  await choose(f,'Có');assert.match(reply(f),/kết nối bộ tính/i);assert.equal(f.ktsPosts().length,0);
  const before=f.ktsSession.getState();await send(f,'quy cách cần tính của tooii là gì mà tính ko ra');
  for(const word of ['20 cái','18 × 5,4 cm','C300','2 mặt','cán màng','bo góc','lỗi kết nối'])assert.ok(reply(f).includes(word),word);
  assert.deepEqual(f.ktsSession.getState(),before);assert.equal(f.ktsPosts().length,0);
  options.metadataStatus=200;await choose(f,'Tính lại');assert.equal(f.ktsPosts().length,1);assert.deepEqual(dto(f),{...SPEC,quantity:20,length:18,roundCorners:true,micaBox:false});
});
integration('unknown or rejected paper edits do not send a quote or revive old paper on retry',async t=>{
  const f=await fixture(t);await send(f,CARD);
  for(const text of ['không dùng C300','không chọn C300','C300 định lượng 250gsm','old mill premium white 300gsm','đổi sang giấy Duplex 300gsm, 200 cái']){
    const count=f.ktsPosts().length;await send(f,text);assert.equal(f.ktsPosts().length,count);assert.equal(f.ktsSession.getState().pendingField,'paper',text);assert.equal(f.ktsSession.getState().slots.paper,undefined,text);
    await send(f,'Báo giá lại');assert.equal(f.ktsPosts().length,count);await choose(f,'C300');assert.equal(f.ktsPosts().length,count+1);assert.equal(dto(f).paper,'p08');
  }
});
integration('negative finishes are sent as false rather than the old affirmative spec',async t=>{
  const f=await fixture(t);await send(f,CARD);
  await send(f,'không cần hộp mica');assert.equal(dto(f).micaBox,false);
  await send(f,'không muốn cán màng');assert.equal(dto(f).laminate,false);
  await send(f,'không dùng bo góc');assert.equal(dto(f).roundCorners,false);
});
integration('changing paper quickly aborts an older quote and suppresses its stale total',async t=>{
  const f=await fixture(t,{pending:true}),first=f.widget.send(CARD);await microtasks();const next=f.widget.send('Giấy C200');await microtasks();await first;
  assert.equal(f.ktsPosts().length,2);assert.equal(f.ktsPosts()[0].signal.aborted,true);assert.equal(dto(f).paper,'p06');
  f.resolveKts();await microtasks();assert.equal(f.all('.ta-quote-total').length,0);f.resolveKts();await microtasks();await f.clock.advance(320);await next;
  assert.equal(f.all('.ta-quote-total').length,1);assert.match(reply(f),/C200/);assert.doesNotMatch(reply(f),/C300/);
});
