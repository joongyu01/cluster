(function(){
  'use strict';
  const $=id=>document.getElementById(id),can=globalThis.ClusterCAN;
  const schema=JSON.parse($('can-schema').textContent),menus=JSON.parse($('message-data').textContent);
  let payloads={},state={},previous={},frames=[],filteredFrames=[],position=0,mode='menu',playTimer=null;
  const names={LANELINE_LEFT:'왼쪽 차선',LANELINE_RIGHT:'오른쪽 차선',LANELINE_RIGHT_POSITION:'오른쪽 차선 위치',CENTERLINE:'중앙 유도선',LANE_HIGHLIGHT:'주행 차로 강조',LANE_LEFT:'왼쪽 차로 강조',LANE_RIGHT:'오른쪽 차로 강조',ALERTS_4:'중앙 알림',ALERTS_5:'오른쪽 알림',HDA_ICON:'HDA / HDP 아이콘',LFA_ICON:'조향 아이콘',CAR_CIRCLE:'차량 주변 원',vSetDis:'설정 속도',SETSPEED:'설정 속도 표시',SPEEDLIMIT:'제한 속도 표지'};
  const message=()=>schema.messages.find(m=>m.address===Number($('can-message').value));
  const signal=()=>message().signals.find(s=>s.name===$('can-signal').value);
  const payload=()=>payloads[message().address]||new Uint8Array(message().length);
  function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);}
  function emit(){
    const active=mode!=='menu'&&$('can-enabled').checked&&Object.keys(state).length>0;
    document.dispatchEvent(new CustomEvent('cluster-can-preview',{detail:active?can.preview(state,menus,schema):null}));
    $('workspace-status').textContent=active?'DBC 참고 시각화 적용 중':'영상 관찰 화면';$('workspace-status').classList.toggle('active',active);
  }
  function guard(action){try{$('can-status').classList.remove('error');action();}catch(error){$('can-status').textContent=error.message;$('can-status').classList.add('error');}}
  function stopPlayback(){clearInterval(playTimer);playTimer=null;$('can-play').textContent='자동 재생';$('can-play').setAttribute('aria-pressed','false');}
  function setMode(next){
    stopPlayback();mode=next;$('cluster-app').dataset.mode=mode;
    document.querySelectorAll('.mode-nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    $('mode-menu-panel').hidden=mode!=='menu';document.querySelector('.message-panel').hidden=mode!=='menu';
    $('can-panel').hidden=mode==='menu';$('change-panel').hidden=mode==='menu';$('log-controls').hidden=mode!=='log';$('signal-controls').hidden=mode!=='dbc';
    $('can-heading').textContent=mode==='log'?'CAN 로그 재생':'DBC 신호 조작';
    $('can-intro').textContent=mode==='log'?'프레임을 넘기며 달라진 표시를 확인하세요.':'바꿀 표시를 고르고 값을 적용해 보세요.';
    $('can-enabled').checked=mode!=='menu'&&Object.keys(state).length>0;
    document.dispatchEvent(new Event('cluster-mode-changed'));emit();
  }
  function applyValue(raw){
    stopPlayback();
    if(String(raw).trim()==='')throw Error('원시 값을 입력하세요.');
    apply(can.change(message(),payload(),signal().name,Number(raw)),(names[signal().name]||signal().name)+' → '+raw+' 적용');
  }
  function presets(s){
    if(['LANELINE_LEFT','LANELINE_RIGHT'].includes(s.name))return [[0,'회색'],[2,'흰 실선'],[4,'주황 실선'],[6,'초록 실선'],[8,'흰 점선'],[10,'초록 점선']];
    if(s.name==='ALERTS_4')return [[0,'숨김'],[1,'가속 페달'],[240,'연료 부족'],[241,'타이어 공기압']];
    if(s.name==='ALERTS_5')return [[0,'숨김'],[22,'HDP 미적용']];
    if(s.name==='HDA_ICON')return [[0,'숨김'],[2,'HDA'],[5,'HDP']];
    return Object.entries(s.values||{}).slice(0,6);
  }
  function showSignal(){
    const s=signal(),decoded=can.decode(message(),payload())[s.name];
    $('can-value').min=s.signed?-(2**(s.size-1)):0;$('can-value').max=s.signed?2**(s.size-1)-1:2**s.size-1;$('can-value').value=decoded.raw;
    $('can-signal-name').textContent=names[s.name]||s.name;$('can-signal-key').textContent=s.name;
    $('can-signal-effect').textContent=can.displayed[message().address]?.includes(s.name)?'참고 시각화':'값만 확인';
    $('can-value-range').textContent='('+ $('can-value').min+'–'+$('can-value').max+')';
    const previewLabel=presets(s).find(([v])=>Number(v)===decoded.raw)?.[1];
    $('can-value-label').textContent=(previewLabel?'미리보기: '+previewLabel+' · ':'')+'DBC: '+(decoded.label||'열거값 설명 없음');
    $('can-minus').disabled=decoded.raw<=Number($('can-value').min);$('can-plus').disabled=decoded.raw>=Number($('can-value').max);
    document.querySelectorAll('.quick-signals button').forEach(b=>b.setAttribute('aria-pressed',String(message().address===353&&b.dataset.signal===s.name)));
    $('can-presets').replaceChildren();
    presets(s).forEach(([value,label])=>{const b=document.createElement('button');b.type='button';b.textContent=value+' · '+label;b.setAttribute('aria-pressed',String(Number(value)===decoded.raw));b.addEventListener('click',()=>guard(()=>applyValue(value)));$('can-presets').appendChild(b);});
    $('can-definition').textContent=s.name+' · bit '+s.start+' / '+s.size+'비트 · '+(s.little?'Intel':'Motorola')+' · 환산: raw × '+s.factor+' + '+s.offset+' '+s.unit+' · DBC 선언 범위 '+s.min+'–'+s.max+(s.testMenu?' · 코드의 시험 메뉴 '+s.testMenu:'')+' · '+(decoded.label||'열거값 설명 없음');
  }
  function table(){
    const m=message(),values=can.decode(m,payload()),body=$('can-values');body.replaceChildren();
    const changes=[];
    for(const s of m.signals){
      const v=values[s.name],old=previous[m.address]?.[s.name],changed=!!old&&old.raw!==v.raw;
      const row=document.createElement('tr');if(changed)row.className='changed';
      const mapped=can.displayed[m.address]?.includes(s.name);
      if(changed)changes.push({s,v,old,mapped});
      const columns=[s.name+(s.testMenu?' / '+s.testMenu:''),(old?old.raw:'—')+' → '+v.raw,v.physical+(s.unit?' '+s.unit:'')+' · '+(v.label||'정의되지 않은 열거값 / 수치'),mapped?'참고 시각화':'값만 확인'];
      columns.forEach(text=>{const td=document.createElement('td');td.textContent=text;row.appendChild(td);});body.appendChild(row);
    }
    $('change-count').textContent=changes.length+'개';$('can-changes').replaceChildren();
    changes.sort((a,b)=>Number(b.mapped)-Number(a.mapped)).slice(0,6).forEach(({s,v,old,mapped})=>{
      const row=document.createElement('div');row.className='change-item';const label=document.createElement('div'),title=document.createElement('strong'),key=document.createElement('small'),value=document.createElement('span'),before=document.createElement('small');
      title.textContent=names[s.name]||s.name;key.textContent=s.name+(mapped?' · 참고 시각화':' · 값만 확인');label.append(title,key);before.textContent=old.raw+' → ';value.append(before,document.createTextNode(v.raw));row.append(label,value);$('can-changes').appendChild(row);
    });
    if(!changes.length){const p=document.createElement('p');p.className='muted';p.textContent=Object.keys(state).length?'직전 같은 메시지와 달라진 값이 없습니다.':'신호를 적용하거나 예제 프레임을 넘겨 보세요.';$('can-changes').appendChild(p);}
    $('can-hex').value=can.hex(payload());showSignal();
  }
  function chooseMessage(preferred){
    const select=$('can-signal');select.replaceChildren();
    const mapped=can.displayed[message().address]||[];$('can-mapped').disabled=!mapped.length;
    message().signals.filter(s=>!['CHECKSUM','COUNTER'].includes(s.name)&&(!mapped.length||!$('can-mapped').checked||mapped.includes(s.name))).forEach(s=>option(select,s.name,(names[s.name]?names[s.name]+' · ':'')+s.name));
    const target=typeof preferred==='string'?preferred:message().address===353?'LANELINE_LEFT':message().address===354?'SPEEDLIMIT':message().address===490?'LANE_CHANGING':'TauGapSet';
    if([...select.options].some(o=>o.value===target))select.value=target;table();
  }
  function apply(bytes,label){
    const m=message();previous[m.address]=state[m.address]||can.decode(m,payload());payloads[m.address]=bytes;state[m.address]=can.decode(m,bytes);
    $('can-enabled').checked=true;table();emit();$('can-status').textContent=label+' · 0x'+m.address.toString(16).toUpperCase();
  }
  function navigation(){
    $('can-frame').max=Math.max(0,filteredFrames.length-1);$('can-frame').value=position;
    $('can-frame').disabled=!filteredFrames.length;$('can-prev').disabled=position<=0;$('can-next').disabled=position>=filteredFrames.length-1;
    $('can-play').disabled=filteredFrames.length<2;$('can-frame-count').textContent=(filteredFrames.length?position+1:0)+' / '+filteredFrames.length;
  }
  function selectFrame(index){
    if(!filteredFrames.length)return;
    position=Math.max(0,Math.min(index,filteredFrames.length-1));payloads={};state={};previous={};
    for(let i=0;i<=position;i++){
      const f=filteredFrames[i],m=schema.messages.find(m=>m.address===f.address);
      previous[f.address]=state[f.address];payloads[f.address]=f.payload;state[f.address]=can.decode(m,f.payload);
    }
    const frame=filteredFrames[position];$('can-message').value=frame.address;chooseMessage();$('can-enabled').checked=true;emit();navigation();
    $('can-status').textContent='기록 '+(position+1)+' / '+filteredFrames.length+' · 버스 '+frame.bus+' · '+(frame.time??'시각 없음')+' · 0x'+frame.address.toString(16).toUpperCase()+' (직전 같은 메시지와 비교)';
    if(position===filteredFrames.length-1)stopPlayback();
  }
  function load(parsed){
    stopPlayback();setMode('log');
    frames=parsed.frames;$('can-bus').replaceChildren();[...new Set(frames.map(f=>f.bus))].forEach(bus=>option($('can-bus'),bus,bus));$('can-bus').disabled=false;
    filteredFrames=frames.filter(f=>f.bus===$('can-bus').value);selectFrame(0);
    $('can-status').textContent+=' · 지원 외 메시지 '+parsed.skipped+'개 제외';
  }
  schema.messages.forEach(m=>option($('can-message'),m.address,'0x'+m.address.toString(16).toUpperCase()+' · '+m.name));
  document.querySelectorAll('.mode-nav button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('can-message').addEventListener('change',()=>chooseMessage());$('can-signal').addEventListener('change',showSignal);
  $('can-mapped').addEventListener('change',()=>chooseMessage($('can-signal').value));
  document.querySelectorAll('.quick-signals button').forEach(b=>b.addEventListener('click',()=>{$('can-message').value=353;chooseMessage(b.dataset.signal);}));
  $('can-enabled').addEventListener('change',emit);
  $('can-apply').addEventListener('click',()=>guard(()=>applyValue($('can-value').value)));
  $('can-value').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();guard(()=>applyValue($('can-value').value));}});
  $('can-minus').addEventListener('click',()=>guard(()=>applyValue(Number($('can-value').value)-1)));
  $('can-plus').addEventListener('click',()=>guard(()=>applyValue(Number($('can-value').value)+1)));
  $('can-decode').addEventListener('click',()=>guard(()=>apply(can.bytes($('can-hex').value,message().length),'프레임 해석')));
  $('can-prev').addEventListener('click',()=>{stopPlayback();selectFrame(position-1);});$('can-next').addEventListener('click',()=>{stopPlayback();selectFrame(position+1);});$('can-frame').addEventListener('input',e=>{stopPlayback();selectFrame(Number(e.target.value));});
  $('can-bus').addEventListener('change',()=>{stopPlayback();filteredFrames=frames.filter(f=>f.bus===$('can-bus').value);selectFrame(0);});
  $('can-play').addEventListener('click',()=>{if(playTimer){stopPlayback();return;}if(filteredFrames.length<2)return;if(position===filteredFrames.length-1)selectFrame(0);$('can-play').textContent='일시정지';$('can-play').setAttribute('aria-pressed','true');playTimer=setInterval(()=>selectFrame(position+1),1000);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});window.addEventListener('pagehide',stopPlayback);
  $('can-file').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{$('can-status').classList.remove('error');if(file.size>4*1024*1024)throw Error('파일은 최대 4 MB까지 읽을 수 있습니다.');const text=await file.text();load(can.parseLog(text,schema));}
    catch(error){$('can-status').textContent=error.message;$('can-status').classList.add('error');}
    e.target.value='';
  });
  $('can-demo').addEventListener('click',()=>guard(()=>{
    const m=schema.messages.find(m=>m.address===353);let p=new Uint8Array(m.length);const example=[];
    const add=(time,changes)=>{for(const [name,value] of Object.entries(changes))p=can.change(m,p,name,value);example.push({address:353,bus:'합성 예제',time,payload:new Uint8Array(p)});};
    add(0,{LANELINE_LEFT:2,LANELINE_RIGHT:2,LANELINE_RIGHT_POSITION:12,CENTERLINE:1,HDA_ICON:2,LFA_ICON:2,SETSPEED:3,vSetDis:80,CAR_CIRCLE:1});
    add(1,{LANELINE_LEFT:8,LANELINE_RIGHT:10,HDA_ICON:5,LFA_ICON:5,CAR_CIRCLE:2,LANE_HIGHLIGHT:3});
    add(2,{ALERTS_4:1,LANE_RIGHT:1});add(3,{ALERTS_4:0,ALERTS_5:22});
    load({frames:example,skipped:0});$('can-status').textContent='합성 예제 4프레임 · 다음 프레임을 눌러 차선·아이콘·문구 변화를 확인하세요. 실제 주행 기록이 아닙니다.';
  }));
  $('can-clear').addEventListener('click',()=>{stopPlayback();payloads={};state={};previous={};frames=[];filteredFrames=[];position=0;$('can-enabled').checked=false;$('can-bus').replaceChildren();$('can-bus').disabled=true;navigation();table();emit();$('can-status').classList.remove('error');$('can-status').textContent='초기화했습니다. 새 신호나 로그를 선택하세요.';});
  document.addEventListener('cluster-menu-selected',()=>{if($('can-enabled').checked){$('can-enabled').checked=false;emit();}});
  const a=document.createElement('a');a.href=schema.source.repository+'/blob/'+schema.source.commit+'/'+schema.source.dbcPath;a.target='_blank';a.rel='noopener';a.textContent='DBC 원본 · '+schema.source.commit.slice(0,10);$('can-source').appendChild(a);
  $('can-source').appendChild(document.createTextNode(' · 4개 메시지 / '+schema.messages.reduce((n,m)=>n+m.signals.length,0)+'개 신호 · 시험 메뉴는 현재 CarrotPilot 코드 기준이며 영상 번호와 다를 수 있습니다.'));
  chooseMessage();navigation();
})();
