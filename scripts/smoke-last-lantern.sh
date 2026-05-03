#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BELAYER_BIN="${BELAYER_BIN:-belayer}"
SMOKE_HOME="${SMOKE_BELAYER_HOME:-}"
CLEANUP_SMOKE_HOME=0

if ! command -v "$BELAYER_BIN" >/dev/null 2>&1; then
  echo "Belayer smoke requires BELAYER_BIN to point at a belayer executable." >&2
  echo "Current BELAYER_BIN=$BELAYER_BIN" >&2
  exit 1
fi

if ! "$BELAYER_BIN" crag --help >/dev/null 2>&1; then
  echo "Belayer smoke requires a belayer build with crag support." >&2
  echo "The installed '$BELAYER_BIN' does not expose 'belayer crag'." >&2
  echo "Use a newer Belayer source build, then rerun with BELAYER_BIN=/path/to/belayer." >&2
  exit 1
fi

GENERATED_CMD=()
if "$BELAYER_BIN" team generated --help >/dev/null 2>&1; then
  GENERATED_CMD=("$BELAYER_BIN" team generated)
elif "$BELAYER_BIN" talent generated --help >/dev/null 2>&1; then
  GENERATED_CMD=("$BELAYER_BIN" talent generated)
else
  echo "Belayer smoke requires generated talent support." >&2
  echo "Expected either 'belayer team generated' or legacy 'belayer talent generated'." >&2
  echo "Use a newer Belayer source build, then rerun with BELAYER_BIN=/path/to/belayer." >&2
  exit 1
fi

if [[ -z "$SMOKE_HOME" ]]; then
  SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/parley-last-lantern.XXXXXX")"
  CLEANUP_SMOKE_HOME=1
fi
if [[ "$CLEANUP_SMOKE_HOME" -eq 1 ]]; then
  trap 'rm -rf "$SMOKE_HOME"' EXIT
fi
export BELAYER_HOME="$SMOKE_HOME"

"$BELAYER_BIN" crag init last-lantern --kind story --description "Parley Last Lantern smoke crag" >/dev/null
"$BELAYER_BIN" crag link last-lantern --target "$ROOT" >/dev/null
"${GENERATED_CMD[@]}" persist last-lantern mara-underbough \
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

LIST="$("${GENERATED_CMD[@]}" list last-lantern)"
if ! grep -Eq '(^|[[:space:]])mara-underbough[[:space:]]+story[[:space:]]+tavernkeep[[:space:]]+resumable[[:space:]]+generated($|[[:space:]])' <<<"$LIST"; then
  echo "generated talent list did not include expected row" >&2
  echo "$LIST" >&2
  exit 1
fi

if ! TALENT="$("$BELAYER_BIN" talent generated show last-lantern mara-underbough)"; then
  echo "failed to inspect generated talent via Belayer CLI" >&2
  exit 1
fi
if ! grep -qE '"?schema_version"?[[:space:]]*:[[:space:]]*"?belayer-generated-talent/v1"?' <<<"$TALENT"; then
  echo "generated talent record missing schema version" >&2
  echo "$TALENT" >&2
  exit 1
fi
if ! grep -qE '"?source_request"?[[:space:]]*:[[:space:]]*"?turn-0002"?' <<<"$TALENT"; then
  echo "generated talent record missing source request" >&2
  echo "$TALENT" >&2
  exit 1
fi

for artifact in \
  "$ROOT/examples/last-lantern/artifacts/talent-request-tavernkeep.json" \
  "$ROOT/examples/last-lantern/artifacts/turns.jsonl" \
  "$ROOT/examples/last-lantern/artifacts/world-state.json" \
  "$ROOT/examples/last-lantern/artifacts/gate-result-continuity.json"; do
  if [[ ! -s "$artifact" ]]; then
    echo "artifact missing or empty: $artifact" >&2
    exit 1
  fi
done

echo "Last Lantern smoke passed with BELAYER_HOME=$BELAYER_HOME"
