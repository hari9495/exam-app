'use client';

import { useParams, useRouter } from 'next/navigation';
import { RunReadinessScreen, type PayRun, type RunInputSources, type RunPerson, type RunReadiness } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../../../lib/yx-pay';

// Payroll › a run › readiness: the designed PAY-02 pre-flight (Enterprise E5, 2411) with the run's dates (cut-off and
// payslip release, changeable for one month with a reason), late inputs, attendance, inputs and checks, then Calculate.
export default function YxPayRunReadinessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const base = `/runs/${encodeURIComponent(id)}`;
  const run = usePay<PayRun>(base);
  const people = usePay<RunPerson[]>(`${base}/people`);
  const readiness = usePay<RunReadiness>(`${base}/readiness`);
  const inputSources = usePay<RunInputSources>(`${base}/input-sources`);
  const write = usePayWrite();
  return (
    <RunReadinessScreen
      live={{
        state: payState(run),
        onRetry: () => void Promise.all([run.refetch(), readiness.refetch()]),
        run: run.data ?? null,
        people: people.data ?? [],
        readiness: readiness.data ?? null,
        inputSources: inputSources.data ?? null,
        can: {
          prepare: perms.has('payroll.run.prepare'),
          approve: perms.has('payroll.run.approve'),
          bankGenerate: perms.has('payroll.bankfile.generate'),
          bankRelease: perms.has('payroll.bankfile.release'),
          publish: perms.has('payroll.payslip.publish'),
          offcycle: perms.has('payroll.offcycle.prepare'),
        },
        onWaive: async (vid, reason) => {
          await write(`${base}/validations/${encodeURIComponent(vid)}/waive`, { reason });
          await readiness.refetch();
        },
        onCalculate: () => write(`${base}/calculate`),
        onOpenRun: () => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`),
        onLopInput: () => router.push('/yx/payroll/inputs'),
        onSaveDates: async ({ payGroupId, month, ...body }) => {
          await write(`/pay-groups/${encodeURIComponent(payGroupId)}/periods/${encodeURIComponent(month)}/dates`, body, 'PUT');
          await readiness.refetch();
        },
      }}
    />
  );
}
