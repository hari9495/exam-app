'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlumniPortalScreen, PortalSignIn, type AlumniMe } from '@yukthix/ui/lifecycle';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';

// The alumni login (T9-02, LIFE-4.04): someone who left signs in with a one-time code to their personal email and
// downloads their own letters, read-only, for the company's alumni period. The session lives in this tab only.
// The page is the designed T9-02 portal with its live path.
export default function YxAlumniPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/portal/alumni/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [me, setMe] = useState<AlumniMe | null>(null);
  const headers = useCallback(() => ({ 'X-Alumni-Portal': token ?? '' }), [token]);
  useEffect(() => {
    if (!token) return;
    apiFetch(`${base}/me`, { headers: headers() })
      .then((x) => setMe(x as AlumniMe))
      .catch(() => setToken(null));
  }, [base, headers, token]);
  if (!token || !me)
    return (
      <PortalSignIn
        company={org}
        title="Your documents after leaving"
        intro="Sign in with your personal email. We send you a one-time code."
        onCode={(email) => apiFetch(`${base}/code`, { method: 'POST', body: JSON.stringify({ email }) })}
        onVerify={async (address, code) => {
          setToken(((await apiFetch(`${base}/verify`, { method: 'POST', body: JSON.stringify({ email: address, code }) })) as { token: string }).token);
          setEmail(address);
        }}
      />
    );
  return (
    <AlumniPortalScreen
      live={{
        data: me,
        email,
        today: new Date().toLocaleDateString('en-CA'),
        onDownload: async (l) => {
          const { blob, filename } = await apiFetchBlob(`${base}/letters/${encodeURIComponent(l.id)}/file`, { headers: headers() });
          saveBlob(blob, filename ?? `${l.referenceNo ?? 'letter'}.pdf`);
        },
        onSignOut: () => {
          void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers() }).catch(() => undefined);
          setToken(null);
          setMe(null);
        },
      }}
    />
  );
}
