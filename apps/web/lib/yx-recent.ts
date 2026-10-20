// Ctrl K's Recent list (PLT-20): kept per person and company in this browser only, cleared on sign-out. Kept apart
// from the palette so sign-out can clear it without loading the design library.

export type RecentType = 'person' | 'candidate' | 'request' | 'ticket' | 'page';
/** Only a label, a type and an in-app link are kept: never details, codes or anything secret. */
export interface RecentEntry {
  label: string;
  type: RecentType;
  href: string;
}

const PREFIX = 'yx-recent:';
export const MAX_RECENT = 8;
const TYPES: RecentType[] = ['person', 'candidate', 'request', 'ticket', 'page'];
/** Per person and company, in this browser only. */
export const recentKey = (userId: string, orgId: string | null | undefined) => `${PREFIX}${userId}:${orgId ?? 'none'}`;
// A stored link opens only inside the app ("/x", never "//host" or "https:"), whatever was written to storage.
const internal = (href: unknown): href is string => typeof href === 'string' && /^\/(?![/\\])/.test(href);

export function readRecent(key: string): RecentEntry[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is RecentEntry => Boolean(e) && typeof e.label === 'string' && TYPES.includes(e.type) && internal(e.href))
      .map((e) => ({ label: e.label.slice(0, 120), type: e.type, href: e.href }))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export const addRecent = (list: RecentEntry[], e: RecentEntry): RecentEntry[] => [e, ...list.filter((x) => x.href !== e.href)].slice(0, MAX_RECENT);

export function writeRecent(key: string, list: RecentEntry[]) {
  try {
    if (list.length) window.localStorage.setItem(key, JSON.stringify(list));
    else window.localStorage.removeItem(key);
  } catch {
    /* private window: this visit only */
  }
}

/** On sign-out: the next person on this computer must not see where the last one went. */
export function clearAllRecent() {
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k?.startsWith(PREFIX)) ls.removeItem(k);
    }
  } catch {
    /* storage blocked: nothing was kept */
  }
}

