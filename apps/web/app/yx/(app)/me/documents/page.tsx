'use client';

import { MyDocumentsScreen, type MyDocuments } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useDocumentDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › My documents (PPL-30) and the instant employment certificate (PPL-31, P05 Q8).
export default function YxMyDocumentsPage() {
  const data = useLife<MyDocuments & { personId: string | null }>('/documents/me');
  const download = useDocumentDownload();
  const write = useLifeWrite();
  return (
    <MyDocumentsScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      onDownload={(d) => download(d.id, `${d.typeKey}.pdf`)}
      onUpload={(d, file) => {
        const form = new FormData();
        form.append('file', file);
        return write('POST', `/documents/people/${encodeURIComponent(data.data?.personId ?? '')}/${encodeURIComponent(d.typeKey)}`, form);
      }}
      onCertificate={() => write('POST', '/letters/me/certificates', { letterType: 'employment_certificate' })}
      lettersHref="/yx/me/letters"
    />
  );
}
