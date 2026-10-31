(() => {
  'use strict';
  const $=id=>document.getElementById(id),ORIGIN='https://demopilot.joongyu.co.kr',CHANNEL='cluster-pilot-v1';
  const iframe=$('pilot-frame'),schema=JSON.parse($('can-schema').textContent),menus=JSON.parse($('message-data').textContent);
  let latest=null,sweep=null,waiting=null,tick=0;
  const active=()=>$('cluster-app').dataset.mode==='pilot';
  const send=(type,data={})=>iframe.contentWindow?.postMessage({channel:CHANNEL,type,...data},ORIGIN);
  const preview=detail=>document.dispatchEvent(new CustomEvent('cluster-can-preview',{detail}));
  function stop(){clearInterval(sweep);sweep=null;}
  function status(text,error=false){$('pilot-status').textContent=text;$('pilot-status').classList.toggle('error',error);}
  function render(){
    if(!active()||!latest)return;
    try{
      const result=ClusterPilot.frame(latest,schema,menus,tick++);preview(result.preview);
      $('pilot-effect').textContent=result.label+(result.mapped===false?' · 값만 확인':'');
      $('workspace-status').textContent=result.preview?'Pilot Demo 연결됨':'Pilot Demo · 테스트 꺼짐';
      $('workspace-status').classList.toggle('active',!!result.preview);
      if(result.period&&!sweep&&!document.hidden)sweep=setInterval(render,result.period);
    }catch(error){stop();preview(null);$('pilot-effect').textContent=error.message;$('workspace-status').textContent='Pilot Demo · 화면 미반영';$('workspace-status').classList.remove('active');}
  }
  function connect(reload=false){
    stop();latest=null;tick=0;preview(null);$('pilot-apply').disabled=true;
    status('Pilot Demo를 불러오는 중입니다. 첫 실행은 잠시 걸릴 수 있습니다.');
    clearTimeout(waiting);waiting=setTimeout(()=>status('연결 응답이 없습니다. 다시 연결하거나 데모를 새 창에서 확인해 주세요.',true),60000);
    if(reload||!iframe.getAttribute('src'))iframe.src=ORIGIN+'/dev/?cluster=1';else send('subscribe');
  }
  iframe.addEventListener('load',()=>{if(active())send('subscribe');});
  window.addEventListener('message',event=>{
    if(event.origin!==ORIGIN||event.source!==iframe.contentWindow||event.data?.channel!==CHANNEL||!active())return;
    const msg=event.data;
    if(msg.type==='ready'){send('subscribe');return;}
    if(msg.type==='error'){clearTimeout(waiting);$('pilot-apply').disabled=!latest?.settings?.ClusterLaneTest;status(msg.error||'데모 연결 오류',true);return;}
    if(msg.type!=='snapshot')return;
    clearTimeout(waiting);stop();tick=0;latest=msg;
    for(const [id,key] of [['pilot-field','ClusterLaneTest'],['pilot-value','ClusterLaneTestValue']]){
      if(Number.isSafeInteger(msg.values?.[key]))$(id).value=msg.values[key];
      const limits=msg.settings?.[key];if(limits){$(id).min=limits.min;$(id).max=limits.max;}
    }
    $('pilot-apply').disabled=!msg.settings?.ClusterLaneTest;
    $('pilot-source').textContent=(msg.source?.branch||'개발 버전')+' · '+String(msg.source?.commit||'').slice(0,10);
    status('연결됨 · 데모 설정을 바꾸면 계기판에 반영됩니다.');render();
  });
  $('pilot-apply').addEventListener('click',()=>{
    const field=$('pilot-field'),value=$('pilot-value');
    if(!field.reportValidity()||!value.reportValidity())return;
    const values={ClusterLaneTest:Number(field.value),ClusterLaneTestValue:Number(value.value)};
    if(!Object.values(values).every(Number.isSafeInteger)){status('정수 칸 번호와 값을 입력하세요.',true);return;}
    $('pilot-apply').disabled=true;status('데모 설정을 저장하는 중…');send('set',{values});
  });
  $('pilot-reconnect').addEventListener('click',()=>connect(true));
  document.addEventListener('cluster-mode-changed',()=>{
    if(active()){if(latest){render();send('subscribe');}else connect();}
    else{stop();clearTimeout(waiting);if(iframe.getAttribute('src'))send('unsubscribe');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(active())render();});
  window.addEventListener('pagehide',stop);
  if(new URLSearchParams(location.search).get('pilot')==='1')document.querySelector('.mode-nav [data-mode="pilot"]').click();
})();
