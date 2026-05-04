// Preact primitives — re-exported so world bundles get a single runtime instance
export { h, Fragment } from "preact";
export { useState, useEffect, useMemo, useRef, useCallback } from "preact/hooks";

// UI components
export { Card, Button, Tabs, Drawer, Backdrop, ChoiceList } from "./components/index.js";

// Slot system
export { registerSlot, useSlot, PluginSlot } from "./slots.js";
export type { SlotName, SlotContext } from "./slots.js";

// API client
export { getWorlds, getInstance, createInstance, getStory, getStories, createStory, runTurn } from "./api.js";
export type { WorldSummary, InstanceSummary, StorySummary, RunTurnInput } from "./api.js";

// Utilities
export { fetchJSON, cn, timeAgo, useI18n } from "./utils.js";
