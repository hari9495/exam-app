// LRN-12 with real records (ported onto PR #210's sessions): an attendee's reaction to a confirmed session, and the
// manager's later training check. TrainingFeedbackScreen (learn-me.tsx) renders this when given `live`.
import { useState, type ReactNode } from 'react';
import { Button } from '../../components/button';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { PageHeader } from '../../components/shell';
import { useToast } from '../../components/notify';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { GrowthFrame, RatingScale } from './growth-kit';

const day = (s: string) => new Date(`${s}T00:00:00`);

export interface LiveFeedback {
  mode: 'reaction' | 'manager-check';
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** Reaction: the session being rated. */
  session?: { id: string; course: string; trainer: string; when: string } | null;
  /** Manager's check: the people to ask about. */
  checks?: { enrolmentId: string; sessionId: string; person: string; course: string; trainer: string; completedOn: string }[];
  afterDays?: number;
  onReact?: (sessionId: string, v: { overall: number; trainer: number; comment?: string }) => Promise<unknown>;
  onCheck?: (enrolmentId: string, v: { applying: 'yes' | 'partly' | 'no' | 'early'; comment?: string }) => Promise<unknown>;
  onDone: () => void;
}
const LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function LiveTrainingFeedbackScreen({ live }: { live: LiveFeedback }) {
  const { toast } = useToast();
  const [overall, setOverall] = useState<number | null>(null);
  const [trainerScore, setTrainerScore] = useState<number | null>(null);
  const [applying, setApplying] = useState('');
  const [comment, setComment] = useState('');
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const reaction = live.mode === 'reaction';
  const check = live.checks?.[pick];
  const frame = (title: string, description: string | undefined, body: ReactNode, actions?: ReactNode) => (
    <GrowthFrame area="learning" active="My learning" persona={reaction ? 'emp' : 'mgr'}>
      <PageHeader title={title} description={description} actions={actions} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {body}
      </div>
    </GrowthFrame>
  );
  if (live.state !== 'ready')
    return frame(reaction ? 'Session feedback' : 'Training check', undefined, live.state === 'error' ? <ErrorState title="We couldn't open this." description="Try again in a moment." onRetry={live.onRetry} /> : <Skeleton height={300} />);
  if (reaction && !live.session) return frame('Session feedback', undefined, <EmptyState title="Nothing to rate" description="You can rate a session once it closes, if you had a seat." />);
  if (!reaction && !check) return frame('Training check', undefined, <EmptyState title="No checks due" description={`About ${live.afterDays ?? 60} days after your team members finish a session, we ask whether they are applying what they learnt.`} />);
  const send = async () => {
    setTried(true);
    if (reaction ? overall == null || trainerScore == null : !applying) return;
    setBusy(true);
    setFailed(null);
    try {
      if (reaction) await live.onReact!(live.session!.id, { overall: overall!, trainer: trainerScore!, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      else await live.onCheck!(check!.enrolmentId, { applying: applying as 'yes', ...(comment.trim() ? { comment: comment.trim() } : {}) });
      toast({ tone: 'success', title: reaction ? 'Thank you. Your feedback goes into the course and trainer scores.' : 'Recorded. L&D uses this to judge how well the course works.' });
      setApplying('');
      setComment('');
      live.onDone();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const btn = (
    <Button variant="primary" loading={busy} onClick={() => void send()}>
      Send feedback
    </Button>
  );
  if (reaction)
    return frame(
      `Feedback: ${live.session!.course}`,
      `Session with ${live.session!.trainer} · ${live.session!.when}`,
      <>
        {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
        <FormField label="How useful was the session overall?" required error={tried && overall == null ? 'Choose a rating.' : null}>
          <RatingScale label="Overall" value={overall} onChange={setOverall} labels={LABELS} />
        </FormField>
        <FormField label={`How was the trainer, ${live.session!.trainer}?`} required error={tried && trainerScore == null ? 'Choose a rating.' : null}>
          <RatingScale label="Trainer" value={trainerScore} onChange={setTrainerScore} labels={LABELS} />
        </FormField>
        <FormField label="What would you change?" optional helper="The trainer sees comments without your name.">
          <TextArea rows={3} value={comment} onChange={setComment} maxLength={1000} />
        </FormField>
      </>,
      btn,
    );
  return frame(
    'Training check',
    `${live.checks!.length} ${live.checks!.length === 1 ? 'person' : 'people'} to ask about`,
    <>
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      {live.checks!.length > 1 && (
        <FormField label="Person">
          <Select value={String(pick)} onChange={(v) => setPick(Number(v ?? 0))} options={live.checks!.map((c, i) => ({ value: String(i), label: `${c.person} · ${c.course}` }))} />
        </FormField>
      )}
      <Text>
        {check!.person} completed <strong>{check!.course}</strong> (trainer {check!.trainer}) on {formatDate(day(check!.completedOn))}. Is {check!.person.split(' ')[0]} applying what they learnt?
      </Text>
      <FormField label="Applying the skill" required error={tried && !applying ? 'Choose one.' : null}>
        <RadioGroup
          aria-label="Applying the skill"
          value={applying}
          onChange={setApplying}
          options={[
            { value: 'yes', label: 'Yes, regularly' },
            { value: 'partly', label: 'Partly' },
            { value: 'no', label: 'Not yet' },
            { value: 'early', label: 'Too early to say' },
          ]}
        />
      </FormField>
      <FormField label="Example or comment" optional>
        <TextArea rows={3} value={comment} onChange={setComment} maxLength={1000} />
      </FormField>
    </>,
    btn,
  );
}
