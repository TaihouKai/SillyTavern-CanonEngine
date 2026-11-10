"""Name resolution: which candidate a name in a summary refers to (code, not model)."""
import collections
import re

PAREN = re.compile(r'[（(][^（）()]*[）)]$')


def clean(name):
    n = (name or '').strip().strip('“”"\'「」『』')
    n = re.sub(r'\s+', ' ', n)
    return n


def official(name, known):
    """'Saber〔阿尔托莉雅·潘德拉贡〔Alter〕〕' -> '阿尔托莉雅·潘德拉贡〔Alter〕' when that is a known name."""
    n = clean(name)
    if n in known:
        return n
    i = n.find('〔')
    while i >= 0:
        inner = n[i + 1:-1] if n.endswith('〕') else None
        if inner and inner in known:
            return inner
        i = n.find('〔', i + 1)
    return n


GROUP_SUFFIX = re.compile(r'(等从者|等人|等|们|一行人|一行|一伙|众人|全员|一方|阵营|的阵营)$')
LIST_SEP = re.compile(r'[、，,；;]|以及|及')
# a few people named together (初春饰利与佐天泪子): only where every part is someone's name
PAIR_SEP = re.compile(r'[、，,；;]|以及|及|与|和|跟')


def expand(name):
    """The individuals a subject names: 'A、B、C等从者' -> [A, B, C]; '藤丸立香一行' -> ['藤丸立香'] (a party stands
    for its leader); else [name]."""
    n = clean(name)
    parts = [p.strip() for p in LIST_SEP.split(n) if p.strip()]
    out = []
    for p in parts or [n]:
        q = GROUP_SUFFIX.sub('', p).strip()
        out.append(q or p)
    return out


class Resolver:
    """Maps names to keys. A strong name (an official name) always wins; a weak one (a label, an alias) counts
    only while a single key uses it."""

    def __init__(self):
        self.strong = {}
        self.weak = collections.defaultdict(set)

    def add(self, name, key, strong=False):
        n = clean(name)
        if not n:
            return
        if strong:
            self.strong[n] = key
        else:
            self.weak[n].add(key)

    def lookup(self, n):
        if n in self.strong:
            return self.strong[n]
        ks = self.weak.get(n)
        return next(iter(ks)) if ks and len(ks) == 1 else None

    def known(self):
        return set(self.strong) | {n for n, ks in self.weak.items() if len(ks) == 1}

    def get(self, name):
        n = clean(name)
        k = self.lookup(n)
        if k:
            return k
        o = official(n, self.known())
        if o != n and self.lookup(o):
            return self.lookup(o)
        m = PAREN.sub('', n).strip()
        if m and m != n:
            return self.lookup(m)
        return None


def from_corpus(corpus, project):
    """Names to source characters. A name belongs to the character it is used for most (a game draws one person with
    several figure sets, each with that person's name: live, "玛修" went to whichever set came last, a chapter-only
    set, and most of Mash's beats with it). A servant's official name and its other-language name belong to it."""
    r = Resolver()
    chars = corpus['characters']
    from .adapters.atlas import is_mask
    weight = collections.defaultdict(collections.Counter)
    total = collections.Counter()
    for k, c in chars.items():
        tk = c.get('merged_into') or k
        for lab, n in c['labels'].items():
            if not is_mask(lab):
                weight[clean(lab)][tk] += n
                total[tk] += n
        if c.get('merged_into'):
            continue
        official_ = 1000 if c.get('servant') else 0
        weight[clean(c['name'])][tk] += official_
        bare = PAREN.sub('', clean(c['name'])).strip()
        if c.get('servant') and bare and bare != clean(c['name']):
            weight[bare][tk] += official_
        if c.get('servant') and c['servant'].get('otherName'):
            weight[clean(c['servant']['otherName'])][tk] += 1000
    for n, ctr in weight.items():
        if not n:
            continue
        best = max(ctr, key=lambda k: (ctr[k], total[k], k))
        r.add(n, best, strong=True)
        # the others keep it as a weak name only when nobody uses it much (a stray label on a borrowed figure set)
        for k, w in ctr.items():
            if k != best and ctr[best] < 20:
                r.add(n, k)
    prot = project.get('protagonist', {})
    for n in [prot.get('name', '主人公'), '主人公', '主角'] + list(prot.get('aliases', [])):
        r.add(n, 'protagonist', strong=True)
    return r

