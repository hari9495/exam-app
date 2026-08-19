import config from './tailwind.config';

describe('tailwind foundation tokens', () => {
  const fonts = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;
  const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;

  it('registers the Bricolage display family and Hanken body family', () => {
    expect(fonts.display?.[0]).toBe('Bricolage Grotesque');
    expect(fonts.body?.[0]).toBe('Hanken Grotesk');
  });

  it('exposes slate neutral tokens backed by CSS variables', () => {
    expect(colors.ink).toBe('var(--slate-ink, #1b2530)');
    expect(colors.muted).toBe('var(--slate-muted, #5c6875)');
    expect(colors.rule).toBe('var(--slate-rule, #dbe0e6)');
    expect(colors.paper).toBe('var(--slate-paper, #ffffff)');
    expect(colors.ground).toBe('var(--slate-ground, #eceff3)');
  });
});
