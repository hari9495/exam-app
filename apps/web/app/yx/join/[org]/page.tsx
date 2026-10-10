'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PortalScreen, PortalSignIn, type PortalMe } from '@yukthix/ui/lifecycle';
import type { LoadState } from '@yukthix/ui/org';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { saveBlob } from '../../../../lib/yx-pay';

// The joining portal (T9-01, LIFE-2.01 / 2.02): a joiner signs in with a one-time code to their personal email and fills
// in their forms, sends documents, gives background-check consent and accepts letters. The session lives in this tab
// only (memory), never in storage.
export default function YxJoinPortalPage() {
  const { org } = useParams<{ org: string }>();
  const base = `/portal/join/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<PortalMe | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const headers = useCallback(() => ({ 'X-Join-Portal': token ?? '' }), [token]);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setMe((await apiFetch(`${base}/me`, { headers: headers() })) as PortalMe);
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
    const r = await apiFetch(`${base}${path}`, { method, headers: headers(), ...(body === undefined ? {} : body instanceof FormData ? { body } : { body: JSON.stringify(body) }) });
    await load();
    return r;
  };
  if (!token)
    return (
      <PortalSignIn
        company={org}
        onCode={(email) => apiFetch(`${base}/code`, { method: 'POST', body: JSON.stringify({ email }) })}
        onVerify={async (email, code) => {
          const s = (await apiFetch(`${base}/verify`, { method: 'POST', body: JSON.stringify({ email, code }) })) as { token: string };
          setState('loading');
          setToken(s.token);
        }}
      />
    );
  return (
    <PortalScreen
      state={state}
      onRetry={() => void load()}
      data={me}
      onSave={(section, value) => call('PUT', `/sections/${section}`, value)}
      onStepUpCode={() => call('POST', '/step-up/code')}
      onStepUp={(code) => call('POST', '/step-up', { code })}
      onUpload={(typeKey, file) => {
        const form = new FormData();
        form.append('file', file);
        return call('POST', `/documents/${encodeURIComponent(typeKey)}`, form);
      }}
      onBgv={(consent, noticeVersion) => call('POST', '/bgv-consent', { consent, noticeVersion })}
      onDownload={async (l, which) => {
        const { blob, filename } = await apiFetchBlob(`${base}/letters/${encodeURIComponent(l.id)}/file?which=${which}`, { headers: headers() });
        saveBlob(blob, filename ?? `${l.referenceNo ?? 'letter'}.pdf`);
      }}
      onSignCode={(l) => call('POST', `/letters/${encodeURIComponent(l.id)}/sign/code`)}
      onSign={(l, x) => call('POST', `/letters/${encodeURIComponent(l.id)}/sign`, x)}
      onSignOut={() => {
        void apiFetch(`${base}/sign-out`, { method: 'POST', headers: headers() }).catch(() => undefined);
        setToken(null);
        setMe(null);
      }}
    />
  );
}
