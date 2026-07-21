import { onPrimaryTextColor } from './candidate-theme';

describe('onPrimaryTextColor', () => {
  it('returns dark text for a light background color', () => {
    expect(onPrimaryTextColor('#F5F5F5')).toBe('#1A1F1D');
  });

  it('returns white text for a dark background color', () => {
    expect(onPrimaryTextColor('#1A1A1A')).toBe('#ffffff');
  });

  it('returns white text for the current default candidate-primary teal', () => {
    expect(onPrimaryTextColor('#2F6F5E')).toBe('#ffffff');
  });

  it('falls back to white for a malformed color string', () => {
    expect(onPrimaryTextColor('not-a-color')).toBe('#ffffff');
  });
});
