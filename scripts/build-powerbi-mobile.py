"""Author native PBIR phone layouts without changing desktop visuals or the model.

Run with Desktop closed. --check validates the saved phone geometry without edits.
Mobile formatting uses Microsoft's public visualContainerMobileState schema.
"""
import argparse
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / 'powerbi/GCC_Requirements/GCC_Requirements.Report/definition/pages'
SCHEMA = ('https://developer.microsoft.com/json-schemas/fabric/item/report/'
          'definition/visualContainerMobileState/2.7.0/schema.json')
WIDTH, MARGIN, GAP = 324, 8, 8
CONTENT = WIDTH - 2 * MARGIN


def expr(value):
    return {'expr': {'Literal': {'Value': value}}}


def number(value):
    return expr(f'{value}D')


def obj(**properties):
    return [{'properties': properties}]


def formatting(visual):
    kind = visual['visual']['visualType']
    name = visual['name']
    state = {'$schema': SCHEMA}
    if kind == 'textbox':
        state['objects'] = copy.deepcopy(visual['visual']['objects'])
        heading = name.endswith('_01')
        for paragraph in state['objects']['general'][0]['properties']['paragraphs']:
            for run in paragraph['textRuns']:
                run.setdefault('textStyle', {})['fontSize'] = '17pt' if heading else '10.5pt'
                if name.endswith('_refresh_help'):
                    run['value'] = ('Data is a saved snapshot. Desktop owner: Home > Refresh > Data. '
                                    'Auto-refresh is off. Swipe wide tables sideways for all columns.')
        return state
    state['visualContainerObjects'] = {'title': obj(fontSize=number(11), titleWrap=expr('true'))}
    if kind == 'card':
        clock = name.endswith('_refresh_time')
        state['objects'] = {'labels': obj(fontSize=number(10 if clock else 22)),
                            'categoryLabels': obj(show=expr('false'))}
        # Longer KPI names wrap instead of being shortened or losing their meaning.
        state['visualContainerObjects']['title'] = obj(fontSize=number(10 if not clock else 9),
                                                       titleWrap=expr('true'))
        if clock:
            color = {'solid': {'color': expr("'#64748B'")}}
            state['objects']['labels'][0]['properties']['color'] = copy.deepcopy(color)
            state['visualContainerObjects']['title'][0]['properties']['fontColor'] = color
            state['visualContainerObjects'].update({
                'background': obj(show=expr('false'), transparency=number(100)),
                'border': obj(show=expr('false')), 'dropShadow': obj(show=expr('false')),
            })
    elif kind == 'slicer':
        state['objects'] = {'items': obj(fontSize=number(12)), 'header': obj(show=expr('false'))}
    elif kind in ('clusteredColumnChart', 'lineChart'):
        state['objects'] = {'categoryAxis': obj(fontSize=number(10)),
                            'valueAxis': obj(fontSize=number(10)),
                            'legend': obj(fontSize=number(10))}
    elif kind == 'tableEx':
        columns = visual['visual']['query']['queryState']['Values']['projections']
        sizes = []
        for col in columns:
            ref = col['queryRef']
            if ref.startswith('InputStatus.'):
                size = {'InputStatus.Requirement': 62, 'InputStatus.Status': 50,
                        'InputStatus.Definition': 150}[ref]
            elif ref.endswith('.id'):
                size = 42
            elif ref.endswith('.date') or ref.endswith('Date') or ref.endswith('date'):
                size = 88
            elif ref.endswith('employeeName') or ref.endswith('projectName'):
                size = 120
            elif ref.endswith('department') or ref.endswith('divisionName'):
                size = 100
            else:
                size = 84
            sizes.append({'properties': {'value': number(size)}, 'selector': {'metadata': ref}})
        state['objects'] = {
            'values': obj(fontSize=number(10), wordWrap=expr('true')),
            'columnHeaders': obj(fontSize=number(10), wordWrap=expr('true'),
                                 autoSizeColumnWidth=expr('false'),
                                 columnAdjustment=expr("'fixedWidth'"), defaultColumnWidth=number(84)),
            'grid': obj(rowPadding=number(6)), 'columnWidth': sizes,
        }
    else:
        raise ValueError(f'Unhandled phone visual: {name} / {kind}')
    return state


def build_page(page_name):
    folder = PAGES / page_name / 'visuals'
    visuals = [json.loads(p.read_text(encoding='utf-8')) for p in sorted(folder.glob('*/visual.json'))]
    states = {v['name']: formatting(v) for v in visuals}
    y, order = MARGIN, 0

    def place(v, height, x=MARGIN, width=CONTENT, advance=True):
        nonlocal y, order
        order += 1
        states[v['name']]['position'] = dict(x=x, y=y, width=width, height=height, z=order, tabOrder=order)
        if advance:
            y += height + GAP

    def named(suffix):
        return next(v for v in visuals if v['name'] == page_name + suffix)

    place(named('_01'), 64)
    place(named('_refresh_time'), 52)
    for v in visuals:
        if v['visual']['visualType'] == 'slicer':
            place(v, 104)
    cards = [v for v in visuals if v['visual']['visualType'] == 'card'
             and not v['name'].endswith('_refresh_time')]
    for i in range(0, len(cards), 2):
        pair = cards[i:i+2]
        if len(pair) == 1:
            place(pair[0], 112)
        else:
            place(pair[0], 112, width=150, advance=False)
            place(pair[1], 112, x=166, width=150)
    place(named('_02'), 104)
    for v in visuals:
        if v['visual']['visualType'] in ('clusteredColumnChart', 'lineChart'):
            place(v, 288)
    place(named('_refresh_help'), 104)
    for v in visuals:
        if v['visual']['visualType'] == 'tableEx':
            height = 640 if page_name == '09_inputs' and v['name'].endswith('_03') else 400
            if page_name == '09_inputs' and v['name'].endswith('_04'):
                height = 180
            place(v, height)
    for name, state in states.items():
        if 'position' not in state:
            raise ValueError('Visual omitted from phone layout: ' + name)
        (folder / name / 'mobile.json').write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')


def validate():
    order = json.loads((PAGES / 'pages.json').read_text())['pageOrder']
    evidence = {'canvasWidth': WIDTH, 'pages': [], 'errors': []}
    for page_name in order:
        folder = PAGES / page_name
        page = json.loads((folder / 'page.json').read_text())
        placed = []
        for p in sorted((folder / 'visuals').glob('*/visual.json')):
            mobile = p.with_name('mobile.json')
            if not mobile.exists():
                evidence['errors'].append('Missing phone visual: ' + p.parent.name)
                continue
            state = json.loads(mobile.read_text())
            pos = state['position']
            if pos['x'] < MARGIN or pos['x'] + pos['width'] > WIDTH - MARGIN or pos['y'] < 0:
                evidence['errors'].append('Outside phone width: ' + p.parent.name)
            if min(pos['width'], pos['height']) <= 0:
                evidence['errors'].append('Nonpositive phone size: ' + p.parent.name)
            for name, other in placed:
                if (pos['x'] < other['x'] + other['width'] and other['x'] < pos['x'] + pos['width']
                        and pos['y'] < other['y'] + other['height'] and other['y'] < pos['y'] + pos['height']):
                    evidence['errors'].append(f'Phone overlap: {name}, {p.parent.name}')
            placed.append((p.parent.name, pos))
        evidence['pages'].append({'name': page_name, 'displayName': page['displayName'],
                                  'visuals': len(placed),
                                  'height': max((v['y'] + v['height'] + MARGIN for _, v in placed), default=0)})
    evidence['mobilePages'] = len(evidence['pages'])
    evidence['mobileVisuals'] = sum(p['visuals'] for p in evidence['pages'])
    (ROOT / 'powerbi/validation/mobile-layout-validation.json').write_text(
        json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))
    if evidence['errors']:
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check saved layout only; do not generate it.')
    args = parser.parse_args()
    if not args.check:
        for page_name in json.loads((PAGES / 'pages.json').read_text())['pageOrder']:
            build_page(page_name)
    validate()
