import { useSyncExternalStore } from 'react';

// Answer 1649: the open ticket, as Ctrl K needs it (its saved replies and scenarios, and how to use them). The ticket
// page sets it while it is open; the palette reads it. Nothing here decides access: the page shows the actions only
// with the keys, and the API checks every call again.

export interface DeskPaletteTicket {
  id: string;
  number: string;
  /** May reply and run scenarios on this ticket. */
  canWork: boolean;
  canned: { id: string; title: string }[];
  scenarios: { id: string; name: string }[];
  insertReply: (cannedId: string) => void;
  runScenario: (scenarioId: string) => Promise<void>;
}

let current: DeskPaletteTicket | null = null;
const listeners = new Set<() => void>();

export function setDeskPaletteTicket(t: DeskPaletteTicket | null) {
  current = t;
  listeners.forEach((l) => l());
}

export function useDeskPaletteTicket(): DeskPaletteTicket | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => current,
    () => null,
  );
}

/** A ticket number as agents type it: "IT-1042" (a desk prefix and the number). */
export const TICKET_NUMBER = /^[A-Za-z][A-Za-z0-9]{0,9}-\d{1,9}$/;

export const AGENT_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'away', label: 'Away' },
  { value: 'offline', label: 'Offline' },
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number]['value'];
