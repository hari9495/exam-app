import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { publicGet } from '../../../../lib/yx-careers';
import { ldJson, originOf } from '../../../../lib/request-origin';
import type { PublicJob } from '../../../../lib/types';
import { JobPage } from './job-page';

// A job's apply link (job boards and unlisted jobs): the T9-09 job page with its apply form. Rendered on the server so
// the JobPosting JSON-LD is in the HTML Google for Jobs reads. A closed or on-hold job says it is not accepting
// applications (answer 242); the API gives the same answer for an unknown link, so nothing can be probed.
type Props = { params: Promise<{ applyToken: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await publicGet<PublicJob>(`/jobs/${encodeURIComponent((await params).applyToken)}`);
  return job ? { title: { absolute: `${job.jobTitle} at ${job.orgName}` } } : { title: 'Not accepting applications', robots: { index: false } };
}

function jobPostingLd(job: PublicJob, url: string) {
  return {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.jobTitle,
    description: job.jobDescription || job.jobTitle,
    datePosted: job.postedAt,
    hiringOrganization: { '@type': 'Organization', name: job.orgName },
    url,
    directApply: true,
    ...(job.employmentType ? { employmentType: job.employmentType } : {}),
    // Google needs a place or an explicit remote flag.
    ...(job.location ? { jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } } } : { jobLocationType: 'TELECOMMUTE' }),
  };
}

export default async function YxApplyPage({ params }: Props) {
  const { applyToken } = await params;
  const job = await publicGet<PublicJob>(`/jobs/${encodeURIComponent(applyToken)}`);
  const url = `${originOf(await headers())}/yx/apply/${applyToken}`;
  return (
    <>
      {job ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jobPostingLd(job, url)) }} /> : null}
      <JobPage applyToken={job ? applyToken : null} job={job} address={url} allJobsHref={null} />
    </>
  );
}
