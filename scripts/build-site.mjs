// Builds the GitHub Pages site in site/: the live demo bundled from the engine's own code (site/src/demo.ts →
// site/js/engine-demo.js), the timeline window's stylesheet (style.css → site/css/engine.css) and the example pack
// it reads (examples/toaru-index.canon.json → site/data/). The outputs are not committed; CI runs this before deploying.
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
mkdirSync('site/data', { recursive: true });
copyFileSync('examples/toaru-index.canon.json', 'site/data/toaru-index.canon.json');
copyFileSync('style.css', 'site/css/engine.css');
console.log('built site/js/engine-demo.js, site/css/engine.css, site/data/toaru-index.canon.json');
