'use client';

import { useParams, useRouter } from 'next/navigation';
import { RunPaymentsScreen, type Disbursement, type PayRun, type RunPayslip } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../../../lib/yx-pay-5j';

// Payroll › one run › Payments (PAY-10.09, PAY-10): the bank's results and the cash and cheque register.
export default function YxPayRunPaymentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const base = `/runs/${encodeURIComponent(id)}`;
  const run = usePay<PayRun>(base);
  const payslips = usePay<RunPayslip[]>(`${base}/payslips`);
  const record = perms.has('payroll.payment.record');
  const disbursements = usePay<Disbursement[]>(record ? `${base}/disbursements` : null);
  const write = usePayWrite();
  const upload = useApiWrite();
  const nameOf = useNames();
  return (
    <RunPaymentsScreen
      state={payState(run, payslips)}
      onRetry={() => void Promise.all([run.refetch(), payslips.refetch()])}
      run={run.data ?? null}
      payslips={payslips.data ?? null}
      disbursements={disbursements.data ?? null}
      nameOf={nameOf}
      can={{ record }}
      onBack={() => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`)}
      onResults={(rows) => write(`${base}/payment-results`, { rows })}
      onUploadResults={(file) => {
        const form = new FormData();
        form.append('file', file);
        return upload<{ recorded: number }>(`/payroll${base}/payment-results/upload`, form);
      }}
      onDisburse={(d) => write(`${base}/disbursements`, d)}
    />
  );
}
