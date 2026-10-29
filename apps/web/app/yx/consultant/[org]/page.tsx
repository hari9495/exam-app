'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ConsultantPortalScreen, PortalSignInScreen, type ConsultantMe, type LoadState } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';
import { otpSignIn } from '../../../../lib/yx-portal';

// The consultant's own page (PAY-8.01): a one-time code by email, then a 30-minute session that sees only their own
// invoices, payment advices and TDS certificates. The session lives in this tab only (memory). Founder answer 9 (30 Oct
// 2026): a call answered 401 part-way (the session ended) shows "sign in again"; a failed load shows the error with
// Retry, a refusal (403) no access.
export default function YxConsultantPortalPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/public/consultant/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<ConsultantMe | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [ended, setEnded] = useState(false);
  const headers = (t: string) => ({ 'X-Consultant-Portal': t });
  /** Any call: a 401 means the session ended (the page says so); the error still reaches the caller. */
  const guard = async <T,>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (e) {
      if ((e as { status?: number }).status === 401) setEnded(true);
      throw e;
    }
  };
  const load = async (t: string) => {
    setState('loading');
    try {
      setMe((await guard(() => apiFetch(`${base}/me`, { headers: headers(t) }))) as ConsultantMe);
      setState('ready');
    } catch (e) {
      setState((e as { status?: number }).status === 403 ? 'no-access' : 'error');
    }
  };
  const file = async (path: string, name: string) => {
    const { blob, filename } = await guard(() => apiFetchBlob(`${base}${path}`, { headers: headers(token!) }));
    saveBlob(blob, filename ?? name);
  };
  const restart = () => {
    setToken(null);
    setMe(null);
    setEnded(false);
    setState('loading');
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
            setToken(t);
            await load(t);
          }),
        }}
      />
    );
  return (
    <ConsultantPortalScreen
      live={{
        tenant: org,
        data: me,
        state,
        onRetry: () => void load(token),
        ended,
        onSignInAgain: restart,
        onUpload: async (x, pdf) => {
          const form = new FormData();
          for (const [k, v] of Object.entries(x)) if (v !== undefined) form.append(k, String(v));
          form.append('file', pdf);
          await guard(() => apiFetch(`${base}/invoices`, { method: 'POST', body: form, headers: headers(token) }));
          await load(token);
        },
        onAdvice: (i) => file(`/invoices/${encodeURIComponent(i.id)}/advice`, `payment-advice-${i.invoiceNo}.pdf`),
        onCertificate: (c) => file(`/certificates/${encodeURIComponent(c.id)}/file`, `${c.form}-${c.taxYear}-q${c.quarter}.pdf`),
        onSignOut: () => {
          void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers(token) }).catch(() => undefined);
          restart();
        },
      }}
    />
  );
}
