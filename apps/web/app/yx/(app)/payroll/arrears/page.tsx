'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrearsBaseScreen, RecoveriesScreen, type ArrearsJobRow, type RuleProposal, type CarryForwardRow, type CourtRemittance, type DeductionCapView, type DeferralRow, type LiveCourtOrder, type Recovery, type Worksheet } from '@yukthix/ui/pay';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';

// Payroll › Arrears and recoveries (PAY-10.04, PAY-28, PAY-19): worksheets, base confirmation, approval, write-offs.
export default function YxPayArrearsPage() {
  const perms = useYxPermissions();
  const me = useCurrentUser();
  const sheets = usePay<Worksheet[]>('/arrears-worksheets');
  const recoveries = usePay<Recovery[]>('/overpayments');
  const orders = usePay<LiveCourtOrder[]>('/court-orders');
  const inputs = perms.has('payroll.input.manage');
  const runView = (['payroll.run.view', 'payroll.run.prepare', 'payroll.run.approve'] as const).some((k) => perms.has(k));
  // PAY-19: carry-forwards and the deduction cap check, for the people who may see them.
  const carry = usePay<CarryForwardRow[]>(inputs ? '/carry-forwards' : null);
  const deferrals = usePay<DeferralRow[]>(runView ? '/deferrals' : null);
  const read = usePayRead();
  const search = usePeopleSearch();
  const write = usePayWrite();
  const nameOf = useNames();
  // Enterprise E3 (answers 2651, 2652, 2787): statutory rule changes with their impact, and what triggers drafted.
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const decide = perms.has('payroll.arrears.approve');
  const busy = (rows: { status?: string; impact?: { status: string } | null }[] | undefined) => (rows ?? []).some((r) => r.status === 'running' || r.status === 'queued' || r.impact?.status === 'running');
  const proposals = useQuery<RuleProposal[]>({ queryKey: ['statutory', 'arrears-proposals'], queryFn: () => apiFetch('/statutory/arrears-proposals', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && decide, retry: false, refetchInterval: (q) => (busy(q.state.data) ? 4000 : false) });
  const jobs = useQuery<ArrearsJobRow[]>({ queryKey: ['payroll', '/arrears-runs'], queryFn: () => apiFetch('/payroll/arrears-runs', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && decide, retry: false, refetchInterval: (q) => (busy(q.state.data) ? 4000 : false) });
  const statutory = async (path: string, body: unknown = {}) => {
    const out = await apiFetch(`/statutory/arrears-proposals/${path}`, { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined);
    await Promise.all([qc.invalidateQueries({ queryKey: ['statutory', 'arrears-proposals'] }), qc.invalidateQueries({ queryKey: ['payroll'] })]);
    return out;
  };
  return (
    <ArrearsBaseScreen
      live={{
        state: payState(sheets),
        onRetry: () => void sheets.refetch(),
        worksheets: sheets.data ?? null,
        recoveries: recoveries.data ?? (recoveries.isError ? [] : null),
        nameOf,
        me: me.data?.id ?? null,
        can: { approve: perms.has('payroll.arrears.approve'), writeOff: perms.has('payroll.writeoff.approve') },
        onApprove: (w, runId) => write(`/arrears-worksheets/${encodeURIComponent(w.id)}/approve`, runId ? { runId } : {}),
        onCancel: (w, reason) => write(`/arrears-worksheets/${encodeURIComponent(w.id)}/cancel`, { reason }),
        onConfirmBase: (w, period, lines, reason) => write(`/arrears-worksheets/${encodeURIComponent(w.id)}/confirm-base`, { period, lines, reason }),
        onWriteOff: (r, reason) => write(`/overpayments/${encodeURIComponent(r.id)}/write-off`, { reason }),
        ...(decide
          ? {
              changes: {
                proposals: proposals.data ?? (proposals.isError ? [] : null),
                jobs: jobs.data ?? (jobs.isError ? [] : null),
                canDecide: decide,
                onPreview: (p: RuleProposal) => statutory(`${encodeURIComponent(p.id)}/preview`),
                onAccept: (p: RuleProposal) => statutory(`${encodeURIComponent(p.id)}/accept`),
                onDismiss: (p: RuleProposal, reason: string) => statutory(`${encodeURIComponent(p.id)}/dismiss`, { reason }),
              },
            }
          : {}),
        // PAY-19: court orders and overpayments as tabs (builder 1's designed screen).
        recoveryTabs: (
          <RecoveriesScreen
            live={{
              orders: {
                state: payState(orders),
                rows: orders.data ?? null,
                canAdd: inputs,
                onAdd: (x) => write('/court-orders', x),
                onRemittances: (id) => read<CourtRemittance[]>(`/court-orders/${encodeURIComponent(id)}/remittances`),
                onRemit: (id, month, reference) => write(`/court-orders/${encodeURIComponent(id)}/remittances`, { month, reference }),
              },
              ...(inputs ? { carry: { state: payState(carry), rows: carry.data ?? null } } : {}),
              ...(runView ? { cap: { state: payState(deferrals), rows: deferrals.data ?? null, onOpen: (sid: string) => read<DeductionCapView>(`/payslips/${encodeURIComponent(sid)}/deduction-cap`) } } : {}),
              overpayments: { state: payState(recoveries), rows: recoveries.data ?? null, canWriteOff: perms.has('payroll.writeoff.approve'), onWriteOff: (r, reason) => write(`/overpayments/${encodeURIComponent(r.id)}/write-off`, { reason }) },
              nameOf,
              onSearch: (q) => search(q),
              onRetry: () => void Promise.all([orders.refetch(), recoveries.refetch()]),
              today: todayIndia(),
            }}
          />
        ),
      }}
    />
  );
}
