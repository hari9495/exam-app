import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLOR_ICONS, ColorIcon, pickArt, type ColorIconName } from './color-icon';

describe('ColorIcon registry (§8)', () => {
  it('has vendored SVG art for every meaning and one icon per meaning', () => {
    // Founder-approved reuse (7 Oct 2026): org unit borrows the org chart icon, workflow the approvals icon.
    const shared: ColorIconName[] = ['orgUnit', 'workflow'];
    const fluent = Object.entries(COLOR_ICONS).filter(([k]) => !shared.includes(k as ColorIconName)).map(([, e]) => e.fluent);
    expect(new Set(fluent).size).toBe(fluent.length);
    for (const e of Object.values(COLOR_ICONS)) {
      expect(Object.keys(e.art).length).toBeGreaterThan(0);
      for (const [size, svg] of Object.entries(e.art)) expect(svg).toMatch(new RegExp(`^<svg width="${size}" height="${size}"[^>]*xmlns="http://www.w3.org/2000/svg"`));
    }
  });
  it('covers the 8 HR meanings, four of them stand-ins awaiting the designer composites', () => {
    for (const k of ['payslip', 'attendancePunch', 'statutoryFiling', 'proctoring', 'offerLetter', 'orgUnit', 'ruleBuilder', 'workflow'] as const) expect(COLOR_ICONS[k]).toBeDefined();
    const standIns = Object.entries(COLOR_ICONS).filter(([, e]) => 'standIn' in e && e.standIn).map(([k]) => k);
    expect(standIns).toEqual(['payslip', 'attendancePunch', 'offerLetter', 'workflow']);
  });
  it('picks the exact size, else the nearest larger, else the largest', () => {
    const art = COLOR_ICONS['area.time'].art; // 20 and 24 only
    expect(pickArt(art, 20)).toBe(art[20]);
    expect(pickArt(art, 48)).toBe(art[24]);
    expect(pickArt(COLOR_ICONS['setup'].art, 48)).toBe(COLOR_ICONS['setup'].art[32]);
    expect(pickArt(COLOR_ICONS['proctoring'].art, 32)).toBe(COLOR_ICONS['proctoring'].art[48]);
  });
  it('is decorative unless labelled', () => {
    const { container, getByRole } = render(<><ColorIcon name="area.people" size={20} /><ColorIcon name="help" label="Help" /></>);
    expect(container.querySelector('[data-size="20"]')).toHaveAttribute('aria-hidden', 'true');
    const img = getByRole('img', { name: 'Help' }).querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img?.getAttribute('src')).toMatch(/^data:image\/svg\+xml,%3Csvg/);
  });
});
