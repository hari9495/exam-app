import config from './tailwind.config';

describe('tailwind foundation tokens', () => {
  const fonts = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;

  it('registers the Bricolage display family and Hanken body family', () => {
    expect(fonts.display?.[0]).toBe('Bricolage Grotesque');
    expect(fonts.body?.[0]).toBe('Hanken Grotesk');
  });
});
