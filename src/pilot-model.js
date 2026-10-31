(function(root){
  'use strict';
  const can=typeof module==='object'?require('./can.js'):root.ClusterCAN;
  function frame(snapshot,schema,menus,tick=0){
    if(!snapshot.settings?.ClusterLaneTest||!snapshot.settings?.ClusterLaneTestValue)throw Error('이 데모 버전에는 계기판 표시 테스트 설정이 없습니다.');
    const field=snapshot.values?.ClusterLaneTest,value=snapshot.values?.ClusterLaneTestValue;
    if(!Number.isSafeInteger(field)||!Number.isSafeInteger(value))throw Error('올바른 정수 설정을 받지 못했습니다.');
    if(field===0)return {preview:null,period:0,label:'표시 테스트 꺼짐 · 영상 화면 표시'};
    if(field<0)throw Error('자동 칸 순회는 아직 지원하지 않습니다. 칸 번호를 직접 선택하세요.');
    const map=snapshot.mapping,m=map&&schema.messages.find(m=>m.address===map.address),s=m?.signals.find(s=>s.name===map.name);
    if(!s)throw Error('이 칸은 현재 계기판의 DBC 연결 범위에 없습니다.');
    if(m.length!==map.length||['start','size','little','signed','factor','offset'].some(key=>s[key]!==map[key]))throw Error('데모와 계기판의 DBC 정의가 달라 반영을 중지했습니다.');
    const period=value<0?({'-1':1000,'-2':500,'-3':250,'-4':100})[value]:0;
    if(value<0&&!period)throw Error('지원하지 않는 자동 값 순회입니다.');
    const min=s.signed?-(2**(s.size-1)):0,max=s.signed?2**(s.size-1)-1:2**s.size-1;
    const raw=period?min+tick%(max-min+1):value;
    const bytes=can.change(m,new Uint8Array(m.length),s.name,raw);
    return {preview:can.preview({[m.address]:can.decode(m,bytes)},menus,schema),period,raw,
      label:'칸 '+field+' · '+s.name+' = '+raw+(period?' · '+period/1000+'초 순회':''),mapped:!!can.displayed[m.address]?.includes(s.name)};
  }
  const api={frame};if(typeof module==='object')module.exports=api;else root.ClusterPilot=api;
})(typeof globalThis==='object'?globalThis:this);
