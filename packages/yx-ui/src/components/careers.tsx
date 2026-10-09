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
import { ID_SPECS } from '../lib/validators';
import { Icon, type IconComponent } from './foundations';
import { Button, ButtonGroup, IconButton } from './button';
import { Badge } from './display';
import { EmptyState, InlineAlert } from './feedback';
import { Form, FormField, FormSection } from './field';
import { MaskedField, TextArea, TextField } from './inputs';
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
}

/**
 * Tenant-branded careers page rendered from a config (§40). Mobile-first; it adapts to its container
 * width (container query), so the builder's mobile preview frame shows the real mobile layout.
 * Hidden sections are skipped. Three layout themes, all inside the design system.
 */
export function CareersPage({ config, jobs, onApply, className }: CareersPageProps) {
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
          <Button variant="primary" onClick={onPublish} loading={publishing}>
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
}

type ApplyErrors = Partial<Record<'name' | 'email' | 'phone' | 'resume' | 'consent', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Short, mobile-first apply form: five inputs, done in under 3 minutes (§40). */
export function JobApplyForm({ job, companyName, upload, onSubmit, privacyHref = '#privacy', defaultSent = false }: JobApplyFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<ApplyErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(defaultSent);
  const [sendError, setSendError] = useState<string | null>(null);
  const ids = useId();
  const fid = (k: string) => `${ids}-${k}`;

  const validate = (): ApplyErrors => {
    const e: ApplyErrors = {};
    if (!name.trim()) e.name = 'Enter your full name';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter an email like name@example.com';
    const phoneError = phone ? ID_SPECS.phone.validate(phone) : 'Enter your mobile number';
    if (phoneError) e.phone = phoneError;
    const done = files.find((f) => f.status === 'done');
    if (!done) e.resume = files.some((f) => f.status === 'uploading' || f.status === 'scanning') ? 'Wait for your resume to finish uploading' : 'Attach your resume';
    if (!consent) e.consent = 'Tick the box so we can process your application';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    const first = (['name', 'email', 'phone', 'resume', 'consent'] as const).find((k) => e[k]);
    if (first) {
      document.getElementById(fid(first))?.focus();
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), phone, resume: files.find((f) => f.status === 'done')!.file, consent: true });
      setSent(true);
    } catch {
      setSendError("We couldn't send your application. Check your connection and try again.");
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
        <FormField label="Mobile number" required error={errors.phone} id={fid('phone')}>
          <MaskedField kind="phone" value={phone} onChange={setPhone} />
        </FormField>
        <FormField label="Resume" required error={errors.resume} helper="PDF or Word file" id={fid('resume')}>
          <FileUpload upload={upload} accept={['.pdf', '.doc', '.docx']} maxSize={5 * 1024 * 1024} multiple={false} onItemsChange={setFiles} />
        </FormField>
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
        <Button type="submit" variant="primary" loading={sending} fullWidth className="yx-apply__submit">
          Send application
        </Button>
      </Form>
    </div>
  );
}
