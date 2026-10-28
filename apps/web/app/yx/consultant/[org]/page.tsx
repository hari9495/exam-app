'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ConsultantPortalScreen, PortalSignInScreen, type ConsultantMe } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';
import { otpSignIn } from '../../../../lib/yx-portal';

// The consultant's own page (PAY-8.01): a one-time code by email, then a 30-minute session that sees only their own
// invoices, payment advices and TDS certificates. The session lives in this tab only (memory).
export default function YxConsultantPortalPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/public/consultant/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<ConsultantMe | null>(null);
  const headers = (t: string) => ({ 'X-Consultant-Portal': t });
  const load = async (t: string) => setMe((await apiFetch(`${base}/me`, { headers: headers(t) })) as ConsultantMe);
  const file = async (path: string, name: string) => {
    const { blob, filename } = await apiFetchBlob(`${base}${path}`, { headers: headers(token!) });
    saveBlob(blob, filename ?? name);
  };
  if (!token)
    return (
      <PortalSignInScreen
        tenant={org}
        portal="Consultants"
        footer={{ privacy: 'Privacy notice for consultants (G-09)' }}
        signIn={{
          title: 'Consultants: your invoices',
          intro: 'For consultants the company pays. Use the email the company has for you.',
          live: otpSignIn(base, async (t) => {
            await load(t);
            setToken(t);
          }),
        }}
      />
    );
  return (
    <ConsultantPortalScreen
      data={me}
      onUpload={async (x, pdf) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(x)) if (v !== undefined) form.append(k, String(v));
        form.append('file', pdf);
        await apiFetch(`${base}/invoices`, { method: 'POST', body: form, headers: headers(token) });
        await load(token);
      }}
      onAdvice={(i) => file(`/invoices/${encodeURIComponent(i.id)}/advice`, `payment-advice-${i.invoiceNo}.pdf`)}
      onCertificate={(c) => file(`/certificates/${encodeURIComponent(c.id)}/file`, `${c.form}-${c.taxYear}-q${c.quarter}.pdf`)}
      onSignOut={() => {
        void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers(token) }).catch(() => undefined);
        setToken(null);
        setMe(null);
      }}
    />
  );
}
