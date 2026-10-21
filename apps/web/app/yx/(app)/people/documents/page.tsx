'use client';

import { useToast } from '@yukthix/ui';
import { DocumentVerificationQueue } from '@yukthix/ui/frame';
import type { QueueDocument } from '@yukthix/ui/lifecycle';
import { apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useDocumentDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { loadState } from '../../../../../lib/yx-org';

// People › Documents & letters › Document verification (PPL-27, design audit step 3; P05 Q7, YX-DOC-17): uploaded proofs
// waiting for HR. Files open only after the virus check and nobody verifies their own (the API checks both).
export default function YxDocumentQueuePage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const queue = useLife<QueueDocument[]>('/documents/queue');
  const write = useLifeWrite();
  const download = useDocumentDownload();
  return (
    <DocumentVerificationQueue
      rows={[]}
      live={{
        state: loadState(queue),
        onRetry: () => void queue.refetch(),
        rows: queue.data ?? [],
        loadFile: async (d) => {
          const { blob, filename } = await apiFetchBlob(`/documents/${encodeURIComponent(d.id)}/file`, {}, accessToken ?? undefined);
          return { url: URL.createObjectURL(blob), name: filename ?? d.file?.name ?? d.typeName, type: blob.type };
        },
        onDownload: (d) => void download(d.id, d.file?.name ?? 'document'),
        onDecide: async (d, decision, reason) => {
          await write('POST', `/documents/${encodeURIComponent(d.id)}/decision`, { decision, reason, version: d.version });
          toast({ tone: 'success', title: decision === 'verify' ? `${d.person ? `${d.person}'s ${d.typeName}` : d.typeName} verified` : `${d.typeName} sent back to ${d.person ?? 'the person'}` });
        },
      }}
    />
  );
}
