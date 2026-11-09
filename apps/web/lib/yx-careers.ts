import type { CareersConfig, CareersJob as KitJob, CareersSectionConfig, JobApplication } from '@yukthix/ui';
import type { LiveCareersJob } from '@yukthix/ui/hiring';
import { API_BASE } from './api-client';
import type { CareersJob, CareersLayout, PublicJob } from './types';

// T9-09 careers site and the candidate pages outside the app (founder decisions 8 and 10): the public, unauthenticated
// API calls (no auth header, never cached) and the mapping from the API's answers to the designed screens' props.

/** GET /public/<path>; null on any failure or a 404 (the page shows its own "not found"). */
export async function publicGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/public${path}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** POST /public/<path>; throws an Error whose message is written for the candidate (400 / 409 / 429 carry one). */
export async function publicPost<T = unknown>(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/public${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('We could not reach the server. Check your connection and try again.');
  }
  if (res.ok) return (await res.json().catch(() => ({}))) as T;
  if (res.status === 429) throw new Error('Too many tries in a short time. Wait a minute and try again.');
  const data = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const msg = Array.isArray(data?.message) ? null : typeof data?.message === 'string' ? data.message : null;
  throw new Error(res.status === 400 || res.status === 404 || res.status === 409 ? (msg ?? 'That did not work. Check your details and try again.') : 'Something went wrong on our side. Try again in a minute.');
}

/** The API wants raw base64 (no "data:...;base64," prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const TYPE: Record<string, string> = { FULL_TIME: 'Full time', PART_TIME: 'Part time', CONTRACT: 'Contract', INTERN: 'Internship', INTERNSHIP: 'Internship', TEMPORARY: 'Temporary' };
export const jobType = (t: string | null | undefined) => (t ? (TYPE[t.toUpperCase()] ?? t.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())) : 'Full time');

/** A listed job as the kit's job row (id = its readable slug, or its apply link for an older job). */
export const kitJob = (j: CareersJob): KitJob => ({
  id: j.slug ?? j.applyToken,
  title: j.title,
  department: j.department ?? j.company?.name ?? 'General',
  location: j.location ?? 'Remote',
  type: jobType(j.employmentType),
  postedOn: new Date(j.postedAt ?? Date.now()),
});

/** The saved builder layout as the kit's page config; the banner is the hero's photo. */
export function kitConfig(companyName: string, layout: CareersLayout | undefined, bannerUrl: string | null, headline?: string | null, intro?: string | null): CareersConfig {
  const fallback: CareersLayout = { theme: 'classic', accent: null, sections: [{ id: 'hero', type: 'hero', title: headline ?? `Work at ${companyName}`, text: intro ?? '' }, { id: 'jobs', type: 'jobs', title: 'Open jobs' }, { id: 'footer', type: 'footer', title: 'Contact', text: '' }] };
  const l = layout ?? fallback;
  return {
    companyName,
    theme: l.theme,
    accent: l.accent ?? undefined,
    sections: l.sections.map((s) => ({ ...s, ...(s.type === 'hero' && bannerUrl ? { photoSrc: bannerUrl, photoAlt: s.photoAlt || `${companyName} team` } : {}) }) as unknown as CareersSectionConfig),
  };
}

/** The kit config back to what the API stores: the banner photo is the company's own setting, not part of the layout. */
export function layoutOf(config: CareersConfig): CareersLayout {
  return {
    theme: config.theme,
    accent: config.accent ? `#${config.accent.replace(/^#/, '').toUpperCase()}` : null,
    sections: config.sections.map((s) => {
      const { photoSrc: _photo, ...rest } = s as CareersSectionConfig & { photoSrc?: string };
      void _photo;
      return rest as CareersLayout['sections'][number];
    }),
  };
}

/** The apply form's live wiring for one job (by its apply link). */
export function liveApply(applyToken: string, job: PublicJob): LiveCareersJob['apply'] {
  const notices = job.consents ?? [];
  return {
    upload: async () => undefined, // the resume goes with the application itself (one request)
    resumeAccept: ['.pdf'],
    honeypot: true,
    askPay: Boolean(job.askPayHistory),
    notices: notices.map((n) => ({ purpose: n.purpose, text: n.text, required: n.required })),
    questions: job.customFields.map((f) => ({ id: f.definitionId, label: f.label, type: f.fieldType, options: f.options, required: f.required })),
    onResumePicked: async (file: File) => {
      if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) return {};
      return publicPost<{ name?: string; email?: string; phone?: string }>(`/jobs/${encodeURIComponent(applyToken)}/parse-resume`, { resumeBase64: await fileToBase64(file) }).catch(() => ({}));
    },
    onSubmit: async (a: JobApplication) => {
      if (a.resume.type !== 'application/pdf') throw new Error('Attach your resume as a PDF file.');
      await publicPost(`/jobs/${encodeURIComponent(applyToken)}/apply`, {
        name: a.name,
        email: a.email,
        phone: a.phone || undefined,
        resumeBase64: await fileToBase64(a.resume),
        customFields: a.answers ?? {},
        consents: notices.filter((n) => a.consents?.includes(n.purpose)).map((n) => ({ purpose: n.purpose, version: n.version })),
        ...(a.currentPay != null ? { currentPay: a.currentPay } : {}),
        ...(a.website ? { website: a.website } : {}),
      });
    },
  };
}

/** The job page facts from the public job (pay only when the job shows it). */
export function jobDetail(job: PublicJob, slug: string, fallbackId: string) {
  return {
    job: { id: fallbackId, title: job.jobTitle, department: job.department ?? '', location: job.location ?? 'Remote', type: jobType(job.employmentType), postedOn: new Date(job.postedAt ?? Date.now()) },
    slug,
    pay: job.salary ? { min: job.salary.min, max: job.salary.max, period: `a ${job.salary.period}`, currency: job.salary.currency } : null,
    about: job.jobDescription ?? '',
  };
}
