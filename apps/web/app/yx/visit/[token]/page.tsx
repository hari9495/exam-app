'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { VisitorInviteScreen, type PublicVisitView } from '@yukthix/ui/visitors';
import { publicGet, publicPost } from '../../../../lib/yx-careers';

const EMPTY = { visitor: '', mobile: '', company: '', purpose: '', host: '', location: '', address: '', window: { from: new Date(0), to: new Date(0) }, passCode: '', rules: { idRequired: false, photoRequired: false, safetyInduction: false, nda: false, escort: false, hours: '' } };

// T9-14 the visitor's pass page (Visitors slice 1): the link in the invite email. Public; the token is the only key.
// Details (mobile masked), the ID type and last 4 where the location takes ID (slice 3), the visitor notice (accepted at
// its version), then the QR pass for reception.
export default function YxVisitPassPage() {
  const { token } = useParams<{ token: string }>();
  const [visit, setVisit] = useState<PublicVisitView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const load = () => {
    setState('loading');
    void publicGet<PublicVisitView>(`/visits/${encodeURIComponent(token)}`).then((v) => {
      setVisit(v);
      setState(v ? 'ready' : 'not-found');
    });
  };
  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <VisitorInviteScreen
      key={visit ? `${visit.state}-${visit.passCode ?? ''}` : state}
      tenant=""
      visit={EMPTY}
      stage="details"
      today={new Date()}
      live={{
        state,
        onRetry: load,
        visit,
        onAccept: async (vehicle, id) => setVisit(await publicPost<PublicVisitView>(`/visits/${encodeURIComponent(token)}/accept`, { noticeVersion: visit!.noticeVersion, ...(vehicle ? { vehicle } : {}), ...(id ?? {}) })),
      }}
    />
  );
}
