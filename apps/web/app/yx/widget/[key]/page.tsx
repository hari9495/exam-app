'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { API_BASE } from '../../../../lib/api-client';
import { portalSession } from '../../../../lib/yx-portal';

// SD-2.20: the help widget's frame (inside a company's own site, added by /yx-widget.js). It trusts only messages from
// the sites the widget allows, hands the company-signed visitor token to the API (which checks the site again), keeps
// the portal session in this frame's own storage and opens the outside help page. No token: public articles only, when
// the widget allows visitors who are not signed in.
interface WidgetConfig {
  company: string;
  orgSlug: string;
  portalSlug: string;
  allowedOrigins: string[];
  allowAnonymous: boolean;
}

export default function YxWidgetFrame() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/desk/widget/${encodeURIComponent(key)}`, { credentials: 'omit' })
      .then((r) => (r.ok ? (r.json() as Promise<WidgetConfig>) : Promise.reject(new Error('gone'))))
      .then(setConfig)
      .catch(() => setProblem('Help is not available here right now.'));
  }, [key]);

  useEffect(() => {
    if (!config) return;
    const open = () => router.replace(`/yx/portal/${encodeURIComponent(config.orgSlug)}/${encodeURIComponent(config.portalSlug)}`);
    const onMessage = async (e: MessageEvent) => {
      // Only the sites this widget runs on; anything else is ignored.
      if (!config.allowedOrigins.includes(e.origin)) return;
      const data = e.data as { type?: string; token?: string } | null;
      if (data?.type !== 'yx-identify' || typeof data.token !== 'string') return;
      const r = await fetch(`${API_BASE}/desk/widget/${encodeURIComponent(key)}/session`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: data.token, parentOrigin: e.origin }) });
      if (!r.ok) {
        // The help page takes only known customers (its sign-up is closed): say so plainly instead of "try again".
        const body = (await r.json().catch(() => null)) as { code?: string; message?: string } | null;
        setProblem(body?.code === 'WIDGET_SIGN_UP_CLOSED' && body.message ? body.message : 'We could not sign you in. Reload the page and try again.');
        return;
      }
      const s = (await r.json()) as { token: string; orgSlug: string; portalSlug: string };
      portalSession.set(s.orgSlug, s.portalSlug, s.token);
      open();
    };
    window.addEventListener('message', onMessage);
    // Tell the page we are ready (it then sends the visitor's token). The message carries nothing private.
    for (const origin of config.allowedOrigins) window.parent?.postMessage({ type: 'yx-widget-ready' }, origin);
    // Not signed in on the site: public help only, when allowed.
    const t = config.allowAnonymous ? window.setTimeout(open, 3000) : undefined;
    return () => {
      window.removeEventListener('message', onMessage);
      if (t) window.clearTimeout(t);
    };
  }, [config, key, router]);

  return (
    <main className="yx-auth__page" aria-busy={!problem}>
      {problem ? <p>{problem}</p> : <Spinner label={config ? `Opening ${config.company} help` : 'Loading'} size="md" />}
    </main>
  );
}
