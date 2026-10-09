import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '../components/foundations';
import { formatBytes, formatDate, formatINR, formatMoney, formatTime, groupIndian, initials } from '../lib/format';
import { ID_SPECS, maskAadhaar } from '../lib/validators';
import { Row, Section, Stack } from './story-kit';

const meta: Meta = { title: 'Foundations/Tokens and formats' };
export default meta;

const RAMP = (name: string, steps: (string | number)[]) => (
  <Row gap={4} align="flex-start">
    {steps.map((n) => (
      <div key={n} style={{ width: 72 }}>
        <div style={{ height: 40, borderRadius: 6, background: `var(--yx-${name}-${n})`, border: '1px solid var(--yx-color-border)' }} />
        <Text size="xs" tone="muted" mono>
          {name} {n}
        </Text>
      </div>
    ))}
  </Row>
);

const STATUS_PAIR = (tone: string, label: string) => (
  <div
    key={tone}
    style={{
      padding: '6px 10px',
      borderRadius: 4,
      color: `var(--yx-color-${tone}-text)`,
      background: `var(--yx-color-${tone}-bg)`,
      border: `1px solid var(--yx-color-${tone}-border)`,
    }}
  >
    <Text size="sm" weight="medium">
      {label}
    </Text>
  </div>
);

const cell = { padding: '6px 16px 6px 0' } as const;

export const Tokens: StoryObj = {
  render: () => (
    <Stack>
      <Section title="Primitive ramps (§3) · components never use these directly (§41)">
        {RAMP('azure', [50, 100, 200, 300, 400, 500, 600, 700, 800])}
        {RAMP('slate', [0, 25, 50, 100, 200, 300, 500, 550, 600, 700, 800, 900])}
      </Section>
      <Section title="Status pairs · text, background and border always together">
        <Row>
          {STATUS_PAIR('success', 'Success · paid, approved, done')}
          {STATUS_PAIR('warning', 'Warning · pending, attention')}
          {STATUS_PAIR('danger', 'Danger · error, irreversible')}
          {STATUS_PAIR('info', 'Info · notices')}
          {STATUS_PAIR('ai', 'AI · suggestions only')}
        </Row>
      </Section>
      <Section title="Spacing scale (§4)">
        <Stack gap={6}>
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
            <Row key={n} gap={12}>
              <span style={{ width: 72 }}>
                <Text size="xs" mono tone="muted">
                  space-{n}
                </Text>
              </span>
              <div style={{ width: `var(--yx-space-${n})`, height: 12, background: 'var(--yx-color-action-primary)', borderRadius: 2 }} />
            </Row>
          ))}
        </Stack>
      </Section>
      <Section title="Corner radius (§5) · no pills">
        <Row gap={16}>
          {[
            ['badge', '4 · badges'],
            ['control', '6 · buttons, inputs'],
            ['card', '8 · cards, menus'],
            ['dialog', '12 · dialogs, drawers'],
          ].map(([k, l]) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ width: 120, height: 64, borderRadius: `var(--yx-radius-${k})`, border: '1px solid var(--yx-color-border-strong)', background: 'var(--yx-color-bg-surface)' }} />
              <Text size="xs" tone="muted">
                {l}
              </Text>
            </div>
          ))}
        </Row>
      </Section>
      <Section title="Elevation (§6) · three shadows only; in-page cards are flat">
        <Row gap={24}>
          {[
            ['none', 'Card · flat, hairline border'],
            ['popover', 'Popover, menu, toast'],
            ['drawer', 'Drawer'],
            ['dialog', 'Dialog'],
          ].map(([k, l]) => (
            <div
              key={k}
              style={{
                width: 160,
                height: 88,
                padding: 12,
                borderRadius: 8,
                background: 'var(--yx-color-bg-raised)',
                border: '1px solid var(--yx-color-border)',
                boxShadow: k === 'none' ? 'none' : `var(--yx-shadow-${k})`,
              }}
            >
              <Text size="sm">{l}</Text>
            </div>
          ))}
        </Row>
      </Section>
      <Section title="Motion (§7) · reduce-motion makes all of these instant">
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {[
              ['Menus, tooltips, popovers', 'duration-menu', '120 ms'],
              ['Dialogs', 'duration-dialog', '150 ms'],
              ['Toasts', 'duration-toast', '150 ms'],
              ['Drawers', 'duration-drawer', '200 ms'],
              ['Charts, first draw only', '(chart component)', '400 ms or less'],
              ['Never', '', 'Hover lift, bounce, parallax, counting-up money'],
            ].map(([a, b, c]) => (
              <tr key={a}>
                <td style={cell}>{a}</td>
                <td style={cell}>
                  <Text mono size="xs" tone="muted">
                    {b}
                  </Text>
                </td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Breakpoints and density (§2, §4) · try the Density toolbar and the viewport button">
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {[
              ['Phone', 'under 768 px', 'Body 16 px, controls and targets 44 px, paired fields stack'],
              ['Tablet', '768 px and up', 'Body 14 px, controls 36 px'],
              ['Desktop', '1024 / 1280 / 1536 px', '12 columns, 24 px gutters, reading pages max 1440 px'],
              ['Compact density', 'user setting', 'Body 13 px, controls 32 px, table rows 32 px'],
            ].map(([a, b, c]) => (
              <tr key={a}>
                <td style={{ ...cell, fontWeight: 500 }}>{a}</td>
                <td style={{ ...cell, color: 'var(--yx-color-text-secondary)' }}>{b}</td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Stack>
  ),
};

export const Formats: StoryObj = {
  name: 'Formats (§35)',
  render: () => {
    const rows: [string, string, string][] = [
      ['Rupees', '118500', formatINR(118500)],
      ['Rupees, crore', '42183000', formatINR(42183000)],
      ['Rupees with paise', '1234.5', formatINR(1234.5)],
      ['Negative amount', '-2500', formatINR(-2500)],
      ['Indian grouping', '123456789', groupIndian(123456789)],
      ['Other currency', 'USD 1234.5', formatMoney(1234.5, 'USD', 'en-US')],
      ['Date', '2026-09-28', formatDate(new Date(2026, 8, 28))],
      ['Time, 12-hour (India default)', '21:30', formatTime('21:30')],
      ['Time, 24-hour option', '21:30', formatTime('21:30', false)],
      ['File size', '1572864 bytes', formatBytes(1572864)],
      ['Initials', 'Lakshmi Venkatesan', initials('Lakshmi Venkatesan')],
      ['UAN', '100012345678', ID_SPECS.uan.display('100012345678')],
      ['Mobile', '9876543210', `+91 ${ID_SPECS.phone.display('9876543210')}`],
      ['Aadhaar, masked', '234567890124', maskAadhaar('234567890124')],
    ];
    return (
      <table style={{ borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--yx-color-text-muted)', fontSize: 12 }}>
            <th style={{ ...cell, fontWeight: 500 }}>What</th>
            <th style={{ ...cell, fontWeight: 500 }}>Stored value</th>
            <th style={{ ...cell, fontWeight: 500 }}>Shown as</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c]) => (
            <tr key={a} style={{ borderTop: '1px solid var(--yx-color-border)' }}>
              <td style={cell}>{a}</td>
              <td style={cell}>
                <Text mono tone="secondary">
                  {b}
                </Text>
              </td>
              <td style={{ ...cell, fontVariantNumeric: 'tabular-nums' }}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
};
