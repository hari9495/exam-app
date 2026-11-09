'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CandidateListScreen, type CandidateListTab, type CandidateStatusFilter, type DuplicatePairView, type GlobalStage, type TalentList } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { apiFetch, apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useHiring } from '../../../../../lib/yx-hiring';
import { saveBlob } from '../../../../../lib/yx-pay';
import { useCandidates } from '../../../../../lib/hooks/useCandidates';
import { useExams } from '../../../../../lib/hooks/useExams';
import { useJobs } from '../../../../../lib/hooks/usePipeline';
import { useCustomFieldsInUse } from '../../../../../lib/hooks/useCustomFields';
import { useMessageTemplates } from '../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../lib/hooks/useOrgSenderAddresses';
import { templateChoices } from '../../../../../lib/yx-candidates';

const PAGE_SIZE = 25;

// Hiring › Candidates: the designed HIR-05 candidate list with `live` (founder decision 9), on the AT4 API; the older
// /v2/candidates and /yx/hiring/duplicates open it (duplicates as ?view=duplicates). Merging needs the data-rights key.
export default function YxHiringCandidatesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: CandidateListTab = params?.get('view') === 'duplicates' ? 'duplicates' : 'candidates';
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CandidateStatusFilter>('active');
  const [stage, setStage] = useState<GlobalStage | null>(null);
  const list = useCandidates({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined, status: status === 'all' ? undefined : status, globalStage: stage ?? undefined });
  const canManage = perms.has('candidate:manage');
  const exams = useExams(undefined, { pageSize: 100 });
  const jobs = useJobs('open');
  const fields = useCustomFieldsInUse('candidate');
  const templates = useMessageTemplates();
  const senders = useOrgSenderAddresses();
  const lists = useHiring<TalentList[]>('/pools');
  const dupes = useHiring<DuplicatePairView[]>('/duplicates', canManage);
  const call = async <T,>(path: string, method: string, body?: unknown): Promise<T> => {
    const r = (await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined)) as T;
    await Promise.all([qc.invalidateQueries({ queryKey: ['candidates'] }), qc.invalidateQueries({ queryKey: ['hiring'] })]);
    return r;
  };
  const ls = loadState(list);
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  return (
    <CandidateListScreen
      rows={(list.data?.data ?? []).map((c) => ({ id: c.id, name: c.name, email: c.email ?? '', phone: c.phone, status: c.status === 'inactive' ? 'inactive' : 'active', globalStage: c.globalStage, createdAt: c.createdAt, neverInvited: !c.invitationCount, customFields: Object.fromEntries((c.customFields ?? []).map((f) => [f.definitionId, f.value])) }))}
      canManage={canManage}
      customFields={(fields.data ?? []).filter((f) => !f.archivedAt).map((f) => ({ id: f.id, label: f.label, fieldType: f.fieldType, options: f.options, required: f.required }))}
      exams={(exams.data?.data ?? []).map((e) => ({ value: e.id, label: e.title }))}
      openJobs={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))}
      lists={lists.data ?? []}
      duplicates={dupes.data ?? []}
      canMerge={perms.has('candidate:data_rights')}
      live={{
        state: ls === 'ready' ? 'ready' : ls === 'loading' ? 'loading' : 'error',
        onRetry: () => void list.refetch(),
        total: list.data?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
        onPage: setPage,
        search,
        onSearch: filter(setSearch),
        status,
        onStatus: filter(setStatus),
        stage,
        onStage: filter(setStage),
        tab,
        onTab: (t) => router.replace(t === 'duplicates' ? '/yx/hiring/candidates?view=duplicates' : '/yx/hiring/candidates'),
        onOpen: (id) => router.push(`/yx/hiring/candidates/${encodeURIComponent(id)}`),
        onMerge: (keptId, mergedId, choices) => call(`/hiring/candidates/${encodeURIComponent(keptId)}/merge`, 'POST', { mergedId, ...choices }),
        onCreate: (c) => call('/candidates', 'POST', c),
        onUpdate: (id, c) => call(`/candidates/${id}`, 'PATCH', c),
        onDelete: async (ids) => {
          const r = await call<{ deleted: unknown[]; skipped: unknown[] }>('/candidates/bulk-delete', 'POST', { candidateIds: ids });
          return { deleted: r.deleted.length, skipped: r.skipped.length };
        },
        onInvite: async (examId, ids) => {
          const r = await call<{ created: unknown[]; skipped: unknown[] }>(`/exams/${examId}/invitations`, 'POST', { candidateIds: ids });
          return { invited: r.created.length, skipped: r.skipped.length };
        },
        onUploadInvite: async (examId, file) => {
          const form = new FormData();
          form.append('file', file);
          form.append('examId', examId);
          const r = (await apiFetch('/candidates/bulk-upload-invite', { method: 'POST', body: form }, accessToken ?? undefined)) as { created: unknown[]; skipped: unknown[]; errors: { row: number; message: string }[] };
          await qc.invalidateQueries({ queryKey: ['candidates'] });
          return { invited: r.created.length, skipped: r.skipped.length, errors: r.errors };
        },
        onDownloadTemplate: async () => {
          const { blob, filename } = await apiFetchBlob('/candidates/bulk-upload-invite/template', {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? 'candidates-template.xlsx');
        },
        onEmail: (ids, c) => call('/bulk-candidate-email/by-candidates', 'POST', { ...c, candidateIds: ids }),
        onAddToList: (listId, ids) => call(`/hiring/pools/${listId}/members`, 'POST', { candidateIds: ids }),
        onReengage: (jobId, candidateId) => call(`/jobs/${jobId}/entries`, 'POST', { candidateId }),
      }}
      templates={templateChoices(templates.data)}
      senders={(senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` }))}
    />
  );
}
