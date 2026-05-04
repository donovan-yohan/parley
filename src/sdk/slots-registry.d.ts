type SlotComponent = (props: Record<string, unknown>) => unknown;

export const slotRegistry: Map<string, Map<string, SlotComponent>>;
export const subscribers: Set<() => void>;

export function notifySubscribers(): void;
export function registerSlot(worldId: string, slot: string, component: SlotComponent): void;
export function getSlot(worldId: string, slot: string): SlotComponent | null;
export function __resetRegistryForTests(): void;
