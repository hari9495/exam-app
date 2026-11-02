import type { Form12bInput, LiveTax, MyCertificate, MyDeclarations, MyForm12b, MyTaxSheet, MyTaxWorkspace, RegimeComparison, ResidencyInput, TaxTab } from '@yukthix/ui/pay';
import { payState, usePayDownload } from './yx-pay';
import { useApi, useApiWrite } from './yx-pay-5j';

// The employee's tax workspace (PAY-22 with PAY-41 inside): Me › Tax opens on Overview, Me › Tax declarations on
// Declarations. Every call is the person's own (/tax/me/*); the API checks it again.
export function useLiveTax(tab: TaxTab): LiveTax {
  const ws = useApi<MyTaxWorkspace>('/tax/me/workspace');
  const sheet = useApi<MyTaxSheet>('/tax/me/tax-sheet');
  const decl = useApi<MyDeclarations>('/tax/me/declarations');
  const certificates = useApi<MyCertificate[]>('/tax/me/certificates');
  const form12b = useApi<MyForm12b>('/tax/me/form12b');
  const write = useApiWrite();
  const download = usePayDownload();
  const file = (f: File | null, fields: Record<string, string | undefined> = {}) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
    if (f) form.append('file', f);
    return form;
  };
  return {
    tab,
    state: payState(ws, decl),
    onRetry: () => void Promise.all([ws.refetch(), sheet.refetch(), decl.refetch(), certificates.refetch(), form12b.refetch()]),
    workspace: ws.data ?? null,
    sheet: sheet.data ?? null,
    declarations: decl.data ?? null,
    certificates: certificates.data ?? null,
    form12b: form12b.data ?? null,
    // PAY-41: the what-if rent and home loan interest go with the comparison (never saved).
    onCompare: (whatIf) => write<RegimeComparison>('/tax/me/regime-compare', whatIf ?? {}),
    onPatch: (x) => write('/tax/me/workspace', x, 'PATCH'),
    onDeclare: (line) => write('/tax/me/declarations', { lines: [line] }),
    onProof: (lineId, f) => write(`/tax/me/proofs/${encodeURIComponent(lineId)}`, file(f)),
    onPartA: (c) => download(`/tax/me/certificates/${encodeURIComponent(c.id)}/part-a`, `${c.form}-part-a-${c.taxYear}.pdf`),
    onForm12b: (x: Form12bInput, f: File) => write('/tax/me/form12b', file(f, { ...x })),
    // Founder answers 2 and 3: both wait for payroll; the workspace shows them as pending.
    onRegimeRequest: (x) => write('/tax/me/regime-request', x),
    onResidency: (x: ResidencyInput, f: File | null) =>
      write('/tax/me/residency', file(f, { residentialStatus: x.residentialStatus, trcValidTo: x.trcValidTo, dtaaCountry: x.dtaaCountry, form10fFiled: x.form10fFiled === undefined ? undefined : String(x.form10fFiled) })),
  };
}
