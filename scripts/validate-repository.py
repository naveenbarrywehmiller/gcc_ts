"""Check repository-owned links, imports and product paths without dependencies."""
from pathlib import Path
import glob
import json
import re
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', '.agents', 'node_modules', 'dist', '.pbi', '__pycache__', 'schema-cache', 'unified-review', 'graphify-out'}


def files(root):
    for path in root.iterdir():
        if path.name in SKIP or path.is_symlink():
            continue
        if path.is_dir():
            yield from files(path)
        else:
            yield path


def prose(text):
    return re.sub(r'^(`{3,}|~{3,})[^\n]*\n.*?^\1[^\n]*$', '', text, flags=re.M | re.S)


def anchors(text):
    found = set()
    counts = {}
    for heading in re.findall(r'^#{1,6}\s+(.+?)(?:\s+#+)?$', prose(text), flags=re.M):
        heading = re.sub(r'!?\[([^]]+)\]\([^)]*\)', r'\1', heading)
        slug = re.sub(r'[^\w\- ]', '', heading.lower()).replace(' ', '-')
        count = counts.get(slug, 0)
        found.add(slug + (f'-{count}' if count else ''))
        counts[slug] = count + 1
    found.update(re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)', text))
    return found


def markdown_errors(path, root):
    text = prose(path.read_text(encoding='utf-8-sig'))
    links = re.findall(r'!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)', text)
    links += re.findall(r'^\[[^]]+\]:\s*(\S+)', text, flags=re.M)
    errors = []
    for link in links:
        link = link.strip('<>')
        url = urlsplit(link)
        if url.scheme or url.netloc or link.startswith('/'):
            continue
        target = (path.parent / unquote(url.path)).resolve() if url.path else path
        if not target.is_relative_to(root.resolve()) or not target.exists():
            errors.append(f'{path.relative_to(root)}: missing target {link}')
        elif url.fragment and target.suffix.lower() == '.md':
            if unquote(url.fragment) not in anchors(target.read_text(encoding='utf-8-sig')):
                errors.append(f'{path.relative_to(root)}: missing anchor {link}')
    return errors, len(links)


def resolve_import(path):
    return (path.is_file() or any(Path(str(path) + ext).is_file() for ext in ('.js', '.jsx', '.mjs', '.cjs', '.json'))
            or (path.is_dir() and ((path / 'package.json').is_file() or (path / 'index.js').is_file())))


def validate(root):
    errors = []
    counts = {'markdown_files': 0, 'local_and_external_links': 0, 'relative_imports': 0}
    owned = list(files(root))
    for path in owned:
        if path.suffix.lower() == '.md':
            issues, count = markdown_errors(path, root)
            errors.extend(issues)
            counts['markdown_files'] += 1
            counts['local_and_external_links'] += count
        if path.suffix in ('.js', '.jsx', '.mjs', '.cjs'):
            text = path.read_text(encoding='utf-8-sig')
            imports = re.findall(r'(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)["\'](\.[^"\']+)["\']', text)
            for name in imports:
                counts['relative_imports'] += 1
                if not resolve_import(path.parent / name.split('?')[0]):
                    errors.append(f'{path.relative_to(root)}: unresolved import {name}')
    for rel in ('package.json', 'client/package.json', 'server/package.json'):
        manifest = json.loads((root / rel).read_text())
        lock = json.loads((root / rel.replace('package.json', 'package-lock.json')).read_text())
        if manifest['name'] != lock['name'] or manifest['name'] != lock['packages']['']['name']:
            errors.append(f'{rel}: package/lockfile names differ')
        for kind in ('dependencies', 'devDependencies'):
            if manifest.get(kind, {}) != lock['packages'][''].get(kind, {}):
                errors.append(f'{rel}: {kind} differ from lockfile')
    for rel in ('client/src/main.jsx', 'server/src/index.js', 'shared/accessPolicy.json',
                'deploy/linux-admin/install.sh', 'deploy/linux-admin/timesheet',
                '.github/workflows/linux-admin.yml', 'release-please-config.json', '.release-please-manifest.json'):
        if not (root / rel).is_file():
            errors.append(f'Missing entry point: {rel}')
    projects = list((root / 'powerbi/GCC_Dashboard').glob('*.pbip'))
    if len(projects) != 1:
        errors.append('Expected exactly one active dashboard PBIP')
    else:
        project = json.loads(projects[0].read_text(encoding='utf-8-sig'))
        for artifact in project['artifacts']:
            report = projects[0].parent / artifact['report']['path']
            try:
                definition = json.loads((report / 'definition.pbir').read_text(encoding='utf-8-sig'))
                model = (report / definition['datasetReference']['byPath']['path']).resolve()
                if not (model / 'definition.pbism').is_file() or not (model / 'definition').is_dir():
                    errors.append('PBIP report does not resolve its TMDL model')
                if (model / 'model.bim').exists():
                    errors.append('Active model contains both TMDL and BIM')
            except (OSError, KeyError) as exc:
                errors.append(f'PBIP mapping failed: {exc}')
    for line in (root / 'Dockerfile').read_text().splitlines():
        if line.startswith('COPY ') and '--from=' not in line:
            for source in line.split()[1:-1]:
                if not glob.glob(str(root / source)):
                    errors.append(f'Docker COPY source does not exist: {source}')
    for path in owned:
        if path.suffix in ('.js', '.jsx', '.py', '.ps1', '.yml', '.yaml', '.json'):
            text = path.read_text(encoding='utf-8-sig')
            if 'deploy/' + 'ubuntu/' in text or 'powerbi/' + 'GCC_Requirements/' in text:
                errors.append(f'{path.relative_to(root)}: obsolete operational path')
    return counts, errors


def self_test():
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        (root / 'docs').mkdir()
        (root / 'README.md').write_text('# Example\n\n## Setup\n\n## Setup\n', encoding='utf-8')
        source = root / 'docs/guide.md'
        source.write_text('[OK](../README.md#setup-1)\n[web](https://example.invalid)\n```md\n[example](missing.md)\n```\n', encoding='utf-8')
        assert not markdown_errors(source, root)[0], 'valid links/fenced examples failed'
        source.write_text('[bad](../README.md#missing)\n[bad](missing.md)\n', encoding='utf-8')
        assert len(markdown_errors(source, root)[0]) == 2, 'broken path/anchor not detected'
        (root / 'module.jsx').write_text('', encoding='utf-8')
        assert resolve_import(root / 'module') and not resolve_import(root / 'missing')
    print('Mapping validator self-checks passed')


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        self_test()
    else:
        counts, errors = validate(ROOT)
        print(json.dumps({'checked': counts, 'errors': errors}, indent=2))
        sys.exit(bool(errors))
