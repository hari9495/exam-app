import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { API_BASE } from '../../../../../lib/api-client';
import { ldJson, originOf } from '../../../../../lib/request-origin';
import type { CareersJobDetail } from '../../../../../lib/types';
import { jobPosting } from './job-posting';

// M10 AT3: one job on the careers site at a readable URL, with its Google for Jobs JobPosting data. Public and
// unauthenticated; the job text is shown as text (never as HTML), and a closed or unlisted job is simply not found.
type Props = { params: Promise<{ orgSlug: string; slug: string }> };

async function fetchJob(orgSlug: string, slug: string): Promise<CareersJobDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/public/careers/${encodeURIComponent(orgSlug)}/jobs/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as CareersJobDetail) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, slug } = await params;
  const job = await fetchJob(orgSlug, slug);
  if (!job) return { title: 'Job not found', robots: { index: false } };
  return { title: `${job.title} — ${job.company?.name ?? job.orgName}`, description: (job.description ?? '').slice(0, 160) || undefined };
}

export default async function CareersJobPage({ params }: Props) {
  const { orgSlug, slug } = await params;
  const job = await fetchJob(orgSlug, slug);
  if (!job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-candidate-text-secondary">This job is no longer open.</p>
        <Link href={`/careers/${orgSlug}`} className="text-sm font-medium text-candidate-primary underline">See open roles</Link>
      </div>
    );
  }
  const url = `${originOf(await headers())}/careers/${orgSlug}/jobs/${job.slug}`;
  const salary = job.salaryCurrency && job.salaryMin != null ? `${job.salaryCurrency} ${job.salaryMin.toLocaleString('en-IN')}${job.salaryMax != null ? ` – ${job.salaryMax.toLocaleString('en-IN')}` : ''}` : null;
  const meta = [job.company?.name, job.department, job.location, job.employmentType?.replace(/_/g, ' ').toLowerCase(), salary].filter(Boolean);
  return (
    <div className="min-h-screen bg-candidate-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jobPosting(job, url)) }} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <Link href={`/careers/${orgSlug}`} className="text-sm font-medium text-candidate-primary underline">← All open roles at {job.orgName}</Link>
        <div className="rounded-lg border border-candidate-border bg-white p-6">
          <h1 className="font-display text-2xl font-bold text-candidate-text">{job.title}</h1>
          {meta.length > 0 && <p className="mt-1 text-xs font-medium uppercase tracking-wide text-candidate-text-secondary">{meta.join(' · ')}</p>}
          {job.description ? <p className="mt-5 whitespace-pre-line text-sm text-candidate-text">{job.description}</p> : null}
          <Link
            href={`/apply/${job.applyToken}`}
            className="mt-6 inline-block rounded-sm bg-candidate-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Apply for this job
          </Link>
        </div>
      </div>
    </div>
  );
}
