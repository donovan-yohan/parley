#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BELAYER_BIN="${BELAYER_BIN:-belayer}"
SMOKE_HOME="${BELAYER_HOME:-}"

if [[ -z "$SMOKE_HOME" ]]; then
  SMOKE_HOME="$(mktemp -d)"
  trap 'rm -rf "$SMOKE_HOME"' EXIT
fi
export BELAYER_HOME="$SMOKE_HOME"

"$BELAYER_BIN" crag init last-lantern --kind story --description "Parley Last Lantern smoke crag" >/dev/null
"$BELAYER_BIN" crag link last-lantern --target "$ROOT" >/dev/null
"$BELAYER_BIN" talent generated persist last-lantern mara-underbough \
  --domain story \
  --role tavernkeep \
  --lifecycle resumable \
  --status generated \
  --source-request turn-0002 \
  --reason "The player asked about old roads and the scene needs a reusable local authority." \
  --metadata "voice=warm and watchful" \
  --metadata "constraint=does not know hidden author-only truth" \
  --note "First appeared in examples/last-lantern/artifacts/turns.jsonl." \
  --force >/dev/null

LIST="$("$BELAYER_BIN" talent generated list last-lantern)"
EXPECTED=$'mara-underbough\tstory\ttavernkeep\tresumable\tgenerated'
if [[ "$LIST" != *"$EXPECTED"* ]]; then
  echo "generated talent list did not include expected row" >&2
  echo "$LIST" >&2
  exit 1
fi

TALENT_FILE="$BELAYER_HOME/crags/last-lantern/generated-talents/mara-underbough/talent.yaml"
if ! grep -q "schema_version: belayer-generated-talent/v1" "$TALENT_FILE"; then
  echo "generated talent record missing schema version: $TALENT_FILE" >&2
  exit 1
fi
if ! grep -q "source_request: turn-0002" "$TALENT_FILE"; then
  echo "generated talent record missing source request: $TALENT_FILE" >&2
  exit 1
fi

for artifact in \
  "$ROOT/examples/last-lantern/artifacts/talent-request-tavernkeep.json" \
  "$ROOT/examples/last-lantern/artifacts/turns.jsonl" \
  "$ROOT/examples/last-lantern/artifacts/world-state.json" \
  "$ROOT/examples/last-lantern/artifacts/gate-result-continuity.json"; do
  test -s "$artifact"
done

echo "Last Lantern smoke passed with BELAYER_HOME=$BELAYER_HOME"
