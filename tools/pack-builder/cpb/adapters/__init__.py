"""Source adapters. Each one turns a source into the generic corpus (chapters, units, characters)."""
from . import atlas, wiki_arcs

ADAPTERS = {'atlas': atlas, 'wiki_arcs': wiki_arcs}


def get(project):
    name = project.get('adapter')
    if name not in ADAPTERS:
        raise SystemExit(f'unknown adapter: {name} (known: {", ".join(ADAPTERS)})')
    return ADAPTERS[name]
