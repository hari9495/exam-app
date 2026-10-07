import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { CalendarDays, FileText, Inbox, Landmark, Receipt, Star, UserMinus, UserPlus, Users } from 'lucide-react';
import { COLOR_ICONS, COLOR_ICONS_TO_COMMISSION, ColorIcon, type ColorIconName, type ColorIconSize } from '../components/color-icon';
import { PanelGroup, PanelLink, RAIL_ITEMS, SidePanel, SideRail, type RailItem } from '../components/shell';
import { Monogram } from '../components/brand';
import { EmptyState } from '../components/feedback';
import { Button, Link } from '../components/button';
import { Section } from './story-kit';

// Preview only (founder decision 7 Oct 2026): the real navigation still uses RAIL_ITEMS (Lucide outline).
const meta: Meta = { title: 'Foundations/Icons/Colour icons', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const AREA: Record<string, { name: ColorIconName; label: string; short?: string }> = {
  home: { name: 'area.home', label: 'Home' },
  people: { name: 'area.people', label: 'People' },
  time: { name: 'area.time', label: 'Time and leave', short: 'Time' },
  pay: { name: 'area.payroll', label: 'Payroll' },
  hire: { name: 'area.hiring', label: 'Hiring' },
  assess: { name: 'area.assessments', label: 'Assessments' },
  performance: { name: 'area.performance', label: 'Performance' },
  learning: { name: 'area.learning', label: 'Learning' },
  helpdesk: { name: 'area.serviceDesk', label: 'Service desk', short: 'Service' },
  analytics: { name: 'area.analytics', label: 'Analytics' },
  settings: { name: 'area.settings', label: 'Settings' },
};

const COLOUR_RAIL: RailItem[] = RAIL_ITEMS.map((i) => ({ ...i, ...AREA[i.id], art: <ColorIcon name={AREA[i.id].name} size={20} /> }));

const PEOPLE_PANEL = (
  <SidePanel title="People">
    <PanelGroup label="Favourites">
      <PanelLink icon={Star} href="#">Probation due this month</PanelLink>
      <PanelLink icon={Star} href="#">Hosur plant, all shifts</PanelLink>
    </PanelGroup>
    <PanelGroup label="Records">
      <PanelLink icon={Users} href="#" active>Employees</PanelLink>
      <PanelLink icon={Inbox} href="#" count={12}>Approvals</PanelLink>
      <PanelLink icon={UserPlus} href="#" count={4}>Onboarding</PanelLink>
      <PanelLink icon={UserMinus} href="#">Exits</PanelLink>
      <PanelLink icon={FileText} href="#">Documents</PanelLink>
    </PanelGroup>
  </SidePanel>
);

const PAYROLL_PANEL = (
  <SidePanel title="Payroll">
    <PanelGroup label="Records">
      <PanelLink icon={CalendarDays} href="#" active>Pay runs</PanelLink>
      <PanelLink icon={Receipt} href="#">Payslips</PanelLink>
      <PanelLink icon={Landmark} href="#" count={2}>Statutory filings</PanelLink>
      <PanelLink icon={FileText} href="#">Salary structures</PanelLink>
    </PanelGroup>
  </SidePanel>
);

function Surface({ dark, title, children }: { dark?: boolean; title: string; children: ReactNode }) {
  return (
    <figure data-theme={dark ? 'dark' : 'light'} style={{ margin: 0, width: 'min-content', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 8, background: 'var(--yx-color-bg-page)', color: 'var(--yx-color-text)', border: '1px solid var(--yx-color-border)' }}>
      <figcaption style={{ fontSize: 13, whiteSpace: 'nowrap', color: 'var(--yx-color-text-secondary)' }}>{title}</figcaption>
      <div style={{ display: 'flex', height: 640, maxWidth: '100%', overflow: 'hidden', background: 'var(--yx-color-bg-surface)' }}>{children}</div>
    </figure>
  );
}

const Wrap = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>{children}</div>;
const Page = ({ children }: { children: ReactNode }) => <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>;

/* ---------------- (a) sidebar ---------------- */

const Sidebar = () => (
  <Section title="Sidebar · colour area icons" note="20 px, label always visible. Selected = blue fill and bar; hover = grey fill (Time, on the collapsed rails). Lucide stays in the panel (dense lists).">
    <Wrap>
      <Surface title="Light · collapsed">
        <SideRail items={COLOUR_RAIL} activeId="people" logo={<Monogram />} aria-label="Areas, light, collapsed" />
      </Surface>
      <Surface title="Light · expanded">
        <SideRail items={COLOUR_RAIL} activeId="people" logo={<Monogram />} aria-label="Areas, light, expanded" />
        {PEOPLE_PANEL}
      </Surface>
      <Surface dark title="Dark · collapsed">
        <SideRail items={COLOUR_RAIL} activeId="people" logo={<Monogram />} aria-label="Areas, dark, collapsed" />
      </Surface>
      <Surface dark title="Dark · expanded">
        <SideRail items={COLOUR_RAIL} activeId="pay" logo={<Monogram />} aria-label="Areas, dark, expanded" />
        {PAYROLL_PANEL}
      </Surface>
    </Wrap>
  </Section>
);

/* ---------------- (b) Home tiles ---------------- */

const TILES: { name: ColorIconName; title: string; fact: string }[] = [
  { name: 'approvals', title: 'Approvals', fact: '12 waiting · oldest is Arjun Nair’s leave, 3 days' },
  { name: 'leave', title: 'My leave', fact: '8 earned leave and 4 casual days left' },
  { name: 'holidays', title: 'Holidays', fact: 'Next: Gandhi Jayanti, Fri 2 Oct' },
  { name: 'area.payroll', title: 'Payroll', fact: 'September pay run locks Wed 30 Sep' },
  { name: 'onboarding', title: 'Joining this week', fact: 'Priya Shankar, Lab Analyst, Mon 5 Oct' },
  { name: 'jobOpening', title: 'Open jobs', fact: 'Quality Analyst, Hosur · 14 applicants' },
  { name: 'orgChart', title: 'Org chart', fact: 'Quality · Divya Menon · 42 people' },
  { name: 'documents', title: 'Documents', fact: '2 letters for you to sign' },
  { name: 'announcements', title: 'Announcements', fact: 'Hosur canteen moves to Block B on 5 Oct' },
  { name: 'area.learning', title: 'Learning', fact: 'POSH refresher due 15 Oct' },
  { name: 'setup', title: 'Setup', fact: '4 of 7 steps done · add leave rules next' },
  { name: 'help', title: 'Help', fact: 'Ask HR or read how leave works' },
];

function Tiles({ size = 32 }: { size?: ColorIconSize }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
      {TILES.map((t) => (
        <li key={t.title}>
          <a href="#" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 8, textDecoration: 'none', color: 'var(--yx-color-text)', background: 'var(--yx-color-bg-surface)', border: '1px solid var(--yx-color-border)' }}>
            <ColorIcon name={t.name} size={size} tile />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{t.title}</span>
              <span style={{ fontSize: 13, color: 'var(--yx-color-text-secondary)' }}>{t.fact}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const Home = () => (
  <Section title="Home tiles" note="32 px on a neutral tile; the words carry the meaning. Good morning, Divya Raghunathan (manager view, 29 Sep 2026).">
    <div style={{ display: 'grid', gap: 16 }}>
      <div data-theme="light" style={{ padding: 16, borderRadius: 8, background: 'var(--yx-color-bg-page)' }}><Tiles /></div>
      <div data-theme="dark" style={{ padding: 16, borderRadius: 8, background: 'var(--yx-color-bg-page)' }}><Tiles /></div>
    </div>
  </Section>
);

/* ---------------- (c) empty states ---------------- */

const Empties = () => (
  <Section title="Empty states" note="48 px colour icon, then what to do next and the action (§26).">
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} data-theme={theme} style={{ display: 'grid', gap: 16, padding: 16, borderRadius: 8, background: 'var(--yx-color-bg-page)' }}>
          <div style={{ background: 'var(--yx-color-bg-surface)', border: '1px solid var(--yx-color-border)', borderRadius: 8 }}>
            <EmptyState
              icon={<ColorIcon name="allDone" size={48} />}
              title="No leave requests waiting"
              description="You’re all caught up. New requests from Anand, Kavya and the rest of Quality show up here."
              action={<Button>Open team calendar</Button>}
            />
          </div>
          <div style={{ background: 'var(--yx-color-bg-surface)', border: '1px solid var(--yx-color-border)', borderRadius: 8 }}>
            <EmptyState
              icon={<ColorIcon name="jobOpening" size={48} />}
              title="No open jobs yet"
              description="Add a job opening to start taking applications on the Kaveri Foods careers page."
              action={<Button variant="primary">Add job opening</Button>}
              help={<Link href="#">How hiring works</Link>}
            />
          </div>
        </div>
      ))}
    </div>
  </Section>
);

/* ---------------- (d) before / after ---------------- */

const BeforeAfter = () => (
  <Section title="Before / after" note="Same areas, same order, same selection. Left: today’s Lucide outline rail. Right: Fluent colour rail.">
    <Wrap>
      <Surface title="Before · Lucide">
        <SideRail items={RAIL_ITEMS} activeId="time" logo={<Monogram />} aria-label="Areas, before" />
      </Surface>
      <Surface title="After · colour">
        <SideRail items={COLOUR_RAIL} activeId="time" logo={<Monogram />} aria-label="Areas, after" />
      </Surface>
      <Surface dark title="Before · dark">
        <SideRail items={RAIL_ITEMS} activeId="time" logo={<Monogram />} aria-label="Areas, before, dark" />
      </Surface>
      <Surface dark title="After · dark">
        <SideRail items={COLOUR_RAIL} activeId="time" logo={<Monogram />} aria-label="Areas, after, dark" />
      </Surface>
    </Wrap>
  </Section>
);

/* ---------------- (e) registry ---------------- */

const cell = { padding: '8px 12px', borderBottom: '1px solid var(--yx-color-border)', textAlign: 'left' as const, verticalAlign: 'middle' as const, overflowWrap: 'anywhere' as const };

const Registry = () => (
  <Section title="Icon registry · meaning → icon" note="One icon per meaning. Screens use <ColorIcon name=…>, never a Fluent import.">
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 14, background: 'var(--yx-color-bg-surface)' }}>
      <thead>
        <tr>
          <th style={{ ...cell, width: 96 }}>Icon</th>
          <th style={cell}>Meaning</th>
          <th style={cell}>Fluent icon</th>
        </tr>
      </thead>
      <tbody>
        {(Object.keys(COLOR_ICONS) as ColorIconName[]).map((k) => (
          <tr key={k}>
            <td style={cell}>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <ColorIcon name={k} size={20} />
                <ColorIcon name={k} size={48} />
              </span>
            </td>
            <td style={cell}>
              {COLOR_ICONS[k].meaning}
              <br />
              <code style={{ fontSize: 12, color: 'var(--yx-color-text-secondary)' }}>{k}</code>
            </td>
            <td style={cell}>
              {COLOR_ICONS[k].fluent}
              <br />
              <span style={{ fontSize: 12, color: 'var(--yx-color-text-secondary)' }}>drawn at {Object.keys(COLOR_ICONS[k].art).join(' / ')} px</span>
            </td>
          </tr>
        ))}
        {COLOR_ICONS_TO_COMMISSION.map((m) => (
          <tr key={m}>
            <td style={{ ...cell, color: 'var(--yx-color-text-muted)' }}>None yet</td>
            <td style={cell}>{m}</td>
            <td style={cell}>No good Fluent icon · commission from the brand designer</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Section>
);

export const ColourIcons: S = {
  name: 'Colour icons',
  parameters: {
    pseudo: { hover: ['.yx-rail[aria-label$="collapsed"] .yx-rail__item[aria-label="Time and leave"]'] },
  },
  render: () => (
    <Page>
      <Sidebar />
      <Home />
      <Empties />
      <BeforeAfter />
      <Registry />
    </Page>
  ),
};
