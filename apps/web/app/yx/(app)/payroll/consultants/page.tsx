'use client';

import { ConsultantsScreen, type ConsultantBatch, type ConsultantInvoice, type ConsultantRow, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload } from '../../../../../lib/yx-pay';
import { useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Consultants (PAY-8.01 … 8.03): the register, invoices with their TDS, and consultant bank files.
export default function YxPayConsultantsPage() {
  const perms = useYxPermissions();
  const can = { manage: perms.has('consultant.manage'), release: perms.has('payroll.bankfile.release') };
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const consultants = usePay<ConsultantRow[]>('/consultants');
  const invoices = usePay<ConsultantInvoice[]>('/consultant-invoices');
  const batches = usePay<ConsultantBatch[]>(can.manage || can.release ? '/consultant-payouts' : null);
  const write = useApiWrite();
  const download = usePayDownload();
  const id = encodeURIComponent;
  return (
    <ConsultantsScreen
      state={payState(entities, consultants, invoices)}
      onRetry={() => void Promise.all([entities.refetch(), consultants.refetch(), invoices.refetch()])}
      entities={entities.data ?? []}
      consultants={consultants.data ?? null}
      invoices={invoices.data ?? null}
      batches={batches.data ?? (can.manage || can.release ? null : [])}
      can={can}
      onCreate={(x) => write('/payroll/consultants', x)}
      onBankCheck={(k, reference) => write(`/payroll/consultants/${id(k)}/bank-check`, { reference })}
      onCertificate={(k, x) => write(`/payroll/consultants/${id(k)}/certificates-197`, x)}
      onInvoice={(consultantId, x, file) => {
        const form = new FormData();
        form.append('consultantId', consultantId);
        for (const [k, v] of Object.entries(x)) if (v !== undefined) form.append(k, String(v));
        if (file) form.append('file', file);
        return write('/payroll/consultant-invoices', form);
      }}
      onInvoiceFile={(i) => download(`/payroll/consultant-invoices/${id(i.id)}/file`, `${i.invoiceNo}.pdf`)}
      onAdvice={(i) => download(`/payroll/consultant-invoices/${id(i.id)}/advice`, `payment-advice-${i.invoiceNo}.pdf`)}
      onPayout={(invoiceIds, debitAccount) => write('/payroll/consultant-payouts', { invoiceIds, debitAccount })}
      onDownloadBatch={(b) => download(`/payroll/consultant-payouts/${id(b.id)}/file`, b.fileName)}
      onRelease={(b, confirmation) => write(`/payroll/consultant-payouts/${id(b)}/release`, { confirmation })}
      onResults={(b, rows) => write(`/payroll/consultant-payouts/${id(b)}/results`, { rows })}
    />
  );
}
