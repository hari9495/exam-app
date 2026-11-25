import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import {
  A11Y_STORAGE_KEY,
  ACCESSIBILITY_SCRIPT,
  AccessibilityMenu,
  AccessibilityPanel,
  DEFAULT_ACCESSIBILITY,
  applyAccessibility,
  parseAccessibility,
  useAccessibility,
  type AccessibilityPrefs,
} from './accessibility';
import { ToastProvider } from './notify';

const root = document.documentElement;
const attrs = () => Object.fromEntries([...root.attributes].filter((a) => a.name.startsWith('data-') && a.name !== 'data-theme' && a.name !== 'data-density').map((a) => [a.name, a.value]));
const clear = () => applyAccessibility(DEFAULT_ACCESSIBILITY);
const ALL_ON: AccessibilityPrefs = { contrast: 'high', textSize: 150, textSpacing: true, lineHeight: true, bigCursor: true, reduceMotion: true, strongFocus: true, underlineLinks: true };

beforeEach(() => {
  window.localStorage.clear();
  clear();
});
afterEach(clear);

describe('choices: read, check, apply', () => {
  it('keeps good values and turns anything else into the default', () => {
    expect(parseAccessibility(ALL_ON)).toEqual(ALL_ON);
    expect(parseAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY);
    expect(parseAccessibility('high')).toEqual(DEFAULT_ACCESSIBILITY);
    expect(parseAccessibility({ contrast: 'invert', textSize: 300, bigCursor: 'yes', saturation: 50 })).toEqual(DEFAULT_ACCESSIBILITY);
    expect(parseAccessibility({ textSize: '150' }).textSize).toBe(100);
  });

  it('sets one <html> attribute per choice that is not the default, and takes them off again', () => {
    applyAccessibility(ALL_ON);
    expect(attrs()).toEqual({
      'data-contrast': 'high',
      'data-text-size': '150',
      'data-text-spacing': 'on',
      'data-line-height': 'on',
      'data-big-cursor': 'on',
      'data-reduce-motion': 'on',
      'data-strong-focus': 'on',
      'data-underline-links': 'on',
    });
    applyAccessibility(DEFAULT_ACCESSIBILITY);
    expect(attrs()).toEqual({});
  });

  it('the before-paint script applies the stored choices exactly as the app does', () => {
    for (const p of [ALL_ON, { ...DEFAULT_ACCESSIBILITY, textSize: 90 as const, underlineLinks: true }, DEFAULT_ACCESSIBILITY]) {
      applyAccessibility(p);
      const expected = attrs();
      clear();
      window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(p));
      new Function(ACCESSIBILITY_SCRIPT)();
      expect(attrs()).toEqual(expected);
      clear();
    }
  });

  it('the before-paint script ignores broken or hostile storage without throwing', () => {
    window.localStorage.setItem(A11Y_STORAGE_KEY, '{not json');
    expect(() => new Function(ACCESSIBILITY_SCRIPT)()).not.toThrow();
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ contrast: '"><script>', textSize: 999, bigCursor: 'on' }));
    new Function(ACCESSIBILITY_SCRIPT)();
    expect(attrs()).toEqual({});
  });
});

function Controlled({ start = DEFAULT_ACCESSIBILITY, onChange }: { start?: AccessibilityPrefs; onChange?: (p: AccessibilityPrefs) => void }) {
  const [p, setP] = useState(start);
  return (
    <AccessibilityPanel
      value={p}
      onChange={(n) => {
        setP(n);
        onChange?.(n);
      }}
    />
  );
}

describe('the panel tiles', () => {
  it.each([
    ['Text spacing', 'textSpacing'],
    ['Line height', 'lineHeight'],
    ['Big cursor', 'bigCursor'],
    ['Reduce motion', 'reduceMotion'],
    ['Stronger focus', 'strongFocus'],
    ['Underline links', 'underlineLinks'],
  ] as const)('%s turns on and off, and says so', async (name, key) => {
    const changes: AccessibilityPrefs[] = [];
    render(<Controlled onChange={(p) => changes.push(p)} />);
    const tile = screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile).toHaveTextContent('On');
    expect(changes.at(-1)).toEqual({ ...DEFAULT_ACCESSIBILITY, [key]: true });
    await userEvent.click(tile);
    expect(changes.at(-1)).toEqual(DEFAULT_ACCESSIBILITY);
  });

  it('Contrast is one choice of Normal or High contrast (a Segment)', async () => {
    const changes: AccessibilityPrefs[] = [];
    render(<Controlled onChange={(p) => changes.push(p)} />);
    const group = screen.getByRole('radiogroup', { name: 'Contrast' });
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'High contrast' }));
    expect(group).toBeInTheDocument();
    expect(changes.at(-1)?.contrast).toBe('high');
  });

  it('text size goes up and down in five steps and stops at 90 and 150 %', async () => {
    render(<Controlled />);
    const bigger = screen.getByRole('button', { name: 'Bigger text' });
    const smaller = screen.getByRole('button', { name: 'Smaller text' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Text size 100 %');
    for (const want of ['115', '130', '150 % (largest)', '150 % (largest)']) {
      await userEvent.click(bigger);
      expect(status).toHaveTextContent(`Text size ${want}`);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Normal size' }));
    expect(status).toHaveTextContent('Text size 100 %');
    await userEvent.click(smaller);
    await userEvent.click(smaller);
    expect(status).toHaveTextContent('Text size 90 % (smallest)');
  });

  it('Reset all puts every choice back and says so in a toast', async () => {
    const changes: AccessibilityPrefs[] = [];
    render(<Controlled start={ALL_ON} onChange={(p) => changes.push(p)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(changes.at(-1)).toEqual(DEFAULT_ACCESSIBILITY);
    await waitFor(() => expect(document.body).toHaveTextContent('Accessibility choices are back to normal'));
  });

  it('every tile looks clickable: a real button in the tab order', () => {
    render(<Controlled />);
    for (const b of screen.getAllByRole('button')) expect(b.tagName).toBe('BUTTON');
  });
});

describe('the menu on its own (signed-out pages, exam, careers)', () => {
  it('opens from the Accessibility button, applies at once and keeps the choice in this browser', async () => {
    render(<AccessibilityMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Accessibility' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Big cursor/ }));
    expect(root).toHaveAttribute('data-big-cursor', 'on');
    expect(JSON.parse(window.localStorage.getItem(A11Y_STORAGE_KEY) ?? '{}')).toEqual({ ...DEFAULT_ACCESSIBILITY, bigCursor: true });
  });

  it('starts from what this browser kept', async () => {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ ...DEFAULT_ACCESSIBILITY, underlineLinks: true }));
    render(<AccessibilityMenu defaultOpen />);
    expect(await screen.findByRole('button', { name: /^Underline links/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('useAccessibility (signed in: saved on the account)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

  it('saves every change to the account as well as this browser', () => {
    const onSave = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAccessibility({ onSave }), { wrapper });
    act(() => result.current.setPrefs({ ...DEFAULT_ACCESSIBILITY, textSize: 130 }));
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_ACCESSIBILITY, textSize: 130 });
    expect(root).toHaveAttribute('data-text-size', '130');
  });

  it('a failed account save keeps the choice here and shows an error toast', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result } = renderHook(() => useAccessibility({ onSave }), { wrapper });
    act(() => result.current.setPrefs({ ...DEFAULT_ACCESSIBILITY, reduceMotion: true }));
    expect(root).toHaveAttribute('data-reduce-motion', 'on');
    await waitFor(() => expect(document.body).toHaveTextContent('Your accessibility choices could not be saved to your account'));
  });

  it("the account's saved choices win; none saved keeps this browser's", () => {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ ...DEFAULT_ACCESSIBILITY, strongFocus: true }));
    const { result } = renderHook(() => useAccessibility(), { wrapper });
    act(() => result.current.adopt(null));
    expect(result.current.prefs.strongFocus).toBe(true);
    act(() => result.current.adopt({ ...DEFAULT_ACCESSIBILITY, contrast: 'high' }));
    expect(result.current.prefs).toEqual({ ...DEFAULT_ACCESSIBILITY, contrast: 'high' });
    expect(root).toHaveAttribute('data-contrast', 'high');
    expect(root).not.toHaveAttribute('data-strong-focus');
  });
});
