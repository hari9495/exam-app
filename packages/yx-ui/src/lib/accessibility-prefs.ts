// The Accessibility menu's choices without React (answers 2330 to 2334): the host app's server layout imports the
// before-paint script from here ("@yukthix/ui/a11y"), and the kit menu uses the same lists.

/** Text size steps in per cent: five steps, about 90 % to 150 % (answer 2330). 100 is the default. */
export const TEXT_SIZES = [90, 100, 115, 130, 150] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface AccessibilityPrefs {
  contrast: 'normal' | 'high';
  textSize: TextSize;
  /** Letter and word spacing (WCAG 1.4.12: 0.12 and 0.16 times the font size). */
  textSpacing: boolean;
  /** Line height 1.5 times the font size, and paragraph spacing twice it (WCAG 1.4.12). */
  lineHeight: boolean;
  bigCursor: boolean;
  /** As well as the OS "reduce motion" setting, which is always honoured. */
  reduceMotion: boolean;
  strongFocus: boolean;
  underlineLinks: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilityPrefs = {
  contrast: 'normal',
  textSize: 100,
  textSpacing: false,
  lineHeight: false,
  bigCursor: false,
  reduceMotion: false,
  strongFocus: false,
  underlineLinks: false,
};

/** localStorage key: signed-out pages keep the choices here; signed-in pages copy the account's choices here too. */
export const A11Y_STORAGE_KEY = 'yx-a11y';

/** The on/off choices and the <html> data attribute each one sets to "on". */
const SWITCHES = {
  textSpacing: 'data-text-spacing',
  lineHeight: 'data-line-height',
  bigCursor: 'data-big-cursor',
  reduceMotion: 'data-reduce-motion',
  strongFocus: 'data-strong-focus',
  underlineLinks: 'data-underline-links',
} as const satisfies Partial<Record<keyof AccessibilityPrefs, string>>;
export type SwitchKey = keyof typeof SWITCHES;

/** Any stored or received value made safe: unknown or wrong fields fall back to the default. */
export function parseAccessibility(raw: unknown): AccessibilityPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const p: AccessibilityPrefs = { ...DEFAULT_ACCESSIBILITY };
  if (o.contrast === 'high') p.contrast = 'high';
  if ((TEXT_SIZES as readonly unknown[]).includes(o.textSize)) p.textSize = o.textSize as TextSize;
  for (const k of Object.keys(SWITCHES) as SwitchKey[]) p[k] = o[k] === true;
  return p;
}

/** The <html> attributes for a set of choices; a default choice sets none. */
export function accessibilityAttributes(p: AccessibilityPrefs): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.contrast === 'high') out['data-contrast'] = 'high';
  if (p.textSize !== 100) out['data-text-size'] = String(p.textSize);
  for (const k of Object.keys(SWITCHES) as SwitchKey[]) if (p[k]) out[SWITCHES[k]] = 'on';
  return out;
}

const ALL_ATTRIBUTES = ['data-contrast', 'data-text-size', ...Object.values(SWITCHES)];

export function applyAccessibility(p: AccessibilityPrefs, root: HTMLElement = document.documentElement) {
  const attrs = accessibilityAttributes(p);
  for (const a of ALL_ATTRIBUTES) {
    if (attrs[a]) root.setAttribute(a, attrs[a]);
    else root.removeAttribute(a);
  }
}

export function readAccessibility(): AccessibilityPrefs {
  try {
    return parseAccessibility(JSON.parse(window.localStorage.getItem(A11Y_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_ACCESSIBILITY };
  }
}

export function writeAccessibility(p: AccessibilityPrefs) {
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* private window: this visit only */
  }
}

/**
 * Runs inline in <head>/<body> before the first paint (the host app's plain theme <script>), so a stored choice never
 * flashes the default look. Same rules as applyAccessibility, built from the same lists.
 */
export const ACCESSIBILITY_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(A11Y_STORAGE_KEY)})||'null')||{},d=document.documentElement,s=${JSON.stringify(SWITCHES)};if(p.contrast==='high')d.setAttribute('data-contrast','high');if(${JSON.stringify(TEXT_SIZES.filter((t) => t !== 100))}.indexOf(p.textSize)>=0)d.setAttribute('data-text-size',String(p.textSize));for(var k in s)if(p[k]===true)d.setAttribute(s[k],'on')}catch(e){}})()`;

