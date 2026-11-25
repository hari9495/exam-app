'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlumniPortalScreen, NomineePortalScreen, PortalSignInScreen, type AlumniMe, type LiveAlumniPortal, type LivePortalDoc } from '@yukthix/ui/lifecycle';
import type { PayDocument } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';
import { otpSignIn } from '../../../../lib/yx-portal';
import { payPortalDocs } from '../../../../lib/yx-portal-docs';

// The alumni login (T9-02, LIFE-4.04): someone who left signs in with a one-time code to their personal email and
// downloads their own letters, payslips and Form 16, read-only. Letters stay for the company's alumni period; payslips
// and Form 16 follow the pay documents portal's own rules (7 years). The session lives in this tab only.
// The pages are the designed T9 sign-in and T9-02 portal (the nominee page for a payee) with their live paths.
export default function YxAlumniPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/portal/alumni/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [me, setMe] = useState<AlumniMe | null>(null);
  const [pay, setPay] = useState<PayDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const headers = useCallback(() => ({ 'X-Alumni-Portal': token ?? '' }), [token]);
  useEffect(() => {
    if (!token) return;
    apiFetch(`${base}/me`, { headers: headers() })
      .then((x) => setMe(x as AlumniMe))
      .catch(() => setToken(null));
    apiFetch(`${base}/pay-documents`, { headers: headers() })
      .then((x) => setPay(x as PayDocument[]))
      .catch(() => {
        setPay([]);
        setLoadError('Payslips and Form 16 could not load. Sign out and in again, or try later.');
      });
  }, [base, headers, token]);
  if (!token || !me)
    return (
      <PortalSignInScreen
        tenant={org}
        portal="Former employee documents"
        footer={{ privacy: 'Privacy notice for former employees (G-09)' }}
        signIn={{
          title: 'Your documents after leaving',
          intro: 'Sign in with your personal email. We send you a one-time code.',
          live: otpSignIn(base, (t, address) => {
            setToken(t);
            setEmail(address);
          }),
        }}
      />
    );
  const letters: LivePortalDoc[] = me.letters.map((l) => ({ id: l.id, kind: 'Letter', title: l.title.split(': ')[0] ?? l.title, issuedOn: (l.issuedAt ?? me.lastDay).slice(0, 10) }));
  const live: LiveAlumniPortal = {
    company: me.company,
    name: me.name,
    email,
    lastDay: me.lastDay,
    accessUntil: me.accessUntil,
    today: new Date().toLocaleDateString('en-CA'),
    docs: pay && [...payPortalDocs(pay), ...letters],
    loadError,
    onDownload: async (d) => {
      const letter = me.letters.find((l) => l.id === d.id);
      const path = letter ? `/letters/${encodeURIComponent(d.id)}/file` : `/pay-documents/${encodeURIComponent(d.id)}/file`;
      const { blob, filename } = await apiFetchBlob(`${base}${path}`, { headers: headers() });
      saveBlob(blob, filename ?? `${letter?.referenceNo ?? d.title}.pdf`);
    },
    onSignOut: () => {
      void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers() }).catch(() => undefined);
      setToken(null);
      setMe(null);
      setPay(null);
    },
  };
  return me.nominee ? <NomineePortalScreen live={live} /> : <AlumniPortalScreen live={live} />;
}
