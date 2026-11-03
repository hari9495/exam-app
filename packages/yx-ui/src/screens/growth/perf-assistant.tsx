// PRF-17 review assistant panel (performance builder 3): "Help me draft" and the wording check under the manager's
// summary. Its own file so the designed workspace (perf-reviews) and its live path (perf-reviews-live) both render it.
import { useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { AiBadge } from '../../components/display';
import { Text } from '../../components/foundations';
import { InlineAlert } from '../../components/feedback';
import { useRun } from '../org/org-kit';
import { BiasFlagList } from './growth-kit';
import { detectBiasFlags, type BiasFlag } from './growth-logic';

const DRAFT_TEXT =
  'Divya automated 310 of the planned 400 regression cases and brought the flaky rate from 12% to 6%, which cut line stoppages for testing to zero in August. Defect leakage fell from 8% to 3.5%. Mentoring is behind plan: 5 of 12 sessions held; we agreed a fixed Thursday slot.';

/** PRF-17 live: the review assistant for the current manager of an open review (performance builder 3). */
export interface LiveReviewAssistant {
  /** Off: the company has not turned on AI review summaries, or no AI provider is set up. */
  reason: 'company-off' | 'not-configured' | null;
  /** Through the AI service; resolves to the suggested text and what it was drafted from. */
  onDraft: () => Promise<{ draft: string; basis: string }>;
  /** Explainable rules on the server (wording, rating and text, rating spread against peers); never changes the review. */
  onCheck: (text: string, rating: number | null) => Promise<BiasFlag[]>;
  /** Records the manager's Accept or Ignore (audited). */
  onDecide: (flag: BiasFlag, decision: 'accepted' | 'ignored') => Promise<void>;
}

export interface ReviewAssistantProps {
  assistant: { enabled: boolean; draft?: string; showFlags?: boolean; reason?: LiveReviewAssistant['reason']; live?: LiveReviewAssistant };
  summary: string;
  rating: number | null;
  onSummary: (text: string) => void;
}

const SAMPLE_BASIS = 'Draft from goals, feedback received and 1:1 notes, 1 Apr – 30 Sep 2026';

/** PRF-17 "Help me draft" and the wording check, under the manager's summary. Suggestions only; nothing saves by itself. */
export function ReviewAssistantPanel({ assistant, summary, rating, onSummary }: ReviewAssistantProps) {
  const live = assistant.live;
  const [draftShown, setDraftShown] = useState(!!assistant.draft);
  const [draft, setDraft] = useState<{ draft: string; basis: string } | null>(assistant.draft ? { draft: assistant.draft, basis: SAMPLE_BASIS } : null);
  const [checked, setChecked] = useState(!!assistant.showFlags);
  const [serverFlags, setServerFlags] = useState<BiasFlag[]>([]);
  const [decided, setDecided] = useState<Record<string, 'accepted' | 'ignored'>>({});
  const { run, busy, error } = useRun();
  const flags = useMemo(() => (!checked ? [] : live ? serverFlags : detectBiasFlags(summary, rating)), [checked, live, serverFlags, summary, rating]);
  const enabled = live ? !live.reason : assistant.enabled;
  const reason = live ? live.reason : (assistant.reason ?? 'company-off');
  if (!enabled)
    return reason === 'not-configured' ? (
      <InlineAlert tone="info" title="Review assistant is off">
        AI is not set up for your company yet. Ask your admin to add an AI provider in Settings › Integrations.
      </InlineAlert>
    ) : (
      <InlineAlert tone="info" title="Review assistant is off">
        Your company hasn’t turned on AI review summaries. Ask your HR admin if you’d like drafting help.
      </InlineAlert>
    );
  const decide = (f: BiasFlag, d: 'accepted' | 'ignored') => {
    setDecided((x) => ({ ...x, [f.id]: d }));
    // Accept only marks the words in the manager's own unsaved text; nothing is saved by itself.
    if (d === 'accepted' && summary.includes(f.match)) onSummary(summary.replace(f.match, '[describe the behaviour]'));
    if (live) void live.onDecide(f, d).catch(() => undefined);
  };
  return (
    <section className="yx-growth-panel" data-tone="ai" aria-label="Review assistant">
      <div className="yx-growth-row">
        <h3 className="yx-growth-h">Review assistant</h3>
        <AiBadge />
      </div>
      <Text size="sm" tone="secondary">
        Suggestions only. Your text and rating are final.
      </Text>
      <div className="yx-growth-row">
        <Button
          size="sm"
          loading={busy === 'draft'}
          onClick={() => {
            if (!live) {
              setDraft((x) => x ?? { draft: DRAFT_TEXT, basis: SAMPLE_BASIS });
              return setDraftShown(true);
            }
            void run('draft', async () => {
              setDraft(await live.onDraft());
              setDraftShown(true);
            });
          }}
        >
          Help me draft
        </Button>
        <Button
          size="sm"
          loading={busy === 'check'}
          onClick={() => {
            setDecided({});
            if (!live) return setChecked(true);
            void run('check', async () => {
              setServerFlags(await live.onCheck(summary, rating));
              setChecked(true);
            });
          }}
        >
          Check wording
        </Button>
      </div>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {draftShown && draft && (
        <div className="yx-growth-note">
          <Text size="sm" tone="secondary">
            {draft.basis}
          </Text>
          <p className="yx-growth-p">{draft.draft}</p>
          <div className="yx-growth-row">
            <Button
              size="sm"
              onClick={() => {
                onSummary(draft.draft);
                setDraftShown(false);
              }}
            >
              Use as starting text
            </Button>
            <Button size="sm" onClick={() => setDraftShown(false)}>
              Discard draft
            </Button>
          </div>
        </div>
      )}
      {checked && <BiasFlagList flags={flags} decided={decided} onAccept={(f) => decide(f, 'accepted')} onIgnore={(f) => decide(f, 'ignored')} />}
    </section>
  );
}

