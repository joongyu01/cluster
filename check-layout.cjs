const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = JSON.parse(fs.readFileSync('src/menus.json', 'utf8'));
const source = fs.readFileSync('src/app.js', 'utf8');
assert.equal(data.length, 245);
assert.equal(new Set(data.map(m => m.id)).size, 245);
for (const [bank, count] of [['v1', 255], ['v2', 32]]) {
  const codes = data.filter(m => m.bank === bank).flatMap(m => m.codes);
  assert.deepEqual(codes.sort((a, b) => a - b), Array.from({length: count}, (_, i) => i));
}
// 보수적인 전각 글자 폭으로 줄바꿈을 검사합니다. 실제 폰트 렌더링 검사는 별도입니다.
const ctx = {font: '', measureText(text) {
  return {width: Array.from(text).length * Number(this.font.match(/(\d+)px/)[1])};
}};
const sandbox = {ctx, $: () => ({}), getComputedStyle: () => ({fontFamily: 'sans-serif'})};
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('  function breakLines('), source.indexOf('  function svgText(')), sandbox);
for (const m of data.filter(m => m.kind === 'message')) {
  const central = m.surface === 'center';
  const width = central ? 258 : 220, height = central ? 60 : 84;
  const fit = sandbox.fitText(m.text, width, height, central ? 18 : 20);
  assert.ok(fit.lines.length * fit.step <= height, m.id + ': text height');
  assert.equal(fit.lines.join('').replace(/\s/g, ''), m.text.replace(/\s/g, ''), m.id + ': original text');
  for (const line of fit.lines) assert.ok(ctx.measureText(line).width <= width, m.id + ': text width');
}
const html = fs.readFileSync('index.html', 'utf8');
const embedded = html.match(/<script id="message-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
assert.deepEqual(JSON.parse(embedded), data);
assert.ok(!/__PROJECT_(STYLE|DATA|JS)__/.test(html));
console.log('PASS: 245 records, complete code ranges, text layout bounds and built data');
