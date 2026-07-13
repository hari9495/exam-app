import '@testing-library/jest-dom';

// Polyfill for hasPointerCapture - needed for Radix UI components in jsdom
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

// Polyfill for scrollIntoView - needed for Radix UI Select in jsdom
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Minimal Fetch API `Response` polyfill.
// jest-environment-jsdom (jsdom itself) does not implement the Fetch API, so
// `global.fetch` mocks that construct `new Response(json, { status })` throw
// `ReferenceError: Response is not defined` even though Node's own runtime has
// a global `fetch`/`Response` -- that global lives in the outer Node realm and
// is not exposed inside the jsdom VM sandbox Jest creates for each test file.
// This implements just the subset (`status`, `ok`, `json()`) that the test
// suite's fetch mocks rely on.
if (typeof (globalThis as { Response?: unknown }).Response === 'undefined') {
  class PolyfillResponse {
    readonly status: number;
    readonly ok: boolean;
    private readonly bodyText: string;

    constructor(body?: unknown, init: { status?: number } = {}) {
      this.bodyText = typeof body === 'string' ? body : '';
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
    }

    async json() {
      return this.bodyText ? JSON.parse(this.bodyText) : undefined;
    }

    async text() {
      return this.bodyText;
    }
  }

  (globalThis as unknown as { Response: unknown }).Response = PolyfillResponse;
}
