'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { JobsScreen, type LiveJobRow, type NewJob } from '@yukthix/ui/frame';
import type { OpenPlanLine } from '@yukthix/ui/hiring';
import type { PersonOption } from '@yukthix/ui/history';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useAuth } from '../../../../../lib/auth-context';
import { usePeople } from '../../../../../lib/yx-people';
import { useApi, useApiWrite, useHiring } from '../../../../../lib/yx-hiring';
import { usePipelines } from '../../../../../lib/hooks/usePipelines';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { useCustomFieldsInUse } from '../../../../../lib/hooks/useCustomFields';
import { useGenerateJobDescription } from '../../../../../lib/hooks/useAiDrafting';
import { jobRow, type ApiJob } from '../../../../../lib/yx-jobs';

// Hiring › Jobs (HIR-03, HIR-24): the designed jobs list with `live`, on the existing jobs API (GET/POST/PATCH/DELETE
// jobs, submit and withdraw a requisition). Opening a job goes to its designed workspace. The API checks every call.
export default function YxHiringJobsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organizationSlug } = useAuth();
  const perms = useYxPermissions();
  const canManage = perms.has('pipeline:manage');
  const jobs = useApi<ApiJob[]>('/jobs');
  const pipelines = usePipelines();
  const teammates = useTeammates();
  const customFields = useCustomFieldsInUse('job', canManage);
  const draft = useGenerateJobDescription();
  const pay = useApi<{ showRange: boolean }>(canManage ? '/jobs/pay-settings' : null);
  const write = useApiWrite();
  // Lines of approved headcount plans, and the people a replacement may name (HR who can read employees).
  const planLines = useHiring<OpenPlanLine[]>('/plan-lines', canManage || perms.has('ats.headcount.manage'));
  const employees = usePeople<PersonOption[]>(canManage && perms.has('employee.profile.view') ? '/employees' : null);
  // P01 masters, where the company has them (a hiring-only company may not).
  const masters = perms.has('org.structure.view') || perms.has('org.settings.manage');
  const departments = useOrg<MasterRecord[]>('/masters/departments', masters && canManage);
  const locations = useOrg<MasterRecord[]>('/locations', masters && canManage);
  const designations = useOrg<MasterRecord[]>('/masters/designations', masters && canManage);
  const choices = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));
  const names = (id: string | null) => (id ? ((teammates.data ?? []).find((t) => t.id === id)?.name ?? '') : '');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const rows = (jobs.data ?? []).map((j) => jobRow(j, names, origin, organizationSlug ?? null));
  const done = (title: string) => toast({ tone: 'success', title });
  const failed = (title: string) => (e: unknown) => toast({ tone: 'error', title, description: (e as Error).message });
  const id = encodeURIComponent;
  return (
    <JobsScreen
      rows={[]}
      now={new Date()}
      live={{
        rows,
        state: loadState(jobs) === 'no-access' ? 'error' : (loadState(jobs) as 'ready' | 'loading' | 'error'),
        onRetry: () => void jobs.refetch(),
        canManage,
        onOpen: (jobId) => router.push(`/yx/hiring/jobs/${id(jobId)}`),
        create: {
          choices: {
            departments: choices(departments.data),
            locations: choices(locations.data),
            designations: choices(designations.data),
            managers: (teammates.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email })),
            pipelines: (pipelines.data ?? []).map((x) => ({ value: x.id, label: x.isDefault ? `${x.name} (default)` : x.name, isDefault: x.isDefault })),
            planLines: (planLines.data ?? []).map((l) => ({ id: l.id, departmentId: l.departmentId, label: `${l.department} · ${l.designation}${l.location ? ` · ${l.location}` : ''} · ${l.left} left` })),
            employees: (employees.data ?? []).map((e) => ({ value: e.id, label: e.name })),
            customFields: (customFields.data ?? []).filter((f) => !f.archivedAt).map((f) => ({ id: f.id, label: f.label, fieldType: f.fieldType, options: f.options, required: f.required })),
            showRangeByDefault: pay.data?.showRange ?? false,
          },
          onCreate: async (input: NewJob) => {
            const created = await write<{ status: string }>('POST', '/jobs', input);
            done(created.status === 'draft' ? `${input.title} saved as a requisition. Send it for approval from the list.` : `Job ${input.title} created`);
          },
          onDraftDescription: async (title) => (await draft.mutateAsync({ title })).description,
        },
        onCopyLink: (r: LiveJobRow) => {
          void navigator.clipboard.writeText(r.careersUrl ?? '').then(() => done('Careers link copied'), failed('The link could not be copied'));
        },
        onStatus: (r, to) => {
          const said = to === 'closed' ? `${r.title} closed. Its board postings close too.` : to === 'on_hold' ? `${r.title} is on hold. It is off the careers page and job boards; candidates stay.` : r.status === 'On hold' ? `${r.title} resumed` : `${r.title} reopened`;
          void write('PATCH', `/jobs/${id(r.id)}`, { status: to }).then(() => done(said), failed(`Could not change ${r.title}`));
        },
        onSubmit: (r) => {
          void write<{ status?: string }>('POST', `/jobs/${id(r.id)}/submit`).then((x) => done(x?.status === 'approved' ? `${r.title} approved` : `${r.title} sent for approval`), failed(`Could not send ${r.title}`));
        },
        onWithdraw: (r) => {
          void write('POST', `/jobs/${id(r.id)}/approval/cancel`).then(() => done(`${r.title} withdrawn from approval`), failed(`Could not withdraw ${r.title}`));
        },
        onDelete: async (r) => {
          await write('DELETE', `/jobs/${id(r.id)}`);
          done(`${r.title} deleted`);
        },
      }}
    />
  );
}
