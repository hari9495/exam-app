import '../components/exam.css';
import '../components/careers.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  AutosaveIndicator,
  ExamShell,
  ExamTimer,
  ProctoringNotice,
  QuestionCard,
  QuestionNavigator,
  type AutosaveStatus,
  type ExamQuestionState,
} from '../components/exam';
import { Section, Stack } from './story-kit';

const meta: Meta = {
  title: 'Surfaces/Exam taking',
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ margin: -24 }}><Story /></div>],
};
export default meta;
type S = StoryObj;

interface SampleQuestion {
  text: string;
  kind: 'single' | 'multiple';
  options: string[];
}

const BANK: SampleQuestion[] = [
  {
    text: 'A supplier invoice of ₹1,18,000 includes GST at 18%. What is the taxable value?',
    kind: 'single',
    options: ['₹96,760', '₹1,00,000', '₹1,00,240', '₹1,18,000'],
  },
  {
    text: 'Which of these are deducted from an employee’s gross salary in India? Select all that apply.',
    kind: 'multiple',
    options: ['Employee PF contribution', 'Professional tax', 'Employer ESI contribution', 'TDS on salary'],
  },
  {
    text: 'A bank reconciliation shows ₹12,500 in cheques issued but not yet presented. How does this affect the bank statement balance compared with the cash book?',
    kind: 'single',
    options: ['Bank balance is higher by ₹12,500', 'Bank balance is lower by ₹12,500', 'No difference', 'It depends on the cheque date'],
  },
  {
    text: 'Divya closes the books on 31 March. An electricity bill of ₹8,400 for March arrives on 6 April. Where should it be recorded?',
    kind: 'single',
    options: ['April expenses', 'March expenses as an accrual', 'Prepaid expenses', 'It is not recorded'],
  },
  {
    text: 'Which documents must be kept to claim input tax credit under GST? Select all that apply.',
    kind: 'multiple',
    options: ['Tax invoice from the supplier', 'Proof of receipt of goods', 'Purchase order only', 'Payment within 180 days'],
  },
];

const TOTAL = 20;
const question = (i: number) => BANK[i % BANK.length];

// Deterministic mid-test state: answered, marked, blank.
function midTestState(): { answers: Record<number, string[]>; marked: Record<number, boolean> } {
  const answers: Record<number, string[]> = {};
  const marked: Record<number, boolean> = {};
  for (let i = 0; i < 12; i++) if (i % 5 !== 3) answers[i] = ['o1'];
  marked[4] = true;
  marked[7] = true;
  marked[10] = true;
  return { answers, marked };
}

function ExamDemo({
  seconds = 2700,
  saveStatus = 'saved',
  start = 'blank',
  current: initialCurrent = 0,
  proctored = true,
  defaultFinishOpen,
}: {
  seconds?: number;
  saveStatus?: AutosaveStatus;
  start?: 'blank' | 'mid';
  current?: number;
  proctored?: boolean;
  defaultFinishOpen?: boolean;
}) {
  const init = start === 'mid' ? midTestState() : { answers: {}, marked: {} };
  const [answers, setAnswers] = useState<Record<number, string[]>>(init.answers);
  const [marked, setMarked] = useState<Record<number, boolean>>(init.marked);
  const [current, setCurrent] = useState(initialCurrent);
  const [finished, setFinished] = useState(false);
  const states: ExamQuestionState[] = Array.from({ length: TOTAL }, (_, i) => ({ answered: (answers[i] ?? []).length > 0, markedForReview: Boolean(marked[i]) }));
  const q = question(current);

  if (finished) {
    return (
      <div style={{ padding: 48 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Test submitted</h1>
        <p>Your answers are saved. You can close this window.</p>
      </div>
    );
  }

  return (
    <ExamShell
      testName="Accounts executive — aptitude and GST basics"
      candidateName="Meera Iyer · Roll no. NF-2026-0418"
      seconds={seconds}
      saveStatus={saveStatus}
      savedAt="10:42"
      questions={states}
      current={current}
      onNavigate={setCurrent}
      onFinish={() => setFinished(true)}
      proctored={proctored}
      defaultFinishOpen={defaultFinishOpen}
      logo={<strong style={{ fontSize: 18 }}>Nilgiri Foods</strong>}
    >
      <QuestionCard
        number={current + 1}
        total={TOTAL}
        marks="2 marks"
        question={q.text}
        kind={q.kind}
        options={q.options.map((label, i) => ({ id: `o${i}`, label }))}
        value={answers[current] ?? []}
        onChange={(v) => setAnswers({ ...answers, [current]: v })}
        markedForReview={Boolean(marked[current])}
        onMarkedForReviewChange={(m) => setMarked({ ...marked, [current]: m })}
        onPrevious={current > 0 ? () => setCurrent(current - 1) : undefined}
        onNext={current < TOTAL - 1 ? () => setCurrent(current + 1) : undefined}
      />
    </ExamShell>
  );
}

export const Start: S = { render: () => <ExamDemo /> };

export const MidTestNavigatorStates: S = {
  name: 'Mid-test (navigator states)',
  render: () => <ExamDemo start="mid" current={11} seconds={1375} />,
};

export const FiveMinuteWarning: S = {
  name: '5-minute warning',
  render: () => <ExamDemo start="mid" current={14} seconds={287} />,
};

export const LastMinute: S = { render: () => <ExamDemo start="mid" current={19} seconds={42} /> };

export const OfflineAutosave: S = {
  name: 'Offline autosave',
  render: () => <ExamDemo start="mid" current={12} seconds={1100} saveStatus="offline" />,
};

export const Saving: S = { render: () => <ExamDemo start="mid" current={12} seconds={1100} saveStatus="saving" /> };

export const FinishConfirmation: S = { render: () => <ExamDemo start="mid" current={19} seconds={640} defaultFinishOpen /> };

export const NotProctored: S = { render: () => <ExamDemo proctored={false} /> };

export const Mobile: S = {
  render: () => <ExamDemo start="mid" current={2} seconds={287} />,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
};

export const Parts: S = {
  render: () => (
    <div style={{ padding: 24 }}>
      <Stack width={720}>
        <Section title="Timer" note="Warning tone from 5 minutes, with words. Never flashes. Announced at 5 and 1 minute only.">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <ExamTimer seconds={5400} />
            <ExamTimer seconds={1375} />
            <ExamTimer seconds={287} />
            <ExamTimer seconds={42} />
            <ExamTimer seconds={0} />
          </div>
        </Section>
        <Section title="Autosave">
          <AutosaveIndicator status="saving" />
          <AutosaveIndicator status="saved" savedAt="10:42" />
          <AutosaveIndicator status="saved" savedAt="14:05" />
          <AutosaveIndicator status="offline" />
        </Section>
        <Section title="Proctoring notice" note="Calm and factual; not an alert.">
          <ProctoringNotice />
        </Section>
        <Section title="Navigator: 60 questions, 6 per row">
          <div style={{ width: 360 }}>
            <QuestionNavigator
              columns={6}
              current={23}
              onNavigate={() => {}}
              questions={Array.from({ length: 60 }, (_, i) => ({ answered: i < 23 && i % 7 !== 2, markedForReview: i % 11 === 5 }))}
            />
          </div>
        </Section>
      </Stack>
    </div>
  ),
};

export const NavigatorFocus: S = {
  name: 'Navigator (focus visible)',
  parameters: { pseudo: { focusVisible: true } },
  render: () => (
    <div style={{ padding: 24, width: 320 }}>
      <QuestionNavigator current={2} onNavigate={() => {}} questions={[{ answered: true, markedForReview: false }, { answered: false, markedForReview: true }, { answered: false, markedForReview: false }, { answered: true, markedForReview: false }, { answered: false, markedForReview: false }]} />
    </div>
  ),
};

export const LongQuestion: S = {
  render: function Render() {
    const [v, setV] = useState<string[]>([]);
    const [m, setM] = useState(false);
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <QuestionCard
          number={17}
          total={40}
          marks="4 marks"
          kind="single"
          question="Sridhar Industries pays Arjun Kulkarni a monthly basic of ₹42,000, HRA of ₹16,800 and a special allowance of ₹21,200. He lives in rented accommodation in Chennai and pays ₹18,000 a month in rent. Under the old tax regime, how much of his HRA is exempt for the year, given that Chennai is a metro city for this calculation?"
          options={[
            { id: 'a', label: '₹1,65,600 — actual rent paid minus 10% of basic' },
            { id: 'b', label: '₹2,01,600 — the full HRA received for the year' },
            { id: 'c', label: '₹2,52,000 — 50% of basic salary for the year' },
            { id: 'd', label: '₹1,65,600, but only if the landlord’s PAN is given, because annual rent is above ₹1,00,000' },
          ]}
          value={v}
          onChange={setV}
          markedForReview={m}
          onMarkedForReviewChange={setM}
          onPrevious={() => {}}
          onNext={() => {}}
        />
      </div>
    );
  },
};
