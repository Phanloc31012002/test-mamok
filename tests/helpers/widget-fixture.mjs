import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Node integration tests: real policy, presentation and widget code, with a
// deliberately small DOM and deterministic timers. No browser or network.
const sources=Object.fromEntries(['policy','presentation','gemini-client','widget'].map(name=>[name,fs.readFileSync(new URL('../../widget/'+name+'.js',import.meta.url),'utf8')]));
const data=JSON.parse(fs.readFileSync(new URL('../../widget/data.json',import.meta.url),'utf8'));
const microtasks=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

function clock(){
  let now=0,nextId=1;
  const pending=new Map();
  const setTimeout=(fn,ms=0)=>{const id=nextId++;pending.set(id,{fn,at:now+Math.max(0,Number(ms)||0)});return id;};
  const clearTimeout=id=>pending.delete(id);
  async function advance(ms){const end=now+ms;for(;;){const task=[...pending].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!task)break;now=task[1].at;pending.delete(task[0]);task[1].fn();await microtasks();}now=end;await microtasks();}
  return{get now(){return now;},setTimeout,clearTimeout,advance,pending};
}

function fakeDocument(){
  const doc={baseURI:'https://mam.test/demo',activeElement:null};
  class Node {
    constructor(tag,text=null){this.tagName=tag.toUpperCase();this.nodeType=text===null?1:3;this._text=text||'';this.children=[];this.parentNode=null;this.attributes=new Map();this.listeners=new Map();this.className='';this.dataset={};this.hidden=false;this.style={setProperty:(key,value)=>{this.style[key]=value;}};this.scrollTop=0;this.clientHeight=400;this.offsetHeight=80;}
    get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
    get childElementCount(){return this.children.filter(n=>n.nodeType===1).length;}
    get firstElementChild(){return this.children.find(n=>n.nodeType===1)||null;}
    get scrollHeight(){return this.children.length*80;}
    get isConnected(){return this===doc.body||Boolean(this.parentNode?.isConnected)||Boolean(this.host?.isConnected);}
    get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
    set textContent(value){this.replaceChildren();this._text=String(value??'');}
    set innerHTML(_){throw new Error('Unsafe HTML writes are forbidden in this fixture');}
    get classList(){return{add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
    setAttribute(key,value){this.attributes.set(key,String(value));if(key==='class')this.className=String(value);if(key==='id')this.id=String(value);}
    getAttribute(key){return this.attributes.get(key)??null;}
    removeAttribute(key){this.attributes.delete(key);if(key.startsWith('data-'))delete this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
    appendChild(child){child.remove();this.children.push(child);child.parentNode=this;return child;}
    append(...children){children.forEach(child=>this.appendChild(child));}
    prepend(child){child.remove();this.children.unshift(child);child.parentNode=this;}
    insertBefore(child,before){child.remove();const i=this.children.indexOf(before);if(i<0)return this.appendChild(child);this.children.splice(i,0,child);child.parentNode=this;return child;}
    replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';children.forEach(child=>this.appendChild(child));}
    remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children.splice(i,1);this.parentNode=null;}}
    attachShadow(){const shadow=new Node('#shadow-root');shadow.host=this;shadow.activeElement=null;this.shadowRoot=shadow;return shadow;}
    contains(target){return this===target||this.children.some(child=>child.contains(target));}
    matches(selector){return selector.split(',').some(part=>{const s=part.trim();if(s.startsWith('.'))return s.slice(1).split('.').every(c=>this.classList.contains(c));if(s.startsWith('#'))return this.id===s.slice(1);return this.tagName===s.toUpperCase();});}
    querySelectorAll(selector){const found=[];for(const child of this.children){if(child.nodeType===1&&child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){for(let n=this;n;n=n.parentNode)if(n.matches(selector))return n;return null;}
    addEventListener(type,fn,capture=false){const listeners=this.listeners.get(type)||[];listeners.push({fn,capture:typeof capture==='boolean'?capture:Boolean(capture.capture)});this.listeners.set(type,listeners);}
    removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(record=>record.fn!==fn));}
    dispatchEvent(event){event.target??=this;event.preventDefault??=()=>{event.defaultPrevented=true;};event.stopImmediatePropagation??=()=>{event.stopped=true;};const path=[];for(let n=this;n;n=n.parentNode)path.push(n);for(const n of [...path].reverse()){for(const l of n.listeners.get(event.type)||[]){if(l.capture){l.fn(event);if(event.stopped)return !event.defaultPrevented;}}}for(const n of path){for(const l of n.listeners.get(event.type)||[]){if(!l.capture){l.fn(event);if(event.stopped)return !event.defaultPrevented;}}}return !event.defaultPrevented;}
    click(){this.dispatchEvent({type:'click'});}
    focus(){doc.activeElement=this;for(let n=this;n;n=n.parentNode)if(n.host){n.activeElement=this;break;}}
    scrollTo(options){this.scrollTop=options.top;}
    getBoundingClientRect(){return{top:0,left:0,right:300,bottom:this.offsetHeight,width:300,height:this.offsetHeight};}
  }
  doc.body=new Node('body');doc.createElement=tag=>new Node(tag);doc.createElementNS=(_,tag)=>new Node(tag);doc.createTextNode=text=>new Node('#text',String(text));
  return doc;
}

function deferredClient(c,options,kind){
  const calls=[],waiting=new Set();let consent=Boolean(options.consent),destroyed=false,aborts=0;
  function request(args){calls.push(args);const plan=(options.plan||(()=>({delay:0,value:null})))(...args);return new Promise(resolve=>{const record={resolve,timer:null};waiting.add(record);record.timer=c.setTimeout(()=>{waiting.delete(record);resolve(plan.value);},plan.delay);});}
  function abort(){aborts++;if(options.ignoreAbort)return;for(const record of waiting){c.clearTimeout(record.timer);record.resolve(null);}waiting.clear();}
  const client={check:async()=>true,getState:()=>({consent}),setConsent(value){abort();return consent=Boolean(value);},abort,destroy(){destroyed=true;abort();},calls,get aborted(){return aborts;},get destroyed(){return destroyed;}};
  if(kind==='ai')client.suggest=text=>request([text]);else client.get=(productId,field)=>request([productId,field]);
  return client;
}

async function fixture(options={}){
  const c=clock(),doc=fakeDocument(),events=new Map(),network=[],storage=[],alerts=[],dragCalls=[];
  const epoch=Date.parse('2026-10-13T12:00:00Z');
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[epoch+c.now]));}static now(){return epoch+c.now;}}
  const root={document:doc,location:{origin:'https://mam.test',href:'https://mam.test/demo'},innerHeight:800,setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
  root.alert=value=>alerts.push(String(value));
  if(options.drag)root.ThanhAnDrag={create(){return{reset(){dragCalls.push('reset');},reclamp(){dragCalls.push('reclamp');},destroy(){dragCalls.push('destroy');}};}};
  root.ThanhAnMascot={create(){return{element:doc.createElement('canvas'),ready:Promise.resolve(),setState(){},setPaused(){},destroy(){}};}};
  const menuCalls=[];
  root.ThanhAnPriceMenu={isMenuRequest:text=>/^(xem gia|xem bang gia)$/.test(root.ThanhAnFAQ.normalize(text)),buildCatalog:()=>({categories:[{id:'namecard',name:'Danh thiếp'},{id:'catalogue',name:'Catalogue'}]}),create({onActivity}){const element=doc.createElement('div');const b=doc.createElement('button');b.className='ta-price-category';b.textContent='Danh thiếp';element.appendChild(b);b.addEventListener('click',()=>{menuCalls.push(c.now);element.dataset.selected='namecard';onActivity();});return{element,destroy(){element.remove();},showCategory(){}};}};
  let ai=options.ai?deferredClient(c,options.ai,'ai'):null;
  const aiRequests=[],aiPending=[];
  const aiFetch=(url,init)=>{
    assert.equal(new URL(url).origin,root.location.origin);
    assert.equal(new URL(url).pathname,'/api/mam-ai');
    aiRequests.push({...init});
    const value=init.method==='GET'?{version:1,enabled:options.realAi.enabled!==false,privacyVersion:'google-free-v1'}:{version:1,kind:'suggestion',intent:'product',categoryId:'catalogue'};
    const response={ok:true,text:async()=>JSON.stringify(value)};
    if(options.realAi.pendingMetadata&&init.method==='GET'||options.realAi.pending&&init.method==='POST')return new Promise(resolve=>aiPending.push({method:init.method,resolve:()=>resolve(response)}));
    return Promise.resolve(response);
  };
  const info=options.info?deferredClient(c,options.info,'info'):null;
  let ktsClient=null,ktsSession=null,ktsAnswers=0,ktsResets=0;
  const ktsRequests=[],ktsPending=[];
  const ktsFetch=async(url,init)=>{
    assert.equal(new URL(url).origin,root.location.origin);
    assert.equal(new URL(url).pathname,'/api/mam-quote');
    const call={url,...init};ktsRequests.push(call);
    if(options.kts.offline&&init.method==='POST')throw new Error('Mock KTS offline');
    let value,status=200;
    if(init.method==='GET'){value=options.kts.metadata||{version:1,enabled:true};status=options.kts.metadataStatus||200;}
    else{
      const spec=JSON.parse(init.body),paper=root.ThanhAnKtsQuote.papers.find(p=>p.id===spec.paper);
      status=options.kts.status||200;
      value=options.kts.reply?options.kts.reply(spec,ktsRequests.filter(r=>r.method==='POST').length):{version:1,kind:'quote',total:options.kts.total||'12345678901234567890',currency:'VND',spec:{...spec,paperLabel:paper?.label}};
    }
    const response=new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    Object.defineProperty(response,'url',{value:String(url)});
    if(options.kts.pendingMetadata&&init.method==='GET'||options.kts.pending&&init.method==='POST')return new Promise(resolve=>ktsPending.push({method:init.method,settled:false,resolve(){this.settled=true;resolve(response);}}));
    return response;
  };
  if(ai)root.ThanhAnGemini={create:()=>ai};if(info)root.ThanhAnSourceInfo={create:()=>info};
  const fetch=()=>{network.push('fetch');throw new Error('Network is forbidden in this fixture');};
  const unavailableStorage=new Proxy({},{get(_,key){storage.push(String(key));throw new Error('Visitor storage is forbidden in this fixture');}});
  root.localStorage=unavailableStorage;root.sessionStorage=unavailableStorage;
  const context=vm.createContext({window:root,document:doc,location:root.location,URL,Date:ClockDate,AbortController,Response,TextEncoder,TextDecoder,Uint8Array,fetch,localStorage:unavailableStorage,sessionStorage:unavailableStorage,setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,requestAnimationFrame:fn=>c.setTimeout(fn,16),cancelAnimationFrame:c.clearTimeout});
  for(const name of ['policy','presentation',...(options.realAi?['gemini-client']:[])])vm.runInContext(sources[name],context,{filename:name+'.js'});
  if(options.realAi){const originalCreate=root.ThanhAnGemini.create;root.ThanhAnGemini={...root.ThanhAnGemini,create(settings){return ai=originalCreate(settings);}};}
  if(options.kts){
    for(const name of ['kts-session','kts-client'])vm.runInContext(fs.readFileSync(new URL('../../widget/'+name+'.js',import.meta.url),'utf8'),context,{filename:name+'.js'});
    const originalKts=root.ThanhAnKts,originalClient=root.ThanhAnKtsQuote;
    root.ThanhAnKts={...originalKts,createSession(...args){const session=originalKts.createSession(...args);ktsSession=session;return{...session,answer(...values){ktsAnswers++;return session.answer(...values);},reset(...values){ktsResets++;return session.reset(...values);}};}};
    root.ThanhAnKtsQuote={...originalClient,create(settings){return ktsClient=originalClient.create(settings);}};
  }
  vm.runInContext(sources.widget,context,{filename:'widget.js'});
  let answers=0,resets=0;
  const original=root.ThanhAnFAQ;
  root.ThanhAnFAQ={...original,createSession(...args){const session=original.createSession(...args);return{answer(...values){answers++;return session.answer(...values);},reset(){resets++;session.reset();},...(typeof session.getState==='function'?{getState:()=>session.getState()}:{})};}};
  const widget=await root.ThanhAnChat.mount({data,styles:'/* fixture styles */',reducedMotion:options.reducedMotion,aiEndpoint:ai||options.realAi?'/api/mam-ai':undefined,aiFetch:options.realAi?aiFetch:undefined,infoEndpoint:info?'/api/mam-info':undefined,ktsEndpoint:options.kts?'/api/mam-quote':undefined,ktsFetch:options.kts?ktsFetch:undefined});
  const f={clock:c,document:doc,root,widget,ai,info,ktsClient,ktsSession,network,storage,alerts,dragCalls,menuCalls,aiRequests,ktsRequests,posts:()=>aiRequests.filter(call=>call.method==='POST'),ktsPosts:()=>ktsRequests.filter(call=>call.method==='POST'),resolveAi(method='POST'){aiPending.find(call=>call.method===method)?.resolve();},resolveKts(method='POST'){ktsPending.find(call=>call.method===method&&!call.settled)?.resolve();},get answers(){return answers;},get resets(){return resets;},get ktsAnswers(){return ktsAnswers;},get ktsResets(){return ktsResets;},find:selector=>widget.shadow.querySelector(selector),all:selector=>widget.shadow.querySelectorAll(selector),bots:()=>widget.shadow.querySelectorAll('.ta-message').filter(n=>!n.classList.contains('ta-message-user')&&!n.classList.contains('ta-message-typing')),users:()=>widget.shadow.querySelectorAll('.ta-message-user')};
  if(options.open!==false){widget.open();await c.advance(320);}
  return f;
}

async function prepared(t,options){const f=await fixture(options);t.after(()=>{f.widget.destroy();assert.deepEqual(f.network,[]);assert.deepEqual(f.storage,[]);assert.deepEqual(f.alerts,[]);});return f;}
const noTyping=f=>assert.equal(f.all('.ta-message-typing').length,0);
const typing=f=>{assert.equal(f.all('.ta-message-typing').length,1);assert.equal(f.all('.ta-typing-dot').length,3);assert.equal(f.find('.ta-typing-dots').getAttribute('aria-hidden'),'true');assert.equal(f.find('.ta-typing-bubble').textContent,'Mầm đang trả lời');};
const noInformationUi=f=>{
  for(const selector of ['.ta-privacy-open','.ta-privacy-document','.ta-ai-notice','.ta-ai-options','.ta-ai-label','.ta-ai-helper','.ta-ai-title','.ta-ai-consent'])assert.equal(f.find(selector),null);
  assert.equal(f.find('.ta-aux-view').dataset.view==='privacy',false);assert.equal(f.find('.ta-alert').hidden,true);assert.equal(f.find('.ta-alert').textContent,'');
  const interfaceText=node=>node.classList.contains('ta-message-user')?'':node._text+node.children.map(interfaceText).join('');
  assert.doesNotMatch(interfaceText(f.find('.ta-panel')),/quyền riêng tư|Google|Gemini|người xét duyệt|18 tuổi|Bật hiểu sâu|Giúp Mầm hiểu/iu);assert.deepEqual(f.alerts,[]);
  for(const node of [...f.all('button'),...f.all('a')])assert.doesNotMatch([node.textContent,node.getAttribute('aria-label'),node.getAttribute('title'),node.href].filter(Boolean).join(' '),/privacy|quyền riêng tư|thông tin\s*&/iu);
};

export {data,microtasks,clock,fakeDocument,fixture,prepared,noTyping,typing,noInformationUi};
