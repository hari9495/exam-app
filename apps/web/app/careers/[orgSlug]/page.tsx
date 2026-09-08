import type { Metadata } from 'next';
import { API_BASE } from '../../../lib/api-client';
import { CareersJob, CareersPageResponse } from '../../../lib/types';
import { CareersJobList } from './CareersJobList';

// Public, unauthenticated -- same idiom as the apply/walk-in pages: raw fetch (no auth header),
// no-store so branding/job-list edits show up immediately, null (not throw) on any failure so the
// page renders its own not-found state instead of Next's generic error page.
async function fetchCareers(orgSlug: string): Promise<CareersPageResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/public/careers/${orgSlug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as CareersPageResponse;
  } catch {
    return null;
  }
}

function jobPostingLd(orgName: string, job: CareersJob): string {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    hiringOrganization: { '@type': 'Organization', name: orgName },
    // ponytail: relative URL -- there is no canonical site-origin env var in this app yet;
    // add one and make this absolute if Google Jobs indexing needs it.
    url: `/apply/${job.applyToken}`,
    directApply: true,
  };
  if (job.location) {
    ld.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } };
  } else {
    ld.jobLocationType = 'TELECOMMUTE';
  }
  if (job.employmentType) ld.employmentType = job.employmentType;
  if (job.salaryMin != null || job.salaryMax != null) {
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.salaryCurrency ?? 'USD',
      value: { '@type': 'QuantitativeValue', minValue: job.salaryMin ?? undefined, maxValue: job.salaryMax ?? undefined, unitText: 'YEAR' },
    };
  }
  // Escape '<' so a title/location containing "</script>" can't break out of the JSON-LD <script> block.
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params;
  const data = await fetchCareers(orgSlug);
  if (!data) return { title: 'Careers' };
  return {
    title: `Careers — ${data.orgName}`,
    description: data.headline ?? `Open roles at ${data.orgName}`,
  };
}

export default async function CareersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const data = await fetchCareers(orgSlug);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-candidate-text-secondary">This careers page isn&apos;t available.</p>
      </div>
    );
  }

  const themeStyle = {
    ...(data.primaryColor ? { '--careers-primary': data.primaryColor } : {}),
    ...(data.accentColor ? { '--careers-accent': data.accentColor } : {}),
    ...(data.textColor ? { '--careers-text': data.textColor } : {}),
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-candidate-bg" style={themeStyle}>
      {data.jobs.map((job) => (
        <script
          key={job.applyToken}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jobPostingLd(data.orgName, job) }}
        />
      ))}

      <div
        className="flex flex-col items-center gap-3 border-b border-candidate-border bg-cover bg-center px-6 py-14 text-center"
        style={{
          backgroundImage: data.bannerUrl ? `url(${data.bannerUrl})` : undefined,
          backgroundColor: data.primaryColor ? 'var(--careers-primary)' : undefined,
          color: data.textColor ? 'var(--careers-text)' : undefined,
        }}
      >
        {data.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.logoUrl} alt={`${data.orgName} logo`} className="h-14 w-14 rounded object-contain" />
        ) : null}
        <h1 className="font-display text-2xl font-bold">{data.headline || `${data.orgName} — Open roles`}</h1>
        {data.intro
          ? data.intro.split('\n').filter((line) => line.trim()).map((line, i) => (
              <p key={i} className="max-w-2xl text-sm opacity-90">{line}</p>
            ))
          : null}
      </div>
      {data.accentColor ? <div style={{ height: 4, backgroundColor: 'var(--careers-accent)' }} /> : null}

      <div className="mx-auto max-w-3xl px-6 py-10">
        <CareersJobList jobs={data.jobs} />
      </div>
    </div>
  );
}
