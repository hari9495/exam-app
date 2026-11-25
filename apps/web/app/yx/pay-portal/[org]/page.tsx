'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlumniPortalScreen, NomineePortalScreen, PortalSignInScreen, type LiveAlumniPortal, type PayDocument } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';
import { otpSignIn } from '../../../../lib/yx-portal';
import { payPortalDocs, type PortalMe } from '../../../../lib/yx-portal-docs';

// Pay documents for former employees (7 years) and nominees (YX-DOC-16 / 19): a one-time code by email, then a
// 30-minute read-only session for that one person's documents. The session lives in this tab only (memory).
// The pages are the designed T9-02 sign-in, the former employee's tabs and the nominee's page, with their live paths.
export default function YxPayPortalPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/public/pay/${encodeURIComponent(org)}/portal`;
  const [session, setSession] = useState<{ token: string; email: string } | null>(null);
  const [me, setMe] = useState<PortalMe | null>(null);
  const [docs, setDocs] = useState<PayDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const headers = useCallback(() => ({ 'X-Pay-Portal': session?.token ?? '' }), [session]);
  useEffect(() => {
    if (!session) return;
    apiFetch(`${base}/me`, { headers: headers() })
      .then((x) => setMe(x as PortalMe))
      .catch(() => setSession(null));
    apiFetch(`${base}/documents`, { headers: headers() })
      .then((x) => setDocs(x as PayDocument[]))
      .catch((e: Error) => {
        setDocs([]);
        setLoadError(e.message);
      });
  }, [base, headers, session]);
  if (!session || !me)
    return (
      <PortalSignInScreen
        tenant={org}
        portal="Pay documents"
        footer={{ privacy: 'Privacy notice for former employees (G-09)' }}
        signIn={{ title: 'Sign in to your pay documents', intro: 'For people who have left, for 7 years, and for nominees HR has added. Read only.', live: otpSignIn(base, (token, email) => setSession({ token, email })) }}
      />
    );
  const live: LiveAlumniPortal = {
    company: me.company,
    name: me.name,
    email: session.email,
    lastDay: me.lastDay,
    accessUntil: me.accessUntil,
    today: new Date().toLocaleDateString('en-CA'),
    docs: docs && payPortalDocs(docs),
    loadError,
    onDownload: async (d) => {
      const { blob, filename } = await apiFetchBlob(`${base}/documents/${encodeURIComponent(d.id)}/file`, { headers: headers() });
      saveBlob(blob, filename ?? `${d.title}.pdf`);
    },
    onSignOut: () => {
      void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers() }).catch(() => undefined);
      setSession(null);
      setMe(null);
      setDocs(null);
    },
  };
  return me.nominee ? <NomineePortalScreen live={live} /> : <AlumniPortalScreen live={live} />;
}
