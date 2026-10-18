/* Canon Engine pack linter (built). Source: src/cli/lint.ts */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// src/cli/lint.ts
import { readFileSync } from "node:fs";

// src/generated/validators.js
var pack = validate20;
var schema31 = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:pack:1.0.0", "title": "Canon Engine v1 History Pack", "description": "Structural validation only. Semantic validation is specified in HISTORY_PACK_AUTHORING_GUIDE.md.", "type": "object", "properties": { "$schema": { "type": "string" }, "schema_version": { "const": "1.0.0" }, "pack_id": { "$ref": "#/$defs/id" }, "pack_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }, "title": { "type": "string", "minLength": 1 }, "language": { "type": "string", "minLength": 1 }, "description": { "type": "string", "minLength": 1 }, "calendar": { "type": "object", "properties": { "system": { "const": "relative_day" }, "origin_label": { "type": "string", "minLength": 1 }, "day_length_minutes": { "const": 1440 }, "time_zone_label": { "type": "string", "minLength": 1 }, "notes": { "type": "string" } }, "required": ["system", "origin_label", "day_length_minutes", "time_zone_label", "notes"], "additionalProperties": false }, "coverage": { "type": "object", "properties": { "start": { "$ref": "#/$defs/time" }, "end": { "$ref": "#/$defs/time" }, "notes": { "type": "string" } }, "required": ["start", "end", "notes"], "additionalProperties": false }, "sources": { "type": "array", "items": { "$ref": "#/$defs/source" }, "minItems": 1 }, "predicates": { "type": "array", "items": { "$ref": "#/$defs/predicate" }, "minItems": 1 }, "entities": { "type": "array", "items": { "$ref": "#/$defs/entity" }, "minItems": 1 }, "initial_state": { "type": "object", "properties": { "at": { "$ref": "#/$defs/time" }, "facts": { "type": "array", "items": { "$ref": "#/$defs/initial_fact" } } }, "required": ["at", "facts"], "additionalProperties": false }, "arcs": { "type": "array", "items": { "$ref": "#/$defs/arc" } }, "events": { "type": "array", "items": { "$ref": "#/$defs/event" }, "minItems": 1 }, "edges": { "type": "array", "items": { "$ref": "#/$defs/edge" } } }, "required": ["schema_version", "pack_id", "pack_version", "title", "language", "description", "calendar", "coverage", "sources", "predicates", "entities", "initial_state", "arcs", "events", "edges"], "additionalProperties": false, "$defs": { "id": { "type": "string", "pattern": "^[a-z][a-z0-9_.-]*$" }, "time": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }] }, "fact": { "type": "object", "properties": { "entity_id": { "$ref": "#/$defs/id" }, "predicate": { "$ref": "#/$defs/id" }, "value": { "$ref": "#/$defs/value" } }, "required": ["entity_id", "predicate", "value"], "additionalProperties": false }, "effect": { "oneOf": [{ "type": "object", "properties": { "op": { "const": "set" }, "fact": { "$ref": "#/$defs/fact" } }, "required": ["op", "fact"], "additionalProperties": false }, { "type": "object", "properties": { "op": { "const": "unset" }, "entity_id": { "$ref": "#/$defs/id" }, "predicate": { "$ref": "#/$defs/id" } }, "required": ["op", "entity_id", "predicate"], "additionalProperties": false }] }, "condition": { "oneOf": [{ "type": "object", "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/condition" } } }, "required": ["all"], "additionalProperties": false }, { "type": "object", "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/condition" }, "minItems": 1 } }, "required": ["any"], "additionalProperties": false }, { "type": "object", "properties": { "not": { "$ref": "#/$defs/condition" } }, "required": ["not"], "additionalProperties": false }, { "type": "object", "properties": { "fact": { "$ref": "#/$defs/fact" } }, "required": ["fact"], "additionalProperties": false }, { "type": "object", "properties": { "occurred": { "$ref": "#/$defs/id" } }, "required": ["occurred"], "additionalProperties": false }] }, "source": { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "title": { "type": "string", "minLength": 1 }, "locator": { "type": "string", "minLength": 1 }, "kind": { "enum": ["primary", "secondary", "editorial", "example"] }, "notes": { "type": "string" } }, "required": ["id", "title", "locator", "kind", "notes"], "additionalProperties": false }, "predicate": { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "description": { "type": "string", "minLength": 1 }, "value_type": { "enum": ["boolean", "number", "string", "entity_ref", "entity_set"] }, "allowed_values": { "type": "array", "items": { "$ref": "#/$defs/value" }, "minItems": 1, "uniqueItems": true }, "transient": { "type": "boolean" }, "settled_values": { "type": "array", "items": { "$ref": "#/$defs/value" }, "minItems": 1, "uniqueItems": true } }, "required": ["id", "description", "value_type"], "additionalProperties": false }, "entity": { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "name": { "type": "string", "minLength": 1 }, "aliases": { "type": "array", "items": { "type": "string", "minLength": 1 }, "uniqueItems": true }, "kind": { "enum": ["person", "organization", "place", "object", "world", "other"] }, "static_description": { "type": "string", "minLength": 1 }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true } }, "required": ["id", "name", "aliases", "kind", "static_description", "source_refs"], "additionalProperties": false }, "when": { "type": "object", "properties": { "earliest": { "oneOf": [{ "$ref": "#/$defs/time" }, { "type": "null" }] }, "latest": { "oneOf": [{ "$ref": "#/$defs/time" }, { "type": "null" }] }, "precision": { "enum": ["minute", "day", "range", "unknown"] }, "label": { "type": "string", "minLength": 1 }, "basis": { "enum": ["documented", "editorial", "unknown"] }, "notes": { "type": "string" } }, "required": ["earliest", "latest", "precision", "label", "basis", "notes"], "additionalProperties": false }, "visibility": { "type": "object", "properties": { "mode": { "enum": ["public", "restricted", "secret"] }, "knower_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true } }, "required": ["mode", "knower_ids"], "additionalProperties": false }, "participation": { "type": "object", "properties": { "offer": { "enum": ["when_relevant", "never"] }, "hook": { "type": "string" } }, "required": ["offer", "hook"], "additionalProperties": false }, "event": { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "title": { "type": "string", "minLength": 1 }, "summary": { "type": "string", "minLength": 1 }, "classification": { "enum": ["HARD", "SOFT", "FREE"] }, "required_description": { "oneOf": [{ "type": "string", "minLength": 1 }, { "type": "null" }] }, "when": { "$ref": "#/$defs/when" }, "entity_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "location_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "arc_id": { "oneOf": [{ "$ref": "#/$defs/id" }, { "type": "null" }] }, "canonical_preconditions": { "$ref": "#/$defs/condition" }, "outcomes": { "type": "array", "items": { "$ref": "#/$defs/fact" } }, "canonical_effects": { "type": "array", "items": { "$ref": "#/$defs/effect" } }, "visibility": { "$ref": "#/$defs/visibility" }, "participation": { "$ref": "#/$defs/participation" }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "author_note": { "type": "string" } }, "required": ["id", "title", "summary", "classification", "required_description", "when", "entity_ids", "location_ids", "arc_id", "canonical_preconditions", "outcomes", "canonical_effects", "visibility", "participation", "source_refs", "author_note"], "additionalProperties": false, "allOf": [{ "if": { "properties": { "classification": { "const": "HARD" } }, "required": ["classification"] }, "then": { "properties": { "required_description": { "type": "string", "minLength": 1 }, "outcomes": { "minItems": 1 }, "when": { "properties": { "earliest": { "$ref": "#/$defs/time" }, "latest": { "$ref": "#/$defs/time" }, "precision": { "enum": ["minute", "day", "range"] }, "basis": { "enum": ["documented", "editorial"] } } } } }, "else": { "properties": { "required_description": { "type": "null" } } } }] }, "edge": { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "from": { "$ref": "#/$defs/id" }, "to": { "$ref": "#/$defs/id" }, "relation": { "enum": ["enables", "motivates", "precedes", "related"] }, "basis": { "enum": ["documented", "inferred", "editorial"] }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "note": { "type": "string", "minLength": 1 } }, "required": ["id", "from", "to", "relation", "basis", "source_refs", "note"], "additionalProperties": false }, "arc": { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "title": { "type": "string", "minLength": 1 }, "summary": { "type": "string", "minLength": 1 }, "event_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true } }, "required": ["id", "title", "summary", "event_ids"], "additionalProperties": false }, "initial_fact": { "type": "object", "properties": { "fact": { "$ref": "#/$defs/fact" }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "note": { "type": "string" } }, "required": ["fact", "source_refs", "note"], "additionalProperties": false } } };
var func1 = Object.prototype.hasOwnProperty;
var func2 = require_ucs2length().default;
var pattern4 = new RegExp("^[a-z][a-z0-9_.-]*$", "u");
var pattern5 = new RegExp("^\\d+\\.\\d+\\.\\d+$", "u");
var schema35 = { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "title": { "type": "string", "minLength": 1 }, "locator": { "type": "string", "minLength": 1 }, "kind": { "enum": ["primary", "secondary", "editorial", "example"] }, "notes": { "type": "string" } }, "required": ["id", "title", "locator", "kind", "notes"], "additionalProperties": false };
function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.title === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.locator === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "locator" }, message: "must have required property 'locator'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.kind === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.notes === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "notes" }, message: "must have required property 'notes'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "title" || key0 === "locator" || key0 === "kind" || key0 === "notes")) {
        const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err6 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.title !== void 0) {
      let data1 = data.title;
      if (typeof data1 === "string") {
        if (func2(data1) < 1) {
          const err8 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.locator !== void 0) {
      let data2 = data.locator;
      if (typeof data2 === "string") {
        if (func2(data2) < 1) {
          const err10 = { instancePath: instancePath + "/locator", schemaPath: "#/properties/locator/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = { instancePath: instancePath + "/locator", schemaPath: "#/properties/locator/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data3 = data.kind;
      if (!(data3 === "primary" || data3 === "secondary" || data3 === "editorial" || data3 === "example")) {
        const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/enum", keyword: "enum", params: { allowedValues: schema35.properties.kind.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.notes !== void 0) {
      if (typeof data.notes !== "string") {
        const err13 = { instancePath: instancePath + "/notes", schemaPath: "#/properties/notes/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema37 = { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "description": { "type": "string", "minLength": 1 }, "value_type": { "enum": ["boolean", "number", "string", "entity_ref", "entity_set"] }, "allowed_values": { "type": "array", "items": { "$ref": "#/$defs/value" }, "minItems": 1, "uniqueItems": true }, "transient": { "type": "boolean" }, "settled_values": { "type": "array", "items": { "$ref": "#/$defs/value" }, "minItems": 1, "uniqueItems": true } }, "required": ["id", "description", "value_type"], "additionalProperties": false };
var func0 = require_equal().default;
function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate24.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== "boolean") {
    const err0 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (!(typeof data == "number")) {
    const err1 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs5 = errors;
    if (typeof data !== "string") {
      const err2 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    var _valid0 = _errs5 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs7 = errors;
      if (Array.isArray(data)) {
        const len0 = data.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data0 = data[i0];
          if (typeof data0 === "string") {
            if (!pattern4.test(data0)) {
              const err3 = { instancePath: instancePath + "/" + i0, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
          } else {
            const err4 = { instancePath: instancePath + "/" + i0, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        let i1 = data.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data[i1], data[j0])) {
                const err5 = { instancePath, schemaPath: "#/oneOf/3/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err5];
                } else {
                  vErrors.push(err5);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      var _valid0 = _errs7 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
          var items0 = true;
        }
      }
    }
  }
  if (!valid0) {
    const err7 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate24.errors = vErrors;
  evaluated0.items = items0;
  return errors === 0;
}
validate24.evaluated = { "dynamicProps": false, "dynamicItems": true };
function validate23(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate23.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.description === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.value_type === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "value_type" }, message: "must have required property 'value_type'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "description" || key0 === "value_type" || key0 === "allowed_values" || key0 === "transient" || key0 === "settled_values")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err4 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.description !== void 0) {
      let data1 = data.description;
      if (typeof data1 === "string") {
        if (func2(data1) < 1) {
          const err6 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.value_type !== void 0) {
      let data2 = data.value_type;
      if (!(data2 === "boolean" || data2 === "number" || data2 === "string" || data2 === "entity_ref" || data2 === "entity_set")) {
        const err8 = { instancePath: instancePath + "/value_type", schemaPath: "#/properties/value_type/enum", keyword: "enum", params: { allowedValues: schema37.properties.value_type.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.allowed_values !== void 0) {
      let data3 = data.allowed_values;
      if (Array.isArray(data3)) {
        if (data3.length < 1) {
          const err9 = { instancePath: instancePath + "/allowed_values", schemaPath: "#/properties/allowed_values/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        const len0 = data3.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate24(data3[i0], { instancePath: instancePath + "/allowed_values/" + i0, parentData: data3, parentDataProperty: i0, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
        }
        let i1 = data3.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data3[i1], data3[j0])) {
                const err10 = { instancePath: instancePath + "/allowed_values", schemaPath: "#/properties/allowed_values/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err11 = { instancePath: instancePath + "/allowed_values", schemaPath: "#/properties/allowed_values/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.transient !== void 0) {
      if (typeof data.transient !== "boolean") {
        const err12 = { instancePath: instancePath + "/transient", schemaPath: "#/properties/transient/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.settled_values !== void 0) {
      let data6 = data.settled_values;
      if (Array.isArray(data6)) {
        if (data6.length < 1) {
          const err13 = { instancePath: instancePath + "/settled_values", schemaPath: "#/properties/settled_values/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        const len1 = data6.length;
        for (let i2 = 0; i2 < len1; i2++) {
          if (!validate24(data6[i2], { instancePath: instancePath + "/settled_values/" + i2, parentData: data6, parentDataProperty: i2, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
        }
        let i3 = data6.length;
        let j1;
        if (i3 > 1) {
          outer1: for (; i3--; ) {
            for (j1 = i3; j1--; ) {
              if (func0(data6[i3], data6[j1])) {
                const err14 = { instancePath: instancePath + "/settled_values", schemaPath: "#/properties/settled_values/uniqueItems", keyword: "uniqueItems", params: { i: i3, j: j1 }, message: "must NOT have duplicate items (items ## " + j1 + " and " + i3 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
                break outer1;
              }
            }
          }
        }
      } else {
        const err15 = { instancePath: instancePath + "/settled_values", schemaPath: "#/properties/settled_values/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
  } else {
    const err16 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  validate23.errors = vErrors;
  return errors === 0;
}
validate23.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema41 = { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "name": { "type": "string", "minLength": 1 }, "aliases": { "type": "array", "items": { "type": "string", "minLength": 1 }, "uniqueItems": true }, "kind": { "enum": ["person", "organization", "place", "object", "world", "other"] }, "static_description": { "type": "string", "minLength": 1 }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true } }, "required": ["id", "name", "aliases", "kind", "static_description", "source_refs"], "additionalProperties": false };
function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate28.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.aliases === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "aliases" }, message: "must have required property 'aliases'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.kind === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.static_description === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "static_description" }, message: "must have required property 'static_description'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.source_refs === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source_refs" }, message: "must have required property 'source_refs'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "name" || key0 === "aliases" || key0 === "kind" || key0 === "static_description" || key0 === "source_refs")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err7 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data1 = data.name;
      if (typeof data1 === "string") {
        if (func2(data1) < 1) {
          const err9 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.aliases !== void 0) {
      let data2 = data.aliases;
      if (Array.isArray(data2)) {
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data3 = data2[i0];
          if (typeof data3 === "string") {
            if (func2(data3) < 1) {
              const err11 = { instancePath: instancePath + "/aliases/" + i0, schemaPath: "#/properties/aliases/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/aliases/" + i0, schemaPath: "#/properties/aliases/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        let i1 = data2.length;
        let j0;
        if (i1 > 1) {
          const indices0 = {};
          for (; i1--; ) {
            let item0 = data2[i1];
            if (typeof item0 !== "string") {
              continue;
            }
            if (typeof indices0[item0] == "number") {
              j0 = indices0[item0];
              const err13 = { instancePath: instancePath + "/aliases", schemaPath: "#/properties/aliases/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
              break;
            }
            indices0[item0] = i1;
          }
        }
      } else {
        const err14 = { instancePath: instancePath + "/aliases", schemaPath: "#/properties/aliases/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data4 = data.kind;
      if (!(data4 === "person" || data4 === "organization" || data4 === "place" || data4 === "object" || data4 === "world" || data4 === "other")) {
        const err15 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/enum", keyword: "enum", params: { allowedValues: schema41.properties.kind.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.static_description !== void 0) {
      let data5 = data.static_description;
      if (typeof data5 === "string") {
        if (func2(data5) < 1) {
          const err16 = { instancePath: instancePath + "/static_description", schemaPath: "#/properties/static_description/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = { instancePath: instancePath + "/static_description", schemaPath: "#/properties/static_description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.source_refs !== void 0) {
      let data6 = data.source_refs;
      if (Array.isArray(data6)) {
        const len1 = data6.length;
        for (let i2 = 0; i2 < len1; i2++) {
          let data7 = data6[i2];
          if (typeof data7 === "string") {
            if (!pattern4.test(data7)) {
              const err18 = { instancePath: instancePath + "/source_refs/" + i2, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          } else {
            const err19 = { instancePath: instancePath + "/source_refs/" + i2, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        let i3 = data6.length;
        let j1;
        if (i3 > 1) {
          outer0: for (; i3--; ) {
            for (j1 = i3; j1--; ) {
              if (func0(data6[i3], data6[j1])) {
                const err20 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/uniqueItems", keyword: "uniqueItems", params: { i: i3, j: j1 }, message: "must NOT have duplicate items (items ## " + j1 + " and " + i3 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err21 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
  } else {
    const err22 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate28.errors = vErrors;
  return errors === 0;
}
validate28.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate31(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate31.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.entity_id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.predicate === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "entity_id" || key0 === "predicate" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.entity_id !== void 0) {
      let data0 = data.entity_id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err4 = { instancePath: instancePath + "/entity_id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/entity_id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.predicate !== void 0) {
      let data1 = data.predicate;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err6 = { instancePath: instancePath + "/predicate", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = { instancePath: instancePath + "/predicate", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      if (!validate24(data.value, { instancePath: instancePath + "/value", parentData: data, parentDataProperty: "value", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate31.errors = vErrors;
  return errors === 0;
}
validate31.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate30(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate30.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.fact === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.source_refs === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source_refs" }, message: "must have required property 'source_refs'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.note === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "note" }, message: "must have required property 'note'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "fact" || key0 === "source_refs" || key0 === "note")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.fact !== void 0) {
      if (!validate31(data.fact, { instancePath: instancePath + "/fact", parentData: data, parentDataProperty: "fact", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
        errors = vErrors.length;
      }
    }
    if (data.source_refs !== void 0) {
      let data1 = data.source_refs;
      if (Array.isArray(data1)) {
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data2 = data1[i0];
          if (typeof data2 === "string") {
            if (!pattern4.test(data2)) {
              const err4 = { instancePath: instancePath + "/source_refs/" + i0, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/source_refs/" + i0, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        let i1 = data1.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data1[i1], data1[j0])) {
                const err6 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err7 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.note !== void 0) {
      if (typeof data.note !== "string") {
        const err8 = { instancePath: instancePath + "/note", schemaPath: "#/properties/note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  validate30.errors = vErrors;
  return errors === 0;
}
validate30.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate35(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate35.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.title === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.summary === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.event_ids === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "event_ids" }, message: "must have required property 'event_ids'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "title" || key0 === "summary" || key0 === "event_ids")) {
        const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err5 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.title !== void 0) {
      let data1 = data.title;
      if (typeof data1 === "string") {
        if (func2(data1) < 1) {
          const err7 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.summary !== void 0) {
      let data2 = data.summary;
      if (typeof data2 === "string") {
        if (func2(data2) < 1) {
          const err9 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.event_ids !== void 0) {
      let data3 = data.event_ids;
      if (Array.isArray(data3)) {
        const len0 = data3.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data4 = data3[i0];
          if (typeof data4 === "string") {
            if (!pattern4.test(data4)) {
              const err11 = { instancePath: instancePath + "/event_ids/" + i0, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/event_ids/" + i0, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        let i1 = data3.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data3[i1], data3[j0])) {
                const err13 = { instancePath: instancePath + "/event_ids", schemaPath: "#/properties/event_ids/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err14 = { instancePath: instancePath + "/event_ids", schemaPath: "#/properties/event_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
  } else {
    const err15 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  }
  validate35.errors = vErrors;
  return errors === 0;
}
validate35.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema53 = { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "title": { "type": "string", "minLength": 1 }, "summary": { "type": "string", "minLength": 1 }, "classification": { "enum": ["HARD", "SOFT", "FREE"] }, "required_description": { "oneOf": [{ "type": "string", "minLength": 1 }, { "type": "null" }] }, "when": { "$ref": "#/$defs/when" }, "entity_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "location_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "arc_id": { "oneOf": [{ "$ref": "#/$defs/id" }, { "type": "null" }] }, "canonical_preconditions": { "$ref": "#/$defs/condition" }, "outcomes": { "type": "array", "items": { "$ref": "#/$defs/fact" } }, "canonical_effects": { "type": "array", "items": { "$ref": "#/$defs/effect" } }, "visibility": { "$ref": "#/$defs/visibility" }, "participation": { "$ref": "#/$defs/participation" }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "author_note": { "type": "string" } }, "required": ["id", "title", "summary", "classification", "required_description", "when", "entity_ids", "location_ids", "arc_id", "canonical_preconditions", "outcomes", "canonical_effects", "visibility", "participation", "source_refs", "author_note"], "additionalProperties": false, "allOf": [{ "if": { "properties": { "classification": { "const": "HARD" } }, "required": ["classification"] }, "then": { "properties": { "required_description": { "type": "string", "minLength": 1 }, "outcomes": { "minItems": 1 }, "when": { "properties": { "earliest": { "$ref": "#/$defs/time" }, "latest": { "$ref": "#/$defs/time" }, "precision": { "enum": ["minute", "day", "range"] }, "basis": { "enum": ["documented", "editorial"] } } } } }, "else": { "properties": { "required_description": { "type": "null" } } } }] };
var schema70 = { "type": "object", "properties": { "offer": { "enum": ["when_relevant", "never"] }, "hook": { "type": "string" } }, "required": ["offer", "hook"], "additionalProperties": false };
var schema57 = { "type": "object", "properties": { "earliest": { "oneOf": [{ "$ref": "#/$defs/time" }, { "type": "null" }] }, "latest": { "oneOf": [{ "$ref": "#/$defs/time" }, { "type": "null" }] }, "precision": { "enum": ["minute", "day", "range", "unknown"] }, "label": { "type": "string", "minLength": 1 }, "basis": { "enum": ["documented", "editorial", "unknown"] }, "notes": { "type": "string" } }, "required": ["earliest", "latest", "precision", "label", "basis", "notes"], "additionalProperties": false };
function validate38(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate38.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.earliest === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "earliest" }, message: "must have required property 'earliest'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.latest === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "latest" }, message: "must have required property 'latest'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.precision === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "precision" }, message: "must have required property 'precision'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.label === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.basis === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "basis" }, message: "must have required property 'basis'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.notes === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "notes" }, message: "must have required property 'notes'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "earliest" || key0 === "latest" || key0 === "precision" || key0 === "label" || key0 === "basis" || key0 === "notes")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.earliest !== void 0) {
      let data0 = data.earliest;
      const _errs3 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs4 = errors;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.day === void 0) {
          const err7 = { instancePath: instancePath + "/earliest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data0.minute === void 0) {
          const err8 = { instancePath: instancePath + "/earliest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "day" || key1 === "minute")) {
            const err9 = { instancePath: instancePath + "/earliest", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data0.day !== void 0) {
          let data1 = data0.day;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)))) {
            const err10 = { instancePath: instancePath + "/earliest/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data0.minute !== void 0) {
          let data2 = data0.minute;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)))) {
            const err11 = { instancePath: instancePath + "/earliest/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data2 == "number") {
            if (data2 > 1439 || isNaN(data2)) {
              const err12 = { instancePath: instancePath + "/earliest/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err13 = { instancePath: instancePath + "/earliest/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
      } else {
        const err14 = { instancePath: instancePath + "/earliest", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs4 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs12 = errors;
      if (data0 !== null) {
        const err15 = { instancePath: instancePath + "/earliest", schemaPath: "#/properties/earliest/oneOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      var _valid0 = _errs12 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err16 = { instancePath: instancePath + "/earliest", schemaPath: "#/properties/earliest/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      } else {
        errors = _errs3;
        if (vErrors !== null) {
          if (_errs3) {
            vErrors.length = _errs3;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.latest !== void 0) {
      let data3 = data.latest;
      const _errs15 = errors;
      let valid4 = false;
      let passing1 = null;
      const _errs16 = errors;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
        if (data3.day === void 0) {
          const err17 = { instancePath: instancePath + "/latest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data3.minute === void 0) {
          const err18 = { instancePath: instancePath + "/latest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        for (const key2 in data3) {
          if (!(key2 === "day" || key2 === "minute")) {
            const err19 = { instancePath: instancePath + "/latest", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data3.day !== void 0) {
          let data4 = data3.day;
          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)))) {
            const err20 = { instancePath: instancePath + "/latest/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data3.minute !== void 0) {
          let data5 = data3.minute;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)))) {
            const err21 = { instancePath: instancePath + "/latest/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (typeof data5 == "number") {
            if (data5 > 1439 || isNaN(data5)) {
              const err22 = { instancePath: instancePath + "/latest/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data5 < 0 || isNaN(data5)) {
              const err23 = { instancePath: instancePath + "/latest/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        }
      } else {
        const err24 = { instancePath: instancePath + "/latest", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid1 = _errs16 === errors;
      if (_valid1) {
        valid4 = true;
        passing1 = 0;
      }
      const _errs24 = errors;
      if (data3 !== null) {
        const err25 = { instancePath: instancePath + "/latest", schemaPath: "#/properties/latest/oneOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      var _valid1 = _errs24 === errors;
      if (_valid1 && valid4) {
        valid4 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid4 = true;
          passing1 = 1;
        }
      }
      if (!valid4) {
        const err26 = { instancePath: instancePath + "/latest", schemaPath: "#/properties/latest/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs15;
        if (vErrors !== null) {
          if (_errs15) {
            vErrors.length = _errs15;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.precision !== void 0) {
      let data6 = data.precision;
      if (!(data6 === "minute" || data6 === "day" || data6 === "range" || data6 === "unknown")) {
        const err27 = { instancePath: instancePath + "/precision", schemaPath: "#/properties/precision/enum", keyword: "enum", params: { allowedValues: schema57.properties.precision.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.label !== void 0) {
      let data7 = data.label;
      if (typeof data7 === "string") {
        if (func2(data7) < 1) {
          const err28 = { instancePath: instancePath + "/label", schemaPath: "#/properties/label/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      } else {
        const err29 = { instancePath: instancePath + "/label", schemaPath: "#/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.basis !== void 0) {
      let data8 = data.basis;
      if (!(data8 === "documented" || data8 === "editorial" || data8 === "unknown")) {
        const err30 = { instancePath: instancePath + "/basis", schemaPath: "#/properties/basis/enum", keyword: "enum", params: { allowedValues: schema57.properties.basis.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.notes !== void 0) {
      if (typeof data.notes !== "string") {
        const err31 = { instancePath: instancePath + "/notes", schemaPath: "#/properties/notes/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
  } else {
    const err32 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  validate38.errors = vErrors;
  return errors === 0;
}
validate38.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var wrapper0 = { validate: validate40 };
function validate40(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate40.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.all === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "all" }, message: "must have required property 'all'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "all")) {
        const err1 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.all !== void 0) {
      let data0 = data.all;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!wrapper0.validate(data0[i0], { instancePath: instancePath + "/all/" + i0, parentData: data0, parentDataProperty: i0, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = { instancePath: instancePath + "/all", schemaPath: "#/oneOf/0/properties/all/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props1 = true;
  }
  const _errs7 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.any === void 0) {
      const err4 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "any" }, message: "must have required property 'any'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "any")) {
        const err5 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.any !== void 0) {
      let data2 = data.any;
      if (Array.isArray(data2)) {
        if (data2.length < 1) {
          const err6 = { instancePath: instancePath + "/any", schemaPath: "#/oneOf/1/properties/any/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        const len1 = data2.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!wrapper0.validate(data2[i1], { instancePath: instancePath + "/any/" + i1, parentData: data2, parentDataProperty: i1, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err7 = { instancePath: instancePath + "/any", schemaPath: "#/oneOf/1/properties/any/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  var _valid0 = _errs7 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props1 !== true) {
        props1 = true;
      }
    }
    const _errs13 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.not === void 0) {
        const err9 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "not" }, message: "must have required property 'not'" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "not")) {
          const err10 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
      if (data.not !== void 0) {
        if (!wrapper0.validate(data.not, { instancePath: instancePath + "/not", parentData: data, parentDataProperty: "not", rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    var _valid0 = _errs13 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
        if (props1 !== true) {
          props1 = true;
        }
      }
      const _errs17 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.fact === void 0) {
          const err12 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        for (const key3 in data) {
          if (!(key3 === "fact")) {
            const err13 = { instancePath, schemaPath: "#/oneOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.fact !== void 0) {
          if (!validate31(data.fact, { instancePath: instancePath + "/fact", parentData: data, parentDataProperty: "fact", rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs17 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
          if (props1 !== true) {
            props1 = true;
          }
        }
        const _errs21 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.occurred === void 0) {
            const err15 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "occurred" }, message: "must have required property 'occurred'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          for (const key4 in data) {
            if (!(key4 === "occurred")) {
              const err16 = { instancePath, schemaPath: "#/oneOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.occurred !== void 0) {
            let data6 = data.occurred;
            if (typeof data6 === "string") {
              if (!pattern4.test(data6)) {
                const err17 = { instancePath: instancePath + "/occurred", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = { instancePath: instancePath + "/occurred", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
        } else {
          const err19 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
            if (props1 !== true) {
              props1 = true;
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err20 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate40.errors = vErrors;
  evaluated0.props = props1;
  return errors === 0;
}
validate40.evaluated = { "dynamicProps": true, "dynamicItems": false };
function validate44(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate44.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.op === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "op" }, message: "must have required property 'op'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.fact === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "op" || key0 === "fact")) {
        const err2 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.op !== void 0) {
      if ("set" !== data.op) {
        const err3 = { instancePath: instancePath + "/op", schemaPath: "#/oneOf/0/properties/op/const", keyword: "const", params: { allowedValue: "set" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.fact !== void 0) {
      if (!validate31(data.fact, { instancePath: instancePath + "/fact", parentData: data, parentDataProperty: "fact", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err4 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = true;
  }
  const _errs6 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.op === void 0) {
      const err5 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "op" }, message: "must have required property 'op'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.entity_id === void 0) {
      const err6 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.predicate === void 0) {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "op" || key1 === "entity_id" || key1 === "predicate")) {
        const err8 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.op !== void 0) {
      if ("unset" !== data.op) {
        const err9 = { instancePath: instancePath + "/op", schemaPath: "#/oneOf/1/properties/op/const", keyword: "const", params: { allowedValue: "unset" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.entity_id !== void 0) {
      let data3 = data.entity_id;
      if (typeof data3 === "string") {
        if (!pattern4.test(data3)) {
          const err10 = { instancePath: instancePath + "/entity_id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = { instancePath: instancePath + "/entity_id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.predicate !== void 0) {
      let data4 = data.predicate;
      if (typeof data4 === "string") {
        if (!pattern4.test(data4)) {
          const err12 = { instancePath: instancePath + "/predicate", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/predicate", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  var _valid0 = _errs6 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = true;
      }
    }
  }
  if (!valid0) {
    const err15 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate44.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate44.evaluated = { "dynamicProps": true, "dynamicItems": false };
var schema68 = { "type": "object", "properties": { "mode": { "enum": ["public", "restricted", "secret"] }, "knower_ids": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true } }, "required": ["mode", "knower_ids"], "additionalProperties": false };
function validate47(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate47.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.mode === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.knower_ids === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "knower_ids" }, message: "must have required property 'knower_ids'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "mode" || key0 === "knower_ids")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.mode !== void 0) {
      let data0 = data.mode;
      if (!(data0 === "public" || data0 === "restricted" || data0 === "secret")) {
        const err3 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema68.properties.mode.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.knower_ids !== void 0) {
      let data1 = data.knower_ids;
      if (Array.isArray(data1)) {
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data2 = data1[i0];
          if (typeof data2 === "string") {
            if (!pattern4.test(data2)) {
              const err4 = { instancePath: instancePath + "/knower_ids/" + i0, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/knower_ids/" + i0, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        let i1 = data1.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data1[i1], data1[j0])) {
                const err6 = { instancePath: instancePath + "/knower_ids", schemaPath: "#/properties/knower_ids/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err7 = { instancePath: instancePath + "/knower_ids", schemaPath: "#/properties/knower_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate47.errors = vErrors;
  return errors === 0;
}
validate47.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate37(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate37.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  const _errs2 = errors;
  let valid1 = true;
  const _errs3 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing0;
    if (data.classification === void 0 && (missing0 = "classification")) {
      const err0 = {};
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    } else {
      if (data.classification !== void 0) {
        if ("HARD" !== data.classification) {
          const err1 = {};
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
    }
  }
  var _valid0 = _errs3 === errors;
  errors = _errs2;
  if (vErrors !== null) {
    if (_errs2) {
      vErrors.length = _errs2;
    } else {
      vErrors = null;
    }
  }
  let ifClause0;
  if (_valid0) {
    const _errs5 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.required_description !== void 0) {
        let data1 = data.required_description;
        if (typeof data1 === "string") {
          if (func2(data1) < 1) {
            const err2 = { instancePath: instancePath + "/required_description", schemaPath: "#/allOf/0/then/properties/required_description/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + "/required_description", schemaPath: "#/allOf/0/then/properties/required_description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.outcomes !== void 0) {
        let data2 = data.outcomes;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err4 = { instancePath: instancePath + "/outcomes", schemaPath: "#/allOf/0/then/properties/outcomes/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      }
      if (data.when !== void 0) {
        let data3 = data.when;
        if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
          if (data3.earliest !== void 0) {
            let data4 = data3.earliest;
            if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
              if (data4.day === void 0) {
                const err5 = { instancePath: instancePath + "/when/earliest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                if (vErrors === null) {
                  vErrors = [err5];
                } else {
                  vErrors.push(err5);
                }
                errors++;
              }
              if (data4.minute === void 0) {
                const err6 = { instancePath: instancePath + "/when/earliest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
              for (const key0 in data4) {
                if (!(key0 === "day" || key0 === "minute")) {
                  const err7 = { instancePath: instancePath + "/when/earliest", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
              }
              if (data4.day !== void 0) {
                let data5 = data4.day;
                if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)))) {
                  const err8 = { instancePath: instancePath + "/when/earliest/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
              }
              if (data4.minute !== void 0) {
                let data6 = data4.minute;
                if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)))) {
                  const err9 = { instancePath: instancePath + "/when/earliest/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (typeof data6 == "number") {
                  if (data6 > 1439 || isNaN(data6)) {
                    const err10 = { instancePath: instancePath + "/when/earliest/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                  if (data6 < 0 || isNaN(data6)) {
                    const err11 = { instancePath: instancePath + "/when/earliest/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
              }
            } else {
              const err12 = { instancePath: instancePath + "/when/earliest", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data3.latest !== void 0) {
            let data7 = data3.latest;
            if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
              if (data7.day === void 0) {
                const err13 = { instancePath: instancePath + "/when/latest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              if (data7.minute === void 0) {
                const err14 = { instancePath: instancePath + "/when/latest", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              for (const key1 in data7) {
                if (!(key1 === "day" || key1 === "minute")) {
                  const err15 = { instancePath: instancePath + "/when/latest", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
              }
              if (data7.day !== void 0) {
                let data8 = data7.day;
                if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)))) {
                  const err16 = { instancePath: instancePath + "/when/latest/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              }
              if (data7.minute !== void 0) {
                let data9 = data7.minute;
                if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)))) {
                  const err17 = { instancePath: instancePath + "/when/latest/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (typeof data9 == "number") {
                  if (data9 > 1439 || isNaN(data9)) {
                    const err18 = { instancePath: instancePath + "/when/latest/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                  if (data9 < 0 || isNaN(data9)) {
                    const err19 = { instancePath: instancePath + "/when/latest/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
              }
            } else {
              const err20 = { instancePath: instancePath + "/when/latest", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
          if (data3.precision !== void 0) {
            let data10 = data3.precision;
            if (!(data10 === "minute" || data10 === "day" || data10 === "range")) {
              const err21 = { instancePath: instancePath + "/when/precision", schemaPath: "#/allOf/0/then/properties/when/properties/precision/enum", keyword: "enum", params: { allowedValues: schema53.allOf[0].then.properties.when.properties.precision.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data3.basis !== void 0) {
            let data11 = data3.basis;
            if (!(data11 === "documented" || data11 === "editorial")) {
              const err22 = { instancePath: instancePath + "/when/basis", schemaPath: "#/allOf/0/then/properties/when/properties/basis/enum", keyword: "enum", params: { allowedValues: schema53.allOf[0].then.properties.when.properties.basis.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
        }
      }
    }
    var _valid0 = _errs5 === errors;
    valid1 = _valid0;
    if (valid1) {
      var props0 = {};
      props0.required_description = true;
      props0.outcomes = true;
      props0.when = true;
      props0.classification = true;
    }
    ifClause0 = "then";
  } else {
    const _errs28 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.required_description !== void 0) {
        if (data.required_description !== null) {
          const err23 = { instancePath: instancePath + "/required_description", schemaPath: "#/allOf/0/else/properties/required_description/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    }
    var _valid0 = _errs28 === errors;
    valid1 = _valid0;
    if (valid1) {
      if (props0 !== true) {
        props0 = props0 || {};
        props0.required_description = true;
      }
    }
    ifClause0 = "else";
  }
  if (!valid1) {
    const err24 = { instancePath, schemaPath: "#/allOf/0/if", keyword: "if", params: { failingKeyword: ifClause0 }, message: 'must match "' + ifClause0 + '" schema' };
    if (vErrors === null) {
      vErrors = [err24];
    } else {
      vErrors.push(err24);
    }
    errors++;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err25 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err25];
      } else {
        vErrors.push(err25);
      }
      errors++;
    }
    if (data.title === void 0) {
      const err26 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
      if (vErrors === null) {
        vErrors = [err26];
      } else {
        vErrors.push(err26);
      }
      errors++;
    }
    if (data.summary === void 0) {
      const err27 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
      if (vErrors === null) {
        vErrors = [err27];
      } else {
        vErrors.push(err27);
      }
      errors++;
    }
    if (data.classification === void 0) {
      const err28 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "classification" }, message: "must have required property 'classification'" };
      if (vErrors === null) {
        vErrors = [err28];
      } else {
        vErrors.push(err28);
      }
      errors++;
    }
    if (data.required_description === void 0) {
      const err29 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "required_description" }, message: "must have required property 'required_description'" };
      if (vErrors === null) {
        vErrors = [err29];
      } else {
        vErrors.push(err29);
      }
      errors++;
    }
    if (data.when === void 0) {
      const err30 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "when" }, message: "must have required property 'when'" };
      if (vErrors === null) {
        vErrors = [err30];
      } else {
        vErrors.push(err30);
      }
      errors++;
    }
    if (data.entity_ids === void 0) {
      const err31 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "entity_ids" }, message: "must have required property 'entity_ids'" };
      if (vErrors === null) {
        vErrors = [err31];
      } else {
        vErrors.push(err31);
      }
      errors++;
    }
    if (data.location_ids === void 0) {
      const err32 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "location_ids" }, message: "must have required property 'location_ids'" };
      if (vErrors === null) {
        vErrors = [err32];
      } else {
        vErrors.push(err32);
      }
      errors++;
    }
    if (data.arc_id === void 0) {
      const err33 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "arc_id" }, message: "must have required property 'arc_id'" };
      if (vErrors === null) {
        vErrors = [err33];
      } else {
        vErrors.push(err33);
      }
      errors++;
    }
    if (data.canonical_preconditions === void 0) {
      const err34 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "canonical_preconditions" }, message: "must have required property 'canonical_preconditions'" };
      if (vErrors === null) {
        vErrors = [err34];
      } else {
        vErrors.push(err34);
      }
      errors++;
    }
    if (data.outcomes === void 0) {
      const err35 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "outcomes" }, message: "must have required property 'outcomes'" };
      if (vErrors === null) {
        vErrors = [err35];
      } else {
        vErrors.push(err35);
      }
      errors++;
    }
    if (data.canonical_effects === void 0) {
      const err36 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "canonical_effects" }, message: "must have required property 'canonical_effects'" };
      if (vErrors === null) {
        vErrors = [err36];
      } else {
        vErrors.push(err36);
      }
      errors++;
    }
    if (data.visibility === void 0) {
      const err37 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "visibility" }, message: "must have required property 'visibility'" };
      if (vErrors === null) {
        vErrors = [err37];
      } else {
        vErrors.push(err37);
      }
      errors++;
    }
    if (data.participation === void 0) {
      const err38 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "participation" }, message: "must have required property 'participation'" };
      if (vErrors === null) {
        vErrors = [err38];
      } else {
        vErrors.push(err38);
      }
      errors++;
    }
    if (data.source_refs === void 0) {
      const err39 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source_refs" }, message: "must have required property 'source_refs'" };
      if (vErrors === null) {
        vErrors = [err39];
      } else {
        vErrors.push(err39);
      }
      errors++;
    }
    if (data.author_note === void 0) {
      const err40 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "author_note" }, message: "must have required property 'author_note'" };
      if (vErrors === null) {
        vErrors = [err40];
      } else {
        vErrors.push(err40);
      }
      errors++;
    }
    for (const key2 in data) {
      if (!func1.call(schema53.properties, key2)) {
        const err41 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data13 = data.id;
      if (typeof data13 === "string") {
        if (!pattern4.test(data13)) {
          const err42 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
      } else {
        const err43 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err43];
        } else {
          vErrors.push(err43);
        }
        errors++;
      }
    }
    if (data.title !== void 0) {
      let data14 = data.title;
      if (typeof data14 === "string") {
        if (func2(data14) < 1) {
          const err44 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err44];
          } else {
            vErrors.push(err44);
          }
          errors++;
        }
      } else {
        const err45 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err45];
        } else {
          vErrors.push(err45);
        }
        errors++;
      }
    }
    if (data.summary !== void 0) {
      let data15 = data.summary;
      if (typeof data15 === "string") {
        if (func2(data15) < 1) {
          const err46 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err46];
          } else {
            vErrors.push(err46);
          }
          errors++;
        }
      } else {
        const err47 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err47];
        } else {
          vErrors.push(err47);
        }
        errors++;
      }
    }
    if (data.classification !== void 0) {
      let data16 = data.classification;
      if (!(data16 === "HARD" || data16 === "SOFT" || data16 === "FREE")) {
        const err48 = { instancePath: instancePath + "/classification", schemaPath: "#/properties/classification/enum", keyword: "enum", params: { allowedValues: schema53.properties.classification.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.required_description !== void 0) {
      let data17 = data.required_description;
      const _errs41 = errors;
      let valid12 = false;
      let passing0 = null;
      const _errs42 = errors;
      if (typeof data17 === "string") {
        if (func2(data17) < 1) {
          const err49 = { instancePath: instancePath + "/required_description", schemaPath: "#/properties/required_description/oneOf/0/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      } else {
        const err50 = { instancePath: instancePath + "/required_description", schemaPath: "#/properties/required_description/oneOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      var _valid1 = _errs42 === errors;
      if (_valid1) {
        valid12 = true;
        passing0 = 0;
      }
      const _errs44 = errors;
      if (data17 !== null) {
        const err51 = { instancePath: instancePath + "/required_description", schemaPath: "#/properties/required_description/oneOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      var _valid1 = _errs44 === errors;
      if (_valid1 && valid12) {
        valid12 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid1) {
          valid12 = true;
          passing0 = 1;
        }
      }
      if (!valid12) {
        const err52 = { instancePath: instancePath + "/required_description", schemaPath: "#/properties/required_description/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err52];
        } else {
          vErrors.push(err52);
        }
        errors++;
      } else {
        errors = _errs41;
        if (vErrors !== null) {
          if (_errs41) {
            vErrors.length = _errs41;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.when !== void 0) {
      if (!validate38(data.when, { instancePath: instancePath + "/when", parentData: data, parentDataProperty: "when", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
        errors = vErrors.length;
      }
    }
    if (data.entity_ids !== void 0) {
      let data19 = data.entity_ids;
      if (Array.isArray(data19)) {
        const len0 = data19.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data20 = data19[i0];
          if (typeof data20 === "string") {
            if (!pattern4.test(data20)) {
              const err53 = { instancePath: instancePath + "/entity_ids/" + i0, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err53];
              } else {
                vErrors.push(err53);
              }
              errors++;
            }
          } else {
            const err54 = { instancePath: instancePath + "/entity_ids/" + i0, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
        }
        let i1 = data19.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data19[i1], data19[j0])) {
                const err55 = { instancePath: instancePath + "/entity_ids", schemaPath: "#/properties/entity_ids/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err56 = { instancePath: instancePath + "/entity_ids", schemaPath: "#/properties/entity_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
    }
    if (data.location_ids !== void 0) {
      let data21 = data.location_ids;
      if (Array.isArray(data21)) {
        const len1 = data21.length;
        for (let i2 = 0; i2 < len1; i2++) {
          let data22 = data21[i2];
          if (typeof data22 === "string") {
            if (!pattern4.test(data22)) {
              const err57 = { instancePath: instancePath + "/location_ids/" + i2, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          } else {
            const err58 = { instancePath: instancePath + "/location_ids/" + i2, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
        let i3 = data21.length;
        let j1;
        if (i3 > 1) {
          outer1: for (; i3--; ) {
            for (j1 = i3; j1--; ) {
              if (func0(data21[i3], data21[j1])) {
                const err59 = { instancePath: instancePath + "/location_ids", schemaPath: "#/properties/location_ids/uniqueItems", keyword: "uniqueItems", params: { i: i3, j: j1 }, message: "must NOT have duplicate items (items ## " + j1 + " and " + i3 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
                break outer1;
              }
            }
          }
        }
      } else {
        const err60 = { instancePath: instancePath + "/location_ids", schemaPath: "#/properties/location_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
    }
    if (data.arc_id !== void 0) {
      let data23 = data.arc_id;
      const _errs58 = errors;
      let valid21 = false;
      let passing1 = null;
      const _errs59 = errors;
      if (typeof data23 === "string") {
        if (!pattern4.test(data23)) {
          const err61 = { instancePath: instancePath + "/arc_id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err61];
          } else {
            vErrors.push(err61);
          }
          errors++;
        }
      } else {
        const err62 = { instancePath: instancePath + "/arc_id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
      var _valid2 = _errs59 === errors;
      if (_valid2) {
        valid21 = true;
        passing1 = 0;
      }
      const _errs62 = errors;
      if (data23 !== null) {
        const err63 = { instancePath: instancePath + "/arc_id", schemaPath: "#/properties/arc_id/oneOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      var _valid2 = _errs62 === errors;
      if (_valid2 && valid21) {
        valid21 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid2) {
          valid21 = true;
          passing1 = 1;
        }
      }
      if (!valid21) {
        const err64 = { instancePath: instancePath + "/arc_id", schemaPath: "#/properties/arc_id/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      } else {
        errors = _errs58;
        if (vErrors !== null) {
          if (_errs58) {
            vErrors.length = _errs58;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.canonical_preconditions !== void 0) {
      if (!validate40(data.canonical_preconditions, { instancePath: instancePath + "/canonical_preconditions", parentData: data, parentDataProperty: "canonical_preconditions", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
        errors = vErrors.length;
      }
    }
    if (data.outcomes !== void 0) {
      let data25 = data.outcomes;
      if (Array.isArray(data25)) {
        const len2 = data25.length;
        for (let i4 = 0; i4 < len2; i4++) {
          if (!validate31(data25[i4], { instancePath: instancePath + "/outcomes/" + i4, parentData: data25, parentDataProperty: i4, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err65 = { instancePath: instancePath + "/outcomes", schemaPath: "#/properties/outcomes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
    }
    if (data.canonical_effects !== void 0) {
      let data27 = data.canonical_effects;
      if (Array.isArray(data27)) {
        const len3 = data27.length;
        for (let i5 = 0; i5 < len3; i5++) {
          if (!validate44(data27[i5], { instancePath: instancePath + "/canonical_effects/" + i5, parentData: data27, parentDataProperty: i5, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err66 = { instancePath: instancePath + "/canonical_effects", schemaPath: "#/properties/canonical_effects/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err66];
        } else {
          vErrors.push(err66);
        }
        errors++;
      }
    }
    if (data.visibility !== void 0) {
      if (!validate47(data.visibility, { instancePath: instancePath + "/visibility", parentData: data, parentDataProperty: "visibility", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
        errors = vErrors.length;
      }
    }
    if (data.participation !== void 0) {
      let data30 = data.participation;
      if (data30 && typeof data30 == "object" && !Array.isArray(data30)) {
        if (data30.offer === void 0) {
          const err67 = { instancePath: instancePath + "/participation", schemaPath: "#/$defs/participation/required", keyword: "required", params: { missingProperty: "offer" }, message: "must have required property 'offer'" };
          if (vErrors === null) {
            vErrors = [err67];
          } else {
            vErrors.push(err67);
          }
          errors++;
        }
        if (data30.hook === void 0) {
          const err68 = { instancePath: instancePath + "/participation", schemaPath: "#/$defs/participation/required", keyword: "required", params: { missingProperty: "hook" }, message: "must have required property 'hook'" };
          if (vErrors === null) {
            vErrors = [err68];
          } else {
            vErrors.push(err68);
          }
          errors++;
        }
        for (const key3 in data30) {
          if (!(key3 === "offer" || key3 === "hook")) {
            const err69 = { instancePath: instancePath + "/participation", schemaPath: "#/$defs/participation/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err69];
            } else {
              vErrors.push(err69);
            }
            errors++;
          }
        }
        if (data30.offer !== void 0) {
          let data31 = data30.offer;
          if (!(data31 === "when_relevant" || data31 === "never")) {
            const err70 = { instancePath: instancePath + "/participation/offer", schemaPath: "#/$defs/participation/properties/offer/enum", keyword: "enum", params: { allowedValues: schema70.properties.offer.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err70];
            } else {
              vErrors.push(err70);
            }
            errors++;
          }
        }
        if (data30.hook !== void 0) {
          if (typeof data30.hook !== "string") {
            const err71 = { instancePath: instancePath + "/participation/hook", schemaPath: "#/$defs/participation/properties/hook/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err71];
            } else {
              vErrors.push(err71);
            }
            errors++;
          }
        }
      } else {
        const err72 = { instancePath: instancePath + "/participation", schemaPath: "#/$defs/participation/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err72];
        } else {
          vErrors.push(err72);
        }
        errors++;
      }
    }
    if (data.source_refs !== void 0) {
      let data33 = data.source_refs;
      if (Array.isArray(data33)) {
        const len4 = data33.length;
        for (let i6 = 0; i6 < len4; i6++) {
          let data34 = data33[i6];
          if (typeof data34 === "string") {
            if (!pattern4.test(data34)) {
              const err73 = { instancePath: instancePath + "/source_refs/" + i6, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err73];
              } else {
                vErrors.push(err73);
              }
              errors++;
            }
          } else {
            const err74 = { instancePath: instancePath + "/source_refs/" + i6, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err74];
            } else {
              vErrors.push(err74);
            }
            errors++;
          }
        }
        let i7 = data33.length;
        let j2;
        if (i7 > 1) {
          outer2: for (; i7--; ) {
            for (j2 = i7; j2--; ) {
              if (func0(data33[i7], data33[j2])) {
                const err75 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/uniqueItems", keyword: "uniqueItems", params: { i: i7, j: j2 }, message: "must NOT have duplicate items (items ## " + j2 + " and " + i7 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err75];
                } else {
                  vErrors.push(err75);
                }
                errors++;
                break outer2;
              }
            }
          }
        }
      } else {
        const err76 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err76];
        } else {
          vErrors.push(err76);
        }
        errors++;
      }
    }
    if (data.author_note !== void 0) {
      if (typeof data.author_note !== "string") {
        const err77 = { instancePath: instancePath + "/author_note", schemaPath: "#/properties/author_note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err77];
        } else {
          vErrors.push(err77);
        }
        errors++;
      }
    }
  } else {
    const err78 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err78];
    } else {
      vErrors.push(err78);
    }
    errors++;
  }
  validate37.errors = vErrors;
  return errors === 0;
}
validate37.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema72 = { "type": "object", "properties": { "id": { "$ref": "#/$defs/id" }, "from": { "$ref": "#/$defs/id" }, "to": { "$ref": "#/$defs/id" }, "relation": { "enum": ["enables", "motivates", "precedes", "related"] }, "basis": { "enum": ["documented", "inferred", "editorial"] }, "source_refs": { "type": "array", "items": { "$ref": "#/$defs/id" }, "uniqueItems": true }, "note": { "type": "string", "minLength": 1 } }, "required": ["id", "from", "to", "relation", "basis", "source_refs", "note"], "additionalProperties": false };
function validate50(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate50.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.from === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "from" }, message: "must have required property 'from'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.to === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "to" }, message: "must have required property 'to'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.relation === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "relation" }, message: "must have required property 'relation'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.basis === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "basis" }, message: "must have required property 'basis'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.source_refs === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source_refs" }, message: "must have required property 'source_refs'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.note === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "note" }, message: "must have required property 'note'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "from" || key0 === "to" || key0 === "relation" || key0 === "basis" || key0 === "source_refs" || key0 === "note")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err8 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.from !== void 0) {
      let data1 = data.from;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err10 = { instancePath: instancePath + "/from", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = { instancePath: instancePath + "/from", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.to !== void 0) {
      let data2 = data.to;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err12 = { instancePath: instancePath + "/to", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/to", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.relation !== void 0) {
      let data3 = data.relation;
      if (!(data3 === "enables" || data3 === "motivates" || data3 === "precedes" || data3 === "related")) {
        const err14 = { instancePath: instancePath + "/relation", schemaPath: "#/properties/relation/enum", keyword: "enum", params: { allowedValues: schema72.properties.relation.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.basis !== void 0) {
      let data4 = data.basis;
      if (!(data4 === "documented" || data4 === "inferred" || data4 === "editorial")) {
        const err15 = { instancePath: instancePath + "/basis", schemaPath: "#/properties/basis/enum", keyword: "enum", params: { allowedValues: schema72.properties.basis.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.source_refs !== void 0) {
      let data5 = data.source_refs;
      if (Array.isArray(data5)) {
        const len0 = data5.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data6 = data5[i0];
          if (typeof data6 === "string") {
            if (!pattern4.test(data6)) {
              const err16 = { instancePath: instancePath + "/source_refs/" + i0, schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          } else {
            const err17 = { instancePath: instancePath + "/source_refs/" + i0, schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        let i1 = data5.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--; ) {
            for (j0 = i1; j0--; ) {
              if (func0(data5[i1], data5[j0])) {
                const err18 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err19 = { instancePath: instancePath + "/source_refs", schemaPath: "#/properties/source_refs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.note !== void 0) {
      let data7 = data.note;
      if (typeof data7 === "string") {
        if (func2(data7) < 1) {
          const err20 = { instancePath: instancePath + "/note", schemaPath: "#/properties/note/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      } else {
        const err21 = { instancePath: instancePath + "/note", schemaPath: "#/properties/note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
  } else {
    const err22 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate50.errors = vErrors;
  return errors === 0;
}
validate50.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.schema_version === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schema_version" }, message: "must have required property 'schema_version'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pack_id === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "pack_id" }, message: "must have required property 'pack_id'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.pack_version === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "pack_version" }, message: "must have required property 'pack_version'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.title === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.language === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "language" }, message: "must have required property 'language'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.description === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.calendar === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "calendar" }, message: "must have required property 'calendar'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.coverage === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "coverage" }, message: "must have required property 'coverage'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.sources === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sources" }, message: "must have required property 'sources'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.predicates === void 0) {
      const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "predicates" }, message: "must have required property 'predicates'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.entities === void 0) {
      const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "entities" }, message: "must have required property 'entities'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.initial_state === void 0) {
      const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "initial_state" }, message: "must have required property 'initial_state'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.arcs === void 0) {
      const err12 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "arcs" }, message: "must have required property 'arcs'" };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    if (data.events === void 0) {
      const err13 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "events" }, message: "must have required property 'events'" };
      if (vErrors === null) {
        vErrors = [err13];
      } else {
        vErrors.push(err13);
      }
      errors++;
    }
    if (data.edges === void 0) {
      const err14 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "edges" }, message: "must have required property 'edges'" };
      if (vErrors === null) {
        vErrors = [err14];
      } else {
        vErrors.push(err14);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema31.properties, key0)) {
        const err15 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.$schema !== void 0) {
      if (typeof data.$schema !== "string") {
        const err16 = { instancePath: instancePath + "/$schema", schemaPath: "#/properties/%24schema/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.schema_version !== void 0) {
      if ("1.0.0" !== data.schema_version) {
        const err17 = { instancePath: instancePath + "/schema_version", schemaPath: "#/properties/schema_version/const", keyword: "const", params: { allowedValue: "1.0.0" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.pack_id !== void 0) {
      let data2 = data.pack_id;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err18 = { instancePath: instancePath + "/pack_id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9_.-]*$" }, message: 'must match pattern "^[a-z][a-z0-9_.-]*$"' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = { instancePath: instancePath + "/pack_id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.pack_version !== void 0) {
      let data3 = data.pack_version;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err20 = { instancePath: instancePath + "/pack_version", schemaPath: "#/properties/pack_version/pattern", keyword: "pattern", params: { pattern: "^\\d+\\.\\d+\\.\\d+$" }, message: 'must match pattern "^\\d+\\.\\d+\\.\\d+$"' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      } else {
        const err21 = { instancePath: instancePath + "/pack_version", schemaPath: "#/properties/pack_version/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.title !== void 0) {
      let data4 = data.title;
      if (typeof data4 === "string") {
        if (func2(data4) < 1) {
          const err22 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.language !== void 0) {
      let data5 = data.language;
      if (typeof data5 === "string") {
        if (func2(data5) < 1) {
          const err24 = { instancePath: instancePath + "/language", schemaPath: "#/properties/language/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      } else {
        const err25 = { instancePath: instancePath + "/language", schemaPath: "#/properties/language/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.description !== void 0) {
      let data6 = data.description;
      if (typeof data6 === "string") {
        if (func2(data6) < 1) {
          const err26 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.calendar !== void 0) {
      let data7 = data.calendar;
      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
        if (data7.system === void 0) {
          const err28 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/required", keyword: "required", params: { missingProperty: "system" }, message: "must have required property 'system'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        if (data7.origin_label === void 0) {
          const err29 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/required", keyword: "required", params: { missingProperty: "origin_label" }, message: "must have required property 'origin_label'" };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
        if (data7.day_length_minutes === void 0) {
          const err30 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/required", keyword: "required", params: { missingProperty: "day_length_minutes" }, message: "must have required property 'day_length_minutes'" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        if (data7.time_zone_label === void 0) {
          const err31 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/required", keyword: "required", params: { missingProperty: "time_zone_label" }, message: "must have required property 'time_zone_label'" };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
        if (data7.notes === void 0) {
          const err32 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/required", keyword: "required", params: { missingProperty: "notes" }, message: "must have required property 'notes'" };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
        for (const key1 in data7) {
          if (!(key1 === "system" || key1 === "origin_label" || key1 === "day_length_minutes" || key1 === "time_zone_label" || key1 === "notes")) {
            const err33 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data7.system !== void 0) {
          if ("relative_day" !== data7.system) {
            const err34 = { instancePath: instancePath + "/calendar/system", schemaPath: "#/properties/calendar/properties/system/const", keyword: "const", params: { allowedValue: "relative_day" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data7.origin_label !== void 0) {
          let data9 = data7.origin_label;
          if (typeof data9 === "string") {
            if (func2(data9) < 1) {
              const err35 = { instancePath: instancePath + "/calendar/origin_label", schemaPath: "#/properties/calendar/properties/origin_label/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          } else {
            const err36 = { instancePath: instancePath + "/calendar/origin_label", schemaPath: "#/properties/calendar/properties/origin_label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data7.day_length_minutes !== void 0) {
          if (1440 !== data7.day_length_minutes) {
            const err37 = { instancePath: instancePath + "/calendar/day_length_minutes", schemaPath: "#/properties/calendar/properties/day_length_minutes/const", keyword: "const", params: { allowedValue: 1440 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
        }
        if (data7.time_zone_label !== void 0) {
          let data11 = data7.time_zone_label;
          if (typeof data11 === "string") {
            if (func2(data11) < 1) {
              const err38 = { instancePath: instancePath + "/calendar/time_zone_label", schemaPath: "#/properties/calendar/properties/time_zone_label/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          } else {
            const err39 = { instancePath: instancePath + "/calendar/time_zone_label", schemaPath: "#/properties/calendar/properties/time_zone_label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        if (data7.notes !== void 0) {
          if (typeof data7.notes !== "string") {
            const err40 = { instancePath: instancePath + "/calendar/notes", schemaPath: "#/properties/calendar/properties/notes/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
        }
      } else {
        const err41 = { instancePath: instancePath + "/calendar", schemaPath: "#/properties/calendar/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
    }
    if (data.coverage !== void 0) {
      let data13 = data.coverage;
      if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
        if (data13.start === void 0) {
          const err42 = { instancePath: instancePath + "/coverage", schemaPath: "#/properties/coverage/required", keyword: "required", params: { missingProperty: "start" }, message: "must have required property 'start'" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        if (data13.end === void 0) {
          const err43 = { instancePath: instancePath + "/coverage", schemaPath: "#/properties/coverage/required", keyword: "required", params: { missingProperty: "end" }, message: "must have required property 'end'" };
          if (vErrors === null) {
            vErrors = [err43];
          } else {
            vErrors.push(err43);
          }
          errors++;
        }
        if (data13.notes === void 0) {
          const err44 = { instancePath: instancePath + "/coverage", schemaPath: "#/properties/coverage/required", keyword: "required", params: { missingProperty: "notes" }, message: "must have required property 'notes'" };
          if (vErrors === null) {
            vErrors = [err44];
          } else {
            vErrors.push(err44);
          }
          errors++;
        }
        for (const key2 in data13) {
          if (!(key2 === "start" || key2 === "end" || key2 === "notes")) {
            const err45 = { instancePath: instancePath + "/coverage", schemaPath: "#/properties/coverage/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
        }
        if (data13.start !== void 0) {
          let data14 = data13.start;
          if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
            if (data14.day === void 0) {
              const err46 = { instancePath: instancePath + "/coverage/start", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            if (data14.minute === void 0) {
              const err47 = { instancePath: instancePath + "/coverage/start", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
            for (const key3 in data14) {
              if (!(key3 === "day" || key3 === "minute")) {
                const err48 = { instancePath: instancePath + "/coverage/start", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
            if (data14.day !== void 0) {
              let data15 = data14.day;
              if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)))) {
                const err49 = { instancePath: instancePath + "/coverage/start/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data14.minute !== void 0) {
              let data16 = data14.minute;
              if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)))) {
                const err50 = { instancePath: instancePath + "/coverage/start/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (typeof data16 == "number") {
                if (data16 > 1439 || isNaN(data16)) {
                  const err51 = { instancePath: instancePath + "/coverage/start/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                  if (vErrors === null) {
                    vErrors = [err51];
                  } else {
                    vErrors.push(err51);
                  }
                  errors++;
                }
                if (data16 < 0 || isNaN(data16)) {
                  const err52 = { instancePath: instancePath + "/coverage/start/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err52];
                  } else {
                    vErrors.push(err52);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err53 = { instancePath: instancePath + "/coverage/start", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
        if (data13.end !== void 0) {
          let data17 = data13.end;
          if (data17 && typeof data17 == "object" && !Array.isArray(data17)) {
            if (data17.day === void 0) {
              const err54 = { instancePath: instancePath + "/coverage/end", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
              if (vErrors === null) {
                vErrors = [err54];
              } else {
                vErrors.push(err54);
              }
              errors++;
            }
            if (data17.minute === void 0) {
              const err55 = { instancePath: instancePath + "/coverage/end", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
              if (vErrors === null) {
                vErrors = [err55];
              } else {
                vErrors.push(err55);
              }
              errors++;
            }
            for (const key4 in data17) {
              if (!(key4 === "day" || key4 === "minute")) {
                const err56 = { instancePath: instancePath + "/coverage/end", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            }
            if (data17.day !== void 0) {
              let data18 = data17.day;
              if (!(typeof data18 == "number" && (!(data18 % 1) && !isNaN(data18)))) {
                const err57 = { instancePath: instancePath + "/coverage/end/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
            }
            if (data17.minute !== void 0) {
              let data19 = data17.minute;
              if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)))) {
                const err58 = { instancePath: instancePath + "/coverage/end/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
              if (typeof data19 == "number") {
                if (data19 > 1439 || isNaN(data19)) {
                  const err59 = { instancePath: instancePath + "/coverage/end/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
                if (data19 < 0 || isNaN(data19)) {
                  const err60 = { instancePath: instancePath + "/coverage/end/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err61 = { instancePath: instancePath + "/coverage/end", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err61];
            } else {
              vErrors.push(err61);
            }
            errors++;
          }
        }
        if (data13.notes !== void 0) {
          if (typeof data13.notes !== "string") {
            const err62 = { instancePath: instancePath + "/coverage/notes", schemaPath: "#/properties/coverage/properties/notes/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err62];
            } else {
              vErrors.push(err62);
            }
            errors++;
          }
        }
      } else {
        const err63 = { instancePath: instancePath + "/coverage", schemaPath: "#/properties/coverage/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
    }
    if (data.sources !== void 0) {
      let data21 = data.sources;
      if (Array.isArray(data21)) {
        if (data21.length < 1) {
          const err64 = { instancePath: instancePath + "/sources", schemaPath: "#/properties/sources/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err64];
          } else {
            vErrors.push(err64);
          }
          errors++;
        }
        const len0 = data21.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate21(data21[i0], { instancePath: instancePath + "/sources/" + i0, parentData: data21, parentDataProperty: i0, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err65 = { instancePath: instancePath + "/sources", schemaPath: "#/properties/sources/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
    }
    if (data.predicates !== void 0) {
      let data23 = data.predicates;
      if (Array.isArray(data23)) {
        if (data23.length < 1) {
          const err66 = { instancePath: instancePath + "/predicates", schemaPath: "#/properties/predicates/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err66];
          } else {
            vErrors.push(err66);
          }
          errors++;
        }
        const len1 = data23.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate23(data23[i1], { instancePath: instancePath + "/predicates/" + i1, parentData: data23, parentDataProperty: i1, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err67 = { instancePath: instancePath + "/predicates", schemaPath: "#/properties/predicates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err67];
        } else {
          vErrors.push(err67);
        }
        errors++;
      }
    }
    if (data.entities !== void 0) {
      let data25 = data.entities;
      if (Array.isArray(data25)) {
        if (data25.length < 1) {
          const err68 = { instancePath: instancePath + "/entities", schemaPath: "#/properties/entities/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err68];
          } else {
            vErrors.push(err68);
          }
          errors++;
        }
        const len2 = data25.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (!validate28(data25[i2], { instancePath: instancePath + "/entities/" + i2, parentData: data25, parentDataProperty: i2, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err69 = { instancePath: instancePath + "/entities", schemaPath: "#/properties/entities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err69];
        } else {
          vErrors.push(err69);
        }
        errors++;
      }
    }
    if (data.initial_state !== void 0) {
      let data27 = data.initial_state;
      if (data27 && typeof data27 == "object" && !Array.isArray(data27)) {
        if (data27.at === void 0) {
          const err70 = { instancePath: instancePath + "/initial_state", schemaPath: "#/properties/initial_state/required", keyword: "required", params: { missingProperty: "at" }, message: "must have required property 'at'" };
          if (vErrors === null) {
            vErrors = [err70];
          } else {
            vErrors.push(err70);
          }
          errors++;
        }
        if (data27.facts === void 0) {
          const err71 = { instancePath: instancePath + "/initial_state", schemaPath: "#/properties/initial_state/required", keyword: "required", params: { missingProperty: "facts" }, message: "must have required property 'facts'" };
          if (vErrors === null) {
            vErrors = [err71];
          } else {
            vErrors.push(err71);
          }
          errors++;
        }
        for (const key5 in data27) {
          if (!(key5 === "at" || key5 === "facts")) {
            const err72 = { instancePath: instancePath + "/initial_state", schemaPath: "#/properties/initial_state/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err72];
            } else {
              vErrors.push(err72);
            }
            errors++;
          }
        }
        if (data27.at !== void 0) {
          let data28 = data27.at;
          if (data28 && typeof data28 == "object" && !Array.isArray(data28)) {
            if (data28.day === void 0) {
              const err73 = { instancePath: instancePath + "/initial_state/at", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
              if (vErrors === null) {
                vErrors = [err73];
              } else {
                vErrors.push(err73);
              }
              errors++;
            }
            if (data28.minute === void 0) {
              const err74 = { instancePath: instancePath + "/initial_state/at", schemaPath: "#/$defs/time/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
              if (vErrors === null) {
                vErrors = [err74];
              } else {
                vErrors.push(err74);
              }
              errors++;
            }
            for (const key6 in data28) {
              if (!(key6 === "day" || key6 === "minute")) {
                const err75 = { instancePath: instancePath + "/initial_state/at", schemaPath: "#/$defs/time/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err75];
                } else {
                  vErrors.push(err75);
                }
                errors++;
              }
            }
            if (data28.day !== void 0) {
              let data29 = data28.day;
              if (!(typeof data29 == "number" && (!(data29 % 1) && !isNaN(data29)))) {
                const err76 = { instancePath: instancePath + "/initial_state/at/day", schemaPath: "#/$defs/time/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err76];
                } else {
                  vErrors.push(err76);
                }
                errors++;
              }
            }
            if (data28.minute !== void 0) {
              let data30 = data28.minute;
              if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)))) {
                const err77 = { instancePath: instancePath + "/initial_state/at/minute", schemaPath: "#/$defs/time/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err77];
                } else {
                  vErrors.push(err77);
                }
                errors++;
              }
              if (typeof data30 == "number") {
                if (data30 > 1439 || isNaN(data30)) {
                  const err78 = { instancePath: instancePath + "/initial_state/at/minute", schemaPath: "#/$defs/time/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                  if (vErrors === null) {
                    vErrors = [err78];
                  } else {
                    vErrors.push(err78);
                  }
                  errors++;
                }
                if (data30 < 0 || isNaN(data30)) {
                  const err79 = { instancePath: instancePath + "/initial_state/at/minute", schemaPath: "#/$defs/time/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err79];
                  } else {
                    vErrors.push(err79);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err80 = { instancePath: instancePath + "/initial_state/at", schemaPath: "#/$defs/time/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err80];
            } else {
              vErrors.push(err80);
            }
            errors++;
          }
        }
        if (data27.facts !== void 0) {
          let data31 = data27.facts;
          if (Array.isArray(data31)) {
            const len3 = data31.length;
            for (let i3 = 0; i3 < len3; i3++) {
              if (!validate30(data31[i3], { instancePath: instancePath + "/initial_state/facts/" + i3, parentData: data31, parentDataProperty: i3, rootData, dynamicAnchors })) {
                vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err81 = { instancePath: instancePath + "/initial_state/facts", schemaPath: "#/properties/initial_state/properties/facts/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err81];
            } else {
              vErrors.push(err81);
            }
            errors++;
          }
        }
      } else {
        const err82 = { instancePath: instancePath + "/initial_state", schemaPath: "#/properties/initial_state/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err82];
        } else {
          vErrors.push(err82);
        }
        errors++;
      }
    }
    if (data.arcs !== void 0) {
      let data33 = data.arcs;
      if (Array.isArray(data33)) {
        const len4 = data33.length;
        for (let i4 = 0; i4 < len4; i4++) {
          if (!validate35(data33[i4], { instancePath: instancePath + "/arcs/" + i4, parentData: data33, parentDataProperty: i4, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err83 = { instancePath: instancePath + "/arcs", schemaPath: "#/properties/arcs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err83];
        } else {
          vErrors.push(err83);
        }
        errors++;
      }
    }
    if (data.events !== void 0) {
      let data35 = data.events;
      if (Array.isArray(data35)) {
        if (data35.length < 1) {
          const err84 = { instancePath: instancePath + "/events", schemaPath: "#/properties/events/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err84];
          } else {
            vErrors.push(err84);
          }
          errors++;
        }
        const len5 = data35.length;
        for (let i5 = 0; i5 < len5; i5++) {
          if (!validate37(data35[i5], { instancePath: instancePath + "/events/" + i5, parentData: data35, parentDataProperty: i5, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err85 = { instancePath: instancePath + "/events", schemaPath: "#/properties/events/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err85];
        } else {
          vErrors.push(err85);
        }
        errors++;
      }
    }
    if (data.edges !== void 0) {
      let data37 = data.edges;
      if (Array.isArray(data37)) {
        const len6 = data37.length;
        for (let i6 = 0; i6 < len6; i6++) {
          if (!validate50(data37[i6], { instancePath: instancePath + "/edges/" + i6, parentData: data37, parentDataProperty: i6, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err86 = { instancePath: instancePath + "/edges", schemaPath: "#/properties/edges/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err86];
        } else {
          vErrors.push(err86);
        }
        errors++;
      }
    }
  } else {
    const err87 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err87];
    } else {
      vErrors.push(err87);
    }
    errors++;
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema77 = { "type": "object", "properties": { "adjudications": { "type": "array", "items": { "type": "object", "properties": { "event_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "decision": { "enum": ["occurred", "diverged", "omitted", "postponed"] }, "time": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "lo": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "hi": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "precision": { "enum": ["minute", "day", "range", "approx"] } }, "required": ["lo", "hi", "precision"], "additionalProperties": false }] }, "account": { "type": "string" }, "actors": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "causes": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "effects": { "type": "array", "items": { "type": "object", "properties": { "op": { "enum": ["set", "unset"] }, "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] }, "quote": { "type": "string" }, "occurrence_ref": { "type": ["string", "null"] } }, "required": ["op", "entity_id", "predicate"], "additionalProperties": false }, "maxItems": 200 }, "plan_step_ids": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "reason": { "type": "string" }, "extraordinary": { "type": "boolean" } }, "required": ["event_id", "decision", "account", "effects", "reason"], "additionalProperties": false }, "maxItems": 200 } }, "required": ["adjudications"], "additionalProperties": false, "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:task:adjudicate", "title": "Canon Engine task output: adjudicate" };
function validate52(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate52.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.adjudications === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "adjudications" }, message: "must have required property 'adjudications'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "adjudications")) {
        const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.adjudications !== void 0) {
      let data0 = data.adjudications;
      if (Array.isArray(data0)) {
        if (data0.length > 200) {
          const err2 = { instancePath: instancePath + "/adjudications", schemaPath: "#/properties/adjudications/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.event_id === void 0) {
              const err3 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/required", keyword: "required", params: { missingProperty: "event_id" }, message: "must have required property 'event_id'" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            if (data1.decision === void 0) {
              const err4 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/required", keyword: "required", params: { missingProperty: "decision" }, message: "must have required property 'decision'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1.account === void 0) {
              const err5 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/required", keyword: "required", params: { missingProperty: "account" }, message: "must have required property 'account'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.effects === void 0) {
              const err6 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/required", keyword: "required", params: { missingProperty: "effects" }, message: "must have required property 'effects'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data1.reason === void 0) {
              const err7 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!func1.call(schema77.properties.adjudications.items.properties, key1)) {
                const err8 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
            if (data1.event_id !== void 0) {
              let data2 = data1.event_id;
              if (typeof data2 === "string") {
                if (func2(data2) > 200) {
                  const err9 = { instancePath: instancePath + "/adjudications/" + i0 + "/event_id", schemaPath: "#/properties/adjudications/items/properties/event_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (func2(data2) < 1) {
                  const err10 = { instancePath: instancePath + "/adjudications/" + i0 + "/event_id", schemaPath: "#/properties/adjudications/items/properties/event_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
              } else {
                const err11 = { instancePath: instancePath + "/adjudications/" + i0 + "/event_id", schemaPath: "#/properties/adjudications/items/properties/event_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.decision !== void 0) {
              let data3 = data1.decision;
              if (!(data3 === "occurred" || data3 === "diverged" || data3 === "omitted" || data3 === "postponed")) {
                const err12 = { instancePath: instancePath + "/adjudications/" + i0 + "/decision", schemaPath: "#/properties/adjudications/items/properties/decision/enum", keyword: "enum", params: { allowedValues: schema77.properties.adjudications.items.properties.decision.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data1.time !== void 0) {
              let data4 = data1.time;
              const _errs11 = errors;
              let valid4 = false;
              let passing0 = null;
              const _errs12 = errors;
              if (data4 !== null) {
                const err13 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              var _valid0 = _errs12 === errors;
              if (_valid0) {
                valid4 = true;
                passing0 = 0;
              }
              const _errs14 = errors;
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.lo === void 0) {
                  const err14 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "lo" }, message: "must have required property 'lo'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data4.hi === void 0) {
                  const err15 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "hi" }, message: "must have required property 'hi'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (data4.precision === void 0) {
                  const err16 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "precision" }, message: "must have required property 'precision'" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                for (const key2 in data4) {
                  if (!(key2 === "lo" || key2 === "hi" || key2 === "precision")) {
                    const err17 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data4.lo !== void 0) {
                  let data5 = data4.lo;
                  if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                    if (data5.day === void 0) {
                      const err18 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                      if (vErrors === null) {
                        vErrors = [err18];
                      } else {
                        vErrors.push(err18);
                      }
                      errors++;
                    }
                    if (data5.minute === void 0) {
                      const err19 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                      if (vErrors === null) {
                        vErrors = [err19];
                      } else {
                        vErrors.push(err19);
                      }
                      errors++;
                    }
                    for (const key3 in data5) {
                      if (!(key3 === "day" || key3 === "minute")) {
                        const err20 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err20];
                        } else {
                          vErrors.push(err20);
                        }
                        errors++;
                      }
                    }
                    if (data5.day !== void 0) {
                      let data6 = data5.day;
                      if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)))) {
                        const err21 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo/day", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err21];
                        } else {
                          vErrors.push(err21);
                        }
                        errors++;
                      }
                    }
                    if (data5.minute !== void 0) {
                      let data7 = data5.minute;
                      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)))) {
                        const err22 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo/minute", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err22];
                        } else {
                          vErrors.push(err22);
                        }
                        errors++;
                      }
                      if (typeof data7 == "number") {
                        if (data7 > 1439 || isNaN(data7)) {
                          const err23 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo/minute", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                          if (vErrors === null) {
                            vErrors = [err23];
                          } else {
                            vErrors.push(err23);
                          }
                          errors++;
                        }
                        if (data7 < 0 || isNaN(data7)) {
                          const err24 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo/minute", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err24];
                          } else {
                            vErrors.push(err24);
                          }
                          errors++;
                        }
                      }
                    }
                  } else {
                    const err25 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/lo", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/lo/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                }
                if (data4.hi !== void 0) {
                  let data8 = data4.hi;
                  if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                    if (data8.day === void 0) {
                      const err26 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                      if (vErrors === null) {
                        vErrors = [err26];
                      } else {
                        vErrors.push(err26);
                      }
                      errors++;
                    }
                    if (data8.minute === void 0) {
                      const err27 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                      if (vErrors === null) {
                        vErrors = [err27];
                      } else {
                        vErrors.push(err27);
                      }
                      errors++;
                    }
                    for (const key4 in data8) {
                      if (!(key4 === "day" || key4 === "minute")) {
                        const err28 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err28];
                        } else {
                          vErrors.push(err28);
                        }
                        errors++;
                      }
                    }
                    if (data8.day !== void 0) {
                      let data9 = data8.day;
                      if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)))) {
                        const err29 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi/day", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err29];
                        } else {
                          vErrors.push(err29);
                        }
                        errors++;
                      }
                    }
                    if (data8.minute !== void 0) {
                      let data10 = data8.minute;
                      if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)))) {
                        const err30 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi/minute", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err30];
                        } else {
                          vErrors.push(err30);
                        }
                        errors++;
                      }
                      if (typeof data10 == "number") {
                        if (data10 > 1439 || isNaN(data10)) {
                          const err31 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi/minute", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                          if (vErrors === null) {
                            vErrors = [err31];
                          } else {
                            vErrors.push(err31);
                          }
                          errors++;
                        }
                        if (data10 < 0 || isNaN(data10)) {
                          const err32 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi/minute", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err32];
                          } else {
                            vErrors.push(err32);
                          }
                          errors++;
                        }
                      }
                    }
                  } else {
                    const err33 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/hi", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/hi/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err33];
                    } else {
                      vErrors.push(err33);
                    }
                    errors++;
                  }
                }
                if (data4.precision !== void 0) {
                  let data11 = data4.precision;
                  if (!(data11 === "minute" || data11 === "day" || data11 === "range" || data11 === "approx")) {
                    const err34 = { instancePath: instancePath + "/adjudications/" + i0 + "/time/precision", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/properties/precision/enum", keyword: "enum", params: { allowedValues: schema77.properties.adjudications.items.properties.time.oneOf[1].properties.precision.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
              } else {
                const err35 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
              var _valid0 = _errs14 === errors;
              if (_valid0 && valid4) {
                valid4 = false;
                passing0 = [passing0, 1];
              } else {
                if (_valid0) {
                  valid4 = true;
                  passing0 = 1;
                }
              }
              if (!valid4) {
                const err36 = { instancePath: instancePath + "/adjudications/" + i0 + "/time", schemaPath: "#/properties/adjudications/items/properties/time/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              } else {
                errors = _errs11;
                if (vErrors !== null) {
                  if (_errs11) {
                    vErrors.length = _errs11;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data1.account !== void 0) {
              if (typeof data1.account !== "string") {
                const err37 = { instancePath: instancePath + "/adjudications/" + i0 + "/account", schemaPath: "#/properties/adjudications/items/properties/account/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
            if (data1.actors !== void 0) {
              let data13 = data1.actors;
              if (Array.isArray(data13)) {
                if (data13.length > 200) {
                  const err38 = { instancePath: instancePath + "/adjudications/" + i0 + "/actors", schemaPath: "#/properties/adjudications/items/properties/actors/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
                const len1 = data13.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data13[i1] !== "string") {
                    const err39 = { instancePath: instancePath + "/adjudications/" + i0 + "/actors/" + i1, schemaPath: "#/properties/adjudications/items/properties/actors/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                }
              } else {
                const err40 = { instancePath: instancePath + "/adjudications/" + i0 + "/actors", schemaPath: "#/properties/adjudications/items/properties/actors/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data1.causes !== void 0) {
              let data15 = data1.causes;
              if (Array.isArray(data15)) {
                if (data15.length > 200) {
                  const err41 = { instancePath: instancePath + "/adjudications/" + i0 + "/causes", schemaPath: "#/properties/adjudications/items/properties/causes/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                const len2 = data15.length;
                for (let i2 = 0; i2 < len2; i2++) {
                  if (typeof data15[i2] !== "string") {
                    const err42 = { instancePath: instancePath + "/adjudications/" + i0 + "/causes/" + i2, schemaPath: "#/properties/adjudications/items/properties/causes/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err42];
                    } else {
                      vErrors.push(err42);
                    }
                    errors++;
                  }
                }
              } else {
                const err43 = { instancePath: instancePath + "/adjudications/" + i0 + "/causes", schemaPath: "#/properties/adjudications/items/properties/causes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data1.effects !== void 0) {
              let data17 = data1.effects;
              if (Array.isArray(data17)) {
                if (data17.length > 200) {
                  const err44 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects", schemaPath: "#/properties/adjudications/items/properties/effects/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
                const len3 = data17.length;
                for (let i3 = 0; i3 < len3; i3++) {
                  let data18 = data17[i3];
                  if (data18 && typeof data18 == "object" && !Array.isArray(data18)) {
                    if (data18.op === void 0) {
                      const err45 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3, schemaPath: "#/properties/adjudications/items/properties/effects/items/required", keyword: "required", params: { missingProperty: "op" }, message: "must have required property 'op'" };
                      if (vErrors === null) {
                        vErrors = [err45];
                      } else {
                        vErrors.push(err45);
                      }
                      errors++;
                    }
                    if (data18.entity_id === void 0) {
                      const err46 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3, schemaPath: "#/properties/adjudications/items/properties/effects/items/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
                      if (vErrors === null) {
                        vErrors = [err46];
                      } else {
                        vErrors.push(err46);
                      }
                      errors++;
                    }
                    if (data18.predicate === void 0) {
                      const err47 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3, schemaPath: "#/properties/adjudications/items/properties/effects/items/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
                      if (vErrors === null) {
                        vErrors = [err47];
                      } else {
                        vErrors.push(err47);
                      }
                      errors++;
                    }
                    for (const key5 in data18) {
                      if (!(key5 === "op" || key5 === "entity_id" || key5 === "predicate" || key5 === "value" || key5 === "quote" || key5 === "occurrence_ref")) {
                        const err48 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3, schemaPath: "#/properties/adjudications/items/properties/effects/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err48];
                        } else {
                          vErrors.push(err48);
                        }
                        errors++;
                      }
                    }
                    if (data18.op !== void 0) {
                      let data19 = data18.op;
                      if (!(data19 === "set" || data19 === "unset")) {
                        const err49 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/op", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/op/enum", keyword: "enum", params: { allowedValues: schema77.properties.adjudications.items.properties.effects.items.properties.op.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err49];
                        } else {
                          vErrors.push(err49);
                        }
                        errors++;
                      }
                    }
                    if (data18.entity_id !== void 0) {
                      let data20 = data18.entity_id;
                      if (typeof data20 === "string") {
                        if (func2(data20) > 200) {
                          const err50 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/entity_id", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                          if (vErrors === null) {
                            vErrors = [err50];
                          } else {
                            vErrors.push(err50);
                          }
                          errors++;
                        }
                        if (func2(data20) < 1) {
                          const err51 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/entity_id", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err51];
                          } else {
                            vErrors.push(err51);
                          }
                          errors++;
                        }
                      } else {
                        const err52 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/entity_id", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err52];
                        } else {
                          vErrors.push(err52);
                        }
                        errors++;
                      }
                    }
                    if (data18.predicate !== void 0) {
                      let data21 = data18.predicate;
                      if (typeof data21 === "string") {
                        if (func2(data21) > 200) {
                          const err53 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/predicate", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                          if (vErrors === null) {
                            vErrors = [err53];
                          } else {
                            vErrors.push(err53);
                          }
                          errors++;
                        }
                        if (func2(data21) < 1) {
                          const err54 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/predicate", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err54];
                          } else {
                            vErrors.push(err54);
                          }
                          errors++;
                        }
                      } else {
                        const err55 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/predicate", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err55];
                        } else {
                          vErrors.push(err55);
                        }
                        errors++;
                      }
                    }
                    if (data18.value !== void 0) {
                      let data22 = data18.value;
                      const _errs53 = errors;
                      let valid15 = false;
                      let passing1 = null;
                      const _errs54 = errors;
                      if (typeof data22 !== "boolean") {
                        const err56 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/value", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                        if (vErrors === null) {
                          vErrors = [err56];
                        } else {
                          vErrors.push(err56);
                        }
                        errors++;
                      }
                      var _valid1 = _errs54 === errors;
                      if (_valid1) {
                        valid15 = true;
                        passing1 = 0;
                      }
                      const _errs56 = errors;
                      if (!(typeof data22 == "number")) {
                        const err57 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/value", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err57];
                        } else {
                          vErrors.push(err57);
                        }
                        errors++;
                      }
                      var _valid1 = _errs56 === errors;
                      if (_valid1 && valid15) {
                        valid15 = false;
                        passing1 = [passing1, 1];
                      } else {
                        if (_valid1) {
                          valid15 = true;
                          passing1 = 1;
                        }
                        const _errs58 = errors;
                        if (typeof data22 !== "string") {
                          const err58 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/value", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err58];
                          } else {
                            vErrors.push(err58);
                          }
                          errors++;
                        }
                        var _valid1 = _errs58 === errors;
                        if (_valid1 && valid15) {
                          valid15 = false;
                          passing1 = [passing1, 2];
                        } else {
                          if (_valid1) {
                            valid15 = true;
                            passing1 = 2;
                          }
                          const _errs60 = errors;
                          if (Array.isArray(data22)) {
                            const len4 = data22.length;
                            for (let i4 = 0; i4 < len4; i4++) {
                              if (typeof data22[i4] !== "string") {
                                const err59 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/value/" + i4, schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err59];
                                } else {
                                  vErrors.push(err59);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err60 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/value", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                            if (vErrors === null) {
                              vErrors = [err60];
                            } else {
                              vErrors.push(err60);
                            }
                            errors++;
                          }
                          var _valid1 = _errs60 === errors;
                          if (_valid1 && valid15) {
                            valid15 = false;
                            passing1 = [passing1, 3];
                          } else {
                            if (_valid1) {
                              valid15 = true;
                              passing1 = 3;
                            }
                          }
                        }
                      }
                      if (!valid15) {
                        const err61 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/value", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
                        if (vErrors === null) {
                          vErrors = [err61];
                        } else {
                          vErrors.push(err61);
                        }
                        errors++;
                      } else {
                        errors = _errs53;
                        if (vErrors !== null) {
                          if (_errs53) {
                            vErrors.length = _errs53;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                    }
                    if (data18.quote !== void 0) {
                      if (typeof data18.quote !== "string") {
                        const err62 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/quote", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err62];
                        } else {
                          vErrors.push(err62);
                        }
                        errors++;
                      }
                    }
                    if (data18.occurrence_ref !== void 0) {
                      let data25 = data18.occurrence_ref;
                      if (typeof data25 !== "string" && data25 !== null) {
                        const err63 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3 + "/occurrence_ref", schemaPath: "#/properties/adjudications/items/properties/effects/items/properties/occurrence_ref/type", keyword: "type", params: { type: schema77.properties.adjudications.items.properties.effects.items.properties.occurrence_ref.type }, message: "must be string,null" };
                        if (vErrors === null) {
                          vErrors = [err63];
                        } else {
                          vErrors.push(err63);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err64 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects/" + i3, schemaPath: "#/properties/adjudications/items/properties/effects/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err64];
                    } else {
                      vErrors.push(err64);
                    }
                    errors++;
                  }
                }
              } else {
                const err65 = { instancePath: instancePath + "/adjudications/" + i0 + "/effects", schemaPath: "#/properties/adjudications/items/properties/effects/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err65];
                } else {
                  vErrors.push(err65);
                }
                errors++;
              }
            }
            if (data1.plan_step_ids !== void 0) {
              let data26 = data1.plan_step_ids;
              if (Array.isArray(data26)) {
                if (data26.length > 200) {
                  const err66 = { instancePath: instancePath + "/adjudications/" + i0 + "/plan_step_ids", schemaPath: "#/properties/adjudications/items/properties/plan_step_ids/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                const len5 = data26.length;
                for (let i5 = 0; i5 < len5; i5++) {
                  if (typeof data26[i5] !== "string") {
                    const err67 = { instancePath: instancePath + "/adjudications/" + i0 + "/plan_step_ids/" + i5, schemaPath: "#/properties/adjudications/items/properties/plan_step_ids/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err67];
                    } else {
                      vErrors.push(err67);
                    }
                    errors++;
                  }
                }
              } else {
                const err68 = { instancePath: instancePath + "/adjudications/" + i0 + "/plan_step_ids", schemaPath: "#/properties/adjudications/items/properties/plan_step_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err68];
                } else {
                  vErrors.push(err68);
                }
                errors++;
              }
            }
            if (data1.reason !== void 0) {
              if (typeof data1.reason !== "string") {
                const err69 = { instancePath: instancePath + "/adjudications/" + i0 + "/reason", schemaPath: "#/properties/adjudications/items/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err69];
                } else {
                  vErrors.push(err69);
                }
                errors++;
              }
            }
            if (data1.extraordinary !== void 0) {
              if (typeof data1.extraordinary !== "boolean") {
                const err70 = { instancePath: instancePath + "/adjudications/" + i0 + "/extraordinary", schemaPath: "#/properties/adjudications/items/properties/extraordinary/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err70];
                } else {
                  vErrors.push(err70);
                }
                errors++;
              }
            }
          } else {
            const err71 = { instancePath: instancePath + "/adjudications/" + i0, schemaPath: "#/properties/adjudications/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err71];
            } else {
              vErrors.push(err71);
            }
            errors++;
          }
        }
      } else {
        const err72 = { instancePath: instancePath + "/adjudications", schemaPath: "#/properties/adjudications/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err72];
        } else {
          vErrors.push(err72);
        }
        errors++;
      }
    }
  } else {
    const err73 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err73];
    } else {
      vErrors.push(err73);
    }
    errors++;
  }
  validate52.errors = vErrors;
  return errors === 0;
}
validate52.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate53(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate53.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.groups === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "groups" }, message: "must have required property 'groups'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "groups")) {
        const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.groups !== void 0) {
      let data0 = data.groups;
      if (Array.isArray(data0)) {
        if (data0.length > 400) {
          const err2 = { instancePath: instancePath + "/groups", schemaPath: "#/properties/groups/maxItems", keyword: "maxItems", params: { limit: 400 }, message: "must NOT have more than 400 items" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.member_ids === void 0) {
              const err3 = { instancePath: instancePath + "/groups/" + i0, schemaPath: "#/properties/groups/items/required", keyword: "required", params: { missingProperty: "member_ids" }, message: "must have required property 'member_ids'" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            if (data1.title === void 0) {
              const err4 = { instancePath: instancePath + "/groups/" + i0, schemaPath: "#/properties/groups/items/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1.summary === void 0) {
              const err5 = { instancePath: instancePath + "/groups/" + i0, schemaPath: "#/properties/groups/items/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "member_ids" || key1 === "title" || key1 === "summary")) {
                const err6 = { instancePath: instancePath + "/groups/" + i0, schemaPath: "#/properties/groups/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
            if (data1.member_ids !== void 0) {
              let data2 = data1.member_ids;
              if (Array.isArray(data2)) {
                if (data2.length > 200) {
                  const err7 = { instancePath: instancePath + "/groups/" + i0 + "/member_ids", schemaPath: "#/properties/groups/items/properties/member_ids/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.length < 1) {
                  const err8 = { instancePath: instancePath + "/groups/" + i0 + "/member_ids", schemaPath: "#/properties/groups/items/properties/member_ids/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                const len1 = data2.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  let data3 = data2[i1];
                  if (typeof data3 === "string") {
                    if (func2(data3) > 200) {
                      const err9 = { instancePath: instancePath + "/groups/" + i0 + "/member_ids/" + i1, schemaPath: "#/properties/groups/items/properties/member_ids/items/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                      if (vErrors === null) {
                        vErrors = [err9];
                      } else {
                        vErrors.push(err9);
                      }
                      errors++;
                    }
                    if (func2(data3) < 1) {
                      const err10 = { instancePath: instancePath + "/groups/" + i0 + "/member_ids/" + i1, schemaPath: "#/properties/groups/items/properties/member_ids/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/groups/" + i0 + "/member_ids/" + i1, schemaPath: "#/properties/groups/items/properties/member_ids/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
              } else {
                const err12 = { instancePath: instancePath + "/groups/" + i0 + "/member_ids", schemaPath: "#/properties/groups/items/properties/member_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data1.title !== void 0) {
              let data4 = data1.title;
              if (typeof data4 === "string") {
                if (func2(data4) > 200) {
                  const err13 = { instancePath: instancePath + "/groups/" + i0 + "/title", schemaPath: "#/properties/groups/items/properties/title/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (func2(data4) < 1) {
                  const err14 = { instancePath: instancePath + "/groups/" + i0 + "/title", schemaPath: "#/properties/groups/items/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              } else {
                const err15 = { instancePath: instancePath + "/groups/" + i0 + "/title", schemaPath: "#/properties/groups/items/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data1.summary !== void 0) {
              let data5 = data1.summary;
              if (typeof data5 === "string") {
                if (func2(data5) > 2e3) {
                  const err16 = { instancePath: instancePath + "/groups/" + i0 + "/summary", schemaPath: "#/properties/groups/items/properties/summary/maxLength", keyword: "maxLength", params: { limit: 2e3 }, message: "must NOT have more than 2000 characters" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              } else {
                const err17 = { instancePath: instancePath + "/groups/" + i0 + "/summary", schemaPath: "#/properties/groups/items/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/groups/" + i0, schemaPath: "#/properties/groups/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath: instancePath + "/groups", schemaPath: "#/properties/groups/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
  } else {
    const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
  }
  validate53.errors = vErrors;
  return errors === 0;
}
validate53.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema79 = { "type": "object", "properties": { "references": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string", "minLength": 1, "maxLength": 200 }, "quote": { "type": "string" }, "phrase": { "type": "string" }, "ref_kind": { "enum": ["person", "place", "object", "organization", "event", "other"] }, "mode": { "enum": ["direct", "indirect", "alias", "pronoun"] }, "assertion": { "enum": ["narrator", "new_event", "belief", "rumor", "lie", "hypothetical", "flashback", "dialogue", "user_input", "plan"] }, "temporal": { "enum": ["present", "past", "flashback", "future"] }, "candidate_ids": { "type": "array", "items": { "type": "string" }, "maxItems": 200 } }, "required": ["id", "quote", "phrase", "ref_kind", "assertion", "temporal"], "additionalProperties": false }, "maxItems": 200 }, "claims": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string", "minLength": 1, "maxLength": 200 }, "quote": { "type": "string" }, "kind": { "enum": ["state", "capability", "recollection", "causal", "location", "presence", "operation", "time"] }, "entity_phrases": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "assertion": { "enum": ["narrator", "new_event", "belief", "rumor", "lie", "hypothetical", "flashback", "dialogue", "user_input", "plan"] }, "expected": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] } }, "required": ["entity_id", "predicate", "value"], "additionalProperties": false }] } }, "required": ["id", "quote", "kind", "assertion"], "additionalProperties": false }, "maxItems": 200 } }, "required": ["references", "claims"], "additionalProperties": false, "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:task:discover", "title": "Canon Engine task output: discover" };
function validate54(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate54.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.references === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "references" }, message: "must have required property 'references'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.claims === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "claims" }, message: "must have required property 'claims'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "references" || key0 === "claims")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.references !== void 0) {
      let data0 = data.references;
      if (Array.isArray(data0)) {
        if (data0.length > 200) {
          const err3 = { instancePath: instancePath + "/references", schemaPath: "#/properties/references/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.id === void 0) {
              const err4 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1.quote === void 0) {
              const err5 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.phrase === void 0) {
              const err6 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "phrase" }, message: "must have required property 'phrase'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data1.ref_kind === void 0) {
              const err7 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "ref_kind" }, message: "must have required property 'ref_kind'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data1.assertion === void 0) {
              const err8 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "assertion" }, message: "must have required property 'assertion'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1.temporal === void 0) {
              const err9 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "temporal" }, message: "must have required property 'temporal'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "id" || key1 === "quote" || key1 === "phrase" || key1 === "ref_kind" || key1 === "mode" || key1 === "assertion" || key1 === "temporal" || key1 === "candidate_ids")) {
                const err10 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
            if (data1.id !== void 0) {
              let data2 = data1.id;
              if (typeof data2 === "string") {
                if (func2(data2) > 200) {
                  const err11 = { instancePath: instancePath + "/references/" + i0 + "/id", schemaPath: "#/properties/references/items/properties/id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                if (func2(data2) < 1) {
                  const err12 = { instancePath: instancePath + "/references/" + i0 + "/id", schemaPath: "#/properties/references/items/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              } else {
                const err13 = { instancePath: instancePath + "/references/" + i0 + "/id", schemaPath: "#/properties/references/items/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data1.quote !== void 0) {
              if (typeof data1.quote !== "string") {
                const err14 = { instancePath: instancePath + "/references/" + i0 + "/quote", schemaPath: "#/properties/references/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data1.phrase !== void 0) {
              if (typeof data1.phrase !== "string") {
                const err15 = { instancePath: instancePath + "/references/" + i0 + "/phrase", schemaPath: "#/properties/references/items/properties/phrase/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data1.ref_kind !== void 0) {
              let data5 = data1.ref_kind;
              if (!(data5 === "person" || data5 === "place" || data5 === "object" || data5 === "organization" || data5 === "event" || data5 === "other")) {
                const err16 = { instancePath: instancePath + "/references/" + i0 + "/ref_kind", schemaPath: "#/properties/references/items/properties/ref_kind/enum", keyword: "enum", params: { allowedValues: schema79.properties.references.items.properties.ref_kind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data1.mode !== void 0) {
              let data6 = data1.mode;
              if (!(data6 === "direct" || data6 === "indirect" || data6 === "alias" || data6 === "pronoun")) {
                const err17 = { instancePath: instancePath + "/references/" + i0 + "/mode", schemaPath: "#/properties/references/items/properties/mode/enum", keyword: "enum", params: { allowedValues: schema79.properties.references.items.properties.mode.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data1.assertion !== void 0) {
              let data7 = data1.assertion;
              if (!(data7 === "narrator" || data7 === "new_event" || data7 === "belief" || data7 === "rumor" || data7 === "lie" || data7 === "hypothetical" || data7 === "flashback" || data7 === "dialogue" || data7 === "user_input" || data7 === "plan")) {
                const err18 = { instancePath: instancePath + "/references/" + i0 + "/assertion", schemaPath: "#/properties/references/items/properties/assertion/enum", keyword: "enum", params: { allowedValues: schema79.properties.references.items.properties.assertion.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data1.temporal !== void 0) {
              let data8 = data1.temporal;
              if (!(data8 === "present" || data8 === "past" || data8 === "flashback" || data8 === "future")) {
                const err19 = { instancePath: instancePath + "/references/" + i0 + "/temporal", schemaPath: "#/properties/references/items/properties/temporal/enum", keyword: "enum", params: { allowedValues: schema79.properties.references.items.properties.temporal.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data1.candidate_ids !== void 0) {
              let data9 = data1.candidate_ids;
              if (Array.isArray(data9)) {
                if (data9.length > 200) {
                  const err20 = { instancePath: instancePath + "/references/" + i0 + "/candidate_ids", schemaPath: "#/properties/references/items/properties/candidate_ids/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                const len1 = data9.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data9[i1] !== "string") {
                    const err21 = { instancePath: instancePath + "/references/" + i0 + "/candidate_ids/" + i1, schemaPath: "#/properties/references/items/properties/candidate_ids/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
              } else {
                const err22 = { instancePath: instancePath + "/references/" + i0 + "/candidate_ids", schemaPath: "#/properties/references/items/properties/candidate_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/references/" + i0, schemaPath: "#/properties/references/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath: instancePath + "/references", schemaPath: "#/properties/references/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.claims !== void 0) {
      let data11 = data.claims;
      if (Array.isArray(data11)) {
        if (data11.length > 200) {
          const err25 = { instancePath: instancePath + "/claims", schemaPath: "#/properties/claims/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        const len2 = data11.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data12 = data11[i2];
          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
            if (data12.id === void 0) {
              const err26 = { instancePath: instancePath + "/claims/" + i2, schemaPath: "#/properties/claims/items/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data12.quote === void 0) {
              const err27 = { instancePath: instancePath + "/claims/" + i2, schemaPath: "#/properties/claims/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data12.kind === void 0) {
              const err28 = { instancePath: instancePath + "/claims/" + i2, schemaPath: "#/properties/claims/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            if (data12.assertion === void 0) {
              const err29 = { instancePath: instancePath + "/claims/" + i2, schemaPath: "#/properties/claims/items/required", keyword: "required", params: { missingProperty: "assertion" }, message: "must have required property 'assertion'" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
            for (const key2 in data12) {
              if (!(key2 === "id" || key2 === "quote" || key2 === "kind" || key2 === "entity_phrases" || key2 === "assertion" || key2 === "expected")) {
                const err30 = { instancePath: instancePath + "/claims/" + i2, schemaPath: "#/properties/claims/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data12.id !== void 0) {
              let data13 = data12.id;
              if (typeof data13 === "string") {
                if (func2(data13) > 200) {
                  const err31 = { instancePath: instancePath + "/claims/" + i2 + "/id", schemaPath: "#/properties/claims/items/properties/id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
                if (func2(data13) < 1) {
                  const err32 = { instancePath: instancePath + "/claims/" + i2 + "/id", schemaPath: "#/properties/claims/items/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
              } else {
                const err33 = { instancePath: instancePath + "/claims/" + i2 + "/id", schemaPath: "#/properties/claims/items/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
            if (data12.quote !== void 0) {
              if (typeof data12.quote !== "string") {
                const err34 = { instancePath: instancePath + "/claims/" + i2 + "/quote", schemaPath: "#/properties/claims/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
            }
            if (data12.kind !== void 0) {
              let data15 = data12.kind;
              if (!(data15 === "state" || data15 === "capability" || data15 === "recollection" || data15 === "causal" || data15 === "location" || data15 === "presence" || data15 === "operation" || data15 === "time")) {
                const err35 = { instancePath: instancePath + "/claims/" + i2 + "/kind", schemaPath: "#/properties/claims/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema79.properties.claims.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
            if (data12.entity_phrases !== void 0) {
              let data16 = data12.entity_phrases;
              if (Array.isArray(data16)) {
                if (data16.length > 200) {
                  const err36 = { instancePath: instancePath + "/claims/" + i2 + "/entity_phrases", schemaPath: "#/properties/claims/items/properties/entity_phrases/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                const len3 = data16.length;
                for (let i3 = 0; i3 < len3; i3++) {
                  if (typeof data16[i3] !== "string") {
                    const err37 = { instancePath: instancePath + "/claims/" + i2 + "/entity_phrases/" + i3, schemaPath: "#/properties/claims/items/properties/entity_phrases/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
              } else {
                const err38 = { instancePath: instancePath + "/claims/" + i2 + "/entity_phrases", schemaPath: "#/properties/claims/items/properties/entity_phrases/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data12.assertion !== void 0) {
              let data18 = data12.assertion;
              if (!(data18 === "narrator" || data18 === "new_event" || data18 === "belief" || data18 === "rumor" || data18 === "lie" || data18 === "hypothetical" || data18 === "flashback" || data18 === "dialogue" || data18 === "user_input" || data18 === "plan")) {
                const err39 = { instancePath: instancePath + "/claims/" + i2 + "/assertion", schemaPath: "#/properties/claims/items/properties/assertion/enum", keyword: "enum", params: { allowedValues: schema79.properties.claims.items.properties.assertion.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data12.expected !== void 0) {
              let data19 = data12.expected;
              const _errs37 = errors;
              let valid11 = false;
              let passing0 = null;
              const _errs38 = errors;
              if (data19 !== null) {
                const err40 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
              var _valid0 = _errs38 === errors;
              if (_valid0) {
                valid11 = true;
                passing0 = 0;
              }
              const _errs40 = errors;
              if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
                if (data19.entity_id === void 0) {
                  const err41 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                if (data19.predicate === void 0) {
                  const err42 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                if (data19.value === void 0) {
                  const err43 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
                for (const key3 in data19) {
                  if (!(key3 === "entity_id" || key3 === "predicate" || key3 === "value")) {
                    const err44 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                }
                if (data19.entity_id !== void 0) {
                  let data20 = data19.entity_id;
                  if (typeof data20 === "string") {
                    if (func2(data20) > 200) {
                      const err45 = { instancePath: instancePath + "/claims/" + i2 + "/expected/entity_id", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                      if (vErrors === null) {
                        vErrors = [err45];
                      } else {
                        vErrors.push(err45);
                      }
                      errors++;
                    }
                    if (func2(data20) < 1) {
                      const err46 = { instancePath: instancePath + "/claims/" + i2 + "/expected/entity_id", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err46];
                      } else {
                        vErrors.push(err46);
                      }
                      errors++;
                    }
                  } else {
                    const err47 = { instancePath: instancePath + "/claims/" + i2 + "/expected/entity_id", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                  }
                }
                if (data19.predicate !== void 0) {
                  let data21 = data19.predicate;
                  if (typeof data21 === "string") {
                    if (func2(data21) > 200) {
                      const err48 = { instancePath: instancePath + "/claims/" + i2 + "/expected/predicate", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                      if (vErrors === null) {
                        vErrors = [err48];
                      } else {
                        vErrors.push(err48);
                      }
                      errors++;
                    }
                    if (func2(data21) < 1) {
                      const err49 = { instancePath: instancePath + "/claims/" + i2 + "/expected/predicate", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                  } else {
                    const err50 = { instancePath: instancePath + "/claims/" + i2 + "/expected/predicate", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err50];
                    } else {
                      vErrors.push(err50);
                    }
                    errors++;
                  }
                }
                if (data19.value !== void 0) {
                  let data22 = data19.value;
                  const _errs48 = errors;
                  let valid13 = false;
                  let passing1 = null;
                  const _errs49 = errors;
                  if (typeof data22 !== "boolean") {
                    const err51 = { instancePath: instancePath + "/claims/" + i2 + "/expected/value", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err51];
                    } else {
                      vErrors.push(err51);
                    }
                    errors++;
                  }
                  var _valid1 = _errs49 === errors;
                  if (_valid1) {
                    valid13 = true;
                    passing1 = 0;
                  }
                  const _errs51 = errors;
                  if (!(typeof data22 == "number")) {
                    const err52 = { instancePath: instancePath + "/claims/" + i2 + "/expected/value", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err52];
                    } else {
                      vErrors.push(err52);
                    }
                    errors++;
                  }
                  var _valid1 = _errs51 === errors;
                  if (_valid1 && valid13) {
                    valid13 = false;
                    passing1 = [passing1, 1];
                  } else {
                    if (_valid1) {
                      valid13 = true;
                      passing1 = 1;
                    }
                    const _errs53 = errors;
                    if (typeof data22 !== "string") {
                      const err53 = { instancePath: instancePath + "/claims/" + i2 + "/expected/value", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err53];
                      } else {
                        vErrors.push(err53);
                      }
                      errors++;
                    }
                    var _valid1 = _errs53 === errors;
                    if (_valid1 && valid13) {
                      valid13 = false;
                      passing1 = [passing1, 2];
                    } else {
                      if (_valid1) {
                        valid13 = true;
                        passing1 = 2;
                      }
                      const _errs55 = errors;
                      if (Array.isArray(data22)) {
                        const len4 = data22.length;
                        for (let i4 = 0; i4 < len4; i4++) {
                          if (typeof data22[i4] !== "string") {
                            const err54 = { instancePath: instancePath + "/claims/" + i2 + "/expected/value/" + i4, schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err54];
                            } else {
                              vErrors.push(err54);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err55 = { instancePath: instancePath + "/claims/" + i2 + "/expected/value", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err55];
                        } else {
                          vErrors.push(err55);
                        }
                        errors++;
                      }
                      var _valid1 = _errs55 === errors;
                      if (_valid1 && valid13) {
                        valid13 = false;
                        passing1 = [passing1, 3];
                      } else {
                        if (_valid1) {
                          valid13 = true;
                          passing1 = 3;
                        }
                      }
                    }
                  }
                  if (!valid13) {
                    const err56 = { instancePath: instancePath + "/claims/" + i2 + "/expected/value", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
                    if (vErrors === null) {
                      vErrors = [err56];
                    } else {
                      vErrors.push(err56);
                    }
                    errors++;
                  } else {
                    errors = _errs48;
                    if (vErrors !== null) {
                      if (_errs48) {
                        vErrors.length = _errs48;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                }
              } else {
                const err57 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
              var _valid0 = _errs40 === errors;
              if (_valid0 && valid11) {
                valid11 = false;
                passing0 = [passing0, 1];
              } else {
                if (_valid0) {
                  valid11 = true;
                  passing0 = 1;
                }
              }
              if (!valid11) {
                const err58 = { instancePath: instancePath + "/claims/" + i2 + "/expected", schemaPath: "#/properties/claims/items/properties/expected/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              } else {
                errors = _errs37;
                if (vErrors !== null) {
                  if (_errs37) {
                    vErrors.length = _errs37;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err59 = { instancePath: instancePath + "/claims/" + i2, schemaPath: "#/properties/claims/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
      } else {
        const err60 = { instancePath: instancePath + "/claims", schemaPath: "#/properties/claims/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
    }
  } else {
    const err61 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err61];
    } else {
      vErrors.push(err61);
    }
    errors++;
  }
  validate54.errors = vErrors;
  return errors === 0;
}
validate54.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema80 = { "type": "object", "properties": { "decision": { "enum": ["retain", "repair", "conflict"] }, "scene_end": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "lo": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "hi": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "precision": { "enum": ["minute", "day", "range", "approx"] } }, "required": ["lo", "hi", "precision"], "additionalProperties": false }] }, "flashback": { "type": "boolean" }, "claim_checks": { "type": "array", "items": { "type": "object", "properties": { "claim_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "verdict": { "enum": ["consistent", "contradiction", "unsupported", "belief_ok", "new_detail", "not_applicable"] }, "record_ids": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "note": { "type": "string" } }, "required": ["claim_id", "verdict"], "additionalProperties": false }, "maxItems": 400 }, "transitions": { "type": "array", "items": { "type": "object", "properties": { "op": { "enum": ["set", "unset"] }, "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] }, "quote": { "type": "string" }, "occurrence_ref": { "type": ["string", "null"] } }, "required": ["op", "entity_id", "predicate"], "additionalProperties": false }, "maxItems": 200 }, "occurrences": { "type": "array", "items": { "type": "object", "properties": { "ref": { "type": "string", "minLength": 1, "maxLength": 200 }, "title": { "type": "string" }, "account": { "type": "string" }, "actors": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "affected": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "locations": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "time": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "lo": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "hi": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "precision": { "enum": ["minute", "day", "range", "approx"] } }, "required": ["lo", "hi", "precision"], "additionalProperties": false }] }, "causes": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "quote": { "type": "string" }, "pack_event_id": { "type": ["string", "null"] }, "disposition": { "enum": ["occurred", "diverged", "ongoing", null] }, "ref_phrases": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "continues": { "type": ["string", "null"], "maxLength": 200 }, "visibility": { "enum": ["public", "restricted", "secret"] }, "knowers": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "origin": { "enum": ["player", "gm", "intervention"] } }, "required": ["ref", "title", "account", "actors", "quote"], "additionalProperties": false }, "maxItems": 200 }, "state_claims": { "type": "array", "items": { "type": "object", "properties": { "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] }, "quote": { "type": "string" }, "at": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }] } }, "required": ["entity_id", "predicate", "value", "quote"], "additionalProperties": false }, "maxItems": 200 }, "player_actions": { "type": "array", "items": { "type": "object", "properties": { "quote": { "type": "string" }, "authorized_by_quote": { "type": ["string", "null"] } }, "required": ["quote", "authorized_by_quote"], "additionalProperties": false }, "maxItems": 200 }, "step_enactments": { "type": "array", "items": { "type": "object", "properties": { "step_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "occurrence_ref": { "type": "string", "minLength": 1, "maxLength": 200 }, "quote": { "type": "string" } }, "required": ["step_id", "occurrence_ref", "quote"], "additionalProperties": false }, "maxItems": 200 }, "new_entities": { "type": "array", "items": { "type": "object", "properties": { "ref": { "type": "string", "minLength": 1, "maxLength": 200 }, "name": { "type": "string" }, "kind": { "enum": ["person", "organization", "place", "object", "world", "other"] }, "description": { "type": "string" }, "quote": { "type": "string" } }, "required": ["ref", "name", "kind", "description", "quote"], "additionalProperties": false }, "maxItems": 200 }, "violations": { "type": "array", "items": { "type": "object", "properties": { "code": { "type": "string" }, "quote": { "type": "string" }, "detail": { "type": "string" }, "blocking": { "type": "boolean" } }, "required": ["code", "detail"], "additionalProperties": false }, "maxItems": 200 }, "hard_checks": { "type": "array", "items": { "type": "object", "properties": { "event_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "status": { "enum": ["fulfilled", "not_due", "missing", "contradicted"] }, "occurrence_ref": { "type": ["string", "null"] }, "quote": { "type": ["string", "null"] } }, "required": ["event_id", "status"], "additionalProperties": false }, "maxItems": 200 }, "scene_entities": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "summary": { "type": "string" } }, "required": ["decision", "scene_end", "claim_checks", "transitions", "occurrences", "state_claims", "player_actions", "violations", "hard_checks"], "additionalProperties": false, "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:task:evaluate", "title": "Canon Engine task output: evaluate" };
function validate55(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate55.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.decision === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "decision" }, message: "must have required property 'decision'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.scene_end === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scene_end" }, message: "must have required property 'scene_end'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.claim_checks === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "claim_checks" }, message: "must have required property 'claim_checks'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.transitions === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "transitions" }, message: "must have required property 'transitions'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.occurrences === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "occurrences" }, message: "must have required property 'occurrences'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.state_claims === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "state_claims" }, message: "must have required property 'state_claims'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.player_actions === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "player_actions" }, message: "must have required property 'player_actions'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.violations === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "violations" }, message: "must have required property 'violations'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.hard_checks === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "hard_checks" }, message: "must have required property 'hard_checks'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema80.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.decision !== void 0) {
      let data0 = data.decision;
      if (!(data0 === "retain" || data0 === "repair" || data0 === "conflict")) {
        const err10 = { instancePath: instancePath + "/decision", schemaPath: "#/properties/decision/enum", keyword: "enum", params: { allowedValues: schema80.properties.decision.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.scene_end !== void 0) {
      let data1 = data.scene_end;
      const _errs4 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs5 = errors;
      if (data1 !== null) {
        const err11 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs7 = errors;
      if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
        if (data1.lo === void 0) {
          const err12 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf/1/required", keyword: "required", params: { missingProperty: "lo" }, message: "must have required property 'lo'" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        if (data1.hi === void 0) {
          const err13 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf/1/required", keyword: "required", params: { missingProperty: "hi" }, message: "must have required property 'hi'" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data1.precision === void 0) {
          const err14 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf/1/required", keyword: "required", params: { missingProperty: "precision" }, message: "must have required property 'precision'" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        for (const key1 in data1) {
          if (!(key1 === "lo" || key1 === "hi" || key1 === "precision")) {
            const err15 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data1.lo !== void 0) {
          let data2 = data1.lo;
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.day === void 0) {
              const err16 = { instancePath: instancePath + "/scene_end/lo", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data2.minute === void 0) {
              const err17 = { instancePath: instancePath + "/scene_end/lo", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            for (const key2 in data2) {
              if (!(key2 === "day" || key2 === "minute")) {
                const err18 = { instancePath: instancePath + "/scene_end/lo", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data2.day !== void 0) {
              let data3 = data2.day;
              if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)))) {
                const err19 = { instancePath: instancePath + "/scene_end/lo/day", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data2.minute !== void 0) {
              let data4 = data2.minute;
              if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)))) {
                const err20 = { instancePath: instancePath + "/scene_end/lo/minute", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              if (typeof data4 == "number") {
                if (data4 > 1439 || isNaN(data4)) {
                  const err21 = { instancePath: instancePath + "/scene_end/lo/minute", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (data4 < 0 || isNaN(data4)) {
                  const err22 = { instancePath: instancePath + "/scene_end/lo/minute", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/scene_end/lo", schemaPath: "#/properties/scene_end/oneOf/1/properties/lo/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data1.hi !== void 0) {
          let data5 = data1.hi;
          if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
            if (data5.day === void 0) {
              const err24 = { instancePath: instancePath + "/scene_end/hi", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data5.minute === void 0) {
              const err25 = { instancePath: instancePath + "/scene_end/hi", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            for (const key3 in data5) {
              if (!(key3 === "day" || key3 === "minute")) {
                const err26 = { instancePath: instancePath + "/scene_end/hi", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data5.day !== void 0) {
              let data6 = data5.day;
              if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)))) {
                const err27 = { instancePath: instancePath + "/scene_end/hi/day", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            }
            if (data5.minute !== void 0) {
              let data7 = data5.minute;
              if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)))) {
                const err28 = { instancePath: instancePath + "/scene_end/hi/minute", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
              if (typeof data7 == "number") {
                if (data7 > 1439 || isNaN(data7)) {
                  const err29 = { instancePath: instancePath + "/scene_end/hi/minute", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                if (data7 < 0 || isNaN(data7)) {
                  const err30 = { instancePath: instancePath + "/scene_end/hi/minute", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err31 = { instancePath: instancePath + "/scene_end/hi", schemaPath: "#/properties/scene_end/oneOf/1/properties/hi/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data1.precision !== void 0) {
          let data8 = data1.precision;
          if (!(data8 === "minute" || data8 === "day" || data8 === "range" || data8 === "approx")) {
            const err32 = { instancePath: instancePath + "/scene_end/precision", schemaPath: "#/properties/scene_end/oneOf/1/properties/precision/enum", keyword: "enum", params: { allowedValues: schema80.properties.scene_end.oneOf[1].properties.precision.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
      } else {
        const err33 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
      var _valid0 = _errs7 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err34 = { instancePath: instancePath + "/scene_end", schemaPath: "#/properties/scene_end/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      } else {
        errors = _errs4;
        if (vErrors !== null) {
          if (_errs4) {
            vErrors.length = _errs4;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.flashback !== void 0) {
      if (typeof data.flashback !== "boolean") {
        const err35 = { instancePath: instancePath + "/flashback", schemaPath: "#/properties/flashback/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.claim_checks !== void 0) {
      let data10 = data.claim_checks;
      if (Array.isArray(data10)) {
        if (data10.length > 400) {
          const err36 = { instancePath: instancePath + "/claim_checks", schemaPath: "#/properties/claim_checks/maxItems", keyword: "maxItems", params: { limit: 400 }, message: "must NOT have more than 400 items" };
          if (vErrors === null) {
            vErrors = [err36];
          } else {
            vErrors.push(err36);
          }
          errors++;
        }
        const len0 = data10.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data11 = data10[i0];
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.claim_id === void 0) {
              const err37 = { instancePath: instancePath + "/claim_checks/" + i0, schemaPath: "#/properties/claim_checks/items/required", keyword: "required", params: { missingProperty: "claim_id" }, message: "must have required property 'claim_id'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data11.verdict === void 0) {
              const err38 = { instancePath: instancePath + "/claim_checks/" + i0, schemaPath: "#/properties/claim_checks/items/required", keyword: "required", params: { missingProperty: "verdict" }, message: "must have required property 'verdict'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            for (const key4 in data11) {
              if (!(key4 === "claim_id" || key4 === "verdict" || key4 === "record_ids" || key4 === "note")) {
                const err39 = { instancePath: instancePath + "/claim_checks/" + i0, schemaPath: "#/properties/claim_checks/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data11.claim_id !== void 0) {
              let data12 = data11.claim_id;
              if (typeof data12 === "string") {
                if (func2(data12) > 200) {
                  const err40 = { instancePath: instancePath + "/claim_checks/" + i0 + "/claim_id", schemaPath: "#/properties/claim_checks/items/properties/claim_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
                if (func2(data12) < 1) {
                  const err41 = { instancePath: instancePath + "/claim_checks/" + i0 + "/claim_id", schemaPath: "#/properties/claim_checks/items/properties/claim_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              } else {
                const err42 = { instancePath: instancePath + "/claim_checks/" + i0 + "/claim_id", schemaPath: "#/properties/claim_checks/items/properties/claim_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data11.verdict !== void 0) {
              let data13 = data11.verdict;
              if (!(data13 === "consistent" || data13 === "contradiction" || data13 === "unsupported" || data13 === "belief_ok" || data13 === "new_detail" || data13 === "not_applicable")) {
                const err43 = { instancePath: instancePath + "/claim_checks/" + i0 + "/verdict", schemaPath: "#/properties/claim_checks/items/properties/verdict/enum", keyword: "enum", params: { allowedValues: schema80.properties.claim_checks.items.properties.verdict.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data11.record_ids !== void 0) {
              let data14 = data11.record_ids;
              if (Array.isArray(data14)) {
                if (data14.length > 200) {
                  const err44 = { instancePath: instancePath + "/claim_checks/" + i0 + "/record_ids", schemaPath: "#/properties/claim_checks/items/properties/record_ids/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
                const len1 = data14.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data14[i1] !== "string") {
                    const err45 = { instancePath: instancePath + "/claim_checks/" + i0 + "/record_ids/" + i1, schemaPath: "#/properties/claim_checks/items/properties/record_ids/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
              } else {
                const err46 = { instancePath: instancePath + "/claim_checks/" + i0 + "/record_ids", schemaPath: "#/properties/claim_checks/items/properties/record_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data11.note !== void 0) {
              if (typeof data11.note !== "string") {
                const err47 = { instancePath: instancePath + "/claim_checks/" + i0 + "/note", schemaPath: "#/properties/claim_checks/items/properties/note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
          } else {
            const err48 = { instancePath: instancePath + "/claim_checks/" + i0, schemaPath: "#/properties/claim_checks/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
      } else {
        const err49 = { instancePath: instancePath + "/claim_checks", schemaPath: "#/properties/claim_checks/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err49];
        } else {
          vErrors.push(err49);
        }
        errors++;
      }
    }
    if (data.transitions !== void 0) {
      let data17 = data.transitions;
      if (Array.isArray(data17)) {
        if (data17.length > 200) {
          const err50 = { instancePath: instancePath + "/transitions", schemaPath: "#/properties/transitions/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
        const len2 = data17.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data18 = data17[i2];
          if (data18 && typeof data18 == "object" && !Array.isArray(data18)) {
            if (data18.op === void 0) {
              const err51 = { instancePath: instancePath + "/transitions/" + i2, schemaPath: "#/properties/transitions/items/required", keyword: "required", params: { missingProperty: "op" }, message: "must have required property 'op'" };
              if (vErrors === null) {
                vErrors = [err51];
              } else {
                vErrors.push(err51);
              }
              errors++;
            }
            if (data18.entity_id === void 0) {
              const err52 = { instancePath: instancePath + "/transitions/" + i2, schemaPath: "#/properties/transitions/items/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
            if (data18.predicate === void 0) {
              const err53 = { instancePath: instancePath + "/transitions/" + i2, schemaPath: "#/properties/transitions/items/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
              if (vErrors === null) {
                vErrors = [err53];
              } else {
                vErrors.push(err53);
              }
              errors++;
            }
            for (const key5 in data18) {
              if (!(key5 === "op" || key5 === "entity_id" || key5 === "predicate" || key5 === "value" || key5 === "quote" || key5 === "occurrence_ref")) {
                const err54 = { instancePath: instancePath + "/transitions/" + i2, schemaPath: "#/properties/transitions/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            }
            if (data18.op !== void 0) {
              let data19 = data18.op;
              if (!(data19 === "set" || data19 === "unset")) {
                const err55 = { instancePath: instancePath + "/transitions/" + i2 + "/op", schemaPath: "#/properties/transitions/items/properties/op/enum", keyword: "enum", params: { allowedValues: schema80.properties.transitions.items.properties.op.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
            }
            if (data18.entity_id !== void 0) {
              let data20 = data18.entity_id;
              if (typeof data20 === "string") {
                if (func2(data20) > 200) {
                  const err56 = { instancePath: instancePath + "/transitions/" + i2 + "/entity_id", schemaPath: "#/properties/transitions/items/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
                if (func2(data20) < 1) {
                  const err57 = { instancePath: instancePath + "/transitions/" + i2 + "/entity_id", schemaPath: "#/properties/transitions/items/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err57];
                  } else {
                    vErrors.push(err57);
                  }
                  errors++;
                }
              } else {
                const err58 = { instancePath: instancePath + "/transitions/" + i2 + "/entity_id", schemaPath: "#/properties/transitions/items/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
            }
            if (data18.predicate !== void 0) {
              let data21 = data18.predicate;
              if (typeof data21 === "string") {
                if (func2(data21) > 200) {
                  const err59 = { instancePath: instancePath + "/transitions/" + i2 + "/predicate", schemaPath: "#/properties/transitions/items/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
                if (func2(data21) < 1) {
                  const err60 = { instancePath: instancePath + "/transitions/" + i2 + "/predicate", schemaPath: "#/properties/transitions/items/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
              } else {
                const err61 = { instancePath: instancePath + "/transitions/" + i2 + "/predicate", schemaPath: "#/properties/transitions/items/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err61];
                } else {
                  vErrors.push(err61);
                }
                errors++;
              }
            }
            if (data18.value !== void 0) {
              let data22 = data18.value;
              const _errs52 = errors;
              let valid13 = false;
              let passing1 = null;
              const _errs53 = errors;
              if (typeof data22 !== "boolean") {
                const err62 = { instancePath: instancePath + "/transitions/" + i2 + "/value", schemaPath: "#/properties/transitions/items/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err62];
                } else {
                  vErrors.push(err62);
                }
                errors++;
              }
              var _valid1 = _errs53 === errors;
              if (_valid1) {
                valid13 = true;
                passing1 = 0;
              }
              const _errs55 = errors;
              if (!(typeof data22 == "number")) {
                const err63 = { instancePath: instancePath + "/transitions/" + i2 + "/value", schemaPath: "#/properties/transitions/items/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err63];
                } else {
                  vErrors.push(err63);
                }
                errors++;
              }
              var _valid1 = _errs55 === errors;
              if (_valid1 && valid13) {
                valid13 = false;
                passing1 = [passing1, 1];
              } else {
                if (_valid1) {
                  valid13 = true;
                  passing1 = 1;
                }
                const _errs57 = errors;
                if (typeof data22 !== "string") {
                  const err64 = { instancePath: instancePath + "/transitions/" + i2 + "/value", schemaPath: "#/properties/transitions/items/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
                var _valid1 = _errs57 === errors;
                if (_valid1 && valid13) {
                  valid13 = false;
                  passing1 = [passing1, 2];
                } else {
                  if (_valid1) {
                    valid13 = true;
                    passing1 = 2;
                  }
                  const _errs59 = errors;
                  if (Array.isArray(data22)) {
                    const len3 = data22.length;
                    for (let i3 = 0; i3 < len3; i3++) {
                      if (typeof data22[i3] !== "string") {
                        const err65 = { instancePath: instancePath + "/transitions/" + i2 + "/value/" + i3, schemaPath: "#/properties/transitions/items/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err65];
                        } else {
                          vErrors.push(err65);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err66 = { instancePath: instancePath + "/transitions/" + i2 + "/value", schemaPath: "#/properties/transitions/items/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err66];
                    } else {
                      vErrors.push(err66);
                    }
                    errors++;
                  }
                  var _valid1 = _errs59 === errors;
                  if (_valid1 && valid13) {
                    valid13 = false;
                    passing1 = [passing1, 3];
                  } else {
                    if (_valid1) {
                      valid13 = true;
                      passing1 = 3;
                    }
                  }
                }
              }
              if (!valid13) {
                const err67 = { instancePath: instancePath + "/transitions/" + i2 + "/value", schemaPath: "#/properties/transitions/items/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err67];
                } else {
                  vErrors.push(err67);
                }
                errors++;
              } else {
                errors = _errs52;
                if (vErrors !== null) {
                  if (_errs52) {
                    vErrors.length = _errs52;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data18.quote !== void 0) {
              if (typeof data18.quote !== "string") {
                const err68 = { instancePath: instancePath + "/transitions/" + i2 + "/quote", schemaPath: "#/properties/transitions/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err68];
                } else {
                  vErrors.push(err68);
                }
                errors++;
              }
            }
            if (data18.occurrence_ref !== void 0) {
              let data25 = data18.occurrence_ref;
              if (typeof data25 !== "string" && data25 !== null) {
                const err69 = { instancePath: instancePath + "/transitions/" + i2 + "/occurrence_ref", schemaPath: "#/properties/transitions/items/properties/occurrence_ref/type", keyword: "type", params: { type: schema80.properties.transitions.items.properties.occurrence_ref.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err69];
                } else {
                  vErrors.push(err69);
                }
                errors++;
              }
            }
          } else {
            const err70 = { instancePath: instancePath + "/transitions/" + i2, schemaPath: "#/properties/transitions/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err70];
            } else {
              vErrors.push(err70);
            }
            errors++;
          }
        }
      } else {
        const err71 = { instancePath: instancePath + "/transitions", schemaPath: "#/properties/transitions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err71];
        } else {
          vErrors.push(err71);
        }
        errors++;
      }
    }
    if (data.occurrences !== void 0) {
      let data26 = data.occurrences;
      if (Array.isArray(data26)) {
        if (data26.length > 200) {
          const err72 = { instancePath: instancePath + "/occurrences", schemaPath: "#/properties/occurrences/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err72];
          } else {
            vErrors.push(err72);
          }
          errors++;
        }
        const len4 = data26.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data27 = data26[i4];
          if (data27 && typeof data27 == "object" && !Array.isArray(data27)) {
            if (data27.ref === void 0) {
              const err73 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/required", keyword: "required", params: { missingProperty: "ref" }, message: "must have required property 'ref'" };
              if (vErrors === null) {
                vErrors = [err73];
              } else {
                vErrors.push(err73);
              }
              errors++;
            }
            if (data27.title === void 0) {
              const err74 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
              if (vErrors === null) {
                vErrors = [err74];
              } else {
                vErrors.push(err74);
              }
              errors++;
            }
            if (data27.account === void 0) {
              const err75 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/required", keyword: "required", params: { missingProperty: "account" }, message: "must have required property 'account'" };
              if (vErrors === null) {
                vErrors = [err75];
              } else {
                vErrors.push(err75);
              }
              errors++;
            }
            if (data27.actors === void 0) {
              const err76 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/required", keyword: "required", params: { missingProperty: "actors" }, message: "must have required property 'actors'" };
              if (vErrors === null) {
                vErrors = [err76];
              } else {
                vErrors.push(err76);
              }
              errors++;
            }
            if (data27.quote === void 0) {
              const err77 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err77];
              } else {
                vErrors.push(err77);
              }
              errors++;
            }
            for (const key6 in data27) {
              if (!func1.call(schema80.properties.occurrences.items.properties, key6)) {
                const err78 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err78];
                } else {
                  vErrors.push(err78);
                }
                errors++;
              }
            }
            if (data27.ref !== void 0) {
              let data28 = data27.ref;
              if (typeof data28 === "string") {
                if (func2(data28) > 200) {
                  const err79 = { instancePath: instancePath + "/occurrences/" + i4 + "/ref", schemaPath: "#/properties/occurrences/items/properties/ref/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err79];
                  } else {
                    vErrors.push(err79);
                  }
                  errors++;
                }
                if (func2(data28) < 1) {
                  const err80 = { instancePath: instancePath + "/occurrences/" + i4 + "/ref", schemaPath: "#/properties/occurrences/items/properties/ref/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err80];
                  } else {
                    vErrors.push(err80);
                  }
                  errors++;
                }
              } else {
                const err81 = { instancePath: instancePath + "/occurrences/" + i4 + "/ref", schemaPath: "#/properties/occurrences/items/properties/ref/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err81];
                } else {
                  vErrors.push(err81);
                }
                errors++;
              }
            }
            if (data27.title !== void 0) {
              if (typeof data27.title !== "string") {
                const err82 = { instancePath: instancePath + "/occurrences/" + i4 + "/title", schemaPath: "#/properties/occurrences/items/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err82];
                } else {
                  vErrors.push(err82);
                }
                errors++;
              }
            }
            if (data27.account !== void 0) {
              if (typeof data27.account !== "string") {
                const err83 = { instancePath: instancePath + "/occurrences/" + i4 + "/account", schemaPath: "#/properties/occurrences/items/properties/account/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err83];
                } else {
                  vErrors.push(err83);
                }
                errors++;
              }
            }
            if (data27.actors !== void 0) {
              let data31 = data27.actors;
              if (Array.isArray(data31)) {
                if (data31.length > 200) {
                  const err84 = { instancePath: instancePath + "/occurrences/" + i4 + "/actors", schemaPath: "#/properties/occurrences/items/properties/actors/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err84];
                  } else {
                    vErrors.push(err84);
                  }
                  errors++;
                }
                const len5 = data31.length;
                for (let i5 = 0; i5 < len5; i5++) {
                  if (typeof data31[i5] !== "string") {
                    const err85 = { instancePath: instancePath + "/occurrences/" + i4 + "/actors/" + i5, schemaPath: "#/properties/occurrences/items/properties/actors/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err85];
                    } else {
                      vErrors.push(err85);
                    }
                    errors++;
                  }
                }
              } else {
                const err86 = { instancePath: instancePath + "/occurrences/" + i4 + "/actors", schemaPath: "#/properties/occurrences/items/properties/actors/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err86];
                } else {
                  vErrors.push(err86);
                }
                errors++;
              }
            }
            if (data27.affected !== void 0) {
              let data33 = data27.affected;
              if (Array.isArray(data33)) {
                if (data33.length > 200) {
                  const err87 = { instancePath: instancePath + "/occurrences/" + i4 + "/affected", schemaPath: "#/properties/occurrences/items/properties/affected/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err87];
                  } else {
                    vErrors.push(err87);
                  }
                  errors++;
                }
                const len6 = data33.length;
                for (let i6 = 0; i6 < len6; i6++) {
                  if (typeof data33[i6] !== "string") {
                    const err88 = { instancePath: instancePath + "/occurrences/" + i4 + "/affected/" + i6, schemaPath: "#/properties/occurrences/items/properties/affected/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err88];
                    } else {
                      vErrors.push(err88);
                    }
                    errors++;
                  }
                }
              } else {
                const err89 = { instancePath: instancePath + "/occurrences/" + i4 + "/affected", schemaPath: "#/properties/occurrences/items/properties/affected/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err89];
                } else {
                  vErrors.push(err89);
                }
                errors++;
              }
            }
            if (data27.locations !== void 0) {
              let data35 = data27.locations;
              if (Array.isArray(data35)) {
                if (data35.length > 200) {
                  const err90 = { instancePath: instancePath + "/occurrences/" + i4 + "/locations", schemaPath: "#/properties/occurrences/items/properties/locations/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err90];
                  } else {
                    vErrors.push(err90);
                  }
                  errors++;
                }
                const len7 = data35.length;
                for (let i7 = 0; i7 < len7; i7++) {
                  if (typeof data35[i7] !== "string") {
                    const err91 = { instancePath: instancePath + "/occurrences/" + i4 + "/locations/" + i7, schemaPath: "#/properties/occurrences/items/properties/locations/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err91];
                    } else {
                      vErrors.push(err91);
                    }
                    errors++;
                  }
                }
              } else {
                const err92 = { instancePath: instancePath + "/occurrences/" + i4 + "/locations", schemaPath: "#/properties/occurrences/items/properties/locations/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err92];
                } else {
                  vErrors.push(err92);
                }
                errors++;
              }
            }
            if (data27.time !== void 0) {
              let data37 = data27.time;
              const _errs91 = errors;
              let valid25 = false;
              let passing2 = null;
              const _errs92 = errors;
              if (data37 !== null) {
                const err93 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err93];
                } else {
                  vErrors.push(err93);
                }
                errors++;
              }
              var _valid2 = _errs92 === errors;
              if (_valid2) {
                valid25 = true;
                passing2 = 0;
              }
              const _errs94 = errors;
              if (data37 && typeof data37 == "object" && !Array.isArray(data37)) {
                if (data37.lo === void 0) {
                  const err94 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "lo" }, message: "must have required property 'lo'" };
                  if (vErrors === null) {
                    vErrors = [err94];
                  } else {
                    vErrors.push(err94);
                  }
                  errors++;
                }
                if (data37.hi === void 0) {
                  const err95 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "hi" }, message: "must have required property 'hi'" };
                  if (vErrors === null) {
                    vErrors = [err95];
                  } else {
                    vErrors.push(err95);
                  }
                  errors++;
                }
                if (data37.precision === void 0) {
                  const err96 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "precision" }, message: "must have required property 'precision'" };
                  if (vErrors === null) {
                    vErrors = [err96];
                  } else {
                    vErrors.push(err96);
                  }
                  errors++;
                }
                for (const key7 in data37) {
                  if (!(key7 === "lo" || key7 === "hi" || key7 === "precision")) {
                    const err97 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err97];
                    } else {
                      vErrors.push(err97);
                    }
                    errors++;
                  }
                }
                if (data37.lo !== void 0) {
                  let data38 = data37.lo;
                  if (data38 && typeof data38 == "object" && !Array.isArray(data38)) {
                    if (data38.day === void 0) {
                      const err98 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                      if (vErrors === null) {
                        vErrors = [err98];
                      } else {
                        vErrors.push(err98);
                      }
                      errors++;
                    }
                    if (data38.minute === void 0) {
                      const err99 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                      if (vErrors === null) {
                        vErrors = [err99];
                      } else {
                        vErrors.push(err99);
                      }
                      errors++;
                    }
                    for (const key8 in data38) {
                      if (!(key8 === "day" || key8 === "minute")) {
                        const err100 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err100];
                        } else {
                          vErrors.push(err100);
                        }
                        errors++;
                      }
                    }
                    if (data38.day !== void 0) {
                      let data39 = data38.day;
                      if (!(typeof data39 == "number" && (!(data39 % 1) && !isNaN(data39)))) {
                        const err101 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo/day", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err101];
                        } else {
                          vErrors.push(err101);
                        }
                        errors++;
                      }
                    }
                    if (data38.minute !== void 0) {
                      let data40 = data38.minute;
                      if (!(typeof data40 == "number" && (!(data40 % 1) && !isNaN(data40)))) {
                        const err102 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo/minute", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err102];
                        } else {
                          vErrors.push(err102);
                        }
                        errors++;
                      }
                      if (typeof data40 == "number") {
                        if (data40 > 1439 || isNaN(data40)) {
                          const err103 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo/minute", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                          if (vErrors === null) {
                            vErrors = [err103];
                          } else {
                            vErrors.push(err103);
                          }
                          errors++;
                        }
                        if (data40 < 0 || isNaN(data40)) {
                          const err104 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo/minute", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err104];
                          } else {
                            vErrors.push(err104);
                          }
                          errors++;
                        }
                      }
                    }
                  } else {
                    const err105 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/lo", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/lo/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err105];
                    } else {
                      vErrors.push(err105);
                    }
                    errors++;
                  }
                }
                if (data37.hi !== void 0) {
                  let data41 = data37.hi;
                  if (data41 && typeof data41 == "object" && !Array.isArray(data41)) {
                    if (data41.day === void 0) {
                      const err106 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                      if (vErrors === null) {
                        vErrors = [err106];
                      } else {
                        vErrors.push(err106);
                      }
                      errors++;
                    }
                    if (data41.minute === void 0) {
                      const err107 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                      if (vErrors === null) {
                        vErrors = [err107];
                      } else {
                        vErrors.push(err107);
                      }
                      errors++;
                    }
                    for (const key9 in data41) {
                      if (!(key9 === "day" || key9 === "minute")) {
                        const err108 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err108];
                        } else {
                          vErrors.push(err108);
                        }
                        errors++;
                      }
                    }
                    if (data41.day !== void 0) {
                      let data42 = data41.day;
                      if (!(typeof data42 == "number" && (!(data42 % 1) && !isNaN(data42)))) {
                        const err109 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi/day", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err109];
                        } else {
                          vErrors.push(err109);
                        }
                        errors++;
                      }
                    }
                    if (data41.minute !== void 0) {
                      let data43 = data41.minute;
                      if (!(typeof data43 == "number" && (!(data43 % 1) && !isNaN(data43)))) {
                        const err110 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi/minute", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err110];
                        } else {
                          vErrors.push(err110);
                        }
                        errors++;
                      }
                      if (typeof data43 == "number") {
                        if (data43 > 1439 || isNaN(data43)) {
                          const err111 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi/minute", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                          if (vErrors === null) {
                            vErrors = [err111];
                          } else {
                            vErrors.push(err111);
                          }
                          errors++;
                        }
                        if (data43 < 0 || isNaN(data43)) {
                          const err112 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi/minute", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err112];
                          } else {
                            vErrors.push(err112);
                          }
                          errors++;
                        }
                      }
                    }
                  } else {
                    const err113 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/hi", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/hi/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err113];
                    } else {
                      vErrors.push(err113);
                    }
                    errors++;
                  }
                }
                if (data37.precision !== void 0) {
                  let data44 = data37.precision;
                  if (!(data44 === "minute" || data44 === "day" || data44 === "range" || data44 === "approx")) {
                    const err114 = { instancePath: instancePath + "/occurrences/" + i4 + "/time/precision", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/properties/precision/enum", keyword: "enum", params: { allowedValues: schema80.properties.occurrences.items.properties.time.oneOf[1].properties.precision.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err114];
                    } else {
                      vErrors.push(err114);
                    }
                    errors++;
                  }
                }
              } else {
                const err115 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err115];
                } else {
                  vErrors.push(err115);
                }
                errors++;
              }
              var _valid2 = _errs94 === errors;
              if (_valid2 && valid25) {
                valid25 = false;
                passing2 = [passing2, 1];
              } else {
                if (_valid2) {
                  valid25 = true;
                  passing2 = 1;
                }
              }
              if (!valid25) {
                const err116 = { instancePath: instancePath + "/occurrences/" + i4 + "/time", schemaPath: "#/properties/occurrences/items/properties/time/oneOf", keyword: "oneOf", params: { passingSchemas: passing2 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err116];
                } else {
                  vErrors.push(err116);
                }
                errors++;
              } else {
                errors = _errs91;
                if (vErrors !== null) {
                  if (_errs91) {
                    vErrors.length = _errs91;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data27.causes !== void 0) {
              let data45 = data27.causes;
              if (Array.isArray(data45)) {
                if (data45.length > 200) {
                  const err117 = { instancePath: instancePath + "/occurrences/" + i4 + "/causes", schemaPath: "#/properties/occurrences/items/properties/causes/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err117];
                  } else {
                    vErrors.push(err117);
                  }
                  errors++;
                }
                const len8 = data45.length;
                for (let i8 = 0; i8 < len8; i8++) {
                  if (typeof data45[i8] !== "string") {
                    const err118 = { instancePath: instancePath + "/occurrences/" + i4 + "/causes/" + i8, schemaPath: "#/properties/occurrences/items/properties/causes/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err118];
                    } else {
                      vErrors.push(err118);
                    }
                    errors++;
                  }
                }
              } else {
                const err119 = { instancePath: instancePath + "/occurrences/" + i4 + "/causes", schemaPath: "#/properties/occurrences/items/properties/causes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err119];
                } else {
                  vErrors.push(err119);
                }
                errors++;
              }
            }
            if (data27.quote !== void 0) {
              if (typeof data27.quote !== "string") {
                const err120 = { instancePath: instancePath + "/occurrences/" + i4 + "/quote", schemaPath: "#/properties/occurrences/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err120];
                } else {
                  vErrors.push(err120);
                }
                errors++;
              }
            }
            if (data27.pack_event_id !== void 0) {
              let data48 = data27.pack_event_id;
              if (typeof data48 !== "string" && data48 !== null) {
                const err121 = { instancePath: instancePath + "/occurrences/" + i4 + "/pack_event_id", schemaPath: "#/properties/occurrences/items/properties/pack_event_id/type", keyword: "type", params: { type: schema80.properties.occurrences.items.properties.pack_event_id.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err121];
                } else {
                  vErrors.push(err121);
                }
                errors++;
              }
            }
            if (data27.disposition !== void 0) {
              let data49 = data27.disposition;
              if (!(data49 === "occurred" || data49 === "diverged" || data49 === "ongoing" || data49 === null)) {
                const err122 = { instancePath: instancePath + "/occurrences/" + i4 + "/disposition", schemaPath: "#/properties/occurrences/items/properties/disposition/enum", keyword: "enum", params: { allowedValues: schema80.properties.occurrences.items.properties.disposition.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err122];
                } else {
                  vErrors.push(err122);
                }
                errors++;
              }
            }
            if (data27.ref_phrases !== void 0) {
              let data50 = data27.ref_phrases;
              if (Array.isArray(data50)) {
                if (data50.length > 200) {
                  const err123 = { instancePath: instancePath + "/occurrences/" + i4 + "/ref_phrases", schemaPath: "#/properties/occurrences/items/properties/ref_phrases/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err123];
                  } else {
                    vErrors.push(err123);
                  }
                  errors++;
                }
                const len9 = data50.length;
                for (let i9 = 0; i9 < len9; i9++) {
                  if (typeof data50[i9] !== "string") {
                    const err124 = { instancePath: instancePath + "/occurrences/" + i4 + "/ref_phrases/" + i9, schemaPath: "#/properties/occurrences/items/properties/ref_phrases/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err124];
                    } else {
                      vErrors.push(err124);
                    }
                    errors++;
                  }
                }
              } else {
                const err125 = { instancePath: instancePath + "/occurrences/" + i4 + "/ref_phrases", schemaPath: "#/properties/occurrences/items/properties/ref_phrases/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err125];
                } else {
                  vErrors.push(err125);
                }
                errors++;
              }
            }
            if (data27.continues !== void 0) {
              let data52 = data27.continues;
              if (typeof data52 !== "string" && data52 !== null) {
                const err126 = { instancePath: instancePath + "/occurrences/" + i4 + "/continues", schemaPath: "#/properties/occurrences/items/properties/continues/type", keyword: "type", params: { type: schema80.properties.occurrences.items.properties.continues.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err126];
                } else {
                  vErrors.push(err126);
                }
                errors++;
              }
              if (typeof data52 === "string") {
                if (func2(data52) > 200) {
                  const err127 = { instancePath: instancePath + "/occurrences/" + i4 + "/continues", schemaPath: "#/properties/occurrences/items/properties/continues/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err127];
                  } else {
                    vErrors.push(err127);
                  }
                  errors++;
                }
              }
            }
            if (data27.visibility !== void 0) {
              let data53 = data27.visibility;
              if (!(data53 === "public" || data53 === "restricted" || data53 === "secret")) {
                const err128 = { instancePath: instancePath + "/occurrences/" + i4 + "/visibility", schemaPath: "#/properties/occurrences/items/properties/visibility/enum", keyword: "enum", params: { allowedValues: schema80.properties.occurrences.items.properties.visibility.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err128];
                } else {
                  vErrors.push(err128);
                }
                errors++;
              }
            }
            if (data27.knowers !== void 0) {
              let data54 = data27.knowers;
              if (Array.isArray(data54)) {
                if (data54.length > 200) {
                  const err129 = { instancePath: instancePath + "/occurrences/" + i4 + "/knowers", schemaPath: "#/properties/occurrences/items/properties/knowers/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err129];
                  } else {
                    vErrors.push(err129);
                  }
                  errors++;
                }
                const len10 = data54.length;
                for (let i10 = 0; i10 < len10; i10++) {
                  if (typeof data54[i10] !== "string") {
                    const err130 = { instancePath: instancePath + "/occurrences/" + i4 + "/knowers/" + i10, schemaPath: "#/properties/occurrences/items/properties/knowers/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err130];
                    } else {
                      vErrors.push(err130);
                    }
                    errors++;
                  }
                }
              } else {
                const err131 = { instancePath: instancePath + "/occurrences/" + i4 + "/knowers", schemaPath: "#/properties/occurrences/items/properties/knowers/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err131];
                } else {
                  vErrors.push(err131);
                }
                errors++;
              }
            }
            if (data27.origin !== void 0) {
              let data56 = data27.origin;
              if (!(data56 === "player" || data56 === "gm" || data56 === "intervention")) {
                const err132 = { instancePath: instancePath + "/occurrences/" + i4 + "/origin", schemaPath: "#/properties/occurrences/items/properties/origin/enum", keyword: "enum", params: { allowedValues: schema80.properties.occurrences.items.properties.origin.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err132];
                } else {
                  vErrors.push(err132);
                }
                errors++;
              }
            }
          } else {
            const err133 = { instancePath: instancePath + "/occurrences/" + i4, schemaPath: "#/properties/occurrences/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err133];
            } else {
              vErrors.push(err133);
            }
            errors++;
          }
        }
      } else {
        const err134 = { instancePath: instancePath + "/occurrences", schemaPath: "#/properties/occurrences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err134];
        } else {
          vErrors.push(err134);
        }
        errors++;
      }
    }
    if (data.state_claims !== void 0) {
      let data57 = data.state_claims;
      if (Array.isArray(data57)) {
        if (data57.length > 200) {
          const err135 = { instancePath: instancePath + "/state_claims", schemaPath: "#/properties/state_claims/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err135];
          } else {
            vErrors.push(err135);
          }
          errors++;
        }
        const len11 = data57.length;
        for (let i11 = 0; i11 < len11; i11++) {
          let data58 = data57[i11];
          if (data58 && typeof data58 == "object" && !Array.isArray(data58)) {
            if (data58.entity_id === void 0) {
              const err136 = { instancePath: instancePath + "/state_claims/" + i11, schemaPath: "#/properties/state_claims/items/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
              if (vErrors === null) {
                vErrors = [err136];
              } else {
                vErrors.push(err136);
              }
              errors++;
            }
            if (data58.predicate === void 0) {
              const err137 = { instancePath: instancePath + "/state_claims/" + i11, schemaPath: "#/properties/state_claims/items/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
              if (vErrors === null) {
                vErrors = [err137];
              } else {
                vErrors.push(err137);
              }
              errors++;
            }
            if (data58.value === void 0) {
              const err138 = { instancePath: instancePath + "/state_claims/" + i11, schemaPath: "#/properties/state_claims/items/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
              if (vErrors === null) {
                vErrors = [err138];
              } else {
                vErrors.push(err138);
              }
              errors++;
            }
            if (data58.quote === void 0) {
              const err139 = { instancePath: instancePath + "/state_claims/" + i11, schemaPath: "#/properties/state_claims/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err139];
              } else {
                vErrors.push(err139);
              }
              errors++;
            }
            for (const key10 in data58) {
              if (!(key10 === "entity_id" || key10 === "predicate" || key10 === "value" || key10 === "quote" || key10 === "at")) {
                const err140 = { instancePath: instancePath + "/state_claims/" + i11, schemaPath: "#/properties/state_claims/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err140];
                } else {
                  vErrors.push(err140);
                }
                errors++;
              }
            }
            if (data58.entity_id !== void 0) {
              let data59 = data58.entity_id;
              if (typeof data59 === "string") {
                if (func2(data59) > 200) {
                  const err141 = { instancePath: instancePath + "/state_claims/" + i11 + "/entity_id", schemaPath: "#/properties/state_claims/items/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err141];
                  } else {
                    vErrors.push(err141);
                  }
                  errors++;
                }
                if (func2(data59) < 1) {
                  const err142 = { instancePath: instancePath + "/state_claims/" + i11 + "/entity_id", schemaPath: "#/properties/state_claims/items/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err142];
                  } else {
                    vErrors.push(err142);
                  }
                  errors++;
                }
              } else {
                const err143 = { instancePath: instancePath + "/state_claims/" + i11 + "/entity_id", schemaPath: "#/properties/state_claims/items/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err143];
                } else {
                  vErrors.push(err143);
                }
                errors++;
              }
            }
            if (data58.predicate !== void 0) {
              let data60 = data58.predicate;
              if (typeof data60 === "string") {
                if (func2(data60) > 200) {
                  const err144 = { instancePath: instancePath + "/state_claims/" + i11 + "/predicate", schemaPath: "#/properties/state_claims/items/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err144];
                  } else {
                    vErrors.push(err144);
                  }
                  errors++;
                }
                if (func2(data60) < 1) {
                  const err145 = { instancePath: instancePath + "/state_claims/" + i11 + "/predicate", schemaPath: "#/properties/state_claims/items/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err145];
                  } else {
                    vErrors.push(err145);
                  }
                  errors++;
                }
              } else {
                const err146 = { instancePath: instancePath + "/state_claims/" + i11 + "/predicate", schemaPath: "#/properties/state_claims/items/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err146];
                } else {
                  vErrors.push(err146);
                }
                errors++;
              }
            }
            if (data58.value !== void 0) {
              let data61 = data58.value;
              const _errs143 = errors;
              let valid38 = false;
              let passing3 = null;
              const _errs144 = errors;
              if (typeof data61 !== "boolean") {
                const err147 = { instancePath: instancePath + "/state_claims/" + i11 + "/value", schemaPath: "#/properties/state_claims/items/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err147];
                } else {
                  vErrors.push(err147);
                }
                errors++;
              }
              var _valid3 = _errs144 === errors;
              if (_valid3) {
                valid38 = true;
                passing3 = 0;
              }
              const _errs146 = errors;
              if (!(typeof data61 == "number")) {
                const err148 = { instancePath: instancePath + "/state_claims/" + i11 + "/value", schemaPath: "#/properties/state_claims/items/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err148];
                } else {
                  vErrors.push(err148);
                }
                errors++;
              }
              var _valid3 = _errs146 === errors;
              if (_valid3 && valid38) {
                valid38 = false;
                passing3 = [passing3, 1];
              } else {
                if (_valid3) {
                  valid38 = true;
                  passing3 = 1;
                }
                const _errs148 = errors;
                if (typeof data61 !== "string") {
                  const err149 = { instancePath: instancePath + "/state_claims/" + i11 + "/value", schemaPath: "#/properties/state_claims/items/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err149];
                  } else {
                    vErrors.push(err149);
                  }
                  errors++;
                }
                var _valid3 = _errs148 === errors;
                if (_valid3 && valid38) {
                  valid38 = false;
                  passing3 = [passing3, 2];
                } else {
                  if (_valid3) {
                    valid38 = true;
                    passing3 = 2;
                  }
                  const _errs150 = errors;
                  if (Array.isArray(data61)) {
                    const len12 = data61.length;
                    for (let i12 = 0; i12 < len12; i12++) {
                      if (typeof data61[i12] !== "string") {
                        const err150 = { instancePath: instancePath + "/state_claims/" + i11 + "/value/" + i12, schemaPath: "#/properties/state_claims/items/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err150];
                        } else {
                          vErrors.push(err150);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err151 = { instancePath: instancePath + "/state_claims/" + i11 + "/value", schemaPath: "#/properties/state_claims/items/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err151];
                    } else {
                      vErrors.push(err151);
                    }
                    errors++;
                  }
                  var _valid3 = _errs150 === errors;
                  if (_valid3 && valid38) {
                    valid38 = false;
                    passing3 = [passing3, 3];
                  } else {
                    if (_valid3) {
                      valid38 = true;
                      passing3 = 3;
                    }
                  }
                }
              }
              if (!valid38) {
                const err152 = { instancePath: instancePath + "/state_claims/" + i11 + "/value", schemaPath: "#/properties/state_claims/items/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing3 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err152];
                } else {
                  vErrors.push(err152);
                }
                errors++;
              } else {
                errors = _errs143;
                if (vErrors !== null) {
                  if (_errs143) {
                    vErrors.length = _errs143;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data58.quote !== void 0) {
              if (typeof data58.quote !== "string") {
                const err153 = { instancePath: instancePath + "/state_claims/" + i11 + "/quote", schemaPath: "#/properties/state_claims/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err153];
                } else {
                  vErrors.push(err153);
                }
                errors++;
              }
            }
            if (data58.at !== void 0) {
              let data64 = data58.at;
              const _errs157 = errors;
              let valid41 = false;
              let passing4 = null;
              const _errs158 = errors;
              if (data64 !== null) {
                const err154 = { instancePath: instancePath + "/state_claims/" + i11 + "/at", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err154];
                } else {
                  vErrors.push(err154);
                }
                errors++;
              }
              var _valid4 = _errs158 === errors;
              if (_valid4) {
                valid41 = true;
                passing4 = 0;
              }
              const _errs160 = errors;
              if (data64 && typeof data64 == "object" && !Array.isArray(data64)) {
                if (data64.day === void 0) {
                  const err155 = { instancePath: instancePath + "/state_claims/" + i11 + "/at", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                  if (vErrors === null) {
                    vErrors = [err155];
                  } else {
                    vErrors.push(err155);
                  }
                  errors++;
                }
                if (data64.minute === void 0) {
                  const err156 = { instancePath: instancePath + "/state_claims/" + i11 + "/at", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                  if (vErrors === null) {
                    vErrors = [err156];
                  } else {
                    vErrors.push(err156);
                  }
                  errors++;
                }
                for (const key11 in data64) {
                  if (!(key11 === "day" || key11 === "minute")) {
                    const err157 = { instancePath: instancePath + "/state_claims/" + i11 + "/at", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err157];
                    } else {
                      vErrors.push(err157);
                    }
                    errors++;
                  }
                }
                if (data64.day !== void 0) {
                  let data65 = data64.day;
                  if (!(typeof data65 == "number" && (!(data65 % 1) && !isNaN(data65)))) {
                    const err158 = { instancePath: instancePath + "/state_claims/" + i11 + "/at/day", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err158];
                    } else {
                      vErrors.push(err158);
                    }
                    errors++;
                  }
                }
                if (data64.minute !== void 0) {
                  let data66 = data64.minute;
                  if (!(typeof data66 == "number" && (!(data66 % 1) && !isNaN(data66)))) {
                    const err159 = { instancePath: instancePath + "/state_claims/" + i11 + "/at/minute", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err159];
                    } else {
                      vErrors.push(err159);
                    }
                    errors++;
                  }
                  if (typeof data66 == "number") {
                    if (data66 > 1439 || isNaN(data66)) {
                      const err160 = { instancePath: instancePath + "/state_claims/" + i11 + "/at/minute", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                      if (vErrors === null) {
                        vErrors = [err160];
                      } else {
                        vErrors.push(err160);
                      }
                      errors++;
                    }
                    if (data66 < 0 || isNaN(data66)) {
                      const err161 = { instancePath: instancePath + "/state_claims/" + i11 + "/at/minute", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err161];
                      } else {
                        vErrors.push(err161);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err162 = { instancePath: instancePath + "/state_claims/" + i11 + "/at", schemaPath: "#/properties/state_claims/items/properties/at/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err162];
                } else {
                  vErrors.push(err162);
                }
                errors++;
              }
              var _valid4 = _errs160 === errors;
              if (_valid4 && valid41) {
                valid41 = false;
                passing4 = [passing4, 1];
              } else {
                if (_valid4) {
                  valid41 = true;
                  passing4 = 1;
                }
              }
              if (!valid41) {
                const err163 = { instancePath: instancePath + "/state_claims/" + i11 + "/at", schemaPath: "#/properties/state_claims/items/properties/at/oneOf", keyword: "oneOf", params: { passingSchemas: passing4 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err163];
                } else {
                  vErrors.push(err163);
                }
                errors++;
              } else {
                errors = _errs157;
                if (vErrors !== null) {
                  if (_errs157) {
                    vErrors.length = _errs157;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err164 = { instancePath: instancePath + "/state_claims/" + i11, schemaPath: "#/properties/state_claims/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err164];
            } else {
              vErrors.push(err164);
            }
            errors++;
          }
        }
      } else {
        const err165 = { instancePath: instancePath + "/state_claims", schemaPath: "#/properties/state_claims/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err165];
        } else {
          vErrors.push(err165);
        }
        errors++;
      }
    }
    if (data.player_actions !== void 0) {
      let data67 = data.player_actions;
      if (Array.isArray(data67)) {
        if (data67.length > 200) {
          const err166 = { instancePath: instancePath + "/player_actions", schemaPath: "#/properties/player_actions/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err166];
          } else {
            vErrors.push(err166);
          }
          errors++;
        }
        const len13 = data67.length;
        for (let i13 = 0; i13 < len13; i13++) {
          let data68 = data67[i13];
          if (data68 && typeof data68 == "object" && !Array.isArray(data68)) {
            if (data68.quote === void 0) {
              const err167 = { instancePath: instancePath + "/player_actions/" + i13, schemaPath: "#/properties/player_actions/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err167];
              } else {
                vErrors.push(err167);
              }
              errors++;
            }
            if (data68.authorized_by_quote === void 0) {
              const err168 = { instancePath: instancePath + "/player_actions/" + i13, schemaPath: "#/properties/player_actions/items/required", keyword: "required", params: { missingProperty: "authorized_by_quote" }, message: "must have required property 'authorized_by_quote'" };
              if (vErrors === null) {
                vErrors = [err168];
              } else {
                vErrors.push(err168);
              }
              errors++;
            }
            for (const key12 in data68) {
              if (!(key12 === "quote" || key12 === "authorized_by_quote")) {
                const err169 = { instancePath: instancePath + "/player_actions/" + i13, schemaPath: "#/properties/player_actions/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err169];
                } else {
                  vErrors.push(err169);
                }
                errors++;
              }
            }
            if (data68.quote !== void 0) {
              if (typeof data68.quote !== "string") {
                const err170 = { instancePath: instancePath + "/player_actions/" + i13 + "/quote", schemaPath: "#/properties/player_actions/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err170];
                } else {
                  vErrors.push(err170);
                }
                errors++;
              }
            }
            if (data68.authorized_by_quote !== void 0) {
              let data70 = data68.authorized_by_quote;
              if (typeof data70 !== "string" && data70 !== null) {
                const err171 = { instancePath: instancePath + "/player_actions/" + i13 + "/authorized_by_quote", schemaPath: "#/properties/player_actions/items/properties/authorized_by_quote/type", keyword: "type", params: { type: schema80.properties.player_actions.items.properties.authorized_by_quote.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err171];
                } else {
                  vErrors.push(err171);
                }
                errors++;
              }
            }
          } else {
            const err172 = { instancePath: instancePath + "/player_actions/" + i13, schemaPath: "#/properties/player_actions/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err172];
            } else {
              vErrors.push(err172);
            }
            errors++;
          }
        }
      } else {
        const err173 = { instancePath: instancePath + "/player_actions", schemaPath: "#/properties/player_actions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err173];
        } else {
          vErrors.push(err173);
        }
        errors++;
      }
    }
    if (data.step_enactments !== void 0) {
      let data71 = data.step_enactments;
      if (Array.isArray(data71)) {
        if (data71.length > 200) {
          const err174 = { instancePath: instancePath + "/step_enactments", schemaPath: "#/properties/step_enactments/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err174];
          } else {
            vErrors.push(err174);
          }
          errors++;
        }
        const len14 = data71.length;
        for (let i14 = 0; i14 < len14; i14++) {
          let data72 = data71[i14];
          if (data72 && typeof data72 == "object" && !Array.isArray(data72)) {
            if (data72.step_id === void 0) {
              const err175 = { instancePath: instancePath + "/step_enactments/" + i14, schemaPath: "#/properties/step_enactments/items/required", keyword: "required", params: { missingProperty: "step_id" }, message: "must have required property 'step_id'" };
              if (vErrors === null) {
                vErrors = [err175];
              } else {
                vErrors.push(err175);
              }
              errors++;
            }
            if (data72.occurrence_ref === void 0) {
              const err176 = { instancePath: instancePath + "/step_enactments/" + i14, schemaPath: "#/properties/step_enactments/items/required", keyword: "required", params: { missingProperty: "occurrence_ref" }, message: "must have required property 'occurrence_ref'" };
              if (vErrors === null) {
                vErrors = [err176];
              } else {
                vErrors.push(err176);
              }
              errors++;
            }
            if (data72.quote === void 0) {
              const err177 = { instancePath: instancePath + "/step_enactments/" + i14, schemaPath: "#/properties/step_enactments/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err177];
              } else {
                vErrors.push(err177);
              }
              errors++;
            }
            for (const key13 in data72) {
              if (!(key13 === "step_id" || key13 === "occurrence_ref" || key13 === "quote")) {
                const err178 = { instancePath: instancePath + "/step_enactments/" + i14, schemaPath: "#/properties/step_enactments/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key13 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err178];
                } else {
                  vErrors.push(err178);
                }
                errors++;
              }
            }
            if (data72.step_id !== void 0) {
              let data73 = data72.step_id;
              if (typeof data73 === "string") {
                if (func2(data73) > 200) {
                  const err179 = { instancePath: instancePath + "/step_enactments/" + i14 + "/step_id", schemaPath: "#/properties/step_enactments/items/properties/step_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err179];
                  } else {
                    vErrors.push(err179);
                  }
                  errors++;
                }
                if (func2(data73) < 1) {
                  const err180 = { instancePath: instancePath + "/step_enactments/" + i14 + "/step_id", schemaPath: "#/properties/step_enactments/items/properties/step_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err180];
                  } else {
                    vErrors.push(err180);
                  }
                  errors++;
                }
              } else {
                const err181 = { instancePath: instancePath + "/step_enactments/" + i14 + "/step_id", schemaPath: "#/properties/step_enactments/items/properties/step_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err181];
                } else {
                  vErrors.push(err181);
                }
                errors++;
              }
            }
            if (data72.occurrence_ref !== void 0) {
              let data74 = data72.occurrence_ref;
              if (typeof data74 === "string") {
                if (func2(data74) > 200) {
                  const err182 = { instancePath: instancePath + "/step_enactments/" + i14 + "/occurrence_ref", schemaPath: "#/properties/step_enactments/items/properties/occurrence_ref/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err182];
                  } else {
                    vErrors.push(err182);
                  }
                  errors++;
                }
                if (func2(data74) < 1) {
                  const err183 = { instancePath: instancePath + "/step_enactments/" + i14 + "/occurrence_ref", schemaPath: "#/properties/step_enactments/items/properties/occurrence_ref/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err183];
                  } else {
                    vErrors.push(err183);
                  }
                  errors++;
                }
              } else {
                const err184 = { instancePath: instancePath + "/step_enactments/" + i14 + "/occurrence_ref", schemaPath: "#/properties/step_enactments/items/properties/occurrence_ref/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err184];
                } else {
                  vErrors.push(err184);
                }
                errors++;
              }
            }
            if (data72.quote !== void 0) {
              if (typeof data72.quote !== "string") {
                const err185 = { instancePath: instancePath + "/step_enactments/" + i14 + "/quote", schemaPath: "#/properties/step_enactments/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err185];
                } else {
                  vErrors.push(err185);
                }
                errors++;
              }
            }
          } else {
            const err186 = { instancePath: instancePath + "/step_enactments/" + i14, schemaPath: "#/properties/step_enactments/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err186];
            } else {
              vErrors.push(err186);
            }
            errors++;
          }
        }
      } else {
        const err187 = { instancePath: instancePath + "/step_enactments", schemaPath: "#/properties/step_enactments/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err187];
        } else {
          vErrors.push(err187);
        }
        errors++;
      }
    }
    if (data.new_entities !== void 0) {
      let data76 = data.new_entities;
      if (Array.isArray(data76)) {
        if (data76.length > 200) {
          const err188 = { instancePath: instancePath + "/new_entities", schemaPath: "#/properties/new_entities/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err188];
          } else {
            vErrors.push(err188);
          }
          errors++;
        }
        const len15 = data76.length;
        for (let i15 = 0; i15 < len15; i15++) {
          let data77 = data76[i15];
          if (data77 && typeof data77 == "object" && !Array.isArray(data77)) {
            if (data77.ref === void 0) {
              const err189 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/required", keyword: "required", params: { missingProperty: "ref" }, message: "must have required property 'ref'" };
              if (vErrors === null) {
                vErrors = [err189];
              } else {
                vErrors.push(err189);
              }
              errors++;
            }
            if (data77.name === void 0) {
              const err190 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err190];
              } else {
                vErrors.push(err190);
              }
              errors++;
            }
            if (data77.kind === void 0) {
              const err191 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err191];
              } else {
                vErrors.push(err191);
              }
              errors++;
            }
            if (data77.description === void 0) {
              const err192 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
              if (vErrors === null) {
                vErrors = [err192];
              } else {
                vErrors.push(err192);
              }
              errors++;
            }
            if (data77.quote === void 0) {
              const err193 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err193];
              } else {
                vErrors.push(err193);
              }
              errors++;
            }
            for (const key14 in data77) {
              if (!(key14 === "ref" || key14 === "name" || key14 === "kind" || key14 === "description" || key14 === "quote")) {
                const err194 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key14 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err194];
                } else {
                  vErrors.push(err194);
                }
                errors++;
              }
            }
            if (data77.ref !== void 0) {
              let data78 = data77.ref;
              if (typeof data78 === "string") {
                if (func2(data78) > 200) {
                  const err195 = { instancePath: instancePath + "/new_entities/" + i15 + "/ref", schemaPath: "#/properties/new_entities/items/properties/ref/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err195];
                  } else {
                    vErrors.push(err195);
                  }
                  errors++;
                }
                if (func2(data78) < 1) {
                  const err196 = { instancePath: instancePath + "/new_entities/" + i15 + "/ref", schemaPath: "#/properties/new_entities/items/properties/ref/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err196];
                  } else {
                    vErrors.push(err196);
                  }
                  errors++;
                }
              } else {
                const err197 = { instancePath: instancePath + "/new_entities/" + i15 + "/ref", schemaPath: "#/properties/new_entities/items/properties/ref/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err197];
                } else {
                  vErrors.push(err197);
                }
                errors++;
              }
            }
            if (data77.name !== void 0) {
              if (typeof data77.name !== "string") {
                const err198 = { instancePath: instancePath + "/new_entities/" + i15 + "/name", schemaPath: "#/properties/new_entities/items/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err198];
                } else {
                  vErrors.push(err198);
                }
                errors++;
              }
            }
            if (data77.kind !== void 0) {
              let data80 = data77.kind;
              if (!(data80 === "person" || data80 === "organization" || data80 === "place" || data80 === "object" || data80 === "world" || data80 === "other")) {
                const err199 = { instancePath: instancePath + "/new_entities/" + i15 + "/kind", schemaPath: "#/properties/new_entities/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema80.properties.new_entities.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err199];
                } else {
                  vErrors.push(err199);
                }
                errors++;
              }
            }
            if (data77.description !== void 0) {
              if (typeof data77.description !== "string") {
                const err200 = { instancePath: instancePath + "/new_entities/" + i15 + "/description", schemaPath: "#/properties/new_entities/items/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err200];
                } else {
                  vErrors.push(err200);
                }
                errors++;
              }
            }
            if (data77.quote !== void 0) {
              if (typeof data77.quote !== "string") {
                const err201 = { instancePath: instancePath + "/new_entities/" + i15 + "/quote", schemaPath: "#/properties/new_entities/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err201];
                } else {
                  vErrors.push(err201);
                }
                errors++;
              }
            }
          } else {
            const err202 = { instancePath: instancePath + "/new_entities/" + i15, schemaPath: "#/properties/new_entities/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err202];
            } else {
              vErrors.push(err202);
            }
            errors++;
          }
        }
      } else {
        const err203 = { instancePath: instancePath + "/new_entities", schemaPath: "#/properties/new_entities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err203];
        } else {
          vErrors.push(err203);
        }
        errors++;
      }
    }
    if (data.violations !== void 0) {
      let data83 = data.violations;
      if (Array.isArray(data83)) {
        if (data83.length > 200) {
          const err204 = { instancePath: instancePath + "/violations", schemaPath: "#/properties/violations/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err204];
          } else {
            vErrors.push(err204);
          }
          errors++;
        }
        const len16 = data83.length;
        for (let i16 = 0; i16 < len16; i16++) {
          let data84 = data83[i16];
          if (data84 && typeof data84 == "object" && !Array.isArray(data84)) {
            if (data84.code === void 0) {
              const err205 = { instancePath: instancePath + "/violations/" + i16, schemaPath: "#/properties/violations/items/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err205];
              } else {
                vErrors.push(err205);
              }
              errors++;
            }
            if (data84.detail === void 0) {
              const err206 = { instancePath: instancePath + "/violations/" + i16, schemaPath: "#/properties/violations/items/required", keyword: "required", params: { missingProperty: "detail" }, message: "must have required property 'detail'" };
              if (vErrors === null) {
                vErrors = [err206];
              } else {
                vErrors.push(err206);
              }
              errors++;
            }
            for (const key15 in data84) {
              if (!(key15 === "code" || key15 === "quote" || key15 === "detail" || key15 === "blocking")) {
                const err207 = { instancePath: instancePath + "/violations/" + i16, schemaPath: "#/properties/violations/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key15 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err207];
                } else {
                  vErrors.push(err207);
                }
                errors++;
              }
            }
            if (data84.code !== void 0) {
              if (typeof data84.code !== "string") {
                const err208 = { instancePath: instancePath + "/violations/" + i16 + "/code", schemaPath: "#/properties/violations/items/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err208];
                } else {
                  vErrors.push(err208);
                }
                errors++;
              }
            }
            if (data84.quote !== void 0) {
              if (typeof data84.quote !== "string") {
                const err209 = { instancePath: instancePath + "/violations/" + i16 + "/quote", schemaPath: "#/properties/violations/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err209];
                } else {
                  vErrors.push(err209);
                }
                errors++;
              }
            }
            if (data84.detail !== void 0) {
              if (typeof data84.detail !== "string") {
                const err210 = { instancePath: instancePath + "/violations/" + i16 + "/detail", schemaPath: "#/properties/violations/items/properties/detail/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err210];
                } else {
                  vErrors.push(err210);
                }
                errors++;
              }
            }
            if (data84.blocking !== void 0) {
              if (typeof data84.blocking !== "boolean") {
                const err211 = { instancePath: instancePath + "/violations/" + i16 + "/blocking", schemaPath: "#/properties/violations/items/properties/blocking/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err211];
                } else {
                  vErrors.push(err211);
                }
                errors++;
              }
            }
          } else {
            const err212 = { instancePath: instancePath + "/violations/" + i16, schemaPath: "#/properties/violations/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err212];
            } else {
              vErrors.push(err212);
            }
            errors++;
          }
        }
      } else {
        const err213 = { instancePath: instancePath + "/violations", schemaPath: "#/properties/violations/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err213];
        } else {
          vErrors.push(err213);
        }
        errors++;
      }
    }
    if (data.hard_checks !== void 0) {
      let data89 = data.hard_checks;
      if (Array.isArray(data89)) {
        if (data89.length > 200) {
          const err214 = { instancePath: instancePath + "/hard_checks", schemaPath: "#/properties/hard_checks/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err214];
          } else {
            vErrors.push(err214);
          }
          errors++;
        }
        const len17 = data89.length;
        for (let i17 = 0; i17 < len17; i17++) {
          let data90 = data89[i17];
          if (data90 && typeof data90 == "object" && !Array.isArray(data90)) {
            if (data90.event_id === void 0) {
              const err215 = { instancePath: instancePath + "/hard_checks/" + i17, schemaPath: "#/properties/hard_checks/items/required", keyword: "required", params: { missingProperty: "event_id" }, message: "must have required property 'event_id'" };
              if (vErrors === null) {
                vErrors = [err215];
              } else {
                vErrors.push(err215);
              }
              errors++;
            }
            if (data90.status === void 0) {
              const err216 = { instancePath: instancePath + "/hard_checks/" + i17, schemaPath: "#/properties/hard_checks/items/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err216];
              } else {
                vErrors.push(err216);
              }
              errors++;
            }
            for (const key16 in data90) {
              if (!(key16 === "event_id" || key16 === "status" || key16 === "occurrence_ref" || key16 === "quote")) {
                const err217 = { instancePath: instancePath + "/hard_checks/" + i17, schemaPath: "#/properties/hard_checks/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key16 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err217];
                } else {
                  vErrors.push(err217);
                }
                errors++;
              }
            }
            if (data90.event_id !== void 0) {
              let data91 = data90.event_id;
              if (typeof data91 === "string") {
                if (func2(data91) > 200) {
                  const err218 = { instancePath: instancePath + "/hard_checks/" + i17 + "/event_id", schemaPath: "#/properties/hard_checks/items/properties/event_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err218];
                  } else {
                    vErrors.push(err218);
                  }
                  errors++;
                }
                if (func2(data91) < 1) {
                  const err219 = { instancePath: instancePath + "/hard_checks/" + i17 + "/event_id", schemaPath: "#/properties/hard_checks/items/properties/event_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err219];
                  } else {
                    vErrors.push(err219);
                  }
                  errors++;
                }
              } else {
                const err220 = { instancePath: instancePath + "/hard_checks/" + i17 + "/event_id", schemaPath: "#/properties/hard_checks/items/properties/event_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err220];
                } else {
                  vErrors.push(err220);
                }
                errors++;
              }
            }
            if (data90.status !== void 0) {
              let data92 = data90.status;
              if (!(data92 === "fulfilled" || data92 === "not_due" || data92 === "missing" || data92 === "contradicted")) {
                const err221 = { instancePath: instancePath + "/hard_checks/" + i17 + "/status", schemaPath: "#/properties/hard_checks/items/properties/status/enum", keyword: "enum", params: { allowedValues: schema80.properties.hard_checks.items.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err221];
                } else {
                  vErrors.push(err221);
                }
                errors++;
              }
            }
            if (data90.occurrence_ref !== void 0) {
              let data93 = data90.occurrence_ref;
              if (typeof data93 !== "string" && data93 !== null) {
                const err222 = { instancePath: instancePath + "/hard_checks/" + i17 + "/occurrence_ref", schemaPath: "#/properties/hard_checks/items/properties/occurrence_ref/type", keyword: "type", params: { type: schema80.properties.hard_checks.items.properties.occurrence_ref.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err222];
                } else {
                  vErrors.push(err222);
                }
                errors++;
              }
            }
            if (data90.quote !== void 0) {
              let data94 = data90.quote;
              if (typeof data94 !== "string" && data94 !== null) {
                const err223 = { instancePath: instancePath + "/hard_checks/" + i17 + "/quote", schemaPath: "#/properties/hard_checks/items/properties/quote/type", keyword: "type", params: { type: schema80.properties.hard_checks.items.properties.quote.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err223];
                } else {
                  vErrors.push(err223);
                }
                errors++;
              }
            }
          } else {
            const err224 = { instancePath: instancePath + "/hard_checks/" + i17, schemaPath: "#/properties/hard_checks/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err224];
            } else {
              vErrors.push(err224);
            }
            errors++;
          }
        }
      } else {
        const err225 = { instancePath: instancePath + "/hard_checks", schemaPath: "#/properties/hard_checks/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err225];
        } else {
          vErrors.push(err225);
        }
        errors++;
      }
    }
    if (data.scene_entities !== void 0) {
      let data95 = data.scene_entities;
      if (Array.isArray(data95)) {
        if (data95.length > 200) {
          const err226 = { instancePath: instancePath + "/scene_entities", schemaPath: "#/properties/scene_entities/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err226];
          } else {
            vErrors.push(err226);
          }
          errors++;
        }
        const len18 = data95.length;
        for (let i18 = 0; i18 < len18; i18++) {
          if (typeof data95[i18] !== "string") {
            const err227 = { instancePath: instancePath + "/scene_entities/" + i18, schemaPath: "#/properties/scene_entities/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err227];
            } else {
              vErrors.push(err227);
            }
            errors++;
          }
        }
      } else {
        const err228 = { instancePath: instancePath + "/scene_entities", schemaPath: "#/properties/scene_entities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err228];
        } else {
          vErrors.push(err228);
        }
        errors++;
      }
    }
    if (data.summary !== void 0) {
      if (typeof data.summary !== "string") {
        const err229 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err229];
        } else {
          vErrors.push(err229);
        }
        errors++;
      }
    }
  } else {
    const err230 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err230];
    } else {
      vErrors.push(err230);
    }
    errors++;
  }
  validate55.errors = vErrors;
  return errors === 0;
}
validate55.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema81 = { "type": "object", "properties": { "statements": { "type": "array", "items": { "type": "object", "properties": { "kind": { "enum": ["asserted_fact", "attempted_action", "spoken_dialogue", "belief", "hypothetical", "ooc_config_request", "time_proposal", "participation_decline"] }, "quote": { "type": "string" }, "summary": { "type": "string" }, "entities": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "facts": { "type": "array", "items": { "type": "object", "properties": { "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] } }, "required": ["entity_id", "predicate", "value"], "additionalProperties": false }, "maxItems": 200 }, "event_id": { "type": ["string", "null"] }, "time": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }] }, "ambiguous": { "type": "boolean" } }, "required": ["kind", "quote", "summary"], "additionalProperties": false }, "maxItems": 200 }, "references": { "type": "array", "items": { "type": "object", "properties": { "phrase": { "type": "string" }, "quote": { "type": "string" }, "kind": { "enum": ["entity", "event"] }, "mode": { "enum": ["direct", "indirect", "alias", "pronoun"] }, "candidates": { "type": "array", "items": { "type": "string" }, "maxItems": 200 } }, "required": ["phrase", "quote", "kind"], "additionalProperties": false }, "maxItems": 200 }, "scene_entities": { "type": "array", "items": { "type": "string" }, "maxItems": 200 } }, "required": ["statements", "references"], "additionalProperties": false, "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:task:extract-user", "title": "Canon Engine task output: extract-user" };
function validate56(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate56.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.statements === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "statements" }, message: "must have required property 'statements'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.references === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "references" }, message: "must have required property 'references'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "statements" || key0 === "references" || key0 === "scene_entities")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.statements !== void 0) {
      let data0 = data.statements;
      if (Array.isArray(data0)) {
        if (data0.length > 200) {
          const err3 = { instancePath: instancePath + "/statements", schemaPath: "#/properties/statements/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.kind === void 0) {
              const err4 = { instancePath: instancePath + "/statements/" + i0, schemaPath: "#/properties/statements/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1.quote === void 0) {
              const err5 = { instancePath: instancePath + "/statements/" + i0, schemaPath: "#/properties/statements/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.summary === void 0) {
              const err6 = { instancePath: instancePath + "/statements/" + i0, schemaPath: "#/properties/statements/items/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "kind" || key1 === "quote" || key1 === "summary" || key1 === "entities" || key1 === "facts" || key1 === "event_id" || key1 === "time" || key1 === "ambiguous")) {
                const err7 = { instancePath: instancePath + "/statements/" + i0, schemaPath: "#/properties/statements/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            if (data1.kind !== void 0) {
              let data2 = data1.kind;
              if (!(data2 === "asserted_fact" || data2 === "attempted_action" || data2 === "spoken_dialogue" || data2 === "belief" || data2 === "hypothetical" || data2 === "ooc_config_request" || data2 === "time_proposal" || data2 === "participation_decline")) {
                const err8 = { instancePath: instancePath + "/statements/" + i0 + "/kind", schemaPath: "#/properties/statements/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema81.properties.statements.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
            if (data1.quote !== void 0) {
              if (typeof data1.quote !== "string") {
                const err9 = { instancePath: instancePath + "/statements/" + i0 + "/quote", schemaPath: "#/properties/statements/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            }
            if (data1.summary !== void 0) {
              if (typeof data1.summary !== "string") {
                const err10 = { instancePath: instancePath + "/statements/" + i0 + "/summary", schemaPath: "#/properties/statements/items/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
            if (data1.entities !== void 0) {
              let data5 = data1.entities;
              if (Array.isArray(data5)) {
                if (data5.length > 200) {
                  const err11 = { instancePath: instancePath + "/statements/" + i0 + "/entities", schemaPath: "#/properties/statements/items/properties/entities/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                const len1 = data5.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data5[i1] !== "string") {
                    const err12 = { instancePath: instancePath + "/statements/" + i0 + "/entities/" + i1, schemaPath: "#/properties/statements/items/properties/entities/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
              } else {
                const err13 = { instancePath: instancePath + "/statements/" + i0 + "/entities", schemaPath: "#/properties/statements/items/properties/entities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data1.facts !== void 0) {
              let data7 = data1.facts;
              if (Array.isArray(data7)) {
                if (data7.length > 200) {
                  const err14 = { instancePath: instancePath + "/statements/" + i0 + "/facts", schemaPath: "#/properties/statements/items/properties/facts/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                const len2 = data7.length;
                for (let i2 = 0; i2 < len2; i2++) {
                  let data8 = data7[i2];
                  if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                    if (data8.entity_id === void 0) {
                      const err15 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2, schemaPath: "#/properties/statements/items/properties/facts/items/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
                      if (vErrors === null) {
                        vErrors = [err15];
                      } else {
                        vErrors.push(err15);
                      }
                      errors++;
                    }
                    if (data8.predicate === void 0) {
                      const err16 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2, schemaPath: "#/properties/statements/items/properties/facts/items/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
                      if (vErrors === null) {
                        vErrors = [err16];
                      } else {
                        vErrors.push(err16);
                      }
                      errors++;
                    }
                    if (data8.value === void 0) {
                      const err17 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2, schemaPath: "#/properties/statements/items/properties/facts/items/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
                      if (vErrors === null) {
                        vErrors = [err17];
                      } else {
                        vErrors.push(err17);
                      }
                      errors++;
                    }
                    for (const key2 in data8) {
                      if (!(key2 === "entity_id" || key2 === "predicate" || key2 === "value")) {
                        const err18 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2, schemaPath: "#/properties/statements/items/properties/facts/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err18];
                        } else {
                          vErrors.push(err18);
                        }
                        errors++;
                      }
                    }
                    if (data8.entity_id !== void 0) {
                      let data9 = data8.entity_id;
                      if (typeof data9 === "string") {
                        if (func2(data9) > 200) {
                          const err19 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/entity_id", schemaPath: "#/properties/statements/items/properties/facts/items/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                          if (vErrors === null) {
                            vErrors = [err19];
                          } else {
                            vErrors.push(err19);
                          }
                          errors++;
                        }
                        if (func2(data9) < 1) {
                          const err20 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/entity_id", schemaPath: "#/properties/statements/items/properties/facts/items/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err20];
                          } else {
                            vErrors.push(err20);
                          }
                          errors++;
                        }
                      } else {
                        const err21 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/entity_id", schemaPath: "#/properties/statements/items/properties/facts/items/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err21];
                        } else {
                          vErrors.push(err21);
                        }
                        errors++;
                      }
                    }
                    if (data8.predicate !== void 0) {
                      let data10 = data8.predicate;
                      if (typeof data10 === "string") {
                        if (func2(data10) > 200) {
                          const err22 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/predicate", schemaPath: "#/properties/statements/items/properties/facts/items/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                          if (vErrors === null) {
                            vErrors = [err22];
                          } else {
                            vErrors.push(err22);
                          }
                          errors++;
                        }
                        if (func2(data10) < 1) {
                          const err23 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/predicate", schemaPath: "#/properties/statements/items/properties/facts/items/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err23];
                          } else {
                            vErrors.push(err23);
                          }
                          errors++;
                        }
                      } else {
                        const err24 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/predicate", schemaPath: "#/properties/statements/items/properties/facts/items/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err24];
                        } else {
                          vErrors.push(err24);
                        }
                        errors++;
                      }
                    }
                    if (data8.value !== void 0) {
                      let data11 = data8.value;
                      const _errs26 = errors;
                      let valid9 = false;
                      let passing0 = null;
                      const _errs27 = errors;
                      if (typeof data11 !== "boolean") {
                        const err25 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/value", schemaPath: "#/properties/statements/items/properties/facts/items/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                        if (vErrors === null) {
                          vErrors = [err25];
                        } else {
                          vErrors.push(err25);
                        }
                        errors++;
                      }
                      var _valid0 = _errs27 === errors;
                      if (_valid0) {
                        valid9 = true;
                        passing0 = 0;
                      }
                      const _errs29 = errors;
                      if (!(typeof data11 == "number")) {
                        const err26 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/value", schemaPath: "#/properties/statements/items/properties/facts/items/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err26];
                        } else {
                          vErrors.push(err26);
                        }
                        errors++;
                      }
                      var _valid0 = _errs29 === errors;
                      if (_valid0 && valid9) {
                        valid9 = false;
                        passing0 = [passing0, 1];
                      } else {
                        if (_valid0) {
                          valid9 = true;
                          passing0 = 1;
                        }
                        const _errs31 = errors;
                        if (typeof data11 !== "string") {
                          const err27 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/value", schemaPath: "#/properties/statements/items/properties/facts/items/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err27];
                          } else {
                            vErrors.push(err27);
                          }
                          errors++;
                        }
                        var _valid0 = _errs31 === errors;
                        if (_valid0 && valid9) {
                          valid9 = false;
                          passing0 = [passing0, 2];
                        } else {
                          if (_valid0) {
                            valid9 = true;
                            passing0 = 2;
                          }
                          const _errs33 = errors;
                          if (Array.isArray(data11)) {
                            const len3 = data11.length;
                            for (let i3 = 0; i3 < len3; i3++) {
                              if (typeof data11[i3] !== "string") {
                                const err28 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/value/" + i3, schemaPath: "#/properties/statements/items/properties/facts/items/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err28];
                                } else {
                                  vErrors.push(err28);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err29 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/value", schemaPath: "#/properties/statements/items/properties/facts/items/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                            if (vErrors === null) {
                              vErrors = [err29];
                            } else {
                              vErrors.push(err29);
                            }
                            errors++;
                          }
                          var _valid0 = _errs33 === errors;
                          if (_valid0 && valid9) {
                            valid9 = false;
                            passing0 = [passing0, 3];
                          } else {
                            if (_valid0) {
                              valid9 = true;
                              passing0 = 3;
                            }
                          }
                        }
                      }
                      if (!valid9) {
                        const err30 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2 + "/value", schemaPath: "#/properties/statements/items/properties/facts/items/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
                        if (vErrors === null) {
                          vErrors = [err30];
                        } else {
                          vErrors.push(err30);
                        }
                        errors++;
                      } else {
                        errors = _errs26;
                        if (vErrors !== null) {
                          if (_errs26) {
                            vErrors.length = _errs26;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                    }
                  } else {
                    const err31 = { instancePath: instancePath + "/statements/" + i0 + "/facts/" + i2, schemaPath: "#/properties/statements/items/properties/facts/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                }
              } else {
                const err32 = { instancePath: instancePath + "/statements/" + i0 + "/facts", schemaPath: "#/properties/statements/items/properties/facts/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
            if (data1.event_id !== void 0) {
              let data13 = data1.event_id;
              if (typeof data13 !== "string" && data13 !== null) {
                const err33 = { instancePath: instancePath + "/statements/" + i0 + "/event_id", schemaPath: "#/properties/statements/items/properties/event_id/type", keyword: "type", params: { type: schema81.properties.statements.items.properties.event_id.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
            if (data1.time !== void 0) {
              let data14 = data1.time;
              const _errs40 = errors;
              let valid12 = false;
              let passing1 = null;
              const _errs41 = errors;
              if (data14 !== null) {
                const err34 = { instancePath: instancePath + "/statements/" + i0 + "/time", schemaPath: "#/properties/statements/items/properties/time/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
              var _valid1 = _errs41 === errors;
              if (_valid1) {
                valid12 = true;
                passing1 = 0;
              }
              const _errs43 = errors;
              if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
                if (data14.day === void 0) {
                  const err35 = { instancePath: instancePath + "/statements/" + i0 + "/time", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                if (data14.minute === void 0) {
                  const err36 = { instancePath: instancePath + "/statements/" + i0 + "/time", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                for (const key3 in data14) {
                  if (!(key3 === "day" || key3 === "minute")) {
                    const err37 = { instancePath: instancePath + "/statements/" + i0 + "/time", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
                if (data14.day !== void 0) {
                  let data15 = data14.day;
                  if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)))) {
                    const err38 = { instancePath: instancePath + "/statements/" + i0 + "/time/day", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                }
                if (data14.minute !== void 0) {
                  let data16 = data14.minute;
                  if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)))) {
                    const err39 = { instancePath: instancePath + "/statements/" + i0 + "/time/minute", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                  if (typeof data16 == "number") {
                    if (data16 > 1439 || isNaN(data16)) {
                      const err40 = { instancePath: instancePath + "/statements/" + i0 + "/time/minute", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                      if (vErrors === null) {
                        vErrors = [err40];
                      } else {
                        vErrors.push(err40);
                      }
                      errors++;
                    }
                    if (data16 < 0 || isNaN(data16)) {
                      const err41 = { instancePath: instancePath + "/statements/" + i0 + "/time/minute", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err41];
                      } else {
                        vErrors.push(err41);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err42 = { instancePath: instancePath + "/statements/" + i0 + "/time", schemaPath: "#/properties/statements/items/properties/time/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              var _valid1 = _errs43 === errors;
              if (_valid1 && valid12) {
                valid12 = false;
                passing1 = [passing1, 1];
              } else {
                if (_valid1) {
                  valid12 = true;
                  passing1 = 1;
                }
              }
              if (!valid12) {
                const err43 = { instancePath: instancePath + "/statements/" + i0 + "/time", schemaPath: "#/properties/statements/items/properties/time/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              } else {
                errors = _errs40;
                if (vErrors !== null) {
                  if (_errs40) {
                    vErrors.length = _errs40;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data1.ambiguous !== void 0) {
              if (typeof data1.ambiguous !== "boolean") {
                const err44 = { instancePath: instancePath + "/statements/" + i0 + "/ambiguous", schemaPath: "#/properties/statements/items/properties/ambiguous/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
          } else {
            const err45 = { instancePath: instancePath + "/statements/" + i0, schemaPath: "#/properties/statements/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
        }
      } else {
        const err46 = { instancePath: instancePath + "/statements", schemaPath: "#/properties/statements/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err46];
        } else {
          vErrors.push(err46);
        }
        errors++;
      }
    }
    if (data.references !== void 0) {
      let data18 = data.references;
      if (Array.isArray(data18)) {
        if (data18.length > 200) {
          const err47 = { instancePath: instancePath + "/references", schemaPath: "#/properties/references/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err47];
          } else {
            vErrors.push(err47);
          }
          errors++;
        }
        const len4 = data18.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data19 = data18[i4];
          if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
            if (data19.phrase === void 0) {
              const err48 = { instancePath: instancePath + "/references/" + i4, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "phrase" }, message: "must have required property 'phrase'" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
            if (data19.quote === void 0) {
              const err49 = { instancePath: instancePath + "/references/" + i4, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "quote" }, message: "must have required property 'quote'" };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
            if (data19.kind === void 0) {
              const err50 = { instancePath: instancePath + "/references/" + i4, schemaPath: "#/properties/references/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
            for (const key4 in data19) {
              if (!(key4 === "phrase" || key4 === "quote" || key4 === "kind" || key4 === "mode" || key4 === "candidates")) {
                const err51 = { instancePath: instancePath + "/references/" + i4, schemaPath: "#/properties/references/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            if (data19.phrase !== void 0) {
              if (typeof data19.phrase !== "string") {
                const err52 = { instancePath: instancePath + "/references/" + i4 + "/phrase", schemaPath: "#/properties/references/items/properties/phrase/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
            }
            if (data19.quote !== void 0) {
              if (typeof data19.quote !== "string") {
                const err53 = { instancePath: instancePath + "/references/" + i4 + "/quote", schemaPath: "#/properties/references/items/properties/quote/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err53];
                } else {
                  vErrors.push(err53);
                }
                errors++;
              }
            }
            if (data19.kind !== void 0) {
              let data22 = data19.kind;
              if (!(data22 === "entity" || data22 === "event")) {
                const err54 = { instancePath: instancePath + "/references/" + i4 + "/kind", schemaPath: "#/properties/references/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema81.properties.references.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            }
            if (data19.mode !== void 0) {
              let data23 = data19.mode;
              if (!(data23 === "direct" || data23 === "indirect" || data23 === "alias" || data23 === "pronoun")) {
                const err55 = { instancePath: instancePath + "/references/" + i4 + "/mode", schemaPath: "#/properties/references/items/properties/mode/enum", keyword: "enum", params: { allowedValues: schema81.properties.references.items.properties.mode.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
            }
            if (data19.candidates !== void 0) {
              let data24 = data19.candidates;
              if (Array.isArray(data24)) {
                if (data24.length > 200) {
                  const err56 = { instancePath: instancePath + "/references/" + i4 + "/candidates", schemaPath: "#/properties/references/items/properties/candidates/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
                const len5 = data24.length;
                for (let i5 = 0; i5 < len5; i5++) {
                  if (typeof data24[i5] !== "string") {
                    const err57 = { instancePath: instancePath + "/references/" + i4 + "/candidates/" + i5, schemaPath: "#/properties/references/items/properties/candidates/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err57];
                    } else {
                      vErrors.push(err57);
                    }
                    errors++;
                  }
                }
              } else {
                const err58 = { instancePath: instancePath + "/references/" + i4 + "/candidates", schemaPath: "#/properties/references/items/properties/candidates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
            }
          } else {
            const err59 = { instancePath: instancePath + "/references/" + i4, schemaPath: "#/properties/references/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
      } else {
        const err60 = { instancePath: instancePath + "/references", schemaPath: "#/properties/references/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
    }
    if (data.scene_entities !== void 0) {
      let data26 = data.scene_entities;
      if (Array.isArray(data26)) {
        if (data26.length > 200) {
          const err61 = { instancePath: instancePath + "/scene_entities", schemaPath: "#/properties/scene_entities/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err61];
          } else {
            vErrors.push(err61);
          }
          errors++;
        }
        const len6 = data26.length;
        for (let i6 = 0; i6 < len6; i6++) {
          if (typeof data26[i6] !== "string") {
            const err62 = { instancePath: instancePath + "/scene_entities/" + i6, schemaPath: "#/properties/scene_entities/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err62];
            } else {
              vErrors.push(err62);
            }
            errors++;
          }
        }
      } else {
        const err63 = { instancePath: instancePath + "/scene_entities", schemaPath: "#/properties/scene_entities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
    }
  } else {
    const err64 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err64];
    } else {
      vErrors.push(err64);
    }
    errors++;
  }
  validate56.errors = vErrors;
  return errors === 0;
}
validate56.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema82 = { "type": "object", "properties": { "changed": { "type": "array", "items": { "type": "object", "properties": { "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 } }, "required": ["entity_id", "predicate"], "additionalProperties": false }, "maxItems": 200 }, "affected_anchors": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "affected_steps": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "scope": { "enum": ["local", "global", "unknown"] }, "severity": { "enum": ["none", "minor", "major"] }, "replan": { "type": "boolean" }, "explanation": { "type": "string" } }, "required": ["changed", "affected_anchors", "affected_steps", "scope", "severity", "replan", "explanation"], "additionalProperties": false, "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:task:impact", "title": "Canon Engine task output: impact" };
function validate57(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate57.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.changed === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "changed" }, message: "must have required property 'changed'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.affected_anchors === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "affected_anchors" }, message: "must have required property 'affected_anchors'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.affected_steps === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "affected_steps" }, message: "must have required property 'affected_steps'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.scope === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.severity === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "severity" }, message: "must have required property 'severity'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.replan === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "replan" }, message: "must have required property 'replan'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.explanation === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "explanation" }, message: "must have required property 'explanation'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "changed" || key0 === "affected_anchors" || key0 === "affected_steps" || key0 === "scope" || key0 === "severity" || key0 === "replan" || key0 === "explanation")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.changed !== void 0) {
      let data0 = data.changed;
      if (Array.isArray(data0)) {
        if (data0.length > 200) {
          const err8 = { instancePath: instancePath + "/changed", schemaPath: "#/properties/changed/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.entity_id === void 0) {
              const err9 = { instancePath: instancePath + "/changed/" + i0, schemaPath: "#/properties/changed/items/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data1.predicate === void 0) {
              const err10 = { instancePath: instancePath + "/changed/" + i0, schemaPath: "#/properties/changed/items/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "entity_id" || key1 === "predicate")) {
                const err11 = { instancePath: instancePath + "/changed/" + i0, schemaPath: "#/properties/changed/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.entity_id !== void 0) {
              let data2 = data1.entity_id;
              if (typeof data2 === "string") {
                if (func2(data2) > 200) {
                  const err12 = { instancePath: instancePath + "/changed/" + i0 + "/entity_id", schemaPath: "#/properties/changed/items/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (func2(data2) < 1) {
                  const err13 = { instancePath: instancePath + "/changed/" + i0 + "/entity_id", schemaPath: "#/properties/changed/items/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              } else {
                const err14 = { instancePath: instancePath + "/changed/" + i0 + "/entity_id", schemaPath: "#/properties/changed/items/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data1.predicate !== void 0) {
              let data3 = data1.predicate;
              if (typeof data3 === "string") {
                if (func2(data3) > 200) {
                  const err15 = { instancePath: instancePath + "/changed/" + i0 + "/predicate", schemaPath: "#/properties/changed/items/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (func2(data3) < 1) {
                  const err16 = { instancePath: instancePath + "/changed/" + i0 + "/predicate", schemaPath: "#/properties/changed/items/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              } else {
                const err17 = { instancePath: instancePath + "/changed/" + i0 + "/predicate", schemaPath: "#/properties/changed/items/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/changed/" + i0, schemaPath: "#/properties/changed/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath: instancePath + "/changed", schemaPath: "#/properties/changed/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.affected_anchors !== void 0) {
      let data4 = data.affected_anchors;
      if (Array.isArray(data4)) {
        if (data4.length > 200) {
          const err20 = { instancePath: instancePath + "/affected_anchors", schemaPath: "#/properties/affected_anchors/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        const len1 = data4.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (typeof data4[i1] !== "string") {
            const err21 = { instancePath: instancePath + "/affected_anchors/" + i1, schemaPath: "#/properties/affected_anchors/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
      } else {
        const err22 = { instancePath: instancePath + "/affected_anchors", schemaPath: "#/properties/affected_anchors/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.affected_steps !== void 0) {
      let data6 = data.affected_steps;
      if (Array.isArray(data6)) {
        if (data6.length > 200) {
          const err23 = { instancePath: instancePath + "/affected_steps", schemaPath: "#/properties/affected_steps/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        const len2 = data6.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (typeof data6[i2] !== "string") {
            const err24 = { instancePath: instancePath + "/affected_steps/" + i2, schemaPath: "#/properties/affected_steps/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
      } else {
        const err25 = { instancePath: instancePath + "/affected_steps", schemaPath: "#/properties/affected_steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.scope !== void 0) {
      let data8 = data.scope;
      if (!(data8 === "local" || data8 === "global" || data8 === "unknown")) {
        const err26 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/enum", keyword: "enum", params: { allowedValues: schema82.properties.scope.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.severity !== void 0) {
      let data9 = data.severity;
      if (!(data9 === "none" || data9 === "minor" || data9 === "major")) {
        const err27 = { instancePath: instancePath + "/severity", schemaPath: "#/properties/severity/enum", keyword: "enum", params: { allowedValues: schema82.properties.severity.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.replan !== void 0) {
      if (typeof data.replan !== "boolean") {
        const err28 = { instancePath: instancePath + "/replan", schemaPath: "#/properties/replan/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.explanation !== void 0) {
      if (typeof data.explanation !== "string") {
        const err29 = { instancePath: instancePath + "/explanation", schemaPath: "#/properties/explanation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
  } else {
    const err30 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err30];
    } else {
      vErrors.push(err30);
    }
    errors++;
  }
  validate57.errors = vErrors;
  return errors === 0;
}
validate57.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema83 = { "type": "object", "properties": { "rationale": { "type": "string" }, "protected_anchor_ids": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "assumptions": { "type": "array", "items": { "type": "object", "properties": { "text": { "type": "string" }, "fact": { "oneOf": [{ "type": "null" }, { "type": "object", "properties": { "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] } }, "required": ["entity_id", "predicate", "value"], "additionalProperties": false }] } }, "required": ["text", "fact"], "additionalProperties": false }, "maxItems": 200 }, "risks": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "mode": { "enum": ["NORMAL", "FORCED_CONVERGENCE"] }, "steps": { "type": "array", "items": { "type": "object", "properties": { "step_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "actors": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "targets": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "earliest": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "latest": { "type": "object", "properties": { "day": { "type": "integer" }, "minute": { "type": "integer", "minimum": 0, "maximum": 1439 } }, "required": ["day", "minute"], "additionalProperties": false }, "prerequisites": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "action": { "type": "string" }, "intended_effects": { "type": "array", "items": { "type": "object", "properties": { "entity_id": { "type": "string", "minLength": 1, "maxLength": 200 }, "predicate": { "type": "string", "minLength": 1, "maxLength": 200 }, "value": { "oneOf": [{ "type": "boolean" }, { "type": "number" }, { "type": "string" }, { "type": "array", "items": { "type": "string" } }] } }, "required": ["entity_id", "predicate", "value"], "additionalProperties": false }, "maxItems": 200 }, "visibility": { "enum": ["public", "restricted", "secret"] }, "knowers": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "depends_on": { "type": "array", "items": { "type": "string" }, "maxItems": 200 }, "means": { "enum": ["ordinary", "extraordinary"] }, "serves_anchor": { "type": ["string", "null"] }, "requires_player_consent": { "type": "boolean" } }, "required": ["step_id", "actors", "earliest", "latest", "action", "intended_effects", "means", "serves_anchor", "requires_player_consent"], "additionalProperties": false }, "maxItems": 40 }, "inadequacy_note": { "type": "string" } }, "required": ["rationale", "protected_anchor_ids", "assumptions", "risks", "mode", "steps"], "additionalProperties": false, "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:canon-engine:task:plan", "title": "Canon Engine task output: plan" };
function validate58(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate58.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.rationale === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rationale" }, message: "must have required property 'rationale'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.protected_anchor_ids === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protected_anchor_ids" }, message: "must have required property 'protected_anchor_ids'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.assumptions === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "assumptions" }, message: "must have required property 'assumptions'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.risks === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "risks" }, message: "must have required property 'risks'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.mode === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.steps === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "steps" }, message: "must have required property 'steps'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "rationale" || key0 === "protected_anchor_ids" || key0 === "assumptions" || key0 === "risks" || key0 === "mode" || key0 === "steps" || key0 === "inadequacy_note")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.rationale !== void 0) {
      if (typeof data.rationale !== "string") {
        const err7 = { instancePath: instancePath + "/rationale", schemaPath: "#/properties/rationale/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.protected_anchor_ids !== void 0) {
      let data1 = data.protected_anchor_ids;
      if (Array.isArray(data1)) {
        if (data1.length > 200) {
          const err8 = { instancePath: instancePath + "/protected_anchor_ids", schemaPath: "#/properties/protected_anchor_ids/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (typeof data1[i0] !== "string") {
            const err9 = { instancePath: instancePath + "/protected_anchor_ids/" + i0, schemaPath: "#/properties/protected_anchor_ids/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
      } else {
        const err10 = { instancePath: instancePath + "/protected_anchor_ids", schemaPath: "#/properties/protected_anchor_ids/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.assumptions !== void 0) {
      let data3 = data.assumptions;
      if (Array.isArray(data3)) {
        if (data3.length > 200) {
          const err11 = { instancePath: instancePath + "/assumptions", schemaPath: "#/properties/assumptions/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        const len1 = data3.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data4 = data3[i1];
          if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
            if (data4.text === void 0) {
              const err12 = { instancePath: instancePath + "/assumptions/" + i1, schemaPath: "#/properties/assumptions/items/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data4.fact === void 0) {
              const err13 = { instancePath: instancePath + "/assumptions/" + i1, schemaPath: "#/properties/assumptions/items/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            for (const key1 in data4) {
              if (!(key1 === "text" || key1 === "fact")) {
                const err14 = { instancePath: instancePath + "/assumptions/" + i1, schemaPath: "#/properties/assumptions/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data4.text !== void 0) {
              if (typeof data4.text !== "string") {
                const err15 = { instancePath: instancePath + "/assumptions/" + i1 + "/text", schemaPath: "#/properties/assumptions/items/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data4.fact !== void 0) {
              let data6 = data4.fact;
              const _errs16 = errors;
              let valid6 = false;
              let passing0 = null;
              const _errs17 = errors;
              if (data6 !== null) {
                const err16 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              var _valid0 = _errs17 === errors;
              if (_valid0) {
                valid6 = true;
                passing0 = 0;
              }
              const _errs19 = errors;
              if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
                if (data6.entity_id === void 0) {
                  const err17 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (data6.predicate === void 0) {
                  const err18 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
                if (data6.value === void 0) {
                  const err19 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                for (const key2 in data6) {
                  if (!(key2 === "entity_id" || key2 === "predicate" || key2 === "value")) {
                    const err20 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                }
                if (data6.entity_id !== void 0) {
                  let data7 = data6.entity_id;
                  if (typeof data7 === "string") {
                    if (func2(data7) > 200) {
                      const err21 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/entity_id", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                    if (func2(data7) < 1) {
                      const err22 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/entity_id", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                    }
                  } else {
                    const err23 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/entity_id", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                }
                if (data6.predicate !== void 0) {
                  let data8 = data6.predicate;
                  if (typeof data8 === "string") {
                    if (func2(data8) > 200) {
                      const err24 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/predicate", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                    if (func2(data8) < 1) {
                      const err25 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/predicate", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err25];
                      } else {
                        vErrors.push(err25);
                      }
                      errors++;
                    }
                  } else {
                    const err26 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/predicate", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
                if (data6.value !== void 0) {
                  let data9 = data6.value;
                  const _errs27 = errors;
                  let valid8 = false;
                  let passing1 = null;
                  const _errs28 = errors;
                  if (typeof data9 !== "boolean") {
                    const err27 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/value", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                  var _valid1 = _errs28 === errors;
                  if (_valid1) {
                    valid8 = true;
                    passing1 = 0;
                  }
                  const _errs30 = errors;
                  if (!(typeof data9 == "number")) {
                    const err28 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/value", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                  var _valid1 = _errs30 === errors;
                  if (_valid1 && valid8) {
                    valid8 = false;
                    passing1 = [passing1, 1];
                  } else {
                    if (_valid1) {
                      valid8 = true;
                      passing1 = 1;
                    }
                    const _errs32 = errors;
                    if (typeof data9 !== "string") {
                      const err29 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/value", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err29];
                      } else {
                        vErrors.push(err29);
                      }
                      errors++;
                    }
                    var _valid1 = _errs32 === errors;
                    if (_valid1 && valid8) {
                      valid8 = false;
                      passing1 = [passing1, 2];
                    } else {
                      if (_valid1) {
                        valid8 = true;
                        passing1 = 2;
                      }
                      const _errs34 = errors;
                      if (Array.isArray(data9)) {
                        const len2 = data9.length;
                        for (let i2 = 0; i2 < len2; i2++) {
                          if (typeof data9[i2] !== "string") {
                            const err30 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/value/" + i2, schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err30];
                            } else {
                              vErrors.push(err30);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err31 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/value", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err31];
                        } else {
                          vErrors.push(err31);
                        }
                        errors++;
                      }
                      var _valid1 = _errs34 === errors;
                      if (_valid1 && valid8) {
                        valid8 = false;
                        passing1 = [passing1, 3];
                      } else {
                        if (_valid1) {
                          valid8 = true;
                          passing1 = 3;
                        }
                      }
                    }
                  }
                  if (!valid8) {
                    const err32 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact/value", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  } else {
                    errors = _errs27;
                    if (vErrors !== null) {
                      if (_errs27) {
                        vErrors.length = _errs27;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                }
              } else {
                const err33 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
              var _valid0 = _errs19 === errors;
              if (_valid0 && valid6) {
                valid6 = false;
                passing0 = [passing0, 1];
              } else {
                if (_valid0) {
                  valid6 = true;
                  passing0 = 1;
                }
              }
              if (!valid6) {
                const err34 = { instancePath: instancePath + "/assumptions/" + i1 + "/fact", schemaPath: "#/properties/assumptions/items/properties/fact/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              } else {
                errors = _errs16;
                if (vErrors !== null) {
                  if (_errs16) {
                    vErrors.length = _errs16;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err35 = { instancePath: instancePath + "/assumptions/" + i1, schemaPath: "#/properties/assumptions/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
      } else {
        const err36 = { instancePath: instancePath + "/assumptions", schemaPath: "#/properties/assumptions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.risks !== void 0) {
      let data11 = data.risks;
      if (Array.isArray(data11)) {
        if (data11.length > 200) {
          const err37 = { instancePath: instancePath + "/risks", schemaPath: "#/properties/risks/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        const len3 = data11.length;
        for (let i3 = 0; i3 < len3; i3++) {
          if (typeof data11[i3] !== "string") {
            const err38 = { instancePath: instancePath + "/risks/" + i3, schemaPath: "#/properties/risks/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
      } else {
        const err39 = { instancePath: instancePath + "/risks", schemaPath: "#/properties/risks/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
    }
    if (data.mode !== void 0) {
      let data13 = data.mode;
      if (!(data13 === "NORMAL" || data13 === "FORCED_CONVERGENCE")) {
        const err40 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema83.properties.mode.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    if (data.steps !== void 0) {
      let data14 = data.steps;
      if (Array.isArray(data14)) {
        if (data14.length > 40) {
          const err41 = { instancePath: instancePath + "/steps", schemaPath: "#/properties/steps/maxItems", keyword: "maxItems", params: { limit: 40 }, message: "must NOT have more than 40 items" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        const len4 = data14.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data15 = data14[i4];
          if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
            if (data15.step_id === void 0) {
              const err42 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "step_id" }, message: "must have required property 'step_id'" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
            if (data15.actors === void 0) {
              const err43 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "actors" }, message: "must have required property 'actors'" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (data15.earliest === void 0) {
              const err44 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "earliest" }, message: "must have required property 'earliest'" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            if (data15.latest === void 0) {
              const err45 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "latest" }, message: "must have required property 'latest'" };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
            if (data15.action === void 0) {
              const err46 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            if (data15.intended_effects === void 0) {
              const err47 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "intended_effects" }, message: "must have required property 'intended_effects'" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
            if (data15.means === void 0) {
              const err48 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "means" }, message: "must have required property 'means'" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
            if (data15.serves_anchor === void 0) {
              const err49 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "serves_anchor" }, message: "must have required property 'serves_anchor'" };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
            if (data15.requires_player_consent === void 0) {
              const err50 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/required", keyword: "required", params: { missingProperty: "requires_player_consent" }, message: "must have required property 'requires_player_consent'" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
            for (const key3 in data15) {
              if (!func1.call(schema83.properties.steps.items.properties, key3)) {
                const err51 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            if (data15.step_id !== void 0) {
              let data16 = data15.step_id;
              if (typeof data16 === "string") {
                if (func2(data16) > 200) {
                  const err52 = { instancePath: instancePath + "/steps/" + i4 + "/step_id", schemaPath: "#/properties/steps/items/properties/step_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err52];
                  } else {
                    vErrors.push(err52);
                  }
                  errors++;
                }
                if (func2(data16) < 1) {
                  const err53 = { instancePath: instancePath + "/steps/" + i4 + "/step_id", schemaPath: "#/properties/steps/items/properties/step_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
              } else {
                const err54 = { instancePath: instancePath + "/steps/" + i4 + "/step_id", schemaPath: "#/properties/steps/items/properties/step_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            }
            if (data15.actors !== void 0) {
              let data17 = data15.actors;
              if (Array.isArray(data17)) {
                if (data17.length > 200) {
                  const err55 = { instancePath: instancePath + "/steps/" + i4 + "/actors", schemaPath: "#/properties/steps/items/properties/actors/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err55];
                  } else {
                    vErrors.push(err55);
                  }
                  errors++;
                }
                const len5 = data17.length;
                for (let i5 = 0; i5 < len5; i5++) {
                  if (typeof data17[i5] !== "string") {
                    const err56 = { instancePath: instancePath + "/steps/" + i4 + "/actors/" + i5, schemaPath: "#/properties/steps/items/properties/actors/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err56];
                    } else {
                      vErrors.push(err56);
                    }
                    errors++;
                  }
                }
              } else {
                const err57 = { instancePath: instancePath + "/steps/" + i4 + "/actors", schemaPath: "#/properties/steps/items/properties/actors/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
            }
            if (data15.targets !== void 0) {
              let data19 = data15.targets;
              if (Array.isArray(data19)) {
                if (data19.length > 200) {
                  const err58 = { instancePath: instancePath + "/steps/" + i4 + "/targets", schemaPath: "#/properties/steps/items/properties/targets/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err58];
                  } else {
                    vErrors.push(err58);
                  }
                  errors++;
                }
                const len6 = data19.length;
                for (let i6 = 0; i6 < len6; i6++) {
                  if (typeof data19[i6] !== "string") {
                    const err59 = { instancePath: instancePath + "/steps/" + i4 + "/targets/" + i6, schemaPath: "#/properties/steps/items/properties/targets/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err59];
                    } else {
                      vErrors.push(err59);
                    }
                    errors++;
                  }
                }
              } else {
                const err60 = { instancePath: instancePath + "/steps/" + i4 + "/targets", schemaPath: "#/properties/steps/items/properties/targets/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err60];
                } else {
                  vErrors.push(err60);
                }
                errors++;
              }
            }
            if (data15.earliest !== void 0) {
              let data21 = data15.earliest;
              if (data21 && typeof data21 == "object" && !Array.isArray(data21)) {
                if (data21.day === void 0) {
                  const err61 = { instancePath: instancePath + "/steps/" + i4 + "/earliest", schemaPath: "#/properties/steps/items/properties/earliest/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                  if (vErrors === null) {
                    vErrors = [err61];
                  } else {
                    vErrors.push(err61);
                  }
                  errors++;
                }
                if (data21.minute === void 0) {
                  const err62 = { instancePath: instancePath + "/steps/" + i4 + "/earliest", schemaPath: "#/properties/steps/items/properties/earliest/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                  if (vErrors === null) {
                    vErrors = [err62];
                  } else {
                    vErrors.push(err62);
                  }
                  errors++;
                }
                for (const key4 in data21) {
                  if (!(key4 === "day" || key4 === "minute")) {
                    const err63 = { instancePath: instancePath + "/steps/" + i4 + "/earliest", schemaPath: "#/properties/steps/items/properties/earliest/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err63];
                    } else {
                      vErrors.push(err63);
                    }
                    errors++;
                  }
                }
                if (data21.day !== void 0) {
                  let data22 = data21.day;
                  if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)))) {
                    const err64 = { instancePath: instancePath + "/steps/" + i4 + "/earliest/day", schemaPath: "#/properties/steps/items/properties/earliest/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err64];
                    } else {
                      vErrors.push(err64);
                    }
                    errors++;
                  }
                }
                if (data21.minute !== void 0) {
                  let data23 = data21.minute;
                  if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)))) {
                    const err65 = { instancePath: instancePath + "/steps/" + i4 + "/earliest/minute", schemaPath: "#/properties/steps/items/properties/earliest/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err65];
                    } else {
                      vErrors.push(err65);
                    }
                    errors++;
                  }
                  if (typeof data23 == "number") {
                    if (data23 > 1439 || isNaN(data23)) {
                      const err66 = { instancePath: instancePath + "/steps/" + i4 + "/earliest/minute", schemaPath: "#/properties/steps/items/properties/earliest/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                      if (vErrors === null) {
                        vErrors = [err66];
                      } else {
                        vErrors.push(err66);
                      }
                      errors++;
                    }
                    if (data23 < 0 || isNaN(data23)) {
                      const err67 = { instancePath: instancePath + "/steps/" + i4 + "/earliest/minute", schemaPath: "#/properties/steps/items/properties/earliest/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err67];
                      } else {
                        vErrors.push(err67);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err68 = { instancePath: instancePath + "/steps/" + i4 + "/earliest", schemaPath: "#/properties/steps/items/properties/earliest/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err68];
                } else {
                  vErrors.push(err68);
                }
                errors++;
              }
            }
            if (data15.latest !== void 0) {
              let data24 = data15.latest;
              if (data24 && typeof data24 == "object" && !Array.isArray(data24)) {
                if (data24.day === void 0) {
                  const err69 = { instancePath: instancePath + "/steps/" + i4 + "/latest", schemaPath: "#/properties/steps/items/properties/latest/required", keyword: "required", params: { missingProperty: "day" }, message: "must have required property 'day'" };
                  if (vErrors === null) {
                    vErrors = [err69];
                  } else {
                    vErrors.push(err69);
                  }
                  errors++;
                }
                if (data24.minute === void 0) {
                  const err70 = { instancePath: instancePath + "/steps/" + i4 + "/latest", schemaPath: "#/properties/steps/items/properties/latest/required", keyword: "required", params: { missingProperty: "minute" }, message: "must have required property 'minute'" };
                  if (vErrors === null) {
                    vErrors = [err70];
                  } else {
                    vErrors.push(err70);
                  }
                  errors++;
                }
                for (const key5 in data24) {
                  if (!(key5 === "day" || key5 === "minute")) {
                    const err71 = { instancePath: instancePath + "/steps/" + i4 + "/latest", schemaPath: "#/properties/steps/items/properties/latest/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                }
                if (data24.day !== void 0) {
                  let data25 = data24.day;
                  if (!(typeof data25 == "number" && (!(data25 % 1) && !isNaN(data25)))) {
                    const err72 = { instancePath: instancePath + "/steps/" + i4 + "/latest/day", schemaPath: "#/properties/steps/items/properties/latest/properties/day/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                }
                if (data24.minute !== void 0) {
                  let data26 = data24.minute;
                  if (!(typeof data26 == "number" && (!(data26 % 1) && !isNaN(data26)))) {
                    const err73 = { instancePath: instancePath + "/steps/" + i4 + "/latest/minute", schemaPath: "#/properties/steps/items/properties/latest/properties/minute/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                  if (typeof data26 == "number") {
                    if (data26 > 1439 || isNaN(data26)) {
                      const err74 = { instancePath: instancePath + "/steps/" + i4 + "/latest/minute", schemaPath: "#/properties/steps/items/properties/latest/properties/minute/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1439 }, message: "must be <= 1439" };
                      if (vErrors === null) {
                        vErrors = [err74];
                      } else {
                        vErrors.push(err74);
                      }
                      errors++;
                    }
                    if (data26 < 0 || isNaN(data26)) {
                      const err75 = { instancePath: instancePath + "/steps/" + i4 + "/latest/minute", schemaPath: "#/properties/steps/items/properties/latest/properties/minute/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err75];
                      } else {
                        vErrors.push(err75);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err76 = { instancePath: instancePath + "/steps/" + i4 + "/latest", schemaPath: "#/properties/steps/items/properties/latest/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err76];
                } else {
                  vErrors.push(err76);
                }
                errors++;
              }
            }
            if (data15.prerequisites !== void 0) {
              let data27 = data15.prerequisites;
              if (Array.isArray(data27)) {
                if (data27.length > 200) {
                  const err77 = { instancePath: instancePath + "/steps/" + i4 + "/prerequisites", schemaPath: "#/properties/steps/items/properties/prerequisites/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err77];
                  } else {
                    vErrors.push(err77);
                  }
                  errors++;
                }
                const len7 = data27.length;
                for (let i7 = 0; i7 < len7; i7++) {
                  if (typeof data27[i7] !== "string") {
                    const err78 = { instancePath: instancePath + "/steps/" + i4 + "/prerequisites/" + i7, schemaPath: "#/properties/steps/items/properties/prerequisites/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                }
              } else {
                const err79 = { instancePath: instancePath + "/steps/" + i4 + "/prerequisites", schemaPath: "#/properties/steps/items/properties/prerequisites/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err79];
                } else {
                  vErrors.push(err79);
                }
                errors++;
              }
            }
            if (data15.action !== void 0) {
              if (typeof data15.action !== "string") {
                const err80 = { instancePath: instancePath + "/steps/" + i4 + "/action", schemaPath: "#/properties/steps/items/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err80];
                } else {
                  vErrors.push(err80);
                }
                errors++;
              }
            }
            if (data15.intended_effects !== void 0) {
              let data30 = data15.intended_effects;
              if (Array.isArray(data30)) {
                if (data30.length > 200) {
                  const err81 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects", schemaPath: "#/properties/steps/items/properties/intended_effects/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err81];
                  } else {
                    vErrors.push(err81);
                  }
                  errors++;
                }
                const len8 = data30.length;
                for (let i8 = 0; i8 < len8; i8++) {
                  let data31 = data30[i8];
                  if (data31 && typeof data31 == "object" && !Array.isArray(data31)) {
                    if (data31.entity_id === void 0) {
                      const err82 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8, schemaPath: "#/properties/steps/items/properties/intended_effects/items/required", keyword: "required", params: { missingProperty: "entity_id" }, message: "must have required property 'entity_id'" };
                      if (vErrors === null) {
                        vErrors = [err82];
                      } else {
                        vErrors.push(err82);
                      }
                      errors++;
                    }
                    if (data31.predicate === void 0) {
                      const err83 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8, schemaPath: "#/properties/steps/items/properties/intended_effects/items/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
                      if (vErrors === null) {
                        vErrors = [err83];
                      } else {
                        vErrors.push(err83);
                      }
                      errors++;
                    }
                    if (data31.value === void 0) {
                      const err84 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8, schemaPath: "#/properties/steps/items/properties/intended_effects/items/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
                      if (vErrors === null) {
                        vErrors = [err84];
                      } else {
                        vErrors.push(err84);
                      }
                      errors++;
                    }
                    for (const key6 in data31) {
                      if (!(key6 === "entity_id" || key6 === "predicate" || key6 === "value")) {
                        const err85 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8, schemaPath: "#/properties/steps/items/properties/intended_effects/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err85];
                        } else {
                          vErrors.push(err85);
                        }
                        errors++;
                      }
                    }
                    if (data31.entity_id !== void 0) {
                      let data32 = data31.entity_id;
                      if (typeof data32 === "string") {
                        if (func2(data32) > 200) {
                          const err86 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/entity_id", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/entity_id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                          if (vErrors === null) {
                            vErrors = [err86];
                          } else {
                            vErrors.push(err86);
                          }
                          errors++;
                        }
                        if (func2(data32) < 1) {
                          const err87 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/entity_id", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/entity_id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err87];
                          } else {
                            vErrors.push(err87);
                          }
                          errors++;
                        }
                      } else {
                        const err88 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/entity_id", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/entity_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                    }
                    if (data31.predicate !== void 0) {
                      let data33 = data31.predicate;
                      if (typeof data33 === "string") {
                        if (func2(data33) > 200) {
                          const err89 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/predicate", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/predicate/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                          if (vErrors === null) {
                            vErrors = [err89];
                          } else {
                            vErrors.push(err89);
                          }
                          errors++;
                        }
                        if (func2(data33) < 1) {
                          const err90 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/predicate", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/predicate/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err90];
                          } else {
                            vErrors.push(err90);
                          }
                          errors++;
                        }
                      } else {
                        const err91 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/predicate", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err91];
                        } else {
                          vErrors.push(err91);
                        }
                        errors++;
                      }
                    }
                    if (data31.value !== void 0) {
                      let data34 = data31.value;
                      const _errs88 = errors;
                      let valid27 = false;
                      let passing2 = null;
                      const _errs89 = errors;
                      if (typeof data34 !== "boolean") {
                        const err92 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/value", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/value/oneOf/0/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                        if (vErrors === null) {
                          vErrors = [err92];
                        } else {
                          vErrors.push(err92);
                        }
                        errors++;
                      }
                      var _valid2 = _errs89 === errors;
                      if (_valid2) {
                        valid27 = true;
                        passing2 = 0;
                      }
                      const _errs91 = errors;
                      if (!(typeof data34 == "number")) {
                        const err93 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/value", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/value/oneOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err93];
                        } else {
                          vErrors.push(err93);
                        }
                        errors++;
                      }
                      var _valid2 = _errs91 === errors;
                      if (_valid2 && valid27) {
                        valid27 = false;
                        passing2 = [passing2, 1];
                      } else {
                        if (_valid2) {
                          valid27 = true;
                          passing2 = 1;
                        }
                        const _errs93 = errors;
                        if (typeof data34 !== "string") {
                          const err94 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/value", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/value/oneOf/2/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err94];
                          } else {
                            vErrors.push(err94);
                          }
                          errors++;
                        }
                        var _valid2 = _errs93 === errors;
                        if (_valid2 && valid27) {
                          valid27 = false;
                          passing2 = [passing2, 2];
                        } else {
                          if (_valid2) {
                            valid27 = true;
                            passing2 = 2;
                          }
                          const _errs95 = errors;
                          if (Array.isArray(data34)) {
                            const len9 = data34.length;
                            for (let i9 = 0; i9 < len9; i9++) {
                              if (typeof data34[i9] !== "string") {
                                const err95 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/value/" + i9, schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/value/oneOf/3/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err95];
                                } else {
                                  vErrors.push(err95);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err96 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/value", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/value/oneOf/3/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                            if (vErrors === null) {
                              vErrors = [err96];
                            } else {
                              vErrors.push(err96);
                            }
                            errors++;
                          }
                          var _valid2 = _errs95 === errors;
                          if (_valid2 && valid27) {
                            valid27 = false;
                            passing2 = [passing2, 3];
                          } else {
                            if (_valid2) {
                              valid27 = true;
                              passing2 = 3;
                            }
                          }
                        }
                      }
                      if (!valid27) {
                        const err97 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8 + "/value", schemaPath: "#/properties/steps/items/properties/intended_effects/items/properties/value/oneOf", keyword: "oneOf", params: { passingSchemas: passing2 }, message: "must match exactly one schema in oneOf" };
                        if (vErrors === null) {
                          vErrors = [err97];
                        } else {
                          vErrors.push(err97);
                        }
                        errors++;
                      } else {
                        errors = _errs88;
                        if (vErrors !== null) {
                          if (_errs88) {
                            vErrors.length = _errs88;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                    }
                  } else {
                    const err98 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects/" + i8, schemaPath: "#/properties/steps/items/properties/intended_effects/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err98];
                    } else {
                      vErrors.push(err98);
                    }
                    errors++;
                  }
                }
              } else {
                const err99 = { instancePath: instancePath + "/steps/" + i4 + "/intended_effects", schemaPath: "#/properties/steps/items/properties/intended_effects/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err99];
                } else {
                  vErrors.push(err99);
                }
                errors++;
              }
            }
            if (data15.visibility !== void 0) {
              let data36 = data15.visibility;
              if (!(data36 === "public" || data36 === "restricted" || data36 === "secret")) {
                const err100 = { instancePath: instancePath + "/steps/" + i4 + "/visibility", schemaPath: "#/properties/steps/items/properties/visibility/enum", keyword: "enum", params: { allowedValues: schema83.properties.steps.items.properties.visibility.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err100];
                } else {
                  vErrors.push(err100);
                }
                errors++;
              }
            }
            if (data15.knowers !== void 0) {
              let data37 = data15.knowers;
              if (Array.isArray(data37)) {
                if (data37.length > 200) {
                  const err101 = { instancePath: instancePath + "/steps/" + i4 + "/knowers", schemaPath: "#/properties/steps/items/properties/knowers/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err101];
                  } else {
                    vErrors.push(err101);
                  }
                  errors++;
                }
                const len10 = data37.length;
                for (let i10 = 0; i10 < len10; i10++) {
                  if (typeof data37[i10] !== "string") {
                    const err102 = { instancePath: instancePath + "/steps/" + i4 + "/knowers/" + i10, schemaPath: "#/properties/steps/items/properties/knowers/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err102];
                    } else {
                      vErrors.push(err102);
                    }
                    errors++;
                  }
                }
              } else {
                const err103 = { instancePath: instancePath + "/steps/" + i4 + "/knowers", schemaPath: "#/properties/steps/items/properties/knowers/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err103];
                } else {
                  vErrors.push(err103);
                }
                errors++;
              }
            }
            if (data15.depends_on !== void 0) {
              let data39 = data15.depends_on;
              if (Array.isArray(data39)) {
                if (data39.length > 200) {
                  const err104 = { instancePath: instancePath + "/steps/" + i4 + "/depends_on", schemaPath: "#/properties/steps/items/properties/depends_on/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
                  if (vErrors === null) {
                    vErrors = [err104];
                  } else {
                    vErrors.push(err104);
                  }
                  errors++;
                }
                const len11 = data39.length;
                for (let i11 = 0; i11 < len11; i11++) {
                  if (typeof data39[i11] !== "string") {
                    const err105 = { instancePath: instancePath + "/steps/" + i4 + "/depends_on/" + i11, schemaPath: "#/properties/steps/items/properties/depends_on/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err105];
                    } else {
                      vErrors.push(err105);
                    }
                    errors++;
                  }
                }
              } else {
                const err106 = { instancePath: instancePath + "/steps/" + i4 + "/depends_on", schemaPath: "#/properties/steps/items/properties/depends_on/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err106];
                } else {
                  vErrors.push(err106);
                }
                errors++;
              }
            }
            if (data15.means !== void 0) {
              let data41 = data15.means;
              if (!(data41 === "ordinary" || data41 === "extraordinary")) {
                const err107 = { instancePath: instancePath + "/steps/" + i4 + "/means", schemaPath: "#/properties/steps/items/properties/means/enum", keyword: "enum", params: { allowedValues: schema83.properties.steps.items.properties.means.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err107];
                } else {
                  vErrors.push(err107);
                }
                errors++;
              }
            }
            if (data15.serves_anchor !== void 0) {
              let data42 = data15.serves_anchor;
              if (typeof data42 !== "string" && data42 !== null) {
                const err108 = { instancePath: instancePath + "/steps/" + i4 + "/serves_anchor", schemaPath: "#/properties/steps/items/properties/serves_anchor/type", keyword: "type", params: { type: schema83.properties.steps.items.properties.serves_anchor.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err108];
                } else {
                  vErrors.push(err108);
                }
                errors++;
              }
            }
            if (data15.requires_player_consent !== void 0) {
              if (typeof data15.requires_player_consent !== "boolean") {
                const err109 = { instancePath: instancePath + "/steps/" + i4 + "/requires_player_consent", schemaPath: "#/properties/steps/items/properties/requires_player_consent/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err109];
                } else {
                  vErrors.push(err109);
                }
                errors++;
              }
            }
          } else {
            const err110 = { instancePath: instancePath + "/steps/" + i4, schemaPath: "#/properties/steps/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err110];
            } else {
              vErrors.push(err110);
            }
            errors++;
          }
        }
      } else {
        const err111 = { instancePath: instancePath + "/steps", schemaPath: "#/properties/steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err111];
        } else {
          vErrors.push(err111);
        }
        errors++;
      }
    }
    if (data.inadequacy_note !== void 0) {
      if (typeof data.inadequacy_note !== "string") {
        const err112 = { instancePath: instancePath + "/inadequacy_note", schemaPath: "#/properties/inadequacy_note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err112];
        } else {
          vErrors.push(err112);
        }
        errors++;
      }
    }
  } else {
    const err113 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err113];
    } else {
      vErrors.push(err113);
    }
    errors++;
  }
  validate58.errors = vErrors;
  return errors === 0;
}
validate58.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };

// src/domain/time.ts
var DAY = 1440;
function toTick(t) {
  return t.day * DAY + t.minute;
}
function fromTick(tick) {
  const day = Math.floor(tick / DAY);
  return { day, minute: tick - day * DAY };
}
function whenToStoryTime(w) {
  if (!w.earliest || !w.latest) return null;
  const lo = toTick(w.earliest);
  const hi = toTick(w.latest);
  return { lo, hi, precision: w.precision === "minute" ? "minute" : w.precision === "day" ? "day" : "range" };
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatTick(tick, origin) {
  const t = fromTick(tick);
  const hhmm = `${pad2(Math.floor(t.minute / 60))}:${pad2(t.minute % 60)}`;
  if (origin) {
    const base = Date.UTC(origin.y, origin.m - 1, origin.d);
    const d = new Date(base + t.day * 864e5);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${hhmm} (D${t.day})`;
  }
  return `D${t.day} ${hhmm}`;
}

// src/domain/util.ts
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => stableStringify(v === void 0 ? null : v)).join(",") + "]";
  const obj = value;
  const keys = Object.keys(obj).filter((k) => obj[k] !== void 0).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function utf8(str) {
  return new TextEncoder().encode(str);
}
function sha256(input) {
  const msg = utf8(input);
  const len = msg.length;
  const bitLenHi = Math.floor(len * 8 / 4294967296);
  const bitLenLo = len * 8 >>> 0;
  const padded = new Uint8Array(len + 9 + 63 >> 6 << 6);
  padded.set(msg);
  padded[len] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLenHi);
  dv.setUint32(padded.length - 4, bitLenLo);
  const H = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15], w2 = W[i - 2];
      const s0 = (w15 >>> 7 | w15 << 25) ^ (w15 >>> 18 | w15 << 14) ^ w15 >>> 3;
      const s1 = (w2 >>> 17 | w2 << 15) ^ (w2 >>> 19 | w2 << 13) ^ w2 >>> 10;
      W[i] = W[i - 16] + s0 + W[i - 7] + s1 >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + W[i] >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    H[0] = H[0] + a >>> 0;
    H[1] = H[1] + b >>> 0;
    H[2] = H[2] + c >>> 0;
    H[3] = H[3] + d >>> 0;
    H[4] = H[4] + e >>> 0;
    H[5] = H[5] + f >>> 0;
    H[6] = H[6] + g >>> 0;
    H[7] = H[7] + h >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}
function hashObject(value) {
  return sha256(stableStringify(value));
}
function deepClone(v) {
  return v === void 0 ? v : JSON.parse(JSON.stringify(v));
}

// src/domain/pack.ts
function normalizeName(s) {
  return String(s).normalize("NFKC").toLowerCase().replace(/[\s·・._\-'"“”‘’「」『』]+/g, "");
}
function normalizeValue(v) {
  return Array.isArray(v) ? [...v].sort() : v;
}
function valuesEqual(a, b) {
  return stableStringify(normalizeValue(a)) === stableStringify(normalizeValue(b));
}
function looksLikeWorldInfo(raw) {
  if (!raw || typeof raw !== "object") return false;
  const o = raw;
  if (o.entries && typeof o.entries === "object") {
    const first = Object.values(o.entries)[0];
    if (!first || "uid" in first || "key" in first || "keys" in first || "content" in first) return true;
  }
  return false;
}
var WORLD_INFO_ERROR = "This file is a SillyTavern World Info (lorebook) export. Canon Engine accepts only the new .canon.json history-pack format (schema_version 1.0.0) and has no lorebook importer. Author a new pack with HISTORY_PACK_AUTHORING_GUIDE.md and schemas/canon-pack.schema.json.";
function validatePackText(text) {
  let raw;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    return { ok: false, errors: [{ level: "error", path: "", message: "Not valid UTF-8 JSON: " + e.message }], warnings: [] };
  }
  return validatePack(raw);
}
function validatePack(raw) {
  if (looksLikeWorldInfo(raw)) {
    return { ok: false, errors: [{ level: "error", path: "", message: WORLD_INFO_ERROR }], warnings: [] };
  }
  const validate = pack;
  if (!validate(raw)) {
    const errors2 = (validate.errors || []).map((e) => ({ level: "error", path: e.instancePath || "/", message: `schema: ${e.message ?? e.keyword}` }));
    return { ok: false, errors: dedupeIssues(errors2), warnings: [] };
  }
  const pack2 = deepClone(raw);
  const { errors, warnings } = lintPack(pack2);
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, errors: [], warnings, loaded: buildLoaded(pack2, warnings) };
}
function dedupeIssues(list) {
  const seen = /* @__PURE__ */ new Set();
  return list.filter((i) => {
    const k = i.path + "|" + i.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
var GENERIC_ALIASES = /* @__PURE__ */ new Set(["magic", "city", "school", "man", "woman", "girl", "boy", "he", "she", "it", "\u4ED6", "\u5979", "\u5B83", "\u57CE\u5E02", "\u9B54\u6CD5", "\u5B66\u6821", "\u4EBA"]);
var TEMPORAL_CLAIM_RE = /\b(is dead|died|was killed|currently|has become|now leads|imprisoned)\b|已死|死亡|已经|现在是|目前|成为了|被杀/i;
function lintPack(pack2) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ level: "error", path, message });
  const warn = (path, message) => warnings.push({ level: "warning", path, message });
  const ns = (arr, name) => {
    const m = /* @__PURE__ */ new Map();
    arr.forEach((x, i) => {
      if (m.has(x.id)) err(`/${name}/${i}/id`, `duplicate ${name} id "${x.id}"`);
      else m.set(x.id, x);
    });
    return m;
  };
  const sources = ns(pack2.sources, "sources");
  const predicates = ns(pack2.predicates, "predicates");
  const entities = ns(pack2.entities, "entities");
  const events = ns(pack2.events, "events");
  const arcs = ns(pack2.arcs, "arcs");
  ns(pack2.edges, "edges");
  const checkSources = (refs, path) => refs.forEach((r, i) => {
    if (!sources.has(r)) err(`${path}/${i}`, `unknown source "${r}"`);
  });
  const checkEntity = (id, path) => {
    if (!entities.has(id)) err(path, `unknown entity "${id}"`);
  };
  const checkValue = (pred, v, path) => {
    switch (pred.value_type) {
      case "boolean":
        if (typeof v !== "boolean") err(path, `predicate "${pred.id}" expects boolean`);
        break;
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) err(path, `predicate "${pred.id}" expects finite number`);
        break;
      case "string":
        if (typeof v !== "string") err(path, `predicate "${pred.id}" expects string`);
        break;
      case "entity_ref":
        if (typeof v !== "string") err(path, `predicate "${pred.id}" expects entity id`);
        else checkEntity(v, path);
        break;
      case "entity_set":
        if (!Array.isArray(v)) err(path, `predicate "${pred.id}" expects entity id array`);
        else {
          if (new Set(v).size !== v.length) err(path, `entity set has duplicates`);
          v.forEach((x, i) => checkEntity(x, `${path}/${i}`));
        }
        break;
    }
    if (pred.allowed_values && !pred.allowed_values.some((a) => valuesEqual(a, v))) err(path, `value ${JSON.stringify(v)} not in allowed_values of "${pred.id}"`);
  };
  const checkFact = (f, path) => {
    checkEntity(f.entity_id, `${path}/entity_id`);
    const p = predicates.get(f.predicate);
    if (!p) err(`${path}/predicate`, `unknown predicate "${f.predicate}"`);
    else checkValue(p, f.value, `${path}/value`);
  };
  const checkCondition = (c, path, selfId) => {
    if ("all" in c) c.all.forEach((x, i) => checkCondition(x, `${path}/all/${i}`, selfId));
    else if ("any" in c) c.any.forEach((x, i) => checkCondition(x, `${path}/any/${i}`, selfId));
    else if ("not" in c) checkCondition(c.not, `${path}/not`, selfId);
    else if ("fact" in c) checkFact(c.fact, `${path}/fact`);
    else if ("occurred" in c) {
      if (!events.has(c.occurred)) err(`${path}/occurred`, `unknown event "${c.occurred}"`);
      if (selfId && c.occurred === selfId) err(`${path}/occurred`, `event "${selfId}" requires its own occurrence (self-satisfying prerequisite)`);
    }
  };
  pack2.predicates.forEach((p, i) => {
    if (p.allowed_values) {
      p.allowed_values.forEach((v, j) => {
        const tmp = { ...p, allowed_values: void 0 };
        checkValue(tmp, v, `/predicates/${i}/allowed_values/${j}`);
      });
    }
    (p.settled_values || []).forEach((v, j) => checkValue(p, v, `/predicates/${i}/settled_values/${j}`));
    if (p.settled_values && !p.transient) warn(`/predicates/${i}/settled_values`, `settled_values only apply to a transient predicate; set "transient": true or remove them`);
  });
  const aliasOwners = /* @__PURE__ */ new Map();
  pack2.entities.forEach((e, i) => {
    checkSources(e.source_refs, `/entities/${i}/source_refs`);
    for (const a of [e.name, ...e.aliases]) {
      const k = normalizeName(a);
      if (!k) continue;
      if (GENERIC_ALIASES.has(k) || k.length < 2 && !/[㐀-鿿]/.test(k)) warn(`/entities/${i}`, `generic or very short alias "${a}"`);
      const owners = aliasOwners.get(k) || [];
      if (!owners.includes(e.id)) owners.push(e.id);
      aliasOwners.set(k, owners);
    }
    if (TEMPORAL_CLAIM_RE.test(e.static_description)) warn(`/entities/${i}/static_description`, "static description may contain a mutable/temporal claim; move it to facts/events");
  });
  for (const [k, owners] of aliasOwners) if (owners.length > 1) warn("/entities", `alias collision "${k}" shared by ${owners.join(", ")}; runtime will treat it as ambiguous`);
  const covStart = toTick(pack2.coverage.start);
  const covEnd = toTick(pack2.coverage.end);
  if (covEnd < covStart) err("/coverage", "coverage.end precedes coverage.start");
  if (toTick(pack2.initial_state.at) !== covStart) err("/initial_state/at", "initial_state.at must equal coverage.start");
  const baseline = /* @__PURE__ */ new Map();
  pack2.initial_state.facts.forEach((f, i) => {
    checkFact(f.fact, `/initial_state/facts/${i}/fact`);
    checkSources(f.source_refs, `/initial_state/facts/${i}/source_refs`);
    const key = `${f.fact.entity_id}|${f.fact.predicate}`;
    if (baseline.has(key)) err(`/initial_state/facts/${i}`, `baseline has more than one value for ${key} (first at index ${baseline.get(key)}); no last-entry-wins`);
    else baseline.set(key, i);
  });
  const arcOf = /* @__PURE__ */ new Map();
  pack2.arcs.forEach((a, i) => {
    a.event_ids.forEach((eid, j) => {
      if (!events.has(eid)) err(`/arcs/${i}/event_ids/${j}`, `unknown event "${eid}"`);
      else {
        if (arcOf.has(eid) && arcOf.get(eid) !== a.id) err(`/arcs/${i}/event_ids/${j}`, `event "${eid}" listed in more than one arc`);
        arcOf.set(eid, a.id);
        if (events.get(eid).arc_id !== a.id) err(`/arcs/${i}/event_ids/${j}`, `event "${eid}" listed in arc "${a.id}" but its arc_id is ${JSON.stringify(events.get(eid).arc_id)}`);
      }
    });
  });
  let unknownCount = 0;
  const titles = /* @__PURE__ */ new Map();
  pack2.events.forEach((ev, i) => {
    const P = `/events/${i}`;
    ev.entity_ids.forEach((x, j) => checkEntity(x, `${P}/entity_ids/${j}`));
    ev.location_ids.forEach((x, j) => {
      checkEntity(x, `${P}/location_ids/${j}`);
      const ent = entities.get(x);
      if (ent && ent.kind !== "place") err(`${P}/location_ids/${j}`, `location "${x}" is not a place entity`);
    });
    if (ev.arc_id !== null) {
      if (!arcs.has(ev.arc_id)) err(`${P}/arc_id`, `unknown arc "${ev.arc_id}"`);
      else if (!arcs.get(ev.arc_id).event_ids.includes(ev.id)) err(`${P}/arc_id`, `arc "${ev.arc_id}" does not list event "${ev.id}"`);
    }
    checkSources(ev.source_refs, `${P}/source_refs`);
    ev.visibility.knower_ids.forEach((x, j) => checkEntity(x, `${P}/visibility/knower_ids/${j}`));
    checkCondition(ev.canonical_preconditions, `${P}/canonical_preconditions`, ev.id);
    ev.outcomes.forEach((f, j) => checkFact(f, `${P}/outcomes/${j}`));
    const writes = /* @__PURE__ */ new Map();
    ev.canonical_effects.forEach((ef, j) => {
      const key = ef.op === "set" ? `${ef.fact.entity_id}|${ef.fact.predicate}` : `${ef.entity_id}|${ef.predicate}`;
      if (ef.op === "set") checkFact(ef.fact, `${P}/canonical_effects/${j}/fact`);
      else {
        checkEntity(ef.entity_id, `${P}/canonical_effects/${j}/entity_id`);
        if (!predicates.has(ef.predicate)) err(`${P}/canonical_effects/${j}/predicate`, `unknown predicate "${ef.predicate}"`);
      }
      if (writes.has(key)) err(`${P}/canonical_effects/${j}`, `multiple writes to ${key} within one event`);
      writes.set(key, ef);
    });
    ev.outcomes.forEach((o, j) => {
      const w2 = writes.get(`${o.entity_id}|${o.predicate}`);
      if (!w2 || w2.op !== "set" || !valuesEqual(w2.fact.value, o.value)) err(`${P}/outcomes/${j}`, `outcome ${o.entity_id}.${o.predicate}=${JSON.stringify(o.value)} has no matching final canonical set effect`);
    });
    const w = ev.when;
    if (w.precision === "unknown") {
      unknownCount++;
      if (w.earliest !== null || w.latest !== null) err(`${P}/when`, "unknown precision requires null bounds");
      if (w.basis !== "unknown") err(`${P}/when/basis`, 'unknown-time events must use basis "unknown"');
      if (ev.classification === "HARD") err(`${P}/when`, "HARD events require finite resolved bounds");
    } else {
      if (!w.earliest || !w.latest) err(`${P}/when`, `precision "${w.precision}" requires finite bounds`);
      else {
        const lo = toTick(w.earliest), hi = toTick(w.latest);
        if (hi < lo) err(`${P}/when`, "latest precedes earliest (reversed interval)");
        if (w.precision === "minute" && lo !== hi) err(`${P}/when`, "minute precision requires equal earliest/latest");
        if (w.precision === "day" && (w.earliest.day !== w.latest.day || w.earliest.minute !== 0 || w.latest.minute !== 1439)) err(`${P}/when`, "day precision must span one day from minute 0 through 1439");
        if (w.precision === "range" && !(hi > lo)) err(`${P}/when`, "range precision requires an interval wider than one minute");
        if (w.basis === "unknown") err(`${P}/when/basis`, 'finite bounds cannot use basis "unknown"');
        if (lo <= covStart || hi > covEnd) err(`${P}/when`, `event bounds must lie within coverage and strictly after the initial baseline checkpoint`);
      }
    }
    if (ev.classification === "HARD") {
      if (!ev.required_description || !ev.required_description.trim()) err(`${P}/required_description`, "HARD requires a nonempty required_description");
      if (!ev.outcomes.length) err(`${P}/outcomes`, "HARD requires at least one outcome");
    }
    const t = ev.title.trim().toLowerCase();
    if (titles.has(t)) warn(`${P}/title`, `duplicate event title also used by "${titles.get(t)}"`);
    titles.set(t, ev.id);
  });
  if (unknownCount > Math.max(5, pack2.events.length / 3)) warn("/events", `${unknownCount} unknown-time events; they are background reference only`);
  const precedes = /* @__PURE__ */ new Map();
  pack2.edges.forEach((e, i) => {
    if (!events.has(e.from)) err(`/edges/${i}/from`, `unknown event "${e.from}"`);
    if (!events.has(e.to)) err(`/edges/${i}/to`, `unknown event "${e.to}"`);
    if (!e.note.trim()) err(`/edges/${i}/note`, "edge note must explain the relation");
    checkSources(e.source_refs, `/edges/${i}/source_refs`);
    if (e.relation === "precedes" && events.has(e.from) && events.has(e.to)) {
      precedes.set(e.from, [...precedes.get(e.from) || [], e.to]);
      const a = whenToStoryTime(events.get(e.from).when);
      const b = whenToStoryTime(events.get(e.to).when);
      if (a && b && a.lo > b.hi) err(`/edges/${i}`, `precedence ${e.from} -> ${e.to} is temporally impossible`);
    }
  });
  const state = /* @__PURE__ */ new Map();
  const visit = (n, stack) => {
    state.set(n, 1);
    for (const m of precedes.get(n) || []) {
      if (state.get(m) === 1) err("/edges", `precedence cycle: ${[...stack, n, m].join(" -> ")}`);
      else if (!state.get(m)) visit(m, [...stack, n]);
    }
    state.set(n, 2);
  };
  for (const n of precedes.keys()) if (!state.get(n)) visit(n, []);
  pack2.events.forEach((ev, i) => {
    const me = whenToStoryTime(ev.when);
    const deps = [];
    const collect = (c) => {
      if ("all" in c) c.all.forEach(collect);
      else if ("any" in c) c.any.forEach(collect);
      else if ("not" in c) collect(c.not);
      else if ("occurred" in c) deps.push(c.occurred);
    };
    collect(ev.canonical_preconditions);
    for (const d of deps) {
      const de = events.get(d);
      const dt = de ? whenToStoryTime(de.when) : null;
      if (me && dt && dt.lo > me.hi) warn(`/events/${i}/canonical_preconditions`, `requires occurrence of later event "${d}" (forward dependency; review)`);
    }
  });
  const timed = pack2.events.map((ev, i) => ({ ev, i, t: whenToStoryTime(ev.when) })).filter((x) => x.t).sort((a, b) => a.t.lo - b.t.lo);
  const touches = (ef, ent, pred) => ef.op === "set" ? ef.fact.entity_id === ent && ef.fact.predicate === pred : ef.entity_id === ent && ef.predicate === pred;
  for (const a of timed) {
    a.ev.canonical_effects.forEach((ef, j) => {
      if (ef.op !== "set") return;
      const p = predicates.get(ef.fact.predicate);
      if (!p?.transient || (p.settled_values || []).some((v) => valuesEqual(v, ef.fact.value))) return;
      const ent = ef.fact.entity_id;
      const after = timed.filter((b) => b !== a && b.t.lo > a.t.lo);
      if (after.some((b) => b.ev.canonical_effects.some((x) => touches(x, ent, ef.fact.predicate)))) return;
      const later = after.filter((b) => b.t.lo > a.t.hi && b.ev.entity_ids.includes(ent)).map((b) => b.ev.id);
      if (later.length) warn(`/events/${a.i}/canonical_effects/${j}`, `temporary condition ${ent}.${ef.fact.predicate} = ${JSON.stringify(ef.fact.value)} is never ended by a later event, but ${ent} takes part in later events: ${later.slice(0, 5).join(", ")}${later.length > 5 ? ` (+${later.length - 5} more)` : ""}. Add an event or effect that ends it, or list the value in the predicate's settled_values if it lasts`);
    });
  }
  const hard = pack2.events.filter((e) => e.classification === "HARD" && e.when.earliest && e.when.latest);
  for (let i = 0; i < hard.length; i++) {
    for (let j = i + 1; j < hard.length; j++) {
      const a = hard[i], b = hard[j];
      const ta = whenToStoryTime(a.when), tb = whenToStoryTime(b.when);
      if (!(ta.lo === ta.hi && tb.lo === tb.hi && ta.lo === tb.lo)) continue;
      for (const oa of a.outcomes) for (const ob of b.outcomes) {
        if (oa.entity_id === ob.entity_id && oa.predicate === ob.predicate && !valuesEqual(oa.value, ob.value)) {
          const linked = pack2.edges.some((e) => e.relation === "precedes" && (e.from === a.id && e.to === b.id || e.from === b.id && e.to === a.id));
          if (!linked) err("/events", `HARD events "${a.id}" and "${b.id}" require incompatible values for ${oa.entity_id}.${oa.predicate} at the same logical checkpoint`);
        }
      }
    }
  }
  if (!pack2.events.some((e) => e.when.earliest)) warn("/coverage", "coverage promises scheduled play but no finite-time events exist");
  return { errors: dedupeIssues(errors), warnings: dedupeIssues(warnings) };
}
function buildLoaded(pack2, warnings) {
  const predicates = new Map(pack2.predicates.map((p) => [p.id, p]));
  const entities = new Map(pack2.entities.map((e) => [e.id, e]));
  const events = new Map(pack2.events.map((e) => [e.id, e]));
  const timeIndex = [];
  const unknownTimeEvents = [];
  for (const ev of pack2.events) {
    const st = whenToStoryTime(ev.when);
    if (st) timeIndex.push({ id: ev.id, lo: st.lo, hi: st.hi });
    else unknownTimeEvents.push(ev.id);
  }
  timeIndex.sort((a, b) => a.lo - b.lo || a.hi - b.hi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edgesFrom = /* @__PURE__ */ new Map();
  const edgesTo = /* @__PURE__ */ new Map();
  for (const e of pack2.edges) {
    edgesFrom.set(e.from, [...edgesFrom.get(e.from) || [], e]);
    edgesTo.set(e.to, [...edgesTo.get(e.to) || [], e]);
  }
  const aliasIndex = /* @__PURE__ */ new Map();
  for (const e of pack2.entities) {
    for (const a of [e.name, e.id, ...e.aliases]) {
      const k = normalizeName(a);
      if (!k) continue;
      const list = aliasIndex.get(k) || [];
      if (!list.includes(e.id)) list.push(e.id);
      aliasIndex.set(k, list);
    }
  }
  const eventTitleIndex = /* @__PURE__ */ new Map();
  for (const e of pack2.events) {
    for (const t of [e.title, e.id]) {
      const k = normalizeName(t);
      eventTitleIndex.set(k, [...eventTitleIndex.get(k) || [], e.id]);
    }
  }
  const normalized = deepClone(pack2);
  const normFact = (f) => {
    f.value = normalizeValue(f.value);
  };
  normalized.initial_state.facts.forEach((f) => normFact(f.fact));
  normalized.events.forEach((e) => {
    e.outcomes.forEach(normFact);
    e.canonical_effects.forEach((ef) => {
      if (ef.op === "set") normFact(ef.fact);
    });
  });
  return {
    pack: pack2,
    hash: hashObject(normalized),
    predicates,
    entities,
    events,
    timeIndex,
    unknownTimeEvents,
    hardEvents: pack2.events.filter((e) => e.classification === "HARD").map((e) => e.id),
    edgesFrom,
    edgesTo,
    aliasIndex,
    eventTitleIndex,
    coverage: { start: toTick(pack2.coverage.start), end: toTick(pack2.coverage.end) },
    warnings
  };
}

// src/cli/lint.ts
var args = process.argv.slice(2);
var asJson = args.includes("--json");
var files = args.filter((a) => !a.startsWith("--"));
if (!files.length) {
  console.error("usage: node dist/canon-lint.mjs <pack.canon.json> [--json]");
  process.exit(2);
}
var failed = false;
var reports = [];
for (const f of files) {
  const r = validatePackText(readFileSync(f, "utf8"));
  failed ||= !r.ok;
  const L = r.loaded;
  const report = {
    file: f,
    ok: r.ok,
    errors: r.errors,
    warnings: r.warnings,
    summary: L ? {
      pack: `${L.pack.pack_id}@${L.pack.pack_version}`,
      title: L.pack.title,
      hash: L.hash,
      coverage: `${formatTick(L.coverage.start)} \u2013 ${formatTick(L.coverage.end)}`,
      events: L.pack.events.length,
      entities: L.pack.entities.length,
      unknownTime: L.unknownTimeEvents.length,
      classification: L.pack.events.map((e) => ({ id: e.id, class: e.classification, when: e.when.label, required: e.required_description }))
    } : null
  };
  reports.push(report);
  if (!asJson) {
    console.log(`
${f}: ${r.ok ? "VALID" : "INVALID"}`);
    for (const e of r.errors) console.log(`  ERROR   ${e.path || "/"}  ${e.message}`);
    for (const w of r.warnings) console.log(`  WARNING ${w.path || "/"}  ${w.message}`);
    if (report.summary) {
      const s = report.summary;
      console.log(`  ${s.title} (${s.pack}) hash ${s.hash.slice(0, 12)}; coverage ${s.coverage}; ${s.events} events, ${s.entities} entities, ${s.unknownTime} unknown-time`);
      for (const c of s.classification) console.log(`    ${c.class.padEnd(4)} ${c.id}  [${c.when}]${c.required ? "  REQUIRED: " + c.required : ""}`);
    }
  }
}
if (asJson) console.log(JSON.stringify(reports, null, 1));
process.exit(failed ? 1 : 0);
