// UI state tests; real browser layout is checked separately after publication.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const can=require('./src/can.js');
const html=fs.readFileSync('src/template.html','utf8');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.dataset={};this.checked=false;this.disabled=false;this.hidden=false;this._value='';this.textContent='';this.classes=new Set();this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n),toggle:(n,v)=>v?this.classes.add(n):this.classes.delete(n)};}
  set value(v){this._value=String(v);}get value(){return this._value;}
  get options(){return this.children;}
  appendChild(c){this.children.push(c);if(this.tag==='select'&&this.children.length===1)this.value=c.value;return c;}
  append(...nodes){nodes.forEach(n=>this.appendChild(n));}
  replaceChildren(){this.children=[];if(this.tag==='select')this.value='';}
  setAttribute(k,v){this.attributes[k]=String(v);}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
  fire(type,extra={}){for(const f of this.listeners[type]||[])f({target:this,preventDefault(){},...extra});}
}
const nodes=new Map();
for(const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  assert.ok(!nodes.has(match[2]),'duplicate id '+match[2]);
  const n=new Element(match[1]);n.checked=/\bchecked\b/.test(match[0]);nodes.set(match[2],n);
}
const $=id=>{assert.ok(nodes.has(id),'missing element '+id);return nodes.get(id);};
$('can-schema').textContent=fs.readFileSync('src/can-schema.json','utf8');$('message-data').textContent=fs.readFileSync('src/menus.json','utf8');
const modes=['menu','dbc','log','pilot'].map(mode=>{const n=new Element('button');n.dataset.mode=mode;return n;});
const quick=[...html.matchAll(/data-signal="([^"]+)"/g)].map(m=>{const n=new Element('button');n.dataset.signal=m[1];return n;});
const selectedPanel=new Element(),events=[],listeners={},timers=new Map();let serial=0;
const document={getElementById:$,createElement:t=>new Element(t),createTextNode:t=>({textContent:String(t)}),querySelector:s=>{assert.equal(s,'.message-panel');return selectedPanel;},querySelectorAll:s=>s==='.mode-nav button'?modes:s==='.quick-signals button'?quick:[],addEventListener:(n,f)=>(listeners[n]??=[]).push(f),dispatchEvent:e=>{events.push(e);for(const f of listeners[e.type]||[])f(e);}};
const context={document,window:{addEventListener(){}},ClusterCAN:can,Uint8Array,Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},setInterval:f=>{timers.set(++serial,f);return serial;},clearInterval:id=>timers.delete(id)};
vm.runInNewContext(fs.readFileSync('src/can-ui.js','utf8'),context);
const preview=()=>events.filter(e=>e.type==='cluster-can-preview').at(-1)?.detail;
modes[1].fire('click');assert.equal($('can-panel').hidden,false);assert.equal($('mode-menu-panel').hidden,true);assert.equal(selectedPanel.hidden,true);
assert.equal($('can-signal').value,'LANELINE_LEFT');assert.ok($('can-signal').options.length<30);
$('can-value').value='8';$('can-apply').fire('click');assert.equal(preview().graphic.left.style,'dashed');assert.equal($('change-count').textContent,'1개');
$('can-value').value='99';$('can-apply').fire('click');assert.ok($('can-status').classes.has('error'));assert.equal(preview().graphic.left.style,'dashed');
quick.find(n=>n.dataset.signal==='ALERTS_4').fire('click');$('can-value').value='240';$('can-value').fire('keydown',{key:'Enter'});assert.equal(preview().center.codes[0],240);
$('can-plus').fire('click');assert.equal(preview().center.codes[0],241);
modes[0].fire('click');assert.equal(preview(),null);assert.equal(selectedPanel.hidden,false);assert.equal($('can-panel').hidden,true);
modes[1].fire('click');assert.equal(preview().center.codes[0],241);
$('can-message').value=490;$('can-message').fire('change');assert.ok($('can-signal').options.length>0);assert.equal($('can-mapped').disabled,true);
$('can-demo').fire('click');assert.equal($('cluster-app').dataset.mode,'log');assert.equal($('can-frame-count').textContent,'1 / 4');assert.equal($('signal-controls').hidden,true);
$('can-next').fire('click');assert.equal($('can-frame-count').textContent,'2 / 4');assert.equal(preview().hda,5);assert.equal($('change-count').textContent,'6개');
modes[1].fire('click');$('can-value').value='6';$('can-apply').fire('click');assert.equal(preview().graphic.left.style,'solid');modes[2].fire('click');assert.equal(preview().graphic.left.style,'dashed');
$('can-play').fire('click');assert.equal(timers.size,1);modes[0].fire('click');assert.equal(timers.size,0);
modes[2].fire('click');$('can-play').fire('click');for(const f of [...timers.values()])f();for(const f of [...timers.values()])f();assert.equal($('can-frame-count').textContent,'4 / 4');assert.equal(timers.size,0);
$('can-clear').fire('click');assert.equal($('can-frame-count').textContent,'0 / 0');assert.equal($('can-play').disabled,true);assert.equal(preview(),null);
modes[3].fire('click');assert.equal($('pilot-panel').hidden,false);assert.equal($('can-panel').hidden,true);assert.equal(selectedPanel.hidden,true);
modes[0].fire('click');assert.equal($('pilot-panel').hidden,true);
console.log('PASS: workspace modes, mapped signals, presets, value validation, 240/241, changes, log playback and timer cleanup');
