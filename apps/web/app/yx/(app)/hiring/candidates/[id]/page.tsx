'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CandidateRecordScreen, type CandidateProfileView, type DuplicatePairView, type LiveCandidateRecord, type TalentList } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../../lib/yx-hiring';
import { useCandidates } from '../../../../../../lib/hooks/useCandidates';
import { useMessageTemplates } from '../../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../../lib/hooks/useOrgSenderAddresses';
import { templateChoices } from '../../../../../../lib/yx-candidates';
import { saveBlob } from '../../../../../../lib/yx-pay';
import { useApplicationDrawer, useRecordPipeline } from '../../../../../../lib/yx-application';

type Answer = CandidateProfileView | { mergedIntoId: string };

// Hiring › Candidates › one candidate: the designed HIR-05 record with `live`. The API decides what this viewer sees
// (contact details only with candidate:manage or the data-rights key; the ex-employee match only for people who may see
// the employee) and refuses writes while acting for someone else. A merged-away candidate's address opens the kept one.
// Founder answer 261: ?entry= opens that application on the record (a card on the HIR-04 board links here).
export default function YxHiringCandidatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const manage = perms.has('candidate:manage');
  const dataRights = perms.has('candidate:data_rights');
  const profile = useHiring<Answer>(`/candidates/${encodeURIComponent(id)}`);
  const dupes = useHiring<DuplicatePairView[]>('/duplicates', manage);
  const pools = useHiring<TalentList[]>('/pools', manage);
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const [q, setQ] = useState('');
  const others = useCandidates({ search: q.trim() || undefined, pageSize: 20 });
  const templates = useMessageTemplates(perms.has('pipeline:manage'));
  const senders = useOrgSenderAddresses(perms.has('pipeline:manage'));
  const merged = profile.data && 'mergedIntoId' in profile.data ? profile.data.mergedIntoId : null;
  useEffect(() => {
    if (merged) router.replace(`/yx/hiring/candidates/${encodeURIComponent(merged)}`);
  }, [merged, router]);
  const view = profile.data && !('mergedIntoId' in profile.data) ? profile.data : null;
  const entry = useSearchParams().get('entry');
  const entryJob = view?.applications.find((a) => a.id === entry)?.jobId ?? null;
  const here = `/yx/hiring/candidates/${encodeURIComponent(id)}`;
  const application = useApplicationDrawer(entryJob ? entry : null, entryJob, () => router.replace(here));
  // Answer 274: Schedule interview and Move to next stage on the record (the open application).
  const pipeline = useRecordPipeline(view, entry);
  const status = (profile.error as { status?: number } | null)?.status;
  const state: LiveCandidateRecord['state'] = profile.isError ? (status === 403 ? 'denied' : status === 404 || status === 400 ? 'not-found' : 'error') : view ? 'ready' : 'loading';
  const get = <T,>(path: string) => apiFetch(path, {}, accessToken ?? undefined) as Promise<T>;
  const others2 = (dupes.data ?? []).filter((p) => p.a.id === id || p.b.id === id).map((p) => ({ ...(p.a.id === id ? p.b : p.a), reasons: p.reasons }));
  return (
    <CandidateRecordScreen
      live={{
        state,
        onRetry: () => void profile.refetch(),
        profile: view,
        can: { manage, dataRights, resume: perms.has('results:view') },
        now: new Date(),
        duplicates: others2,
        pools: (pools.data ?? []).map((l) => ({ value: l.id, label: `${l.name} (${l.kind === 'pool' ? 'talent pool' : 'hotlist'})` })),
        templates: templateChoices(templates.data),
        senders: (senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` })),
        mergeOptions: (others.data?.data ?? []).filter((c) => c.id !== id).map((c) => ({ value: c.id, label: `${c.name} · ${c.email ?? ''}` })),
        onMergeSearch: setQ,
        loadOther: async (other) => {
          const v = await get<CandidateProfileView>(`/hiring/candidates/${encodeURIComponent(other)}`);
          return { name: v.candidate.name, email: v.candidate.email, phone: v.candidate.phone, hasResume: Boolean(v.resume?.hasFile) };
        },
        application,
        onOpenApplication: (entryId) => router.replace(`${here}?entry=${encodeURIComponent(entryId)}`),
        pipeline,
        onOpenInterview: (ivId) => router.push(`/yx/hiring/interviews/${encodeURIComponent(ivId)}`),
        onBack: () => router.push('/yx/hiring/candidates'),
        onOpenJob: (jobId) => router.push(`/yx/hiring/jobs/${encodeURIComponent(jobId)}/pipeline`),
        onResume: async () => {
          const { url } = await get<{ url: string }>(`/candidates/${encodeURIComponent(id)}/resume`);
          window.open(url, '_blank', 'noopener');
        },
        onEmail: async (c) => void (await apiWrite('POST', '/bulk-candidate-email/by-candidates', { ...c, candidateIds: [id] })),
        onAddToPool: (listId) => write('POST', `/pools/${encodeURIComponent(listId)}/members`, { candidateIds: [id] }),
        onMerge: async (other, choices, keepThis) => {
          const [kept, gone] = keepThis ? [id, other] : [other, id];
          await write('POST', `/candidates/${encodeURIComponent(kept)}/merge`, { mergedId: gone, ...choices });
          if (!keepThis) router.replace(`/yx/hiring/candidates/${encodeURIComponent(kept)}`);
        },
        onHold: async (on, reason) => void (await write('PUT', `/candidates/${encodeURIComponent(id)}/legal-hold`, on ? { on, reason } : { on })),
        onWithdrawPool: async () => void (await write('POST', `/candidates/${encodeURIComponent(id)}/consents/withdraw`, { purpose: 'talent_pool' })),
        onExport: async () => saveBlob(new Blob([JSON.stringify(await get<unknown>(`/candidates/${encodeURIComponent(id)}/export`), null, 2)], { type: 'application/json' }), `candidate-data-${id}.json`),
        onErase: async () => {
          await apiWrite('POST', `/candidates/${encodeURIComponent(id)}/erase`);
          await profile.refetch();
        },
        onClearRehire: async (reason) => {
          const ex = view?.exEmployee;
          if (!ex?.exitCaseId || ex.version == null) throw new Error('Reload the page and try again.');
          await apiWrite('PUT', `/lifecycle/exits/${encodeURIComponent(ex.exitCaseId)}/hr`, { version: ex.version, rehireEligible: true, rehireReason: reason });
          await profile.refetch();
        },
      }}
    />
  );
}
