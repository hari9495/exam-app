'use client';

import { ClientPacksScreen, type ClientPacksData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { useClra, useClraDownload, useClraWrite } from '../../../../../lib/yx-contract-labour';
import { todayIndia } from '../../../../../lib/yx-time';

const enc = encodeURIComponent;
const lastMonths = (n: number) => {
  const now = todayIndia();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${now.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1 - i);
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  });
};

// We are the contractor › Client compliance packs (CLB-08, CL-8, answer 639): a finished month's wage register and
// muster for the employees placed at a client site, from approved payroll and attendance. The upload to the client's
// portal is done by hand and recorded here (day, reference, acknowledgement); there is no portal integration.
export default function YxClientPacksPage() {
  const q = useClra<ClientPacksData>('/client-packs');
  const write = useClraWrite();
  const download = useClraDownload();
  const form = (fields: Record<string, string>, file: File | null) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (file) f.append('file', file);
    return f;
  };
  return (
    <ClientPacksScreen
      packs={[]}
      live={{
        state: loadState(q),
        onRetry: () => void q.refetch(),
        data: q.data ?? null,
        months: lastMonths(6),
        onMake: (clientSiteId, month, reason) => write('POST', '/client-packs', { clientSiteId, month, ...(reason ? { reason } : {}) }),
        onDownload: (id) => download(`/client-packs/${enc(id)}/file`, 'client-pack.zip'),
        onUpload: (id, input, file) => write('POST', `/client-packs/${enc(id)}/upload`, form(input, file)),
        onAcknowledge: (id, file) => write('POST', `/client-packs/${enc(id)}/acknowledgement`, form({}, file)),
      }}
    />
  );
}
