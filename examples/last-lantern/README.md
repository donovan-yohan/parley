# Last Lantern Belayer Smoke

This example is Parley's first consuming smoke test for Belayer generated talent
persistence. Parley owns the story terms. Belayer only sees a crag, a generated
talent record, artifact paths, and a gate result.

Run from this repository root:

```bash
BELAYER_BIN=/path/to/belayer ./scripts/smoke-last-lantern.sh
```

The script creates a temporary `BELAYER_HOME`, initializes a `last-lantern`
crag, links this repo to it, persists `mara-underbough` as generated resumable
talent, and verifies that Belayer can list the generated talent from the crag
pool.

The static artifacts in `artifacts/` draft the product-facing scene loop:

1. The player enters the tavern and asks about old roads.
2. The Game Master emits a Belayer `talent-request` for a tavernkeep.
3. Belayer persists the generated talent record mechanically.
4. The Game Master turns the tavernkeep response into player-facing narration.
5. A continuity gate confirms the scene is coherent and can continue.
