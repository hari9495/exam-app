import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilterToggle } from './filter-toggle';

function Demo() {
  const [on, setOn] = useState(false);
  return <FilterToggle pressed={on} onPressedChange={setOn}>Only overdue (3)</FilterToggle>;
}

describe('FilterToggle (kit, Inputs)', () => {
  it('a toggle button: off, then on with a tick when pressed, then off again', () => {
    render(<Demo />);
    const b = screen.getByRole('button', { name: 'Only overdue (3)' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(b.querySelector('svg')).toBeNull();
    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b.querySelector('svg')).not.toBeNull();
    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the next state and never changes on its own (controlled)', () => {
    const on = vi.fn();
    render(<FilterToggle pressed onPressedChange={on}>Only pending</FilterToggle>);
    fireEvent.click(screen.getByRole('button', { name: 'Only pending' }));
    expect(on).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('looks clickable: border, pointer, hover and a focus ring', () => {
    const css = readFileSync(join(__dirname, 'forms.css'), 'utf8');
    expect(css).toMatch(/^\.yx-filter-toggle \{[^}]*border: var\(--yx-border-width\) solid var\(--yx-color-border-input\);[^}]*\}/m);
    expect(css).toMatch(/^\.yx-filter-toggle \{[^}]*cursor: pointer;/m);
    expect(css).toMatch(/^\.yx-filter-toggle:hover/m);
    expect(css).toMatch(/^\.yx-filter-toggle:focus-visible \{[^}]*outline: var\(--yx-focus-width\) solid var\(--yx-color-focus-ring\)/m);
  });
});
