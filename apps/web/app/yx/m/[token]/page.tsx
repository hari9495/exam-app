'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, InlineAlert, Spinner } from '@yukthix/ui';
import { API_BASE } from '../../../../lib/api-client';

// Founder decision 9 Oct 2026: an SMS reply says only "You have a reply on <number>" with this link. Opening the page
// reads nothing (phones preview links); "Read the reply" shows it once, then the link is used up. A private ticket's
// reply is never shown here: the person signs in to read it.

interface Opened {
  number: string;
  agentName: string | null;
  text: string | null;
  signIn: string;
}

export default function ReplyLinkPage() {
  const { token } = useParams<{ token: string }>();
  const base = `${API_BASE}/desk/reply-link/${encodeURIComponent(token)}`;
  const [number, setNumber] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [state, setState] = useState<'loading' | 'ask' | 'reading' | 'read' | 'gone' | 'error'>('loading');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void (async () => {
      const r = await fetch(base).catch(() => null);
      if (!r?.ok) return setState(r && (r.status === 404 || r.status === 410) ? 'gone' : 'error');
      setNumber(((await r.json()) as { number: string }).number);
      setState('ask');
    })();
  }, [base]);

  const read = async () => {
    setState('reading');
    const r = await fetch(base, { method: 'POST' }).catch(() => null);
    if (!r?.ok) return setState(r && (r.status === 404 || r.status === 410) ? 'gone' : 'error');
    setOpened((await r.json()) as Opened);
    setState('read');
  };

  return (
    <main className="yx-auth__page yx-desk yx-help-public">
      {state === 'loading' && <Spinner label="Loading" size="md" />}
      {number && state !== 'read' && <h1 className="yx-help-public__title">You have a reply on {number}</h1>}
      {(state === 'ask' || state === 'reading') && (
        <div className="yx-ops-stack">
          <p>This link shows the reply once. Read it when you are ready.</p>
          <div className="yx-ops-row">
            <Button variant="primary" loading={state === 'reading'} onClick={() => void read()}>
              Read the reply
            </Button>
          </div>
        </div>
      )}
      {state === 'read' && opened && (
        <div className="yx-ops-stack">
          <h1 className="yx-help-public__title">Reply on {opened.number}</h1>
          {opened.text ? (
            <>
              <p className="yx-ops-muted">{opened.agentName} wrote:</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{opened.text}</p>
            </>
          ) : (
            <InlineAlert tone="info" title="This request is private">
              Sign in to YukthiX to read the reply.
            </InlineAlert>
          )}
          <p>
            <a href={opened.signIn}>Open the request in YukthiX</a> to answer or see the whole conversation.
          </p>
        </div>
      )}
      {state === 'gone' && (
        <InlineAlert tone="warning" title="This link was used or has expired">
          Each link works once. Sign in to YukthiX to read your request.
        </InlineAlert>
      )}
      {state === 'error' && <InlineAlert tone="danger" title="That did not reach us">Please try the link again in a moment.</InlineAlert>}
    </main>
  );
}
