(function(){
  'use strict';
  const data=JSON.parse(document.getElementById('message-data').textContent);
  const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const banks={all:'전체 메뉴',v1:'영상 1 · 알림 테스트',v2:'영상 2 · 원형 안내',lanes:'영상 3 · 차로 설정'};
  const colors={white:'#dcebf5',gray:'#758698',yellow:'#f6d34d',orange:'#ffac39',red:'#ff4c54',green:'#83ee39',cyan:'#57dcf6',blue:'#5ba1ff',none:'transparent'};
  const ctx=document.createElement('canvas').getContext('2d');
  let selected=(data.find(m=>m.kind==='message'&&m.bank==='v1')||data[0]).id;
  let bank='all',query='',category='all',includeEmpty=true,timer=null,toastTimer=null;
  let canPreview=null;
  let currentNumber=null,zoom=false,motion=false;
  const current=()=>data.find(m=>m.id===selected)||null;
  const time=t=>Number.isFinite(t)?String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0'):'시각 미확인';
  const color=c=>colors[c]||c||colors.white;
  // 첨부 사진의 1번 장면에 함께 보인 표지이며 시험 값의 기능 정의가 아닙니다.
  const visual=m=>m?.visualByCode?.[String(currentNumber??m.codes?.[0])]||(m?.id==='v1-message-1'?{secondarySign:'camera'}:{});
  const surfaceName=m=>m.kind==='camera'?'측방 카메라':m.kind==='navigation'?'기본 화면':m.surface==='right'?'오른쪽 원형':m.surface==='road'?'차로 그래픽':'중앙 배너';
  const shortBank=m=>m.bank==='v1'?'영상 1':m.bank==='v2'?'영상 2':'차로 설정';
  const isEmpty=m=>m.kind==='navigation';
  function matches(m){
    if(bank!=='all'&&m.bank!==bank)return false;
    if(category!=='all'&&m.category!==category)return false;
    if(!includeEmpty&&isEmpty(m))return false;
    if(!query)return true;
    const q=query.toLowerCase().replace(/\s+/g,'');
    const full=[m.code,m.text,m.category,m.source,m.menu,m.value,(m.tags||[]).join(' ')].join(' ').toLowerCase().replace(/\s+/g,'');
    return full.includes(q)||(/^\d+$/.test(q)&&(m.codes||[]).includes(Number(q)));
  }
  const filtered=()=>data.filter(matches);
  function breakLines(text,width,size){
    ctx.font='400 '+size+'px '+getComputedStyle($('cluster-svg')).fontFamily;
    const lines=[];let line='';
    String(text).split(/\s+/).forEach(word=>{
      const trial=line?line+' '+word:word;
      if(ctx.measureText(trial).width<=width){line=trial;return;}
      if(line){lines.push(line);line='';}
      if(ctx.measureText(word).width<=width){line=word;return;}
      Array.from(word).forEach(ch=>{if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line=ch;}else line+=ch;});
    });if(line)lines.push(line);return lines;
  }
  function fitText(text,width,maxHeight,size){
    let lines=breakLines(text,width,size);
    while(size>12&&lines.length*(size+6)>maxHeight){size--;lines=breakLines(text,width,size);}
    return {lines,size,step:size+6};
  }
  function svgText(node,lines,x,y,step,size){
    node.replaceChildren();node.setAttribute('font-size',size);
    lines.forEach((line,i)=>{const s=document.createElementNS(NS,'tspan');s.setAttribute('x',x);s.setAttribute('y',y+i*step);s.textContent=line;node.appendChild(s);});
  }
  function show(id,yes){$(id).style.display=yes?'':'none';}
  function updateView(){
    const m=current(),v=visual(m),right=canPreview?.graphic?!!canPreview.right&&!canPreview.center:m&&(m.surface==='right'||m.kind==='navigation'&&v.cameraRight),road=!canPreview&&m&&m.surface==='road';
    $('cluster-wrap').classList.toggle('focused',zoom);$('cluster-wrap').classList.toggle('focus-right',!!right);
    $('cluster-wrap').classList.toggle('focus-road',!!road);
    $('cluster-svg').setAttribute('viewBox',zoom?(right?'825 55 340 350':road?'425 185 390 265':'415 35 410 405'):'0 0 1200 450');
    $('focus-btn').setAttribute('aria-pressed',String(zoom));$('focus-btn').querySelector('span').textContent=zoom?'전체 보기':'표시 확대';
    $('zoom-caption').textContent=zoom?(road?'차로 영역 확대':'알림 영역 확대'):'전체 계기판';
  }
  function roadStyle(graphic){
    const g=graphic||{};
    for(const side of ['left','right']){
      const spec=g[side]||{color:side==='left'?'#f9bc72':'#63ff87',style:'solid'};
      const line=$('lane-'+side),double=$('lane-'+side+'-double');
      let top=side==='left'?583:614,bottom=side==='left'?485:728;
      if(side==='right'&&Number.isFinite(g.rightOffsetNormalized)){top=599+27*g.rightOffsetNormalized;bottom=596+190*g.rightOffsetNormalized;}
      line.setAttribute('d','M'+top+' 230 '+bottom+' 449');double.setAttribute('d','M'+(top+(side==='left'?-6:6))+' 230 '+(bottom+(side==='left'?-13:13))+' 449');
      const style=spec.style||'solid',stroke=color(spec.color||'white');
      line.setAttribute('stroke',stroke);line.setAttribute('opacity',style==='none'?'0':String(spec.opacity??.9));
      line.setAttribute('stroke-dasharray',style.includes('dash')?'42 26':'none');
      line.setAttribute('stroke-width',String(spec.width||4));
      double.setAttribute('stroke',stroke);double.setAttribute('stroke-dasharray',style==='double-dashed'?'42 26':'none');
      show('lane-'+side+'-double',style.startsWith('double'));
      const fill=g[side+'Fill'];$('lane-'+side+'-fill').setAttribute('fill',color(typeof fill==='string'?fill:'green'));show('lane-'+side+'-fill',!!fill);
    }
    const path=g.pathColor===null||g.pathColor==='none'?null:(g.pathColor||'green');
    show('drive-path',!!path);show('drive-path-glow',!!path);
    if(path){$('drive-path').setAttribute('stroke',color(path));$('drive-path-glow').setAttribute('stroke',color(path));}
    const shift=Math.max(-1.5,Math.min(1.5,Number(g.egoOffset)||0))*58;
    $('ego-group').setAttribute('transform','translate('+shift+' 0)');
    $('lane-lines').setAttribute('transform','translate('+((Number(g.laneOffset)||0)*50)+' 0)');
    show('lane-arrow-left',g.arrow==='left'||g.arrow==='both');show('lane-arrow-right',g.arrow==='right'||g.arrow==='both');
    show('lane-center-fill',!!g.centerFill);$('lane-center-fill').setAttribute('fill',color(typeof g.centerFill==='string'?g.centerFill:'green'));
    show('surrounding-cars',g.traffic!==false);show('lead-car',g.lead!==false);
  }
  function drawCenter(m){
      const {size,lines,step}=fitText(m.text,258,60,18);
      const height=Math.max(60,lines.length*step+16),y=111;
      $('center-box').setAttribute('height',height);svgText($('center-message-text'),lines,620,y+(height-(lines.length-1)*step)/2+size*.34,step,size);
    }
  function drawRight(m){
      const icon=m.icon||'none',off=icon.includes('off'),steering=icon.includes('steering')||icon.includes('lfa'),cruise=icon.includes('scc')||icon.includes('cruise'),lead=icon==='lead-car'||icon==='front-start',attention=icon.includes('attention')||icon.startsWith('driver'),triangle=icon==='triangle',front=icon==='front-warning',pedal=icon==='switch-pedal';
      const label=icon.includes('hdp')?'HDP':icon==='hda'?'HDA':'';
      const hasIcon=!!label||steering||cruise||lead||attention||triangle||front||pedal;
      // 원의 상단 여백과 아이콘 시작점(268) 사이에 문구를 배치합니다.
      const {lines,size,step}=fitText(m.text,hasIcon?220:240,hasIcon?84:180,20);
      svgText($('right-message-text'),lines,980,(hasIcon?212:272)-(lines.length-1)*step/2+size*.34,step,size);
      $('message-ring').setAttribute('stroke',color(m.ringColor||(m.bank==='v2'&&m.codes?.[0]===23?'yellow':'#d6f0ff')));
      show('right-hdp',!!label);$('right-hdp').textContent=label;$('right-hdp').setAttribute('fill',label==='HDA'?colors.green:off?'#eff5ff':colors.cyan);
      show('attention-icon',attention);show('right-steering',steering);show('right-cruise',cruise);show('right-lead',lead);show('off-mark',off);show('right-triangle',triangle);show('right-front-warning',front);show('right-pedal',pedal);
      $('off-mark').setAttribute('transform',label?'translate(1043 342)':'translate(1021 353)');
      $('right-steering').style.color=color(m.iconColor||'white');
    }
  function renderCanPreview(){
    if(!canPreview)return;
    const v=canPreview;
    $('stage-source').textContent='DBC 신호 미리보기';$('stage-code').textContent='CAN';
    $('surface-title').textContent='DBC 연동 · 관찰 문구 대조';
    if(v.speedLimit!==undefined)$('speed-sign-text').textContent=String(v.speedLimit);
    if(v.graphic){
      roadStyle(v.graphic);
      show('center-message',!!v.center);show('nav-banner',!v.center);
      show('right-message',!!v.right);show('range-dial',!v.right);
      show('camera-preview',false);show('camera-left-preview',false);
      ['turn-arrow','secondary-sign-camera','secondary-sign-exclamation','secondary-sign-right-bend','secondary-sign-zigzag'].forEach(id=>show(id,false));
      if(v.center)drawCenter(v.center);if(v.right)drawRight(v.right);
      const iconColor={0:'#758698',1:'#758698',2:'#83ee39',3:'#dcebf5',5:'#57dcf6'};
      $('top-system').textContent=v.hda===0?'':v.hda===5?'HDP':'HDA';
      $('top-system').setAttribute('fill',iconColor[v.hda]||'#758698');
      $('top-steering').style.color=iconColor[v.lfa]||'#758698';show('top-steering',v.lfa!==0);
      $('test-value').textContent=v.setStyle===0?'':String(v.setSpeed);
      $('test-value').setAttribute('fill',({1:'#758698',2:'#83ee39',3:'#dcebf5',6:'#57dcf6'})[v.setStyle]||'#758698');
      $('ego-ring').style.opacity=v.circle===0?'0':'.9';$('ego-aura').style.opacity=v.circle===2?'1':'0';
      $('ego-ring').setAttribute('stroke',v.circle===2?'#22d8ff':'#758698');
    }
    $('cluster-desc').textContent='DBC를 해석한 참고 시각화. 영상 시험 번호와 실제 차량 동작의 동일성을 검증한 것은 아닙니다.';
  }
  function renderCluster(){
    const m=current();
    show('top-steering',true);$('top-steering').style.color='#91f6f0';$('test-value').setAttribute('fill','#83f5ed');$('ego-ring').setAttribute('stroke','#22d8ff');
    if(!m){show('center-message',false);show('right-message',false);show('nav-banner',true);show('range-dial',true);show('camera-preview',false);['camera-left-preview','turn-arrow','wave-left','wave-right','ipedal-mark','secondary-sign-camera','secondary-sign-exclamation','secondary-sign-right-bend','secondary-sign-zigzag'].forEach(id=>show(id,false));$('test-value').textContent='—';$('stage-code').textContent='—';$('stage-source').textContent='검색 결과 없음';$('surface-title').textContent='메뉴를 선택하세요';$('cluster-desc').textContent='검색 조건에 맞는 메뉴가 없습니다.';roadStyle();updateView();renderCanPreview();return;}
    const v=visual(m),cameraRight=m.kind==='camera'||v.cameraRight,cameraLeft=v.cameraLeft;
    const right=m.surface==='right'&&m.kind==='message',central=m.surface==='center'&&m.kind==='message',road=m.surface==='road';
    $('stage-source').textContent=shortBank(m);$('stage-code').textContent=m.bank==='lanes'?m.code:(currentNumber??m.code);
    $('value-label').textContent=m.bank==='lanes'?'메뉴·설정':'테스트 값';$('surface-title').textContent=surfaceName(m);
    $('test-value').textContent=m.bank==='lanes'?$('speed-control-value').textContent:String(currentNumber??(m.codes&&m.codes[0])??m.code);
    show('center-message',central);show('nav-banner',!central);show('right-message',right);show('range-dial',!right&&!cameraRight);show('camera-preview',!!cameraRight);show('camera-left-preview',!!cameraLeft);
    let system=v.topSystem||m.topSystem||(m.bank==='v2'&&Number(m.codes?.[0])<15?'HDA':'HDP');
    if(m.id==='right-24'||(m.bank==='v2'&&m.codes?.[0]===24)||m.bank==='v1'&&m.codes?.[0]===248)system='HDA';
    $('top-system').textContent=system;$('top-system').setAttribute('fill',system==='HDP'?'#5ee4f5':'#c2d1df');
    const topColor=color(v.topColor||m.topColor||(m.bank==='v1'&&m.codes?.[0]===248?'orange':'cyan'));
    $('top-line').setAttribute('stroke',topColor);$('top-glow').setAttribute('stroke',topColor);
    $('ego-ring').style.opacity=system==='HDP'?'.9':'.18';$('ego-aura').style.opacity=system==='HDP'?'1':'.2';
    roadStyle({...m.graphic,...v.graphic});
    $('ego-ring').style.opacity=v.egoRing===false?'0':system==='HDP'?'.9':'.18';
    $('speed-text').setAttribute('fill',color(v.speedColor||'#f2f6ff'));$('speed-sign-text').textContent=v.signValue||'100';
    show('turn-arrow',!!v.turnRight||m.kind==='camera');show('wave-left',v.redWaves==='left'||v.redWaves==='both');show('wave-right',v.redWaves==='right'||v.redWaves==='both');show('ipedal-mark',!!v.iPedal);
    ['camera','exclamation','right-bend','zigzag'].forEach(k=>show('secondary-sign-'+k,v.secondarySign===k));
    if(central)drawCenter(m);
    if(right)drawRight(m);
    $('cluster-desc').textContent=shortBank(m)+', '+(m.bank==='lanes'?'메뉴 ':'테스트 값 ')+(currentNumber??m.code)+', '+m.text;
    updateView();renderCanPreview();
  }
  function renderOptions(){
    const select=$('message-select');select.replaceChildren();
    ['v1','v2','lanes'].forEach(b=>{const items=filtered().filter(m=>m.bank===b);if(!items.length)return;
      const group=document.createElement('optgroup');group.label=banks[b];
      items.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.code+' · '+m.text;group.appendChild(o);});select.appendChild(group);
    });select.disabled=!filtered().length;if(selected)select.value=selected;
  }
  function renderList(){
    const list=$('message-list');list.replaceChildren();const items=filtered();
    if(!items.length){const empty=document.createElement('p');empty.className='empty-result';empty.textContent='검색 결과가 없습니다. 번호나 문구를 바꾸거나 필터를 초기화해 주세요.';list.appendChild(empty);}
    items.forEach(m=>{
      const b=document.createElement('button');b.type='button';b.className='message-item'+(isEmpty(m)?' navigation-item':'');b.dataset.id=m.id;b.setAttribute('aria-current',String(m.id===selected));b.setAttribute('aria-label',shortBank(m)+' '+m.code+' '+m.text);
      const code=document.createElement('span');code.className='item-code';code.textContent=m.code;const bankText=document.createElement('small');bankText.textContent=shortBank(m);code.appendChild(bankText);
      const text=document.createElement('span');text.className='item-text';text.textContent=m.text;const info=document.createElement('small');info.textContent=m.category+' · '+surfaceName(m)+(m.confidence==='uncertain'||m.confidence==='unassigned'?' · 확인 필요':'');text.appendChild(info);b.append(code,text);b.addEventListener('click',()=>{stopPlay();selectMessage(m.id,false);});list.appendChild(b);
    });$('list-count').textContent=items.length+'개 항목';
    $('filter-summary').textContent=(bank==='all'?'전체 영상':banks[bank])+' · '+items.length+' / '+data.length+'개';
  }
  function selectedRange(){const m=current();return m&&m.bank!=='lanes'?data.filter(x=>x.bank===m.bank).flatMap(x=>x.codes||[]):[];}
  function updateSelected(scroll){
    const m=current(),items=filtered();
    ['prev-btn','next-btn','play-btn','copy-btn'].forEach(id=>{$(id).disabled=!m;});
    if(!m){$('current-text').textContent='검색 결과가 없습니다.';$('selected-code').textContent='—';$('selected-group').textContent='필터를 확인하세요';$('selected-kind').textContent='';$('selected-note').textContent='';$('source-file').textContent='';$('source-time').textContent='';$('source-surface').textContent='';$('position').textContent='0 / 0';show('code-controls',false);renderCluster();return;}
    $('message-select').value=m.id;$('current-text').textContent=m.text;
    $('selected-code').textContent=shortBank(m)+' · '+(currentNumber??m.code);$('selected-group').textContent=m.category;
    $('selected-kind').textContent=m.menuConfidence==='probable'?'메뉴 번호 추정':m.phaseUncertain?'전환 중 관찰 상태':m.kind==='camera'?'촬영 중 관찰 상태':m.kind==='graphic'?'화면 변화 해석':m.kind==='navigation'?'알림 없음':m.kind==='unverified'?'판독 보류':'화면 문구';
    const uncertain=m.confidence==='uncertain'||m.confidence==='unassigned'||m.kind==='unverified';
    $('selected-kind').classList.toggle('uncertain',uncertain);
    $('selected-note').textContent=m.notes||'';$('selected-note').classList.toggle('uncertain-note',uncertain);
    $('source-file').textContent=m.source;$('source-time').textContent='약 '+time(m.bank==='v1'&&currentNumber!==null?currentNumber+7:m.timeSeconds);$('source-surface').textContent=surfaceName(m);
    $('position').textContent=(items.findIndex(n=>n.id===selected)+1)+' / '+items.length;
    document.querySelectorAll('.message-item').forEach(b=>b.setAttribute('aria-current',String(b.dataset.id===selected)));
    const values=selectedRange();show('code-controls',values.length>0);
    if(values.length){const min=Math.min(...values),max=Math.max(...values),v=currentNumber??m.codes[0];['code-input','code-range'].forEach(id=>{$(id).min=min;$(id).max=max;$(id).value=v;});$('code-range-label').textContent=shortBank(m)+' 테스트 값 · '+min+'–'+max;}
    if(scroll){const active=document.querySelector('.message-item[aria-current="true"]');if(active){const list=$('message-list'),a=active.getBoundingClientRect(),r=list.getBoundingClientRect();if(a.top<r.top||a.bottom>r.bottom)list.scrollTop+=a.top-r.top-10;}}
    renderCluster();
  }
  function selectMessage(id,scroll,number=null){document.dispatchEvent(new Event('cluster-menu-selected'));selected=id;currentNumber=number;updateSelected(scroll);}
  function refresh(){const items=filtered();if(!items.some(m=>m.id===selected)){selected=items[0]?.id||null;currentNumber=null;}renderOptions();renderList();updateSelected(true);}
  function setBank(next){document.dispatchEvent(new Event('cluster-menu-selected'));stopPlay();bank=next;document.querySelectorAll('.bank-tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.bank===bank)));refresh();}
  function step(direction){const items=filtered();if(!items.length)return;const i=(items.findIndex(m=>m.id===selected)+direction+items.length)%items.length;selectMessage(items[i].id,true);}
  function jumpTo(value){
    const m=current();if(!m||m.bank==='lanes')return;
    document.dispatchEvent(new Event('cluster-menu-selected'));
    const n=Number(value);if(!Number.isInteger(n)){toast('정수 번호를 입력해 주세요.');return;}
    const found=data.find(x=>x.bank===m.bank&&(x.codes||[]).includes(n));
    if(!found){toast('영상에서 확인되지 않은 번호입니다.');return;}
    stopPlay();query='';$('search-input').value='';category='all';$('category-select').value='all';includeEmpty=true;$('include-empty').checked=true;
    if(bank!=='all'&&bank!==found.bank)bank=found.bank;selected=found.id;currentNumber=n;renderOptions();renderList();updateSelected(true);
  }
  function stopPlay(){if(timer){clearInterval(timer);timer=null;}$('play-btn').setAttribute('aria-pressed','false');$('play-label').textContent='자동 넘김';$('play-svg').innerHTML='<path d="m8 5 11 7-11 7Z"/>';$('play-progress').classList.remove('running');}
  function togglePlay(){if(timer){stopPlay();return;}if(!current())return;$('play-btn').setAttribute('aria-pressed','true');$('play-label').textContent='일시정지';$('play-svg').innerHTML='<path d="M7 5h4v14H7Zm6 0h4v14h-4Z"/>';$('play-progress').classList.add('running');timer=setInterval(()=>step(1),4500);}
  function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2500);}
  function resetFilters(){stopPlay();query='';category='all';includeEmpty=true;$('search-input').value='';$('category-select').value='all';$('include-empty').checked=true;setBank('all');}
  $('message-select').addEventListener('change',e=>{stopPlay();selectMessage(e.target.value,true);});
  $('prev-btn').addEventListener('click',()=>{stopPlay();step(-1);});$('next-btn').addEventListener('click',()=>{stopPlay();step(1);});$('play-btn').addEventListener('click',togglePlay);
  document.querySelectorAll('.bank-tab').forEach(tab=>tab.addEventListener('click',()=>setBank(tab.dataset.bank)));
  $('search-input').addEventListener('input',e=>{stopPlay();query=e.target.value.trim();refresh();});
  $('category-select').addEventListener('change',e=>{stopPlay();category=e.target.value;refresh();});
  $('include-empty').addEventListener('change',e=>{stopPlay();includeEmpty=e.target.checked;refresh();});$('reset-filters').addEventListener('click',resetFilters);
  $('code-input').addEventListener('change',e=>jumpTo(e.target.value));$('code-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jumpTo(e.target.value);}});$('code-range').addEventListener('input',e=>jumpTo(e.target.value));
  $('focus-btn').addEventListener('click',()=>{zoom=!zoom;updateView();});
  $('fullscreen-btn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage-card').requestFullscreen)await $('stage-card').requestFullscreen();else{zoom=true;updateView();toast('표시 영역을 확대했습니다.');}}catch{toast('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}});
  $('speed-range').addEventListener('input',e=>{$('speed-text').textContent=e.target.value;$('speed-control-value').textContent=e.target.value;if(current()?.bank==='lanes')$('test-value').textContent=e.target.value;});
  $('motion-btn').addEventListener('click',()=>{motion=!motion;$('cluster-wrap').classList.toggle('motion',motion);$('motion-btn').setAttribute('aria-pressed',String(motion));});
  $('copy-btn').addEventListener('click',async()=>{const m=current();if(!m)return;const text=shortBank(m)+' / '+(currentNumber??m.code)+' : '+m.text;try{if(navigator.clipboard&&isSecureContext)await navigator.clipboard.writeText(text);else{const f=document.createElement('textarea');f.value=text;f.style.cssText='position:fixed;opacity:0';document.body.appendChild(f);f.select();const ok=document.execCommand('copy');f.remove();if(!ok)throw Error('copy');}toast('번호와 내용을 복사했습니다.');}catch{toast('복사가 제한되어 있습니다. 문구를 선택해 복사해 주세요.');}});
  document.addEventListener('keydown',e=>{if($('cluster-app').dataset.mode!=='menu'||e.target.matches('input,select,textarea,button,summary')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='ArrowRight'){e.preventDefault();stopPlay();step(1);}else if(e.key==='ArrowLeft'){e.preventDefault();stopPlay();step(-1);}else if(e.code==='Space'){e.preventDefault();togglePlay();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlay();});window.addEventListener('pagehide',stopPlay);window.addEventListener('resize',updateView);
  document.addEventListener('cluster-mode-changed',stopPlay);
  const categories=[...new Set(data.map(m=>m.category))];categories.sort((a,b)=>a.localeCompare(b,'ko'));categories.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;$('category-select').appendChild(o);});
  document.querySelectorAll('.bank-count').forEach(n=>{n.textContent=n.dataset.bank==='all'?data.length:data.filter(m=>m.bank===n.dataset.bank).length;});
  $('total-count').textContent=data.length;$('message-count').textContent=data.filter(m=>m.kind==='message').length;$('graphic-count').textContent=data.filter(m=>m.kind==='graphic'||m.kind==='unverified'||m.kind==='camera').length;$('empty-count').textContent=data.filter(isEmpty).length;
  document.addEventListener('cluster-can-preview',e=>{stopPlay();canPreview=e.detail;renderCluster();});
  renderOptions();renderList();updateSelected(true);if(document.fonts?.ready)document.fonts.ready.then(renderCluster);
})();
