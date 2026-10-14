import { build } from 'esbuild';
await build({ entryPoints: ['src/cli/lint.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node18', outfile: 'dist/canon-lint.mjs', legalComments: 'none', banner: { js: '/* Canon Engine pack linter (built). Source: src/cli/lint.ts */' } });
console.log('built dist/canon-lint.mjs');
