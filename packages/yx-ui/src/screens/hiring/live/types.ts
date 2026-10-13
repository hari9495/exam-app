// Recruitment (M10), wired to the hiring API (M10-BUILD-DESIGN §3). Shapes the screens show and send.

export type { LoadState } from '../../org/types';

export interface Choice {
  value: string;
  label: string;
}

export type HiringJobStatus = 'draft' | 'pending_approval' | 'open' | 'closed';

export interface HiringJob {
  id: string;
  title: string;
  status: HiringJobStatus;
  createdAt: string;
  /** "3 Applied · 1 Interview", or "No candidates yet". */
  stageSummary: string;
}

export interface JobCustomField {
  id: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  options: string[] | null;
  required: boolean;
}

export interface NewJobInput {
  title: string;
  description?: string;
  departmentId?: string;
  department?: string;
  locationId?: string;
  location?: string;
  designationId?: string;
  hiringManagerId?: string;
  headcount?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  pipelineId?: string;
  customFields?: Record<string, string | number | null>;
}
