import { useEffect, useState } from 'react';
import { inertOthers } from 'aria-hidden';

// Answer 2356 (accessibility gap G-1): while a modal dialog, drawer or sheet is open, everything else on the page is
// `inert` as well as aria-hidden (Radix), so nothing behind it can be focused or clicked and screen readers and axe agree.
// Undone when it closes. Elements opened from inside it later (menus, pickers) are added after, so they stay usable.
export function useInertBehind(el: HTMLElement | null): void {
  useEffect(() => (el ? inertOthers(el) : undefined), [el]);
}

/** The same for a content element without its own ref: pass the returned setter as its `ref`. */
export function useInertBehindRef(): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useInertBehind(el);
  return setEl;
}
