import { useEffect, useState, type ReactNode } from 'react';
import {
  AArrowDown,
  AArrowUp,
  Accessibility,
  ALargeSmall,
  Focus,
  LetterText,
  MousePointer2,
  Pause,
  RotateCcw,
  Underline,
  UnfoldVertical,
  type LucideIcon,
} from 'lucide-react';
import { Button, IconButton } from './button';
import { Icon } from './foundations';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Segment } from './segment';
import { useToastIfAny } from './notify';
import {
  DEFAULT_ACCESSIBILITY,
  TEXT_SIZES,
  applyAccessibility,
  parseAccessibility,
  readAccessibility,
  writeAccessibility,
  type AccessibilityPrefs,
  type SwitchKey,
} from '../lib/accessibility-prefs';

/* ======================= Accessibility menu (answers 2330 to 2334) ======================= */

export * from '../lib/accessibility-prefs';
export interface UseAccessibilityOptions {
  /** Signed in: saves the choices on the person's account (PATCH /users/me). A rejection is shown as an error toast. */
  onSave?: (p: AccessibilityPrefs) => Promise<unknown> | void;
}

/**
 * The Accessibility menu's state: read from this browser at first, applied to <html> and kept in this browser on every
 * change, and saved on the account when `onSave` is given. `adopt` takes the account's saved choices (they win).
 */
export function useAccessibility({ onSave }: UseAccessibilityOptions = {}) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT_ACCESSIBILITY);
  const toasts = useToastIfAny();
  useEffect(() => {
    setPrefs(readAccessibility());
  }, []);
  const use = (p: AccessibilityPrefs) => {
    setPrefs(p);
    applyAccessibility(p);
    writeAccessibility(p);
  };
  const change = (p: AccessibilityPrefs) => {
    use(p);
    const saving = onSave?.(p);
    if (saving)
      saving.catch(() =>
        toasts?.toast({ tone: 'error', title: 'Your accessibility choices could not be saved to your account', description: 'They apply in this browser. Try again later.' }),
      );
  };
  /** The account's saved choices; null (never saved) keeps what this browser has. */
  const adopt = (saved: unknown) => {
    if (saved != null) use(parseAccessibility(saved));
  };
  return { prefs, setPrefs: change, adopt };
}

/* ---------- the panel: a grid of tiles in groups (answer 2334, india.gov.in's Accessibility Tools layout) ---------- */

interface TileProps {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  /** An on/off tile; omit for an action (Bigger text). */
  pressed?: boolean;
}

export function AccessibilityTile({ icon, children, onClick, pressed }: TileProps) {
  return (
    <button type="button" className="yx-a11y-tile" aria-pressed={pressed} onClick={onClick}>
      <Icon icon={icon} size="md" />
      <span className="yx-a11y-tile__label">{children}</span>
      {pressed !== undefined && <span className="yx-a11y-tile__state" aria-hidden="true">{pressed ? 'On' : 'Off'}</span>}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = `yx-a11y-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="yx-a11y__group" aria-labelledby={id}>
      <h3 id={id} className="yx-a11y__group-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

export interface AccessibilityPanelProps {
  value: AccessibilityPrefs;
  onChange: (p: AccessibilityPrefs) => void;
}

/** The Accessibility tools: Contrast, Text size, Text spacing and Line height, Others, and Reset all. */
export function AccessibilityPanel({ value, onChange }: AccessibilityPanelProps) {
  const toasts = useToastIfAny();
  const set = (patch: Partial<AccessibilityPrefs>) => onChange({ ...value, ...patch });
  const at = TEXT_SIZES.indexOf(value.textSize);
  const step = (d: number) => set({ textSize: TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, at + d))] });
  const toggle = (k: SwitchKey) => () => set({ [k]: !value[k] });
  const sizeNote = at === TEXT_SIZES.length - 1 ? ' (largest)' : at === 0 ? ' (smallest)' : '';
  return (
    <div className="yx-a11y">
      <Group title="Contrast">
        <Segment
          label="Contrast"
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High contrast' },
          ]}
          value={value.contrast}
          onChange={(contrast) => set({ contrast })}
        />
      </Group>
      <Group title="Text size">
        <div className="yx-a11y__tiles">
          <AccessibilityTile icon={AArrowUp} onClick={() => step(1)}>
            Bigger text
          </AccessibilityTile>
          <AccessibilityTile icon={AArrowDown} onClick={() => step(-1)}>
            Smaller text
          </AccessibilityTile>
          <AccessibilityTile icon={ALargeSmall} onClick={() => set({ textSize: 100 })}>
            Normal size
          </AccessibilityTile>
        </div>
        <p className="yx-a11y__note" role="status">
          {`Text size ${value.textSize} %${sizeNote}`}
        </p>
      </Group>
      <Group title="Text spacing and line height">
        <div className="yx-a11y__tiles">
          <AccessibilityTile icon={LetterText} pressed={value.textSpacing} onClick={toggle('textSpacing')}>
            Text spacing
          </AccessibilityTile>
          <AccessibilityTile icon={UnfoldVertical} pressed={value.lineHeight} onClick={toggle('lineHeight')}>
            Line height
          </AccessibilityTile>
        </div>
      </Group>
      <Group title="Others">
        <div className="yx-a11y__tiles">
          <AccessibilityTile icon={MousePointer2} pressed={value.bigCursor} onClick={toggle('bigCursor')}>
            Big cursor
          </AccessibilityTile>
          <AccessibilityTile icon={Pause} pressed={value.reduceMotion} onClick={toggle('reduceMotion')}>
            Reduce motion
          </AccessibilityTile>
          <AccessibilityTile icon={Focus} pressed={value.strongFocus} onClick={toggle('strongFocus')}>
            Stronger focus
          </AccessibilityTile>
          <AccessibilityTile icon={Underline} pressed={value.underlineLinks} onClick={toggle('underlineLinks')}>
            Underline links
          </AccessibilityTile>
        </div>
      </Group>
      <div className="yx-a11y__foot">
        <Button
          icon={RotateCcw}
          onClick={() => {
            onChange({ ...DEFAULT_ACCESSIBILITY });
            toasts?.toast({ tone: 'success', title: 'Accessibility choices are back to normal' });
          }}
        >
          Reset all
        </Button>
      </div>
    </div>
  );
}

export interface AccessibilityMenuProps {
  /** Controlled (signed in: from useAccessibility with onSave). Omit both to keep the choices in this browser only. */
  value?: AccessibilityPrefs;
  onChange?: (p: AccessibilityPrefs) => void;
  defaultOpen?: boolean;
}

/**
 * The Accessibility button and its panel, on the staff top bar, the sign-in, candidate and careers pages and the exam
 * screens (answer 2331). A company can never turn it off, so it has no "hidden" option.
 */
export function AccessibilityMenu({ value, onChange, defaultOpen }: AccessibilityMenuProps) {
  const own = useAccessibility();
  const prefs = value ?? own.prefs;
  const change = onChange ?? own.setPrefs;
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <IconButton icon={Accessibility} label="Accessibility" />
      </PopoverTrigger>
      <PopoverContent className="yx-a11y-pop" align="end" aria-label="Accessibility">
        <h2 className="yx-a11y-pop__title">Accessibility</h2>
        <AccessibilityPanel value={prefs} onChange={change} />
      </PopoverContent>
    </Popover>
  );
}
