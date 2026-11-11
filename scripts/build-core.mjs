// Builds the engine core on its own (src/core/index.ts → dist/canon-core.mjs): no host, no packages, for any
// JavaScript host (a browser page, Node, another frontend). Not committed; npm run build makes it.
import { build } from 'esbuild';
await build({
  entryPoints: ['src/core/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  outfile: 'dist/canon-core.mjs',
  legalComments: 'none',
  banner: { js: '/* Canon Engine core (built). Source: src/core. Do not edit by hand. */' },
});
console.log('built dist/canon-core.mjs');
