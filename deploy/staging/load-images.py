"""Load a CI image archive for STAGING without touching production tags.

The archive (docker save, gzip) tags its images manage-api:latest and manage-web:latest, which
production uses. This rewrites those tags to manage-<name>:staging-<sha> in manifest.json and the
legacy `repositories` file while streaming the archive into `docker load`. Nothing else changes.
Usage: python3 -I load-images.py <preview-images.tar.gz> <full sha>
"""
import io
import json
import re
import subprocess
import sys
import tarfile

src, sha = sys.argv[1], sys.argv[2]
assert re.fullmatch('[0-9a-f]{40}', sha)
RENAME = {'manage-api:latest': f'manage-api:staging-{sha}', 'manage-web:latest': f'manage-web:staging-{sha}'}

load = subprocess.Popen(['docker', 'load'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
seen = set()
with tarfile.open(src, 'r|gz') as tin, tarfile.open(fileobj=load.stdin, mode='w|') as tout:
    for member in tin:
        data = tin.extractfile(member).read() if member.isfile() else None
        if member.name == 'manifest.json':
            manifest = json.loads(data)
            for image in manifest:
                tags = image.get('RepoTags') or []
                assert all(t in RENAME for t in tags), tags
                image['RepoTags'] = [RENAME[t] for t in tags]
                seen.update(tags)
            data = json.dumps(manifest).encode()
        elif member.name == 'repositories':
            repos = json.loads(data)
            renamed = {}
            for repo, tags in repos.items():
                for tag, layer in tags.items():
                    new = RENAME[f'{repo}:{tag}']
                    name, newtag = new.split(':')
                    renamed.setdefault(name, {})[newtag] = layer
            data = json.dumps(renamed).encode()
        if data is not None:
            member.size = len(data)
            tout.addfile(member, io.BytesIO(data))
        else:
            tout.addfile(member)
load.stdin.close()  # end of the stream; communicate() would try to flush the closed pipe
load.wait(timeout=900)
out, err = load.stdout.read(), load.stderr.read()
assert load.returncode == 0, err.decode()[-400:]
assert seen == set(RENAME), seen
print(out.decode().strip())
