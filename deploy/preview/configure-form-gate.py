"""Run as root on the dedicated Preview host; never prints credentials."""
import hashlib
import os
import secrets
from pathlib import Path

path = Path('/opt/manage/.env')
if 'PREVIEW_GATE_HASH=' not in path.read_text():
    credentials = dict(line.strip().split(': ', 1) for line in Path('/root/manage-preview-credentials.txt').read_text().splitlines() if ': ' in line)
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(credentials['Site gate password'].encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    with path.open('a') as output:
        output.write('\nPREVIEW_GATE_HASH=' + salt + ':' + digest + '\nPREVIEW_GATE_KEY=' + secrets.token_hex(32) + '\n')
os.chmod(path, 0o600)
