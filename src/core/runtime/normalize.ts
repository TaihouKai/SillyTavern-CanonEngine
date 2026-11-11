// Schema-driven normalization of model output, applied before validation.
//
// Real models (even with a provider-side JSON schema) rename fields, add fields, send null for
// booleans or omit optional data. Patching each case separately never ends, so every structured reply
// is walked together with its JSON schema once:
//  - fields the schema does not define are dropped;
//  - missing or null data that carries no decision is filled with the schema's neutral value
//    (null where allowed, [] for lists, false for booleans, '' for free text);
//  - oversized lists/strings are trimmed;
//  - an item of a record-only list that lacks its identity is dropped (at worst something goes
//    unrecorded; a dropped HARD occurrence still fails the HARD check).
// Fields that DECIDE a check (a player action's quote, a verdict, a HARD status, a violation's detail,
// the review decision...) are never invented: a reply missing them still fails validation and is sent
// back to the model.

type Schema = Record<string, any>;

/** Lists whose items only record or look up things. */
export const RECORD_LISTS: ReadonlySet<string> = new Set(['transitions', 'occurrences', 'new_entities', 'step_enactments', 'references', 'claims', 'statements', 'scene_entities', 'steps', 'assumptions', 'risks', 'adjudications', 'changed']);

/** Fields an item of a record list cannot do without (dropped when empty). */
const IDENTITY: Record<string, string[]> = {
  occurrences: ['title'], new_entities: ['name'], transitions: ['entity_id', 'predicate'], step_enactments: ['step_id', 'occurrence_ref'],
  references: ['phrase'], claims: ['quote'], statements: ['summary'], steps: ['step_id', 'action'], adjudications: ['event_id'],
};

/** Fields that are never filled in: their absence must fail validation. Key: top-level list ('' = top level). */
const PROTECTED: Record<string, ReadonlySet<string>> = {
  '': new Set(['decision', 'violations', 'hard_checks', 'player_actions', 'claim_checks', 'state_claims', 'adjudications', 'steps', 'severity', 'replan', 'scope']),
  player_actions: new Set(['quote']),
  state_claims: new Set(['entity_id', 'predicate', 'value', 'quote']),
  claim_checks: new Set(['claim_id', 'verdict']),
  hard_checks: new Set(['event_id', 'status']),
  violations: new Set(['detail']),
  adjudications: new Set(['event_id', 'decision']),
};

const typesOf = (s: Schema): string[] => (Array.isArray(s.type) ? s.type : s.type ? [s.type] : []);
const nullable = (s: Schema): boolean => typesOf(s).includes('null') || (Array.isArray(s.enum) && s.enum.includes(null)) || (Array.isArray(s.oneOf) && s.oneOf.some((o: Schema) => typesOf(o).includes('null')));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Neutral value for a missing field, or undefined when none is safe. */
function neutral(s: Schema): unknown {
  if (nullable(s)) return null;
  // a time bound given without its precision (seen from deepseek): "approx" keeps the time usable
  if (Array.isArray(s.enum) && s.enum.includes('approx')) return 'approx';
  const t = typesOf(s);
  if (t.includes('array')) return [];
  if (t.includes('boolean')) return false;
  if (t.includes('string') && !(s.minLength >= 1)) return '';
  return undefined;
}

export function normalizeToSchema(data: unknown, schema: Schema, notes: string[]): unknown {
  return walk(data, schema, '', '', notes);
}

function walk(v: unknown, s: Schema, path: string, list: string, notes: string[]): unknown {
  if (!s || typeof s !== 'object') return v;
  if (Array.isArray(s.oneOf)) {
    if (v === null || v === undefined) return nullable(s) ? null : v;
    const objBranch = s.oneOf.find((o: Schema) => typesOf(o).includes('object'));
    if (isObj(v) && objBranch) return walk(v, objBranch, path, list, notes);
    const scalarFits = s.oneOf.some((o: Schema) => (Array.isArray(o.enum) && o.enum.includes(v)) || typesOf(o).some((t) => (t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t)));
    if (!scalarFits && nullable(s)) { notes.push(`${path}: ${JSON.stringify(v).slice(0, 40)} → null`); return null; }
    return v;
  }
  if (Array.isArray(s.enum)) return v; // enum slips are repaired separately (synonyms) or sent back
  const t = typesOf(s);
  if (t.includes('object') && isObj(v)) return walkObject(v, s, path, list, notes);
  if (t.includes('array') && Array.isArray(v)) {
    let arr = v;
    if (typeof s.maxItems === 'number' && arr.length > s.maxItems) { notes.push(`${path}: trimmed ${arr.length} → ${s.maxItems} items`); arr = arr.slice(0, s.maxItems); }
    const itemS: Schema = s.items || {};
    const out: unknown[] = [];
    arr.forEach((item, i) => {
      const lst = list || path.split('/')[1] || '';
      const w = walk(item, itemS, `${path}/${i}`, lst, notes);
      if (RECORD_LISTS.has(lst) && path === `/${lst}` && !itemUsable(w, itemS, IDENTITY[lst] || [])) { notes.push(`dropped ${lst} item without its identity: ${JSON.stringify(item).slice(0, 100)}`); return; }
      out.push(w);
    });
    return out;
  }
  if (v === null && !nullable(s)) {
    if (t.includes('boolean')) { notes.push(`${path}: null → false`); return false; }
    if (t.includes('array')) { notes.push(`${path}: null → []`); return []; }
  }
  if (t.includes('string') && !t.includes('number') && typeof v === 'number') return String(v);
  // An object where a plain id/text is expected (e.g. scene_entities: [{"id": "x", "name": "X"}]).
  if (t.includes('string') && !t.includes('object') && isObj(v)) {
    const pick = ['id', 'entity_id', 'name', 'value', 'text'].map((k) => v[k]).find((x) => typeof x === 'string' && x.trim());
    if (pick !== undefined) { notes.push(`${path}: object → "${String(pick).slice(0, 40)}"`); return pick; }
  }
  if (t.includes('string') && typeof v === 'string' && typeof s.maxLength === 'number' && v.length > s.maxLength) return v.slice(0, s.maxLength);
  return v;
}

function walkObject(o: Record<string, unknown>, s: Schema, path: string, list: string, notes: string[]): Record<string, unknown> {
  const props: Record<string, Schema> = s.properties || {};
  const protectedHere = PROTECTED[path === '' ? '' : list] || new Set<string>();
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!(k in props)) {
      // Nested extras are dropped. A top-level field the schema does not define may be an attempted
      // mutation (e.g. "drop_anchor"): keep it so validation rejects the whole reply.
      if (s.additionalProperties === false && path !== '') continue;
      out[k] = val;
      continue;
    }
    out[k] = walk(val, props[k], `${path}/${k}`, list, notes);
  }
  // null where the schema allows no null: neutral value, or drop the field when it is optional
  for (const k of Object.keys(out)) {
    if (out[k] !== null || !(k in props) || nullable(props[k]) || protectedHere.has(k)) continue;
    const n = neutral(props[k]);
    if (n !== undefined) { out[k] = n; notes.push(`${path}/${k}: null → ${JSON.stringify(n)}`); }
    else if (!(s.required || []).includes(k)) delete out[k];
  }
  for (const k of s.required || []) {
    if (out[k] !== undefined && !(out[k] === null && !nullable(props[k] || {}))) continue;
    if (protectedHere.has(k)) continue;
    if (k === 'ref' && list && RECORD_LISTS.has(list)) { out.ref = `auto${path.split('/').pop()}`; continue; }
    const n = neutral(props[k] || {});
    if (n !== undefined) { out[k] = n; notes.push(`${path || '/'}: filled missing "${k}"`); }
  }
  return out;
}

/** An item can be kept when every required field it needs for identity is present and non-empty. */
function itemUsable(item: unknown, s: Schema, identity: string[]): boolean {
  if (!isObj(item)) return typesOf(s).length === 0 || typesOf(s).some((t) => (t === 'integer' ? Number.isInteger(item) : typeof item === t));
  for (const k of identity) { const v = item[k]; if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return false; }
  const props: Record<string, Schema> = s.properties || {};
  for (const k of s.required || []) {
    const v = item[k];
    if (v === undefined) return false;
    const ps = props[k] || {};
    if (typeof v === 'string' && ps.minLength >= 1 && !v.trim()) return false;
  }
  return true;
}
