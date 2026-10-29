"""Extract the cluster messages without importing or running vehicle code."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

repo = Path(sys.argv[1]).resolve()
base = repo / 'opendbc_repo/opendbc'
dbc = base / 'dbc/generator/hyundai/hyundai_canfd.dbc'
controller = base / 'car/hyundai/hyundaicanfd.py'
messages = []
current = None
for line in dbc.read_text(encoding='utf-8').splitlines():
    match = re.match(r'BO_ (\d+) (\w+): (\d+) ', line)
    if match:
        address, name, length = match.groups()
        current = None
        if int(address) in (353, 354, 490, 512):
            current = dict(address=int(address), name=name, length=int(length), signals=[])
            messages.append(current)
    signal = re.match(r'\s*SG_ (\w+) : (\d+)\|(\d+)@(\d)([+-]) \(([^,]+),([^\)]+)\) \[([^|]+)\|([^\]]+)\] "([^"]*)"', line)
    if current and signal:
        name, start, size, endian, sign, factor, offset, lo, hi, unit = signal.groups()
        current['signals'].append(dict(name=name, start=int(start), size=int(size), little=endian=='1', signed=sign=='-', factor=float(factor), offset=float(offset), min=float(lo), max=float(hi), unit=unit, values={}))
for address, name, values in re.findall(r'^VAL_ (\d+) (\w+) (.*);', dbc.read_text(encoding='utf-8'), re.M):
    message = next((m for m in messages if m['address']==int(address)), None)
    if message:
        signal = next((s for s in message['signals'] if s['name']==name), None)
        if signal:
            signal['values'] = dict(re.findall(r'(-?\d+) "([^"]*)"', values))
constants = {}
for node in ast.parse(controller.read_text(encoding='utf-8')).body:
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id.startswith('CLUSTER_TEST_FIELDS'):
        constants[node.targets[0].id] = ast.literal_eval(node.value)
for message, constant in zip(messages, ['CLUSTER_TEST_FIELDS_161','CLUSTER_TEST_FIELDS','CLUSTER_TEST_FIELDS_1EA','CLUSTER_TEST_FIELDS_200']):
    assert message['address'] == dict(CLUSTER_TEST_FIELDS_161=353, CLUSTER_TEST_FIELDS=354, CLUSTER_TEST_FIELDS_1EA=490, CLUSTER_TEST_FIELDS_200=512)[constant]
    for menu, name in constants[constant].items():
        signal = next(s for s in message['signals'] if s['name']==name)
        signal['testMenu'] = menu
sha = subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
schema = dict(source=dict(repository='https://github.com/ajouatom/openpilot', commit=sha, dbcPath=str(dbc.relative_to(repo)).replace('\\','/'), controllerPath=str(controller.relative_to(repo)).replace('\\','/'), dbcSha256=hashlib.sha256(dbc.read_bytes()).hexdigest()), messages=messages)
assert len(messages)==4 and all(m['signals'] for m in messages)
root = Path(__file__).resolve().parents[1]
(root/'src/can-schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'THIRD_PARTY_NOTICES.md').write_text('# CarrotPilot / opendbc DBC definitions\n\nSource: '+schema['source']['repository']+'/tree/'+sha+'\n\nThe bundled signal definitions and test-field mapping are extracted from the source above.\n\n'+(repo/'opendbc_repo/LICENSE').read_text(encoding='utf-8'),encoding='utf-8')
print('Imported',len(messages),'messages,',sum(len(m['signals']) for m in messages),'signals')
