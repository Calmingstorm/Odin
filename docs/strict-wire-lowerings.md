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

## Nested tool payloads

- Canonical paths: `schedule_task.tool_input`, `schedule_task.steps[].tool_input`,
  `update_schedule.tool_input`, `update_schedule.steps[].tool_input`,
  `delegate_task.steps[].tool_input`, and `invoke_skill.input`.
- Wire form: JSON-encoded object in a string field. The request-local acceptance
  boundary decodes once, rejects malformed JSON, duplicate keys, and non-object
  roots, then validates the selected tool's canonical schema and authorization.
  Canonical objects, including meaningful nested nulls, reach persistence and
  dispatch. Workflow templates are decoded before substitution; concrete fields
  are checked at admission, unresolved placeholders after substitution. Existing
  stored jobs do not acquire new retroactive validation.
- Fixtures: `tests/test_strict_nested_payload.py` and
  `tests/test_strict_tool_adapter.py` cover round trips, malformed data,
  target validation, and unresolved placeholders.

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
| `computer_act.properties.modifiers.uniqueItems`, `computer_act.properties.steps.items.properties.modifiers.uniqueItems`, `computer_act.properties.strokes.items.properties.modifiers.uniqueItems` | Omitted from wire array schemas | Canonical computer payload validator rejects duplicate modifiers |
| `computer_observe.properties.task_context.minProperties` | Omitted from wire object schema | Canonical validator rejects an empty task context |
| `computer_act.properties.key.allOf[*].not`, and the matching nested `computer_act.properties.steps.items.properties.key.allOf[*].not` | Omitted from wire key schema | Canonical validator rejects repeated key modifiers |
| `computer_act.properties.key.allOf`, and the matching nested `computer_act.properties.steps.items.properties.key.allOf` | Omitted from wire key schema | Canonical validator applies every key-chord restriction |
| `computer_act.properties.key.pattern` and nested `computer_act.properties.steps.items.properties.key.pattern` (Python lookaround) | Key string type retained; incompatible lookaround omitted on wire | Canonical computer payload validator applies the exact original regex before dispatch; controller key parsing independently rejects malformed chords |
| `computer_act.oneOf`, `computer_act.properties.steps.items.oneOf` and their coordinate-versus-region sub-unions | Nested operation branches with const selectors; coordinate and region remain distinct branches | Canonical validator and adapter ambiguity check reject conflicting and unmatched branches |
| `false` property schemas under `computer_act.oneOf[*].properties` and `computer_act.properties.steps.items.oneOf[*].properties`, including coordinate-versus-region sub-unions | Forbidden property removed from each wire branch | Canonical validator rejects forbidden fields, even if supplied as null |

`tests/test_strict_tool_adapter.py` exercises positive focus, click-coordinate,
click-region, sequence and stroke forms; negative focus expectation,
coordinate/region conflicts, forbidden operation fields, duplicate modifiers,
repeated key modifiers, empty task context, malformed nested sequence and
duplicate modifiers in nested strokes. These are local schema fixtures only:
no desktop input is performed.
