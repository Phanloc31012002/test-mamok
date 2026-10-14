import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data,microtasks,prepared,noTyping,typing,noInformationUi} from './helpers/widget-fixture.mjs';

test('opening the actual widget shows three dots before the greeting and renders at320ms',async t=>{
  const f=await prepared(t,{open:false});f.widget.open();typing(f);assert.equal(f.bots().length,0);await f.clock.advance(319);assert.equal(f.bots().length,0);typing(f);await f.clock.advance(1);noTyping(f);assert.equal(f.bots().length,1);assert.match(f.bots()[0].textContent,/Mầm chào bạn/);
});
test('local policy runs immediately while the visible reply waits320ms',async t=>{
  const f=await prepared(t),before=f.bots().length;const result=f.widget.send('Danh thiếp in nhanh C300 5 hộp');assert.equal(f.answers,1);typing(f);assert.equal(f.bots().length,before);await f.clock.advance(319);assert.equal(f.bots().length,before);await f.clock.advance(1);await result;noTyping(f);assert.equal(f.bots().length,before+1);assert.equal(f.find('.ta-quote-total').textContent,'5 hộp: 400.000 ₫');assert.deepEqual(f.network,[]);
});
test('reduced motion keeps the same320ms response floor',async t=>{
  const f=await prepared(t,{reducedMotion:true}),before=f.bots().length;const result=f.widget.send('Giờ làm việc');await f.clock.advance(319);assert.equal(f.bots().length,before);await f.clock.advance(1);await result;assert.equal(f.bots().length,before+1);noTyping(f);
});
for(const [name,delay]of [['fast',40],['slow',900]])test('unknown '+name+' classification and presentation run in parallel with max latency',async t=>{
  const f=await prepared(t,{ai:{plan:()=>({delay,value:{intent:'product',categoryId:'catalogue'}})}}),before=f.bots().length,start=f.clock.now;const result=f.widget.send('xyz'+name);await microtasks();assert.equal(f.ai.calls.length,1);typing(f);await f.clock.advance(Math.max(320,delay)-1);assert.equal(f.bots().length,before);typing(f);await f.clock.advance(1);await result;assert.equal(f.clock.now-start,Math.max(320,delay));assert.equal(f.bots().length,before+1);assert.match(f.bots().at(-1).textContent,/catalogue/);assert.equal(f.bots().at(-1).querySelector('.ta-consult-cta').textContent,'Tư vấn qua Zalo');noTyping(f);
});
test('duplicate pending input shares the promise, policy turn and user bubble',async t=>{
  const f=await prepared(t),a=f.widget.send('Catalogue A4 300 cuốn'),b=f.widget.send('Catalogue A4 300 cuốn');assert.equal(a,b);assert.equal(f.answers,1);assert.equal(f.users().length,1);typing(f);await f.clock.advance(320);await a;assert.match(f.bots().at(-1).textContent,/bao nhiêu trang/);
});
test('a new local turn cancels only the stale presentation and preserves synchronously applied slots',async t=>{
  const f=await prepared(t),before=f.bots().length;const old=f.widget.send('Catalogue A4 300 cuốn');await f.clock.advance(100);const current=f.widget.send('16 trang');await old;assert.equal(f.answers,2);assert.equal(f.bots().length,before);typing(f);await f.clock.advance(219);assert.equal(f.bots().length,before);await f.clock.advance(101);await current;assert.equal(f.bots().length,before+1);assert.doesNotMatch(f.bots().at(-1).textContent,/bao nhiêu trang/);const quote=f.widget.send('Bìa C300 ruột C150');await f.clock.advance(320);await quote;assert.equal(f.all('.ta-quote-total').at(-1).textContent,'300 cuốn: 6.900.000 ₫');
});
test('an ignored late AI completion cannot replace a newer local reply',async t=>{
  const f=await prepared(t,{ai:{ignoreAbort:true,plan:()=>({delay:900,value:{intent:'product',categoryId:'catalogue'}})}}),before=f.bots().length;const old=f.widget.send('xyzlate');await microtasks();assert.equal(f.ai.calls.length,1);await f.clock.advance(100);const latest=f.widget.send('Giờ làm việc');await f.clock.advance(320);await latest;assert.equal(f.bots().length,before+1);const reply=f.bots().at(-1).textContent;await f.clock.advance(480);await old;assert.equal(f.bots().length,before+1);assert.equal(f.bots().at(-1).textContent,reply);noTyping(f);
});
test('source lookup uses product and field only and fast results wait for presentation',async t=>{
  const f=await prepared(t,{info:{plan:()=>({delay:40,value:{kind:'information',text:'Dạ, gửi PDF đúng quy cách ạ.',sources:[{provider:'thanh-an',url:'https://innhanhtphcm.com/san-pham/in-danh-thiep-chuan-gia-re'}]}})}});let p=f.widget.send('Danh thiếp in nhanh C300 5 hộp');await f.clock.advance(320);await p;const before=f.bots().length;p=f.widget.send('File như nào?');assert.deepEqual(f.info.calls,[['namecard-c300','fileRequirements']]);await f.clock.advance(319);assert.equal(f.bots().length,before);await f.clock.advance(1);await p;assert.match(f.bots().at(-1).textContent,/PDF/);assert.equal(f.bots().at(-1).classList.contains('ta-message-quote'),false);noTyping(f);p=f.widget.send('tổng tiền');await f.clock.advance(320);await p;assert.equal(f.all('.ta-quote-total').at(-1).textContent,'5 hộp: 400.000 ₫');
});
test('slow source lookup adds no second presentation wait',async t=>{
  const f=await prepared(t,{info:{plan:()=>({delay:900,value:{kind:'information',text:'Dạ, gửi PDF ạ.',sources:[]}})}});const p=f.widget.send('Danh thiếp in nhanh gửi file gì?'),before=f.bots().length;await f.clock.advance(899);assert.equal(f.bots().length,before);await f.clock.advance(1);await p;assert.match(f.bots().at(-1).textContent,/PDF/);noTyping(f);
});
for(const action of ['close','clear','destroy'])test(action+' resolves a pending local presentation and removes its dots/timer',async t=>{
  const f=await prepared(t),before=f.bots().length;let done=false;const p=f.widget.send('Giờ làm việc').then(()=>{done=true;});await f.clock.advance(100);if(action==='clear')f.find('.ta-clear').click();else f.widget[action]();await microtasks();assert.equal(done,true);await p;if(action==='destroy'){assert.equal(f.widget.host.isConnected,false);assert.equal(f.clock.pending.size,0);}else if(action==='clear'){typing(f);assert.equal(f.bots().length,0);await f.clock.advance(320);assert.equal(f.bots().length,1);}else{noTyping(f);await f.clock.advance(220);assert.equal(f.bots().length,before);}assert.deepEqual(f.network,[]);
});
test('close aborts async work and a late ignored result never renders after reopening',async t=>{
  const f=await prepared(t,{ai:{ignoreAbort:true,plan:()=>({delay:900,value:{intent:'product',categoryId:'catalogue'}})}}),before=f.bots().length;const p=f.widget.send('xyzclose');await microtasks();assert.equal(f.ai.calls.length,1);await f.clock.advance(100);const aborts=f.ai.aborted;f.widget.close();assert.ok(f.ai.aborted>aborts);noTyping(f);f.widget.open();await f.clock.advance(800);await p;assert.equal(f.bots().length,before);noTyping(f);
});
test('clear resets the actual local conversation and cancels a deferred source response',async t=>{
  const f=await prepared(t,{info:{plan:()=>({delay:900,value:{kind:'information',text:'Dạ, gửi PDF ạ.',sources:[]}})}});let p=f.widget.send('Danh thiếp in nhanh C300 5 hộp');await f.clock.advance(320);await p;p=f.widget.send('File như nào?');await f.clock.advance(100);f.find('.ta-clear').click();await microtasks();await p;assert.equal(f.resets,1);await f.clock.advance(320);assert.equal(f.bots().length,1);const next=f.widget.send('5 hộp');await f.clock.advance(320);await next;assert.equal(f.all('.ta-message-quote').length,0);assert.doesNotMatch(f.bots().at(-1).textContent,/400\.000/);
});
for(const action of ['close','destroy'])test(action+' settles source work immediately and prevents its late reply',async t=>{
  const f=await prepared(t,{info:{plan:()=>({delay:900,value:{kind:'information',text:'Dạ, gửi PDF ạ.',sources:[]}})}});let p=f.widget.send('Danh thiếp in nhanh C300 5 hộp');await f.clock.advance(320);await p;const before=f.bots().length;let done=false;p=f.widget.send('File như nào?').then(()=>{done=true;});assert.equal(f.info.calls.length,1);await f.clock.advance(100);const aborts=f.info.aborted;f.widget[action]();await microtasks();assert.equal(done,true);await p;assert.ok(f.info.aborted>aborts);noTyping(f);if(action==='destroy'){assert.equal(f.info.destroyed,true);assert.equal(f.clock.pending.size,0);}await f.clock.advance(900);assert.equal(f.bots().length,before);
});
test('direct source anchors use the confirmed display mapping without a source-details wrapper',async t=>{
  const f=await prepared(t),p=f.widget.send('Catalogue A4 C300 16 trang 300 cuốn');await f.clock.advance(320);await p;const anchors=f.all('.ta-source');assert.ok(anchors.length);assert.equal(anchors[0].textContent,'Xem chi tiết');assert.equal(anchors[0].href,'https://innhanhtphcm.com/san-pham/in-catalogue-gia-re-lay-lien-tai-tphcm');assert.equal(anchors[0].target,'_blank');assert.equal(anchors[0].rel,'noopener noreferrer');assert.equal(anchors[0].referrerPolicy,'no-referrer');assert.equal(f.all('.ta-source-details').length,0);assert.deepEqual(f.network,[]);
});
test('quote category choices include a consult button which opens only verified contact links',async t=>{
  const f=await prepared(t),p=f.widget.send('Xem giá');typing(f);await f.clock.advance(320);await p;const choices=f.find('.ta-quote-products');assert.equal(choices.querySelectorAll('button').length,2);const consult=f.find('.ta-consult-cta');assert.equal(consult.textContent,'Tư vấn qua Zalo');assert.equal(consult.parentElement.querySelector('p'),null);consult.click();assert.equal(f.find('.ta-aux-view').hidden,true);await f.clock.advance(320);assert.equal(f.find('.ta-aux-view').dataset.view,'contacts');assert.equal(f.find('.ta-aux-title').textContent,'Tư vấn qua Zalo');assert.equal(f.find('.ta-contact-intro'),null);assert.deepEqual(f.all('.ta-zalo').map(a=>a.href),data.contacts.map(c=>c.zalo));assert.deepEqual(f.all('.ta-tel').map(a=>a.href),data.contacts.map(c=>'tel:'+c.phone));assert.deepEqual(f.network,[]);
});
test('the quick consultation label is exact and preserves the three adviser destinations',async t=>{
  const f=await prepared(t),quick=f.find('.ta-quick').querySelectorAll('button').find(button=>button.getAttribute('aria-label')==='Tư vấn qua Zalo');assert.ok(quick);assert.equal(quick.textContent,'Tư vấn qua Zalo');quick.click();typing(f);await f.clock.advance(320);assert.equal(f.find('.ta-aux-view').dataset.view,'contacts');assert.equal(f.find('.ta-contact-intro'),null);assert.equal(f.all('.ta-contact').length,3);assert.deepEqual(f.all('.ta-zalo').map(a=>a.href),data.contacts.map(c=>c.zalo));assert.deepEqual(f.all('.ta-tel').map(a=>a.href),data.contacts.map(c=>'tel:'+c.phone));assert.deepEqual(f.network,[]);
});
test('ordinary clarification choices include consultation while the greeting keeps its compact choices',async t=>{
  const f=await prepared(t);assert.equal(f.bots()[0].querySelector('.ta-consult-cta'),null);const p=f.widget.send('Danh thiếp');await f.clock.advance(320);await p;const block=f.bots().at(-1);assert.match(block.textContent,/in offset hay in nhanh/);assert.equal(block.querySelector('.ta-consult-cta').textContent,'Tư vấn qua Zalo');assert.ok(block.querySelectorAll('.ta-chip').some(b=>b.textContent==='In offset'));assert.ok(block.querySelectorAll('.ta-chip').some(b=>b.textContent==='In nhanh'));
});
test('full price menu selection receives the same320ms dots before changing its content',async t=>{
  const f=await prepared(t),p=f.widget.send('Xem bảng giá');await f.clock.advance(320);await p;const b=f.find('.ta-price-category');b.click();typing(f);assert.equal(f.menuCalls.length,0);await f.clock.advance(319);assert.equal(f.menuCalls.length,0);await f.clock.advance(1);assert.equal(f.menuCalls.length,1);noTyping(f);assert.equal(f.find('.ta-aux-view').scrollTop,0);
});
test('back navigation destroys a pending menu without leaving typing or a working activity state',async t=>{
  const f=await prepared(t),p=f.widget.send('Xem bảng giá');await f.clock.advance(320);await p;f.find('.ta-price-category').click();typing(f);await f.clock.advance(100);f.find('.ta-view-back').click();assert.equal(f.find('.ta-aux-view').hidden,true);assert.equal(f.find('.ta-price-category'),null);await f.clock.advance(220);assert.equal(f.menuCalls.length,0);noTyping(f);assert.equal(f.widget.host.dataset.activity,'idle');
});
test('plain XSS input remains literal text and never creates injected elements',async t=>{
  const f=await prepared(t),text='<img src=x onerror=alert(1)><script>alert(2)</script>';const p=f.widget.send(text);assert.equal(f.users().at(-1).querySelector('.ta-message-bubble').textContent,text);await f.clock.advance(320);await p;assert.equal(f.all('img').length,0);assert.equal(f.all('script').length,0);assert.equal(f.all('.ta-message-quote').length,0);assert.deepEqual(f.network,[]);
});

test('enabled metadata automatically handles an unknown turn while FAQ remains local and history stays out of the POST',async t=>{
  const f=await prepared(t,{realAi:{}});
  assert.equal(f.aiRequests.length,1);assert.equal(f.aiRequests[0].method,'GET');
  let p=f.widget.send('kt a4 là bao nhiêu');await f.clock.advance(320);await p;
  assert.match(f.bots().at(-1).textContent,/21 × 29,7 cm/);assert.equal(f.posts().length,0);
  p=f.widget.send('zz_default_unknown');await microtasks();assert.equal(f.posts().length,1);await f.clock.advance(320);await p;
  assert.ok(f.bots().at(-1).querySelectorAll('button').some(button=>button.textContent==='Xem lựa chọn Catalogue'));
  const body=JSON.parse(f.posts()[0].body);
  assert.deepEqual(body,{version:1,message:'zz_default_unknown',consent:'google-free-v1',adult:true});
  assert.equal(f.posts()[0].credentials,'omit');assert.equal(f.posts()[0].referrerPolicy,'no-referrer');
  assert.doesNotMatch(f.posts()[0].body,/kt a4|21|history|priceFacts|contacts/);
});

test('disabled metadata keeps unknown messages local without information controls or notices',async t=>{
  const f=await prepared(t,{realAi:{enabled:false}}),p=f.widget.send('zz_disabled_unknown');await f.clock.advance(320);await p;
  assert.equal(f.aiRequests.length,1);assert.equal(f.posts().length,0);assert.equal(f.ai.getState().consent,false);
  noInformationUi(f);
  assert.ok(!f.bots().at(-1).querySelectorAll('button').some(button=>button.textContent==='Xem lựa chọn Catalogue'));
});

test('metadata readiness is required before automatic understanding can send a question',async t=>{
  const f=await prepared(t,{realAi:{pendingMetadata:true}});
  assert.equal(f.ai.getState().consent,false);assert.equal(f.posts().length,0);
  const p=f.widget.send('zz_metadata_ready_unknown');await microtasks();typing(f);assert.equal(f.posts().length,0);
  await f.clock.advance(320);assert.equal(f.bots().length,1);typing(f);
  f.resolveAi('GET');await microtasks();
  assert.equal(f.posts().length,1);await p;
  assert.ok(f.bots().at(-1).querySelectorAll('button').some(button=>button.textContent==='Xem lựa chọn Catalogue'));
});

for(const action of ['close','clear'])test(action+' settles an early unknown turn without aborting metadata or sending it later',async t=>{
  const f=await prepared(t,{realAi:{pendingMetadata:true}});let settled=false;
  const p=f.widget.send('zz_early_old_'+action).then(()=>{settled=true;});await microtasks();typing(f);assert.equal(f.posts().length,0);
  if(action==='clear')f.find('.ta-clear').click();else f.widget.close();
  await microtasks();assert.equal(settled,true);await p;assert.equal(f.aiRequests[0].signal.aborted,false);
  f.resolveAi('GET');await microtasks();assert.equal(f.posts().length,0);
  if(action==='close')f.widget.open();else await f.clock.advance(320);
  const current=f.widget.send('zz_early_current_'+action);await microtasks();assert.equal(f.posts().length,1);await f.clock.advance(320);await current;
  assert.equal(JSON.parse(f.posts()[0].body).message,'zz_early_current_'+action);
  assert.ok(f.bots().at(-1).querySelectorAll('button').some(button=>button.textContent==='Xem lựa chọn Catalogue'));
});

test('destroy settles an early unknown turn and aborts unresolved metadata without a later POST',async t=>{
  const f=await prepared(t,{realAi:{pendingMetadata:true}});let settled=false;
  const p=f.widget.send('zz_destroy_before_metadata').then(()=>{settled=true;});await microtasks();typing(f);
  f.widget.destroy();await microtasks();assert.equal(settled,true);await p;
  assert.equal(f.aiRequests[0].signal.aborted,true);assert.equal(f.clock.pending.size,0);assert.equal(f.widget.host.isConnected,false);
  f.resolveAi('GET');await microtasks();assert.equal(f.posts().length,0);assert.equal(f.clock.pending.size,0);noTyping(f);
});

test('automatic understanding filters synthetic private text instead of sending it',async t=>{
  const f=await prepared(t,{realAi:{}});
  for(const text of ['fictional@example.invalid','Số điện thoại thử nghiệm 0901234567','mật khẩu thử nghiệm chỉ dùng trong test','<img src=x onerror=alert(1)>']){
    const p=f.widget.send(text);await f.clock.advance(320);await p;assert.equal(f.posts().length,0);
  }
  assert.equal(f.all('img').length,0);assert.equal(f.all('script').length,0);
});

test('clear resets local chat while a new unknown turn still uses automatic understanding',async t=>{
  const f=await prepared(t,{realAi:{}});let p=f.widget.send('kt a4 là bao nhiêu');await f.clock.advance(320);await p;
  f.find('.ta-clear').click();await f.clock.advance(320);assert.equal(f.bots().length,1);assert.equal(f.users().length,0);
  p=f.widget.send('zz_after_clear_unknown');await microtasks();assert.equal(f.posts().length,1);await f.clock.advance(320);await p;
  assert.ok(f.bots().at(-1).querySelectorAll('button').some(button=>button.textContent==='Xem lựa chọn Catalogue'));
  assert.equal(JSON.parse(f.posts()[0].body).message,'zz_after_clear_unknown');
});

for(const action of ['close','clear','destroy'])test(action+' aborts automatic understanding and suppresses ignored-abort late results',async t=>{
  const f=await prepared(t,{realAi:{pending:true}}),before=f.bots().length;
  const p=f.widget.send('zz_cancel_'+action);await microtasks();assert.equal(f.posts().length,1);typing(f);
  if(action==='clear')f.find('.ta-clear').click();else f.widget[action]();
  await microtasks();await p;assert.equal(f.posts()[0].signal.aborted,true);
  if(action==='clear'){await f.clock.advance(320);assert.equal(f.bots().length,1);assert.equal(f.users().length,0);}
  if(action==='close'){f.widget.open();assert.equal(f.bots().length,before);}
  const chatAfterAction=f.find('.ta-log').textContent;
  f.resolveAi();await microtasks();await f.clock.advance(900);
  assert.equal(f.find('.ta-log').textContent,chatAfterAction);noTyping(f);
  assert.ok(!f.all('button').some(button=>button.textContent==='Xem lựa chọn Catalogue'));
  if(action==='destroy'){assert.equal(f.widget.host.isConnected,false);assert.equal(f.clock.pending.size,0);}
  else assert.equal(f.ai.getState().consent,true);
});

for(const options of [{},{realAi:{}},{realAi:{enabled:false}}])test('removed information UI has no replacement and remaining header/form keyboard actions work '+JSON.stringify(options),async t=>{
  const f=await prepared(t,{...options,drag:true});noInformationUi(f);assert.equal(f.all('input').some(input=>input.type==='checkbox'),false);
  const actions=f.find('.ta-header-actions').querySelectorAll('button');assert.equal(actions.length,3);
  assert.deepEqual(actions.map(button=>button.getAttribute('aria-label')).sort(),['Di chuyển hoặc đặt lại vị trí','Làm mới','Đóng trò chuyện'].sort());
  for(const button of actions){assert.equal(button.type,'button');assert.equal(Boolean(button.disabled),false);button.focus();assert.equal(f.widget.shadow.activeElement,button);}
  f.find('.ta-window-drag').focus();f.find('.ta-window-drag').click();assert.ok(f.dragCalls.includes('reset'));
  const input=f.find('.ta-input');input.focus();input.value='Giờ làm việc';f.find('.ta-form').dispatchEvent({type:'submit'});typing(f);await f.clock.advance(320);noTyping(f);assert.equal(f.users().at(-1).querySelector('.ta-message-bubble').textContent,'Giờ làm việc');noInformationUi(f);
  f.find('.ta-clear').focus();f.find('.ta-clear').click();await f.clock.advance(320);assert.equal(f.bots().length,1);assert.equal(f.users().length,0);assert.equal(f.widget.shadow.activeElement,input);noInformationUi(f);
  f.find('.ta-close').focus();f.find('.ta-close').click();assert.equal(f.find('.ta-panel').hidden,true);assert.equal(f.widget.shadow.activeElement,f.find('.ta-launcher'));
  f.widget.open();input.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(f.find('.ta-panel').hidden,true);assert.equal(f.widget.shadow.activeElement,f.find('.ta-launcher'));
  f.widget.open();assert.equal(f.widget.shadow.activeElement,input);noInformationUi(f);
});
