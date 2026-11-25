'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-client';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

interface UnsubscribeState {
  optedOut: boolean;
  orgName: string;
  /** Answer 561: they ticked "Message me on WhatsApp about jobs"; withdrawable here. */
  whatsappOptedIn?: boolean;
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

  // Answer 561: stop WhatsApp messages about jobs (opting in again is on the application page).
  async function stopWhatsapp() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/public/unsubscribe/${token}/whatsapp`, { method: 'POST' });
      if (!res.ok) throw new Error('not ok');
      setState((prev) => (prev ? { ...prev, whatsappOptedIn: false } : prev));
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
      <div className="flex flex-col items-center gap-2">
        <CandidateButton disabled={saving} onClick={() => setOptedOut(!state.optedOut)}>
          {saving ? 'Saving…' : state.optedOut ? 'Re-subscribe' : 'Unsubscribe'}
        </CandidateButton>
        {state.whatsappOptedIn ? (
          <CandidateButton variant="secondary" disabled={saving} onClick={() => void stopWhatsapp()}>
            Stop WhatsApp messages about jobs
          </CandidateButton>
        ) : state.whatsappOptedIn === false ? (
          <p className="text-sm text-candidate-text-secondary">You get no WhatsApp messages about jobs from this organization.</p>
        ) : null}
      </div>
    </TerminalCard>
  );
}
