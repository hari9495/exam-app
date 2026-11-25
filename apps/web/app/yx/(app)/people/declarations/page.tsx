'use client';

import { useToast } from '@yukthix/ui';
import { DisabilityDeclaration } from '@yukthix/ui/frame';
import { usePeople } from '../../../../../lib/yx-people';
import { useDocumentDownload, useLifeWrite } from '../../../../../lib/yx-lifecycle';

interface Row {
  employeeId: string;
  name: string;
  category: string;
  percent: number;
  validUntil: string | null;
  verified: boolean;
  expiringSoon: boolean;
  certificate: { id: string; status: string; version: number } | null;
}

// People › Declarations (PPL-38): disability declarations for the HR diversity role (Special; each look recorded). The
// role opens each certificate (a recorded look), verifies it, or rejects it with a reason the person sees.
export default function YxDeclarationsPage() {
  const { toast } = useToast();
  const list = usePeople<{ rows: Row[] }>('/disability-declarations');
  const download = useDocumentDownload();
  const write = useLifeWrite();
  const row = (employeeId: string) => list.data?.rows.find((r) => r.employeeId === employeeId);
  const decide = async (employeeId: string, decision: 'verify' | 'reject', reason?: string) => {
    const r = row(employeeId);
    if (!r?.certificate) return;
    await write('POST', `/documents/${encodeURIComponent(r.certificate.id)}/decision`, { decision, version: r.certificate.version, ...(reason ? { reason } : {}) });
    await list.refetch();
    toast({ tone: 'success', title: decision === 'verify' ? `${r.name}'s certificate verified` : `${r.name}'s certificate rejected; they are asked to upload it again` });
  };
  return (
    <DisabilityDeclaration
      persona="hr"
      liveList={{
        state: list.isError ? 'error' : list.data ? 'ready' : 'loading',
        onRetry: () => void list.refetch(),
        rows: (list.data?.rows ?? []).map((r) => ({ ...r, validUntil: r.validUntil ? new Date(`${r.validUntil}T00:00:00`) : null })),
        onOpen: (employeeId) => {
          const r = row(employeeId);
          if (r?.certificate) void download(r.certificate.id, `${r.name} disability certificate`).catch((e: Error) => toast({ tone: 'error', title: 'The certificate did not open', description: e.message }));
        },
        onVerify: (employeeId) => decide(employeeId, 'verify').catch((e: Error) => void toast({ tone: 'error', title: 'Not verified', description: e.message })),
        onReject: (employeeId, reason) => decide(employeeId, 'reject', reason),
      }}
    />
  );
}
