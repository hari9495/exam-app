import { useState } from 'react';
import { Badge, type BadgeTone } from '../../components/display';
import { Text } from '../../components/foundations';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { useConfirm } from '../org/org-kit';
import { ConsolePage, day } from './console-kit';
import type { LoadState } from './types';

export type FeatureStatus = 'new' | 'planned' | 'not_now' | 'done';
export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = { new: 'New', planned: 'Planned', not_now: 'Not now', done: 'Done' };
const TONE: Record<FeatureStatus, BadgeTone> = { new: 'neutral', planned: 'info', not_now: 'neutral', done: 'success' };

/** `GET platform/feature-requests`: one row per request, duplicates filed under it. */
export interface FeatureRequestRow {
  id: string;
  number: number;
  title: string;
  details: string;
  status: FeatureStatus;
  company: string;
  requestedBy: string;
  createdAt: string;
  companies: number;
  duplicates: { id: string; number: number; title: string; company: string }[];
  staffNote: string | null;
  version: number;
}

/** `GET platform/assistant/review`. */
export interface AssistantReview {
  days: number;
  answers: number;
  byOutcome: Record<string, number>;
  thumbsUp: number;
  thumbsDown: number;
  unanswered: { question: string; outcome: string | null; feedback: string | null; at: string }[];
  tickets: { ticket: string | null; company: string; at: string }[];
}

export interface FeatureRequestsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  requests: FeatureRequestRow[];
  review: AssistantReview | null;
  defaultTab?: 'requests' | 'review';
  onDecide: (id: string, change: { status?: FeatureStatus; duplicateOf?: string; note?: string; version: number }) => Promise<unknown>;
}

const OUTCOME_LABEL: Record<string, string> = { not_covered: 'Not in help', needs_person: 'Needs a person' };

/**
 * Answers 2105 and the staff view (founder, 13 Nov 2026): requests sent from Ask YukthiX, duplicates grouped with how many
 * companies asked; Planned, Not now, Done (Done tells everyone who asked). The Ask YukthiX review: answers by outcome,
 * thumbs, questions help did not answer (personal data masked) and chats that became tickets.
 */
export function FeatureRequestsConsoleScreen(props: FeatureRequestsScreenProps) {
  const { toast } = useToast();
  const [dialog, ask] = useConfirm();
  const [tab, setTab] = useState(props.defaultTab ?? 'requests');
  const decide = (r: FeatureRequestRow, status: FeatureStatus) =>
    ask({
      title: `Mark request ${r.number} ${FEATURE_STATUS_LABEL[status]}?`,
      consequence: status === 'done' ? `Everyone who asked (${r.companies} ${r.companies === 1 ? 'company' : 'companies'}) is told in YukthiX that it is done.` : 'The people who asked are not told until it is done.',
      confirmLabel: `Mark ${FEATURE_STATUS_LABEL[status]}`,
      action: async () => {
        await props.onDecide(r.id, { status, version: r.version });
        toast({ tone: 'success', title: `Request ${r.number}: ${FEATURE_STATUS_LABEL[status]}` });
      },
    });
  const fileUnder = (r: FeatureRequestRow, main: FeatureRequestRow) =>
    ask({
      title: `File request ${r.number} under ${main.number}?`,
      consequence: `"${r.title}" becomes a duplicate of "${main.title}"; its company counts there and is told when that one is done.`,
      confirmLabel: 'File as duplicate',
      action: async () => {
        await props.onDecide(r.id, { duplicateOf: main.id, version: r.version });
        toast({ tone: 'success', title: `Request ${r.number} filed under ${main.number}` });
      },
    });
  const columns: TableColumn<FeatureRequestRow>[] = [
    { key: 'number', header: 'No.', type: 'number', value: (r) => r.number },
    { key: 'title', header: 'Request', value: (r) => r.title, render: (r) => (<span><strong>{r.title}</strong>{r.details ? <><br /><Text tone="secondary">{r.details}</Text></> : null}</span>) },
    { key: 'companies', header: 'Companies', type: 'number', value: (r) => r.companies },
    { key: 'from', header: 'First from', value: (r) => `${r.company} · ${r.requestedBy}` },
    { key: 'status', header: 'Status', value: (r) => FEATURE_STATUS_LABEL[r.status], render: (r) => <Badge tone={TONE[r.status]}>{FEATURE_STATUS_LABEL[r.status]}</Badge> },
    { key: 'at', header: 'Sent', value: (r) => day(r.createdAt) },
  ];
  const r = props.review;
  return (
    <ConsolePage crumb="Feature requests" title="Feature requests and Ask YukthiX" description="What people asked Ask YukthiX for, and how its answers are doing." state={props.state} onRetry={props.onRetry} what="feature requests">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList aria-label="Feature requests and the assistant review">
          <TabsTrigger value="requests" count={props.requests.length}>Feature requests</TabsTrigger>
          <TabsTrigger value="review">Ask YukthiX review</TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <Card title="Requests">
            <DataTable
              label="Feature requests"
              columns={columns}
              rows={props.requests}
              getRowId={(x) => x.id}
              rowNoun={['request', 'requests']}
              cardSummary
              rowActions={(x) => (
                <>
                  {(['planned', 'not_now', 'done'] as const).filter((s) => s !== x.status).map((s) => (
                    <MenuItem key={s} onSelect={() => decide(x, s)}>
                      Mark {FEATURE_STATUS_LABEL[s]}
                    </MenuItem>
                  ))}
                  {!x.duplicates.length &&
                    props.requests.filter((m) => m.id !== x.id).slice(0, 8).map((m) => (
                      <MenuItem key={`d-${m.id}`} onSelect={() => fileUnder(x, m)}>
                        File under {m.number}: {m.title.slice(0, 40)}
                      </MenuItem>
                    ))}
                </>
              )}
            />
          </Card>
        </TabsContent>
        <TabsContent value="review">
          {r ? (
            <div className="yx-auth__stack">
              <Card title={`Answers, last ${r.days} days`}>
                <DescriptionList
                  items={[
                    { label: 'Answers', value: String(r.answers) },
                    { label: 'Answered from help', value: String(r.byOutcome.answered ?? 0) },
                    { label: 'Not in help', value: String(r.byOutcome.not_covered ?? 0) },
                    { label: 'Needs a person', value: String(r.byOutcome.needs_person ?? 0) },
                    { label: 'Feature requests or buying', value: String((r.byOutcome.feature_request ?? 0) + (r.byOutcome.buying ?? 0)) },
                    { label: 'Marked helpful / not helpful', value: `${r.thumbsUp} / ${r.thumbsDown}` },
                  ]}
                />
              </Card>
              <Card title="Questions help did not answer">
                <DataTable
                  label="Questions help did not answer"
                  columns={[
                    { key: 'q', header: 'Question (personal data hidden)', value: (x) => x.question },
                    { key: 'o', header: 'Why', value: (x) => (x.feedback === 'down' ? 'Marked not helpful' : OUTCOME_LABEL[x.outcome ?? ''] ?? '') },
                    { key: 'at', header: 'When', value: (x) => day(x.at) },
                  ]}
                  rows={r.unanswered}
                  getRowId={(x) => `${x.at}-${x.question.slice(0, 20)}`}
                  rowNoun={['question', 'questions']}
                />
              </Card>
              <Card title="Chats that became tickets">
                <DataTable
                  label="Chats that became tickets"
                  columns={[
                    { key: 't', header: 'Ticket', value: (x) => x.ticket ?? 'Sending' },
                    { key: 'c', header: 'Company', value: (x) => x.company },
                    { key: 'at', header: 'When', value: (x) => day(x.at) },
                  ]}
                  rows={r.tickets}
                  getRowId={(x) => `${x.ticket}-${x.at}`}
                  rowNoun={['ticket', 'tickets']}
                />
              </Card>
            </div>
          ) : (
            <Text tone="secondary">The review did not load.</Text>
          )}
        </TabsContent>
      </Tabs>
      {dialog}
    </ConsolePage>
  );
}
