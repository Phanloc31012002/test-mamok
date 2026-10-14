(function(root){
  'use strict';
  // This session collects public API inputs only. It has no pricing rules,
  // visitor storage, networking, customer text history or model dependency.
  const PAPERS=Object.freeze([
    ['p05','C150'],['p06','C200'],['p07','C250'],['p08','C300'],['p09','B350'],
    ['p10','ARCOPRINT1 EXTRA WHITE 300GSM'],['p11','K02 146gsm'],['p12','old mill avorio 350gsm'],
    ['p13','Magic coma white 300gsm'],['p14','old mill premium white 350gsm'],
    ['p15','ARCOPRINT1 EXTRA WHITE 350GSM'],['p16','s16 285gsm'],
    ['p17','giấy CONQUEROR IRIDESCENT GOLDEN HAZE 250GSM'],['p18','Boheme Tradition Neve 320gsm'],
    ['p20','Astropack 350gsm']
  ].map(([id,label])=>Object.freeze({id,label})));
  const PAPER_IDS=new Set(PAPERS.map(p=>p.id));
  const ART_IDS=new Set(PAPERS.slice(5).map(p=>p.id));
  const allowedPapers=product=>['tag','voucher'].includes(product)?PAPERS.filter(p=>p.id==='p08'):PAPERS;
  const REQUEST_KEYS=Object.freeze(['paper','quantity','length','width','sides','laminate','roundCorners','micaBox']);
  const LABELS=Object.freeze({card:'Danh thiếp',tag:'Tag chữ nhật',voucher:'Voucher'});
  const fold=value=>String(value||'').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[Đđ]/g,'d').toLowerCase();
  const normalize=value=>fold(value).replace(/[^a-z0-9]+/g,' ').trim();
  const includes=(text,phrase)=>(' '+text+' ').includes(' '+normalize(phrase)+' ');
  const any=(text,phrases)=>phrases.some(phrase=>includes(text,phrase));
  const copy=value=>JSON.parse(JSON.stringify(value));
  function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
  const choices=items=>items.map(([label,query])=>({label,query}));
  const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const positiveInteger=value=>Number.isSafeInteger(value)&&value>0;
  const decimal=value=>Number(String(value).replace(',','.'));
  const displayNumber=value=>String(value).replace('.',',');
  function safeInput(value){
    if(typeof value!=='string'||!value.trim()||value.length>1000)return false;
    const text=fold(value).replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'');
    if(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)||/https?:\/\/|www\.|javascript:|data:/i.test(text))return false;
    if(/(?<![\d.,])(?:\+84|0)[\s().-]*(?:\d[\s().-]*){8,10}\b/.test(text))return false;
    if(/aiza[\w-]{15,}|\b(?:sk-|ghp_|gho_|github_pat_)[\w-]{12,}|eyj[\w-]+\.eyj[\w-]+\.[\w-]+/i.test(text))return false;
    if(/\b(?:api[ _-]?key|password|passwd|mat khau|secret|bearer|token|private[ _-]?key|cccd|cmnd|can cuoc|so tai khoan|dien thoai|phone|so dt|ten (?:toi|minh|em)|dia chi (?:nha|cua toi|cua minh)|nha toi|giao den|ship den)\b/.test(text))return false;
    if(/\b\d{1,5}(?:\/\d{1,4})?\s+(?:duong|pho|street|road|avenue|ngo|hem)\b/.test(text))return false;
    if(/\b(?:system[ _-]?(?:prompt|message)|developer[ _-]?message|jailbreak)\b|\[\/?inst\]|\[im_start\]/.test(text))return false;
    if(/\b(?:ignore|override|disregard|bo qua|thay doi|vo hieu)\b.{0,70}\b(?:instructions?|rules?|system|prompt|quy tac|huong dan|chinh sach)\b/.test(text))return false;
    return true;
  }
  function products(text){
    const result=[];
    if(any(text,['danh thiep','name card','namecard','card visit','card']))result.push('card');
    if(any(text,['tag','tag treo','the bai','nhan treo']))result.push('tag');
    if(any(text,['voucher','coupon','phieu qua tang','phieu mua hang']))result.push('voucher');
    return result;
  }
  const digital=text=>any(text,['in nhanh','kts','ky thuat so','digital']);
  const offset=text=>includes(text,'offset');
  const printingVoucher=text=>any(text,['in voucher','in coupon','in phieu qua tang','in phieu mua hang']);
  function benefits(text){return any(text,['ap dung voucher','ma giam gia','xin voucher','co voucher','xin coupon','ap dung coupon','giam gia cho','bot gia','bot tien','chiet khau','mien phi thiet ke']);}
  function isRequest(value){
    if(!safeInput(value))return false;
    const text=normalize(value),hits=products(text);
    if(!hits.length||benefits(text)&&!printingVoucher(text)||offset(text)&&!digital(text))return false;
    return digital(text)||printingVoucher(text);
  }
  function unsupported(text){
    return any(text,['be hinh','be khuon','cat khuon','die cut','diecut','hinh tron','hinh oval','hinh tam giac','ep kim','ep nhu','dap noi','khoan lo','duc lo','bam lo','lo treo','khuyen tai','bong tai']);
  }
  function paperMatches(text){
    const matches=[];
    for(const paper of PAPERS){
      const aliases=[paper.id,paper.label,paper.label.replace(/(\d+)\s*gsm/gi,'$1')];
      const weightPrefixes=/^C\d+$/.test(paper.label)?['c','couche']:paper.id==='p09'?['b','bristol','briston']:null;
      if(weightPrefixes){
        const weight=paper.label.slice(1);
        for(const prefix of weightPrefixes)for(const gap of ['',' ']){
          const name=prefix+gap+weight;aliases.push(name);
          for(const suffix of ['gsm','g','gr','g m2','gr m2'])aliases.push(name+suffix,name+' '+suffix);
        }
      }
      if(paper.id==='p10')aliases.push('arcoprint1 extra white 300','arcoprint 300');
      if(paper.id==='p15')aliases.push('arcoprint1 extra white 350','arcoprint 350');
      if(paper.id==='p11')aliases.push('k02','k 02');
      if(paper.id==='p12')aliases.push('avorio','old mill avorio');
      if(paper.id==='p14')aliases.push('old mill premium white');
      if(paper.id==='p17')aliases.push('conqueror iridescent golden haze 250gsm','conqueror iridescent golden haze 250');
      if(paper.id==='p18')aliases.push('boheme','boheme320','boheme320gsm','boheme 320 gsm','boheme 320gsm','boheme tradition','boheme tradition 320 gsm','boheme tradition 320gsm','boheme tradition neve','boheme neve','neve','neve320','neve320gsm');
      if(paper.id==='p20')aliases.push('astropack');
      if(aliases.some(alias=>includes(text,alias)))matches.push(paper.id);
    }
    return matches;
  }
  function wrongPaperDescription(text){
    const descriptions=[['k\\s*02',146],['(?:astropack|avorio)',350],['(?:boheme(?:\\s+tradition)?(?:\\s+neve)?|neve)',320]];
    for(const [brand,weight] of descriptions){
      const expression=new RegExp('\\b'+brand+'\\s*(\\d+)\\s*(gsm|g(?:r)?(?:\\s*m\\s*2)?)?\\b','g');
      for(const match of text.matchAll(expression)){
        const rest=text.slice(match.index+match[0].length).trimStart();
        // A quantity or side/dimension value following a paper name is not its
        // grammage. Explicit wrong grammage never maps via a short brand alias.
        if(!match[2]&&/^(?:cai|hop|tam|chiec|mat|cm|mm)\b/.test(rest))continue;
        if(Number(match[1])!==weight)return true;
      }
    }
    return false;
  }
  function integerToken(value){
    const token=String(value).replace(/\s/g,'');
    if(!/^\d+$/.test(token)&&!/^\d{1,3}(?:[.,]\d{3})+$/.test(token))return null;
    const number=Number(token.replace(/[.,]/g,''));
    return positiveInteger(number)?number:null;
  }
  function createSession(options={}){
    // These eligibility rules mirror the public calculator UI. They
    // determine available choices, never a price or an Excel coefficient.
    const micaEligible=Object.hasOwn(options,'micaBoxEligible')?options.micaBoxEligible:spec=>Number(spec.length)*Number(spec.width)<=48.6;
    let state;
    function fresh(){return {product:null,method:'kts',pendingField:null,slots:{},rawQuantity:null,sizeOrigin:null,pendingDimensions:null,paperGroup:null,blockedUnsupported:false,locks:{laminate:false,micaBox:false},sources:{}};}
    function reset(){state=fresh();}
    reset();
    function getState(){const {sources,...publicState}=state;return freeze(copy(publicState));}
    function summary(){
      const s=state.slots,paper=PAPERS.find(p=>p.id===s.paper);
      const parts=[state.product?LABELS[state.product]+' in KTS':null];
      if(positive(s.length)&&positive(s.width))parts.push(displayNumber(s.length)+' × '+displayNumber(s.width)+' cm');
      if(paper)parts.push(paper.label);
      if([1,2].includes(s.sides))parts.push(s.sides+' mặt');
      if(typeof s.laminate==='boolean')parts.push(s.laminate?'cán màng':'không cán màng');
      if(typeof s.roundCorners==='boolean')parts.push(s.roundCorners?'bo góc':'không bo góc');
      if(typeof s.micaBox==='boolean')parts.push(s.micaBox?'hộp mica':'không hộp mica');
      return parts.filter(Boolean).join(' · ');
    }
    function result(kind,text,extra={}){return freeze({kind,text,product:state.product,...extra});}
    function blockedReply(){return result('consultation','Dạ, yêu cầu bế hình hoặc gia công riêng vẫn cần tư vấn. Bạn chỉ chọn tính lại khi xác nhận dùng quy cách cắt thẳng ạ.',{summary:summary(),choices:choices([['Dùng quy cách cắt thẳng','Quy cách cắt thẳng']])});}
    function prompt(field,notices=[]){
      state.pendingField=field;
      let text,items=[];
      if(field==='product'){text='Dạ, bạn muốn in nhanh danh thiếp, tag chữ nhật hay voucher ạ?';items=choices([['Danh thiếp','In nhanh danh thiếp'],['Tag chữ nhật','In nhanh tag chữ nhật'],['Voucher','In voucher']]);}
      else if(field==='method'){text='Dạ, bạn chọn in nhanh KTS hay in offset ạ?';items=choices([['In nhanh KTS','In nhanh KTS'],['In offset','In offset']]);}
      else if(field==='paper'){
        const available=allowedPapers(state.product),restricted=available.length===1;
        text=restricted?'Dạ, '+LABELS[state.product].toLowerCase()+' in KTS trong luồng này dùng giấy C300. Bạn chọn C300 để tiếp tục ạ?':state.paperGroup==='art'?'Dạ, bạn chọn mã giấy mỹ thuật nào ạ?':'Dạ, bạn chọn loại giấy nào ạ?';
        items=(state.paperGroup==='art'&&!restricted?available.filter(p=>ART_IDS.has(p.id)):available).map(p=>({label:p.label,query:'Giấy '+p.id}));
      }
      else if(field==='quantity')text='Dạ, bạn cần in bao nhiêu '+(state.product==='card'?'cái hoặc hộp (1 hộp = 100 cái)':'cái')+' ạ?';
      else if(field==='size')text='Dạ, kích thước dài × rộng của '+(LABELS[state.product]||'ấn phẩm').toLowerCase()+' là bao nhiêu cm hoặc mm ạ?';
      else if(field==='sizeUnit'){text='Dạ, kích thước bạn vừa nhập dùng đơn vị cm hay mm ạ?';items=choices([['cm','cm'],['mm','mm']]);}
      else if(field==='length')text='Dạ, chiều dài là bao nhiêu cm ạ?';
      else if(field==='width')text='Dạ, chiều rộng là bao nhiêu cm ạ?';
      else if(field==='sides'){text='Dạ, bạn chọn in 1 mặt hay 2 mặt ạ?';items=choices([['1 mặt','In 1 mặt'],['2 mặt','In 2 mặt']]);}
      else if(field==='laminate'){text='Dạ, bạn có cần cán màng không ạ?';items=choices([['Có','Có cán màng'],['Không','Không cán màng']]);}
      else if(field==='roundCorners'){text='Dạ, bạn có cần bo góc không ạ?';items=choices([['Có','Có bo góc'],['Không','Không bo góc']]);}
      else if(field==='micaBox'){text='Dạ, bạn có cần hộp mica không ạ?';items=choices([['Có','Có hộp mica'],['Không','Không hộp mica']]);}
      return result('clarify',notices.concat(text).join(' '),{pendingField:field,choices:items,...(notices.length?{notices}:{}),summary:summary()});
    }
    function constrain(notices,attempts={}){
      const s=state.slots,lockLaminate=ART_IDS.has(s.paper);
      if(lockLaminate){if(attempts.laminate===true)notices.push('Giấy này không áp dụng cán màng; giữ Không.');s.laminate=false;state.sources.laminate='constraint';}
      else if(state.locks.laminate&&state.sources.laminate==='constraint'){delete s.laminate;delete state.sources.laminate;}
      state.locks.laminate=lockLaminate;
      let eligible=null;
      if(positive(s.length)&&positive(s.width)&&typeof micaEligible==='function'){try{const value=micaEligible(freeze({...s,product:state.product}));eligible=value===true?true:value===false?false:null;}catch(_){eligible=null;}}
      const lockMica=eligible===false;
      if(lockMica){if(attempts.micaBox===true)notices.push('Khổ này không áp dụng hộp mica; giữ Không.');s.micaBox=false;state.sources.micaBox='constraint';}
      else if(state.locks.micaBox&&state.sources.micaBox==='constraint'){delete s.micaBox;delete state.sources.micaBox;}
      state.locks.micaBox=lockMica;
    }
    function nextField(){
      const s=state.slots;
      if(!state.product)return 'product';
      if(state.method!=='kts')return 'method';
      if(!allowedPapers(state.product).some(p=>p.id===s.paper))return 'paper';
      if(!positiveInteger(s.quantity))return 'quantity';
      if(state.pendingDimensions)return 'sizeUnit';
      if(!positive(s.length)&&!positive(s.width))return 'size';
      if(!positive(s.length))return 'length';
      if(!positive(s.width))return 'width';
      if(![1,2].includes(s.sides))return 'sides';
      for(const key of ['laminate','roundCorners','micaBox'])if(typeof s[key]!=='boolean')return key;
      return null;
    }
    function switchProduct(product){
      if(state.product===product)return false;
      const previous=state,retained={};
      for(const field of ['paper','sides','laminate','roundCorners'])if(previous.sources[field]==='user')retained[field]=previous.slots[field];
      if(!allowedPapers(product).some(p=>p.id===retained.paper))delete retained.paper;
      const quantity=previous.rawQuantity?.unit==='piece'?{...previous.rawQuantity}:null;
      state=fresh();state.product=product;state.slots=retained;
      Object.keys(retained).forEach(field=>{state.sources[field]='user';});
      if(quantity){state.rawQuantity=quantity;state.slots.quantity=quantity.value;state.sources.quantity='user';}
      if(product==='card'){state.slots.length=9;state.slots.width=5.4;state.sizeOrigin='default';}
      return true;
    }
    function setQuantity(value,unit){
      const quantity=unit==='box'?value*100:value;
      if(!positiveInteger(value)||!positiveInteger(quantity)||unit==='box'&&state.product!=='card')return false;
      state.rawQuantity={value,unit};state.slots.quantity=quantity;state.sources.quantity='user';return true;
    }
    function answer(value){
      if(!safeInput(value))return result('consultation','Dạ, bạn chỉ nhập loại ấn phẩm và quy cách in, tránh thông tin cá nhân hoặc bí mật ạ.',{safetyBlocked:true});
      const raw=value.trim(),text=normalize(raw),numberText=fold(raw).replace(/×/g,'x');
      const hits=products(text),before=state.pendingField;
      if(offset(text)&&!digital(text))return result('kts-exit','Dạ, yêu cầu in offset dùng luồng báo giá riêng ạ.',{method:'offset',product:hits.length===1?hits[0]:state.product,rawQuantity:state.rawQuantity?copy(state.rawQuantity):null});
      if(unsupported(text)){state.blockedUnsupported=true;return result('consultation','Dạ, bế hình hoặc gia công này cần tư vấn riêng; Mầm không dùng giá cắt thẳng để thay thế ạ.');}
      if(benefits(text)&&!printingVoucher(text))return result('consultation','Dạ, ưu đãi hoặc giảm giá cần tư vấn viên xác nhận riêng ạ.');
      const rejectedStraightMention=any(text,['khong cat thang','khong phai tag chu nhat','khong tag chu nhat','cat thang la gi','tag chu nhat la gi']);
      if(state.blockedUnsupported&&rejectedStraightMention)return blockedReply();
      if(hits.length>1){reset();return prompt('product');}
      let changed=hits.length===1?switchProduct(hits[0]):false;
      if(offset(text)&&digital(text)){state.method=null;return prompt('method');}
      if(digital(text)){state.method='kts';changed=true;}
      const straightConfirmed=any(text,['cat thang','tag chu nhat','tag hinh chu nhat','tag vuong'])&&!rejectedStraightMention;
      if(state.blockedUnsupported&&straightConfirmed){state.blockedUnsupported=false;changed=true;}
      if(!state.product)return prompt('product');
      const s=state.slots,notices=[],errors=[];
      const error=field=>{if(!errors.includes(field))errors.push(field);};
      const papers=paperMatches(text);
      const paperConsultation=/\bp19\b|\bbiancon(?:\d+(?:gsm|g(?:r)?(?:\s*m\s*2)?)?)?\b/.test(text);
      const unknownPaperName=/\b(?:kraft|fort|ivory)(?:\d+(?:gsm|g(?:r)?(?:\s*m\s*2)?)?)?\b/.test(text)||includes(text,'giay nhua')||/\b(?:boheme|neve)[a-z0-9]*\b/.test(text)&&!papers.includes('p18');
      const unknownId=[...text.matchAll(/\bp\d{2}\b/g)].some(match=>!PAPER_IDS.has(match[0]));
      const unknownWeight=[...text.matchAll(/\b(c|couche|briston|bristol|b)\s*(\d+)(?:\s*(?:gsm|g(?:r)?(?:\s*m\s*2)?))?\b/g)].some(match=>['c','couche'].includes(match[1])?![150,200,250,300].includes(Number(match[2])):Number(match[2])!==350);
      if(paperConsultation||unknownPaperName||papers.length>1||unknownId||unknownWeight||wrongPaperDescription(text)){delete s.paper;delete state.sources.paper;state.paperGroup=null;error('paper');changed=true;}
      else if(papers.length===1){
        if(allowedPapers(state.product).some(p=>p.id===papers[0])){s.paper=papers[0];state.sources.paper='user';}
        else{delete s.paper;delete state.sources.paper;error('paper');}
        state.paperGroup=null;changed=true;
      }
      else if(any(text,['giay my thuat','loai my thuat'])){delete s.paper;state.paperGroup='art';error('paper');changed=true;}
      else if(/\bp\d{2}\b|\b(?:c|couche|briston|bristol|b)\s*\d+\b|\b(?:k02|astropack|avorio|boheme|neve)[a-z0-9]*\b/.test(text)||any(text,['giay fort','giay kraft','giay ivory','giay nhua','boheme','neve','arcoprint','old mill','magic coma','conqueror','s16'])){delete s.paper;state.paperGroup=null;error('paper');changed=true;}
      const quantityMatches=[...numberText.matchAll(/\b(\d[\d.,]*)\s*(hop|cai|tam|chiec|card|tag|voucher|pcs|pieces)\b/g)];
      const amounts=[];
      for(const match of quantityMatches){
        const number=integerToken(match[1]),unit=match[2]==='hop'?'box':'piece';
        const after=numberText.slice(match.index+match[0].length),prefix=numberText.slice(Math.max(0,match.index-20),match.index);
        const composition=unit==='piece'&&( /^\s*(?:(?:moi|tren|mot|1)\s+)?hop\b/.test(after)||/moi\s+hop\s*$/.test(prefix));
        if(composition){if(state.product!=='card'||number!==100)return result('consultation','Dạ, quy đổi danh thiếp của luồng KTS là 1 hộp = 100 cái; quy cách đóng hộp khác cần tư vấn riêng ạ.');continue;}
        amounts.push({value:number,unit});
      }
      const sharedQuantity=numberText.match(/\b(\d[\d.,]*)\s*(?:hay|hoac|den|toi|va)\s*(\d[\d.,]*)\s*(hop|cai|tam|chiec|card|tag|voucher)\b/);
      const quantityExpression=/\d\s*[+*/=]\s*\d|(?:^|\s)-\s*\d+(?:[.,]\d+)?\s*(?:hop|cai|tam|chiec|card|tag|voucher)\b/.test(numberText);
      if(sharedQuantity||quantityExpression||amounts.some(item=>item.value===null)||new Set(amounts.map(item=>item.value+':'+item.unit)).size>1){delete s.quantity;state.rawQuantity=null;error('quantity');changed=true;}
      else if(amounts.length){if(!setQuantity(amounts[0].value,amounts[0].unit)){delete s.quantity;state.rawQuantity=null;error('quantity');}changed=true;}
      else if(before==='quantity'&&/^[\d.,\s]+$/.test(raw)){if(!setQuantity(integerToken(raw),'piece')){delete s.quantity;state.rawQuantity=null;error('quantity');}changed=true;}
      const dimensionMatches=[...numberText.matchAll(/(-?\d+(?:[.,]\d+)?)\s*(cm|mm)?\s*x\s*(-?\d+(?:[.,]\d+)?)\s*(cm|mm)?\b/g)];
      const customSize=any(text,['kho rieng','kich thuoc rieng','kich thuoc khac','kho khac','kho tuy chinh','kich thuoc tuy chinh','ngoai kho','custom']);
      if(customSize&&!dimensionMatches.length){delete s.length;delete s.width;state.pendingDimensions=null;state.sizeOrigin='explicit';changed=true;}
      if(dimensionMatches.length){
        const parsed=dimensionMatches.map(match=>{const unitA=match[2]||match[4],unitB=match[4]||match[2];return {length:decimal(match[1]),width:decimal(match[3]),unitA,unitB};});
        if(parsed.some(dim=>!positive(dim.length)||!positive(dim.width))||new Set(parsed.map(dim=>JSON.stringify(dim))).size>1){delete s.length;delete s.width;state.pendingDimensions=null;error('size');}
        else{const dim=parsed[0];state.sizeOrigin='explicit';if(!dim.unitA){delete s.length;delete s.width;state.pendingDimensions={length:dim.length,width:dim.width};}else{s.length=dim.length/(dim.unitA==='mm'?10:1);s.width=dim.width/(dim.unitB==='mm'?10:1);state.pendingDimensions=null;}}
        changed=true;
      }else{
        const named=[...numberText.matchAll(/\b(?:chieu\s+)?(dai|rong|length|width)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(cm|mm)\b/g)];
        for(const field of ['length','width']){
          const found=named.filter(match=>(['dai','length'].includes(match[1])?'length':'width')===field).map(match=>decimal(match[2])/(match[3]==='mm'?10:1));
          if(!found.length)continue;
          if(found.some(number=>!positive(number))||new Set(found).size>1){delete s[field];error(field);}else s[field]=found[0];
          state.sizeOrigin='explicit';state.pendingDimensions=null;changed=true;
        }
        if(state.pendingDimensions&&/^(?:cm|mm)$/.test(text)){const divisor=text==='mm'?10:1;s.length=state.pendingDimensions.length/divisor;s.width=state.pendingDimensions.width/divisor;state.pendingDimensions=null;state.sizeOrigin='explicit';changed=true;}
        else if(['length','width'].includes(before)&&/^\d+(?:[.,]\d+)?\s*(?:cm|mm)?$/.test(numberText)){const unit=numberText.match(/(?:cm|mm)$/)?.[0]||'cm',number=decimal(numberText.replace(/\s*(?:cm|mm)$/,''))/(unit==='mm'?10:1);if(positive(number))s[before]=number;else{delete s[before];error(before);}state.sizeOrigin='explicit';changed=true;}
      }
      const sideMatches=[...text.matchAll(/\b(\d+|mot|hai)\s*mat\b/g)].map(match=>({mot:1,hai:2}[match[1]]||Number(match[1])));
      if(/\b(?:1|mot)\s*(?:hay|hoac|va)\s*(?:2|hai)\s*mat\b/.test(text))sideMatches.push(1,2);
      if(sideMatches.some(side=>![1,2].includes(side))||new Set(sideMatches).size>1){delete s.sides;error('sides');changed=true;}
      else if(sideMatches.length){s.sides=sideMatches[0];state.sources.sides='user';changed=true;}
      else if(before==='sides'&&/^[12]$/.test(text)){s.sides=Number(text);state.sources.sides='user';changed=true;}
      const booleanPatterns={
        laminate:{no:/\bkhong\s+(?:(?:co|can|phu)\s+)?(?:can\s+)?mang\b/g,yes:/\b(?:can|phu)\s+mang\b/g},
        roundCorners:{no:/\bkhong\s+(?:(?:co|can|muon)\s+)?bo\s+goc\b|\bgoc\s+vuong\b/g,yes:/\bbo\s+goc\b|\bgoc\s+tron\b/g},
        micaBox:{no:/\bkhong\s+(?:(?:co|dung)\s+)?(?:hop\s+)?mica\b/g,yes:/\b(?:hop\s+)?mica\b/g}
      };
      const attempts={};
      for(const [field,patterns] of Object.entries(booleanPatterns)){
        const no=patterns.no.test(text),withoutNo=text.replace(new RegExp(patterns.no.source,'g'),' '),yes=patterns.yes.test(withoutNo);
        if(no&&yes){delete s[field];delete state.sources[field];error(field);changed=true;}
        else if(no||yes){attempts[field]=yes;s[field]=yes;state.sources[field]='user';changed=true;}
      }
      if(['laminate','roundCorners','micaBox'].includes(before)&&/^(?:co|khong|yes|no)(?: a| nhe)?$/.test(text)){const yes=/^(?:co|yes)/.test(text);attempts[before]=yes;s[before]=yes;state.sources[before]='user';changed=true;}
      constrain(notices,attempts);
      // An unsupported requirement remains part of the order across later
      // quantity/price turns. Never silently restore the prior rectangle quote.
      if(state.blockedUnsupported)return blockedReply();
      if(paperConsultation)return result('consultation','Dạ, giấy Biancon cần tư vấn riêng để xác nhận mức giá và quy cách ạ.',{summary:summary()});
      const forced=errors.find(field=>!state.locks[field]);
      if(forced)return prompt(forced,notices);
      const field=nextField();if(field)return prompt(field,notices);
      state.pendingField=null;
      const calculate=any(text,['tinh gia','bao gia','tinh tong','tong tien','tinh lai','gia bao nhieu','bao nhieu tien']);
      if(!changed&&!calculate)return result('clarify','Dạ, Mầm đang giữ quy cách này. Bạn muốn đổi quy cách hay tính giá ạ?',{pendingField:null,summary:summary(),choices:choices([['Tính giá','Tính giá KTS']])});
      const spec=Object.fromEntries(REQUEST_KEYS.map(key=>[key,s[key]]));
      return result('kts-request','Dạ, Mầm đã nhận đủ quy cách để tính giá ạ.',{spec,summary:summary(),...(notices.length?{notices}:{} )});
    }
    return Object.freeze({answer,getState,reset});
  }
  root.ThanhAnKts=Object.freeze({papers:PAPERS,isRequest,createSession});
})(typeof window!=='undefined'?window:globalThis);
