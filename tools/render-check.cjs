// 개발용: NODE_PATH에 설치된 xml-js / sharp 경로를 지정합니다. HTML 실행에는 불필요합니다.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const xml = require('xml-js');
const sharp = require('sharp');
const source = fs.readFileSync('src/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const data = JSON.parse(fs.readFileSync('src/menus.json', 'utf8'));
const widths = require('./font-widths.json');
const svgStart = html.indexOf('<svg class="cluster-svg"');
const svgSource = html.slice(svgStart, html.indexOf('</svg></div>', svgStart) + 6);
const tree = xml.xml2js(svgSource);
const elements = new Map();
class Element {
  constructor(raw) {
    this.raw = raw;
    this.raw.attributes ||= {};
    if (raw.attributes.id) elements.set(raw.attributes.id, this);
    (raw.elements || []).filter(n => n.type === 'element').forEach(n => new Element(n));
    this.style = new Proxy({}, {set: (_, key, value) => {
      const styles = Object.fromEntries((raw.attributes.style || '').split(';').filter(Boolean).map(s => s.split(':')));
      if (value === '') delete styles[key]; else styles[key] = value;
      raw.attributes.style = Object.entries(styles).map(([k, v]) => k + ':' + v).join(';');
      return true;
    }});
    this.classList = {toggle() {}};
  }
  setAttribute(name, value) { this.raw.attributes[name] = String(value); }
  getAttribute(name) { return this.raw.attributes[name]; }
  set textContent(value) { this.raw.elements = [{type: 'text', text: String(value)}]; }
  get textContent() {
    const text = n => n.type === 'text' ? n.text : (n.elements || []).map(text).join('');
    return text(this.raw);
  }
  replaceChildren() { this.raw.elements = []; }
  appendChild(node) { (this.raw.elements ||= []).push(node.raw); }
  querySelector() { return new Element({type: 'element', name: 'span'}); }
}
new Element(tree.elements[0]);
const get = id => {
  if (!elements.has(id)) elements.set(id, new Element({type: 'element', name: 'div'}));
  return elements.get(id);
};
get('message-data').textContent = JSON.stringify(data);
get('speed-control-value').textContent = '91';
const ctx = {font: '', measureText(text) {
  const size = Number(this.font.match(/(\d+)px/)[1]);
  return {width: Array.from(text).reduce((n, c) => n + (widths[c] ?? 100), 0) * size / 100};
}};
const sandbox = {
  document: {getElementById: get, createElement: () => ({getContext: () => ctx}), createElementNS: (_, name) => new Element({type: 'element', name})},
  matchMedia: () => ({matches: false}), getComputedStyle: () => ({fontFamily: 'Malgun Gothic'}),
};
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf("  'use strict';"), source.indexOf('  function renderOptions()')), sandbox);
const render = (id, number = null) => vm.runInContext(`selected=${JSON.stringify(id)};currentNumber=${number};renderCluster();`, sandbox);
for (const m of data) {
  render(m.id);
  if (m.kind !== 'message') continue;
  const node = get(m.surface === 'center' ? 'center-message-text' : 'right-message-text');
  assert.equal(node.textContent.replace(/\s/g, ''), m.text.replace(/\s/g, ''), m.id);
  for (const line of node.raw.elements) {
    const y = Number(line.attributes.y);
    const size = Number(node.getAttribute('font-size'));
    assert.ok(Number.isFinite(y) && y - size > (m.surface === 'center' ? 111 : 121), m.id);
    if (m.surface === 'center') assert.ok(y + size * .25 < 111 + Number(get('center-box').getAttribute('height')), m.id);
    else {
      ctx.font = '400 ' + size + 'px Malgun Gothic';
      const halfWidth = ctx.measureText(line.elements[0].text).width / 2;
      const edge = Math.max(Math.abs(y - size - 272), Math.abs(y + size * .25 - 272));
      assert.ok(Math.hypot(halfWidth, edge) < 147, m.id + ': circle text bounds');
    }
  }
}
// 이미지와 함께 실제 렌더 함수가 기록하는 차선·내비게이션 속성을 검사합니다.
const lane = code => data.find(m => m.bank === 'lanes' && m.code === code);
render(lane('45-8').id); assert.notEqual(get('lane-left').getAttribute('stroke-dasharray'), 'none');
render(lane('48-0').id); const position0 = get('lane-right').getAttribute('d');
render(lane('48-17').id); assert.notEqual(get('lane-right').getAttribute('d'), position0);
render(lane('53-1').id); assert.ok(!get('lane-left-fill').getAttribute('style')?.includes('display:none') || !get('lane-right-fill').getAttribute('style')?.includes('display:none'));
for (const code of [74, 75, 91, 92, 228, 229, 230, 231]) {
  const m = data.find(m => m.bank === 'v1' && m.codes?.includes(code));
  render(m.id, code);
  assert.ok(!get('nav-banner').getAttribute('style')?.includes('display:none'), 'navigation ' + code);
}
async function main() {
  fs.mkdirSync('previews', {recursive: true});
  const cases = [
    ['reference', 'v1-message-1'], ['long-message', 'v1-message-28'],
    ['right-message', data.find(m => m.bank === 'v2' && m.codes?.includes(22)).id],
    ['camera', data.find(m => m.bank === 'v1' && m.codes?.includes(74)).id, 74],
    ['lane', lane('45-8').id],
  ];
  for (const icon of ['scc', 'lfa', 'hda']) {
    const menu = data.find(m => m.surface === 'right' && m.icon?.includes(icon));
    if (menu) cases.push([icon, menu.id]);
  }
  cases.push(['right-zoom', cases[2][1], null, true], ['lane-zoom', lane('48-17').id, null, true]);
  for (const [name, id, number, zoom] of cases) {
    vm.runInContext(`zoom=${!!zoom}`, sandbox);
    render(id, number ?? null);
    const root = tree.elements[0];
    root.attributes.xmlns = 'http://www.w3.org/2000/svg';
    const [, , width, height] = root.attributes.viewBox.split(' ').map(Number);
    root.attributes.width = String(zoom ? width * 2 : 1600);
    root.attributes.height = String(zoom ? height * 2 : 600);
    root.attributes['font-family'] = 'Malgun Gothic';
    root.attributes['font-weight'] = '400';
    const svg = xml.js2xml(tree);
    fs.writeFileSync(`previews/${name}.svg`, svg);
    await sharp(Buffer.from(svg)).png().toFile(`previews/${name}.png`);
  }
  console.log('PASS: all 245 menu renders, circular text bounds, lane geometry, navigation coexistence; ' + cases.length + ' SVG/PNG previews');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
