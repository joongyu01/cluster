const assert=require('node:assert/strict');
const {frame}=require('./src/pilot-model.js');
const schema=require('./src/can-schema.json'),menus=require('./src/menus.json');
function snapshot(field,name,value){
  const message=schema.messages.find(m=>m.signals.some(s=>s.name===name));
  const signal=message.signals.find(s=>s.name===name);
  return {values:{ClusterLaneTest:field,ClusterLaneTestValue:value},settings:{ClusterLaneTest:{},ClusterLaneTestValue:{}},mapping:{...signal,address:message.address,length:message.length}};
}
const lane=snapshot(45,'LANELINE_LEFT',8);
assert.equal(frame(lane,schema,menus).preview.graphic.left.style,'dashed');
assert.equal(frame(lane,schema,menus).effect,'왼쪽 차선: 흰색 점선');
assert.match(frame(snapshot(21,'ALERTS_4',240),schema,menus).effect,/중앙 알림:.*연료/);
for(const code of [240,241])assert.equal(frame(snapshot(21,'ALERTS_4',code),schema,menus).preview.center.codes[0],code);
const off=structuredClone(lane);off.values.ClusterLaneTest=0;assert.equal(frame(off,schema,menus).preview,null);
const mismatch=structuredClone(lane);mismatch.mapping.start++;assert.throws(()=>frame(mismatch,schema,menus),/DBC 정의/);
const unknown=structuredClone(lane);unknown.mapping=null;assert.throws(()=>frame(unknown,schema,menus),/연결 범위/);
const sweep=structuredClone(lane);sweep.values.ClusterLaneTestValue=-4;
assert.equal(frame(sweep,schema,menus,9).raw,9);assert.equal(frame(sweep,schema,menus,16).raw,0);assert.equal(frame(sweep,schema,menus).period,100);
sweep.values.ClusterLaneTest=-1;assert.throws(()=>frame(sweep,schema,menus),/자동 칸 순회/);
assert.throws(()=>frame({},schema,menus),/설정이 없습니다/);
assert.throws(()=>frame(snapshot(45,'LANELINE_LEFT',16),schema,menus));
console.log('PASS: Pilot field mapping, 240/241, dashed lane, off, DBC mismatch, unsupported slot and value sweeps');
