// Downloads MediaWiki pages through a headless browser (some wikis refuse plain HTTP clients).
//   node wiki_fetch.cjs <job.json>
// job: {site, start, out, categories: [..], titles: [..], prefixes: [..]}; writes {title: wikitext} to out (merged
// with what is already there; only missing pages are fetched).
const fs = require('fs');
const path = require('path');
// Playwright (npm i playwright; npx playwright install chromium), or set PLAYWRIGHT_PATH to where it is installed
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PW);
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const have = fs.existsSync(job.out) ? JSON.parse(fs.readFileSync(job.out, 'utf8')) : {};
  const b = await chromium.launch({ headless: true });
  try {
    const p = await (await b.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' })).newPage();
    await p.goto(job.site + job.start, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForTimeout(2500);
    const api = async (q) => {
      for (let i = 0; i < 4; i++) {
        try { return await p.evaluate(async (q) => { const r = await fetch('/api.php?' + new URLSearchParams({ format: 'json', ...q })); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, q); }
        catch (e) { await p.waitForTimeout(2000 * (i + 1)); if (i === 3) throw e; }
      }
    };
    const titles = new Set(job.titles || []);
    for (const cat of job.categories || []) {
      let cont = {};
      do { const r = await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmlimit: 500, cmnamespace: 0, ...cont }); r.query.categorymembers.forEach((m) => titles.add(m.title)); cont = r.continue || null; } while (cont);
    }
    for (const pre of job.prefixes || []) {
      let cont = {};
      do { const r = await api({ action: 'query', list: 'allpages', apprefix: pre, aplimit: 500, ...cont }); r.query.allpages.forEach((m) => titles.add(m.title)); cont = r.continue || null; } while (cont);
    }
    const todo = [...titles].filter((t) => !(t in have));
    console.log(`${titles.size} pages, ${todo.length} to fetch`);
    for (let i = 0; i < todo.length; i += 50) {
      const r = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: 1, titles: todo.slice(i, i + 50).join('|') });
      const redir = {}; (r.query.redirects || []).forEach((x) => { redir[x.to] = x.from; });
      const norm = {}; (r.query.normalized || []).forEach((x) => { norm[x.to] = x.from; });
      for (const pg of Object.values(r.query.pages)) {
        const text = pg.revisions?.[0]?.slots?.main?.['*'];
        let t = pg.title; if (redir[t]) t = redir[t]; if (norm[t]) t = norm[t];
        have[t] = text == null ? null : text;
        if (t !== pg.title && text != null) have[pg.title] = text;
      }
      if ((i / 50) % 10 === 9) { fs.writeFileSync(job.out, JSON.stringify(have)); console.log(`  ${i + 50}/${todo.length}`); }
    }
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    fs.writeFileSync(job.out, JSON.stringify(have));
    console.log(`saved ${Object.keys(have).length} pages to ${job.out}`);
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
