// PS: "Canon ignores Persona Library sections" (settings: ignorePersonaSections). Persona Library writes core + enabled
// Additional Sections ("[Title: content]") into the Persona description; with the setting Canon reads the core only.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { personaLibraryCore } from '../../src/adapters/st';
import { personaHash, samePersona } from '../../src/runtime/integration';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const CORE = 'A wandering cartographer from the coast.';
const FULL = `${CORE}\n\n[Incantations: Ignis, ignis, burn bright.]`;
const entry = { core: CORE, sections: [{ title: 'Incantations', content: 'Ignis, ignis, burn bright.', enabled: true }, { title: 'Off', content: 'unused', enabled: false }] };

describe('Canon ignores Persona Library sections', () => {
  it('PS1 the core is used only when this Persona has enabled sections and the description still starts with it', () => {
    expect(personaLibraryCore(entry, FULL)).toBe(CORE);
    expect(personaLibraryCore(entry, `${FULL}\n\nvariant: rainy-day outfit`)).toBe(CORE); // variants are appended
    expect(personaLibraryCore(entry, 'Edited in ST\'s own panel since.')).toBeNull();
    expect(personaLibraryCore({ core: CORE, sections: [{ title: 'Off', content: 'x', enabled: false }] }, CORE)).toBeNull();
    expect(personaLibraryCore(undefined, FULL)).toBeNull();
  });

  it('PS2 a game read one way is the same Persona read the other way', () => {
    const full = personaHash({ name: 'Mia', description: FULL });
    expect(samePersona(full, { name: 'Mia', description: CORE, alt: FULL })).toBe(true);
    expect(samePersona(personaHash({ name: 'Mia', description: CORE }), { name: 'Mia', description: FULL, alt: CORE })).toBe(true);
    expect(samePersona(full, { name: 'Mia', description: 'someone else' })).toBe(false);
    expect(samePersona(undefined, { name: 'Mia', description: FULL })).toBe(false);
  });

  it('PS3 with the setting the profile is read from the core; switching it later raises no "Persona differs" notice', async () => {
    const x = makeEngine();
    x.engine.settings.ignorePersonaSections = true;
    x.host.persona = (o?: { ignoreSections?: boolean }) => (o?.ignoreSections ? { name: 'Mia', description: CORE, alt: FULL, source: 'persona_core' as const } : { name: 'Mia', description: FULL, alt: CORE });
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    x.model.draft('You look around. [P1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const input = x.model.tasks('profile')[0].input;
    expect(input.persona.description).toBe(CORE);
    expect(x.engine.playerProfile()!.profile.source).toBe('persona_core');
    x.engine.settings.ignorePersonaSections = false;
    expect(x.engine.personaChanged()).toBe(false);
  });
});
