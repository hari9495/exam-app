// YX-12 Nudges and switch-on copy, live (YukthiX console C-8): the designed NudgeEditorScreen with the API's data. Staff
// write the in-app text per feature switch (C-4): a suggestion for a feature that is on, or switch-on copy for one the
// company has off. A second staff member approves it before it goes live. Companies see it only when the switch allows
// it, only people who can act on it, and at most the weekly limit (Platform settings).
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Dialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';

export type NudgeKind = 'suggest' | 'switch_on';
export interface NudgeRow {
  id: string;
  featureKey: string;
  kind: NudgeKind;
  heading: string;
  body: string;
  status: 'pending' | 'live' | 'sent_back' | 'retired';
  writtenBy: string;
  mine: boolean;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
}
export interface LiveNudges {
  state: LoadState;
  onRetry: () => void;
  features: { key: string; label: string; killed: boolean }[];
  nudges: NudgeRow[];
  weeklyLimit: number;
  onWrite: (input: { featureKey: string; kind: NudgeKind; heading: string; body: string }) => Promise<unknown>;
  onReview: (id: string, approve: boolean, note?: string) => Promise<unknown>;
  onRetire: (id: string) => Promise<unknown>;
  /** Stories: open the writer on this kind. */
  defaultWriting?: NudgeKind;
}

/** What a company person sees (the drawn preview): heading, body, Switch on for switch-on copy, and Not now. */
export function NudgeCard({ heading, body, switchHref, onDismiss, extra }: { heading: string; body: string; switchHref?: string | null; onDismiss?: () => void; extra?: React.ReactNode }) {
  return (
    <section className="yx-ps-preview" aria-label={heading}>
      <strong>{heading}</strong>
      <p className="yx-ps-p">{body}</p>
      <div className="yx-ps-row">
        {switchHref && (
          <Button size="sm" variant="primary" asChild>
            <a href={switchHref}>Switch on</a>
          </Button>
        )}
        {extra}
        <Button size="sm" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </section>
  );
}

const STATUS: Record<NudgeRow['status'], { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  live: { label: 'Live', tone: 'success' },
  sent_back: { label: 'Sent back', tone: 'neutral' },
  retired: { label: 'Taken down', tone: 'neutral' },
};
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');

export function LiveNudgesScreen({ live }: { live: LiveNudges }) {
  const [tab, setTab] = useState<NudgeKind>(live.defaultWriting ?? 'switch_on');
  const [writing, setWriting] = useState<NudgeKind | null>(live.defaultWriting ?? null);
  return (
    <ConsolePage
      crumb="Nudges"
      title="Nudges and switch-on copy"
      description={`Text for each feature switch. Companies see it only when the switch allows it, only people who can act on it, and at most ${live.weeklyLimit} a week per person (Platform settings). Another staff member approves each one.`}
      state={live.state}
      onRetry={live.onRetry}
      what="the nudges"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setWriting(tab)}>
          New copy
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as NudgeKind)}>
        <TabsList aria-label="Copy">
          <TabsTrigger value="switch_on">Switch-on cards</TabsTrigger>
          <TabsTrigger value="suggest">Suggestions</TabsTrigger>
        </TabsList>
        {(['switch_on', 'suggest'] as const).map((k) => (
          <TabsContent key={k} value={k}>
            <NudgeList live={live} kind={k} />
          </TabsContent>
        ))}
      </Tabs>
      {writing && <Writer live={live} kind={writing} onClose={() => setWriting(null)} />}
    </ConsolePage>
  );
}

function NudgeList({ live, kind }: { live: LiveNudges; kind: NudgeKind }) {
  const rows = live.nudges.filter((n) => n.kind === kind);
  const [reviewing, setReviewing] = useState<NudgeRow | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const label = (k: string) => live.features.find((f) => f.key === k)?.label ?? k;
  const killed = (k: string) => live.features.find((f) => f.key === k)?.killed;
  return (
    <Card>
      {failed && <InlineAlert tone="danger" title={failed} />}
      {rows.length ? (
        <ul className="yx-ps-list" aria-label={kind === 'switch_on' ? 'Switch-on cards' : 'Suggestions'}>
          {rows.map((n) => (
            <li key={n.id}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">{n.heading}</span>
                <span className="yx-ps-list__meta">
                  {label(n.featureKey)}
                  {killed(n.featureKey) ? ' (switched off for everyone: not shown)' : ''} · written by {n.mine ? 'you' : n.writtenBy}
                  {n.reviewedBy ? ` · ${n.status === 'sent_back' ? 'sent back' : 'approved'} by ${n.reviewedBy}` : ''}
                  {n.reviewNote ? `: “${n.reviewNote}”` : ''}
                </span>
              </div>
              <Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge>
              {n.status === 'pending' && (n.mine ? <span className="yx-ps-muted">Another staff member approves it</span> : <Button size="sm" onClick={() => setReviewing(n)}>Review</Button>)}
              {n.status === 'live' && (
                <Button
                  size="sm"
                  onClick={async () => {
                    setFailed(null);
                    try {
                      await live.onRetire(n.id);
                      toast({ tone: 'success', title: 'Taken down' });
                    } catch (e) {
                      setFailed(errorText(e));
                    }
                  }}
                >
                  Take down
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title="No copy yet." description="Write it with New copy; it goes live once another staff member approves it." />
      )}
      {reviewing && <Review live={live} nudge={reviewing} onClose={() => setReviewing(null)} />}
    </Card>
  );
}

function Review({ live, nudge, onClose }: { live: LiveNudges; nudge: NudgeRow; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const noteEarly = useTooEarly(note.trim() ? [] : [{ fieldId: 'nr-note', message: 'Say what to change before sending it back.' }]);
  const act = async (approve: boolean) => {
    if (!approve && noteEarly.stop()) return;
    setBusy(approve ? 'ok' : 'back');
    setFailed(null);
    try {
      await live.onReview(nudge.id, approve, approve ? undefined : note.trim());
      toast({ tone: 'success', title: approve ? 'Approved: it is live' : 'Sent back' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Review the copy"
      description={`Written by ${nudge.writtenBy}. Approving replaces the live copy for this switch.`}
      footer={
        <>
          <Button loading={busy === 'back'} onClick={() => void act(false)}>
            Send back
          </Button>
          <Button variant="primary" loading={busy === 'ok'} onClick={() => void act(true)}>
            Approve
          </Button>
        </>
      }
    >
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <NudgeCard heading={nudge.heading} body={nudge.body} switchHref={nudge.kind === 'switch_on' ? '#' : null} />
        <FormField id="nr-note" label="Note for the writer" helper="Needed only to send it back." error={noteEarly.errorOf('nr-note')}>
          <TextArea rows={2} value={note} onChange={setNote} maxLength={300} />
        </FormField>
      </div>
    </Dialog>
  );
}

function Writer({ live, kind, onClose }: { live: LiveNudges; kind: NudgeKind; onClose: () => void }) {
  const [feature, setFeature] = useState<string | null>(null);
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const early = useTooEarly(
    [
      !feature && { fieldId: 'nw-feature', message: 'Choose the feature switch.' },
      heading.trim().length < 3 && { fieldId: 'nw-heading', message: 'Write a heading of at least 3 characters.' },
      body.trim().length < 10 && { fieldId: 'nw-body', message: 'Write the text (at least 10 characters).' },
      /[<>]/.test(heading + body) && { fieldId: 'nw-body', message: 'Write it without < or >.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onWrite({ featureKey: feature!, kind, heading: heading.trim(), body: body.trim() });
      toast({ tone: 'success', title: 'Sent for approval', description: 'It goes live once another staff member approves it.' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'switch_on' ? 'New switch-on card' : 'New suggestion'}
      description={kind === 'switch_on' ? 'Shown to people who can switch the feature on, while YukthiX allows it and the company has it off.' : 'Shown to people who can use the feature, while it is on.'}
      footer={
        <Button variant="primary" loading={busy} onClick={() => void send()}>
          Send for approval
        </Button>
      }
    >
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FormField id="nw-feature" label="Feature switch" required error={early.errorOf('nw-feature')}>
          <Select value={feature} onChange={setFeature} placeholder="Choose" options={live.features.map((f) => ({ value: f.key, label: f.label }))} />
        </FormField>
        <FormField id="nw-heading" label="Heading" required error={early.errorOf('nw-heading')}>
          <TextField value={heading} onChange={setHeading} maxLength={80} />
        </FormField>
        <FormField id="nw-body" label="Body" required error={early.errorOf('nw-body')}>
          <TextArea rows={2} value={body} onChange={setBody} maxLength={300} />
        </FormField>
        <p className="yx-ps-muted">Buttons are fixed: {kind === 'switch_on' ? 'Switch on (opens the setting) and ' : ''}Not now. Not now hides it for the days set in Platform settings.</p>
        <Card title="Preview">
          <NudgeCard heading={heading.trim() || 'Heading'} body={body.trim() || 'Body'} switchHref={kind === 'switch_on' ? '#' : null} />
        </Card>
      </div>
    </Dialog>
  );
}
