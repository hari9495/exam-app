'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-client';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

interface UnsubscribeState {
  optedOut: boolean;
  orgName: string;
}

export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<UnsubscribeState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/unsubscribe/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: UnsubscribeState) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function setOptedOut(optedOut: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/public/unsubscribe/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optedOut }),
      });
      if (!res.ok) throw new Error('not ok');
      const data = (await res.json()) as { optedOut: boolean };
      setState((prev) => (prev ? { ...prev, optedOut: data.optedOut } : prev));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (failed) {
    return <TerminalCard tone="error" title="Invalid link" body="This unsubscribe link isn't valid." />;
  }
  if (!state) {
    return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;
  }

  return (
    <TerminalCard
      tone={state.optedOut ? 'neutral' : 'success'}
      title={state.orgName}
      body={
        state.optedOut
          ? 'You are unsubscribed and will not receive further emails from this organization.'
          : 'You are subscribed to emails from this organization.'
      }
    >
      <CandidateButton disabled={saving} onClick={() => setOptedOut(!state.optedOut)}>
        {saving ? 'Saving…' : state.optedOut ? 'Re-subscribe' : 'Unsubscribe'}
      </CandidateButton>
    </TerminalCard>
  );
}
