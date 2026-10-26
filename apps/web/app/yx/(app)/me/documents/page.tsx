'use client';

import { MyDocuments, type MyLetter, type MyPayDocument } from '@yukthix/ui/frame';
import type { MyDocuments as MyUploads } from '@yukthix/ui/lifecycle';
import { API_BASE } from '../../../../../lib/api-client';
import { loadState } from '../../../../../lib/yx-org';
import { useDocumentDownload, useLetterDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { usePay, usePayDownload, verifyUrl } from '../../../../../lib/yx-pay';

interface DocType {
  key: string;
  name: string;
  expiryTracked: boolean;
  uploadBy: string[];
}

// Me › Documents and letters (PPL-30): my uploads, the letters issued to me (accepted with a one-time code), my pay
// documents, the way to Request a certificate (PPL-31, P05 Q8) and expiring share links. My letters lives here now.
export default function YxMyDocumentsPage() {
  const uploads = useLife<MyUploads & { personId: string | null }>('/documents/me');
  const letters = useLife<{ letters: MyLetter[]; esignAccepted: boolean }>('/letters/me');
  const pay = usePay<MyPayDocument[]>('/me/documents');
  const types = useLife<DocType[]>('/documents/types');
  const shares = useLife<{ id: string; source: string; sourceId: string }[]>('/documents/shares');
  const downloadUpload = useDocumentDownload();
  const downloadLetter = useLetterDownload();
  const downloadPay = usePayDownload();
  const write = useLifeWrite();
  const state = loadState(uploads, letters, pay, shares);
  return (
    <MyDocuments
      rows={[]}
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void Promise.all([uploads.refetch(), letters.refetch(), pay.refetch(), shares.refetch()]),
        uploads: uploads.data?.documents ?? [],
        letters: letters.data?.letters ?? [],
        pay: pay.data ?? [],
        esignAccepted: letters.data?.esignAccepted ?? false,
        uploadTypes: (types.data ?? []).filter((t) => t.uploadBy.includes('person')),
        shares: shares.data ?? [],
        onDownload: (d, which) =>
          d.kind === 'upload'
            ? downloadUpload(d.doc.id, d.doc.file?.name ?? `${d.doc.typeKey}.pdf`)
            : d.kind === 'letter'
              ? downloadLetter(d.letter.id, which ?? 'letter', `${d.letter.referenceNo ?? 'letter'}.pdf`)
              : downloadPay(`/payroll/documents/${encodeURIComponent(d.doc.id)}/file`, `${d.doc.referenceNo}.pdf`),
        onUpload: (typeKey, file, expiresOn) => {
          const form = new FormData();
          form.append('file', file);
          if (expiresOn) form.append('expiresOn', expiresOn);
          return write('POST', `/documents/people/${encodeURIComponent(uploads.data?.personId ?? '')}/${encodeURIComponent(typeKey)}`, form);
        },
        certificateHref: '/yx/me/documents/certificate',
        onShare: async (source, id, days) => {
          const s = await write<{ path: string }>('POST', '/documents/shares', { source, id, days });
          return new URL(`${API_BASE}${s.path}`, window.location.origin).href;
        },
        onStopSharing: (ids) => Promise.all(ids.map((id) => write('POST', `/documents/shares/${encodeURIComponent(id)}/revoke`))),
        onSignCode: (l) => write('POST', `/letters/${encodeURIComponent(l.id)}/sign/code`),
        onSign: (l, x) => write('POST', `/letters/${encodeURIComponent(l.id)}/sign`, x),
        verifyUrl,
      }}
    />
  );
}
