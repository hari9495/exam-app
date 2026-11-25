'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckInScreen } from '@yukthix/ui/frame';
import { useLearningWrite } from '../../../../../lib/yx-learning';

// LRN-05: the attendee's check-in, from the trainer's QR (the code comes with the link) or typed at a kiosk.
export default function YxCheckInPage() {
  const write = useLearningWrite();
  const [params, setParams] = useState<{ s: string; l: string; c: string } | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const sent = useRef(false);
  const go = async (code: string, via: 'qr' | 'code', p = params) => {
    if (!p) return setResult({ tone: 'danger', text: 'Open the link from the trainer’s QR code to check in.' });
    try {
      const out = await write<{ status: string }>('POST', '/check-in', { sessionId: p.s, slotId: p.l, code, via });
      setResult({ tone: 'success', text: `You’re checked in (${out.status.toLowerCase()}).` });
    } catch (e) {
      setResult({ tone: 'danger', text: e instanceof Error ? e.message : 'That did not work. Try again.' });
    }
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = { s: q.get('s') ?? '', l: q.get('l') ?? '', c: q.get('c') ?? '' };
    if (p.s && p.l) setParams(p);
    if (p.s && p.l && /^\d{6}$/.test(p.c) && !sent.current) {
      sent.current = true;
      void go(p.c, 'qr', p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <CheckInScreen course={null} defaultCode={params?.c} result={result} onCheckIn={(code) => go(code, 'code')} />;
}
