import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLOR_ICONS, ColorIcon, pickArt } from './color-icon';

describe('ColorIcon registry (§8)', () => {
  it('has art for every meaning and one icon per meaning', () => {
    const fluent = Object.values(COLOR_ICONS).map((e) => e.fluent);
    expect(new Set(fluent).size).toBe(fluent.length);
    for (const e of Object.values(COLOR_ICONS)) expect(Object.keys(e.art).length).toBeGreaterThan(0);
  });
  it('picks the exact size, else the nearest larger, else the largest', () => {
    const art = COLOR_ICONS['area.time'].art; // 20 and 24 only
    expect(pickArt(art, 20)).toBe(art[20]);
    expect(pickArt(art, 48)).toBe(art[24]);
    expect(pickArt(COLOR_ICONS['setup'].art, 48)).toBe(COLOR_ICONS['setup'].art[32]);
  });
  it('is decorative unless labelled', () => {
    const { container, getByRole } = render(<><ColorIcon name="area.people" size={20} /><ColorIcon name="help" label="Help" /></>);
    expect(container.querySelector('[data-size="20"]')).toHaveAttribute('aria-hidden', 'true');
    expect(getByRole('img', { name: 'Help' }).querySelector('svg')).not.toBeNull();
  });
});
