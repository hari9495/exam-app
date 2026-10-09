'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MyPayDocumentsScreen, PayPortalSignIn, type PayDocument } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob, verifyUrl } from '../../../../lib/yx-pay';

// Pay documents for former employees (7 years) and nominees (YX-DOC-16 / 19): a one-time code by email, then a
// 30-minute read-only session for that one person's documents. The session lives in this tab only (memory).
export default function YxPayPortalPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/public/pay/${encodeURIComponent(org)}/portal`;
  const [token, setToken] = useState<string | null>(null);
  const [docs, setDocs] = useState<PayDocument[] | null>(null);
  const headers = (t: string) => ({ 'X-Pay-Portal': t });
  if (!token)
    return (
      <PayPortalSignIn
        company={org}
        onSendCode={(email) => apiFetch(`${base}/code`, { method: 'POST', body: JSON.stringify({ email }) })}
        onVerify={async (email, code) => {
          const s = (await apiFetch(`${base}/verify`, { method: 'POST', body: JSON.stringify({ email, code }) })) as { token: string };
          setDocs((await apiFetch(`${base}/documents`, { headers: headers(s.token) })) as PayDocument[]);
          setToken(s.token);
        }}
      />
    );
  return (
    <MyPayDocumentsScreen
      title="Your pay documents"
      state={docs ? 'ready' : 'loading'}
      data={docs}
      verifyUrl={verifyUrl}
      onDownload={async (d) => {
        const { blob, filename } = await apiFetchBlob(`${base}/documents/${encodeURIComponent(d.id)}/file`, { headers: headers(token) });
        saveBlob(blob, filename ?? `${d.referenceNo}.pdf`);
      }}
    />
  );
}
