// Forms of address: how one side of a relation addresses or refers to the other (RelationView.address). Decided here,
// in code, from what a model, the Persona or a person wrote: the terms cleaned, one form a term, and "always" (the
// only form used) kept consistent with the rest of the list.
import type { AddressChange, AddressForm, AddressUse, Id, RelationViewChange } from './types';
import { normalizeName } from './pack';

export const ADDRESS_USES: readonly AddressUse[] = ['always', 'usually', 'sometimes'];
const ADDRESS_CHANGES: readonly AddressChange['use'][] = [...ADDRESS_USES, 'dropped'];
const MAX_FORMS = 8;

const key = (term: string) => normalizeName(term);

/** The forms as written: each term alone (live: 「「姐姐」」 — the model put the brackets the GM context adds itself;
 *  “首领”或“支仓同学” — two forms in one), several terms in one entry made one form each, a later form of the same term
 *  in place of the earlier. Forms with a use not in `uses`, or no term, are left out. */
export function cleanAddress<U extends string>(list: unknown, uses: readonly U[]): { term: string; use: U; when?: string }[] {
  const out: { term: string; use: U; when?: string }[] = [];
  for (const f of Array.isArray(list) ? list : []) {
    if (!f || typeof f !== 'object') continue;
    const use = String((f as { use?: unknown }).use || '').trim() as U;
    if (!uses.includes(use)) continue;
    const when = String((f as { when?: unknown }).when || '').trim().slice(0, 160);
    for (const piece of String((f as { term?: unknown }).term || '').split(/[、，,／/]|(?<=[」』”"'’）)])\s*或\s*(?=[「『“"'‘（(])/)) {
      const term = piece.trim().replace(/^[「『“"'‘（(]+|[」』”"'’）)]+$/g, '').trim().slice(0, 40);
      if (!term) continue;
      const i = out.findIndex((x) => key(x.term) === key(term));
      if (i >= 0) out.splice(i, 1);
      out.push({ term, use, ...(when ? { when } : {}) });
    }
  }
  return out.slice(-MAX_FORMS);
}

/** A whole list as it stands: "always" is the only form a side uses, so beside other forms it is the usual one. */
export function settleAddress(list: AddressForm[]): AddressForm[] {
  return list.length > 1 ? list.map((f) => (f.use === 'always' ? { ...f, use: 'usually' as const } : f)) : list;
}

/** A change merged into the forms a side has, form by form: a form given replaces the one with the same term or is
 *  added; dropped takes it out; a form now used always is the only one left. */
export function mergeAddress(base: AddressForm[] | undefined, change: AddressChange[] | undefined): AddressForm[] {
  let out = (base || []).map((f) => ({ ...f }));
  for (const c of change || []) {
    const i = out.findIndex((f) => key(f.term) === key(c.term));
    if (c.use === 'dropped') { if (i >= 0) out.splice(i, 1); continue; }
    const form: AddressForm = { term: c.term, use: c.use, ...(c.when ? { when: c.when } : {}) };
    if (c.use === 'always') { out = [form]; continue; }
    if (i >= 0) out[i] = form; else out.push(form);
  }
  return settleAddress(out).slice(-MAX_FORMS);
}

/** The sides of a relation change as a model wrote them: each one of the pair (who resolved by `ref`), once, with a
 *  new regard (sees) or forms of address; forms are changes (dropped allowed) when `change`, else a whole list. */
export function cleanViews(list: unknown, people: readonly Id[], ref: (who: string) => Id | null = (w) => w, change = true): RelationViewChange[] {
  const out: RelationViewChange[] = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (!v || typeof v !== 'object') continue;
    const who = ref(String((v as { who?: unknown }).who || '').trim());
    if (!who || !people.includes(who) || out.some((x) => x.who === who)) continue;
    const sees = String((v as { sees?: unknown }).sees || '').trim().slice(0, 400);
    const raw = cleanAddress((v as { address?: unknown }).address, change ? ADDRESS_CHANGES : ADDRESS_USES);
    const address = change ? raw : settleAddress(raw as AddressForm[]);
    if (sees || address.length) out.push({ who, ...(address.length ? { address } : {}), sees });
  }
  return out;
}

/** One side's forms as one line for a model: 「姐姐大人」 (always); 「食蜂」 (usually); 「那个乳牛女人」 (sometimes: 斗嘴时). */
export function addressLine(list: AddressForm[] | undefined): string {
  return (list || []).map((f) => `「${f.term}」 (${f.use}${f.when ? `: ${f.when}` : ''})`).join('; ');
}
