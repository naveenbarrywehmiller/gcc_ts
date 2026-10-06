"""Create an isolated Desktop QA copy in TEMP; never put test data in the report."""
import base64
import json
import pathlib
import re
import shutil
import tempfile

root=pathlib.Path(__file__).resolve().parents[1]
target=pathlib.Path(tempfile.mkdtemp(prefix='gcc-powerbi-qa-'))
shutil.copytree(root/'powerbi/GCC_Requirements',target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.pbi'))
fixture=base64.b64encode((root/'scripts/powerbi-fixture.json').read_bytes()).decode()
replacements={
    'fnApi':'(endpoint as text) as list => Record.Field(Json.Document(Binary.FromText("'+fixture+'",BinaryEncoding.Base64)),endpoint)',
    'RefreshClock':'DateTimeZone.SwitchZone(#datetimezone(2026,10,1,12,0,0,0,0), 5, 30)',
}
tmdl=target/'GCC_Requirements.SemanticModel/definition/expressions.tmdl'
if tmdl.exists():
    source=tmdl.read_text(encoding='utf-8-sig')
    for name,value in replacements.items():
        # Only two expression bodies in this temporary synthetic copy; retain lineage metadata.
        pattern=r'^expression '+re.escape(name)+r' =.*?(?=\n\tlineageTag:)'
        source,count=re.subn(pattern,lambda _: 'expression '+name+' = '+value,source,flags=re.M|re.S)
        if count!=1:
            raise ValueError('Expected exactly one TMDL expression: '+name)
    tmdl.write_text(source,encoding='utf-8')
else:
    p=target/'GCC_Requirements.SemanticModel/model.bim'
    model=json.loads(p.read_text(encoding='utf-8'))
    for expression in model['model']['expressions']:
        if expression['name'] in replacements:
            expression['expression']=replacements[expression['name']]
    p.write_text(json.dumps(model),encoding='utf-8')
for visual in (target/'GCC_Requirements.Report/definition/pages').glob('*/visuals/*/visual.json'):
    v=json.loads(visual.read_text())
    if v['position']['y']==18:
        v['visual']['objects']['general'][0]['properties']['paragraphs'][0]['textRuns'][0]['value']='QA • SYNTHETIC DATA | '+v['visual']['objects']['general'][0]['properties']['paragraphs'][0]['textRuns'][0]['value']
        visual.write_text(json.dumps(v),encoding='utf-8')
(target/'GCC_Requirements.pbip').rename(target/'GCC_TEST_DATA_QA.pbip')
print(target/'GCC_TEST_DATA_QA.pbip')
