"""Find the newest green CI run of a push to `rebuild` and fetch its preview images (STAGING).

Prints "<sha>" when that commit's images are ready to deploy, nothing when there is nothing new.
Reads the token from /home/manage/manage-staging/secrets/github-token; never prints it.
"""
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

REPO = 'ali-hedax/manage-dealership-platform'
ROOT = Path('/home/manage/manage-staging')
token = (ROOT / 'secrets' / 'github-token').read_text().strip()
os.umask(0o077)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def api(path, follow=True):
    req = urllib.request.Request('https://api.github.com' + path, headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'manage-staging-poller'})
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if not follow and e.code == 302:
            return e.headers['Location']
        raise


runs = api(f'/repos/{REPO}/actions/runs?branch=rebuild&event=push&status=success&per_page=1')['workflow_runs']
if not runs:
    raise SystemExit(0)
run = runs[0]
sha = run['head_sha']
assert re.fullmatch('[0-9a-f]{40}', sha)
deployed = (ROOT / 'state' / 'deployed.sha')
if deployed.exists() and deployed.read_text().strip() == sha:
    raise SystemExit(0)
folder = ROOT / 'artifacts' / sha
if not (folder / 'preview-images.tar.gz').exists():
    arts = [a for a in api(f"/repos/{REPO}/actions/runs/{run['id']}/artifacts")['artifacts'] if a['name'] == f'preview-images-{sha}']
    if not arts:
        raise SystemExit(0)
    art = arts[0]
    url = api(f"/repos/{REPO}/actions/artifacts/{art['id']}/zip", follow=False)
    folder.mkdir(parents=True, exist_ok=True)
    zpath = folder / 'artifact.zip'
    h = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=300) as r, zpath.open('wb') as out:
        for block in iter(lambda: r.read(1 << 20), b''):
            out.write(block)
            h.update(block)
    assert zpath.stat().st_size == art['size_in_bytes']
    if art.get('digest'):
        assert 'sha256:' + h.hexdigest() == art['digest']
    allowed = {'preview-image-source.txt', 'preview-image-ids.txt', 'preview-images.sha256', 'preview-images.tar.gz'}
    with zipfile.ZipFile(zpath) as z:
        assert set(z.namelist()) == allowed
        z.extractall(folder)
    zpath.unlink()
print(sha)
