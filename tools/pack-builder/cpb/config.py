"""Loads the global config (model, API key, lint path) and a project file (what to build and how)."""
import copy
import os

from .util import ROOT, read_json


REPLACE = {'extra_body', 'offpeak', 'prices_usd_per_mtok'}   # taken whole from your config, not merged key by key


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) and k not in REPLACE else v
    return out


def load_global(path=None):
    example = read_json(os.path.join(ROOT, 'config.example.json'), {})
    user = read_json(path or os.path.join(ROOT, 'config.json'), {})
    cfg = _merge(example, user)
    key_env = os.environ.get('CPB_API_KEY')
    if key_env:
        cfg['llm']['api_key'] = key_env
    return cfg


class Project:
    """A project file under projects/: the source, its scope and the pack's editorial choices."""

    def __init__(self, name_or_path):
        path = name_or_path if name_or_path.endswith('.json') else os.path.join(ROOT, 'projects', name_or_path + '.json')
        if not os.path.exists(path):
            raise SystemExit(f'project file not found: {path}')
        self.path = path
        self.data = read_json(path)
        # projects/<name>.local.json (not in git): settings for this machine only, over the shared project file
        local = os.path.splitext(path)[0] + '.local.json'
        if os.path.exists(local):
            self.data = _merge(self.data, read_json(local))
        self.name = self.data.get('name') or os.path.splitext(os.path.basename(path))[0]
        self.work = os.path.join(ROOT, 'work', self.name)

    def __getitem__(self, k):
        return self.data[k]

    def get(self, k, default=None):
        return self.data.get(k, default)

    def p(self, *parts):
        """A path inside this project's work folder."""
        return os.path.join(self.work, *parts)
