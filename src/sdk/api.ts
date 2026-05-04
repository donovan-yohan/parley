import { fetchJSON } from "./utils.js";
import type { AuthoredTurn } from "../runtime/agentAuthor.js";

export interface WorldSummary {
  id: string;
  name: string;
  premise: string;
  tone: string;
  cover?: string;
  scenarios: string[];
}

export async function getWorlds(): Promise<WorldSummary[]> {
  const data = await fetchJSON<{ worlds: WorldSummary[] }>("/api/worlds");
  return data.worlds;
}

export interface InstanceSummary {
  worldId: string;
  instanceId: string;
  displayName: string;
  createdAt: string;
  lastPlayedAt: string | null;
}

export async function getInstance(worldId: string, instanceId: string): Promise<InstanceSummary> {
  return fetchJSON<InstanceSummary>(`/api/instances/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}`);
}

export async function createInstance(worldId: string, displayName?: string): Promise<InstanceSummary> {
  return fetchJSON<InstanceSummary>("/api/instances", {
    method: "POST",
    body: JSON.stringify({ worldId, displayName })
  });
}

export interface StorySummary {
  worldId: string;
  instanceId: string;
  storyId: string;
  status: "in_progress" | "completed" | "abandoned";
  turnCount: number;
}

export async function getStory(opts: { worldId: string; instanceId: string; storyId: string }): Promise<StorySummary> {
  const params = new URLSearchParams({
    world: opts.worldId,
    instance: opts.instanceId,
    story: opts.storyId
  });
  return fetchJSON<StorySummary>(`/api/story?${params.toString()}`);
}

export async function getStories(worldId: string, instanceId: string): Promise<{ templates: string[]; instances: StorySummary[] }> {
  const params = new URLSearchParams({ world: worldId, instance: instanceId });
  return fetchJSON<{ templates: string[]; instances: StorySummary[] }>(`/api/stories?${params.toString()}`);
}

export async function createStory(worldId: string, instanceId: string, storyTemplateId: string): Promise<StorySummary> {
  return fetchJSON<StorySummary>("/api/stories", {
    method: "POST",
    body: JSON.stringify({ worldId, instanceId, storyTemplateId })
  });
}

export interface RunTurnInput {
  worldId: string;
  instanceId: string;
  storyId: string;
  playerAction: string;
}

export async function runTurn(input: RunTurnInput): Promise<AuthoredTurn> {
  return fetchJSON<AuthoredTurn>("/api/turn", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
