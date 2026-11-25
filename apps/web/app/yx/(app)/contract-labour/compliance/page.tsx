'use client';

import { useState } from 'react';
import { NoAccessState, useToast } from '@yukthix/ui';
import { VendorComplianceScreen, type VendorComplianceData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { useClra, useClraDownload, useClraWrite } from '../../../../../lib/yx-contract-labour';

const enc = encodeURIComponent;

// Contract labour › Vendor compliance (CL-4, CLB-03): the designed tracker with `live`. Each contractor's monthly proofs
// per site, the wage check against the minimum wage (verify), liability alerts, and the hold on the contractor's bills.
// The compliance owners verify, raise discrepancies, release a held month with a reason and record wages paid by us
// (taken off the next PAY 8 bill); readers and finance see it all. The API checks every rule again.
export default function YxVendorCompliancePage() {
  const { toast } = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const q = useClra<VendorComplianceData>(`/compliance${month ? `?month=${enc(month)}` : ''}`);
  const write = useClraWrite();
  const download = useClraDownload();
  const state = loadState(q);
  if (state === 'no-access') return <NoAccessState what="vendor compliance" grantedBy="your HR team" />;
  return (
    <VendorComplianceScreen
      month=""
      proofTypes={[]}
      matrix={[]}
      alerts={[]}
      live={{
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
        data: q.data ?? null,
        onRetry: () => void q.refetch(),
        onMonth: setMonth,
        onVerify: (id, version) => write('POST', `/compliance/proofs/${enc(id)}/verify`, { version }),
        onDiscrepancy: (id, version, note) => write('POST', `/compliance/proofs/${enc(id)}/discrepancy`, { version, note }),
        onOpenFile: (id) => void download(`/compliance/proofs/${enc(id)}/file`, 'proof').catch((e: Error) => toast({ title: e.message })),
        onRelease: (contractorId, m, reason) => write('POST', '/compliance/holds/release', { contractorId, month: m, reason }),
        onPayByUs: (input) => write('POST', '/compliance/direct-payments', input),
      }}
    />
  );
}
