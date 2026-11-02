import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Slider } from '../components/slider';
import { formatINR } from '../lib/format';
import { Section, Stack } from './story-kit';

const meta: Meta = { title: 'Inputs/Slider' };
export default meta;

function Demo({ start, max, step, label, hint, disabled }: { start: number; max: number; step: number; label: string; hint?: string; disabled?: boolean }) {
  const [v, setV] = useState(start);
  return <Slider label={label} value={v} onChange={setV} max={max} step={step} valueText={(n) => formatINR(n)} hint={hint} disabled={disabled} />;
}

export const WhatIf: StoryObj = {
  name: 'What-if amounts',
  render: () => (
    <Stack>
      <Section title="Drag or use the arrow keys" note="The label and the value sit above; the value is read out as text (₹12,000, not 12000). Focus ring like every control.">
        <Demo label="Monthly rent" start={18_000} max={80_000} step={1_000} hint="HRA exemption for the year: ₹1,20,000 (old regime only)." />
        <Demo label="Extra NPS (own)" start={0} max={50_000} step={5_000} hint="You can add up to ₹50,000 more." />
        <Demo label="Extra 80C-equivalent investment" start={0} max={0} step={5_000} disabled hint="You have used the full ₹1,50,000 limit; extra investment won't lower tax." />
      </Section>
    </Stack>
  ),
};
