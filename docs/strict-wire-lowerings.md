# Strict wire lowerings

This document inventories built-in wire shapes that differ from their existing
runtime interfaces. Lowerings happen before effectful dispatch and must be
tested at both the wire and runtime boundaries.

## `http_probe.headers`

- Canonical path: `http_probe.headers`, historically an arbitrary-key object.
- Wire form: array of closed `{name: string, value: string}` objects.
- Runtime: `build_http_probe_command` converts records to the existing header
  dictionary before curl command construction; dictionary callers remain
  supported. Case-folded duplicate names, malformed records, and non-string
  names/values are rejected before request execution. Existing curl header
  validation and output redaction remain in place.
- Fixtures: `tests/test_strict_wire_defs.py` covers schema, list and legacy
  dict positive cases, case-insensitive duplicate names and malformed records.

## Schedule triggers

- Canonical paths: `schedule_task.trigger` and `update_schedule.trigger`.
- Wire form: shared closed object with `source`, `event`, `repo`, and
  `alert_name`; source retains the five supported values.
- Semantics remain AND across supplied conditions; partial conditions without
  `source` remain valid. Existing scheduler runtime rejects an empty trigger.
- Fixtures: `tests/test_strict_wire_defs.py` asserts both definitions use the
  same closed four-field shape.

## `validate_action.checks[].expected`

- Canonical path: `validate_action.checks[].expected`.
- Wire form: integer, string, integer array, or string array, with typed items.
- Runtime: `parse_checks` rejects unsupported types and incompatible typed
  expectations before any validation command runs. HTTP expectations are
  status integers or digit strings; service status lists contain strings.
  Existing scalar stringification paths for command checks are preserved.
- Omitted expectations, explicit expectations, and check-type defaults remain
  distinct: only an omitted `expected` selects the existing built-in default.
- Fixtures: `tests/test_strict_wire_defs.py` covers integer lists, invalid
  mixed HTTP values, invalid service list values, and command compatibility.

## `computer_*` explicit lowerings

The canonical computer contracts remain in `src/tools/defs/computer.py`.
The request-local adapter owns the wrapper lowering: a closed outer object
contains `payload`, whose schema is a nested per-operation union with const
operation selectors. It must not use a root `anyOf`, and must reject ambiguous
matches rather than choosing a first branch. Canonical schemas stay unchanged.

The following unsupported wire constraints require explicit computer-only
lowering. Each wire relaxation must be enforced by the canonical JSON Schema
tripwire before dispatch; these are not generic recursive keyword deletions.

| Canonical schema constraint | Wire representation | Pre-effect validator |
| --- | --- | --- |
| `uniqueItems` (notably modifier arrays) | Omitted from wire array schema | Canonical computer payload validator rejects duplicates, including repeated key modifiers |
| `minProperties` (task context) | Omitted from wire object schema | Canonical validator rejects empty task context where minimum properties are required |
| `not` | Omitted from wire branch | Canonical validator rejects the forbidden shape |
| `allOf` | Omitted from wire branch | Canonical validator validates all constituent schemas |
| `oneOf` | Represented by nested operation branches only when match is unambiguous | Canonical validator and ambiguity check reject zero/multiple distinct matches |
| `false` property schemas | Property omitted from wire branch | Canonical validator rejects forbidden operation fields |

Expected fixture coverage includes duplicate modifiers, repeated key
modifiers, empty task context, coordinate-versus-region conflicts, forbidden
operation fields, and nested sequence/stroke contracts. Fixtures and mocked
dispatch only: no desktop input is performed. The corresponding adapter test
module should assert positive and negative fixtures against compiled wire form
and canonical pre-effect validation.
