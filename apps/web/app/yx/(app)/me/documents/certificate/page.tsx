'use client';

import { useEffect, useRef } from 'react';
import { CertificateRequest, type MyCertificateKind } from '@yukthix/ui/frame';
import type { Letter } from '@yukthix/ui/lifecycle';
import { API_BASE, apiFetchBlob } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { loadState } from '../../../../../../lib/yx-org';
import { useLetterDownload, useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

// Me › Documents and letters › Request a certificate (PPL-31): the kinds the company switched on, made at once with a
// number and QR code, or sent to HR first (the decision reaches the bell). The API checks it is my own, every time.
export default function YxCertificateRequestPage() {
  const { accessToken } = useAuth();
  const kinds = useLife<MyCertificateKind[]>('/letters/me/certificates');
  const write = useLifeWrite();
  const download = useLetterDownload();
  const shown = useRef<string | null>(null);
  useEffect(() => () => void (shown.current && URL.revokeObjectURL(shown.current)), []);
  return (
    <CertificateRequest
      today={new Date()}
      live={{
        state: loadState(kinds),
        onRetry: () => void kinds.refetch(),
        kinds: kinds.data ?? [],
        backHref: '/yx/me/documents',
        onRequest: (x) => write<Letter>('POST', '/letters/me/certificates', x),
        onOpen: async (l) => {
          const { blob } = await apiFetchBlob(`/letters/${encodeURIComponent(l.id)}/file?which=letter`, {}, accessToken ?? undefined);
          if (shown.current) URL.revokeObjectURL(shown.current);
          return (shown.current = URL.createObjectURL(blob));
        },
        onDownload: (l) => download(l.id, 'letter', `${l.referenceNo ?? 'certificate'}.pdf`),
        onShare: async (source, id, days) => {
          const s = await write<{ path: string }>('POST', '/documents/shares', { source, id, days });
          return new URL(`${API_BASE}${s.path}`, window.location.origin).href;
        },
      }}
    />
  );
}
