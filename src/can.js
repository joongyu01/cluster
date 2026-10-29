(function(root){
  'use strict';
  function bytes(hex,length){
    if(typeof hex!=='string')throw Error('데이터는 16진수 문자열이어야 합니다.');
    const clean=hex.replace(/\s/g,'');
    if(!/^[\da-f]+$/i.test(clean)||clean.length!==length*2)throw Error(length+'바이트의 16진수 데이터가 필요합니다.');
    return Uint8Array.from(clean.match(/../g),v=>parseInt(v,16));
  }
  function positions(signal){
    const result=[];let bit=signal.start;
    for(let i=0;i<signal.size;i++){
      result.push(bit);bit=signal.little?bit+1:bit%8===0?bit+15:bit-1;
    }
    return result;
  }
  function decode(message,payload){
    if(payload.length!==message.length)throw Error('메시지 길이가 DBC와 다릅니다.');
    const values={};
    for(const s of message.signals){
      let raw=0;
      positions(s).forEach((bit,i)=>{raw+=((payload[bit>>3]>>(bit%8))&1)*2**(s.little?i:s.size-1-i);});
      if(s.signed&&raw>=2**(s.size-1))raw-=2**s.size;
      values[s.name]={raw,physical:Number((raw*s.factor+s.offset).toFixed(6)),label:s.values[String(raw)]||''};
    }
    return values;
  }
  function change(message,payload,name,raw){
    const signal=message.signals.find(s=>s.name===name);
    if(!signal||payload.length!==message.length)throw Error('알 수 없는 신호 또는 메시지 길이입니다.');
    const min=signal.signed?-(2**(signal.size-1)):0,max=signal.signed?2**(signal.size-1)-1:2**signal.size-1;
    if(!Number.isSafeInteger(raw)||raw<min||raw>max)throw Error('원시 값 범위: '+min+'–'+max);
    const result=new Uint8Array(payload),unsigned=raw<0?raw+2**signal.size:raw;
    positions(signal).forEach((bit,i)=>{const mask=1<<(bit%8),set=Math.floor(unsigned/2**(signal.little?i:signal.size-1-i))%2;result[bit>>3]=(result[bit>>3]&~mask)|(set?mask:0);});
    return result;
  }
  const hex=payload=>Array.from(payload,n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  function parseLog(text,schema){
    if(text.length>4*1024*1024)throw Error('로그는 최대 4 MB까지 불러올 수 있습니다.');
    const frames=[];let skipped=0;
    text.split(/\r?\n/).forEach((line,index)=>{
      line=line.trim();if(!line||line.startsWith('//'))return;
      try{
        let address,bus,payload,time;
        if(line.startsWith('{')){
          const row=JSON.parse(line);address=row.address;bus=row.bus;payload=row.data;time=row.time;
          if(typeof address==='string'&&/^0x[\da-f]+$/i.test(address))address=parseInt(address,16);
          if(!Number.isInteger(address)||bus===undefined)throw Error('JSONL에는 address, bus, data가 필요합니다.');
        }else{
          const match=line.match(/^\((\d+(?:\.\d+)?)\)\s+(\w+)\s+([\da-fA-F]+)(##[0-9a-fA-F]|#)([\da-fA-F]+)$/);
          if(!match)throw Error('candump 또는 JSONL 형식이 아닙니다.');
          [,time,bus,address,,payload]=match;address=parseInt(address,16);time=Number(time);
        }
        if(typeof bus!=='string'&&typeof bus!=='number')throw Error('bus 형식이 잘못되었습니다.');
        const message=schema.messages.find(m=>m.address===address);
        if(!message){skipped++;return;}
        frames.push({address,bus:String(bus),time,payload:bytes(payload,message.length)});
        if(frames.length>20000)throw Error('지원 메시지는 최대 20,000프레임까지 읽습니다.');
      }catch(error){throw Error((index+1)+'번째 줄: '+error.message);}
    });
    if(!frames.length)throw Error('지원하는 0x161 / 0x162 / 0x1EA / 0x200 프레임이 없습니다.');
    return {frames,skipped};
  }
  const displayed={353:['ALERTS_4','ALERTS_5','LANELINE_LEFT','LANELINE_RIGHT','LANELINE_RIGHT_POSITION','LANE_LEFT','LANE_RIGHT','CENTERLINE','LANE_HIGHLIGHT','CAR_CIRCLE','HDA_ICON','LFA_ICON','vSetDis','SETSPEED'],354:['SPEEDLIMIT']};
  function preview(state,menus,schema){
    const a=state[353],b=state[354],result={};
    if(b)result.speedLimit=b.SPEEDLIMIT.raw;
    if(!a)return result;
    const n=name=>a[name].raw;
    const line=value=>({color:({0:'gray',2:'white',4:'orange',6:'green',8:'white',10:'green'})[value]||'gray',style:[0,2,4,6].includes(value)?'solid':[8,10].includes(value)?'dashed':'none'});
    result.graphic={left:line(n('LANELINE_LEFT')),right:line(n('LANELINE_RIGHT')),pathColor:n('CENTERLINE')===1?'green':'none',leftFill:n('LANE_LEFT')===1?'green':false,rightFill:n('LANE_RIGHT')===1?'green':false,centerFill:({1:'green',2:'white',3:'blue',4:'orange',5:'red'})[n('LANE_HIGHLIGHT')]||false};
    const position=menus.find(m=>m.bank==='lanes'&&m.menu===48&&m.value===n('LANELINE_RIGHT_POSITION'));
    if(position)result.graphic.rightOffsetNormalized=position.graphic.rightOffsetNormalized;
    result.circle=n('CAR_CIRCLE');result.hda=n('HDA_ICON');result.lfa=n('LFA_ICON');result.setSpeed=n('vSetDis');result.setStyle=n('SETSPEED');
    for(const [signal,bank,key] of [['ALERTS_4','v1','center'],['ALERTS_5','v2','right']]){
      const definition=schema.messages.find(m=>m.address===353).signals.find(s=>s.name===signal);
      const value=n(signal),observed=menus.find(m=>m.bank===bank&&m.codes?.includes(value)&&m.kind==='message');
      // 번호 일치와 DBC 열거값이 함께 있는 관찰 문구만 참고 표시합니다.
      result[key]=value!==0&&definition.values[String(value)]&&observed?observed:null;
    }
    return result;
  }
  const api={bytes,positions,decode,change,hex,parseLog,preview,displayed};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ClusterCAN=api;
})(globalThis);

