import type { Metadata } from 'next';
import Link from 'next/link';
import { API_BASE } from '../../../lib/api-client';
import { CareersPageResponse } from '../../../lib/types';
import { CareersJobList } from './CareersJobList';
import { CareersAssistant } from './CareersAssistant';

// Public, unauthenticated -- same idiom as the apply/walk-in pages: raw fetch (no auth header),
// no-store so branding/job-list edits show up immediately, null (not throw) on any failure so the
// page renders its own not-found state instead of Next's generic error page.
async function fetchCareers(orgSlug: string, company?: string): Promise<CareersPageResponse | null> {
  try {
    const q = company ? `?company=${encodeURIComponent(company)}` : '';
    const res = await fetch(`${API_BASE}/public/careers/${encodeURIComponent(orgSlug)}${q}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as CareersPageResponse;
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ company?: string | string[] }> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

// M10 AT3: Google for Jobs data lives on each job's own page (/careers/:org/jobs/:slug), listed in the sitemap.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const data = await fetchCareers(orgSlug, one((await searchParams).company));
  if (!data) return { title: 'Careers' };
  return {
    title: `Careers — ${data.companyName ?? data.orgName}`,
    description: data.headline ?? `Open roles at ${data.orgName}`,
  };
}

export default async function CareersPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const company = one((await searchParams).company);
  const data = await fetchCareers(orgSlug, company);

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
          <img src={data.logoUrl} alt={`${data.orgName} logo`} className="h-14 w-14 rounded-sm object-contain" />
        ) : null}
        <h1 className="font-display text-2xl font-bold">{data.headline || `${data.companyName ?? data.orgName} — Open roles`}</h1>
        {data.intro
          ? data.intro.split('\n').filter((line) => line.trim()).map((line, i) => (
              <p key={i} className="max-w-2xl text-sm opacity-90">{line}</p>
            ))
          : null}
      </div>
      {data.accentColor ? <div style={{ height: 4, backgroundColor: 'var(--careers-accent)' }} /> : null}

      <div className="mx-auto max-w-3xl px-6 py-10">
        {data.companies && data.companies.length > 0 ? (
          <nav aria-label="Companies" className="mb-6 flex flex-wrap gap-2">
            {[{ slug: '', name: `All of ${data.orgName}` }, ...data.companies].map((c) => {
              const current = (company ?? '') === c.slug;
              return (
                <Link
                  key={c.slug || 'all'}
                  href={c.slug ? `/careers/${orgSlug}?company=${c.slug}` : `/careers/${orgSlug}`}
                  aria-current={current ? 'page' : undefined}
                  className={`rounded-sm border px-3 py-1.5 text-sm transition-colors hover:border-candidate-primary ${current ? 'border-candidate-primary bg-candidate-primary text-white' : 'border-candidate-border bg-white text-candidate-text'}`}
                >
                  {c.name}
                </Link>
              );
            })}
          </nav>
        ) : null}
        <CareersJobList jobs={data.jobs} orgSlug={orgSlug} />
      </div>
      {data.assistantEnabled ? <CareersAssistant orgSlug={orgSlug} orgName={data.orgName} /> : null}
    </div>
  );
}
