'use client';

import { ClientEstablishmentsScreen, type ClientSitesData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { useClra, useClraWrite } from '../../../../../lib/yx-contract-labour';

// We are the contractor › Client establishments (CLB-06, CL-8, answer 638): the staffing clients' sites where our
// employees work, each with the client's registration number. The designed screen with `live`.
export default function YxClientSitesPage() {
  const q = useClra<ClientSitesData>('/client-sites');
  const write = useClraWrite();
  return <ClientEstablishmentsScreen clients={[]} live={{ state: loadState(q), onRetry: () => void q.refetch(), data: q.data ?? null, onAdd: (input) => write('POST', '/client-sites', input) }} />;
}
