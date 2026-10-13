'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CandidateProfileScreen, type CandidateProfileView } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../../lib/yx-org';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useHiring, useHiringWrite } from '../../../../../../lib/yx-hiring';
import { useCandidates } from '../../../../../../lib/hooks/useCandidates';
import { useMessageTemplates } from '../../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../../lib/hooks/useOrgSenderAddresses';
import { templateChoices } from '../../../../../../lib/yx-candidates';

type Answer = CandidateProfileView | { mergedIntoId: string };

// Hiring › Candidates › one candidate (M10 batch AT4). A merged-away candidate's address opens the kept one.
export default function YxHiringCandidatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const profile = useHiring<Answer>(`/candidates/${encodeURIComponent(id)}`);
  const write = useHiringWrite();
  const [q, setQ] = useState('');
  const others = useCandidates({ search: q.trim() || undefined, pageSize: 20 });
  const templates = useMessageTemplates();
  const senders = useOrgSenderAddresses();
  const merged = profile.data && 'mergedIntoId' in profile.data ? profile.data.mergedIntoId : null;
  useEffect(() => {
    if (merged) router.replace(`/yx/hiring/candidates/${encodeURIComponent(merged)}`);
  }, [merged, router]);
  const view = profile.data && !('mergedIntoId' in profile.data) ? profile.data : null;
  const call = (path: string, method: string, body?: unknown) => apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
  return (
    <CandidateProfileScreen
      state={loadState(profile)}
      onRetry={() => void profile.refetch()}
      profile={view}
      canManage={perms.has('candidate:manage')}
      canDataRights={perms.has('candidate:data_rights')}
      templates={templateChoices(templates.data)}
      senders={(senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` }))}
      mergeCandidates={(others.data?.data ?? []).filter((c) => c.id !== id).map((c) => ({ value: c.id, label: `${c.name} · ${c.email ?? ''}` }))}
      onMergeSearch={setQ}
      loadOther={async (other) => {
        const v = (await call(`/hiring/candidates/${other}`, 'GET')) as CandidateProfileView;
        return { name: v.candidate.name, phone: v.candidate.phone, hasResume: Boolean(v.resume?.hasFile) };
      }}
      onBack={() => router.push('/yx/hiring/candidates')}
      onOpenJob={(jobId) => router.push(`/yx/hiring/jobs/${encodeURIComponent(jobId)}`)}
      onResume={async () => {
        const { url } = (await call(`/candidates/${id}/resume`, 'GET')) as { url: string };
        window.open(url, '_blank', 'noopener');
      }}
      onEmail={(c) => call('/bulk-candidate-email/by-candidates', 'POST', { ...c, candidateIds: [id] })}
      onMerge={(mergedId, choices) => write('POST', `/candidates/${id}/merge`, { mergedId, ...choices })}
      onHold={(on, reason) => write('PUT', `/candidates/${id}/legal-hold`, on ? { on, reason } : { on })}
      onWithdrawPool={() => write('POST', `/candidates/${id}/consents/withdraw`, { purpose: 'talent_pool' })}
      onErase={async () => {
        await call(`/candidates/${id}/erase`, 'POST');
        await profile.refetch();
      }}
    />
  );
}
