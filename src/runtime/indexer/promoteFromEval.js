import { readFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function promoteFromEval({
  evalArtifactPath,
  worldDir,                      // e.g. worlds/<world-id>/
  acceptCandidate,               // (candidate) => Promise<boolean> — DM accepts/rejects
  belayerPromote,                // injectable: (evalPath) => Promise<{ ok: boolean, stderr?: string }>
}) {
  const raw = await readFile(evalArtifactPath, "utf8");
  const eval_ = JSON.parse(raw);
  const candidates = eval_.promotion_candidates ?? [];
  const accepted = [];
  const rejected = [];

  for (const candidate of candidates) {
    const accept = await acceptCandidate(candidate);
    if (accept) {
      accepted.push(candidate);
    } else {
      rejected.push(candidate);
    }
  }

  if (accepted.length === 0) {
    return { ok: true, accepted: [], rejected, belayerInvoked: false };
  }

  // Hand off to belayer promote (it owns the official promotion side-effect).
  const belayerResult = await belayerPromote({ evalPath: evalArtifactPath, accepted });
  if (!belayerResult.ok) {
    return { ok: false, accepted, rejected, belayerInvoked: true, error: belayerResult.stderr ?? "belayer promote failed" };
  }

  // Append accepted facts into worlds/<world-id>/lore/promoted-facts.jsonl
  const loreDir = path.join(worldDir, "lore");
  await mkdir(loreDir, { recursive: true });
  const promotedPath = path.join(loreDir, "promoted-facts.jsonl");
  for (const cand of accepted) {
    await appendFile(promotedPath, JSON.stringify({
      ...cand,
      promoted_at: new Date().toISOString(),
      source_eval: path.basename(evalArtifactPath)
    }) + "\n", "utf8");
  }

  return { ok: true, accepted, rejected, belayerInvoked: true, promotedPath };
}
