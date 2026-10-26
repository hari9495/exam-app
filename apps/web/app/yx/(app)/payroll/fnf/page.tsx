'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { FnfCalculator } from '@yukthix/ui/frame';
import type { FnfSettlementView } from '@yukthix/ui/pay';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';

const id = encodeURIComponent;

// Payroll › Full and final (PAY-10.04, PPL-22): the designed F&F calculator with the live settlements — lines explained,
// totals from the F&F run's payslip, held lines, the notice waiver, added lines and the second run.
export default function YxPayFnfPage() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const list = usePay<FnfSettlementView[]>('/fnf');
  const write = usePayWrite();
  const nameOf = useNames();
  const patch = (s: FnfSettlementView, body: object) => write(`/fnf/${id(s.id)}`, { version: s.version, ...body }, 'PATCH');
  const done = (title: string) => toast({ tone: 'success', title });
  // While an F&F run calculates, look again every two seconds.
  const calculating = list.data?.some((s) => s.runStatus === 'calculating');
  useEffect(() => {
    if (!calculating) return;
    const t = setInterval(() => void list.refetch(), 2000);
    return () => clearInterval(t);
  }, [calculating]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FnfCalculator
      today={new Date(`${todayIst()}T00:00:00`)}
      live={{
        state: payState(list),
        onRetry: () => void list.refetch(),
        settlements: list.data ?? [],
        nameOf,
        can: { manage: perms.has('payroll.fnf.manage'), waiveNotice: perms.has('payroll.notice.waive'), prepare: perms.has('payroll.run.prepare') },
        onOpenRun: (runId) => router.push(`/yx/payroll/runs/${id(runId)}`),
        onRecalculate: async (s) => {
          await write(`/runs/${id(s.runId!)}/calculate`);
          done(`The F&F run for ${nameOf(s.employeeId)} is being calculated`);
        },
        onSubmit: async (s) => {
          await write(`/runs/${id(s.runId!)}/submit`, {});
          done(`The F&F run for ${nameOf(s.employeeId)} is sent for approval`);
        },
        onHold: async (s, itemId, holdReason, reason) => {
          await patch(s, { reason: reason.length >= 5 ? reason : `${reason} (F&F)`, items: [{ id: itemId, holdReason }] });
          done(holdReason ? 'The line is held' : 'The line is released');
        },
        onAdd: async (s, line, reason) => {
          await patch(s, { reason, add: [line] });
          done('The line is added');
        },
        onWaiveNotice: async (s, reason) => {
          await write(`/fnf/${id(s.id)}/waive-notice`, { reason });
          done(`The notice recovery for ${nameOf(s.employeeId)} is waived`);
        },
        onSecondRun: (s) => write<{ runId: string }>(`/fnf/${id(s.id)}/second-run`),
      }}
    />
  );
}
