"""Create an isolated Desktop QA copy in TEMP; never put test data in the report."""
import base64
import json
import pathlib
import shutil
import tempfile

root=pathlib.Path(__file__).resolve().parents[1]
target=pathlib.Path(tempfile.mkdtemp(prefix='gcc-powerbi-qa-'))
shutil.copytree(root/'powerbi/GCC_Requirements',target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.pbi'))
p=target/'GCC_Requirements.SemanticModel/model.bim'
model=json.loads(p.read_text(encoding='utf-8'))
fixture=base64.b64encode((root/'scripts/powerbi-fixture.json').read_bytes()).decode()
for expression in model['model']['expressions']:
    if expression['name']=='fnApi':
        expression['expression']='(endpoint as text) as list => Record.Field(Json.Document(Binary.FromText("'+fixture+'",BinaryEncoding.Base64)),endpoint)'
    elif expression['name']=='RefreshClock':
        expression['expression']='#datetimezone(2026,10,1,12,0,0,0,0)'
p.write_text(json.dumps(model),encoding='utf-8')
for visual in (target/'GCC_Requirements.Report/definition/pages').glob('*/visuals/*/visual.json'):
    v=json.loads(visual.read_text())
    if v['position']['y']==18:
        v['visual']['objects']['general'][0]['properties']['paragraphs'][0]['textRuns'][0]['value']='QA • SYNTHETIC DATA | '+v['visual']['objects']['general'][0]['properties']['paragraphs'][0]['textRuns'][0]['value']
        visual.write_text(json.dumps(v),encoding='utf-8')
(target/'GCC_Requirements.pbip').rename(target/'GCC_TEST_DATA_QA.pbip')
print(target/'GCC_TEST_DATA_QA.pbip')
