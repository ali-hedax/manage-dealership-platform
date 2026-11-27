"""Load a CI image archive for STAGING without any possibility of touching a production tag.

Production runs manage-api / manage-web images pinned to immutable tags (prod-<version>); the
production repositories manage-api and manage-web belong to production alone. Staging images live
in their own repositories, manage-staging-api and manage-staging-web. Three protections:
 1. Rewrite: every name in the archive (manifest.json RepoTags, the legacy `repositories` file and
    the OCI index.json annotations, which Docker 25+ uses) is renamed manage-<x>:latest →
    manage-staging-<x>:<sha>. An unexpected name aborts before anything is loaded.
 2. Refusal: before loading, the full set of target tags is compared with every production tag;
    any target in a production repository, or equal to an existing production tag, refuses the run.
 3. Guard: every production tag (manage-api:*, manage-web:*) and its image ID is recorded before
    the load and compared afterwards, whatever happened; anything that moved is put back and the
    script fails loudly. (2026-11-27 incident: a load moved production's :latest tags.)
Usage: python3 -I load-images.py <preview-images.tar.gz> <full sha>
"""
import io
import json
import re
import subprocess
import sys
import tarfile
import time

src, sha = sys.argv[1], sys.argv[2]
assert re.fullmatch('[0-9a-f]{40}', sha)
PROD_REPOS = ('manage-api', 'manage-web')
STAGING_REPOS = ('manage-staging-api', 'manage-staging-web')
RENAME = {f'{p}:latest': f'{s}:{sha}' for p, s in zip(PROD_REPOS, STAGING_REPOS)}
TARGETS = set(RENAME.values())
seen = set()


def production_tags():
    """{'manage-api:prod-1.0.20': 'sha256:…', …} for every tag of the production repositories."""
    out = {}
    for repo in PROD_REPOS:
        r = subprocess.run(['docker', 'image', 'ls', repo, '--no-trunc', '--format', '{{.Tag}} {{.ID}}'], capture_output=True, text=True, check=True)
        for line in r.stdout.splitlines():
            tag, image = line.split()
            if tag != '<none>':
                out[f'{repo}:{tag}'] = image
    return out


def refuse_overlap(prod):
    bad = sorted(t for t in TARGETS if t.split(':')[0] in PROD_REPOS or t in prod)
    if bad or not all(t.split(':')[0] in STAGING_REPOS for t in TARGETS):
        raise SystemExit(f'REFUSED: staging target tags overlap production: {bad or sorted(TARGETS)}')


def rename(name):
    if name not in RENAME:
        raise SystemExit(f'REFUSED: unexpected image name in the archive: {name}')
    seen.add(name)
    return RENAME[name]


def oci_name(value):
    # «docker.io/library/manage-api:latest» → «docker.io/library/manage-staging-api:<sha>». The
    # registry prefix must stay: Docker resolves names in their full form, and a bare name in the
    # OCI index is listed but cannot be inspected or used (found 2026-11-27).
    short = value.split('/')[-1]
    prefix = value[: len(value) - len(short)] or 'docker.io/library/'
    return prefix + rename(short)


def rewrite(member_name, data):
    if member_name == 'manifest.json':
        manifest = json.loads(data)
        for image in manifest:
            image['RepoTags'] = [rename(t) for t in image.get('RepoTags') or []]
        return json.dumps(manifest).encode()
    if member_name == 'repositories':
        renamed = {}
        for repo, tags in json.loads(data).items():
            for tag, layer in tags.items():
                n, t = rename(f'{repo}:{tag}').split(':')
                renamed.setdefault(n, {})[t] = layer
        return json.dumps(renamed).encode()
    if member_name == 'index.json':
        index = json.loads(data)
        for m in index.get('manifests', []):
            ann = m.get('annotations') or {}
            if 'io.containerd.image.name' in ann:
                ann['io.containerd.image.name'] = oci_name(ann['io.containerd.image.name'])
            if 'org.opencontainers.image.ref.name' in ann:
                ann['org.opencontainers.image.ref.name'] = sha
        return json.dumps(index).encode()
    return data


def main():
    before = production_tags()
    refuse_overlap(before)
    failure, out, load = None, '', None
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
    except BaseException as e:  # the guard below must run whatever happened (SystemExit included)
        failure = f'{type(e).__name__}: {e}'
        if load and load.poll() is None:
            load.kill()
    finally:
        after = production_tags()
        moved = {t for t in set(before) | set(after) if before.get(t) != after.get(t)}
        for t in sorted(moved):
            if t in before:
                subprocess.run(['docker', 'tag', before[t], t], check=True)
            else:
                subprocess.run(['docker', 'image', 'rm', t], check=True, stdout=subprocess.DEVNULL)
        if moved:
            assert production_tags() == before, 'production tags could not be restored'
            print(f'PROTECTED: production tags {sorted(moved)} moved during the load and were restored', file=sys.stderr)
            failure = failure or 'a production tag moved; restored'
    if failure:
        raise SystemExit(failure)
    if seen != set(RENAME):
        raise SystemExit(f'archive did not name both images: {sorted(seen)}')
    for t in TARGETS:  # the image store may register the second image a moment after load returns
        for attempt in range(10):
            if subprocess.run(['docker', 'image', 'inspect', t], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(2)
        else:
            raise SystemExit(f'loaded image {t} cannot be inspected')
    print(out.strip())


if __name__ == '__main__':
    main()
