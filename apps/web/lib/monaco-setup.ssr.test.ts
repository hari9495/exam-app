/**
 * @jest-environment node
 */
// Runs in the node environment because that is what SSR is: no window at all. (jsdom 26, under
// Jest 30, no longer lets a jsdom test delete `window` to fake it.)
const config = jest.fn();
jest.mock('@monaco-editor/react', () => ({ loader: { config } }));

export {};

describe('monaco-setup', () => {
  it('does nothing when there is no window, keeping the module import SSR-safe', () => {
    // The exam page imports this at module top, which runs on the server too. Touching
    // window.location.origin unguarded there would throw during SSR.
    expect(typeof window).toBe('undefined');
    require('./monaco-setup');
    expect(config).not.toHaveBeenCalled();
  });
});
