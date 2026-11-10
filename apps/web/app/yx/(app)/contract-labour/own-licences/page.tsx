'use client';

import { OwnLicencesScreen, type OwnLicencesData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { licenceForm, useClra, useClraWrite } from '../../../../../lib/yx-contract-labour';

// We are the contractor › Own licences (CLB-07, CL-8): our legal entity's contractor licences, per client site or a
// single licence for states. A placement past the maximum is blocked in Staffing › Placements.
export default function YxOwnLicencesPage() {
  const q = useClra<OwnLicencesData>('/own-licences');
  const write = useClraWrite();
  return <OwnLicencesScreen licences={[]} today={new Date()} live={{ state: loadState(q), onRetry: () => void q.refetch(), data: q.data ?? null, onAdd: (input, file) => write('POST', '/own-licences', licenceForm({ ...input }, file)) }} />;
}
