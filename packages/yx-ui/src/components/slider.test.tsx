import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './slider';

function Demo() {
  const [v, setV] = useState(2000);
  return <Slider label="Monthly rent" value={v} onChange={setV} max={10_000} step={500} valueText={(n) => `₹${n.toLocaleString('en-IN')}`} hint="Old regime only." />;
}

describe('Slider (kit, Inputs)', () => {
  it('a labelled range with min, max, step and the value read out as text; the hint describes it', () => {
    render(<Demo />);
    const s = screen.getByRole('slider', { name: 'Monthly rent' });
    expect(s).toHaveAttribute('min', '0');
    expect(s).toHaveAttribute('max', '10000');
    expect(s).toHaveAttribute('step', '500');
    expect(s).toHaveValue('2000');
    expect(s).toHaveAttribute('aria-valuetext', '₹2,000');
    expect(s).toHaveAccessibleDescription('Old regime only.');
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it('reports the new number and shows it (controlled)', () => {
    render(<Demo />);
    const s = screen.getByRole('slider', { name: 'Monthly rent' });
    fireEvent.change(s, { target: { value: '3500' } });
    expect(s).toHaveAttribute('aria-valuetext', '₹3,500');
    const on = vi.fn();
    render(<Slider label="NPS" value={0} onChange={on} min={0} max={100} />);
    fireEvent.change(screen.getByRole('slider', { name: 'NPS' }), { target: { value: '40' } });
    expect(on).toHaveBeenCalledWith(40);
    expect(screen.getByRole('slider', { name: 'NPS' })).toHaveAttribute('aria-valuetext', '0');
  });

  it('keyboard reachable with a visible focus ring and a pointer', () => {
    render(<Slider label="NPS" value={0} onChange={() => {}} max={100} />);
    expect(screen.getByRole('slider', { name: 'NPS' })).not.toHaveAttribute('tabindex', '-1');
    const css = readFileSync(join(__dirname, 'forms.css'), 'utf8');
    expect(css).toMatch(/\.yx-slider input\[type="range"\]:focus-visible \{ outline: var\(--yx-focus-width\) solid var\(--yx-color-focus-ring\)/);
    expect(css).toMatch(/\.yx-slider input\[type="range"\] \{[^}]*cursor: pointer/);
  });
});
