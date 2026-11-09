import type { HiringJobRow, LiveJobRow } from '@yukthix/ui/frame';
import type { ApprovalSummary, JobStatus, StageCounts } from './types';

// HIR-03: the designed jobs list and workspace read GET /jobs and GET /jobs/:id. The API row as both return it, and the
// mapping into the designed row (the API checks every call; this only shapes what it sent).

export interface ApiJob {
  id: string;
  title: string;
  status: JobStatus;
  createdAt: string;
  createdById: string;
  closedAt: string | null;
  publishedAt?: string | null;
  slug?: string | null;
  department: string | null;
  location: string | null;
  employmentType?: string | null;
  hiringManagerId: string | null;
  headcount: number | null;
  publicApplyEnabled: boolean;
  listOnCareers: boolean;
  applyToken: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod?: 'year' | 'month' | 'hour';
  showSalary?: boolean;
  askPayHistory?: boolean;
  legalEntityId?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  gradeId?: string | null;
  locationId?: string | null;
  pipelineId?: string | null;
  headcountPlanLineId?: string | null;
  outsidePlan?: boolean;
  requisitionReason?: string | null;
  approval: ApprovalSummary | null;
  stageCounts?: StageCounts;
}

const TYPE: Record<string, string> = { FULL_TIME: 'Full time', PART_TIME: 'Part time', CONTRACTOR: 'Contract', TEMPORARY: 'Temporary', INTERN: 'Internship', VOLUNTEER: 'Volunteer', PER_DIEM: 'Per day', OTHER: 'Other' };
const STATUS: Record<JobStatus, HiringJobRow['status']> = { open: 'Open', draft: 'Draft', pending_approval: 'Waiting for approval', closed: 'Closed' };

/** The careers page of a job, only while the careers site lists it (open, public applications on, listed). */
export function careersUrl(j: ApiJob, origin: string, orgSlug: string | null): string | null {
  return j.status === 'open' && j.publicApplyEnabled && j.listOnCareers && j.slug && orgSlug ? `${origin}/careers/${orgSlug}/jobs/${j.slug}` : null;
}

export function jobRow(j: ApiJob, names: (userId: string | null) => string, origin: string, orgSlug: string | null): LiveJobRow {
  const c = j.stageCounts?.byCategory;
  return {
    id: j.id,
    code: '',
    title: j.title,
    department: j.department ?? '',
    location: j.location ?? '',
    type: j.employmentType ? (TYPE[j.employmentType] ?? j.employmentType) : 'Not set',
    // No recruiter field on a job yet: the person who opened it (founder question 222).
    recruiter: names(j.createdById),
    hiringManager: names(j.hiringManagerId),
    status: STATUS[j.status] ?? 'Draft',
    applicants: c ? c.active + c.offer + c.hired + c.rejected + c.archived : 0,
    inPipeline: c ? c.active + c.offer : 0,
    posted: j.publishedAt ? new Date(j.publishedAt) : null,
    slug: j.slug ?? '',
    internal: false,
    careersUrl: careersUrl(j, origin, orgSlug),
  };
}
