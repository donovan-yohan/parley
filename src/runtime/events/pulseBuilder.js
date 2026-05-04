import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { readStoryEvents } from "./storyEventLog.js";

export async function buildScenePulse({
  instanceDir,
  storyId,
  rosterFn = null, // optional: () => { awake: [...], dormant: [...] } from Belayer roster
  validatePulse = null, // optional: ScenePulseSchema.parse
}) {
  const events = await readStoryEvents({ instanceDir, storyId });

  const tensions = new Set();
  const consequences = new Set();
  const leads = new Set();
  const intentions = [];
  const unresolved = new Set();
  let lastTurnId = "turn-0000";

  for (const ev of events) {
    if (ev.type === "turn.committed") {
      if (ev.refs?.turn_id) lastTurnId = ev.refs.turn_id;
    }
    if (ev.type === "tension.surfaced" && ev.inputs?.summary) tensions.add(ev.inputs.summary);
    if (ev.type === "consequence.recorded" && ev.inputs?.summary)
      consequences.add(ev.inputs.summary);
    if (ev.type === "lead.surfaced" && ev.inputs?.summary) leads.add(ev.inputs.summary);
    if (ev.type === "intention.set" && ev.actor_id && ev.inputs?.intention) {
      intentions.push({ actor_id: ev.actor_id, intention: ev.inputs.intention });
    }
    if (ev.type === "thread.unresolved" && ev.inputs?.summary) unresolved.add(ev.inputs.summary);
  }

  const roster = rosterFn ? await rosterFn() : { awake: [], dormant: [] };

  const pulse = {
    schema_version: "parley-scene-pulse/v1",
    story_id: storyId,
    current_turn_id: lastTurnId,
    active_tensions: Array.from(tensions),
    visible_consequences: Array.from(consequences),
    current_leads: Array.from(leads),
    npc_intentions: intentions,
    unresolved_threads: Array.from(unresolved),
    awake_npcs: roster.awake,
    dormant_npcs: roster.dormant,
    generated_at: new Date().toISOString(),
  };

  if (validatePulse) validatePulse(pulse);

  const stateDir = path.join(instanceDir, storyId, "state");
  await mkdir(stateDir, { recursive: true });
  const pulsePath = path.join(stateDir, "scene-pulse.json");
  await writeFile(pulsePath, JSON.stringify(pulse, null, 2) + "\n", "utf8");
  return { pulse, pulsePath };
}
