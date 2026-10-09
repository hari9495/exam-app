import '../components/careers.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  CareersPage,
  JobApplyForm,
  PageBuilder,
  resolveTenantAccent,
  type CareersConfig,
  type CareersJob,
  type CareersPageStatus,
} from '../components/careers';
import { Logo, Monogram, PoweredBy } from '../components/brand';
import type { UploadHandlers } from '../components/upload';
import { Section, Stack, Row } from './story-kit';

const meta: Meta = { title: 'Surfaces/Careers', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

const JOBS: CareersJob[] = [
  { id: 'j1', title: 'Production supervisor', department: 'Manufacturing', location: 'Coimbatore plant', type: 'Full time', postedOn: d(2026, 9, 22) },
  { id: 'j2', title: 'Quality analyst — food safety', department: 'Quality', location: 'Coimbatore plant', type: 'Full time', postedOn: d(2026, 9, 18) },
  { id: 'j3', title: 'Accounts executive', department: 'Finance', location: 'Coimbatore head office', type: 'Full time', postedOn: d(2026, 9, 15) },
  { id: 'j4', title: 'Area sales manager, Kerala', department: 'Sales', location: 'Kochi', type: 'Full time', postedOn: d(2026, 9, 12) },
  { id: 'j5', title: 'Maintenance technician (ITI electrical)', department: 'Manufacturing', location: 'Hosur plant', type: 'Full time', postedOn: d(2026, 9, 10) },
  { id: 'j6', title: 'HR intern', department: 'People', location: 'Coimbatore head office', type: 'Internship · 6 months', postedOn: d(2026, 9, 3) },
  { id: 'j7', title: 'Territory sales officer', department: 'Sales', location: 'Madurai', type: 'Full time', postedOn: d(2026, 8, 28) },
];

const CONFIG: CareersConfig = {
  companyName: 'Nilgiri Foods',
  theme: 'classic',
  sections: [
    {
      id: 'hero-1',
      type: 'hero',
      title: 'Make the biscuits South India grows up with',
      text: '1,200 people across three plants and 40 sales towns. Most of our supervisors started on the line.',
      photoAlt: 'Packing line team at the Coimbatore plant during a shift change',
    },
    {
      id: 'about-1',
      type: 'about',
      title: 'About Nilgiri Foods',
      text: 'We have baked in Coimbatore since 1986. Today we make 140 tonnes of biscuits and rusks a day for shops in Tamil Nadu, Kerala and Karnataka, and we still taste every batch before it leaves the plant.',
    },
    {
      id: 'values-1',
      type: 'values',
      title: 'What we value',
      items: [
        { title: 'Safety first, every shift', text: 'Anyone can stop a line if something looks unsafe. No one is questioned for doing it.' },
        { title: 'Grow from within', text: 'Seven of our ten plant heads joined as trainees.' },
        { title: 'Pay on time, every time', text: 'Salaries are credited on the last working day, without exception.' },
        { title: 'Say it plainly', text: 'Policies and payslips are written in Tamil, Malayalam and English.' },
      ],
    },
    {
      id: 'benefits-1',
      type: 'benefits',
      title: 'Benefits',
      items: [
        { icon: 'health', title: 'Family health cover', text: '₹5,00,000 floater for you, your spouse, children and parents.' },
        { icon: 'meal', title: 'Subsidised canteen', text: 'Breakfast and lunch for ₹20 a day on every shift.' },
        { icon: 'transport', title: 'Shift buses', text: 'Free buses from 14 pick-up points around each plant.' },
        { icon: 'learning', title: 'Learning allowance', text: '₹25,000 a year for courses and certifications.' },
        { icon: 'leave', title: '24 days of paid leave', text: 'Plus 12 public holidays and 6 days of sick leave.' },
        { icon: 'family', title: 'Crèche at every plant', text: 'For children aged 6 months to 5 years.' },
      ],
    },
    { id: 'jobs-1', type: 'jobs', title: 'Open jobs' },
    {
      id: 'locations-1',
      type: 'locations',
      title: 'Where we work',
      items: [
        { city: 'Coimbatore', address: 'Head office and plant\nSIDCO Industrial Estate, Kurichi\nCoimbatore 641021' },
        { city: 'Hosur', address: 'Plant 2\nSIPCOT Phase II\nHosur 635109' },
        { city: 'Kochi', address: 'Regional sales office\nKakkanad\nKochi 682030' },
      ],
    },
    {
      id: 'team-1',
      type: 'team',
      title: 'Our people',
      items: [
        { alt: 'Lakshmi Venkatesan, quality lead, at the lab bench', caption: 'Lakshmi, quality lead, 11 years' },
        { alt: 'Night shift maintenance crew in Hosur', caption: 'Hosur maintenance crew' },
        { alt: 'Sales team at the Kochi office', caption: 'Kerala sales team' },
      ],
    },
    {
      id: 'faq-1',
      type: 'faq',
      title: 'Questions candidates ask',
      items: [
        { question: 'How long does hiring take?', answer: 'Usually two to three weeks from applying to an offer. We tell you after every step.' },
        { question: 'Do I need to know Tamil?', answer: 'Not for office roles. Plant roles need basic Tamil or Malayalam for safety briefings; we help you learn.' },
        { question: 'Is there a test?', answer: 'Some roles have a 30-minute online test. You can take it from your phone.' },
      ],
    },
    { id: 'footer-1', type: 'footer', title: 'Contact', text: 'Nilgiri Foods Private Limited · SIDCO Industrial Estate, Kurichi, Coimbatore 641021 · careers@nilgirifoods.example' },
  ],
};

const Page = ({ config = CONFIG, jobs = JOBS }: { config?: CareersConfig; jobs?: CareersJob[] }) => <CareersPage config={config} jobs={jobs} onApply={() => {}} />;

export const Classic: S = { render: () => <Page /> };
export const Compact: S = { render: () => <Page config={{ ...CONFIG, theme: 'compact' }} /> };
export const Split: S = { render: () => <Page config={{ ...CONFIG, theme: 'split' }} /> };

export const TenantAccent: S = {
  name: 'Tenant accent (#1F6F4A, 6.4:1)',
  render: () => <Page config={{ ...CONFIG, accent: '#1F6F4A' }} />,
};

export const AccentTooLight: S = {
  name: 'Tenant accent too light (falls back)',
  render: () => {
    const r = resolveTenantAccent('#F5B400');
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>
          Accent #F5B400 has {r.ratio}:1 contrast with white, below 4.5:1, so the page uses the YukthiX action colour.
        </p>
        <Page config={{ ...CONFIG, accent: '#F5B400' }} />
      </div>
    );
  },
};

export const Mobile: S = {
  render: () => <Page config={{ ...CONFIG, accent: '#1F6F4A' }} />,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
};

export const MobileSplit: S = {
  render: () => <Page config={{ ...CONFIG, theme: 'split' }} />,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
};

export const NoOpenJobs: S = { render: () => <Page jobs={[]} config={{ ...CONFIG, theme: 'compact' }} /> };

export const WhiteLabel: S = {
  name: 'White-label (no Powered by)',
  render: () => <Page config={{ ...CONFIG, whiteLabel: true, sections: CONFIG.sections.filter((s) => ['hero', 'jobs', 'footer'].includes(s.type)) }} />,
};

export const MinimalPage: S = {
  name: 'Minimal (hero text only, jobs)',
  render: () => (
    <Page
      config={{
        companyName: 'Sridhar Industries',
        theme: 'classic',
        sections: [
          { id: 'hero-1', type: 'hero', title: 'Join Sridhar Industries', text: 'Precision castings for the auto industry, Hosur.' },
          { id: 'jobs-1', type: 'jobs', title: 'Open jobs' },
        ],
      }}
    />
  ),
};

/* ---------------- Page builder ---------------- */

function BuilderDemo({ device, selected = 'benefits-1', status: initialStatus = 'draft' }: { device?: 'desktop' | 'mobile'; selected?: string; status?: CareersPageStatus }) {
  const [config, setConfig] = useState<CareersConfig>({ ...CONFIG, sections: CONFIG.sections.map((s) => (s.id === 'team-1' ? { ...s, hidden: true } : s)) });
  const [status, setStatus] = useState(initialStatus);
  return (
    <div style={{ padding: 0 }}>
      <PageBuilder
        value={config}
        onChange={(c) => {
          setConfig(c);
          setStatus('draft');
        }}
        jobs={JOBS}
        status={status}
        onPublish={() => setStatus('published')}
        defaultDevice={device}
        defaultSelectedId={selected}
      />
    </div>
  );
}

export const PageBuilderEditing: S = { name: 'Page builder — editing', render: () => <BuilderDemo /> };
export const PageBuilderMobilePreview: S = { name: 'Page builder — mobile preview', render: () => <BuilderDemo device="mobile" selected="hero-1" /> };
export const PageBuilderPublished: S = { name: 'Page builder — published', render: () => <BuilderDemo status="published" selected="faq-1" /> };
export const PageBuilderLightAccent: S = {
  name: 'Page builder — accent too light',
  render: function Render() {
    const [config, setConfig] = useState<CareersConfig>({ ...CONFIG, accent: '#F5B400' });
    return <PageBuilder value={config} onChange={setConfig} jobs={JOBS} status="draft" defaultSelectedId="hero-1" />;
  },
};

/* ---------------- Apply form ---------------- */

// Deterministic fake upload: 3 progress steps, then scan, then done.
const fakeUpload = (_f: File, h: UploadHandlers) =>
  new Promise<void>((resolve) => {
    let p = 0;
    const t = setInterval(() => {
      p += 34;
      h.onProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(t);
        h.onScanning();
        setTimeout(resolve, 400);
      }
    }, 250);
  });

const ApplyDemo = ({ sent }: { sent?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'center' }}>
    <JobApplyForm job={JOBS[2]} companyName="Nilgiri Foods" upload={fakeUpload} onSubmit={() => new Promise((r) => setTimeout(r, 600))} defaultSent={sent} />
  </div>
);

export const ApplyForm: S = { render: () => <ApplyDemo /> };
export const ApplyFormMobile: S = { render: () => <ApplyDemo />, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export const ApplyFormSent: S = { render: () => <ApplyDemo sent /> };

/* ---------------- Brand placeholders ---------------- */

export const BrandPlaceholders: S = {
  name: 'Logo and monogram (placeholders)',
  render: () => (
    <Stack width={640}>
      <Section title="Wordmark (placeholder until the designer's SVG)" note="IBM Plex Sans semibold, X in the action colour. aria-label YukthiX.">
        <Row gap={32}>
          <Logo size="sm" />
          <Logo size="md" />
          <Logo size="lg" />
        </Row>
      </Section>
      <Section title="X monogram (placeholder)" note="Top of the rail and favicons. 24, 32 and 40 px.">
        <Row gap={24}>
          <Monogram size="sm" />
          <Monogram size="md" />
          <Monogram size="lg" />
        </Row>
      </Section>
      <Section title="Powered by YukthiX" note="On employee and candidate surfaces by default; hidden for white-label tenants.">
        <PoweredBy />
      </Section>
    </Stack>
  ),
};
