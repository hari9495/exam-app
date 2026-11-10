'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PortalSignInScreen } from '@yukthix/ui/hiring';
import { ContractorPortalScreen, type LiveContractorPortal, type LiveContractorTab } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../lib/api-client';
import { otpSignIn } from '../../../../lib/yx-portal';

const TABS: LiveContractorTab[] = ['establishments', 'workers', 'packs', 'bills'];

// T9-13 contractor portal (CL-3, answer 631): a contractor's contact the compliance owner invited signs in with a
// one-time code by email; the session (this tab only) sees only their own contractor's licences, work orders, workers
// and gate passes, sends a worker for site approval (the company's checks, no override) and uploads a licence renewal
// (checked by the company before it counts). A call answered 401 part-way (the session ended) shows "sign in again".
export default function YxContractorPortalPage() {
  const { org } = useParams<{ org: string }>();
  const params = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as LiveContractorTab) ? params.get('tab') : 'establishments') as LiveContractorTab;
  const base = `/public/contractor-portal/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<LiveContractorPortal['data']>(null);
  const [state, setState] = useState<LiveContractorPortal['state']>('loading');
  const [ended, setEnded] = useState(false);
  const [packs, setPacks] = useState<LiveContractorPortal['packs']>([]);
  const [pack, setPack] = useState<LiveContractorPortal['pack']>(null);
  const [open, setOpen] = useState<{ siteId: string; month: string } | null>(null);
  const [bills, setBills] = useState<LiveContractorPortal['bills']>(null);
  const call = async <T,>(path: string, t: string, init: RequestInit = {}): Promise<T> => {
    try {
      return (await apiFetch(`${base}${path}`, { ...init, headers: { 'X-Contractor-Portal': t } })) as T;
    } catch (e) {
      if ((e as { status?: number }).status === 401) setEnded(true);
      throw e;
    }
  };
  const load = async (t: string) => {
    setState('loading');
    try {
      setData(await call<LiveContractorPortal['data']>('/me', t));
      setPacks(await call<NonNullable<LiveContractorPortal['packs']>>('/packs', t));
      setBills(await call<NonNullable<LiveContractorPortal['bills']>>('/bills', t));
      setState('ready');
    } catch {
      setState('error');
    }
  };
  if (!token)
    return (
      <PortalSignInScreen
        tenant={org}
        portal="Contractor portal"
        footer={{ privacy: 'Privacy notice for contract-labour vendors (G-09)' }}
        signIn={{
          title: 'Sign in to the contractor portal',
          intro: 'Use the email the company invited. We send you a one-time code.',
          live: otpSignIn(base, async (t) => {
            setToken(t);
            await load(t);
          }),
        }}
      />
    );
  return (
    <ContractorPortalScreen
      live={{
        tenant: org,
        tab,
        hrefFor: (t) => `?tab=${t}`,
        state,
        onRetry: () => void load(token),
        ended,
        onSignInAgain: () => (setToken(null), setData(null), setEnded(false)),
        onSignOut: () => {
          void call('/sign-out', token, { method: 'POST' }).catch(() => undefined);
          setToken(null);
          setData(null);
        },
        data,
        onCheck: async (input) => (await call<{ checks: Awaited<ReturnType<LiveContractorPortal['onCheck']>> }>('/workers/check', token, { method: 'POST', body: JSON.stringify(input) })).checks,
        onAdd: async (input) => {
          await call('/workers', token, { method: 'POST', body: JSON.stringify(input) });
          await load(token);
        },
        packs,
        pack,
        bills,
        onOpenPack: (p) => {
          setOpen(p ? { siteId: p.site.id, month: p.month } : null);
          if (!p) return setPack(null);
          void call<NonNullable<LiveContractorPortal['pack']>>(`/pack?locationId=${encodeURIComponent(p.site.id)}&month=${encodeURIComponent(p.month)}`, token).then(setPack, () => undefined);
        },
        onUpload: async (input, file) => {
          if (!open) return;
          const body = new FormData();
          body.append('locationId', open.siteId);
          body.append('month', open.month);
          body.append('kind', input.kind);
          if (input.workersCovered !== undefined) body.append('workersCovered', String(input.workersCovered));
          if (input.amount !== undefined) body.append('amount', input.amount);
          if (input.lines) body.append('lines', JSON.stringify(input.lines));
          body.append('file', file);
          await call('/pack/items', token, { method: 'POST', body });
          setPack(await call<NonNullable<LiveContractorPortal['pack']>>(`/pack?locationId=${encodeURIComponent(open.siteId)}&month=${encodeURIComponent(open.month)}`, token));
          await load(token);
        },
        onWithdraw: async (id, reason) => {
          await call(`/workers/${encodeURIComponent(id)}/withdraw`, token, { method: 'POST', body: JSON.stringify({ reason }) });
          await load(token);
        },
        onMinWage: (locationId, skill) => call(`/min-wage?locationId=${encodeURIComponent(locationId)}&skill=${encodeURIComponent(skill)}`, token),
        onRenew: async (licenceId, input, file) => {
          const body = new FormData();
          for (const [k, v] of Object.entries(input)) if (v !== null && v !== undefined) body.append(k, String(v));
          body.append('file', file);
          await call(`/licences/${encodeURIComponent(licenceId)}/renewal`, token, { method: 'POST', body });
          await load(token);
        },
      }}
    />
  );
}
