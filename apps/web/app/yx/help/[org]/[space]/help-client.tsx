'use client';

import { useState } from 'react';
import { CheckCircle2, Printer, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, FormField, InlineAlert, TextField } from '@yukthix/ui';
import { useSuggestions, type KbSuggestion } from '@yukthix/ui/desk';
import { API_BASE } from '../../../../../lib/api-client';

// The interactive parts of the public help centre: search while typing, "Was this helpful?", "This solved it" and
// print (a clean page, or "Save as PDF" in the print dialog). No session, no cookies, no tracking: the API counts
// searches and answers without any user id (YX-GRO-07).

const enc = encodeURIComponent;

export function HelpSearch({ org, space }: { org: string; space: string }) {
  const [q, setQ] = useState('');
  const search = (text: string) => fetch(`${API_BASE}/desk/help-centre/${enc(org)}/${enc(space)}/search?q=${enc(text)}`).then((r) => (r.ok ? (r.json() as Promise<(KbSuggestion & { slug: string })[]>) : []));
  const found = useSuggestions(q, search) as (KbSuggestion & { slug: string })[];
  return (
    <section className="yx-ops-stack" data-gap="sm" aria-label="Search">
      <FormField label="Search for an answer">
        <TextField value={q} onChange={setQ} prefix={<Search aria-hidden size={14} />} placeholder="For example: track my order" maxLength={100} />
      </FormField>
      {q.trim().length >= 3 && found.length === 0 && <p className="yx-ops-muted">No answer matches yet. Try other words, or contact us.</p>}
      {found.length > 0 && (
        <ul className="yx-ops-list" aria-label="Search results">
          {found.map((a) => (
            <li key={a.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <a className="yx-desk-link" href={`/yx/help/${enc(org)}/${enc(space)}/${enc(a.slug)}`}>
                  {a.title}
                </a>
                {a.summary && <span className="yx-ops-list__sub">{a.summary}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ArticleActions({ org, space, articleId }: { org: string; space: string; articleId: string }) {
  const [voted, setVoted] = useState<boolean | null>(null);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = (body: object) =>
    fetch(`${API_BASE}/desk/help-centre/${enc(org)}/${enc(space)}/articles/${enc(articleId)}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => {
      if (!r.ok) throw new Error('not sent');
    });
  return (
    <div className="yx-ops-stack yx-help-public__actions" data-gap="sm">
      {failed && <InlineAlert tone="danger">That did not reach us. Try again in a moment.</InlineAlert>}
      <div className="yx-ops-row" role="group" aria-label="Was this helpful?">
        <span>Was this helpful?</span>
        <Button size="sm" icon={ThumbsUp} disabled={voted !== null} onClick={() => void send({ helpful: true }).then(() => setVoted(true), () => setFailed(true))}>
          Yes
        </Button>
        <Button size="sm" icon={ThumbsDown} disabled={voted !== null} onClick={() => void send({ helpful: false }).then(() => setVoted(false), () => setFailed(true))}>
          No
        </Button>
        {voted !== null && <span className="yx-ops-muted">Thank you for telling us.</span>}
      </div>
      <div className="yx-ops-row">
        {solved ? (
          <span className="yx-ops-muted">Glad it helped.</span>
        ) : (
          <Button variant="primary" icon={CheckCircle2} onClick={() => void send({ solved: true }).then(() => setSolved(true), () => setFailed(true))}>
            This solved it
          </Button>
        )}
        <Button icon={Printer} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>
    </div>
  );
}
