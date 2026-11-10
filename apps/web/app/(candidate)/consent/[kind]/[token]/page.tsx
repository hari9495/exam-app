'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../../lib/api-client';
import { CandidateButton } from '../../../components/CandidateButton';
import { TerminalCard } from '../../../components/TerminalCard';

// HIR-20 sourced profiles and HIR-05 guardian consent: the link in the one consent email. No account; the token is the
// key (the API gives each token its own small rate limit). Same look as the unsubscribe page.
interface Page {
  orgName: string;
  name?: string;
  notice?: string;
  candidateName?: string;
  guardianName?: string;
}

export default function ConsentPage() {
  const { kind, token } = useParams<{ kind: string; token: string }>();
  const valid = kind === 'sourced' || kind === 'guardian';
  const url = `${API_BASE}/public/consent/${kind}/${token}`;
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState(!valid);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: Page) => !cancelled && setPage(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url, valid]);

  async function send(agree: boolean) {
    setSaving(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agree }) });
      if (!res.ok) throw new Error('not ok');
      setAnswer(agree);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <TerminalCard tone="error" title="This link is not valid" body="It may have been used already, or it has expired." />;
  if (answer !== null)
    return kind === 'sourced' ? (
      <TerminalCard tone={answer ? 'success' : 'neutral'} title={page?.orgName ?? ''} body={answer ? 'Thank you. Your details are kept for suitable jobs; you can withdraw at any time from any email we send.' : 'Your details have been deleted. You will not hear from us again.'} />
    ) : (
      <TerminalCard tone={answer ? 'success' : 'neutral'} title={page?.orgName ?? ''} body={answer ? 'Thank you. Your consent is recorded and the application can go ahead.' : 'Your answer is recorded. The application will not go further without your consent.'} />
    );
  if (!page) return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;

  const body =
    kind === 'sourced'
      ? `${page.orgName} would like to keep your details to tell you about suitable jobs. Nothing more happens unless you agree.`
      : `${page.candidateName} has applied for a job at ${page.orgName}. As they are under 18, the application goes further only with the consent of a parent or lawful guardian.`;
  return (
    <TerminalCard tone="neutral" title={page.orgName} body={body}>
      {kind === 'sourced' && page.notice ? <p className="mb-4 whitespace-pre-line text-left text-sm text-candidate-text-secondary">{page.notice}</p> : null}
      <div className="flex justify-center gap-2">
        <CandidateButton disabled={saving} onClick={() => void send(true)}>
          {kind === 'sourced' ? 'Keep my details' : 'I consent'}
        </CandidateButton>
        <CandidateButton variant="secondary" disabled={saving} onClick={() => void send(false)}>
          {kind === 'sourced' ? 'Delete my details' : 'I do not consent'}
        </CandidateButton>
      </div>
    </TerminalCard>
  );
}
