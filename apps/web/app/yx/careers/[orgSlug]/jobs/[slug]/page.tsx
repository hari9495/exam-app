import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { publicGet, visitorIp } from '../../../../../../lib/yx-careers';
import { ldJson, originOf } from '../../../../../../lib/request-origin';
import type { CareersJobDetail, PublicJob } from '../../../../../../lib/types';
import { jobPosting } from './job-posting';
import { JobPage } from '../../../../apply/[applyToken]/job-page';

// T9-09 job page at a readable address (founder decision 8), with its Google for Jobs JobPosting data in the server
// HTML. A closed, on-hold or unlisted job is not found here, and the page says it is not accepting applications.
type Props = { params: Promise<{ orgSlug: string; slug: string }> };
const fetchJob = async (orgSlug: string, slug: string) => publicGet<CareersJobDetail>(`/careers/${encodeURIComponent(orgSlug)}/jobs/${encodeURIComponent(slug)}`, visitorIp(await headers()));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, slug } = await params;
  const job = await fetchJob(orgSlug, slug);
  if (!job) return { title: 'Job not found', robots: { index: false } };
  return { title: { absolute: `${job.title} at ${job.company?.name ?? job.orgName}` }, description: (job.description ?? '').slice(0, 160) || undefined };
}

export default async function YxCareersJobPage({ params }: Props) {
  const { orgSlug, slug } = await params;
  const job = await fetchJob(orgSlug, slug);
  const form = job ? await publicGet<PublicJob>(`/jobs/${encodeURIComponent(job.applyToken)}`, visitorIp(await headers())) : null;
  const url = `${originOf(await headers())}/yx/careers/${orgSlug}/jobs/${slug}`;
  return (
    <>
      {job && form ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jobPosting(job, url)) }} /> : null}
      <JobPage applyToken={job?.applyToken ?? null} job={form} address={url} allJobsHref={`/yx/careers/${encodeURIComponent(orgSlug)}`} />
    </>
  );
}
