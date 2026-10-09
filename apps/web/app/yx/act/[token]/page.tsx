'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ActionLinkScreen, type ActionLinkView } from '@yukthix/ui/desk';
import { API_BASE } from '../../../../lib/api-client';

// SD-2.06: the page behind an approval card in Teams, Slack or a phone push. Opening it decides nothing (chat apps open
// links to preview them); the person presses Approve or Not approve. The link works once and expires; sensitive and
// high-risk requests show nothing here and are decided after signing in.
export default function YxActionLinkPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const base = `${API_BASE}/workflow/act/${encodeURIComponent(token)}`;
  const [view, setView] = useState<ActionLinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void (async () => {
      const r = await fetch(base).catch(() => null);
      const body = r ? await r.json().catch(() => null) : null;
      if (!r?.ok) return setError(body?.message ?? 'This link is not valid. Open your approvals in YukthiX.');
      setView(body as ActionLinkView);
    })();
  }, [base]);
  return (
    <ActionLinkScreen
      view={view}
      error={error}
      done={done}
      onSignIn={() => router.push('/yx/approvals')}
      onDecide={async (decision, reason) => {
        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }) });
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.message ?? 'That did not work. Nothing has changed.');
        setDone(decision === 'approve' ? 'You approved it. You can close this page.' : 'You did not approve it. The person is told why.');
      }}
    />
  );
}
