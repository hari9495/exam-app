'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PortalSignInScreen, PreboardingPortalScreen, type PortalClosed, type PortalMe } from '@yukthix/ui/lifecycle';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';
import { otpSignIn } from '../../../../lib/yx-portal';

// The joining portal (T9-01, LIFE-2.01 / 2.02): a joiner signs in with a one-time code to their personal email, then
// works through the designed T9-01 checklist: forms (PAN, ID and bank after a fresh code), documents, background-check
// consent, letters to accept, the first day, and "Decline offer". A closed joining shows only its outcome. The session
// lives in this tab only (memory), never in storage.
export default function YxJoinPortalPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/portal/join/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [me, setMe] = useState<PortalMe | PortalClosed | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const headers = useCallback(() => ({ 'X-Join-Portal': token ?? '' }), [token]);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setMe((await apiFetch(`${base}/me`, { headers: headers() })) as PortalMe | PortalClosed);
      setState('ready');
    } catch (e) {
      if ((e as { status?: number }).status === 401) setToken(null);
      else setState('error');
    }
  }, [base, headers, token]);
  useEffect(() => {
    void load();
  }, [load]);
  const call = async (method: 'POST' | 'PUT', path: string, body?: unknown) => {
    try {
      const r = await apiFetch(`${base}${path}`, { method, headers: headers(), ...(body === undefined ? {} : body instanceof FormData ? { body } : { body: JSON.stringify(body) }) });
      await load();
      return r;
    } catch (e) {
      // The joining closed meanwhile (HR cancelled it, or it was joined): show the outcome.
      if ((e as { status?: number }).status === 409) await load();
      throw e;
    }
  };
  if (!token)
    return (
      <PortalSignInScreen
        tenant={org}
        portal="Your joining checklist"
        footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
        signIn={{
          title: 'Sign in to your joining checklist',
          intro: 'Use the personal email you gave HR. We send you a one-time code.',
          live: otpSignIn(base, (t, address) => {
            setState('loading');
            setMe(null);
            setEmail(address);
            setToken(t);
          }),
        }}
      />
    );
  return (
    <PreboardingPortalScreen
      live={{
        tenant: org,
        state,
        me,
        email,
        today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
        onRetry: () => void load(),
        onSignOut: () => {
          void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers() }).catch(() => undefined);
          setToken(null);
          setMe(null);
        },
        onSave: (section, value) => call('PUT', `/sections/${section}`, value),
        onStepUpCode: () => call('POST', '/step-up/code'),
        onStepUp: (code) => call('POST', '/step-up', { code }),
        onUpload: (typeKey, file) => {
          const form = new FormData();
          form.append('file', file);
          return call('POST', `/documents/${encodeURIComponent(typeKey)}`, form);
        },
        onBgv: (consent, noticeVersion) => call('POST', '/bgv-consent', { consent, noticeVersion }),
        onDownload: async (l, which) => {
          const { blob, filename } = await apiFetchBlob(`${base}/letters/${encodeURIComponent(l.id)}/file?which=${which}`, { headers: headers() });
          saveBlob(blob, filename ?? `${l.referenceNo ?? 'letter'}.pdf`);
        },
        onSignCode: (l) => call('POST', `/letters/${encodeURIComponent(l.id)}/sign/code`),
        onSign: (l, x) => call('POST', `/letters/${encodeURIComponent(l.id)}/sign`, x),
        onDecline: (x) => call('POST', '/decline', { reason: x.reason, ...(x.note ? { note: x.note } : {}) }),
      }}
    />
  );
}
