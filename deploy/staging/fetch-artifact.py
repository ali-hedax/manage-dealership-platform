"""Download one CI artifact (preview images of a rebuild commit) for STAGING.

The signed download URL arrives on stdin (never on a command line or in a log). Only GitHub's
artifact storage hosts are accepted; size and SHA-256 must match; only the four expected files
are extracted. Usage: python3 -I fetch-artifact.py <sha> <size> <sha256>  < url
"""
import hashlib
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

sha, size, digest = sys.argv[1], int(sys.argv[2]), sys.argv[3]
assert re.fullmatch('[0-9a-f]{40}', sha) and re.fullmatch('[0-9a-f]{64}', digest)
url = sys.stdin.readline().strip()
host = urllib.parse.urlparse(url).hostname or ''
assert url.startswith('https://') and (host.endswith('.blob.core.windows.net') or host.endswith('.actions.githubusercontent.com')), 'unexpected artifact host'
os.umask(0o077)
folder = Path('/home/manage/manage-staging/artifacts') / sha
folder.mkdir(parents=True, exist_ok=True)
zpath = folder / 'artifact.zip'
h = hashlib.sha256()
with urllib.request.urlopen(url, timeout=120) as response, zpath.open('wb') as out:
    for block in iter(lambda: response.read(1 << 20), b''):
        out.write(block)
        h.update(block)
assert zpath.stat().st_size == size, 'size mismatch'
assert h.hexdigest() == digest, 'sha256 mismatch'
allowed = {'preview-image-source.txt', 'preview-image-ids.txt', 'preview-images.sha256', 'preview-images.tar.gz'}
with zipfile.ZipFile(zpath) as z:
    assert set(z.namelist()) == allowed, z.namelist()
    z.extractall(folder)
zpath.unlink()
assert (folder / 'preview-image-source.txt').read_text().split() == [sha], 'artifact is for another commit'
print(f'artifact for {sha} ready')
