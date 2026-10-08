import { type ReactNode, useEffect, useState } from 'react';
import { Switch } from '../../components/choice';
import { Card } from '../../components/shell';

// Reading aids (US-G-020 accessibility): an easier font, a reading mask, larger text and a clear focus highlight.
// Saved in this browser only (localStorage); nothing is sent to the server.

export interface ReadingAidsValue {
  font: boolean;
  mask: boolean;
  large: boolean;
  focus: boolean;
}

const KEY = 'yx-reading-aids';
const OFF: ReadingAidsValue = { font: false, mask: false, large: false, focus: false };
const LABELS: { key: keyof ReadingAidsValue; label: string; description: string }[] = [
  { key: 'font', label: 'Easy-read font', description: 'Letters that are harder to mix up.' },
  { key: 'mask', label: 'Reading mask', description: 'Darkens the page except a band around the pointer.' },
  { key: 'large', label: 'Larger text', description: 'Everything a quarter bigger.' },
  { key: 'focus', label: 'Clear focus highlight', description: 'A thick outline on the control you are on.' },
];

function load(): ReadingAidsValue {
  try {
    return { ...OFF, ...(JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<ReadingAidsValue>) };
  } catch {
    return OFF;
  }
}

/** The aids, remembered in this browser. */
export function useReadingAids(): [ReadingAidsValue, (v: ReadingAidsValue) => void] {
  const [value, setValue] = useState<ReadingAidsValue>(OFF);
  useEffect(() => setValue(load()), []);
  const save = (v: ReadingAidsValue) => {
    setValue(v);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* private window: works for this visit only */
    }
  };
  return [value, save];
}

/** Wraps a page and applies the aids to it. */
export function ReadingAidsFrame({ value, children }: { value: ReadingAidsValue; children: ReactNode }) {
  const [y, setY] = useState<number | null>(null);
  useEffect(() => {
    if (!value.mask) return;
    const move = (e: PointerEvent) => setY(e.clientY);
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [value.mask]);
  const band = 48;
  return (
    <div className="yx-reading" data-font={value.font || undefined} data-large={value.large || undefined} data-focus={value.focus || undefined}>
      {children}
      {value.mask && y !== null && (
        <>
          <div className="yx-reading-mask" aria-hidden style={{ top: 0, height: Math.max(0, y - band) }} />
          <div className="yx-reading-mask" aria-hidden style={{ top: y + band, bottom: 0 }} />
        </>
      )}
    </div>
  );
}

/** The on/off switches. */
export function ReadingAidsCard({ value, onChange }: { value: ReadingAidsValue; onChange: (v: ReadingAidsValue) => void }) {
  return (
    <Card title="Reading aids">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-ops-muted">Saved in this browser only.</p>
        {LABELS.map((a) => (
          <Switch key={a.key} label={a.label} description={a.description} checked={value[a.key]} onChange={(on) => onChange({ ...value, [a.key]: on })} />
        ))}
      </div>
    </Card>
  );
}
