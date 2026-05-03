# Parley Schema Examples

These files are example payloads, not strict JSON Schema definitions. They
document the expected shape for each `parley-*/v1` contract referenced from
`docs/specs/`. The implementation agent should treat these as canonical
field names and types; if a stricter validator is desired later, it can be
generated from these examples.

| File                                  | Contract                       |
|---------------------------------------|--------------------------------|
| `parley-character.v1.example.json`    | `parley-character/v1`          |
| `parley-instance.v1.example.json`     | `parley-instance/v1`           |
| `parley-story-instance.v1.example.json` | `parley-story-instance/v1`   |
| `parley-promotion-candidate.v1.example.json` | `parley-promotion-candidate/v1` |
| `parley-truth-verdict.v1.example.json`| `parley-truth-verdict/v1`      |
| `parley-world-state.v1.example.json`  | `parley-world-state/v1`        |
| `parley-turn.v1.example.json`         | `parley-turn/v1`               |

Conventions:

- Timestamps are ISO-8601 UTC.
- Ids are stable lowercase slugs (`mara-underbough`, `turn-0003`).
- `schema_version` is required on every artifact.
- Unknown fields should be preserved by the runtime (forward-compat).
