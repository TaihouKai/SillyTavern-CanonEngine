// Run by scripts/build-site.mjs (bundled for Node): the example pack loaded by the engine, its numbers written to
// site/data/stats.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { validatePackText } from '../../src/core';
import { statsOf } from './stats';

const r = validatePackText(readFileSync('examples/toaru-index.canon.json', 'utf8'));
if (!r.ok || !r.loaded) throw new Error('the example pack failed validation: ' + r.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; '));
writeFileSync('site/data/stats.json', JSON.stringify(statsOf(r)));
