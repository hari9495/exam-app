import type { CareersJobDetail } from '../../../../../lib/types';

/** Google for Jobs JobPosting data for one careers job (M10 AT3, S9). */
export function jobPosting(job: CareersJobDetail, url: string) {
  const company = job.company?.name ?? job.orgName;
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description || job.title,
    datePosted: job.postedAt,
    hiringOrganization: { '@type': 'Organization', name: company, ...(job.logoUrl ? { logo: job.logoUrl } : {}) },
    url,
    directApply: true,
    ...(job.employmentType ? { employmentType: job.employmentType } : {}),
    ...(job.location
      ? { jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } } }
      : { jobLocationType: 'TELECOMMUTE' }),
  };
  // The API sends a salary only when the job chose to show it.
  if (job.salaryCurrency && (job.salaryMin != null || job.salaryMax != null)) {
    ld.baseSalary = { '@type': 'MonetaryAmount', currency: job.salaryCurrency, value: { '@type': 'QuantitativeValue', minValue: job.salaryMin ?? undefined, maxValue: job.salaryMax ?? undefined, unitText: 'YEAR' } };
  }
  return ld;
}
