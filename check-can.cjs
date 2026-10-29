const assert=require('node:assert/strict');
const can=require('./src/can.js');
const schema=require('./src/can-schema.json');
const menus=require('./src/menus.json');
const m=schema.messages.find(m=>m.address===353);
for(const message of schema.messages){
  for(const signal of message.signals){
    const positions=can.positions(signal);
    assert.ok(positions.every(p=>p>=0&&p<message.length*8));
    for(const value of [0,1,2**signal.size-1]){
      const source=new Uint8Array(message.length).fill(0xA5);
      const result=can.change(message,source,signal.name,value);
      assert.equal(can.decode(message,result)[signal.name].raw,value);
      for(let bit=0;bit<source.length*8;bit++)if(!positions.includes(bit))assert.equal((result[bit>>3]>>(bit%8))&1,(source[bit>>3]>>(bit%8))&1);
    }
  }
}
// Independent wire-byte expectations, including Motorola across a byte boundary.
let p=new Uint8Array(32);p[18]=240;p[19]=22;p[25]=91;p[10]=0xA8;
let decoded=can.decode(m,p);
assert.equal(decoded.ALERTS_4.raw,240);assert.equal(decoded.ALERTS_5.raw,22);
assert.equal(decoded.vSetDis.raw,91);assert.equal(decoded.LANELINE_LEFT.raw,8);assert.equal(decoded.LANELINE_LEFT_POSITION.raw,10);
const synthetic={length:2,signals:[{name:'signed',start:3,size:8,little:false,signed:true,factor:.5,offset:2,values:{}}]};
assert.equal(can.decode(synthetic,Uint8Array.from([0x0F,0xF0])).signed.physical,1.5);
assert.deepEqual([...can.change(synthetic,new Uint8Array(2),'signed',-1)],[0x0F,0xF0]);
assert.throws(()=>can.bytes('GG',1));assert.throws(()=>can.bytes('00',32));
assert.throws(()=>can.change(m,p,'ALERTS_4',256));assert.throws(()=>can.change(m,p,'ALERTS_4',1.5));
const log=can.parseLog('(1.25) can0 161##1'+can.hex(p)+'\n'+JSON.stringify({time:2,bus:1,address:'0x161',data:can.hex(p)}),schema);
assert.equal(log.frames.length,2);assert.equal(log.frames[0].bus,'can0');assert.equal(log.frames[1].bus,'1');
assert.throws(()=>can.parseLog('(1) can0 161#00',schema),/1번째 줄/);
assert.throws(()=>can.parseLog(JSON.stringify({address:353,data:can.hex(p)}),schema),/bus/);
assert.throws(()=>can.parseLog('malformed',schema));
let view=can.preview({353:decoded},menus,schema);
assert.equal(view.center.code,'240');assert.equal(view.right.code,'22');assert.equal(view.graphic.left.style,'dashed');
p[18]=241;assert.equal(can.preview({353:can.decode(m,p)},menus,schema).center.code,'241');
p[18]=255;assert.equal(can.preview({353:can.decode(m,p)},menus,schema).center,null);
const original=JSON.stringify(menus);
can.preview({353:can.decode(m,p)},menus,schema);assert.equal(JSON.stringify(menus),original);
console.log('PASS: 131 signals, Intel/Motorola bytes, bit preservation, validation, log formats and observed-message bounds');
