import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Briefcase, CalendarDays, FileText, Users, Wallet } from 'lucide-react';
import { Figure, Heading, Icon, Kbd, Spinner, Text } from '../components/foundations';
import { Row, Section, Stack } from './story-kit';

const meta: Meta = { title: 'Foundations/Overview' };
export default meta;

const swatch = (token: string, label: string) => (
  <div key={token} style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 96 }}>
    <div style={{ height: 40, borderRadius: 6, background: `var(${token})`, border: '1px solid var(--yx-color-border)' }} />
    <Text size="xs">{label}</Text>
    <Text size="xs" tone="muted" mono>
      {token.replace('--yx-color-', '')}
    </Text>
  </div>
);

export const Typography: StoryObj = {
  render: () => (
    <Stack>
      <Section title="Type scale · IBM Plex Sans (§2)" note="One 22 px page title per page. Weights 400 / 500 / 600 only.">
        <Stack gap={8}>
          <Figure>₹42,18,300</Figure>
          <Figure size="md">248 employees</Figure>
          <Heading level={1}>Page title · Employees</Heading>
          <Heading level={2}>Drawer title · Divya Raghunathan</Heading>
          <Heading level={3}>Section · Bank details</Heading>
          <Heading level={4}>Sub-section · Nominees</Heading>
          <Text as="p">Body 14/20. Leave balance is updated when a request is approved.</Text>
          <Text as="p" size="sm" tone="secondary">
            Small 13/18 for secondary lines and compact tables.
          </Text>
          <Text as="p" size="xs" tone="muted">
            Caption 12/16 for column headers and hints.
          </Text>
          <Text mono>KF-0142 · HDFC0001234</Text>
        </Stack>
      </Section>
      <Section title="Tones and weights" note="Colour follows meaning (§3). Weights 400 / 500 / 600 only.">
        <Row>
          <Text>Default</Text>
          <Text tone="secondary">Secondary</Text>
          <Text tone="muted">Muted</Text>
          <Text tone="success">Paid on 30 Sep</Text>
          <Text tone="warning">Due in 2 days</Text>
          <Text tone="danger">Filing overdue</Text>
        </Row>
        <Row>
          <Text weight="regular">Regular 400</Text>
          <Text weight="medium">Medium 500</Text>
          <Text weight="semibold">Semibold 600</Text>
        </Row>
      </Section>
      <Section title="Icons · Lucide 1.5 px stroke, 16 and 20 px (§8)">
        <Row>
          {[Users, CalendarDays, Wallet, Briefcase, FileText, Bell].map((I, i) => (
            <Icon key={i} icon={I} />
          ))}
        </Row>
        <Row>
          {[Users, CalendarDays, Wallet, Briefcase, FileText, Bell].map((I, i) => (
            <Icon key={i} icon={I} size="md" />
          ))}
        </Row>
      </Section>
      <Section title="Helpers">
        <Row>
          <Kbd>Ctrl K</Kbd>
          <Kbd>J</Kbd>
          <Kbd>?</Kbd>
          <Spinner label="Loading" />
          <Spinner size="md" label="Loading" />
        </Row>
      </Section>
    </Stack>
  ),
};

export const Colour: StoryObj = {
  render: () => (
    <Stack>
      <Section title="Surfaces and text (§3, §48)" note="Switch the Theme toolbar to see dark mode.">
        <Row align="flex-start">
          {swatch('--yx-color-bg-page', 'Page')}
          {swatch('--yx-color-bg-surface', 'Surface')}
          {swatch('--yx-color-bg-subtle', 'Subtle')}
          {swatch('--yx-color-bg-selected', 'Selected')}
          {swatch('--yx-color-border', 'Hairline')}
          {swatch('--yx-color-text', 'Text')}
          {swatch('--yx-color-text-secondary', 'Secondary')}
          {swatch('--yx-color-text-muted', 'Muted')}
        </Row>
      </Section>
      <Section title="Meaning" note="Blue acts. Green is done. Amber needs attention. Red is error or irreversible. Purple is AI only.">
        <Row align="flex-start">
          {swatch('--yx-color-action-primary', 'Action')}
          {swatch('--yx-color-success-text', 'Success')}
          {swatch('--yx-color-warning-text', 'Warning')}
          {swatch('--yx-color-danger-text', 'Danger')}
          {swatch('--yx-color-ai-text', 'AI')}
        </Row>
      </Section>
      <Section title="Chart palette, in order (§48)">
        <Row align="flex-start">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} style={{ width: 40, height: 40, borderRadius: 6, background: `var(--yx-chart-${n})` }} title={`chart-${n}`} />
          ))}
        </Row>
      </Section>
    </Stack>
  ),
};
