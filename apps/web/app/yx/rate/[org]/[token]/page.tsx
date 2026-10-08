'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button, FormField, InlineAlert, Segment, Spinner, TextArea } from '@yukthix/ui';
import { API_BASE } from '../../../../../lib/api-client';

// The rating link from a "How did we do?" or NPS email (SD-1.26, D9: no tracking pixels). Founder decision 8 Oct 2026:
// opening the page records nothing (email link scanners open links, and the link works once). The score in the link is
// only chosen on the page; the person presses "Confirm my rating", then a comment may follow.

interface LinkInfo {
  kind: 'csat' | 'nps';
  company: string;
  question: string;
  min: number;
  max: number;
  used: boolean;
}

function RatePage() {
  const { org, token } = useParams<{ org: string; token: string }>();
  const search = useSearchParams();
  const base = `${API_BASE}/desk/rate/${encodeURIComponent(org)}/${encodeURIComponent(token)}`;
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [state, setState] = useState<'loading' | 'ask' | 'sending' | 'sent' | 'used' | 'gone' | 'error'>('loading');
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [commented, setCommented] = useState(false);
  const once = useRef(false);

  const answer = async (s: number) => {
    setState('sending');
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: s }) }).catch(() => null);
    setState(!r ? 'error' : r.ok ? 'sent' : r.status === 409 ? 'used' : r.status === 404 ? 'gone' : 'error');
  };

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void (async () => {
      const r = await fetch(base).catch(() => null);
      if (!r?.ok) return setState(r?.status === 404 ? 'gone' : 'error');
      const i = (await r.json()) as LinkInfo;
      setInfo(i);
      if (i.used) return setState('used');
      const s = Number(search.get('score'));
      if (search.get('score') !== null && Number.isInteger(s) && s >= i.min && s <= i.max) setScore(s);
      setState('ask');
    })();
    // Runs once for the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendComment = async () => {
    const r = await fetch(`${base}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: comment.trim() }) }).catch(() => null);
    if (r?.ok) setCommented(true);
  };

  return (
    <main className="yx-auth__page yx-desk yx-help-public">
      {state === 'loading' && <Spinner label="Loading" size="md" />}
      {info && <p className="yx-ops-muted">{info.company}</p>}
      {info && <h1 className="yx-help-public__title">{info.question}</h1>}
      {(state === 'ask' || state === 'sending') && info && (
        <div className="yx-ops-stack">
          <Segment
            label={info.kind === 'csat' ? 'Your rating, 1 very poor to 5 very good' : 'Your answer, 0 not at all likely to 10 very likely'}
            options={Array.from({ length: info.max - info.min + 1 }, (_, i) => ({ value: info.min + i, label: String(info.min + i) }))}
            value={score}
            onChange={setScore}
          />
          <div className="yx-ops-row">
            <Button variant="primary" disabled={score === null || state === 'sending'} onClick={() => score !== null && void answer(score)}>
              Confirm my rating
            </Button>
          </div>
        </div>
      )}
      {state === 'sent' && (
        <div className="yx-ops-stack">
          <InlineAlert tone="success" title="Thank you">
            We saved your answer{score !== null ? ` (${score})` : ''}.
          </InlineAlert>
          {commented ? (
            <p>Your comment is saved too.</p>
          ) : (
            <>
              <FormField label="Anything to add?" optional>
                <TextArea value={comment} onChange={setComment} rows={4} maxLength={1000} />
              </FormField>
              <div className="yx-ops-row">
                <Button variant="primary" disabled={!comment.trim()} onClick={() => void sendComment()}>
                  Send comment
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {state === 'used' && <InlineAlert tone="info" title="You already answered">Thank you. Each link works once.</InlineAlert>}
      {state === 'gone' && <InlineAlert tone="warning" title="This link has expired">Links in our emails work for 30 days.</InlineAlert>}
      {state === 'error' && <InlineAlert tone="danger" title="That did not reach us">Please try the link again in a moment.</InlineAlert>}
    </main>
  );
}

export default function RateLinkPage() {
  return (
    <Suspense fallback={null}>
      <RatePage />
    </Suspense>
  );
}
