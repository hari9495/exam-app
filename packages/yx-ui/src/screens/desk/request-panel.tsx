import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Dialog } from '../../components/overlay';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import type { ApprovalRoute, PickKind, PickOption, TicketRequestView } from './esm-types';
import { LivePicker } from './service-form';

// The ticket workspace's request panel (SD-2.03 … SD-2.05): what was ordered, each item's stage, approval route and
// fulfilment tasks; and "Ask for approval" (US-G-054): named colleagues approve something on this ticket, and the
// answer lands on the ticket's timeline.

const STAGE: Record<string, string> = { submitted: 'Sent', approval: 'Waiting for approval', fulfilment: 'Being done', delivered: 'Delivered', cancelled: 'Cancelled', rejected: 'Not approved' };

function Route({ r }: { r: ApprovalRoute }) {
  return (
    <ol className="yx-esm-route">
      {r.steps.map((s, i) => (
        <li key={i} data-state={s.state}>
          <strong>{s.name}</strong> <span className="yx-ops-muted">({s.rule})</span>:{' '}
          {s.approvers.length
            ? s.approvers.map((a) => `${a.name}${a.onBehalfOf ? ` for ${a.onBehalfOf}` : ''} · ${a.status === 'open' ? 'waiting' : a.status}`).join('; ')
            : s.state === 'skipped'
              ? 'skipped'
              : `later: ${s.waitingFor.join(', ')}`}
        </li>
      ))}
    </ol>
  );
}

export function RequestPanel({ view, canAsk, onAsk, onFindPeople }: { view: TicketRequestView; canAsk: boolean; onAsk: (input: { userIds: string[]; mode: 'any' | 'all'; question: string }) => Promise<unknown>; onFindPeople: (q: string) => Promise<PickOption[]> }) {
  const [asking, setAsking] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [mode, setMode] = useState<'any' | 'all'>('any');
  const [question, setQuestion] = useState('');
  const { busy, error, run } = useRun();
  const found = useRef(new Map<string, string>()).current;
  const pick = async (_k: PickKind, q: string) => {
    const r = await onFindPeople(q);
    for (const p of r) found.set(p.id, p.label);
    return r;
  };
  if (!view.items.length && !view.approvals.length && !canAsk) return null;
  return (
    <Card title={view.items.length ? 'Ordered items' : 'Approvals'} actions={canAsk ? <Button size="sm" onClick={() => setAsking(true)}>Ask for approval</Button> : undefined}>
      {view.items.map((i) => (
        <div key={i.id} className="yx-ops-stack yx-esm-item-panel">
          <div className="yx-ops-row">
            <strong>{i.item}</strong>
            {i.quantity > 1 && <span>× {i.quantity}</span>}
            <Badge tone={i.stage === 'delivered' ? 'success' : i.stage === 'rejected' || i.stage === 'cancelled' ? 'danger' : 'info'}>{STAGE[i.stage]}</Badge>
            <span className="yx-ops-muted">version {i.itemVersion}</span>
          </div>
          {Array.isArray(i.answers) ? (
            <dl className="yx-esm-summary">
              {i.answers.map((a) => (
                <div key={a.label}>
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <dl className="yx-esm-summary">
              {Object.entries(i.answers).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {i.approval && <Route r={i.approval} />}
          {i.tasks.length > 0 && <p className="yx-ops-muted">Tasks: {i.tasks.map((k) => `${k.title} (${k.state})`).join('; ')}</p>}
        </div>
      ))}
      {view.approvals.map((a) => (
        <div key={a.id} className="yx-ops-stack">
          <div className="yx-ops-row">
            <strong>{a.title}</strong>
            <Badge tone={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'info'}>{a.status === 'pending' ? 'Waiting' : a.status === 'approved' ? 'Approved' : a.status === 'rejected' ? 'Not approved' : a.status}</Badge>
          </div>
          <Route r={a} />
        </div>
      ))}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Ask for approval"
        description="They see your question and the ticket number. On a sensitive or private ticket they see the number only."
        size="md"
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!people.length || !question.trim() || busy === 'ask'}
              onClick={() =>
                void run('ask', async () => {
                  await onAsk({ userIds: people.map((p) => p.id), mode, question: question.trim() });
                  setAsking(false);
                  setPeople([]);
                  setQuestion('');
                })
              }
            >
              Send
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          {error && (
            <InlineAlert tone="danger" title="That did not work">
              {error}
            </InlineAlert>
          )}
          <FormField label="Question" required>
            <TextArea value={question} onChange={setQuestion} rows={3} maxLength={500} />
          </FormField>
          {people.map((p) => (
            <div key={p.id} className="yx-ops-row">
              <span>{p.name}</span>
              <IconButton icon={Trash2} label={`Remove ${p.name}`} onClick={() => setPeople(people.filter((x) => x.id !== p.id))} />
            </div>
          ))}
          <FormField label="Who approves">
            <LivePicker kind="people" value={null} label="Colleague" onPick={pick} onChange={(id) => id && !people.some((p) => p.id === id) && people.length < 5 && setPeople([...people, { id, name: found.get(id) ?? 'Colleague' }])} />
          </FormField>
          {people.length > 1 && <Segment label="How many must approve" options={[{ value: 'any', label: 'Any one' }, { value: 'all', label: 'All of them' }]} value={mode} onChange={setMode} />}
        </div>
      </Dialog>
    </Card>
  );
}
