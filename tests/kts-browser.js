(function(){'use strict';
const byId=id=>document.getElementById(id),run=byId('run'),summary=byId('summary'),list=byId('results');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const microtasks=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const TOTAL='12345678901234567890',DISPLAY='12.345.678.901.234.567.890 ₫';
const CARD='Danh thiếp in nhanh C300 5 hộp 2 mặt có cán màng không bo góc có hộp mica';
const SPEC={paper:'p08',quantity:500,length:9,width:5.4,sides:2,laminate:true,roundCorners:false,micaBox:true};
const keys=Object.keys(SPEC).sort().join(',');
let widget=null;
async function until(predicate,timeout=3000){const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw new Error('KTS harness condition timed out');await sleep(10);}}
const bots=shadow=>[...shadow.querySelectorAll('.ta-log .ta-message:not(.ta-message-user):not(.ta-message-typing)')];
const last=shadow=>bots(shadow).at(-1);
const bubble=shadow=>last(shadow)?.querySelector('.ta-message-bubble')?.textContent||'';
const total=shadow=>last(shadow)?.querySelector('.ta-quote-total')?.textContent||'';
const typingAbsent=shadow=>!shadow.querySelector('.ta-message-typing,.ta-typing-dots');
const dots=shadow=>shadow.querySelectorAll('.ta-message-typing').length===1&&shadow.querySelectorAll('.ta-typing-dot').length===3&&[...shadow.querySelectorAll('.ta-typing-dot')].every(dot=>{const rgb=(getComputedStyle(dot).backgroundColor.match(/\d+/g)||[]).slice(0,3).map(Number);return rgb.length===3&&Math.max(...rgb)-Math.min(...rgb)<=24&&rgb.every(channel=>channel>=80&&channel<=190);});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const noQuote=shadow=>!last(shadow)?.classList.contains('ta-message-quote')&&!last(shadow)?.querySelector('.ta-quote-total');
function fits(shadow){const panel=shadow.querySelector('.ta-panel'),input=shadow.querySelector('.ta-input'),rect=panel.getBoundingClientRect(),inputRect=input.getBoundingClientRect();return rect.left>=-1&&rect.top>=-1&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1&&panel.scrollWidth<=panel.clientWidth+1&&inputRect.top>=rect.top&&inputRect.bottom<=rect.bottom&&document.documentElement.scrollWidth<=innerWidth+1;}
function oneScroller(shadow){const panel=shadow.querySelector('.ta-panel'),log=shadow.querySelector('.ta-log'),aux=shadow.querySelector('.ta-aux-view');const found=[...panel.querySelectorAll('*')].filter(node=>{const style=getComputedStyle(node);return node.getClientRects().length&&node.clientHeight&&['auto','scroll'].includes(style.overflowY)&&(node===log||node===aux||node.scrollHeight>node.clientHeight+1);});return found.length===1&&found[0]===(aux.hidden?log:aux);}
function informationUiAbsent(shadow){const removed='.ta-privacy-open,.ta-privacy-document,.ta-ai-notice,.ta-ai-options,.ta-ai-label,.ta-ai-helper,.ta-ai-title,.ta-ai-consent';const panel=shadow.querySelector('.ta-panel'),status=shadow.querySelector('.ta-alert'),interfaceCopy=panel.cloneNode(true);interfaceCopy.querySelectorAll('.ta-message-user').forEach(node=>node.remove());return !shadow.querySelector(removed)&&shadow.querySelector('.ta-aux-view').dataset.view!=='privacy'&&status.hidden&&!status.textContent&&!/quyen rieng tu|google|gemini|nguoi xet duyet|18 tuoi|bat hieu sau|giup mam hieu/.test(ThanhAnFAQ.normalize(interfaceCopy.textContent))&&[...shadow.querySelectorAll('a,button')].every(node=>!/privacy|quyen rieng tu/.test(ThanhAnFAQ.normalize([node.textContent,node.getAttribute('aria-label'),node.getAttribute('title'),node.getAttribute('href')].filter(Boolean).join(' '))));}

async function tests(){
 run.disabled=true;list.replaceChildren();byId('results-json').textContent='';window.__ktsBrowserReport=null;summary.textContent='Đang chạy KTS mock…';
 const began=new Date().toISOString(),results=[],presentation=[];
 const check=(name,pass,detail='')=>{results.push({name,pass:Boolean(pass),detail});const row=document.createElement('li');row.className=pass?'pass':'fail';row.textContent=(pass?'PASS · ':'FAIL · ')+name+(detail?' — '+detail:'');list.appendChild(row);};
 const originalAlert=window.alert;let modalAlerts=0;window.alert=()=>{modalAlerts++;};
 try{
  const [data,styles]=await Promise.all([fetch('../widget/data.json',{credentials:'omit'}).then(r=>r.json()),fetch('../widget/widget.css',{credentials:'omit'}).then(r=>r.text())]);
  const stored={local:JSON.stringify({...localStorage}),session:JSON.stringify({...sessionStorage}),cookie:document.cookie};
  async function mount(options={}){
   if(widget)widget.destroy();const calls=[],pending=[],aiCalls=[];let client=null,session=null;
   const ktsFetch=async(url,init)=>{
    const endpoint=new URL(url,location.href);if(endpoint.origin!==location.origin||endpoint.pathname!=='/api/mam-quote')throw new Error('Unexpected KTS mock endpoint');
    const call={url:String(url),...init};calls.push(call);
    if(options.offline&&init.method==='POST')throw new Error('Mock offline');
    let value,status=200;
    if(init.method==='GET'){value={version:1,enabled:options.enabled!==false};status=options.metadataStatus||200;}
    else{
     const spec=JSON.parse(init.body);status=options.status||200;
     value=options.reply?options.reply(spec):{version:1,kind:'quote',total:options.total??TOTAL,currency:'VND',spec:{...spec,paperLabel:ThanhAnKtsQuote.papers.find(p=>p.id===spec.paper)?.label}};
    }
    const response=new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:String(url)});
    if(options.pendingMetadata&&init.method==='GET'||options.pending&&init.method==='POST')return new Promise(resolve=>pending.push({method:init.method,done:false,resolve(){this.done=true;resolve(response);}}));
    return response;
   };
   const aiFetch=async(_url,init)=>{aiCalls.push({...init});return {ok:true,text:async()=>JSON.stringify(init.method==='GET'?{version:1,enabled:true,privacyVersion:'google-free-v1'}:{version:1,kind:'fallback'})};};
   const originalClient=window.ThanhAnKtsQuote,originalParser=window.ThanhAnKts;
   window.ThanhAnKtsQuote={...originalClient,create(settings){return client=originalClient.create(settings);}};
   window.ThanhAnKts={...originalParser,createSession(settings){return session=originalParser.createSession(settings);}};
   try{widget=await ThanhAnChat.mount({data,styles,reducedMotion:true,ktsEndpoint:'/api/mam-quote',ktsFetch,aiEndpoint:'/api/mam-assist',aiFetch});}finally{window.ThanhAnKtsQuote=originalClient;window.ThanhAnKts=originalParser;}
   widget.open();const shadow=widget.shadow;
   await until(()=>bots(shadow).length===1&&typingAbsent(shadow));
   if(!options.pendingMetadata)await until(()=>client.getState().checked);await microtasks();
   return{shadow,calls,session,client,posts:()=>calls.filter(c=>c.method==='POST'),aiPosts:()=>aiCalls.filter(c=>c.method==='POST'),resolve(method='POST'){pending.find(p=>p.method===method&&!p.done)?.resolve();},dto:()=>JSON.parse(calls.filter(c=>c.method==='POST').at(-1).body)};
  }
  async function send(f,text){const start=performance.now(),p=widget.send(text),pending=dots(f.shadow);await p;presentation.push({pending,settled:typingAbsent(f.shadow),elapsed:performance.now()-start});return last(f.shadow);}
  async function choose(f,label){const button=[...last(f.shadow).querySelectorAll('button')].find(b=>b.textContent===label);if(!button)throw new Error('Missing choice '+label);button.scrollIntoView({block:'nearest'});button.focus();const focused=f.shadow.activeElement===button&&button.tabIndex===0&&!button.disabled,start=performance.now();button.click();const pending=dots(f.shadow);await until(()=>typingAbsent(f.shadow));presentation.push({pending,settled:typingAbsent(f.shadow),elapsed:performance.now()-start});return focused;}
  async function welcome(f){await until(()=>bots(f.shadow).length===1&&typingAbsent(f.shadow));}
  const shortAsk=(f,field)=>f.session.getState().pendingField===field&&(bubble(f.shadow).match(/\?/g)||[]).length===1&&!bubble(f.shadow).includes('\n')&&bubble(f.shadow).length<=100;

  let f=await mount();
  check('Native mascot and modeless widget remain original assets',widget.avatarMascot.getFrame().assetUrl.includes('seedy-spritesheet-v10.webp')&&widget.avatarMascot.element.width===192&&widget.avatarMascot.element.height===208&&f.shadow.querySelector('.ta-panel').getAttribute('aria-modal')==='false');
  check('KTS has no information button, privacy document, checkbox, notices or replacement links',informationUiAbsent(f.shadow)&&!f.shadow.querySelector('input[type="checkbox"]')&&modalAlerts===0);
  const headerControls=[...f.shadow.querySelectorAll('.ta-header-actions button')],headerFocus=[];
  for(const button of headerControls){button.focus({preventScroll:true});headerFocus.push(f.shadow.activeElement===button);}
  check('Only move, reset and close remain as keyboard-reachable native 44px header actions',headerControls.length===3&&headerControls.map(button=>button.getAttribute('aria-label')).sort().join('|')===['Di chuyển hoặc đặt lại vị trí','Làm mới','Đóng trò chuyện'].sort().join('|')&&headerFocus.every(Boolean)&&headerControls.every(button=>button.type==='button'&&button.tabIndex===0&&!button.disabled&&button.getBoundingClientRect().width>=44&&button.getBoundingClientRect().height>=44));
  const header=f.shadow.querySelector('.ta-header'),headerRect=header.getBoundingClientRect(),panelRect=f.shadow.querySelector('.ta-panel').getBoundingClientRect();
  check('The title and three header actions fit the responsive panel without horizontal overflow',header.scrollWidth<=header.clientWidth+1&&headerControls.every(button=>{const rect=button.getBoundingClientRect();return rect.left>=panelRect.left-1&&rect.right<=panelRect.right+1&&rect.top>=headerRect.top-1&&rect.bottom<=headerRect.bottom+1;}),JSON.stringify({viewport:innerWidth,headerWidth:headerRect.width,controlWidths:headerControls.map(button=>button.getBoundingClientRect().width)}));
  f.shadow.querySelector('.ta-window-drag').click();f.shadow.querySelector('.ta-clear').click();await welcome(f);
  check('Header reset returns focus to a clean conversation without replacement information UI',f.shadow.activeElement===f.shadow.querySelector('.ta-input')&&f.shadow.querySelectorAll('.ta-message-user').length===0&&informationUiAbsent(f.shadow)&&modalAlerts===0);
  f.shadow.querySelector('.ta-close').focus();f.shadow.querySelector('.ta-close').click();const closed=f.shadow.querySelector('.ta-panel').hidden&&f.shadow.activeElement===f.shadow.querySelector('.ta-launcher');widget.open();f.shadow.querySelector('.ta-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true,cancelable:true}));
  check('Close and Escape dismiss directly and restore launcher focus after information UI removal',closed&&f.shadow.querySelector('.ta-panel').hidden&&f.shadow.activeElement===f.shadow.querySelector('.ta-launcher')&&informationUiAbsent(f.shadow));widget.open();
  await send(f,'Card in nhanh');
  const paperButtons=[...last(f.shadow).querySelectorAll('.ta-kts-choices button')];
  check('All fifteen approved card papers use reachable buttons with one Neve choice and no baseline-pending paper',paperButtons.length===15&&paperButtons.every(button=>button.type==='button'&&button.tabIndex===0&&getComputedStyle(button).fontSize==='16px'&&button.getBoundingClientRect().height>=44)&&paperButtons.some(button=>button.textContent==='K02 146gsm')&&paperButtons.filter(button=>/Boheme|Neve/i.test(button.textContent)).length===1&&paperButtons.some(button=>button.textContent==='Boheme Tradition Neve 320gsm')&&!paperButtons.some(button=>/246|kraft|biancon|B300/i.test(button.textContent)));
  check('Long paper labels wrap without horizontal scrolling and keep one content scroller',fits(f.shadow)&&oneScroller(f.shadow),JSON.stringify({viewport:{width:innerWidth,height:innerHeight},panelWidth:f.shadow.querySelector('.ta-panel').clientWidth,panelScrollWidth:f.shadow.querySelector('.ta-panel').scrollWidth}));
  const shortAsks=[shortAsk(f,'paper')],paperFocus=await choose(f,'C300');shortAsks.push(shortAsk(f,'quantity'));await send(f,'5 hộp');shortAsks.push(shortAsk(f,'sides'));
  check('Card boxes convert once to pieces and its default dimensions remain 9 by 5.4 cm',f.session.getState().slots.quantity===500&&f.session.getState().slots.length===9&&f.session.getState().slots.width===5.4&&f.session.getState().pendingField==='sides'&&f.posts().length===0);
  const sidesFocus=await choose(f,'2 mặt');shortAsks.push(shortAsk(f,'laminate'));check('Side selection asks laminate before requesting a quote',f.session.getState().pendingField==='laminate'&&f.posts().length===0);
  const laminateFocus=await choose(f,'Có');shortAsks.push(shortAsk(f,'roundCorners'));const roundFocus=await choose(f,'Không');shortAsks.push(shortAsk(f,'micaBox'));check('Finishing questions progress one at a time without invented defaults',f.session.getState().pendingField==='micaBox'&&f.posts().length===0);
  check('Each missing card specification receives one short question before a quote is sent',shortAsks.length===6&&shortAsks.every(Boolean)&&f.posts().length===0);
  const micaFocus=await choose(f,'Có');
  check('KTS choices retain native keyboard focus before activation',paperFocus&&sidesFocus&&laminateFocus&&roundFocus&&micaFocus);
  check('Completed card sends exact eight fields without chat, product or pricing inputs',f.posts().length===1&&Object.keys(f.dto()).sort().join(',')===keys&&same(f.dto(),SPEC)&&!/history|message|product|technology|total|price|cost|formula|coefficient/.test(f.posts()[0].body)&&f.aiPosts().length===0);
  check('The arbitrary opaque total formats losslessly above MAX_SAFE_INTEGER without VAT or recomputation',total(f.shadow)==='500 cái: '+DISPLAY&&bubble(f.shadow).split('\n').length===2&&!/VAT|vận chuyển|giá vốn|lợi nhuận|Giá làm căn cứ/.test(last(f.shadow).textContent));
  check('A very long total remains readable inside the responsive panel with one scroller',fits(f.shadow)&&oneScroller(f.shadow)&&parseFloat(getComputedStyle(last(f.shadow).querySelector('.ta-quote-total')).fontSize)>=16);

  // Public 0.6.0 response anchors replay through mocks. The client displays
  // the supplied totals; these cases contain no calculator arithmetic.
  for(const anchor of [
   {name:'C300 500 with laminate, corners and mica',query:CARD.replace('không bo góc','có bo góc'),spec:{...SPEC,roundCorners:true},total:'400000',display:'500 cái: 400.000 ₫'},
   {name:'voucher 20 with corners and area-locked mica',query:'In voucher C300 20 cái 18 × 5,4 cm 2 mặt có cán màng có bo góc không hộp mica',spec:{...SPEC,quantity:20,length:18,roundCorners:true,micaBox:false},total:'90000',display:'20 cái: 90.000 ₫'},
   {name:'voucher 50 with corners and area-locked mica',query:'In voucher C300 50 cái 18 × 5,4 cm 2 mặt có cán màng có bo góc không hộp mica',spec:{...SPEC,quantity:50,length:18,roundCorners:true,micaBox:false},total:'150000',display:'50 cái: 150.000 ₫'}
  ]){
   f=await mount({total:anchor.total});await send(f,anchor.query);
   check('Public API anchor '+anchor.name+' keeps its exact spec and total in two logical lines without a second fee or percentage',f.posts().length===1&&Object.keys(f.dto()).sort().join(',')===keys&&same(f.dto(),anchor.spec)&&total(f.shadow)===anchor.display&&bubble(f.shadow).split('\n').length===2&&!/%|phụ phí|5\.000|markup|coefficient|formula/.test(last(f.shadow).textContent)&&f.aiPosts().length===0&&fits(f.shadow));
  }

  for(const product of ['Tag chữ nhật KTS','In voucher']){
   f=await mount();await send(f,product);const initialChoices=[...last(f.shadow).querySelectorAll('.ta-kts-choices button')].map(button=>button.textContent);
   await send(f,product+' C150 100 cái 10 × 5 cm 2 mặt có cán màng không bo góc không hộp mica');const restricted=f.posts().length===0&&noQuote(f.shadow)&&same([...last(f.shadow).querySelectorAll('.ta-kts-choices button')].map(button=>button.textContent),['C300']);await choose(f,'C300');
   check(product+' offers only C300 and requires explicit paper confirmation without silent substitution',same(initialChoices,['C300'])&&restricted&&f.posts().length===1&&f.dto().paper==='p08'&&f.dto().length===10&&f.dto().width===5);
  }
  let aliasesCorrect=true;
  for(const [alias,paper]of [['K02','p11'],['Boheme Neve','p18'],['Boheme tradition 320 gsm','p18'],['Boheme Tradition Neve 320gsm','p18'],['Neve','p18'],['old mill avorio 350gsm','p12'],['old mill premium white 350gsm','p14']]){
   f=await mount();await send(f,'Danh thiếp KTS giấy '+alias+' 100 cái 2 mặt không bo góc có hộp mica');aliasesCorrect=aliasesCorrect&&f.posts().length===1&&f.dto().paper===paper&&f.dto().quantity===100&&f.dto().laminate===false;
  }
  check('Neve and Boheme 320 aliases use only canonical p18 while K02, Avorio and Premium White remain separate',aliasesCorrect);
  for(const obsolete of ['K02 246g','K02 246 g']){f=await mount();await send(f,'Danh thiếp KTS giấy '+obsolete+' 100 cái 2 mặt không bo góc có hộp mica');check(obsolete+' asks for paper confirmation instead of quoting corrected K02 146gsm',f.posts().length===0&&noQuote(f.shadow)&&f.session.getState().pendingField==='paper'&&f.session.getState().slots.paper===undefined);}
  f=await mount();await send(f,'Danh thiếp KTS Biancon 100 cái 2 mặt không bo góc không hộp mica');const bianconBlocked=f.posts().length===0&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta');await send(f,'Tổng tiền');
  check('Biancon without an approved baseline offers consultation and asks for an approved paper before any calculator POST',bianconBlocked&&f.posts().length===0&&noQuote(f.shadow)&&f.session.getState().slots.paper===undefined&&f.session.getState().pendingField==='paper'&&f.aiPosts().length===0);
  f=await mount();await send(f,CARD);const originalPost=f.posts()[0].body;let kraftBlocked=true;
  for(const text of ['đổi sang Kraft','Kraft 350gsm','Tổng tiền']){await send(f,text);kraftBlocked=kraftBlocked&&f.posts().length===1&&noQuote(f.shadow)&&f.session.getState().slots.paper===undefined&&f.session.getState().pendingField==='paper';}
  await send(f,'Giấy p08');check('A Kraft edit cannot silently reuse an active C300 quote before an explicit approved-paper selection',kraftBlocked&&f.posts().length===2&&f.posts()[0].body===originalPost&&same(f.dto(),SPEC)&&f.aiPosts().length===0);
  for(const paper of ['p11','p18','p20']){
   f=await mount({status:422});await send(f,'Danh thiếp KTS giấy '+paper+' 10 cái 12 × 8 cm 1 mặt không bo góc không hộp mica');
   check('Custom '+paper+' keeps its requested size, sides and quantity after HTTP422 without a standard-card fallback',f.posts().length===1&&same(f.dto(),{...SPEC,paper,quantity:10,length:12,width:8,sides:1,laminate:false,micaBox:false})&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta'));
  }
  f=await mount({status:422});await send(f,'Danh thiếp KTS p20 100 cái khổ riêng 2 mặt không bo góc không hộp mica');const customInitial=f.posts().length===0&&noQuote(f.shadow)&&f.session.getState().pendingField==='size'&&f.session.getState().slots.length===undefined&&f.session.getState().slots.width===undefined;await send(f,'12 × 8 cm');
  check('Initial custom-size wording waits for actual dimensions and preserves the subsequent HTTP422 handoff',customInitial&&f.posts().length===1&&same(f.dto(),{...SPEC,paper:'p20',quantity:100,length:12,width:8,laminate:false,micaBox:false})&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta'));
  const customOptions={};f=await mount(customOptions);await send(f,'Danh thiếp KTS p20 100 cái 2 mặt không bo góc có hộp mica');customOptions.status=422;await send(f,'đổi khổ riêng');const customActive=f.posts().length===1&&noQuote(f.shadow)&&f.session.getState().pendingField==='size'&&f.session.getState().slots.length===undefined&&f.session.getState().slots.width===undefined;await send(f,'12 × 8 cm');
  check('Changing an active card to custom size drops old dimensions before a new request and never falls back to standard size',customActive&&f.posts().length===2&&same(f.dto(),{...SPEC,paper:'p20',quantity:100,length:12,width:8,laminate:false,micaBox:false})&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta'));

  f=await mount();await send(f,'Danh thiếp in nhanh C300 5 hộp');const before=JSON.stringify(f.session.getState());await send(f,'Giờ làm việc');await send(f,'kt a4 là bao nhiêu');
  check('Local hours and basic FAQ preserve pending KTS slots without calling quote or AI',JSON.stringify(f.session.getState())===before&&bubble(f.shadow).includes('21 × 29,7 cm')&&f.posts().length===0&&f.aiPosts().length===0);
  for(const text of ['2 mặt','Có cán màng','Không bo góc','Có hộp mica'])await send(f,text);
  check('Completing the interrupted card still uses its original pieces and dimensions',same(f.dto(),SPEC)&&total(f.shadow)==='500 cái: '+DISPLAY);

  f=await mount();await send(f,'Danh thiếp C300 5 hộp');const legacyMethod=bubble(f.shadow).includes('in offset hay in nhanh');await send(f,'In nhanh');
  check('An existing card method choice enters KTS before a legacy card price can appear',legacyMethod&&f.session.getState().product==='card'&&f.session.getState().pendingField==='sides'&&noQuote(f.shadow)&&f.posts().length===0);
  for(const text of ['2 mặt','Có cán màng','Không bo góc','Có hộp mica'])await send(f,text);
  check('Legacy-to-KTS handoff carries card paper and boxes only once into the public DTO',same(f.dto(),SPEC)&&f.posts().length===1&&f.aiPosts().length===0);
  f=await mount();await send(f,'Danh thiếp in offset 12 hộp');check('Explicit offset stays local without a KTS request or choices',f.posts().length===0&&f.session.getState().product===null&&!last(f.shadow)?.querySelector('.ta-kts-choices')&&f.aiPosts().length===0);
  for(const quantity of ['5 hộp','100 cái']){
   f=await mount();await send(f,'Danh thiếp KTS C150 '+quantity+' 12 × 8 cm 1 mặt không cán màng có bo góc không hộp mica');const count=f.posts().length;await send(f,'In offset');
   const confirmed=noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta')&&f.posts().length===count;await choose(f,'Chọn gói offset');
   check('KTS-to-offset '+quantity+' requires package confirmation and a separate box quantity',confirmed&&bubble(f.shadow).includes('bao nhiêu hộp')&&noQuote(f.shadow)&&f.posts().length===count&&f.session.getState().product===null);
  }

  f=await mount();for(const text of ['Tag chữ nhật KTS C300 100 cái','50 × 90 mm','2 mặt','Có cán màng','Có bo góc','Không hộp mica'])await send(f,text);
  check('Tag preserves its millimetre-to-centimetre dimensions and piece quantity',same(f.dto(),{...SPEC,quantity:100,length:5,width:9,roundCorners:true,micaBox:false})&&bubble(f.shadow).includes('5 × 9 cm')&&bubble(f.shadow).includes('Tag chữ nhật'));
  f=await mount();await send(f,'In voucher C300 100 cái 18 × 5,4 cm 2 mặt có cán màng không bo góc có hộp mica');
  check('Voucher preserves arbitrary dimensions and forces mica off above the applicable area',same(f.dto(),{...SPEC,quantity:100,length:18,width:5.4,micaBox:false})&&f.session.getState().locks.micaBox&&bubble(f.shadow).includes('18 × 5,4 cm'));
  f=await mount();await send(f,'Tag chữ nhật KTS C300 100 cái 16 × 3 cm 2 mặt có cán màng không bo góc có hộp mica');
  check('Mica uses area eligibility without imposing an individual-side limit',same(f.dto(),{...SPEC,quantity:100,length:16,width:3})&&!f.session.getState().locks.micaBox);
  f=await mount();await send(f,'Danh thiếp KTS giấy p10 1 hộp 2 mặt có cán màng không bo góc không hộp mica');
  check('Art paper reaches the quote only with locked laminate=false',same(f.dto(),{...SPEC,paper:'p10',quantity:100,laminate:false,micaBox:false})&&f.session.getState().locks.laminate&&bubble(f.shadow).includes('không cán màng')&&bubble(f.shadow).includes('ARCOPRINT1 EXTRA WHITE 300GSM'));
  f=await mount();await send(f,'Tag chữ nhật KTS C300 100 cái bế hình');const unsupported=noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta');await send(f,'Card in nhanh C300 5 hộp');await send(f,'2 mặt fictional@example.invalid');
  check('Unsupported finishing and tested synthetic private text never reach either provider',unsupported&&noQuote(f.shadow)&&f.posts().length===0&&f.aiPosts().length===0);
  f=await mount();await send(f,'Tag chữ nhật KTS C300 100 cái 5 × 9 cm 2 mặt có cán màng không bo góc không hộp mica');let sticky=true;
  for(const text of ['Bế hình','200 cái','Tổng tiền']){await send(f,text);sticky=sticky&&f.posts().length===1&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta')&&f.session.getState().blockedUnsupported;}
  await send(f,'Quy cách cắt thẳng');
  check('Die-cut intent blocks later quantity and total edits until straight-cut confirmation',sticky&&!f.session.getState().blockedUnsupported&&f.posts().length===2&&!!total(f.shadow));

  for(const status of [400,422,429,503]){f=await mount({status});await send(f,CARD);check('HTTP '+status+' gives explicit consultation without a fabricated local price or automatic retry',f.posts().length===1&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta')&&f.aiPosts().length===0&&typingAbsent(f.shadow));}
  const retryOptions={status:429};f=await mount(retryOptions);await send(f,CARD);const firstBody=f.posts()[0].body;retryOptions.status=200;await choose(f,'Tính lại');
  check('Explicit retry sends the same reviewed spec and displays the opaque mock total',f.posts().length===2&&f.posts()[1].body===firstBody&&total(f.shadow)==='500 cái: '+DISPLAY);
  f=await mount({reply:spec=>({version:1,kind:'quote',total:TOTAL,currency:'VND',spec:{...spec,quantity:spec.quantity+1,paperLabel:'C300'}})});await send(f,CARD);
  check('A mismatched echoed specification is rejected without a legacy price fallback',f.posts().length===1&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta'));
  f=await mount({enabled:false});await send(f,CARD);const disabled=f.posts().length===0&&noQuote(f.shadow);f=await mount({offline:true});await send(f,CARD);
  check('Disabled metadata and network failure both remain quote-free with clear handoff',disabled&&f.posts().length===1&&noQuote(f.shadow)&&!!last(f.shadow).querySelector('.ta-consult-cta'));

  f=await mount({pending:true});let old=widget.send(CARD);await until(()=>f.posts().length===1);const visibleDots=dots(f.shadow);await old;const timeoutText=f.shadow.querySelector('.ta-log').textContent;f.resolve();await microtasks();
  check('A stalled quote times out, removes dots and ignores its late completion',visibleDots&&f.posts()[0].signal.aborted&&noQuote(f.shadow)&&typingAbsent(f.shadow)&&f.shadow.querySelector('.ta-log').textContent===timeoutText&&f.posts().length===1);
  for(const action of ['clear','close','destroy']){
   f=await mount({pending:true});let done=false;old=widget.send(CARD).then(()=>{done=true;});await until(()=>f.posts().length===1);
   if(action==='clear')f.shadow.querySelector('.ta-clear').click();else widget[action]();await until(()=>done);await old;
   if(action==='clear')await welcome(f);if(action==='close')widget.open();const saved=f.shadow.querySelector('.ta-log').textContent,oldHost=widget.host;f.resolve();await microtasks();await sleep(30);
   check(action+' cancels the real client request and suppresses an ignored-abort total',f.posts()[0].signal.aborted&&f.shadow.querySelector('.ta-log').textContent===saved&&!f.shadow.querySelector('.ta-quote-total')&&typingAbsent(f.shadow)&&(action!=='destroy'||!oldHost.isConnected&&f.client.getState().destroyed));
   if(action==='destroy')widget=null;
  }
  f=await mount({pending:true});old=widget.send(CARD);await until(()=>f.posts().length===1);const current=widget.send('7 hộp');await until(()=>f.posts().length===2);await old;f.resolve();await microtasks();const staleSuppressed=!f.shadow.querySelector('.ta-quote-total');f.resolve();await current;
  check('A new quantity aborts the older quote and only renders its own exact spec',staleSuppressed&&f.posts()[0].signal.aborted&&JSON.parse(f.posts()[0].body).quantity===500&&f.dto().quantity===700&&f.shadow.querySelectorAll('.ta-quote-total').length===1&&total(f.shadow)==='700 cái: '+DISPLAY);
  for(const action of ['clear','close']){
   f=await mount({pendingMetadata:true});let done=false;old=widget.send(CARD).then(()=>{done=true;});await microtasks();const waiting=dots(f.shadow)&&f.posts().length===0;
   if(action==='clear')f.shadow.querySelector('.ta-clear').click();else widget.close();await until(()=>done);await old;const keptGet=!f.calls[0].signal.aborted;f.resolve('GET');await until(()=>f.client.getState().checked);const noStale=f.posts().length===0;
   if(action==='clear')await welcome(f);else widget.open();await send(f,CARD);
   check(action+' during metadata resolves the old turn and preserves readiness for a fresh quote',waiting&&keptGet&&noStale&&f.calls.filter(c=>c.method==='GET').length===1&&f.posts().length===1&&same(f.dto(),SPEC));
  }
  f=await mount({pendingMetadata:true});let destroyedDone=false;old=widget.send(CARD).then(()=>{destroyedDone=true;});await microtasks();const oldHost=widget.host;widget.destroy();widget=null;await until(()=>destroyedDone);f.resolve('GET');await old;await microtasks();
  check('Destroy during metadata aborts GET and cannot trigger a late POST',f.calls[0].signal.aborted&&f.posts().length===0&&!oldHost.isConnected&&f.client.getState().destroyed);

  f=await mount();await send(f,'Giờ làm việc');await send(f,CARD);
  check('Removed information UI has no replacement while calculator POST includes only eight quote fields without chat or history',informationUiAbsent(f.shadow)&&modalAlerts===0&&f.posts().length===1&&Object.keys(f.dto()).sort().join(',')===keys&&same(f.dto(),SPEC)&&!/history|message|chat|Giờ làm việc|Danh thiếp|product|technology|total|price|cost|formula|coefficient/.test(f.posts()[0].body)&&f.aiPosts().length===0&&oneScroller(f.shadow));
  f=await mount();await send(f,CARD.replace('5 hộp','10 cái').replace('không bo góc','có bo góc'));
  check('A rounded-corner order below one hundred pieces keeps its eight-field spec and opaque total without a client surcharge',f.posts().length===1&&Object.keys(f.dto()).sort().join(',')===keys&&same(f.dto(),{...SPEC,quantity:10,roundCorners:true})&&total(f.shadow)==='10 cái: '+DISPLAY&&!/phụ phí|5\.000|VAT|giá vốn|lợi nhuận/.test(last(f.shadow).textContent)&&f.aiPosts().length===0);

  // Public paper labels must survive the actual button -> transcript -> DTO -> quote path.
  for(const paper of ThanhAnKtsQuote.papers){
   f=await mount();await send(f,'Danh thiếp KTS 500 cái 2 mặt không cán màng không bo góc có hộp mica');await choose(f,paper.label);
   const users=[...f.shadow.querySelectorAll('.ta-message-user')],echo=users.at(-1).querySelector('.ta-message-bubble').textContent;
   check('Friendly button and exact paper identity '+paper.id,f.posts().length===1&&f.dto().paper===paper.id&&!/\bp\d{2}\b/i.test(echo)&&echo.includes(paper.label)&&bubble(f.shadow).includes(paper.label)&&fits(f.shadow));
   await send(f,paper.id.toUpperCase());
   check('Typed paper ID keeps its real label and all slots '+paper.id,f.dto().paper===paper.id&&f.dto().quantity===500&&bubble(f.shadow).includes(paper.label));
  }
  const connection={metadataStatus:403};f=await mount(connection);
  await send(f,'In voucher 20 cái 18 x 5,4 cm 2 mặt có cán màng');await send(f,'có in giấy mĩ thuật k');
  check('Art-paper capability question does not repeat the C300 picker or lose quantity',/mỹ thuật/.test(bubble(f.shadow))&&f.session.getState().slots.quantity===20&&!last(f.shadow).querySelector('.ta-kts-choices'));
  await send(f,'Giấy C300');await choose(f,'Có');
  check('A denied metadata request is a connection failure without any quote POST',f.posts().length===0&&/kết nối bộ tính/i.test(bubble(f.shadow)));
  await send(f,'quy cách cần tính của tooii là gì mà tính ko ra');
  check('Recap shows all retained voucher specs and the actual connection problem',f.posts().length===0&&['20 cái','18 × 5,4 cm','C300','2 mặt','cán màng','bo góc','lỗi kết nối'].every(value=>bubble(f.shadow).includes(value))&&fits(f.shadow)&&oneScroller(f.shadow));
  connection.metadataStatus=200;await choose(f,'Tính lại');
  check('An explicit retry rechecks metadata and prices the original voucher only once',f.posts().length===1&&same(f.dto(),{...SPEC,quantity:20,length:18,roundCorners:true,micaBox:false}));
  f=await mount();await send(f,CARD);let previous=f.posts().length,blocked=true;
  for(const text of ['không dùng C300','C300 định lượng 250gsm','old mill premium white 300gsm','đổi sang giấy Duplex 300gsm, 200 cái']){
   await send(f,text);blocked=blocked&&f.posts().length===previous&&f.session.getState().pendingField==='paper'&&!f.session.getState().slots.paper;
   await send(f,'Báo giá lại');blocked=blocked&&f.posts().length===previous;await choose(f,'C300');previous=f.posts().length;
  }
  check('Rejected, mismatched and unknown papers never reuse a previous quote',blocked);
  await send(f,'không cần hộp mica');await send(f,'không muốn cán màng');await send(f,'không dùng bo góc');
  check('Natural negative finishes reach the calculator as false',!f.dto().micaBox&&!f.dto().laminate&&!f.dto().roundCorners);

  check('Final quote, input and close control fit the responsive viewport',fits(f.shadow)&&oneScroller(f.shadow)&&f.shadow.querySelector('.ta-close').getClientRects().length>0);
  check('All awaited KTS/local turns show one presentation and settle after the response floor',presentation.length>=30&&presentation.every(p=>p.pending&&p.settled&&p.elapsed>=310),JSON.stringify({count:presentation.length,minMs:Math.min(...presentation.map(p=>p.elapsed))}));
  check('No persistent visitor chat or cookies are written',JSON.stringify({...localStorage})===stored.local&&JSON.stringify({...sessionStorage})===stored.session&&document.cookie===stored.cookie);
  check('All actual harness resources stay on the local origin with no live calculator or AI fetch',performance.getEntriesByType('resource').every(r=>new URL(r.name,location.href).origin===location.origin)&&f.aiPosts().length===0);
 }catch(error){check('KTS browser harness finishes without a runtime error',false,error.message);}
 check('No modal information or replacement alerts are raised',modalAlerts===0);window.alert=originalAlert;
 const pass=results.filter(r=>r.pass).length,report={kind:'KTS MOCK widget integration; arbitrary totals, no live provider calls',began,ended:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight},pass,fail:results.length-pass,total:results.length,results};
 byId('results-json').textContent=JSON.stringify(report,null,2);window.__ktsBrowserReport=report;summary.textContent=pass+'/'+results.length+' PASS · '+report.fail+' FAIL · MOCK ONLY';run.disabled=false;
}
run.addEventListener('click',tests);
})();
