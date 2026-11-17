import { useEffect, useState } from 'react';

// Answer 2356 (accessibility gap G-1): while a modal dialog, drawer or sheet is open, everything else on the page is
// `inert` as well as aria-hidden (Radix), so nothing behind it can be focused or clicked and screen readers and axe agree.
// Undone when it closes. Elements opened from inside it later (menus, pickers) are added after, so they stay usable.
//
// Our own counting, not aria-hidden's inertOthers: aria-hidden keeps ONE counter per element for every attribute, shared
// with Radix's own hideOthers (aria-hidden). A dialog opened from a drawer then counted the drawer twice (aria-hidden and
// inert); closing it took the count to 1, never 0, so the drawer stayed inert and nothing in it could be clicked.

/** How many open layers made each element inert. */
const layers = new WeakMap<Element, number>();
/** Elements that were inert before any layer touched them: never un-inerted by us. */
const ownInert = new WeakSet<Element>();

/** Makes everything in document.body outside `keep` (and its ancestors) inert; returns the undo for exactly those. */
export function inertOutside(keep: HTMLElement): () => void {
  const body = keep.ownerDocument.body;
  if (!body.contains(keep)) return () => undefined;
  const path = new Set<Element>();
  for (let n: Element | null = keep; n && n !== body; n = n.parentElement) path.add(n);
  const done: Element[] = [];
  const walk = (parent: Element) => {
    for (const node of Array.from(parent.children)) {
      if (node === keep) continue;
      if (path.has(node)) {
        walk(node);
        continue;
      }
      const count = layers.get(node) ?? 0;
      if (count === 0 && node.hasAttribute('inert')) ownInert.add(node);
      layers.set(node, count + 1);
      if (!ownInert.has(node)) node.setAttribute('inert', '');
      done.push(node);
    }
  };
  walk(body);
  return () => {
    for (const node of done) {
      const count = (layers.get(node) ?? 1) - 1;
      if (count > 0) {
        layers.set(node, count);
        continue;
      }
      layers.delete(node);
      if (ownInert.has(node)) ownInert.delete(node);
      else node.removeAttribute('inert');
    }
  };
}

export function useInertBehind(el: HTMLElement | null): void {
  useEffect(() => (el ? inertOutside(el) : undefined), [el]);
}

/** The same for a content element without its own ref: pass the returned setter as its `ref`. */
export function useInertBehindRef(): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useInertBehind(el);
  return setEl;
}
