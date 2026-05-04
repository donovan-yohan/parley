import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function writeWorldInstanceEvaluation({
  instanceDir,
  storyId,
  evaluation,
  validateEvaluation = null,
}) {
  if (validateEvaluation) validateEvaluation(evaluation);
  const storyDir = path.join(instanceDir, storyId);
  await mkdir(storyDir, { recursive: true });
  const evalPath = path.join(storyDir, "world-instance-evaluation.json");
  await writeFile(evalPath, JSON.stringify(evaluation, null, 2) + "\n", "utf8");
  return { evalPath };
}
