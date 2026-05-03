# TypeScript + Zod Agent Contract Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move Parley's runtime contracts to TypeScript + Zod so humans and agents can validate world, story, turn, verdict, character, asset, and promotion artifacts before reading or writing them.

**Architecture:** Do not start with a giant rewrite. First add a typed contract layer and validation CLI that can sit beside the current JavaScript runtime. Then migrate runtime modules one seam at a time. Agents should use the same schemas as the app, through narrow tools that validate inputs and outputs before touching the file-backed world/story instance.

**Tech Stack:** Node 20, TypeScript, Zod 4, `tsx` for local scripts, Node's built-in test runner initially, optional JSON Schema export for non-TypeScript agents.

---

## Why This Is Worth Doing

A TypeScript port is a good call, but only if we treat it as a contract migration, not frontend rewrite theater.

Parley is becoming an agent-authored storytelling system. That means the hard problem is not just rendering prose. The hard problem is making sure every agent-produced artifact is shaped correctly, scoped correctly, and safe to commit:

- a GM agent proposes a turn;
- a lore validator returns a verdict;
- an NPC agent writes beliefs or reluctance-to-share notes;
- an authoring agent drafts a world/story template;
- a promotion agent proposes durable canon;
- an artist agent writes visual prompts and manifests.

If those are loose JSON blobs, this becomes agent soup. ARE YOU KIDDING ME levels of preventable pain.

Zod gives us a runtime boundary. TypeScript gives us development-time pressure. JSON Schema export gives non-TS agents and external tools the same contract.

## Current Dependency Snapshot

Queried from npm on 2026-05-03:

- `typescript`: `6.0.3`
- `zod`: `4.4.2`
- `tsx`: `4.21.0`
- `vitest`: `4.1.5`
- `@types/node`: `25.6.0`
- `zod-to-json-schema`: `3.25.2`

Use exact pinned versions when adding the lockfile. If TypeScript 6 causes ecosystem friction, fall back to the latest stable 5.x after checking `npm view typescript dist-tags` in the implementation PR.

## Recommendation

Proceed in four phases:

1. **Contract layer first**: add Zod schemas and parsers while leaving runtime JS mostly intact.
2. **Validation tooling second**: add CLI scripts agents can run before committing files.
3. **Instance runtime third**: bind the new schemas to the upcoming `instances/*` materializer/runtime.
4. **Full TS migration last**: rename runtime modules after contracts and tests prove the seam.

Do not port the UI first. That's backwards. The player-facing UI will keep changing. The artifact contracts need to get boring and strict now.

## Agent-Facing Tool Model

Agents should not freehand write arbitrary files. They should use small validated operations:

```text
agent proposes artifact
        │
        ▼
validate with Zod schema
        │
        ├── invalid: return precise field errors, write nothing
        │
        ▼
write to allowed instance path only
        │
        ▼
append audit event / provenance
```

Recommended tool surface:

- `parley validate <path>` validates a single artifact by schema version.
- `parley validate-instance <instance-dir>` validates an entire world/story instance.
- `parley create-turn --instance <dir> --json <file>` validates and appends a turn.
- `parley propose-fact --instance <dir> --json <file>` validates and appends a promotion candidate.
- `parley accept-promotion --instance <dir> --candidate <id>` validates transition rules before canon write.
- `parley export-schemas` writes JSON Schema files under `docs/schemas/generated/`.

This is the difference between "agents can extend stories" and "agents can corrupt the world with handcrafted JSON slop."

## Contract Boundaries

### Strict Schemas

Use strict Zod schemas for durable artifacts:

- `parley-world-template/v1`
- `parley-story-template/v1`
- `parley-world-instance/v1`
- `parley-story-instance/v1`
- `parley-turn/v1`
- `parley-truth-verdict/v1`
- `parley-character/v1`
- `parley-world-state/v1`
- `parley-visual-asset-manifest/v1`
- `parley-promotion-candidate/v1`
- `parley-promotion-decision/v1`
- `parley-story-attractor/v1`
- `parley-action-interpretation/v1`
- `parley-detour-scene/v1`
- `parley-story-consequence/v1`
- `parley-beat-redirect/v1`

Strict means unknown fields fail by default on committed artifacts. If we need extension space, define explicit `metadata` or `extensions` bags with namespaced keys.

### Loose Creative Seams

Keep these intentionally loose:

- player natural language input;
- narration prose;
- suggested action wording;
- LLM draft output before normalization;
- author notes and wiki markdown bodies.

The seam should be: loose input enters a normalizer, then strict artifact exits.

## Implementation Tasks

### Task 1: Add TypeScript toolchain without changing runtime behavior

**Objective:** Let the repo typecheck new TypeScript files while existing JS keeps running.

**Files:**

- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `src/contracts/index.ts`
- Create: `test/contracts/smoke.test.ts`

**Dependencies:**

```bash
npm install --save-exact zod@4.4.2
npm install --save-dev --save-exact typescript@6.0.3 tsx@4.21.0 @types/node@25.6.0
```

If TypeScript 6 breaks local tooling, use latest stable 5.x instead and document the reason in the PR.

**Scripts:**

```json
{
  "typecheck": "tsc --noEmit",
  "test:contracts": "node --test --import tsx test/contracts/*.test.ts"
}
```

**Verification:**

```bash
npm run typecheck
npm run test:contracts
npm test
npm run smoke:e2e
npm run smoke:scenarios
```

### Task 2: Define core artifact schemas

**Objective:** Create the strict artifact contract layer.

**Files:**

- Create: `src/contracts/common.ts`
- Create: `src/contracts/character.ts`
- Create: `src/contracts/turn.ts`
- Create: `src/contracts/truthVerdict.ts`
- Create: `src/contracts/worldState.ts`
- Create: `src/contracts/visualAssets.ts`
- Create: `src/contracts/instance.ts`
- Create: `src/contracts/promotion.ts`
- Create: `test/contracts/artifacts.test.ts`

**Required behavior:**

- Every schema has a `schema_version` literal.
- Every durable object has a stable `id` where appropriate.
- All committed schemas are `.strict()`.
- Path-like fields are relative paths only, no absolute paths and no `..` segments.
- Parse helpers return useful error summaries for agents.

**Example helper shape:**

```ts
import { z } from 'zod';

export function parseArtifact<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
    throw new Error(`Invalid Parley artifact: ${JSON.stringify(details, null, 2)}`);
  }
  return result.data;
}
```

### Task 3: Validate existing JSON examples and scenario packs

**Objective:** Prove the contracts describe the current repo, not an imaginary future repo.

**Files:**

- Create: `scripts/validate-parley-artifacts.ts`
- Modify: `package.json`
- Create: `test/contracts/current-fixtures.test.ts`

**Command:**

```bash
npm run validate:artifacts
```

**Required behavior:**

Validate:

- `docs/schemas/*.example.json`
- `scenarios/*/scenario.json`
- generated temp outputs from `runPlayerTurn`

If current files do not match the ideal contract, either:

1. update the artifact shape in a separate intentional commit, or
2. mark the schema as transitional and add a TODO with exact migration target.

No silent coercion for committed artifacts. Coercion is allowed only in normalizers that produce a typed artifact.

### Task 4: Export JSON Schema for agent/tool consumers

**Objective:** Give non-TypeScript agents a contract they can inspect before writing artifacts.

**Files:**

- Create: `scripts/export-parley-json-schemas.ts`
- Modify: `package.json`
- Create generated files under: `docs/schemas/generated/*.schema.json`

**Dependency:**

```bash
npm install --save-dev --save-exact zod-to-json-schema@3.25.2
```

**Command:**

```bash
npm run schemas:export
```

**Required behavior:**

- Generated schemas include `$id`, title, schema version, required fields, and no additional properties unless explicitly allowed.
- CI/test verifies generated schemas are up to date.
- Existing hand-written examples remain as examples, not the source of truth.

### Task 5: Add an agent validation CLI

**Objective:** Make validation usable by coding agents and authoring agents without importing app internals.

**Files:**

- Create: `src/cli/parley.ts`
- Create: `test/cli/validate.test.ts`
- Modify: `package.json`

**Commands:**

```bash
node --import tsx src/cli/parley.ts validate docs/schemas/parley-turn.v1.example.json
node --import tsx src/cli/parley.ts validate-instance /tmp/parley-instance-test
```

**Required behavior:**

- Exits `0` for valid artifacts.
- Exits non-zero for invalid artifacts.
- Prints field-level errors that an agent can use to repair output.
- Refuses unknown `schema_version` values.
- Refuses absolute paths and path traversal in artifact fields.

### Task 6: Bind schemas to instance runtime writes

**Objective:** Ensure every future instance write goes through a parser.

**Files likely touched after instance materializer exists:**

- `src/runtime/instances/materialize.ts`
- `src/runtime/instances/loadInstance.ts`
- `src/runtime/instances/promotion.ts`
- `src/runtime/parleyRuntime.ts`
- `test/instances/*.test.ts`

**Required behavior:**

- Materializer validates generated `instance.json` and story instance metadata.
- Runtime validates turn and truth verdict before append.
- Promotion helper validates candidate before append and decision before canon write.
- Loading state validates JSON/JSONL before returning to the UI or agents.

### Task 7: Migrate JS runtime modules gradually

**Objective:** Port runtime files only after contracts and tests are in place.

**Order:**

1. `src/runtime/turnAuthor.js` → `turnAuthor.ts`
2. `src/runtime/truthAuthority.js` → `truthAuthority.ts`
3. `src/runtime/visualAssets.js` → `visualAssets.ts`
4. `src/runtime/scenarioPacks.js` → `scenarioPacks.ts`
5. `src/runtime/parleyRuntime.js` → `parleyRuntime.ts`
6. `src/server.js` → `server.ts`
7. UI last, only if we choose a frontend framework/bundler.

**Rule:** after each module rename, run:

```bash
npm run typecheck
npm test
npm run smoke:runtime
npm run smoke:e2e
npm run smoke:scenarios
npm run validate:artifacts
```

## Anti-Goals

- No big-bang TypeScript rewrite.
- No framework switch bundled into the contract migration.
- No DB.
- No generated ORM layer.
- No agents writing templates during gameplay.
- No accepting LLM output directly into canon without validation and promotion rules.
- No making Zod schemas so loose they become decorative comments. bro that would be fake safety.

## Acceptance Criteria

The migration is successful when:

- committed artifacts are validated by Zod before writes;
- existing schema examples and scenario packs validate;
- JSON Schema export exists for non-TypeScript agents;
- CLI validation returns actionable field errors;
- runtime tests prove invalid turn/verdict/promotion artifacts do not persist;
- instance path guards and schema validation work together;
- agents have a documented contract for extending stories without corrupting templates or world canon.

## Product Implication

This makes Parley more than a game UI. It becomes an authorable story operating system:

- humans can write lore in Markdown and JSON;
- agents can draft story material;
- validators can reject malformed or out-of-scope changes;
- DMs can promote durable changes;
- UI can trust the data it renders.

That is the right foundation before richer themes, more scenarios, or real agent-authored campaigns.
