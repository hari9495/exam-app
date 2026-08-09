const config = jest.fn();
jest.mock('@monaco-editor/react', () => ({ loader: { config } }));

// The module configures Monaco as an import side effect, so each case needs a fresh registry.
function importFresh() {
  jest.resetModules();
  require('./monaco-setup');
}

describe('monaco-setup', () => {
  beforeEach(() => config.mockClear());

  // The bug this exists for: '/monaco/vs' is root-relative, and Monaco passes this base URL into
  // its language web worker. A worker's base is an opaque `blob:` URL, which nothing relative can
  // resolve against, so the worker threw "Failed to parse URL from /monaco/vs/..." (Chrome) /
  // "... is not a valid URL" (Firefox) before it ever hit the network. The file itself served 200
  // the whole time. 13 candidates lost editor diagnostics to this across the 2026-08-08 drives.
  it('configures an ABSOLUTE vs path, so the blob worker can resolve it', () => {
    importFresh();

    expect(config).toHaveBeenCalledWith({ paths: { vs: `${window.location.origin}/monaco/vs` } });
    const configuredPath = config.mock.calls[0][0].paths.vs;
    expect(configuredPath.startsWith('http')).toBe(true);
    // Must survive being resolved from inside a worker, which a relative path does not.
    expect(() => new URL(configuredPath)).not.toThrow();
  });

  it("still points at this origin's own /monaco/vs, not a CDN", () => {
    importFresh();

    // Self-hosting is the whole point: candidates sit on networks that block third-party CDNs.
    expect(config.mock.calls[0][0].paths.vs).toContain('/monaco/vs');
    expect(config.mock.calls[0][0].paths.vs).not.toContain('jsdelivr');
  });

  it('does nothing when there is no window, keeping the module import SSR-safe', () => {
    const originalWindow = global.window;
    // The exam page imports this at module top, which runs on the server too. Touching
    // window.location.origin unguarded there would throw during SSR.
    // @ts-expect-error deliberately simulating the server environment
    delete global.window;
    try {
      importFresh();
      expect(config).not.toHaveBeenCalled();
    } finally {
      global.window = originalWindow;
    }
  });
});
