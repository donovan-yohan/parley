# Strict World Contract / Loose Authoring Split

> **STATUS:** The "Instance-Bound Future Context" section at the bottom of this
> spec is now the present: the instance layer shipped in PRs #21-#25
> (2026-05-04). The loose author receives an instance-derived gameplay packet,
> not raw template paths. See `docs/plans/2026-05-04-belayer-profile-coupling.md`
> for the as-shipped scope.

Parley should not make deterministic scenario fixtures the long-term storytelling brain. The runtime split is:

## Loose authoring seam

`runPlayerTurn` accepts a `turnAuthor` object with:

```js
{
  id: "llm-turn-author",
  mode: "llm-style-authoring",
  async authorTurn(context) {
    return {
      responseId,
      narration,
      nextChoices,
      proposedFacts
    };
  }
}
```

The author receives runtime context:

- `turnId`
- `scenario`
- `scene`
- `playerAction`
- `characters`
- `previousWorldState`

This is where fuzzy behavior belongs: player intent classification, response drafting, next-choice suggestion, and proposed fact extraction.

The current scenario packs use `createScenarioFixtureAuthor()` as a deterministic demo author. Its `matchAny` routing is a fixture implementation detail, not a framework contract.

## Strict continuity seam

After authoring, the runtime normalizes the authored turn and sends it through the truth authority. The strict side owns:

- truth verdict schema
- canon / rumor / lead / belief / unresolved categories
- evidence turn IDs
- hidden-truth boundaries
- durable world state merging
- reusable character records
- persisted turns and truth verdicts

Unsupported player claims should not become canon simply because the author wrote nice prose. They must be proposed as inspectable facts and accepted by the truth authority. The current mock continuity editor only accepts canon facts that already exist in the scenario/world contract; newly invented assertions must be represented as belief, rumor, lead, or unresolved until a stronger world-authoring flow explicitly promotes them.

## Why this matters

The product claim is not "we wrote three nice scenario scripts." The claim is that Parley can let language stay flexible while keeping world state durable and inspectable.

That means:

- deterministic demo scenarios are allowed as fixtures;
- the runtime must be able to swap in an LLM-style author without rewriting persistence, truth review, or UI state;
- scenario facts are evidence-scoped, not globally committed;
- fallback/off-script turns preserve earlier state without fabricating unsupported leads.

## Current implementation

- `src/runtime/turnAuthor.js` defines the loose author seam and the deterministic fixture author.
- `src/runtime/parleyRuntime.js` calls the author, normalizes the result, awaits the truth authority, validates the verdict shape, then commits only through the truth authority/world-state path.
- `test/parley-runtime.test.js` includes custom `turnAuthor` regression tests proving:
  - an unmatched player action can be authored by a loose author while the strict truth contract still governs persisted state;
  - async truth authorities are awaited before persistence;
  - loose authors cannot directly commit unsupported canon or spoof an allowed canon ID with different text.

## Instance-Bound Future Context

The future LLM-style author should not receive raw template paths or template
records. Deterministic setup code should first materialize the chosen world and
story templates into an active world/story instance. The author then receives an
instance-derived gameplay packet:

- active world instance summary;
- active story instance summary;
- active scene;
- player action;
- present characters with filtered knowledge/sharing guidance;
- previous instance state;
- recent story-log summary.

It should not receive `worlds/<template-id>/...`, `scenarios/<template-id>/...`,
or full hidden-truth material unless the role is explicitly GM/validator rather
than in-character NPC. See
[`parley-template-instance-source-of-truth.md`](./parley-template-instance-source-of-truth.md)
and [`parley-character-knowledge-privacy.md`](./parley-character-knowledge-privacy.md).
