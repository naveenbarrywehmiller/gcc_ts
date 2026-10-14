#!/usr/bin/env bash
# Downloadable bootstrap; verifies a tagged release checksum before installation.
set -Eeuo pipefail
if [[ $EUID != 0 ]]; then exec sudo bash "$0" "$@"; fi
umask 077
mkdir -p /var/log/gcc-timesheet-admin
chmod 700 /var/log/gcc-timesheet-admin
log=/var/log/gcc-timesheet-admin/install.log
if [[ -f "$log" ]] && [[ $(stat -c %s "$log") -gt 5242880 ]]; then
  for i in 4 3 2 1; do
    [[ ! -f "$log.$i" ]] || mv "$log.$i" "$log.$((i+1))"
  done
  mv "$log" "$log.1"
fi
exec > >(tee -a "$log") 2>&1
trap 'code=$?; printf "[%s] ERROR installer line %s exit %s\n" "$(date -Is)" "$LINENO" "$code"; exit "$code"' ERR
printf '[%s] Starting TimeSheet Admin installer\n' "$(date -Is)"
. /etc/os-release
[[ "$ID" == ubuntu && ( "$VERSION_ID" == 24.04 || "$VERSION_ID" == 26.04 ) ]] || {
  echo 'Ubuntu 24.04 or 26.04 LTS required.'; exit 1;
}
apt-get update
apt-get install -y python3 ca-certificates curl
python3 - "${1:-}" <<'PY'
import hashlib, json, pathlib, re, subprocess, sys, tarfile, tempfile, urllib.request
repo = 'naveenbarrywehmiller/gcc_ts'
prefix = 'timesheet-admin-v'
asset = 'gcc-timesheet-admin.tar.gz'
def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'gcc-timesheet-bootstrap'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024: raise ValueError('Download too large')
    return data
tag = sys.argv[1]
if not tag:
    releases = []
    for page in range(1, 11):
        rows = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases?per_page=100&page={page}'))
        releases.extend(r for r in rows if not r['draft'] and not r['prerelease'] and re.fullmatch(prefix + r'\d+\.\d+\.\d+', r['tag_name']))
        if len(rows) < 100: break
    if not releases: raise RuntimeError('No stable administrator release published')
    tag = max(releases, key=lambda r: tuple(map(int, r['tag_name'][len(prefix):].split('.'))))['tag_name']
if not re.fullmatch(prefix + r'\d+\.\d+\.\d+', tag): raise ValueError('Invalid administrator tag')
with tempfile.TemporaryDirectory(prefix='timesheet-install-') as temp:
    directory = pathlib.Path(temp)
    url = f'https://github.com/{repo}/releases/download/{tag}/{asset}'
    data = fetch(url)
    checksum = fetch(url + '.sha256').decode().split()[0]
    if hashlib.sha256(data).hexdigest() != checksum: raise ValueError('Release checksum mismatch')
    path = directory / asset
    path.write_bytes(data)
    with tarfile.open(path) as archive:
        total = 0
        for item in archive.getmembers():
            parts = pathlib.PurePosixPath(item.name)
            if parts.is_absolute() or '..' in parts.parts or not parts.parts or parts.parts[0] != 'timesheet-admin' or not (item.isfile() or item.isdir()):
                raise ValueError('Invalid release archive')
            total += item.size
            if total > 50 * 1024**2: raise ValueError('Release archive too large')
        archive.extractall(directory, filter='data')
    subprocess.run([sys.executable, str(directory / 'timesheet-admin/manager.py'), 'install-bundle', tag], check=True)
PY
printf '[%s] Complete. Type timesheet to open the menu.\n' "$(date -Is)"
