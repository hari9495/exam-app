'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiringJobsScreen, type JobsFilter, type OpenPlanLine } from '@yukthix/ui/hiring';
import type { PersonOption } from '@yukthix/ui/history';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useCancelRequisition, useCreateJob, useDeleteJob, useJobs, useSubmitRequisition } from '../../../../../lib/hooks/usePipeline';
import { usePeople } from '../../../../../lib/yx-people';
import { useHiring } from '../../../../../lib/yx-hiring';
import { usePipelines } from '../../../../../lib/hooks/usePipelines';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { useCustomFields } from '../../../../../lib/hooks/useCustomFields';
import { useGenerateJobDescription } from '../../../../../lib/hooks/useAiDrafting';
import { stageSummary } from '../../../../../lib/job-stage-summary';
import type { JobStatus } from '../../../../../lib/types';

// Hiring › Jobs (M10 batch AT1): the same hiring API as the older /v2/jobs list, which now redirects here. A job opens
// in its existing workspace until the YukthiX pipeline screens ship (AT5).
export default function YxHiringJobsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const [filter, setFilter] = useState<JobsFilter>('all');
  const jobs = useJobs(filter === 'all' ? undefined : (filter as JobStatus));
  const pipelines = usePipelines();
  const teammates = useTeammates();
  const customFields = useCustomFields('job');
  const createJob = useCreateJob();
  const deleteJob = useDeleteJob();
  const draft = useGenerateJobDescription();
  const submitReq = useSubmitRequisition();
  const cancelReq = useCancelRequisition();
  // AT2: lines of approved headcount plans, and the people a replacement may name (HR who can read employees).
  const planLines = useHiring<OpenPlanLine[]>('/plan-lines', perms.has('pipeline:manage') || perms.has('ats.headcount.manage'));
  const employees = usePeople<PersonOption[]>(perms.has('employee.profile.view') ? '/employees' : null);
  // P01 masters, where the company has them (a hiring-only company may not): read with the structure keys.
  const masters = perms.has('org.structure.view') || perms.has('org.settings.manage');
  const departments = useOrg<MasterRecord[]>('/masters/departments', masters);
  const locations = useOrg<MasterRecord[]>('/locations', masters);
  const designations = useOrg<MasterRecord[]>('/masters/designations', masters);
  const choices = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));
  return (
    <HiringJobsScreen
      state={loadState(jobs)}
      onRetry={() => void jobs.refetch()}
      jobs={(jobs.data ?? []).map((j) => ({ id: j.id, title: j.title, status: j.status, createdAt: j.createdAt, stageSummary: stageSummary(j, pipelines.data) }))}
      filter={filter}
      onFilter={setFilter}
      canManage={perms.has('pipeline:manage')}
      onOpen={(id) => router.push(`/yx/hiring/jobs/${encodeURIComponent(id)}`)}
      onCreate={(input) => createJob.mutateAsync(input as never)}
      onDelete={(id) => deleteJob.mutateAsync(id)}
      onDraftDescription={async (title) => (await draft.mutateAsync({ title })).description}
      departments={choices(departments.data)}
      locations={choices(locations.data)}
      designations={choices(designations.data)}
      managers={(teammates.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email }))}
      pipelines={(pipelines.data ?? []).map((x) => ({ value: x.id, label: x.isDefault ? `${x.name} (default)` : x.name, isDefault: x.isDefault }))}
      planLines={planLines.data ?? []}
      employees={(employees.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
      onSubmitRequisition={(id) => submitReq.mutateAsync(id)}
      onWithdraw={(id) => cancelReq.mutateAsync(id)}
      customFields={(customFields.data ?? []).filter((f) => !f.archivedAt).map((f) => ({ id: f.id, label: f.label, fieldType: f.fieldType, options: f.options, required: f.required }))}
    />
  );
}
