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

describe('THEME_SCRIPT (Accessibility choices before the first paint, answers 2330 to 2334)', () => {
  const html = document.documentElement;
  const strip = () => ['data-contrast', 'data-text-size', 'data-big-cursor', 'data-underline-links'].forEach((a) => html.removeAttribute(a));
  afterEach(strip);

  it('applies the choices kept in this browser together with the theme', () => {
    window.localStorage.clear();
    window.localStorage.setItem('yx-a11y', JSON.stringify({ contrast: 'high', textSize: 150, bigCursor: true }));
    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    new Function(THEME_SCRIPT)();
    expect(html.dataset.theme).toBe('light');
    expect(html.getAttribute('data-contrast')).toBe('high');
    expect(html.getAttribute('data-text-size')).toBe('150');
    expect(html.getAttribute('data-big-cursor')).toBe('on');
  });

  it('sets nothing for unknown or broken values, and still sets the theme', () => {
    window.localStorage.clear();
    window.localStorage.setItem('yx-a11y', '{broken');
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    new Function(THEME_SCRIPT)();
    expect(html.dataset.theme).toBe('dark');
    window.localStorage.setItem('yx-a11y', JSON.stringify({ contrast: 'invert', textSize: 300, underlineLinks: 'yes' }));
    new Function(THEME_SCRIPT)();
    expect(html.getAttribute('data-contrast')).toBeNull();
    expect(html.getAttribute('data-text-size')).toBeNull();
    expect(html.getAttribute('data-underline-links')).toBeNull();
  });
});
