'use client';

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
          // The run calculates in the background: look every second until it is done, then say so.
          let status: string | null = 'calculating';
          for (let i = 0; i < 180 && status === 'calculating'; i++) {
            await new Promise((ok) => setTimeout(ok, 1000));
            status = (await list.refetch()).data?.find((x) => x.id === s.id)?.runStatus ?? null;
          }
          if (status !== 'calculated') throw new Error('The F&F run did not calculate. Open the F&F run to see why.');
          done(`F&F for ${nameOf(s.employeeId)} recalculated`);
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
