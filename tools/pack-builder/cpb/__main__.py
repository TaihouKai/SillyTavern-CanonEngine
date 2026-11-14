"""Command line: python -m cpb <command> [-p project] [options]. See README.md."""
import argparse
import sys

import os

from . import adapters, assemble, corrections, deaths, dedupe, ends, impacts, llm, mind, nature, report, review, skeleton, start, steps
from . import prompts as P
from .config import Project, load_global
from .util import ROOT, log, read_json, write_json

# calibrated on a real run (DeepSeek V4.1 Flash, FGO CN, 2 chapters): per unit ~0.62 tokens per character of
# Chinese script plus ~2.3k of instructions in, ~2.6k out; ~4.4 beats per unit; the chapter step ~215 tokens in and
# ~120 out per beat; the entity step ~90 in and ~65 out per candidate, ~0.75 candidates per beat.
TOKENS_PER_CHAR = 0.62


def estimate(project, gcfg):
    c = skeleton.corpus(project)
    units = [u for u in c['units'] if u['chars']]
    def summarized(u):
        return (read_json(project.p('summaries', u['chapter'], f'{u["id"]}.json')) or {}).get('version') == steps.summary_version(project)
    done = sum(1 for u in units if summarized(u))
    chars = sum(u['chars'] for u in units)
    left = sum(u['chars'] for u in units if not summarized(u))
    n_left = len(units) - done
    s_in = left * TOKENS_PER_CHAR + 2300 * n_left
    s_out = 2600 * n_left
    beats = 4.4 * len(units)
    ch_in = beats * 215 + 2500 * len(c['chapters'])
    ch_out = beats * 120
    cand = 0.75 * beats
    en_in = cand * 90 + 1500 * cand / 30
    en_out = cand * 65
    p = gcfg['llm'].get('prices_usd_per_mtok', {})
    tin, tout = s_in + ch_in + en_in, s_out + ch_out + en_out
    peak = (tin * p.get('input_miss', 0) + tout * p.get('output', 0)) / 1e6
    off = peak * (gcfg['llm'].get('offpeak') or {}).get('discount', 1)
    log(f'{len(c["chapters"])} chapters, {len(units)} units ({done} already summarized), {chars:,} characters of text ({left:,} left)')
    log(f'estimate for what is left: ~{tin / 1e6:.1f}M tokens in, ~{tout / 1e6:.2f}M out, about {beats:,.0f} events in the pack '
        f'→ about ${peak:.2f} at peak price, ${off:.2f} off-peak ({gcfg["llm"].get("model")}; ±30%)')
    lim = gcfg['llm'].get('max_usd_per_run')
    if lim:
        log(f'each run stops at ${lim} (llm.max_usd_per_run); run again to continue')


def use_mock_folder(project):
    """Stand-in model results go to their own folder (work/<project>-mock), never mixed with real ones."""
    import os
    import shutil
    real = project.work
    project.work = real + '-mock'
    os.makedirs(project.work, exist_ok=True)
    for name in ('corpus.json', 'dates.json'):
        if os.path.exists(os.path.join(real, name)):
            shutil.copy2(os.path.join(real, name), os.path.join(project.work, name))
    if os.path.isdir(os.path.join(real, 'text')):
        shutil.copytree(os.path.join(real, 'text'), os.path.join(project.work, 'text'), dirs_exist_ok=True)
    log(f'stand-in model: results go to {project.work}')


def client(gcfg, project, args):
    cl = llm.Client(gcfg['llm'], project, mock=__import__('cpb.mock', fromlist=['mock']).mock if args.mock else None)
    cl.ledger.offpeak_only = bool(args.offpeak) and not args.mock
    return cl


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(prog='python -m cpb', description='Build a Canon Engine history pack from a story source.')
    ap.add_argument('command', choices=['fetch', 'corpus', 'scan', 'estimate', 'summarize', 'dedupe', 'chapters', 'entities', 'build', 'nature', 'mind', 'ends', 'impacts', 'start', 'deaths', 'run', 'status'])
    ap.add_argument('-p', '--project', default='fgo-cn', help='project name under projects/ or a path to a project file')
    ap.add_argument('--config', help='global config file (default: config.json)')
    ap.add_argument('--chapters', help='only these chapter ids, comma separated (e.g. w100,w101)')
    ap.add_argument('--limit', type=int, help='summarize at most this many units (for a trial)')
    ap.add_argument('--mock', action='store_true', help='use the stand-in model (free; for testing the pipeline)')
    ap.add_argument('--refresh', action='store_true', help='download the source again')
    ap.add_argument('--yes', action='store_true', help='run: do not ask before the model steps')
    ap.add_argument('--pack', help='nature, mind, ends, impacts: the pack to give 常态 / 思考方式 to or to propose ends and impacts for (default: the built pack of the project)')
    ap.add_argument('--out', help='nature, mind: where to write the pack (default: over --pack)')
    ap.add_argument('--offpeak', action='store_true', help='make model calls only at the off-peak price; stop when peak hours begin')
    args = ap.parse_args(argv)
    gcfg = load_global(args.config)
    project = Project(args.project)
    chapters = set(args.chapters.split(',')) if args.chapters else None
    src = adapters.get(project)
    cmd = args.command

    if cmd in ('fetch', 'run'):
        src.fetch(project, refresh=args.refresh)
    if cmd in ('corpus', 'run') or (cmd == 'fetch'):
        src.build_corpus(project)
    if cmd in ('scan', 'run', 'fetch', 'corpus'):
        skeleton.scan(project)
        skeleton.report(project)
    if cmd in ('estimate', 'run'):
        estimate(project, gcfg)
    if cmd == 'run' and not args.yes and not args.mock:
        if input('Run the model steps now (this costs money)? [y/N] ').strip().lower() not in ('y', 'yes'):
            log('stopped before the model steps')
            return
    if args.mock and cmd in ('summarize', 'dedupe', 'chapters', 'entities', 'build', 'run', 'status'):
        use_mock_folder(project)
    cl = None
    try:
        if cmd in ('summarize', 'run'):
            cl = cl or client(gcfg, project, args)
            steps.summarize(project, cl, chapters, args.limit)
        if cmd == 'dedupe' or (cmd == 'run' and steps.wiki(project)):
            cl = cl or client(gcfg, project, args)
            dedupe.run(project, cl, chapters)
        if cmd in ('chapters', 'run'):
            cl = cl or client(gcfg, project, args)
            steps.edit_chapters(project, cl, chapters)
        if cmd in ('entities', 'run'):
            cl = cl or client(gcfg, project, args)
            steps.describe_entities(project, cl)
    except llm.BudgetExceeded as e:
        log(str(e))
        log('run the same command again to continue (finished results are kept)')
        return 2
    if cmd in ('ends', 'impacts'):
        # proposals for what a person then checks into the review file: how long each state holds (ends), what an
        # event changes beyond itself that its effects miss (impacts)
        src_path = args.pack or project.p('out', project.get('pack', {}).get('file') or f'{project.get("pack", {}).get("pack_id", project.name)}.canon.json')
        pk = read_json(src_path)
        if not pk:
            log(f'{cmd}: no pack at {src_path} (build first, or give --pack)')
            return 2
        cl = client(gcfg, project, args)
        try:
            (ends if cmd == 'ends' else impacts).generate(project, cl, pk)
        except llm.BudgetExceeded as e:
            log(str(e))
            log('run the same command again to continue (finished results are kept)')
            return 2
        log(f'{cmd}: proposals written; build again to apply them (marked until checked into {os.path.basename(review.path(project))})')
    if cmd == 'mind':
        # 思考方式 for the people of a built pack who have a page of their own, written into it
        src_path = args.pack or project.p('out', project.get('pack', {}).get('file') or f'{project.get("pack", {}).get("pack_id", project.name)}.canon.json')
        pk = read_json(src_path)
        if not pk:
            log(f'mind: no pack at {src_path} (build first, or give --pack)')
            return 2
        cl = client(gcfg, project, args)
        try:
            mind.generate(project, cl, pk, nature.wiki_pages(project), lang=steps.lang_name(project))
        except llm.BudgetExceeded as e:
            log(str(e))
            log('run the same command again to continue (finished results are kept)')
            return 2
        n = mind.attach(pk, project.p('mind'))
        out = args.out or src_path
        assemble.write_pack(project, out, pk)
        res = report.lint(gcfg, out)
        log(f'mind: {n} people with a 思考方式 — pack: {out}' + (f' — canon-lint: {"OK" if res.get("ok") else "ERRORS"}, {len(res.get("errors", []))} errors' if res else ''))
    if cmd == 'nature':
        # 常态 for the people of a built pack, written into it (a separate command: it needs the built pack's events)
        src_path = args.pack or project.p('out', project.get('pack', {}).get('file') or f'{project.get("pack", {}).get("pack_id", project.name)}.canon.json')
        pk = read_json(src_path)
        if not pk:
            log(f'nature: no pack at {src_path} (build first, or give --pack)')
            return 2
        cl = client(gcfg, project, args)
        try:
            nature.generate(project, cl, pk, [e['id'] for e in pk['entities'] if e.get('kind') == 'person'], nature.wiki_pages(project), lang=steps.lang_name(project))
            nature.perception(project, cl, pk, lang=steps.lang_name(project))
        except llm.BudgetExceeded as e:
            log(str(e))
            log('run the same command again to continue (finished results are kept)')
            return 2
        n = nature.attach(pk, project.p('nature'))
        out = args.out or src_path
        assemble.write_pack(project, out, pk)
        res = report.lint(gcfg, out)
        log(f'nature: {n} people with a 常态 — pack: {out}' + (f' — canon-lint: {"OK" if res.get("ok") else "ERRORS"}, {len(res.get("errors", []))} errors' if res else ''))
    if cmd == 'deaths':
        # deaths followed by the person's presence: died, came back, or only thought dead; then the pack is built again
        pk = assemble.build(project, project.p('out', 'raw.canon.json'), raw=True)[0]
        cl = client(gcfg, project, args)
        try:
            deaths.generate(project, cl, pk, read_json(os.path.join(ROOT, project['wiki']['huiji'])) if (project.get('wiki') or {}).get('huiji') else {})
        except llm.BudgetExceeded as e:
            log(str(e))
            return 2
    if cmd == 'start':
        # who is in each organization when the story begins, from its page; then the pack is built again with it
        pk = assemble.build(project, project.p('out', 'raw.canon.json'), raw=True)[0]
        cl = client(gcfg, project, args)
        try:
            start.generate(project, cl, pk, nature.wiki_pages(project))
        except llm.BudgetExceeded as e:
            log(str(e))
            log('run the same command again to continue (finished results are kept)')
            return 2
    if cmd in ('build', 'run', 'start', 'deaths'):
        pack, rep, chrep, clock, path = assemble.build(project)
        rv = review.load(project)
        also = corrections.merged_from(rv)
        if os.path.isdir(project.p('nature')):   # 常态 generated before is kept on a rebuild
            pk = read_json(path)
            n = nature.attach(pk, project.p('nature'), also)
            assemble.write_pack(project, path, pk)
            log(f'nature: {n} people with a 常态')
        if os.path.isdir(project.p('mind')):   # and 思考方式
            pk = read_json(path)
            n = mind.attach(pk, project.p('mind'), also)
            assemble.write_pack(project, path, pk)
            log(f'mind: {n} people with a 思考方式')
        # a person's fixes of what the generated 常态 and 思考方式 got wrong, and the wordings fixed everywhere
        pk = read_json(path)
        miss = corrections.apply_people(pk, rv) + corrections.apply(pk, {'texts': rv.get('texts') or []}, people=True)
        corrections.write_misses(project, corrections.read_misses(project) + miss)
        assemble.write_pack(project, path, pk)
        res = report.lint(gcfg, path)
        report.write(project, read_json(path) or pack, rep, chrep, clock, path, res, cl.ledger if cl else None)
        if res is not None:
            log(f'canon-lint: {"OK" if res.get("ok") else "ERRORS"} — {len(res.get("errors", []))} errors, {len(res.get("warnings", []))} warnings')
        log(f'pack: {path}')
    if cmd == 'status':
        c = read_json(project.p('corpus.json'))
        if not c:
            log('nothing fetched yet')
            return
        for ch in c['chapters']:
            n = len(ch['units'])
            s = sum(1 for u in ch['units'] if read_json(project.p('summaries', ch['id'], f'{u}.json')))
            e = 'yes' if read_json(project.p('chapters', f'{ch["id"]}.json')) else 'no'
            print(f'{ch["id"]:6} {ch["title"][:30]:32} units {s:3}/{n:3}  chapter edit: {e}')
        ents = read_json(project.p('entities.json'), {})
        print(f'entities described: {len(ents or {})}')
    if cl:
        log('model use this run: ' + cl.ledger.summary())


if __name__ == '__main__':
    sys.exit(main() or 0)
