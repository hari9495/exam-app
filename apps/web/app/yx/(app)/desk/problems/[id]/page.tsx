'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState, Spinner } from '@yukthix/ui';
import { ProblemRecordScreen, type ProblemRow } from '@yukthix/ui/desk';
import { useDesk, useDeskWrite } from '../../../../../../lib/yx-desk';

// Helpdesk ITSM-3 (answers 1940, 1941): one problem: its incidents, root cause, workaround as a known error (a draft
// article and a notice), the change that fixes it and the closing reply its incidents get.
type Detail = Omit<ProblemRow, 'openedOn'> & {
  openedOn: string;
  version: number;
  workaround: string | null;
  closingReply: string;
  incidents: { id: string; number: string; subject: string; state: string; raisedOn: string }[];
  fixes: { id: string; number: string; title: string; state: 'approval' | 'scheduled' | 'in_progress' | 'review' | 'closed' | 'backed_out' | 'rejected' | 'cancelled' }[];
  changes: { id: string; number: string; title: string }[];
  article: { id: string; number: number; state: string } | null;
  banner: boolean;
  spaces: { id: string; name: string; audience: string }[];
  can: { work: boolean; close: boolean; publicArticle: boolean };
};
const STATE: Record<string, string> = { new: 'New', open: 'In progress', pending: 'Waiting', on_hold: 'On hold', solved: 'Resolved', closed: 'Closed' };

export default function YxDeskProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const path = `/problems/${encodeURIComponent(id)}`;
  const problem = useDesk<Detail>(path);
  const write = useDeskWrite();
  if (problem.isError) return <ErrorState title="This problem did not open." description="It may not exist, or it is not one you may see." onRetry={() => void problem.refetch()} />;
  if (!problem.data) return <Spinner label="Loading" size="md" />;
  const d = problem.data;
  const fix = d.fixes.find((f) => !['rejected', 'cancelled', 'backed_out'].includes(f.state)) ?? d.fixes[0] ?? null;
  return (
    <ProblemRecordScreen
      key={d.version}
      problem={{ ...d, openedOn: new Date(d.openedOn) }}
      incidents={d.incidents.map((i) => ({ number: i.number, subject: i.subject, state: STATE[i.state] ?? i.state, raisedOn: new Date(i.raisedOn) }))}
      workaround={d.workaround ?? ''}
      knownError={d.state === 'known_error' || Boolean(d.workaround)}
      fixChange={fix}
      live={{
        version: d.version,
        closingReply: d.closingReply,
        article: d.article,
        banner: d.banner,
        spaces: d.spaces,
        changes: d.changes,
        can: d.can,
        onLink: (numbers) => write(`${path}/incidents`, 'POST', { numbers }),
        onSave: (input) => write(path, 'PATCH', { version: d.version, ...input }),
        onKnownError: (input) => write(`${path}/known-error`, 'POST', { version: d.version, ...input }),
        onFix: (changeId) => write(`${path}/fix`, 'POST', { changeId }),
        onRaiseChange: () => router.push('/yx/desk/changes'),
        onClose: (reply) => write(`${path}/close`, 'POST', { version: d.version, ...(reply.trim() ? { reply: reply.trim() } : {}) }),
        onBack: () => router.push('/yx/desk/problems'),
      }}
    />
  );
}
