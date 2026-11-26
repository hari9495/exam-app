'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InternalJobsScreen, type InternalApplication, type InternalApplyInput } from '@yukthix/ui/hiring';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState } from '../../../../../lib/yx-org';
import { useOrgBranding } from '../../../../../lib/hooks/useBranding';
import { internalJob, type ApiInternalJob } from '../../../../../lib/yx-internal-jobs';

type Mine = { entryId: string; jobTitle: string; status: InternalApplication['status']; appliedAt: string; waitingForManager?: boolean };
type Eligibility = { eligible: boolean; title?: string; detail?: string; managerName: string | null; tellManager: 'on_apply' | 'at_offer'; managerRelease?: boolean };

// Hiring › Internal jobs (HIR-13): the designed screen with `live`, for anyone with an employee record. The jobs shown on
// Internal jobs, whether the person may apply (company rules, founder decision 6: settings hiring.internal.*) and their
// own applications. The API checks every rule again and refuses applying while acting for someone else.
export default function YxInternalJobsPage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const branding = useOrgBranding();
  const get = <T,>(path: string) => ({ queryKey: ['internal-applications', path], queryFn: () => apiFetch(path, {}, accessToken ?? undefined) as Promise<T>, enabled: Boolean(accessToken), retry: false });
  const jobs = useQuery(get<ApiInternalJob[]>('/internal-applications/jobs'));
  const mine = useQuery(get<Mine[]>('/internal-applications/mine'));
  const rule = useQuery(get<Eligibility>('/internal-applications/eligibility'));
  const state = loadState(jobs, mine, rule);
  return (
    <InternalJobsScreen
      jobs={(jobs.data ?? []).map(internalJob)}
      applications={(mine.data ?? []).map((a) => ({ id: a.entryId, job: a.jobTitle, applied: new Date(a.appliedAt), status: a.status, waitingForManager: Boolean(a.waitingForManager) }))}
      live={{
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
        onRetry: () => void Promise.all([jobs.refetch(), mine.refetch(), rule.refetch()]),
        companyName: branding.data?.name || 'your company',
        eligibility: { eligible: Boolean(rule.data?.eligible), title: rule.data?.title, detail: rule.data?.detail },
        manager: { name: rule.data?.managerName ?? null, when: rule.data?.tellManager ?? 'on_apply', release: Boolean(rule.data?.managerRelease) },
        onApply: async (input: InternalApplyInput) => {
          await apiFetch('/internal-applications', { method: 'POST', body: JSON.stringify({ jobId: input.jobId, note: input.note, ...(input.resumeBase64 ? { resumeBase64: input.resumeBase64 } : {}) }) }, accessToken ?? undefined);
          await qc.invalidateQueries({ queryKey: ['internal-applications'] });
        },
      }}
    />
  );
}
