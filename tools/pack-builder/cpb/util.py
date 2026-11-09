"""Small helpers shared by every step: paths, JSON files, hashing, logging."""
import hashlib
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def warn(*a):
    print(time.strftime('%H:%M:%S'), 'WARN', *a, file=sys.stderr, flush=True)


def sha(*parts) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update((p if isinstance(p, str) else json.dumps(p, ensure_ascii=False, sort_keys=True)).encode('utf8'))
        h.update(b'\0')
    return h.hexdigest()


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf8') as f:
        return json.load(f)


def write_json(path, data, indent=1):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write('\n')
    os.replace(tmp, path)


def read_text(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf8', errors='replace') as f:
        return f.read()


def write_text(path, text):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)


FULLWIDTH = str.maketrans('０１２３４５６７８９：／．', '0123456789:/.')


def halfwidth_digits(s: str) -> str:
    return s.translate(FULLWIDTH)


def uniq(xs):
    out, seen = [], set()
    for x in xs:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out
