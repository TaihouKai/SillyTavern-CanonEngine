// Builds the GitHub Pages site in site/: the live demo bundled from the engine's own code (site/src/demo.ts →
// site/js/engine-demo.js), Canon Engine Play (the web host, src/hosts/web → site/play/play.js), the engine panels'
// stylesheet (style.css → site/css/engine.css) and the example packs they read (examples/ → site/data/). The outputs are not committed; CI runs this before deploying.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

await build({
  entryPoints: ['site/src/demo.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  outfile: 'site/js/engine-demo.js',
  legalComments: 'none',
});
// the web host: Canon Engine Play (site/play/), the engine running on its own with the player's model
await build({
  entryPoints: ['src/hosts/web/app.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  outfile: 'site/play/play.js',
  legalComments: 'none',
});
mkdirSync('site/data', { recursive: true });
copyFileSync('examples/toaru-index.canon.json', 'site/data/toaru-index.canon.json');
copyFileSync('examples/demo.canon.json', 'site/data/demo.canon.json');
// the example pack's numbers, as the engine loads it (the home page shows them before fetching the pack)
const statsJs = join(tmpdir(), `canon-build-stats-${process.pid}.mjs`);
await build({ entryPoints: ['site/src/build-stats.ts'], bundle: true, format: 'esm', platform: 'node', target: 'node18', outfile: statsJs, logLevel: 'warning' });
await import(pathToFileURL(statsJs).href);
rmSync(statsJs, { force: true });
copyFileSync('style.css', 'site/css/engine.css');
console.log('built site/js/engine-demo.js, site/play/play.js, site/css/engine.css, site/data/ (example packs)');
