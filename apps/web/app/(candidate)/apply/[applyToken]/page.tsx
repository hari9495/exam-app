import ApplyForm from './apply-form';
import { API_BASE } from '../../../../lib/api-client';
import { PublicJob } from '../../../../lib/types';

// This route is a SERVER component so the JobPosting JSON-LD below is in the server-rendered HTML —
// Google for Jobs indexes the role from it. The interactive apply form (client) re-fetches the same
// job for display. Dynamic per request (no-store); degrades to just the form if the API is unreachable.
async function fetchJob(applyToken: string): Promise<PublicJob | null> {
  try {
    const res = await fetch(`${API_BASE}/public/jobs/${applyToken}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PublicJob;
  } catch {
    return null;
  }
}

function jobPostingLd(job: PublicJob): string {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.jobTitle,
    description: job.jobDescription || job.jobTitle,
    datePosted: job.postedAt,
    hiringOrganization: { '@type': 'Organization', name: job.orgName },
    directApply: true,
  };
  // Google requires jobLocation OR an explicit remote flag.
  if (job.location) {
    ld.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } };
  } else {
    ld.jobLocationType = 'TELECOMMUTE';
  }
  if (job.employmentType) ld.employmentType = job.employmentType;
  // Escape '<' so a description containing "</script>" can't break out of the JSON-LD <script> block.
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

export default async function ApplyPage({ params }: { params: Promise<{ applyToken: string }> }) {
  const { applyToken } = await params;
  const job = await fetchJob(applyToken);
  return (
    <>
      {job ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jobPostingLd(job) }} /> : null}
      <ApplyForm />
    </>
  );
}
