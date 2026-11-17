import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityMenu,
  AccessibilityPanel,
  DEFAULT_ACCESSIBILITY,
  accessibilityAttributes,
  type AccessibilityPrefs,
} from '../components/accessibility';
import { Button, Link } from '../components/button';
import { InlineAlert } from '../components/feedback';
import { FormField } from '../components/field';
import { TextField } from '../components/inputs';
import { Badge } from '../components/display';
import { ProfileMenu, TopBar } from '../components/shell';
import { Section, Stack } from './story-kit';

// Answers 2330 to 2334: the Accessibility menu, laid out like india.gov.in's Accessibility Tools (tiles in groups),
// in the YukthiX look. Lives on the staff top bar, the sign-in, candidate and careers pages and the exam screens.
const meta: Meta = { title: 'Shell/Accessibility menu', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

/** Sets the choices on <html> while the story shows, and takes them off after (the iframe is shared). */
function WithChoices({ prefs, children }: { prefs: AccessibilityPrefs; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const attrs = accessibilityAttributes(prefs);
    for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
    return () => Object.keys(attrs).forEach((k) => root.removeAttribute(k));
  }, [prefs]);
  return <>{children}</>;
}

function PanelDemo({ start }: { start: AccessibilityPrefs }) {
  const [prefs, setPrefs] = useState(start);
  return (
    <div style={{ maxWidth: 360 }}>
      <AccessibilityPanel value={prefs} onChange={setPrefs} />
    </div>
  );
}

const ALL_ON: AccessibilityPrefs = { contrast: 'high', textSize: 130, textSpacing: true, lineHeight: true, bigCursor: true, reduceMotion: true, strongFocus: true, underlineLinks: true };

export const Panel: Story = {
  name: 'Panel (all normal)',
  render: () => (
    <Section title="Accessibility tools" note="Contrast is one choice (Segment); text size steps 90 to 150 %; the rest are on/off tiles.">
      <PanelDemo start={DEFAULT_ACCESSIBILITY} />
    </Section>
  ),
};

export const PanelAllOn: Story = {
  name: 'Panel (every tile on)',
  render: () => (
    <Section title="Every switch on" note="An on tile is filled and says On; the size line says the step.">
      <PanelDemo start={ALL_ON} />
    </Section>
  ),
};

export const InTopBar: Story = {
  name: 'In the staff top bar (open)',
  render: () => (
    <div style={{ minHeight: 720 }}>
      <TopBar onSearch={() => {}} onHelp={() => {}} accessibility={<AccessibilityMenu defaultOpen />} profile={<ProfileMenu name="Lakshmi V" email="lakshmi.v@yukthix.com" />} />
    </div>
  ),
};

function Sample() {
  return (
    <Stack gap={16} width={560}>
      <h1 style={{ margin: 0, fontSize: 'var(--yx-text-2xl)', lineHeight: 'var(--yx-leading-2xl)' }}>Apply for leave</h1>
      <p style={{ margin: 0 }}>
        Your balance is 12 days. Read the <Link href="#policy">leave policy</Link> before you ask for more than 5 days.
      </p>
      <FormField label="Reason" helper="Seen by your manager">
        <TextField defaultValue="Family function" />
      </FormField>
      <InlineAlert tone="warning" title="Payroll closes on 25 Nov 2026">
        Leave asked after that counts in the next month.
      </InlineAlert>
      <div style={{ display: 'flex', gap: 'var(--yx-space-2)', flexWrap: 'wrap' }}>
        <Button variant="primary">Send request</Button>
        <Button>Save draft</Button>
        <Badge tone="success">Approved</Badge>
        <Badge tone="danger">Rejected</Badge>
      </div>
    </Stack>
  );
}

export const HighContrast: Story = {
  name: 'High contrast theme',
  render: () => (
    <WithChoices prefs={{ ...DEFAULT_ACCESSIBILITY, contrast: 'high' }}>
      <Section title="High contrast" note="Black on white, AAA text, black borders, links underlined, a thick focus outline.">
        <Sample />
      </Section>
    </WithChoices>
  ),
};

export const LargestText: Story = {
  name: 'Text size 150 % with text spacing and line height',
  render: () => (
    <WithChoices prefs={{ ...DEFAULT_ACCESSIBILITY, textSize: 150, textSpacing: true, lineHeight: true }}>
      <Section title="Largest text" note="Every --yx-text-* and --yx-leading-* token scales by one variable; blocks wrap, nothing overlaps.">
        <Sample />
      </Section>
    </WithChoices>
  ),
};
