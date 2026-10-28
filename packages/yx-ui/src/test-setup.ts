import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// findBy* / waitFor give up after 1 s by default. A screen that answers from a resolved promise and re-renders takes
// well under that alone, but longer while every other test file renders in parallel (a full run, CI): the cause of
// the "Unable to find" failures seen only in full runs. Passing tests return as soon as the element shows.
configure({ asyncUtilTimeout: 4000 });

// jsdom gaps used by Radix and cmdk
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
// ProseMirror (the rich text editor) measures ranges when it scrolls the selection into view; jsdom has no layout.
const noRect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() {} } as DOMRect;
Range.prototype.getBoundingClientRect ??= () => noRect;
Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
document.elementFromPoint ??= () => null;

// user-event waits a real timer turn (setTimeout 0) between every key and pointer action by default. Each of those
// turns lets the whole screen re-render, and on a loaded machine (a full run, CI) typing a few words into a big form
// passed the 5-second test limit. Nothing here depends on that pause, so every test types without it.
vi.mock('@testing-library/user-event', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/user-event')>();
  const ue = actual.default;
  type Options = NonNullable<Parameters<typeof ue.setup>[0]>;
  const fast: Options = { delay: null };
  const wrapped: typeof ue = {
    ...ue,
    setup: (options?: Options) => ue.setup({ ...fast, ...options }),
    type: (element, text, options) => ue.type(element, text, { ...fast, ...options }),
    keyboard: (text, options) => ue.keyboard(text, { ...fast, ...options }),
  };
  return { ...actual, default: wrapped, userEvent: wrapped };
});
