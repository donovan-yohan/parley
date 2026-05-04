# Web UI Redesign — Part 1b Implementation Plan (Preact shell + @parley/sdk + agent-author stub)

> **For agentic workers:** Use superpowers:subagent-driven-development with parallel where marked. 3 review checkpoints (after Setup, after Foundation, after Tests).

**Goal:** Replace `src/client/` raw HTML/JS with `src/shell/` (Preact + Vite + TS). Stand up the `@parley/sdk` package, the slot infrastructure, the typed agent-author seam stub, and the new API endpoints — all rendering the existing UX shape (single-page scenario picker + transcript) so the framework swap is verifiably behaviour-preserving.

**Architecture:** Single Vite project at repo root. Shell builds to `dist/`. SDK lives in `src/sdk/` and is imported as `@parley/sdk` via tsconfig path + Vite alias. New endpoints land alongside the existing ones (old endpoints removed in 1d, not 1b). Agent-author seam wraps existing `runPlayerTurn` so the shell never imports the fixture.

**Tech Stack:** Preact 10, Vite 5, TypeScript 5, `tsx` (existing). Adds: `preact`, `vite`, `@preact/preset-vite`. No removal of existing deps.

**Source spec:** `docs/specs/2026-05-04-web-ui-redesign-design.md` — sections "World Plugin Model", "Build Pipeline", "Agent-Author Seam".

**Decisions inherited:**
- `@parley/sdk` package, not `__PARLEY_SDK__` magic specifier (eng-review D1A).
- Worlds-loader lazy + manifest at boot (eng-review D1B). Manifest emission lands in 1c when there's something to discover; 1b just stubs the loader interface.
- JS sandbox caveat is doc-only for now (eng-review D1C, already in spec).
- Bundle budgets enforced (eng-review D4A) — 1b adds the `scripts/check-bundle-budgets.mjs` skeleton; thresholds checked once shell is buildable.

---

## File Structure

**New:**
- `package.json` — add preact, @preact/preset-vite, vite as devDeps; add `build` + `dev` scripts.
- `vite.config.ts` — single shell entry; `@parley/sdk` aliased to `src/sdk/index.ts`.
- `tsconfig.json` — extend with `paths` for `@parley/sdk` + `jsx: "preserve"` + `jsxImportSource: "preact"`.
- `src/sdk/index.ts` — package entrypoint; re-exports h, Fragment, hooks, components, api, utils, slots.
- `src/sdk/api.ts` — typed API client (`getWorlds`, `getInstance`, `getStory`, `runTurn`).
- `src/sdk/utils.ts` — `fetchJSON`, `cn`, `timeAgo`, `useI18n` stub.
- `src/sdk/slots.ts` — `registerSlot`, `useSlot`, `SlotName`, `SlotContext`, `PluginSlot` component.
- `src/sdk/components/index.ts` — re-exports Card, Button, Tabs, Drawer, Backdrop, ChoiceList.
- `src/sdk/components/Card.tsx`, `Button.tsx`, `Tabs.tsx`, `Drawer.tsx`, `Backdrop.tsx`, `ChoiceList.tsx` — minimal shadcn-style primitives.
- `src/shell/index.html` — Vite entry.
- `src/shell/main.tsx` — mounts shell, populates `window.__PARLEY_SDK__` for future world bundles.
- `src/shell/SinglePageApp.tsx` — renders the existing UX shape (scenario picker dropdown + transcript + input).
- `src/runtime/agentAuthor.ts` — `TurnInput`, `AuthoredTurn`, `AgentTurnAuthor`, `createMockAgentTurnAuthor` (wraps `runPlayerTurn` to expose new shape).
- `scripts/check-bundle-budgets.mjs` — post-build script; in 1b just records sizes (no fail), thresholds activate in 1c+.
- `test/agent-author-seam.test.js` — TurnInput/AuthoredTurn shape conformance + mock author behavior.
- `test/sdk-api.test.js` — API client unit tests against in-process server.
- `test/sdk-slots.test.js` — registerSlot, useSlot, fallback behavior.
- `test/server-new-endpoints.test.js` — new endpoint coverage.
- `test/shell-smoke.test.js` — shell builds + serves; root HTML + main.tsx mount.

**Modified:**
- `src/server.js` — add new endpoints alongside existing ones. Old `/api/scenarios` + `?scenario=` stay until 1d.
- `package.json` scripts — `dev`, `build`, `start` updated.

**Untouched (1b only):**
- `src/client/*` — removed in 1d, not 1b.
- All existing tests for old endpoints.

---

## Group A — Vite/Preact/TS Scaffolding (PARALLEL)

### Task A1: Update `package.json` deps + scripts [PARALLEL]

- [ ] Add deps: `preact@^10.19.0`, `vite@^5.4.0`, `@preact/preset-vite@^2.10.0`, `typescript@^5.9.0` (already present).
- [ ] Update scripts: keep `start: node src/server.js`; add `dev: vite`, `build: vite build`, `preview: vite preview`.
- [ ] `npm install` to update lockfile.

### Task A2: Create `vite.config.ts` [PARALLEL]

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';

export default defineConfig({
  plugins: [preact()],
  root: 'src/shell',
  resolve: {
    alias: {
      '@parley/sdk': path.resolve(__dirname, 'src/sdk/index.ts')
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/shell-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/world-assets': 'http://127.0.0.1:4173'
    }
  }
});
```

### Task A3: Update `tsconfig.json` [PARALLEL]

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "preact",
    "strict": true,
    "esModuleInterop": false,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@parley/sdk": ["./src/sdk/index.ts"],
      "@parley/sdk/*": ["./src/sdk/*"]
    }
  },
  "include": ["src/**/*", "scripts/**/*", "test/**/*"]
}
```

**Checkpoint 1:** `npm install` clean, `npm run typecheck` passes (will pass trivially since no Preact code yet), 146/146 baseline tests still pass.

Commit: `chore(1b): scaffold Vite + Preact + TS toolchain`

---

## Group B — SDK + Shell + Endpoints + Agent Seam (one subagent, sequential within)

This is the bulk of 1b. One subagent carries B1–B6.

### B1: SDK utilities (`src/sdk/utils.ts`)

Plain TS — no Preact needed. `fetchJSON<T>(url, init?): Promise<T>`, `cn(...args: string[]): string`, `timeAgo(date): string`, `useI18n` is a stub returning the input string.

### B2: SDK components (`src/sdk/components/*.tsx`)

Six primitives: `Card`, `Button`, `Tabs`, `Drawer`, `Backdrop`, `ChoiceList`. Each is a Preact functional component using `h` and `useState` from `preact/hooks`. Style via CSS modules or inline; don't pull in tailwind. Aim for minimum viable surface — no animations, no a11y polish (those land in 1c/1d). `Card`: bordered container. `Button`: button with variant prop. `Tabs`: rail + content panel. `Drawer`: slide-out (used for cast/canon in 1d). `Backdrop`: full-bleed image holder. `ChoiceList`: vertical button list.

### B3: SDK api client (`src/sdk/api.ts`)

```ts
export interface WorldSummary {
  id: string;
  name: string;
  premise: string;
  tone: string;
  cover?: string;
  scenarios: string[];
}

export async function getWorlds(): Promise<WorldSummary[]> {
  return fetchJSON('/api/worlds');
}

export interface InstanceSummary {
  worldId: string;
  instanceId: string;
  displayName: string;
  createdAt: string;
  lastPlayedAt: string | null;
}

export async function getInstance(worldId: string, instanceId: string): Promise<InstanceSummary> { ... }

export interface StorySummary {
  worldId: string;
  instanceId: string;
  storyId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  turnCount: number;
}

export async function getStory(opts: { worldId: string; instanceId: string; storyId: string }): Promise<StorySummary> { ... }

export interface RunTurnInput {
  worldId: string;
  instanceId: string;
  storyId: string;
  playerAction: string;
}

export async function runTurn(input: RunTurnInput): Promise<AuthoredTurn> {
  return fetchJSON('/api/turn', { method: 'POST', body: JSON.stringify(input) });
}
```

### B4: SDK slots (`src/sdk/slots.ts`)

```ts
export type SlotName =
  | 'scene-backdrop' | 'dialogue-frame' | 'header-crest'
  | 'header-tagline' | 'sidebar-rail' | 'inventory-rail' | 'footer-tagline';

export interface SlotContext {
  worldId: string;
  instanceId: string;
  storyId?: string;
}

type SlotComponent = (props: SlotContext & Record<string, unknown>) => preact.VNode | null;

const slotRegistry = new Map<string, Map<SlotName, SlotComponent>>();

export function registerSlot(worldId: string, slot: SlotName, component: SlotComponent): void { ... }

export function useSlot(slot: SlotName, context: SlotContext): SlotComponent | null { ... }

export const PluginSlot = ({ slot, context, fallback }: { slot: SlotName; context: SlotContext; fallback?: SlotComponent }) => {
  const Component = useSlot(slot, context) ?? fallback ?? (() => null);
  return h(Component, context);
};
```

### B5: Agent-author seam (`src/runtime/agentAuthor.ts`)

```ts
import { runPlayerTurn } from './parleyRuntime.js';

export interface TurnInput {
  worldId: string;
  instanceId: string;
  storyId: string;
  turnId: string;
  playerAction: string;
  scene: { id: string; name: string };
}

export interface AuthoredTurn {
  responseId: string;
  narration: string;
  speakers: Array<{ characterId: string; quote: string }>;
  nextChoices: string[];
  proposedFacts: ProposedFact[];
  storyConsequence?: StoryConsequence | null;
  beatRedirect?: BeatRedirect | null;
}

export interface AgentTurnAuthor {
  id: string;
  mode: 'mock-agent' | 'live-agent';
  authorTurn(input: TurnInput): Promise<AuthoredTurn>;
}

export function createMockAgentTurnAuthor(): AgentTurnAuthor {
  return {
    id: 'mock-agent-v1',
    mode: 'mock-agent',
    async authorTurn(input) {
      // Wraps existing runPlayerTurn to produce an AuthoredTurn-shaped response.
      // The shell never imports parleyRuntime directly; this is the only seam.
      const result = await runPlayerTurn({
        scenarioId: input.worldId,
        playerAction: input.playerAction,
        instanceDir: undefined  // server callsite resolves the real instanceDir
      });
      return adaptResultToAuthoredTurn(result);
    }
  };
}
```

### B6: New API endpoints in `src/server.js`

Add (alongside existing — do NOT remove old ones):
- `GET /api/worlds` — read every `worlds/*/world.json`, return summaries.
- `GET /api/instances?world=<id>` — list `instances/<id>/*` directories.
- `POST /api/instances` body `{worldId, displayName?}` — create `instances/<world-id>/playthrough-<N>/`.
- `GET /api/stories?world=<id>&instance=<id>` — list scenarios available for the world plus story instances under `instances/<world-id>/<instance-id>/stories/`.
- `POST /api/stories` body `{worldId, instanceId, storyTemplateId}` — create `instances/.../stories/<story-id>/`.
- `GET /api/story?world=<id>&instance=<id>&story=<id>` — return story instance state (transcript, status, last turn).
- `POST /api/turn` extended — accept `{worldId, instanceId, storyId, playerAction}` body and route through `createMockAgentTurnAuthor()`. Old shape `{scenarioId, playerAction}` still accepted and routes to the same author for back-compat in 1b (1d removes back-compat).

### B7: Shell mount + SinglePageApp

`src/shell/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Parley</title></head>
<body><div id="app"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`src/shell/main.tsx`:
```tsx
import { h, render } from 'preact';
import * as sdk from '@parley/sdk';
import { SinglePageApp } from './SinglePageApp';

(window as any).__PARLEY_SDK__ = sdk;
(window as any).__PARLEY_PLUGINS__ = { register: sdk.registerSlot, registerSlot: sdk.registerSlot };

render(h(SinglePageApp, {}), document.getElementById('app')!);
```

`src/shell/SinglePageApp.tsx` — Preact rebuild of the existing scenario picker + transcript UI. Same dropdown, same layout, same look. Calls new endpoints (`getWorlds` instead of `getScenarios`); back-compat in server bridges any data-shape gap. Goal: visible behaviour matches today's `src/client/` exactly.

**Checkpoint 2:** Shell builds (`npm run build`); shell renders in browser; clicking through scenario picker + submitting input produces a transcript turn through the agent-author seam. 146 baseline tests still pass.

Commit: `feat(1b): Preact shell + @parley/sdk package + agent-author seam stub`

---

## Group C — Tests (PARALLEL)

### C1: Agent-author seam tests (`test/agent-author-seam.test.js`) [PARALLEL]
Mock author returns AuthoredTurn-shaped data; shape covers required + optional fields; deterministic for same input.

### C2: SDK API client tests (`test/sdk-api.test.js`) [PARALLEL]
Each function makes the right request; parses response; surfaces server errors.

### C3: SDK slots tests (`test/sdk-slots.test.js`) [PARALLEL]
Register + useSlot returns component; unregistered → fallback; duplicate-register replaces (last-wins); register-after-useSlot triggers update.

### C4: New endpoint tests (`test/server-new-endpoints.test.js`) [PARALLEL]
GET /api/worlds returns 3 worlds; GET /api/instances returns the 3 playthrough-1 instances; POST /api/instances creates playthrough-N (auto-numbered); POST /api/turn with new shape works AND old shape still works (back-compat).

### C5: Shell smoke (`test/shell-smoke.test.js`) [PARALLEL]
Vite build emits `dist/index.html` + `dist/assets/shell-*.js`; main.tsx populates `window.__PARLEY_SDK__` with expected exports.

**Checkpoint 3:** `npm test` passes — 146 baseline + ~20–25 new = ~170 total. `npm run build` emits dist/. `npm run typecheck` clean.

Commit: `test(1b): SDK + slots + agent-author + endpoints + shell smoke coverage`

---

## Out of scope for 1b (deferred to 1c/1d)

- Theme cascade YAML → CSS vars (1c)
- Slot consumers (`<DialogueFrame>`, `<SceneBackdrop>` rendering) — 1c
- Zod schemas for `world.json` and `theme.yaml` (1c)
- Worlds-loader manifest emission (1c — needed once theme YAML is loadable)
- L1/L2/L3 screens (1d)
- Demo cleanup: remove `src/client/`, `/api/scenarios`, `?scenario=`, truth panel UI (1d)
- Bundle budget enforcement (script lands in 1b, thresholds activate in 1c)
