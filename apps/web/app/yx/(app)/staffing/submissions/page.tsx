'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ClientJobSheet, SubmissionsBoardScreen, SubmitToClientSheet, type SubmissionRowView, type SubmitOptions } from '@yukthix/ui/hiring';
import { deskState, rupees, useStaffing, useStaffingGet, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

type Job = { id: string; title: string; status: string; client: string; billRate: string | null; unit: string | null };
type Clients = { canManage: boolean; rows: { id: string; name: string }[] };
type Rates = { rows: { lineId: string; role: string; location: string; unit: string; billRate: string }[] };

// Staffing desk › Submissions (HIR-16): the designed board with `live`. Recruiters and account managers submit bench
// people and a client job's pipeline to a client contact (one email, masked by default) and move cards as the client
// replies; account managers open client jobs on a rate-card line. The API checks the desk, the keys and acting.
export default function YxStaffingSubmissionsPage() {
  const { impersonating, actingSuperAdmin } = useAuth();
  const { toast } = useToast();
  const params = useSearchParams();
  const rows = useStaffing<SubmissionRowView[]>('/submissions');
  const jobs = useStaffing<Job[]>('/jobs', rows.isSuccess);
  const clients = useStaffing<Clients>('/clients', rows.isSuccess);
  const get = useStaffingGet();
  const write = useStaffingWrite();
  const [submitting, setSubmitting] = useState(params.get('submit') === '1');
  const [newJob, setNewJob] = useState(false);
  const acting = impersonating || actingSuperAdmin;
  const loadOptions = useCallback((jobId: string) => get<SubmitOptions>(`/submissions/options?jobId=${encodeURIComponent(jobId)}`), [get]);
  const loadLines = useCallback(
    async (clientId: string) => (await get<Rates>(`/clients/${encodeURIComponent(clientId)}/rates`)).rows.map((r) => ({ value: r.lineId, label: `${r.role} · ${r.location} · ₹${Number(r.billRate).toLocaleString('en-IN')} per ${r.unit}` })),
    [get],
  );
  const canManage = Boolean(clients.data?.canManage) && !acting;
  return (
    <>
      <SubmissionsBoardScreen
        live={{
          state: deskState(rows),
          onRetry: () => void rows.refetch(),
          rows: rows.data ?? [],
          onSubmit: () => setSubmitting(true),
          onNewJob: canManage ? () => setNewJob(true) : undefined,
          onMove: (id, stage, reason) =>
            void write('POST', `/submissions/${encodeURIComponent(id)}/move`, { stage, ...(reason ? { reason } : {}) }).catch((e: Error) => {
              toast({ tone: 'error', title: e.message || 'That move did not save.' });
              void rows.refetch();
            }),
        }}
      />
      {submitting && (
        <SubmitToClientSheet
          open
          onOpenChange={(o) => !o && setSubmitting(false)}
          jobs={(jobs.data ?? []).filter((j) => j.status === 'open').map((j) => ({ value: j.id, label: `${j.title} · ${j.client}` }))}
          initialJobId={params.get('job')}
          loadOptions={loadOptions}
          onSave={async (input) => {
            const r = await write<{ emailed: boolean; rows: { result: string; name?: string }[] }>('POST', '/submissions', { ...input, billRate: rupees(input.billRate) });
            const already = r.rows.filter((x) => x.result === 'already').map((x) => x.name);
            if (already.length) toast({ tone: 'default', title: `Already submitted: ${already.join(', ')}` });
            if (!r.emailed && r.rows.some((x) => x.result === 'submitted')) toast({ tone: 'warning', title: 'Submitted, but the email to the client did not go. Send it yourself.' });
          }}
        />
      )}
      {newJob && clients.data && (
        <ClientJobSheet
          open
          onOpenChange={(o) => !o && setNewJob(false)}
          clients={clients.data.rows.map((c) => ({ value: c.id, label: c.name }))}
          loadLines={loadLines}
          onSave={({ clientId, ...body }) => write('POST', `/clients/${encodeURIComponent(clientId)}/jobs`, { lineId: body.lineId, headcount: body.headcount, ...(body.title ? { title: body.title } : {}) })}
        />
      )}
    </>
  );
}
