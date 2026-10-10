'use client';

import { DocumentQueueScreen, type QueueDocument } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useDocumentDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Documents to verify (PPL-27; P05 Q7, YX-DOC-17): uploaded proofs waiting for HR. Files open only after the
// virus check; nobody verifies their own.
export default function YxDocumentQueuePage() {
  const queue = useLife<QueueDocument[]>('/documents/queue');
  const write = useLifeWrite();
  const download = useDocumentDownload();
  return (
    <DocumentQueueScreen
      state={loadState(queue)}
      onRetry={() => void queue.refetch()}
      rows={queue.data ?? null}
      onDownload={(d) => download(d.id, d.file?.name ?? 'document')}
      onDecide={(d, decision, reason) => write('POST', `/documents/${encodeURIComponent(d.id)}/decision`, { decision, reason, version: d.version })}
    />
  );
}
