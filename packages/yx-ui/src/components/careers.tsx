import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Baby,
  Briefcase,
  Bus,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  GripVertical,
  HeartPulse,
  Home,
  MapPin,
  Monitor,
  Plus,
  Smartphone,
  Trash2,
  Utensils,
  Wallet,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { formatDate } from '../lib/format';
import { ID_SPECS, isEmail } from '../lib/validators';
import { Icon, type IconComponent } from './foundations';
import { Button, ButtonGroup, IconButton } from './button';
import { Badge } from './display';
import { EmptyState, InlineAlert } from './feedback';
import { Form, FormField, FormSection } from './field';
import { MaskedField, NumberField, TextArea, TextField } from './inputs';
import { DatePicker } from './date';
import { Checkbox } from './choice';
import { Select, type SelectOption } from './select';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu';
import { FileUpload, type FileUploadProps, type UploadItem } from './upload';
import { PoweredBy } from './brand';

/* ================================================================== */
/* Tenant accent: the ONE place a runtime colour is accepted (§38)     */
/* ================================================================== */

/** WCAG AA for normal text: the accent carries white button labels and link text on white. */
export const TENANT_ACCENT_MIN_CONTRAST = 4.5;

/** "#1f6f4a", "1F6F4A" or "#abc" -> "#1F6F4A"; null when not a hex colour. */
export function normaliseHex(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${h.toUpperCase()}`;
}

/** WCAG relative luminance of a normalised hex colour. */
export function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Contrast of a colour against white (luminance 1). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

export interface TenantAccentResult {
  /** Normalised accent to apply, or null to fall back to the YukthiX action colour. */
  accent: string | null;
  /** Contrast against white, rounded to 1 decimal; null when the input is not a colour. */
  ratio: number | null;
  reason?: 'invalid' | 'too-light';
}

/** Pure check used by CareersPage and the builder: accept the accent only at ≥ 4.5:1 against white. */
export function resolveTenantAccent(input?: string | null): TenantAccentResult {
  if (!input) return { accent: null, ratio: null };
  const hex = normaliseHex(input);
  if (!hex) return { accent: null, ratio: null, reason: 'invalid' };
  const ratio = Math.round(contrastWithWhite(hex) * 10) / 10;
  if (contrastWithWhite(hex) < TENANT_ACCENT_MIN_CONTRAST) return { accent: null, ratio, reason: 'too-light' };
  return { accent: hex, ratio };
}

/* ================================================================== */
/* Config                                                              */
/* ================================================================== */

export type CareersTheme = 'classic' | 'compact' | 'split';

export type BenefitIcon = 'health' | 'leave' | 'learning' | 'money' | 'home' | 'transport' | 'meal' | 'family';

const BENEFIT_ICONS: Record<BenefitIcon, { icon: IconComponent; label: string }> = {
  health: { icon: HeartPulse, label: 'Health' },
  leave: { icon: CalendarDays, label: 'Leave' },
  learning: { icon: GraduationCap, label: 'Learning' },
  money: { icon: Wallet, label: 'Money' },
  home: { icon: Home, label: 'Home and hybrid' },
  transport: { icon: Bus, label: 'Transport' },
  meal: { icon: Utensils, label: 'Meals' },
  family: { icon: Baby, label: 'Family' },
};

export interface CareersPhoto {
  /** Real photos of real employees only (§9). Empty shows a labelled placeholder. */
  src?: string;
  alt: string;
  caption?: string;
}

interface SectionBase {
  id: string;
  title: string;
  hidden?: boolean;
}

export type CareersSectionConfig =
  | (SectionBase & { type: 'hero'; text: string; photoSrc?: string; photoAlt?: string })
  | (SectionBase & { type: 'about'; text: string })
  | (SectionBase & { type: 'values'; items: { title: string; text: string }[] })
  | (SectionBase & { type: 'benefits'; items: { icon: BenefitIcon; title: string; text: string }[] })
  | (SectionBase & { type: 'jobs' })
  | (SectionBase & { type: 'locations'; items: { city: string; address: string }[] })
  | (SectionBase & { type: 'team'; items: CareersPhoto[] })
  | (SectionBase & { type: 'faq'; items: { question: string; answer: string }[] })
  | (SectionBase & { type: 'footer'; text: string });

export type CareersSectionType = CareersSectionConfig['type'];

export interface CareersConfig {
  companyName: string;
  /** Tenant logo (img or svg). Falls back to the company name in text. */
  logo?: ReactNode;
  theme: CareersTheme;
  /**
   * Tenant accent as hex ("#1F6F4A"). Applied only on the careers page, through `--yx-tenant-accent`.
   * It must reach 4.5:1 against white; a lighter colour (or an invalid value) is ignored and the
   * YukthiX action colour is used instead. In dark mode the action colour is always used.
   */
  accent?: string;
  /** Hides "Powered by YukthiX" (white-label, D15). */
  whiteLabel?: boolean;
  sections: CareersSectionConfig[];
}

export interface CareersJob {
  id: string;
  title: string;
  department: string;
  location: string;
  /** "Full time", "Contract", "Internship"… */
  type: string;
  postedOn: Date;
}

/* ================================================================== */
/* Section library (fixed, pre-designed; no free-form HTML)            */
/* ================================================================== */

interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  options?: SelectOption[];
  helper?: string;
}

export interface CareersSectionDefinition {
  type: CareersSectionType;
  label: string;
  description: string;
  /** Only one per page. */
  single?: boolean;
  fields: FieldDef[];
  itemFields?: FieldDef[];
  itemLabel?: string;
  newItem?: () => Record<string, string>;
  create: () => Omit<CareersSectionConfig, 'id'>;
}

const titleField: FieldDef = { key: 'title', label: 'Heading' };

/** The fixed section library for the careers page builder (§40). */
export const CareersSectionLibrary: Record<CareersSectionType, CareersSectionDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    description: 'Opening heading, a short line and an optional team photo',
    single: true,
    fields: [
      titleField,
      { key: 'text', label: 'Text', multiline: true },
      { key: 'photoAlt', label: 'Photo description', helper: 'Describe the photo for people who cannot see it' },
    ],
    create: () => ({ type: 'hero', title: 'Work with us', text: 'Tell candidates in one or two lines what it is like to work here.' }),
  },
  about: {
    type: 'about',
    label: 'About',
    description: 'A short paragraph about the company',
    fields: [titleField, { key: 'text', label: 'Text', multiline: true }],
    create: () => ({ type: 'about', title: 'About us', text: '' }),
  },
  values: {
    type: 'values',
    label: 'Values',
    description: 'What the company stands for, as short points',
    fields: [titleField],
    itemLabel: 'Value',
    itemFields: [
      { key: 'title', label: 'Value' },
      { key: 'text', label: 'Description', multiline: true },
    ],
    newItem: () => ({ title: '', text: '' }),
    create: () => ({ type: 'values', title: 'What we value', items: [] }),
  },
  benefits: {
    type: 'benefits',
    label: 'Benefits',
    description: 'Benefits list with icons',
    fields: [titleField],
    itemLabel: 'Benefit',
    itemFields: [
      {
        key: 'icon',
        label: 'Icon',
        options: (Object.keys(BENEFIT_ICONS) as BenefitIcon[]).map((k) => ({ value: k, label: BENEFIT_ICONS[k].label })),
      },
      { key: 'title', label: 'Benefit' },
      { key: 'text', label: 'Description', multiline: true },
    ],
    newItem: () => ({ icon: 'health', title: '', text: '' }),
    create: () => ({ type: 'benefits', title: 'Benefits', items: [] }),
  },
  jobs: {
    type: 'jobs',
    label: 'Open jobs',
    description: 'Live list of published jobs with search and department filter',
    single: true,
    fields: [titleField],
    create: () => ({ type: 'jobs', title: 'Open jobs' }),
  },
  locations: {
    type: 'locations',
    label: 'Locations',
    description: 'Offices and plants with addresses',
    fields: [titleField],
    itemLabel: 'Location',
    itemFields: [
      { key: 'city', label: 'City' },
      { key: 'address', label: 'Address', multiline: true },
    ],
    newItem: () => ({ city: '', address: '' }),
    create: () => ({ type: 'locations', title: 'Where we work', items: [] }),
  },
  team: {
    type: 'team',
    label: 'Team photos',
    description: 'Real photos of your people (no stock photos)',
    fields: [titleField],
    itemLabel: 'Photo',
    itemFields: [
      { key: 'alt', label: 'Photo description' },
      { key: 'caption', label: 'Caption' },
    ],
    newItem: () => ({ alt: '', caption: '' }),
    create: () => ({ type: 'team', title: 'Our people', items: [] }),
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    description: 'Questions candidates ask, in an accordion',
    fields: [titleField],
    itemLabel: 'Question',
    itemFields: [
      { key: 'question', label: 'Question' },
      { key: 'answer', label: 'Answer', multiline: true },
    ],
    newItem: () => ({ question: '', answer: '' }),
    create: () => ({ type: 'faq', title: 'Questions candidates ask', items: [] }),
  },
  footer: {
    type: 'footer',
    label: 'Footer',
    description: 'Company address and "Powered by YukthiX"',
    single: true,
    fields: [titleField, { key: 'text', label: 'Address', multiline: true }],
    create: () => ({ type: 'footer', title: 'Contact', text: '' }),
  },
};

const SECTION_ORDER: CareersSectionType[] = ['hero', 'about', 'values', 'benefits', 'jobs', 'locations', 'team', 'faq', 'footer'];

/** Moves a section up (delta -1) or down (+1). Returns the same array when the move is not possible. */
export function moveSection(sections: CareersSectionConfig[], id: string, delta: number): CareersSectionConfig[] {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= sections.length) return sections;
  const next = [...sections];
  const [s] = next.splice(i, 1);
  next.splice(j, 0, s);
  return next;
}

function newSectionId(type: CareersSectionType, sections: CareersSectionConfig[]) {
  let n = 1;
  while (sections.some((s) => s.id === `${type}-${n}`)) n++;
  return `${type}-${n}`;
}

/* ================================================================== */
/* Careers page                                                        */
/* ================================================================== */

function PhotoSlot({ src, alt }: { src?: string; alt: string }) {
  if (src) return <img className="yx-careers__photo" src={src} alt={alt} />;
  return (
    <div className="yx-careers__photo" data-empty role="img" aria-label={alt || 'Photo not added yet'}>
      <span aria-hidden="true">{alt ? `Photo: ${alt}` : 'Photo not added yet'}</span>
    </div>
  );
}

function FaqList({ items, headingLevel = 3 }: { items: { question: string; answer: string }[]; headingLevel?: 3 | 4 }) {
  const [open, setOpen] = useState<number[]>([]);
  const base = useId();
  const H = `h${headingLevel}` as 'h3' | 'h4';
  return (
    <div className="yx-careers__faq">
      {items.map((it, i) => {
        const isOpen = open.includes(i);
        return (
          <div key={i} className="yx-careers__faq-item">
            <H className="yx-careers__faq-q">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${base}-${i}`}
                id={`${base}-${i}-btn`}
                onClick={() => setOpen(isOpen ? open.filter((x) => x !== i) : [...open, i])}
              >
                <span>{it.question}</span>
                <Icon icon={ChevronDown} />
              </button>
            </H>
            <div id={`${base}-${i}`} role="region" aria-labelledby={`${base}-${i}-btn`} hidden={!isOpen} className="yx-careers__faq-a">
              <p>{it.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JobsList({ jobs, onApply, headingId }: { jobs: CareersJob[]; onApply?: (job: CareersJob) => void; headingId: string }) {
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState<string | null>(null);
  const departments = useMemo(() => Array.from(new Set(jobs.map((j) => j.department))).sort(), [jobs]);
  const q = query.trim().toLowerCase();
  const shown = jobs.filter(
    (j) => (!dept || j.department === dept) && (!q || [j.title, j.location, j.department].some((x) => x.toLowerCase().includes(q))),
  );
  const filtered = q !== '' || dept !== null;

  if (jobs.length === 0) {
    return <EmptyState compact title="No open jobs right now." description="New jobs appear here as soon as they are published." />;
  }

  return (
    <div className="yx-careers__jobs">
      <div className="yx-careers__job-filters" role="search" aria-label="Search jobs">
        <FormField label="Search jobs" hideLabel>
          <TextField type="search" value={query} onChange={setQuery} placeholder="Search by title or location" />
        </FormField>
        <FormField label="Department" hideLabel>
          <Select
            aria-label="Department"
            placeholder="All departments"
            clearable
            value={dept}
            onChange={setDept}
            options={departments.map((d) => ({ value: d, label: d }))}
          />
        </FormField>
      </div>
      <p className="yx-careers__job-count" aria-live="polite">
        {filtered ? `Showing ${shown.length} of ${jobs.length} jobs` : `${jobs.length} open ${jobs.length === 1 ? 'job' : 'jobs'}`}
      </p>
      {shown.length === 0 ? (
        <EmptyState
          compact
          title="No jobs match your search."
          description="Try another word or department."
          action={
            <Button
              onClick={() => {
                setQuery('');
                setDept(null);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="yx-careers__job-list" aria-labelledby={headingId}>
          {shown.map((j) => (
            <li key={j.id} className="yx-careers__job">
              <div className="yx-careers__job-main">
                <h3 className="yx-careers__job-title">{j.title}</h3>
                <ul className="yx-careers__job-meta">
                  <li>
                    <Icon icon={Briefcase} />
                    {j.department} · {j.type}
                  </li>
                  <li>
                    <Icon icon={MapPin} />
                    {j.location}
                  </li>
                  <li>Posted {formatDate(j.postedOn)}</li>
                </ul>
              </div>
              <Button aria-label={`Apply for ${j.title}`} onClick={() => onApply?.(j)}>
                Apply
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sectionAnchor(s: CareersSectionConfig, pageId: string) {
  return `${pageId}-${s.id}`;
}

function CareersSectionView({
  section,
  pageId,
  jobs,
  onApply,
  companyName,
  whiteLabel,
  jobsAnchor,
}: {
  section: CareersSectionConfig;
  pageId: string;
  jobs: CareersJob[];
  onApply?: (job: CareersJob) => void;
  companyName: string;
  whiteLabel?: boolean;
  jobsAnchor?: string;
}) {
  const anchor = sectionAnchor(section, pageId);
  const headingId = `${anchor}-h`;
  const s = section;

  if (s.type === 'hero') {
    return (
      <section className="yx-careers__section yx-careers__hero" data-type="hero" aria-labelledby={headingId} id={anchor}>
        <div className="yx-careers__hero-text">
          <h1 id={headingId} className="yx-careers__hero-title">
            {s.title}
          </h1>
          {s.text && <p className="yx-careers__lead">{s.text}</p>}
          {jobsAnchor && (
            <div>
              <Button variant="primary" asChild>
                <a href={`#${jobsAnchor}`}>See open jobs</a>
              </Button>
            </div>
          )}
        </div>
        {(s.photoSrc || s.photoAlt) && <PhotoSlot src={s.photoSrc} alt={s.photoAlt ?? ''} />}
      </section>
    );
  }

  if (s.type === 'footer') {
    return (
      <footer className="yx-careers__footer" aria-labelledby={headingId} id={anchor}>
        <div>
          <h2 id={headingId} className="yx-careers__footer-title">
            {companyName}
          </h2>
          {s.text && <p className="yx-careers__address">{s.text}</p>}
        </div>
        <PoweredBy whiteLabel={whiteLabel} />
      </footer>
    );
  }

  let body: ReactNode = null;
  switch (s.type) {
    case 'about':
      body = <p className="yx-careers__prose">{s.text}</p>;
      break;
    case 'values':
      body = (
        <ul className="yx-careers__points">
          {s.items.map((v, i) => (
            <li key={i}>
              <h3 className="yx-careers__point-title">{v.title}</h3>
              <p>{v.text}</p>
            </li>
          ))}
        </ul>
      );
      break;
    case 'benefits':
      body = (
        <ul className="yx-careers__benefits">
          {s.items.map((b, i) => (
            <li key={i}>
              <span className="yx-careers__benefit-icon">
                <Icon icon={(BENEFIT_ICONS[b.icon] ?? BENEFIT_ICONS.health).icon} size="md" />
              </span>
              <div>
                <h3 className="yx-careers__point-title">{b.title}</h3>
                <p>{b.text}</p>
              </div>
            </li>
          ))}
        </ul>
      );
      break;
    case 'jobs':
      body = <JobsList jobs={jobs} onApply={onApply} headingId={headingId} />;
      break;
    case 'locations':
      body = (
        <ul className="yx-careers__locations">
          {s.items.map((l, i) => (
            <li key={i}>
              <Icon icon={MapPin} />
              <div>
                <h3 className="yx-careers__point-title">{l.city}</h3>
                <p className="yx-careers__address">{l.address}</p>
              </div>
            </li>
          ))}
        </ul>
      );
      break;
    case 'team':
      body = (
        <ul className="yx-careers__team">
          {s.items.map((p, i) => (
            <li key={i}>
              <figure>
                <PhotoSlot src={p.src} alt={p.alt} />
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            </li>
          ))}
        </ul>
      );
      break;
    case 'faq':
      body = <FaqList items={s.items} />;
      break;
  }

  return (
    <section className="yx-careers__section" data-type={s.type} aria-labelledby={headingId} id={anchor}>
      <h2 id={headingId} className="yx-careers__section-title">
        {s.title}
      </h2>
      <div className="yx-careers__section-body">{body}</div>
    </section>
  );
}

export interface CareersPageProps {
  config: CareersConfig;
  jobs: CareersJob[];
  onApply?: (job: CareersJob) => void;
  className?: string;
  /** Pages of the group's companies (each shows only its own jobs); the current one is marked. */
  companies?: { name: string; href: string; current?: boolean }[];
  /** The company switched the careers assistant on: visitors ask about the listed jobs. */
  assistant?: CareersAssistantProps;
}

export interface CareersAssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CareersAssistantProps {
  /** Returns the answer, or null when none can be given now. */
  onAsk: (question: string, history: CareersAssistantTurn[]) => Promise<string | null>;
}

const ASSISTANT_UNAVAILABLE = "Sorry, I can't answer that right now. Look through the open jobs, or apply and the team will reply.";

/** Careers assistant: a short question box answered from the company's listed jobs only (no chat bubble overlay). */
export function CareersAssistant({ onAsk }: CareersAssistantProps) {
  const [turns, setTurns] = useState<CareersAssistantTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const ask = async () => {
    const q = question.trim();
    if (!q) {
      setError('Type a question first');
      document.getElementById(`${id}-q`)?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    const history = turns.slice(-8);
    setTurns((t) => [...t, { role: 'user', content: q }]);
    setQuestion('');
    const answer = await onAsk(q, history).catch(() => null);
    setTurns((t) => [...t, { role: 'assistant', content: answer?.trim() || ASSISTANT_UNAVAILABLE }]);
    setBusy(false);
  };
  return (
    <div className="yx-careers__assistant">
      {turns.length === 0 ? (
        <p className="yx-careers__prose">Ask about the open jobs, what a job involves or how to apply. The answers come only from the jobs on this page.</p>
      ) : (
        <ul className="yx-careers__assistant-turns" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} data-role={t.role}>
              {t.role === 'user' ? `You: ${t.content}` : t.content}
            </li>
          ))}
        </ul>
      )}
      <Form onSubmit={ask} className="yx-careers__assistant-form" aria-label="Ask about these jobs">
        <FormField label="Your question" id={`${id}-q`} error={error}>
          <TextField value={question} onChange={setQuestion} maxLength={500} />
        </FormField>
        <Button type="submit" loading={busy}>
          Ask
        </Button>
      </Form>
    </div>
  );
}

/**
 * Tenant-branded careers page rendered from a config (§40). Mobile-first; it adapts to its container
 * width (container query), so the builder's mobile preview frame shows the real mobile layout.
 * Hidden sections are skipped. Three layout themes, all inside the design system.
 */
export function CareersPage({ config, jobs, onApply, className, companies, assistant }: CareersPageProps) {
  const pageId = useId().replace(/:/g, '');
  const { accent, reason } = resolveTenantAccent(config.accent);
  const visible = config.sections.filter((s) => !s.hidden);
  const jobsSection = visible.find((s) => s.type === 'jobs');
  const style = accent ? ({ '--yx-tenant-accent': accent } as CSSProperties) : undefined;
  const hasFooter = visible.some((s) => s.type === 'footer');

  return (
    <div
      className={cx('yx-careers', className)}
      data-layout={config.theme}
      data-accent={accent ? 'tenant' : 'default'}
      data-accent-fallback={reason === 'too-light' || undefined}
      style={style}
    >
      <header className="yx-careers__bar">
        <span className="yx-careers__brand">
          {config.logo ?? <span className="yx-careers__brand-name">{config.companyName}</span>}
          <span className="yx-careers__brand-sub">Careers</span>
        </span>
        {companies && companies.length > 0 && (
          <nav className="yx-careers__companies" aria-label="Companies">
            {companies.map((c) => (
              <a key={c.href} className="yx-careers__bar-link" href={c.href} aria-current={c.current ? 'page' : undefined}>
                {c.name}
              </a>
            ))}
          </nav>
        )}
        {jobsSection && (
          <a className="yx-careers__bar-link" href={`#${sectionAnchor(jobsSection, pageId)}`}>
            Open jobs
          </a>
        )}
      </header>
      <main className="yx-careers__main">
        {visible
          .filter((s) => s.type !== 'footer')
          .map((s) => (
            <CareersSectionView
              key={s.id}
              section={s}
              pageId={pageId}
              jobs={jobs}
              onApply={onApply}
              companyName={config.companyName}
              whiteLabel={config.whiteLabel}
              jobsAnchor={jobsSection ? sectionAnchor(jobsSection, pageId) : undefined}
            />
          ))}
        {assistant && (
          <section className="yx-careers__section" data-type="assistant" aria-labelledby={`${pageId}-assistant-h`}>
            <h2 id={`${pageId}-assistant-h`} className="yx-careers__section-title">
              Ask about these jobs
            </h2>
            <div className="yx-careers__section-body">
              <CareersAssistant {...assistant} />
            </div>
          </section>
        )}
      </main>
      {visible
        .filter((s) => s.type === 'footer')
        .map((s) => (
          <CareersSectionView key={s.id} section={s} pageId={pageId} jobs={jobs} companyName={config.companyName} whiteLabel={config.whiteLabel} />
        ))}
      {!hasFooter && !config.whiteLabel && (
        <div className="yx-careers__footer">
          <PoweredBy />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Page builder                                                        */
/* ================================================================== */

export type CareersPageStatus = 'draft' | 'published';

export interface PageBuilderProps {
  value: CareersConfig;
  onChange: (config: CareersConfig) => void;
  jobs: CareersJob[];
  status: CareersPageStatus;
  /** Opens a full-window preview. */
  onPreview?: () => void;
  onPublish?: () => void;
  publishing?: boolean;
  defaultDevice?: 'desktop' | 'mobile';
  /** Section whose settings are open at first. */
  defaultSelectedId?: string;
  /** The live site's own settings, shown under Page: banner photo, assistant, address and taking it offline. */
  site?: PageBuilderSite;
}

export interface PageBuilderSite {
  /** The public address of the careers page. */
  publicUrl: string;
  bannerUrl: string | null;
  onUploadBanner: (file: File) => Promise<unknown>;
  assistantEnabled: boolean;
  onAssistantChange: (on: boolean) => void;
  /** Takes the published page offline (it can be published again). */
  onUnpublish?: () => void;
  unpublishing?: boolean;
}

const THEME_OPTIONS: SelectOption<CareersTheme>[] = [
  { value: 'classic', label: 'Classic', description: 'One column, generous spacing' },
  { value: 'compact', label: 'Compact', description: 'Tighter spacing, jobs first on small screens' },
  { value: 'split', label: 'Split', description: 'Section headings on the left, content on the right' },
];

type Item = Record<string, string>;

/**
 * Careers page builder (§40, §46): section list (add from the fixed library, remove, reorder by drag,
 * buttons or Alt + Up / Down, hide / show), settings for the selected section, desktop / mobile preview,
 * Draft / Published status, Preview and Publish. No free-form HTML, no custom fonts or spacing.
 */
export function PageBuilder({
  value,
  onChange,
  jobs,
  status,
  onPreview,
  onPublish,
  publishing,
  defaultDevice = 'desktop',
  defaultSelectedId,
  site,
}: PageBuilderProps) {
  const [device, setDevice] = useState(defaultDevice);
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId ?? value.sections[0]?.id ?? null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const rowButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const listId = useId();

  const sections = value.sections;
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const label = (s: CareersSectionConfig) => CareersSectionLibrary[s.type].label;
  const setSections = (next: CareersSectionConfig[]) => onChange({ ...value, sections: next });

  const move = (id: string, delta: number) => {
    const next = moveSection(sections, id, delta);
    if (next === sections) return;
    setSections(next);
    const s = next.find((x) => x.id === id)!;
    setAnnouncement(`${label(s)} moved to position ${next.indexOf(s) + 1} of ${next.length}`);
  };

  const toggleHidden = (id: string) => {
    const s = sections.find((x) => x.id === id)!;
    setSections(sections.map((x) => (x.id === id ? { ...x, hidden: !x.hidden } : x)));
    setAnnouncement(`${label(s)} ${s.hidden ? 'shown' : 'hidden'} on the page`);
  };

  const remove = (id: string) => {
    const i = sections.findIndex((x) => x.id === id);
    const s = sections[i];
    const next = sections.filter((x) => x.id !== id);
    setSections(next);
    setConfirmRemove(null);
    if (selectedId === id) setSelectedId(next[Math.max(0, i - 1)]?.id ?? null);
    setAnnouncement(`${label(s)} removed`);
    const focusTo = next[Math.max(0, i - 1)]?.id;
    if (focusTo) requestAnimationFrame(() => rowButtons.current[focusTo]?.focus());
  };

  const add = (type: CareersSectionType) => {
    const def = CareersSectionLibrary[type];
    const s = { ...def.create(), id: newSectionId(type, sections) } as CareersSectionConfig;
    // Footer always goes last; everything else goes before the footer.
    const footerAt = sections.findIndex((x) => x.type === 'footer');
    const next = [...sections];
    if (type === 'footer' || footerAt < 0) next.push(s);
    else next.splice(footerAt, 0, s);
    setSections(next);
    setSelectedId(s.id);
    setAnnouncement(`${def.label} added`);
  };

  const patchSelected = (patch: Record<string, unknown>) => {
    if (!selected) return;
    setSections(sections.map((x) => (x.id === selected.id ? ({ ...x, ...patch } as CareersSectionConfig) : x)));
  };

  const accentCheck = resolveTenantAccent(value.accent);
  const selectedDef = selected ? CareersSectionLibrary[selected.type] : null;
  const items = selected && 'items' in selected ? (selected.items as unknown as Item[]) : null;

  return (
    <div className="yx-page-builder">
      <header className="yx-page-builder__head">
        <div className="yx-page-builder__titles">
          <h1 className="yx-page-builder__title">Careers page</h1>
          <Badge tone={status === 'published' ? 'success' : 'neutral'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
        </div>
        <div className="yx-page-builder__actions">
          <Button icon={Eye} onClick={onPreview}>
            Preview
          </Button>
          <Button
            variant="primary"
            loading={publishing}
            onClick={() => {
              // Never greyed out: pressed with a broken colour, it points at the field instead.
              if (resolveTenantAccent(value.accent).reason === 'invalid') document.getElementById(`${listId}-accent`)?.focus();
              else onPublish?.();
            }}
          >
            Publish
          </Button>
        </div>
      </header>

      <div className="yx-page-builder__body">
        {/* Sections list */}
        <section className="yx-page-builder__panel yx-page-builder__sections" aria-labelledby={`${listId}-h`}>
          <div className="yx-page-builder__panel-head">
            <h2 id={`${listId}-h`} className="yx-page-builder__panel-title">
              Sections
            </h2>
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" icon={Plus}>
                  Add section
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                {SECTION_ORDER.map((t) => {
                  const def = CareersSectionLibrary[t];
                  const taken = def.single && sections.some((s) => s.type === t);
                  return (
                    <MenuItem key={t} disabled={taken} onSelect={() => add(t)}>
                      {def.label}
                      {taken ? ' (already on the page)' : ''}
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </Menu>
          </div>
          <p className="yx-page-builder__hint" id={`${listId}-hint`}>
            Drag to reorder, or press Alt + Up / Down on a section.
          </p>
          <ol className="yx-page-builder__list" aria-describedby={`${listId}-hint`}>
            {sections.map((s, i) => (
              <li
                key={s.id}
                className="yx-page-builder__row"
                data-selected={s.id === selectedId || undefined}
                data-hidden={s.hidden || undefined}
                data-dragging={dragId === s.id || undefined}
                draggable
                onDragStart={(e) => {
                  setDragId(s.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (dragId) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== s.id) move(dragId, i - sections.findIndex((x) => x.id === dragId));
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
              >
                {confirmRemove === s.id ? (
                  <div className="yx-page-builder__confirm" role="group" aria-label={`Remove ${label(s)}`}>
                    <span>Remove {label(s)}?</span>
                    <div className="yx-page-builder__confirm-actions">
                      <Button size="sm" autoFocus onClick={() => setConfirmRemove(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(s.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Icon icon={GripVertical} className="yx-page-builder__grip" />
                    <button
                      ref={(el) => {
                        rowButtons.current[s.id] = el;
                      }}
                      type="button"
                      className="yx-page-builder__row-main"
                      aria-current={s.id === selectedId ? 'true' : undefined}
                      onClick={() => setSelectedId(s.id)}
                      onKeyDown={(e) => {
                        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                          e.preventDefault();
                          move(s.id, e.key === 'ArrowUp' ? -1 : 1);
                          requestAnimationFrame(() => rowButtons.current[s.id]?.focus());
                        }
                      }}
                    >
                      <span className="yx-page-builder__row-name">{label(s)}</span>
                      <span className="yx-page-builder__row-line">
                        {s.hidden && <Badge>Hidden</Badge>}
                        <span className="yx-page-builder__row-sub">{s.title}</span>
                      </span>
                    </button>
                    <span className="yx-page-builder__row-tools">
                      <IconButton icon={ArrowUp} size="sm" label={`Move ${label(s)} up`} disabled={i === 0} onClick={() => move(s.id, -1)} />
                      <IconButton
                        icon={ArrowDown}
                        size="sm"
                        label={`Move ${label(s)} down`}
                        disabled={i === sections.length - 1}
                        onClick={() => move(s.id, 1)}
                      />
                      <IconButton
                        icon={s.hidden ? Eye : EyeOff}
                        size="sm"
                        label={s.hidden ? `Show ${label(s)}` : `Hide ${label(s)}`}
                        onClick={() => toggleHidden(s.id)}
                      />
                      <IconButton icon={Trash2} size="sm" label={`Remove ${label(s)}`} onClick={() => setConfirmRemove(s.id)} />
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
          {sections.length === 0 && <EmptyState compact title="No sections yet." description="Add a section from the library to start." />}
          <p className="yx-visually-hidden" role="status" aria-live="polite">
            {announcement}
          </p>
        </section>

        {/* Preview */}
        <section className="yx-page-builder__preview" aria-label="Preview">
          <div className="yx-page-builder__preview-bar">
            <ButtonGroup aria-label="Preview size">
              <Button size="sm" icon={Monitor} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
                Desktop
              </Button>
              <Button size="sm" icon={Smartphone} aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
                Mobile
              </Button>
            </ButtonGroup>
          </div>
          <div className="yx-page-builder__stage">
            <div className="yx-page-builder__frame" data-device={device}>
              <CareersPage config={value} jobs={jobs} />
            </div>
          </div>
        </section>

        {/* Settings */}
        <section className="yx-page-builder__panel yx-page-builder__settings" aria-label="Settings">
          <FormSection title="Page">
            <FormField label="Layout theme" helper="All three follow the YukthiX design system.">
              <Select value={value.theme} onChange={(t) => t && onChange({ ...value, theme: t })} options={THEME_OPTIONS} />
            </FormField>
            <FormField
              id={`${listId}-accent`}
              label="Accent colour"
              optional
              helper="Used for buttons and links on the careers page only. Needs 4.5:1 contrast with white."
              error={accentCheck.reason === 'invalid' ? 'Enter a 6-digit hex colour like 1F6F4A' : null}
            >
              <TextField
                prefix="#"
                value={(value.accent ?? '').replace(/^#/, '')}
                onChange={(t) => onChange({ ...value, accent: t ? `#${t.replace(/^#/, '')}` : undefined })}
                maxLength={7}
                spellCheck={false}
              />
            </FormField>
            {accentCheck.reason === 'too-light' && (
              <InlineAlert tone="warning" title={`This colour is too light (${accentCheck.ratio}:1 with white)`}>
                Buttons and links will use YukthiX blue until you choose a darker colour.
              </InlineAlert>
            )}
            {site && (
              <>
                <FormField label="Hero photo" optional helper={site.bannerUrl ? 'A photo is set. Upload a new one to replace it.' : 'A real photo of your people, shown next to the hero heading.'}>
                  <FileUpload accept={['.png', '.jpg', '.jpeg', '.webp']} maxSize={5 * 1024 * 1024} multiple={false} upload={(file) => site.onUploadBanner(file).then(() => undefined)} />
                </FormField>
                <Checkbox label="Careers assistant" description="Visitors can ask about your open jobs. Answers come only from the jobs on the page." checked={site.assistantEnabled} onChange={site.onAssistantChange} />
                {status === 'published' && (
                  <div className="yx-page-builder__site">
                    <Button asChild>
                      <a href={site.publicUrl} target="_blank" rel="noopener noreferrer">
                        Open the careers site
                      </a>
                    </Button>
                    {site.onUnpublish && (
                      <Button variant="danger" loading={site.unpublishing} onClick={site.onUnpublish}>
                        Take the page offline
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </FormSection>

          {selected && selectedDef ? (
            <FormSection title={`${selectedDef.label} section`} description={selectedDef.description}>
              {selectedDef.fields.map((f) => {
                const v = String((selected as unknown as Item)[f.key] ?? '');
                return (
                  <FormField key={`${selected.id}-${f.key}`} label={f.label} helper={f.helper}>
                    {f.multiline ? (
                      <TextArea value={v} rows={3} onChange={(t) => patchSelected({ [f.key]: t })} />
                    ) : (
                      <TextField value={v} onChange={(t) => patchSelected({ [f.key]: t })} />
                    )}
                  </FormField>
                );
              })}
              {items && selectedDef.itemFields && (
                <div className="yx-page-builder__items">
                  {items.map((it, idx) => (
                    <fieldset key={idx} className="yx-page-builder__item">
                      <legend className="yx-page-builder__item-legend">
                        {selectedDef.itemLabel} {idx + 1}
                      </legend>
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        className="yx-page-builder__item-remove"
                        label={`Remove ${selectedDef.itemLabel?.toLowerCase()} ${idx + 1}`}
                        onClick={() => patchSelected({ items: items.filter((_, k) => k !== idx) })}
                      />
                      {selectedDef.itemFields!.map((f) => {
                        const set = (t: string | null) => patchSelected({ items: items.map((x, k) => (k === idx ? { ...x, [f.key]: t ?? '' } : x)) });
                        return (
                          <FormField key={f.key} label={f.label}>
                            {f.options ? (
                              <Select value={it[f.key] ?? null} onChange={set} options={f.options} />
                            ) : f.multiline ? (
                              <TextArea value={it[f.key] ?? ''} rows={2} onChange={set} />
                            ) : (
                              <TextField value={it[f.key] ?? ''} onChange={set} />
                            )}
                          </FormField>
                        );
                      })}
                    </fieldset>
                  ))}
                  <div>
                    <Button size="sm" icon={Plus} onClick={() => patchSelected({ items: [...items, selectedDef.newItem!()] })}>
                      Add {selectedDef.itemLabel?.toLowerCase()}
                    </Button>
                  </div>
                </div>
              )}
              {selected.type === 'jobs' && <p className="yx-page-builder__hint">Jobs come from your published requisitions. {jobs.length} are live now.</p>}
            </FormSection>
          ) : (
            <p className="yx-page-builder__hint">Select a section to edit its content.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Apply form                                                          */
/* ================================================================== */

export interface JobApplication {
  name: string;
  email: string;
  /** 10 digits, no +91. */
  phone: string;
  resume: File;
  consent: true;
  /** Purposes of the notices ticked (live: the company's versioned notices). */
  consents?: string[];
  /** Answer to the pay-history question, rupees a year (only where the job asks it). */
  currentPay?: number | null;
  /** Answers to the company's extra questions, by question id. */
  answers?: Record<string, string | number>;
  /** The hidden bot trap; a person leaves it empty. */
  website?: string;
  /** Answer 474: a New York City applicant asked for another process than the automated tool. */
  alternativeProcess?: boolean;
}

/** Answer 474: what a New York City job tells candidates about the company's automated tool (rule set HIR.BIAS_AUDIT). */
export interface ToolNotice {
  /** What each tool in use assesses, in candidate words; empty: the generic sentence. */
  assesses: string[];
  /** Business days of notice before the tool is used (from the rule set). */
  businessDays: number;
}

/**
 * Answer 474 (NYC Local Law 144): an automated tool is used for this job, what it assesses, and how to ask for another
 * process. Shown on the job page; the apply form carries the request.
 */
export function AutomatedToolNotice({ notice, companyName }: { notice: ToolNotice; companyName: string }) {
  return (
    <section className="yx-apply__tool-notice" aria-label="Automated tool notice">
      <h3>{companyName} uses an automated tool for this job</h3>
      <p>
        New York City law asks us to tell you at least {notice.businessDays} business days before we use it. We will not use it on your application before then.
      </p>
      {notice.assesses.length ? (
        <>
          <p>What it assesses:</p>
          <ul>
            {notice.assesses.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>It helps us assess how your skills and experience match this job.</p>
      )}
      <p>You can ask for another process: tick &quot;Assess me another way&quot; when you apply. A recruiter sees your request and the tool is not used for you.</p>
    </section>
  );
}

/** A company's own question on the apply form (live: candidate custom fields shown on apply). */
export interface ApplyQuestion {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[] | null;
  required: boolean;
}

/** A privacy notice the applicant ticks (live: the company's versioned notices). */
export interface ApplyNotice {
  purpose: string;
  text: string;
  required: boolean;
}

export interface JobApplyFormProps {
  job: CareersJob;
  companyName: string;
  /** Uploads the resume (see FileUpload). */
  upload: FileUploadProps['upload'];
  onSubmit: (application: JobApplication) => void | Promise<void>;
  privacyHref?: string;
  /** Show the sent confirmation (docs and tests). */
  defaultSent?: boolean;
  /** Resume file types (default PDF and Word). */
  resumeAccept?: string[];
  /** The company's notices, one tick each (default: one consent line naming the company). */
  notices?: ApplyNotice[];
  /** HIR-24 answer 224: ask for current or last pay (only where the job asks and the law allows). */
  askPay?: boolean;
  /** Careers answer 359: the job is outside India, so the number takes any country code. */
  internationalPhone?: boolean;
  /** Answer 474: a New York City job's automated tool notice: the form offers "Assess me another way". */
  toolNotice?: ToolNotice | null;
  questions?: ApplyQuestion[];
  /** Reads contact details from a picked resume; fills only empty fields. */
  onResumePicked?: (file: File) => Promise<Partial<Record<'name' | 'email' | 'phone', string>>>;
  /** Adds the hidden bot trap field. */
  honeypot?: boolean;
}

type ApplyErrors = Partial<Record<string, string>>;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Short, mobile-first apply form: five inputs, done in under 3 minutes (§40). */
export function JobApplyForm({
  job,
  companyName,
  upload,
  onSubmit,
  privacyHref = '#privacy',
  defaultSent = false,
  resumeAccept = ['.pdf', '.doc', '.docx'],
  notices,
  askPay = false,
  internationalPhone = false,
  toolNotice = null,
  questions = [],
  onResumePicked,
  honeypot = false,
}: JobApplyFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const phoneKind = internationalPhone ? 'intlPhone' : 'phone';
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [consent, setConsent] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [pay, setPay] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [website, setWebsite] = useState('');
  const [another, setAnother] = useState(false);
  const [errors, setErrors] = useState<ApplyErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(defaultSent);
  const [sendError, setSendError] = useState<string | null>(null);
  const picked = useRef<File | null>(null);
  const ids = useId();
  const fid = (k: string) => `${ids}-${k}`;

  const onFiles = (items: UploadItem[]) => {
    setFiles(items);
    const f = items.find((i) => i.status === 'done')?.file ?? null;
    if (f && f !== picked.current && onResumePicked) {
      picked.current = f;
      void onResumePicked(f)
        .then((d) => {
          if (d.name) setName((c) => (c.trim() ? c : d.name!));
          if (d.email) setEmail((c) => (c.trim() ? c : d.email!));
          if (d.phone) setPhone((c) => (c.trim() ? c : ID_SPECS[phoneKind].normalise(d.phone!)));
        })
        .catch(() => undefined);
    }
  };

  const validate = (): ApplyErrors => {
    const e: ApplyErrors = {};
    if (!name.trim()) e.name = 'Enter your full name';
    if (!isEmail(email)) e.email = 'Enter an email like name@example.com';
    const phoneError = phone ? ID_SPECS[phoneKind].validate(phone) : 'Enter your mobile number';
    if (phoneError) e.phone = phoneError;
    const done = files.find((f) => f.status === 'done');
    if (!done) e.resume = files.some((f) => f.status === 'uploading' || f.status === 'scanning') ? 'Wait for your resume to finish uploading' : 'Attach your resume';
    for (const q of questions) if (q.required && (answers[q.id] === undefined || answers[q.id] === '')) e[`q-${q.id}`] = `Answer "${q.label}"`;
    if (notices) {
      const missing = notices.find((n) => n.required && !ticked[n.purpose]);
      if (missing) e[`consent-${missing.purpose}`] = 'Tick the box so we can process your application';
    } else if (!consent) e.consent = 'Tick the box so we can process your application';
    return e;
  };

  const order = ['name', 'email', 'phone', 'resume', ...questions.map((q) => `q-${q.id}`), 'consent', ...(notices ?? []).map((n) => `consent-${n.purpose}`)];

  const submit = async () => {
    const e = validate();
    setErrors(e);
    const first = order.find((k) => e[k]);
    if (first) {
      document.getElementById(fid(first))?.focus();
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        phone,
        resume: files.find((f) => f.status === 'done')!.file,
        consent: true,
        consents: notices ? notices.filter((n) => ticked[n.purpose]).map((n) => n.purpose) : undefined,
        currentPay: askPay ? pay : undefined,
        answers: questions.length ? answers : undefined,
        website: honeypot && website ? website : undefined,
        alternativeProcess: toolNotice && another ? true : undefined,
      });
      setSent(true);
    } catch (err) {
      // The live page throws an Error whose message is written for the applicant (a bad file, a changed notice).
      setSendError(err instanceof Error && err.message ? err.message : "We couldn't send your application. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="yx-apply" data-sent>
        <div className="yx-apply__sent" role="status">
          <Icon icon={CheckCircle2} size="md" />
          <h2 className="yx-apply__title">Application sent</h2>
          <p>
            Thank you for applying for {job.title}. {companyName} will email you about next steps{email ? ` at ${email}` : ''}.
          </p>
        </div>
      </div>
    );
  }

  const setAnswer = (id: string, v: string | number | null) => setAnswers((a) => ({ ...a, [id]: v ?? '' }));

  return (
    <div className="yx-apply">
      <div className="yx-apply__head">
        <h2 className="yx-apply__title">Apply for {job.title}</h2>
        <p className="yx-apply__sub">
          {companyName} · {job.location} · Takes about 3 minutes
        </p>
      </div>
      <Form onSubmit={submit} className="yx-apply__form" aria-label={`Apply for ${job.title}`}>
        {sendError && <InlineAlert tone="danger">{sendError}</InlineAlert>}
        <FormField label="Full name" required error={errors.name} id={fid('name')}>
          <TextField value={name} onChange={setName} autoComplete="name" />
        </FormField>
        <FormField label="Email" required error={errors.email} id={fid('email')}>
          <TextField type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
        </FormField>
        <FormField label="Mobile number" required error={errors.phone} helper={internationalPhone ? 'Start with + and your country code' : undefined} id={fid('phone')}>
          <MaskedField kind={phoneKind} value={phone} onChange={setPhone} />
        </FormField>
        <FormField label="Resume" required error={errors.resume} helper={resumeAccept.every((a) => a === '.pdf') ? 'PDF file, up to 5 MB' : 'PDF or Word file'} id={fid('resume')}>
          <FileUpload upload={upload} accept={resumeAccept} maxSize={5 * 1024 * 1024} multiple={false} onItemsChange={onFiles} />
        </FormField>
        {questions.map((q) => (
          <FormField key={q.id} label={q.label} required={q.required} optional={!q.required} error={errors[`q-${q.id}`]} id={fid(`q-${q.id}`)}>
            {q.type === 'select' ? (
              <Select value={(answers[q.id] as string) || null} onChange={(v) => setAnswer(q.id, v)} options={(q.options ?? []).map((o) => ({ value: o, label: o }))} />
            ) : q.type === 'number' ? (
              <NumberField value={typeof answers[q.id] === 'number' ? (answers[q.id] as number) : null} onChange={(v) => setAnswer(q.id, v)} />
            ) : q.type === 'date' ? (
              <DatePicker value={answers[q.id] ? new Date(`${answers[q.id]}T00:00:00`) : null} onChange={(d) => setAnswer(q.id, d ? isoDay(d) : '')} />
            ) : (
              <TextField value={(answers[q.id] as string) ?? ''} onChange={(v) => setAnswer(q.id, v)} maxLength={500} />
            )}
          </FormField>
        ))}
        {askPay && (
          <FormField label="Your current or last pay (₹ a year)" optional helper="You can leave this empty." id={fid('pay')}>
            <NumberField value={pay} onChange={setPay} min={0} max={1_000_000_000} />
          </FormField>
        )}
        {toolNotice && (
          <div className="yx-apply__consent">
            <p className="yx-apply__notice">An automated tool is used for this job (New York City notice above). It is not used on your application for {toolNotice.businessDays} business days.</p>
            <Checkbox id={fid('another')} checked={another} onChange={setAnother} label="Assess me another way (no automated tool)" />
          </div>
        )}
        {notices ? (
          notices.map((n) => (
            <div key={n.purpose} className="yx-apply__consent" data-invalid={errors[`consent-${n.purpose}`] ? true : undefined}>
              <p className="yx-apply__notice">{n.text}</p>
              <Checkbox
                id={fid(`consent-${n.purpose}`)}
                checked={Boolean(ticked[n.purpose])}
                onChange={(v) => setTicked((t) => ({ ...t, [n.purpose]: v }))}
                required={n.required}
                label={n.required ? 'I have read this and agree.' : 'Yes, keep my details for other suitable jobs (optional).'}
                description={errors[`consent-${n.purpose}`] ? <span className="yx-apply__consent-error">{errors[`consent-${n.purpose}`]}.</span> : undefined}
              />
            </div>
          ))
        ) : (
          <div className="yx-apply__consent" data-invalid={errors.consent ? true : undefined}>
            <Checkbox
              id={fid('consent')}
              checked={consent}
              onChange={setConsent}
              required
              label={`I agree that ${companyName} can store and use my details to consider me for this job.`}
              description={
                <>
                  {errors.consent && <span className="yx-apply__consent-error">{errors.consent}. </span>}
                  Read the <a className="yx-link" href={privacyHref}>privacy notice</a>.
                </>
              }
            />
          </div>
        )}
        {honeypot && (
          // Hidden from people and screen readers; a bot that fills it is answered as if it applied, and nothing is stored.
          <div className="yx-visually-hidden" aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
        )}
        <Button type="submit" variant="primary" loading={sending} fullWidth className="yx-apply__submit">
          Send application
        </Button>
      </Form>
    </div>
  );
}
