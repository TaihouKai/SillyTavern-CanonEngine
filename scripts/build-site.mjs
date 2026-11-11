// Builds the GitHub Pages site in site/: the live demo bundled from the engine's own code (site/src/demo.ts →
// site/js/engine-demo.js), Canon Engine Play (the web host, src/hosts/web → site/play/play.js), the engine panels'
// stylesheet (style.css → site/css/engine.css) and the example packs they read (examples/ → site/data/). The outputs are not committed; CI runs this before deploying.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

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
copyFileSync('style.css', 'site/css/engine.css');
console.log('built site/js/engine-demo.js, site/play/play.js, site/css/engine.css, site/data/ (example packs)');
