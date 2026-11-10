'use client';

import { NoAccessState, useToast } from '@yukthix/ui';
import { ContractorsScreen, type ContractorsData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { licenceForm, useClra, useClraDownload, useClraWrite } from '../../../../../lib/yx-contract-labour';

const enc = encodeURIComponent;

// Contract labour › Contractors (CL-1, CLB-01): the designed contractors register with `live`. Contractors are the
// vendor record (answer 623); licences and renewals count once verified (answer 627). Readers need the contractor key;
// the compliance owners (clra.contractor.manage) add and verify; never while acting for someone else. The API checks
// every rule again (docs/yukthix/contract-labour-design-map.md).
export default function YxContractorsPage() {
  const { toast } = useToast();
  const q = useClra<ContractorsData>('/contractors');
  const write = useClraWrite();
  const download = useClraDownload();
  const state = loadState(q);
  if (state === 'no-access') return <NoAccessState what="contractors" grantedBy="your HR team" />;
  return (
    <ContractorsScreen
      contractors={[]}
      establishments={[]}
      today={new Date()}
      live={{
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
        data: q.data ?? null,
        onRetry: () => void q.refetch(),
        onSaveContractor: (id, input) => (id ? write('PUT', `/contractors/${enc(id)}`, input) : write('POST', '/contractors', { ...input, active: undefined })),
        onAddLicence: (id, input, file) => write('POST', `/contractors/${enc(id)}/licences`, licenceForm({ ...input }, file)),
        onRenew: (id, input, file) => write('POST', `/licences/${enc(id)}/renewal`, licenceForm({ ...input }, file)),
        onVerify: (id) => write('POST', `/licences/${enc(id)}/verify`),
        onReject: (id, reason) => write('POST', `/licences/${enc(id)}/reject`, { reason }),
        onSaveWorkOrder: (contractorId, id, input) => (id ? write('PUT', `/contractors/${enc(contractorId)}/work-orders/${enc(id)}`, input) : write('POST', `/contractors/${enc(contractorId)}/work-orders`, input)),
        onOpenFile: (id) => void download(`/licences/${enc(id)}/file`, 'licence').catch((e: Error) => toast({ title: e.message })),
      }}
    />
  );
}
