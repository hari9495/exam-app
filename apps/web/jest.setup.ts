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

// Polyfill for ResizeObserver - needed for Radix UI RadioGroup's bubble
// input (useSize) in jsdom, which jsdom does not implement.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Minimal Fetch API `Response` polyfill.
// jest-environment-jsdom (jsdom itself) does not implement the Fetch API, so
// `global.fetch` mocks that construct `new Response(json, { status })` throw
// `ReferenceError: Response is not defined` even though Node's own runtime has
// a global `fetch`/`Response` -- that global lives in the outer Node realm and
// is not exposed inside the jsdom VM sandbox Jest creates for each test file.
// This implements just the subset (`status`, `ok`, `json()`, `blob()`, `headers`) that the test
// suite's fetch mocks rely on.
if (typeof (globalThis as { Response?: unknown }).Response === 'undefined') {
  class PolyfillHeaders {
    private readonly data: Record<string, string>;

    constructor(init?: Record<string, string>) {
      this.data = init ?? {};
    }

    get(name: string): string | null {
      return this.data[name] ?? null;
    }
  }

  class PolyfillResponse {
    readonly status: number;
    readonly ok: boolean;
    private readonly bodyData: unknown;
    readonly headers: PolyfillHeaders;

    constructor(body?: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
      this.bodyData = body;
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new PolyfillHeaders(init.headers);
    }

    async json() {
      if (typeof this.bodyData === 'string') {
        return JSON.parse(this.bodyData);
      }
      return undefined;
    }

    async text() {
      if (typeof this.bodyData === 'string') {
        return this.bodyData;
      }
      return '';
    }

    async blob(): Promise<Blob> {
      if (this.bodyData instanceof Blob) {
        return this.bodyData;
      }
      return new Blob([]);
    }
  }

  (globalThis as unknown as { Response: unknown }).Response = PolyfillResponse;
}
