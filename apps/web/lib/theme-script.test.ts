import { THEME_SCRIPT } from './theme-script';

describe('THEME_SCRIPT (sign-in pages follow the OS theme)', () => {
  const run = (dark: boolean, stored?: string) => {
    window.localStorage.clear();
    if (stored) window.localStorage.setItem('yx-theme', stored);
    window.matchMedia = jest.fn().mockReturnValue({ matches: dark }) as unknown as typeof window.matchMedia;
    delete document.documentElement.dataset.theme;
    new Function(THEME_SCRIPT)();
    return document.documentElement.dataset.theme;
  };

  it('follows prefers-color-scheme when nothing is chosen', () => {
    expect(run(true)).toBe('dark');
    expect(run(false)).toBe('light');
  });

  it('an explicit choice from the account menu wins over the OS', () => {
    expect(run(true, 'light')).toBe('light');
    expect(run(false, 'dark')).toBe('dark');
    expect(run(true, 'nonsense')).toBe('dark');
  });
});
