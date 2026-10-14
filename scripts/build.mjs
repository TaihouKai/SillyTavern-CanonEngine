import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/index.js',
  sourcemap: false,
  legalComments: 'none',
  external: ['/script.js', '/scripts/*'],
  banner: { js: '/* Canon Engine v1 - built bundle. Source: src/. Do not edit by hand. */' },
});
console.log('built dist/index.js');
