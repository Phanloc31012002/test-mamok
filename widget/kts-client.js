(function(root){
  'use strict';
  const KEYS=Object.freeze(['paper','quantity','length','width','sides','laminate','roundCorners','micaBox']);
  const PAPERS=Object.freeze([
    ['p05','C150'],['p06','C200'],['p07','C250'],['p08','C300'],['p09','B350'],
    ['p10','ARCOPRINT1 EXTRA WHITE 300GSM'],['p11','K02 146gsm'],['p12','old mill avorio 350gsm'],
    ['p13','Magic coma white 300gsm'],['p14','old mill premium white 350gsm'],
    ['p15','ARCOPRINT1 EXTRA WHITE 350GSM'],['p16','s16 285gsm'],
    ['p17','giấy CONQUEROR IRIDESCENT GOLDEN HAZE 250GSM'],['p18','Boheme Tradition Neve 320gsm'],
    ['p20','Astropack 350gsm']
  ].map(([id,label])=>Object.freeze({id,label})));
  const LABELS=new Map(PAPERS.map(paper=>[paper.id,paper.label]));
  const MAX_BYTES=16384,TIMEOUT_MS=7000;
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
  const fallback=reason=>Object.freeze({version:1,kind:'fallback',reason});
  const cancel=body=>{try{Promise.resolve(body?.cancel()).catch(()=>{});}catch(_){}};
  function validateSpec(value){
    try{
      if(!exact(value,KEYS)||!LABELS.has(value.paper)||!Number.isSafeInteger(value.quantity)||value.quantity<=0||!Number.isFinite(value.length)||value.length<=0||!Number.isFinite(value.width)||value.width<=0||![1,2].includes(value.sides)||!['laminate','roundCorners','micaBox'].every(key=>typeof value[key]==='boolean'))return null;
      return Object.freeze(Object.fromEntries(KEYS.map(key=>[key,value[key]])));
    }catch(_){return null;}
  }
  function validateQuote(value,spec){
    if(!exact(value,['version','kind','total','currency','spec'])||value.version!==1||value.kind!=='quote'||typeof value.total!=='string'||!/^\d+$/.test(value.total)||value.total.length>256||value.currency!=='VND'||!exact(value.spec,[...KEYS,'paperLabel'])||!KEYS.every(key=>value.spec[key]===spec[key])||value.spec.paperLabel!==LABELS.get(spec.paper))return null;
    return Object.freeze({version:1,kind:'quote',total:value.total,currency:'VND',spec:Object.freeze({...spec,paperLabel:value.spec.paperLabel})});
  }
  function validateFallback(value){
    return exact(value,['version','kind','reason'])&&value.version===1&&value.kind==='fallback'&&['consultation','invalid','busy','unavailable','configuration'].includes(value.reason)?fallback(value.reason):null;
  }
  // A fractional wire number can round to the requested integer in JSON.parse.
  // Scan the structure first, retaining only the unique direct quantity token.
  function exactResponseQuantity(text,quantity){
    const token=/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
    let position=0,specs=0,quantities=0,nodes=0;
    const whitespace=()=>{while(/[ \t\r\n]/.test(text[position]||'\u0000'))position++;};
    const next=()=>{token.lastIndex=position;const match=token.exec(text);if(!match)throw Error('Invalid JSON token');position=token.lastIndex;return match[0];};
    function value(scope,depth){
      if(depth>32||++nodes>2048)throw Error('JSON structure too large');whitespace();
      const opening=text[position];
      if(scope==='spec'&&opening!=='{')throw Error('Specification must be an object');
      if(opening==='{'||opening==='['){
        position++;whitespace();const closing=opening==='{'?'}':']';
        if(text[position]===closing){position++;return;}
        for(;;){
          let key=null,child='other';
          if(opening==='{'){
            whitespace();key=JSON.parse(next());if(typeof key!=='string')throw Error('Invalid JSON key');
            whitespace();if(text[position++]!==':')throw Error('Missing JSON separator');
            if(scope==='root'&&key==='spec'){if(++specs!==1)throw Error('Duplicate specification');child='spec';}
          }
          whitespace();const start=position;value(child,depth+1);
          if(scope==='spec'&&key==='quantity'){
            if(++quantities!==1||text.slice(start,position)!==String(quantity))throw Error('Inexact quantity echo');
          }
          whitespace();const separator=text[position++];if(separator===closing)return;if(separator!==',')throw Error('Invalid JSON structure');
        }
      }
      next();
    }
    try{
      whitespace();if(text[position]!=='{')return false;value('root',0);whitespace();
      // Exact typed fallbacks contain no spec and remain available for validation.
      return position===text.length&&(specs===0||specs===1&&quantities===1);
    }catch(_){return false;}
  }
  async function read(response,signal,spec){
    if(!/^application\/json(?:\s*;.*)?$/i.test(response.headers?.get('content-type')||'')){cancel(response.body);return null;}
    const size=response.headers.get('content-length');
    if(size!==null&&(!/^\d{1,10}$/.test(size)||Number(size)>MAX_BYTES)){cancel(response.body);return null;}
    if(!response.body?.getReader)return null;
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,chunks=0,text='';
    const stop=()=>{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch(_){}};signal.addEventListener('abort',stop,{once:true});
    try{
      for(;;){
        if(signal.aborted)return null;const part=await reader.read();
        if(part.done){text+=decoder.decode();break;}
        if(!(part.value instanceof Uint8Array)||++chunks>256||(bytes+=part.value.byteLength)>MAX_BYTES){stop();return null;}
        text+=decoder.decode(part.value,{stream:true});
      }
      if(signal.aborted||spec&&!exactResponseQuantity(text,spec.quantity))return null;return JSON.parse(text);
    }catch(_){stop();return null;}
    finally{signal.removeEventListener('abort',stop);try{reader.releaseLock();}catch(_){}}
  }
  function create(options={}){
    let endpoint;
    try{
      if(typeof options.endpoint!=='string'||!options.endpoint.trim())throw Error();endpoint=new URL(options.endpoint,root.location.href);
      if(endpoint.origin!==root.location.origin||!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error();
    }catch(_){throw Error('KTS endpoint must be same-origin');}
    const request=options.fetchImpl||root.fetch?.bind(root);
    if(typeof request!=='function')throw Error('KTS fetch is unavailable');
    let enabled=false,checked=false,destroyed=false,serial=0,active=null,checking=null,metadata=null,lastFailure='unavailable';
    function abort(){serial++;if(active)active.abort();active=null;}
    async function transport(method,spec){
      const id=serial,controller=new AbortController();if(method==='GET')checking=controller;else active=controller;let stop;
      const boundary=new Promise(resolve=>{stop=()=>resolve(null);});controller.signal.addEventListener('abort',stop,{once:true});
      const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
      try{
        const operation=(async()=>{
          const init={method,headers:method==='GET'?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json'},signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error'};
          if(method==='POST')init.body=JSON.stringify(spec);
          const response=await request(endpoint.href,init);
          if(controller.signal.aborted||response?.redirected||response?.url!==endpoint.href){cancel(response?.body);return fallback('unavailable');}
          if(response.status!==200){cancel(response.body);return fallback({400:'invalid',403:'configuration',422:'consultation',429:'busy',503:'unavailable'}[response.status]||'unavailable');}
          return (await read(response,controller.signal,spec))??fallback('unavailable');
        })().catch(()=>fallback('unavailable'));
        const value=await Promise.race([operation,boundary]);
        return destroyed||controller.signal.aborted||method==='POST'&&id!==serial?null:value;
      }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);if(active===controller)active=null;if(checking===controller)checking=null;}
    }
    function check({retry=false}={}){
      if(destroyed)return Promise.resolve(false);if(metadata)return metadata;if(checked&&(enabled||!retry))return Promise.resolve(enabled);
      metadata=transport('GET').then(value=>{if(destroyed)return false;checked=true;enabled=exact(value,['version','enabled'])&&value.version===1&&value.enabled===true;lastFailure=value?.reason==='configuration'?'configuration':'unavailable';return enabled;}).finally(()=>{metadata=null;});return metadata;
    }
    async function quote(value){
      if(destroyed)return null;
      const spec=validateSpec(value);if(!spec)return fallback('invalid');
      if(!enabled)return fallback(lastFailure);if(active)return fallback('busy');
      const result=await transport('POST',spec);if(result===null)return null;
      return validateQuote(result,spec)||validateFallback(result)||fallback('unavailable');
    }
    return Object.freeze({check,quote,abort,getFailure:()=>lastFailure,destroy(){if(destroyed)return;destroyed=true;enabled=false;abort();if(checking)checking.abort();},getState:()=>({enabled,checked,destroyed,pending:!!active})});
  }
  root.ThanhAnKtsQuote=Object.freeze({create,papers:PAPERS,validateSpec});
})(typeof window!=='undefined'?window:globalThis);
