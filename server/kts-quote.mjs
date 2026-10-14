// Public specifications only. Pricing stays at the pinned server endpoint;
// this proxy never contains a workbook, formula, coefficient or credential.
export const KTS_UPSTREAM_URL='https://invinhphat.com/wp-json/vp-quickquote/v1/quote';
export const KTS_SPEC_KEYS=Object.freeze(['paper','quantity','length','width','sides','laminate','roundCorners','micaBox']);
export const KTS_PAPERS=Object.freeze([
  ['p05','C150'],['p06','C200'],['p07','C250'],['p08','C300'],['p09','B350'],
  ['p10','ARCOPRINT1 EXTRA WHITE 300GSM'],['p11','K02 146gsm'],['p12','old mill avorio 350gsm'],
  ['p13','Magic coma white 300gsm'],['p14','old mill premium white 350gsm'],
  ['p15','ARCOPRINT1 EXTRA WHITE 350GSM'],['p16','s16 285gsm'],
  ['p17','giấy CONQUEROR IRIDESCENT GOLDEN HAZE 250GSM'],['p18','Boheme Tradition Neve 320gsm'],
  ['p20','Astropack 350gsm']
].map(([id,label])=>Object.freeze({id,label})));
export const KTS_LIMITS=Object.freeze({requestBytes:4096,responseBytes:16384,chunks:256,timeoutMs:5000,totalCharacters:256});
const PAPER_LABELS=new Map(KTS_PAPERS.map(paper=>[paper.id,paper.label]));
const DEFAULT_ORIGIN='https://test-mam.vercel.app';
const HEADERS=Object.freeze({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{...HEADERS,...headers}});
const fallback=(reason='unavailable',status=503)=>json({version:1,kind:'fallback',reason},status,status===429?{'Retry-After':'60'}:{});
const cancel=body=>{try{Promise.resolve(body?.cancel()).catch(()=>{});}catch{}};

export function validateKtsSpec(value){
  try{
    if(!exact(value,KTS_SPEC_KEYS)||!PAPER_LABELS.has(value.paper)||!Number.isSafeInteger(value.quantity)||value.quantity<=0||!Number.isFinite(value.length)||value.length<=0||!Number.isFinite(value.width)||value.width<=0||![1,2].includes(value.sides)||!['laminate','roundCorners','micaBox'].every(key=>typeof value[key]==='boolean'))return null;
    return Object.freeze(Object.fromEntries(KTS_SPEC_KEYS.map(key=>[key,value[key]])));
  }catch{return null;}
}

// The request consists only of primitive fields. Inspect their original JSON
// tokens too: JSON.parse alone can round a fractional quantity into a safe int.
function parseRequest(text){
  const value=JSON.parse(text),spec=validateKtsSpec(value);
  if(!spec)throw Error('Invalid public specification');
  const token=/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  let position=0;const seen=new Set();
  const whitespace=()=>{while(/[ \t\r\n]/.test(text[position]||'\u0000'))position++;};
  const next=()=>{token.lastIndex=position;const match=token.exec(text);if(!match)throw Error('Invalid JSON token');position=token.lastIndex;return match[0];};
  whitespace();if(text[position++]!=='{')throw Error('Invalid JSON object');
  for(let index=0;index<KTS_SPEC_KEYS.length;index++){
    whitespace();const key=JSON.parse(next());
    if(typeof key!=='string'||!KTS_SPEC_KEYS.includes(key)||seen.has(key))throw Error('Unexpected or duplicate field');seen.add(key);
    whitespace();if(text[position++]!==':')throw Error('Missing JSON separator');whitespace();const raw=next();
    if(key==='quantity'&&!/^[1-9]\d*$/.test(raw))throw Error('Quantity must be an exact integer token');
    whitespace();if(text[position++]!==(index===KTS_SPEC_KEYS.length-1?'}':','))throw Error('Unexpected JSON fields');
  }
  whitespace();if(position!==text.length)throw Error('Trailing JSON');return spec;
}

// Inspect the wire token before parsing numbers. Only a unique direct
// spec.quantity can prove an exact integer echo; nested/string decoys cannot.
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
  try{whitespace();if(text[position]!=='{')return false;value('root',0);whitespace();return position===text.length&&specs===1&&quantities===1;}
  catch{return false;}
}

function usableLength(headers,maximum){
  const size=headers.get('content-length');
  return size===null||/^\d{1,10}$/.test(size)&&Number(size)<=maximum;
}
async function readText(body,signal,maximum){
  if(!body?.getReader)throw Error('Missing body');
  const reader=body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,chunks=0,text='';
  const stop=()=>{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}};
  signal.addEventListener('abort',stop,{once:true});
  try{
    for(;;){
      if(signal.aborted)throw Error('Aborted');const part=await reader.read();
      if(part.done){text+=decoder.decode();break;}
      if(!(part.value instanceof Uint8Array)||++chunks>KTS_LIMITS.chunks||(bytes+=part.value.byteLength)>maximum)throw Error('Oversized body');
      text+=decoder.decode(part.value,{stream:true});
    }
    if(signal.aborted)throw Error('Aborted');return text;
  }catch(error){stop();throw error;}
  finally{signal.removeEventListener('abort',stop);try{reader.releaseLock();}catch{}}
}
async function deadline(request,action,timers){
  const controller=new AbortController();let timer,stop;
  const boundary=new Promise((_,reject)=>{stop=()=>{controller.abort();reject(Error('Aborted'));};timer=timers.setTimeout(stop,KTS_LIMITS.timeoutMs);});
  request.signal.addEventListener('abort',stop,{once:true});
  if(request.signal.aborted)stop();
  try{return await Promise.race([Promise.resolve().then(()=>action(controller.signal)),boundary]);}
  finally{timers.clearTimeout(timer);request.signal.removeEventListener('abort',stop);}
}
function appOrigin(env){
  const value=env.APP_ORIGIN||DEFAULT_ORIGIN;
  try{const url=new URL(value);if(typeof value!=='string'||value.length>250||value.includes('*')||url.protocol!=='https:'||url.origin!==value||url.username||url.password)return null;}
  catch{return null;}
  if(env.VERCEL_ENV==='preview'&&(env.APP_ALLOW_PREVIEW!=='true'||!env.APP_ORIGIN))return null;
  return value;
}
const defaultEnv=()=>({APP_ORIGIN:process.env.APP_ORIGIN,VERCEL_ENV:process.env.VERCEL_ENV,APP_ALLOW_PREVIEW:process.env.APP_ALLOW_PREVIEW});
function quoteResult(value,spec){
  if(!object(value)||typeof value.total!=='string'||!/^\d+$/.test(value.total)||value.total.length>KTS_LIMITS.totalCharacters||value.currency!=='VND'||!object(value.spec)||!KTS_SPEC_KEYS.every(key=>Object.hasOwn(value.spec,key)&&value.spec[key]===spec[key])||value.spec.paperLabel!==PAPER_LABELS.get(spec.paper))return null;
  // Unexpected upstream properties never cross this boundary.
  return {version:1,kind:'quote',total:value.total,currency:'VND',spec:{...spec,paperLabel:value.spec.paperLabel}};
}

export function createKtsQuoteHandler({env=defaultEnv,fetchImpl=globalThis.fetch,timers={setTimeout,clearTimeout}}={}){
  return async function handle(request){
    try{
      const method=request.method;
      if(!['GET','POST'].includes(method))return json({version:1,kind:'fallback',reason:'invalid'},405,{Allow:'GET, POST'});
      const configuration=typeof env==='function'?env():env,origin=appOrigin(configuration),url=new URL(request.url),received=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
      if(!origin||url.origin!==origin||site&&!['same-origin','none'].includes(site)||(method==='POST'?received!==origin:received&&received!==origin))return fallback('unavailable',403);
      if(url.pathname!=='/api/mam-quote'||url.search||url.hash||url.href.length>500)return fallback('invalid',400);
      if(typeof fetchImpl!=='function')return fallback();
      if(method==='GET')return json({version:1,enabled:true});
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return fallback('invalid',415);
      if(!usableLength(request.headers,KTS_LIMITS.requestBytes)){cancel(request.body);return fallback('invalid',413);}
      return await deadline(request,async signal=>{
        let spec;
        try{spec=parseRequest(await readText(request.body,signal,KTS_LIMITS.requestBytes));}
        catch{if(signal.aborted)return fallback();return fallback('invalid',400);}
        if(signal.aborted)return fallback();
        const response=await fetchImpl(KTS_UPSTREAM_URL,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(spec),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal});
        if(signal.aborted||response.redirected||response.url!==KTS_UPSTREAM_URL){cancel(response.body);return fallback();}
        if(response.status!==200){
          cancel(response.body);
          const reason={400:'invalid',422:'consultation',429:'busy',503:'unavailable'}[response.status];
          return reason?fallback(reason,response.status):fallback();
        }
        if(!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type')||'')||!usableLength(response.headers,KTS_LIMITS.responseBytes)){cancel(response.body);return fallback();}
        const text=await readText(response.body,signal,KTS_LIMITS.responseBytes);
        if(!exactResponseQuantity(text,spec.quantity))return fallback();
        const value=JSON.parse(text);
        if(signal.aborted)return fallback();
        const result=quoteResult(value,spec);return result?json(result):fallback();
      },timers);
    }catch{return fallback();}
  };
}
