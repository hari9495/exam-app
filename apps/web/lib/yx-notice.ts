// Frame notices a person may hide for the rest of the day (founder 20 Oct 2026): per person, per browser. Storage can be
// missing or refuse (private mode, blocked site data), so every read and write is guarded and the notice then just shows.

const key = (name: string, userId: string) => `yx:notice-hidden:${name}:${userId}`;

/** True when this person hid the notice earlier today (`today` as YYYY-MM-DD). */
export function hiddenToday(storage: Pick<Storage, 'getItem'> | undefined, name: string, userId: string, today: string): boolean {
  try {
    return storage?.getItem(key(name, userId)) === today;
  } catch {
    return false;
  }
}

/** Hides the notice for this person until the next day. */
export function hideForToday(storage: Pick<Storage, 'setItem'> | undefined, name: string, userId: string, today: string): void {
  try {
    storage?.setItem(key(name, userId), today);
  } catch {
    // Nothing kept: the notice shows again on the next page load.
  }
}

/** The browser's local storage, or nothing where reading it throws. */
export function localStore(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
