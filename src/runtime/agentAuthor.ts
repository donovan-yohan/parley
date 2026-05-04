/**
 * Agent-Author Seam — Part 1b
 *
 * Defines the typed contract between the Parley shell and any turn-authoring agent.
 * The mock implementation wraps the /api/turn endpoint so the shell never imports
 * parleyRuntime directly. When belayer-profile-coupling lands, replace
 * createMockAgentTurnAuthor with createLiveAgentTurnAuthor(); the interface is unchanged.
 */

// TODO: Replace this local ProposedFact type with an import from src/contracts/ once
// the contracts package adds ProposedFact as a top-level export.
// For now it mirrors the shape emitted by normalizeProposedFacts in turnAuthor.js.

/** A fact proposed by the turn author for the truth-authority to judge. */
export interface ProposedFact {
  id: string;
  category: "canon" | "rumor" | "lead" | "belief" | "unresolved";
  text: string;
  evidence_turn: string;
  [key: string]: unknown;
}

// StoryConsequence and BeatRedirect are imported from contracts where available.
import type { StoryConsequence } from "../contracts/storyConsequence.js";
import type { BeatRedirect } from "../contracts/beatRedirect.js";
import { fetchJSON } from "../sdk/utils.js";

export type { StoryConsequence, BeatRedirect };

/** Input to authorTurn — describes the current game state for one turn. */
export interface TurnInput {
  worldId: string;
  instanceId: string;
  storyId: string;
  /**
   * Monotonic per-story-instance turn identifier (e.g. "turn-0001").
   * Subject to widening when belayer-profile-coupling lands.
   */
  turnId: string;
  playerAction: string;
  scene: { id: string; name: string };
  /**
   * Optional: resolved instance directory path passed from the server callsite.
   * The live agent receives a different env; this field is temporary.
   * TODO: remove when belayer-profile-coupling lands its own env handling.
   */
  instanceDir?: string;
}

/** The structured response the shell needs from a turn-authoring agent. */
export interface AuthoredTurn {
  responseId: string;
  narration: string;
  speakers: Array<{ characterId: string; quote: string }>;
  nextChoices: string[];
  proposedFacts: ProposedFact[];
  storyConsequence?: StoryConsequence | null;
  beatRedirect?: BeatRedirect | null;
}

/** The contract any turn-authoring agent must satisfy. */
export interface AgentTurnAuthor {
  id: string;
  mode: "mock-agent" | "live-agent";
  authorTurn(input: TurnInput): Promise<AuthoredTurn>;
}

/**
 * Creates a mock AgentTurnAuthor that routes turns through the /api/turn endpoint.
 * The endpoint adapts the result to the AuthoredTurn shape server-side.
 *
 * This is the only turn-author the shell instantiates in 1b. When
 * belayer-profile-coupling lands, createLiveAgentTurnAuthor() replaces this with
 * no changes to shell code.
 */
export function createMockAgentTurnAuthor(): AgentTurnAuthor {
  return {
    id: "mock-agent-v1",
    mode: "mock-agent",
    async authorTurn(input: TurnInput): Promise<AuthoredTurn> {
      // fetchJSON owns the !ok-with-body error shape; agentAuthor stays a thin
      // typed adapter on top so the SDK and the seam never drift in how they
      // surface HTTP failures.
      return fetchJSON<AuthoredTurn>("/api/turn", {
        method: "POST",
        body: JSON.stringify({
          worldId: input.worldId,
          instanceId: input.instanceId,
          storyId: input.storyId,
          playerAction: input.playerAction
        })
      });
    }
  };
}
