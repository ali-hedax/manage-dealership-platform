"""Load a CI image archive for STAGING without touching production tags.

The archive (docker save, gzip) tags its images manage-api:latest and manage-web:latest, which
production uses. Two independent protections:
 1. The tags are rewritten to manage-<name>:staging-<sha> while streaming into `docker load`, in
    every place a tag can live: manifest.json (RepoTags), the legacy `repositories` file and the
    OCI index.json annotations (Docker 25+ takes the name from there; found 2026-11-27).
 2. Production's :latest image IDs are recorded before the load and checked afterwards, whatever
    happens; if a tag moved it is put back at once and the script fails loudly.
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
NAMES = ('manage-api', 'manage-web')
RENAME = {f'{n}:latest': f'{n}:staging-{sha}' for n in NAMES}


def latest_ids():
    out = {}
    for n in NAMES:
        r = subprocess.run(['docker', 'image', 'inspect', '-f', '{{.Id}}', f'{n}:latest'], capture_output=True, text=True)
        out[n] = r.stdout.strip() if r.returncode == 0 else None
    return out


def oci_name(value):
    # «docker.io/library/manage-api:latest» or «manage-api:latest»
    for old, new in RENAME.items():
        if value == old or value.endswith('/' + old):
            return value[: len(value) - len(old)] + new
    return value


def rewrite(name, data):
    if name == 'manifest.json':
        manifest = json.loads(data)
        for image in manifest:
            tags = image.get('RepoTags') or []
            assert all(t in RENAME for t in tags), tags
            image['RepoTags'] = [RENAME[t] for t in tags]
        return json.dumps(manifest).encode()
    if name == 'repositories':
        repos, renamed = json.loads(data), {}
        for repo, tags in repos.items():
            for tag, layer in tags.items():
                n, t = RENAME[f'{repo}:{tag}'].split(':')
                renamed.setdefault(n, {})[t] = layer
        return json.dumps(renamed).encode()
    if name == 'index.json':
        index = json.loads(data)
        for m in index.get('manifests', []):
            ann = m.get('annotations') or {}
            if 'io.containerd.image.name' in ann:
                ann['io.containerd.image.name'] = oci_name(ann['io.containerd.image.name'])
            if ann.get('org.opencontainers.image.ref.name') == 'latest':
                ann['org.opencontainers.image.ref.name'] = f'staging-{sha}'
        return json.dumps(index).encode()
    return data


before = latest_ids()
assert all(before.values()), f'production :latest tags missing before load: {before}'
failure = None
try:
    load = subprocess.Popen(['docker', 'load'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with tarfile.open(src, 'r|gz') as tin, tarfile.open(fileobj=load.stdin, mode='w|') as tout:
        for member in tin:
            if member.isfile():
                data = rewrite(member.name, tin.extractfile(member).read())
                member.size = len(data)
                tout.addfile(member, io.BytesIO(data))
            else:
                tout.addfile(member)
    load.stdin.close()  # end of the stream; communicate() would try to flush the closed pipe
    load.wait(timeout=900)
    out, err = load.stdout.read().decode(), load.stderr.read().decode()
    if load.returncode != 0:
        failure = 'docker load failed: ' + err[-400:]
except Exception as e:  # noqa: BLE001 - the tag guard below must run whatever happened
    failure = f'{type(e).__name__}: {e}'
    out = ''
finally:
    after = latest_ids()
    moved = [n for n in NAMES if after[n] != before[n]]
    for n in moved:
        if after[n]:
            subprocess.run(['docker', 'tag', after[n], f'{n}:staging-{sha}'], check=True)
        subprocess.run(['docker', 'tag', before[n], f'{n}:latest'], check=True)
    assert latest_ids() == before, 'production :latest tags could not be restored'
    if moved:
        print(f'PROTECTED: production :latest of {moved} moved during the load and was restored', file=sys.stderr)
        failure = failure or 'archive tags were not rewritten; production tags restored'
if failure:
    raise SystemExit(failure)
for n in NAMES:
    subprocess.run(['docker', 'image', 'inspect', f'{n}:staging-{sha}'], check=True, stdout=subprocess.DEVNULL)
print(out.strip())
