import type { HiringJobRow as Job } from '@yukthix/ui/frame';
import { TYPE } from './yx-jobs';

/** GET /internal-applications/jobs. */
export type ApiInternalJob = { id: string; title: string; location: string | null; department: string | null; employmentType: string | null; postedAt: string };

/** An internal opening as the designed HIR-13 card reads it (only the shown fields carry data). */
export function internalJob(j: ApiInternalJob): Job {
  return {
    id: j.id,
    code: '',
    title: j.title,
    department: j.department ?? '',
    location: j.location ?? '',
    type: j.employmentType ? (TYPE[j.employmentType] ?? j.employmentType) : '',
    recruiter: '',
    hiringManager: '',
    status: 'Open',
    applicants: 0,
    inPipeline: 0,
    posted: new Date(j.postedAt),
    slug: '',
    internal: true,
  };
}
