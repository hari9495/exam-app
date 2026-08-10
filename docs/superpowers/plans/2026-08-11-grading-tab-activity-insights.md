# Grading-Tab Tab/Background-App Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface proctoring's background-app/tab-switch/screen-share/paste signals — currently
only visible via ad hoc database queries — directly in the recruiter's Grading tab
(`GradingQueuePanel`) and Results tab (`CandidateReportPanel`), both as a per-attempt summary and,
where the timing can be estimated, as a banner above the specific question.

**Architecture:** One new pure function (`computeTabActivity`) turns a list of `ProctoringEvent`s
plus an attempt's `Answer`s into a grouped summary and a per-question attribution map. Two existing
backend read paths (`ReportsService.getCandidateDetail`, `ExamsService.getPendingGrading`) call it
and thread the results onto their existing DTOs. Two new small React components render it; two
existing panels each grow by one section and one banner.

**Tech Stack:** NestJS (Prisma, `@exam-platform/shared`), Next.js/React, Jest + React Testing
Library — all already in use, no new dependencies.

## Global Constraints

- Attribution rule: sort an attempt's answers ascending by `answeredAt`. For an event at
  `occurredAt`, attribute it to the first answer whose `answeredAt >= occurredAt`. If none exists,
  attribute it to the last answer. If the attempt has zero answers, the event is not attributed to
  any question (summary-only).
- `computeTabActivity` must be a pure function — no I/O, no Prisma types — taking pre-filtered,
  pre-signed events plus answers.
- Exactly eight event types are in scope: `background_app_detected`, `remote_access_suspected`,
  `tab_switch`, `window_blur`, `screen_share_started`, `screen_share_stopped`, `copy_paste`,
  `editor_paste`.
- `getPendingGrading` must pass `computeTabActivity` **every** answer on the attempt (MCQ
  included), never pre-filtered to code-only — the attribution timeline needs every save in order,
  even though only code questions ever display a banner.
- No new AI calls anywhere in this feature. The one-line takeaway reuses the existing
  `ProctoringAnalysis.summary` field, rendered for the first time — never regenerated.
- Empty-state rule: nothing renders (no "0 detected" placeholder) when there is nothing to show,
  in both the summary section and the per-question banner.
- Every per-question banner instance carries a fixed "estimated timing" disclaimer.

---

### Task 1: `computeTabActivity` pure function + unit tests

**Files:**
- Create: `apps/api/src/reports/tab-activity.ts`
- Test: `apps/api/src/reports/tab-activity.spec.ts`

**Interfaces:**
- Produces (used by Tasks 2 and 3):
  ```ts
  export const TAB_ACTIVITY_EVENT_TYPES: readonly string[];

  export interface TabActivityEvent {
    eventType: string;
    occurredAt: Date;
    metadata: Record<string, unknown>;
  }

  export interface TabActivityAnswer {
    questionId: string;
    answeredAt: Date;
  }

  export interface TabActivityEventTypeSummary {
    eventType: string;
    count: number;
    toolCounts?: Record<string, number>;
  }

  export interface QuestionTabActivityEntry {
    eventType: string;
    occurredAt: string;
    toolName?: string;
    reasoning?: string;
    screenshot?: string;
  }

  export interface TabActivityResult {
    summary: TabActivityEventTypeSummary[];
    byQuestionId: Map<string, QuestionTabActivityEntry[]>;
  }

  export function computeTabActivity(
    events: TabActivityEvent[],
    answers: TabActivityAnswer[],
  ): TabActivityResult;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/reports/tab-activity.spec.ts`:

```ts
import { computeTabActivity, TAB_ACTIVITY_EVENT_TYPES } from './tab-activity';

describe('computeTabActivity', () => {
  it('returns an empty summary and no attribution for no events', () => {
    const result = computeTabActivity([], [{ questionId: 'q1', answeredAt: new Date('2026-01-01T00:05:00Z') }]);

    expect(result.summary).toEqual([]);
    expect(result.byQuestionId.size).toBe(0);
  });

  it('attributes an event to the first answer saved at or after it occurred', () => {
    const answers = [
      { questionId: 'q1', answeredAt: new Date('2026-01-01T00:05:00Z') },
      { questionId: 'q2', answeredAt: new Date('2026-01-01T00:10:00Z') },
    ];
    const events = [{ eventType: 'tab_switch', occurredAt: new Date('2026-01-01T00:07:00Z'), metadata: {} }];

    const result = computeTabActivity(events, answers);

    expect(result.byQuestionId.get('q2')).toEqual([
      { eventType: 'tab_switch', occurredAt: '2026-01-01T00:07:00.000Z', toolName: undefined, reasoning: undefined, screenshot: undefined },
    ]);
    expect(result.byQuestionId.has('q1')).toBe(false);
  });

  it('attributes an event before the first answer to that first answer', () => {
    const answers = [{ questionId: 'q1', answeredAt: new Date('2026-01-01T00:05:00Z') }];
    const events = [{ eventType: 'window_blur', occurredAt: new Date('2026-01-01T00:00:00Z'), metadata: {} }];

    const result = computeTabActivity(events, answers);

    expect(result.byQuestionId.get('q1')).toHaveLength(1);
  });

  it('attributes an event after the last answer to that last answer', () => {
    const answers = [
      { questionId: 'q1', answeredAt: new Date('2026-01-01T00:05:00Z') },
      { questionId: 'q2', answeredAt: new Date('2026-01-01T00:10:00Z') },
    ];
    const events = [{ eventType: 'screen_share_stopped', occurredAt: new Date('2026-01-01T00:20:00Z'), metadata: {} }];

    const result = computeTabActivity(events, answers);

    expect(result.byQuestionId.get('q2')).toHaveLength(1);
    expect(result.byQuestionId.has('q1')).toBe(false);
  });

  it('leaves events unattributed when the attempt has zero saved answers, but still counts them in the summary', () => {
    const events = [{ eventType: 'tab_switch', occurredAt: new Date('2026-01-01T00:00:00Z'), metadata: {} }];

    const result = computeTabActivity(events, []);

    expect(result.byQuestionId.size).toBe(0);
    expect(result.summary).toEqual([{ eventType: 'tab_switch', count: 1 }]);
  });

  it('groups background_app_detected counts by toolName, defaulting a missing toolName to "unknown"', () => {
    const answers = [{ questionId: 'q1', answeredAt: new Date('2026-01-01T00:10:00Z') }];
    const events = [
      { eventType: 'background_app_detected', occurredAt: new Date('2026-01-01T00:01:00Z'), metadata: { toolName: 'WhatsApp' } },
      { eventType: 'background_app_detected', occurredAt: new Date('2026-01-01T00:02:00Z'), metadata: { toolName: 'WhatsApp' } },
      { eventType: 'background_app_detected', occurredAt: new Date('2026-01-01T00:03:00Z'), metadata: {} },
    ];

    const result = computeTabActivity(events, answers);

    expect(result.summary).toEqual([
      { eventType: 'background_app_detected', count: 3, toolCounts: { WhatsApp: 2, unknown: 1 } },
    ]);
  });

  it('does not group non-tool event types by toolName', () => {
    const answers = [{ questionId: 'q1', answeredAt: new Date('2026-01-01T00:10:00Z') }];
    const events = [{ eventType: 'tab_switch', occurredAt: new Date('2026-01-01T00:01:00Z'), metadata: {} }];

    const result = computeTabActivity(events, answers);

    expect(result.summary).toEqual([{ eventType: 'tab_switch', count: 1 }]);
  });

  it('carries toolName, reasoning, and screenshot through to the per-question entry when present', () => {
    const answers = [{ questionId: 'q1', answeredAt: new Date('2026-01-01T00:10:00Z') }];
    const events = [
      {
        eventType: 'remote_access_suspected',
        occurredAt: new Date('2026-01-01T00:01:00Z'),
        metadata: { toolName: 'AnyDesk', reasoning: 'Remote-control toolbar visible', screenshot: 'https://signed.example/x.jpg' },
      },
    ];

    const result = computeTabActivity(events, answers);

    expect(result.byQuestionId.get('q1')).toEqual([
      {
        eventType: 'remote_access_suspected',
        occurredAt: '2026-01-01T00:01:00.000Z',
        toolName: 'AnyDesk',
        reasoning: 'Remote-control toolbar visible',
        screenshot: 'https://signed.example/x.jpg',
      },
    ]);
  });

  it('exports the eight in-scope event types', () => {
    expect(TAB_ACTIVITY_EVENT_TYPES).toEqual([
      'background_app_detected', 'remote_access_suspected', 'tab_switch', 'window_blur',
      'screen_share_started', 'screen_share_stopped', 'copy_paste', 'editor_paste',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=apps/api -- tab-activity`
Expected: FAIL with `Cannot find module './tab-activity'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/reports/tab-activity.ts`:

```ts
export const TAB_ACTIVITY_EVENT_TYPES = [
  'background_app_detected',
  'remote_access_suspected',
  'tab_switch',
  'window_blur',
  'screen_share_started',
  'screen_share_stopped',
  'copy_paste',
  'editor_paste',
] as const;

// The two AI-driven screen-analysis events carry which tool was seen -- everything else in scope
// (tab switches, window blur, screen-share toggles, pastes) is a plain browser/DOM signal with no
// "tool" to group by.
const TOOL_NAME_EVENT_TYPES = new Set<string>(['background_app_detected', 'remote_access_suspected']);

export interface TabActivityEvent {
  eventType: string;
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

export interface TabActivityAnswer {
  questionId: string;
  answeredAt: Date;
}

export interface TabActivityEventTypeSummary {
  eventType: string;
  count: number;
  toolCounts?: Record<string, number>;
}

export interface QuestionTabActivityEntry {
  eventType: string;
  occurredAt: string;
  toolName?: string;
  reasoning?: string;
  screenshot?: string;
}

export interface TabActivityResult {
  summary: TabActivityEventTypeSummary[];
  byQuestionId: Map<string, QuestionTabActivityEntry[]>;
}

// Placement of an event against a question is inferred, not exact -- ProctoringEvent has no
// questionId (see docs/superpowers/specs/2026-08-11-grading-tab-activity-insights-design.md).
// Attribution rule: sort answers ascending by answeredAt; an event goes to the first answer saved
// at or after it occurred (the question the candidate was on when they next saved), or the last
// answer if it happened after every save. Zero answers means no attribution is possible at all.
export function computeTabActivity(events: TabActivityEvent[], answers: TabActivityAnswer[]): TabActivityResult {
  const summaryByType = new Map<string, TabActivityEventTypeSummary>();
  const byQuestionId = new Map<string, QuestionTabActivityEntry[]>();
  const sortedAnswers = [...answers].sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());

  for (const event of events) {
    let entry = summaryByType.get(event.eventType);
    if (!entry) {
      entry = { eventType: event.eventType, count: 0 };
      summaryByType.set(event.eventType, entry);
    }
    entry.count += 1;
    if (TOOL_NAME_EVENT_TYPES.has(event.eventType)) {
      const toolName = typeof event.metadata.toolName === 'string' && event.metadata.toolName ? event.metadata.toolName : 'unknown';
      entry.toolCounts = entry.toolCounts ?? {};
      entry.toolCounts[toolName] = (entry.toolCounts[toolName] ?? 0) + 1;
    }

    if (sortedAnswers.length === 0) {
      continue;
    }
    const next = sortedAnswers.find((answer) => answer.answeredAt.getTime() >= event.occurredAt.getTime());
    const attributedTo = next ?? sortedAnswers[sortedAnswers.length - 1];
    const questionEntry: QuestionTabActivityEntry = {
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      toolName: typeof event.metadata.toolName === 'string' ? event.metadata.toolName : undefined,
      reasoning: typeof event.metadata.reasoning === 'string' ? event.metadata.reasoning : undefined,
      screenshot: typeof event.metadata.screenshot === 'string' ? event.metadata.screenshot : undefined,
    };
    const list = byQuestionId.get(attributedTo.questionId) ?? [];
    list.push(questionEntry);
    byQuestionId.set(attributedTo.questionId, list);
  }

  return { summary: [...summaryByType.values()], byQuestionId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=apps/api -- tab-activity`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/tab-activity.ts apps/api/src/reports/tab-activity.spec.ts
git commit -m "feat(reports): add computeTabActivity for background-app/tab-switch insights"
```

---

### Task 2: `ReportsService.getCandidateDetail` integration

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts:1-4` (imports), `:110-123` (interfaces),
  `:342-464` (`getCandidateDetail` body)
- Test: `apps/api/src/reports/reports.service.spec.ts:352-382` (update two existing exact-equality
  assertions), add new tests in the `getCandidateDetail` describe block (starts line 269)

**Interfaces:**
- Consumes: `computeTabActivity`, `TabActivityEvent`, `TabActivityEventTypeSummary`,
  `QuestionTabActivityEntry`, `TAB_ACTIVITY_EVENT_TYPES` from `./tab-activity` (Task 1).
- Produces: `CandidateDetail.tabActivitySummary: TabActivityEventTypeSummary[]`,
  `CandidateDetailQuestion.tabActivity: QuestionTabActivityEntry[]` — consumed by Task 5/7
  (frontend components) via the API response.

- [ ] **Step 1: Update the two existing exact-equality tests so they still pass once the new field exists**

In `apps/api/src/reports/reports.service.spec.ts`, the "no attempt yet" test currently asserts:

```ts
      expect(detail).toEqual({
        candidateId: 'cand-2', candidateName: 'Bob', status: 'invited',
        score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
        proctoringAnalysis: null, integrityAnalysis: null, sections: [], webcamTimeline: [],
      });
```

Change it to:

```ts
      expect(detail).toEqual({
        candidateId: 'cand-2', candidateName: 'Bob', status: 'invited',
        score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
        proctoringAnalysis: null, integrityAnalysis: null, sections: [], webcamTimeline: [],
        tabActivitySummary: [],
      });
```

And the per-question exact-equality assertions (two occurrences, for `q1` and `q2`):

```ts
      expect(detail.sections[0].questions[0]).toEqual({
        questionId: 'q1', questionText: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0,
        options: [{ id: 'opt-a', text: 'A' }, { id: 'opt-b', text: 'B' }],
        selectedOptionIds: ['opt-a'], correctOptionIds: ['opt-a'],
        isCorrect: true, marksAwarded: 5, counted: true,
        answerText: null, codeLanguage: null, gradingFeedback: null,
      });
      expect(detail.sections[0].questions[1]).toEqual({
        questionId: 'q2', questionText: 'Q2 text', type: 'single_mcq', marks: 6, negativeMarks: 0,
        options: [{ id: 'opt-c2', text: 'C' }],
        selectedOptionIds: [], correctOptionIds: ['opt-c2'],
        isCorrect: null, marksAwarded: null, counted: true,
        answerText: null, codeLanguage: null, gradingFeedback: null,
      });
```

become:

```ts
      expect(detail.sections[0].questions[0]).toEqual({
        questionId: 'q1', questionText: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0,
        options: [{ id: 'opt-a', text: 'A' }, { id: 'opt-b', text: 'B' }],
        selectedOptionIds: ['opt-a'], correctOptionIds: ['opt-a'],
        isCorrect: true, marksAwarded: 5, counted: true,
        answerText: null, codeLanguage: null, gradingFeedback: null,
        tabActivity: [],
      });
      expect(detail.sections[0].questions[1]).toEqual({
        questionId: 'q2', questionText: 'Q2 text', type: 'single_mcq', marks: 6, negativeMarks: 0,
        options: [{ id: 'opt-c2', text: 'C' }],
        selectedOptionIds: [], correctOptionIds: ['opt-c2'],
        isCorrect: null, marksAwarded: null, counted: true,
        answerText: null, codeLanguage: null, gradingFeedback: null,
        tabActivity: [],
      });
```

- [ ] **Step 2: Write the new failing tests**

Add to the `describe('getCandidateDetail', ...)` block in `apps/api/src/reports/reports.service.spec.ts`
(after the existing tests, before the closing `});` of that describe block):

```ts
    it('builds an attempt-level tabActivitySummary from background-app and tab-switch ProctoringEvents', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted' }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Coding', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: '[]', isCorrect: null, marksAwarded: null, answeredAt: new Date('2026-01-01T00:10:00Z') }],
          }),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [] }]) },
        proctoringEvent: {
          findMany: jest.fn((args: { where: { eventType: { startsWith?: string; in?: string[] } } }) =>
            args.where.eventType.startsWith === 'webcam_'
              ? Promise.resolve([])
              : Promise.resolve([
                  { eventType: 'background_app_detected', occurredAt: new Date('2026-01-01T00:01:00Z'), metadataJson: JSON.stringify({ toolName: 'WhatsApp' }) },
                  { eventType: 'background_app_detected', occurredAt: new Date('2026-01-01T00:02:00Z'), metadataJson: JSON.stringify({ toolName: 'WhatsApp' }) },
                  { eventType: 'tab_switch', occurredAt: new Date('2026-01-01T00:03:00Z'), metadataJson: null },
                ]),
          ),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.tabActivitySummary).toEqual([
        { eventType: 'background_app_detected', count: 2, toolCounts: { WhatsApp: 2 } },
        { eventType: 'tab_switch', count: 1 },
      ]);
    });

    it('places a background-app event above the question the candidate saved next, with a signed screenshot', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted' }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Coding', questionIds: ['q1', 'q2'] }]),
            answers: [
              { questionId: 'q1', selectedOptionIdsJson: '[]', isCorrect: null, marksAwarded: null, answeredAt: new Date('2026-01-01T00:05:00Z') },
              { questionId: 'q2', selectedOptionIdsJson: '[]', isCorrect: null, marksAwarded: null, answeredAt: new Date('2026-01-01T00:10:00Z') },
            ],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [] },
            { id: 'q2', text: 'Q2', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn((args: { where: { eventType: { startsWith?: string; in?: string[] } } }) =>
            args.where.eventType.startsWith === 'webcam_'
              ? Promise.resolve([])
              : Promise.resolve([
                  {
                    eventType: 'background_app_detected',
                    occurredAt: new Date('2026-01-01T00:07:00Z'),
                    metadataJson: JSON.stringify({ toolName: 'WhatsApp', reasoning: 'Taskbar icon visible', screenshot: 'https://blob.example/raw.jpg' }),
                  },
                ]),
          ),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.signIfOurs.mockImplementation(async (value: string) => `${value}?signed=1`);

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.sections[0].questions[0].tabActivity).toEqual([]);
      expect(detail.sections[0].questions[1].tabActivity).toEqual([
        {
          eventType: 'background_app_detected',
          occurredAt: '2026-01-01T00:07:00.000Z',
          toolName: 'WhatsApp',
          reasoning: 'Taskbar icon visible',
          screenshot: 'https://blob.example/raw.jpg?signed=1',
        },
      ]);
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace=apps/api -- reports.service`
Expected: FAIL — the two updated exact-equality tests fail on the missing `tabActivitySummary`/`tabActivity`
keys, and the two new tests fail because `proctoringEvent.findMany` is only ever called once (for
webcam events) so the mock's `in`-branch is never exercised and `detail.tabActivitySummary` is `undefined`.

- [ ] **Step 4: Update the imports and interfaces**

In `apps/api/src/reports/reports.service.ts`, change line 4 from:

```ts
import { signProctoringEvidence } from '../common/sign-proctoring-evidence';
```

to:

```ts
import { signProctoringEvidence } from '../common/sign-proctoring-evidence';
import { computeTabActivity, TAB_ACTIVITY_EVENT_TYPES, TabActivityEvent, TabActivityEventTypeSummary, QuestionTabActivityEntry } from './tab-activity';
```

Change `CandidateDetailQuestion` (line 59-78) from:

```ts
interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
  counted: boolean;
  // Code questions only. Once an attempt is finalized its status leaves pending_manual_grade,
  // so the grading queue stops listing it and the submitted code had nowhere left to be read.
  // Carrying it on the report keeps the work reviewable after grading, which is when a second
  // opinion is actually wanted. Null for every other question type.
  answerText: string | null;
  codeLanguage: string | null;
  gradingFeedback: string | null;
}
```

to:

```ts
interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
  counted: boolean;
  // Code questions only. Once an attempt is finalized its status leaves pending_manual_grade,
  // so the grading queue stops listing it and the submitted code had nowhere left to be read.
  // Carrying it on the report keeps the work reviewable after grading, which is when a second
  // opinion is actually wanted. Null for every other question type.
  answerText: string | null;
  codeLanguage: string | null;
  gradingFeedback: string | null;
  tabActivity: QuestionTabActivityEntry[];
}
```

Change the `CandidateDetail` interface at line 110-123 from:

```ts
export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  integrityAnalysis: IntegritySummary;
  sections: CandidateDetailSection[];
  webcamTimeline: WebcamTimelineEntry[];
}
```

to:

```ts
export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  integrityAnalysis: IntegritySummary;
  sections: CandidateDetailSection[];
  webcamTimeline: WebcamTimelineEntry[];
  tabActivitySummary: TabActivityEventTypeSummary[];
}
```

- [ ] **Step 5: Update the two early-return branches**

Both

```ts
    if (!row.attemptId) {
      return { ...base, sections: [], webcamTimeline: [] };
    }
```

and

```ts
      if (!attempt) {
        return { ...base, sections: [], webcamTimeline: [] };
      }
```

become (respectively):

```ts
    if (!row.attemptId) {
      return { ...base, sections: [], webcamTimeline: [], tabActivitySummary: [] };
    }
```

```ts
      if (!attempt) {
        return { ...base, sections: [], webcamTimeline: [], tabActivitySummary: [] };
      }
```

- [ ] **Step 6: Fetch and sign the new event types, compute tab activity, and thread it through**

Immediately after the existing webcam-events block (ends with the `webcamTimeline` `const`
assignment, right before `const sectionSnapshot: SectionSnapshotEntryShape[] = ...`), insert:

```ts
      const tabActivityEvents = await tx.proctoringEvent.findMany({
        where: { attemptId: row.attemptId as string, eventType: { in: [...TAB_ACTIVITY_EVENT_TYPES] } },
        orderBy: { occurredAt: 'asc' },
      });
      const signedTabActivityEvents: TabActivityEvent[] = await Promise.all(
        tabActivityEvents.map(async (e) => {
          let parsed: unknown = {};
          if (e.metadataJson) {
            try {
              parsed = JSON.parse(e.metadataJson);
            } catch {
              parsed = {};
            }
          }
          const signed = ((await signProctoringEvidence(this.blobStorage, parsed)) ?? {}) as Record<string, unknown>;
          return { eventType: e.eventType, occurredAt: e.occurredAt, metadata: signed };
        }),
      );
      const tabActivity = computeTabActivity(
        signedTabActivityEvents,
        attempt.answers.map((answer) => ({ questionId: answer.questionId, answeredAt: answer.answeredAt })),
      );
```

Then, in the per-question mapping (the `section.questionIds.map((questionId) => { ... })` block),
add `tabActivity` as the last field of the returned object — change:

```ts
              answerText: question?.type === 'code' ? (answer?.answerText ?? null) : null,
              codeLanguage: question?.type === 'code' ? (answer?.codeLanguage ?? null) : null,
              gradingFeedback: question?.type === 'code' ? (answer?.gradingFeedback ?? null) : null,
            };
```

to:

```ts
              answerText: question?.type === 'code' ? (answer?.answerText ?? null) : null,
              codeLanguage: question?.type === 'code' ? (answer?.codeLanguage ?? null) : null,
              gradingFeedback: question?.type === 'code' ? (answer?.gradingFeedback ?? null) : null,
              tabActivity: tabActivity.byQuestionId.get(questionId) ?? [],
            };
```

Finally, change the function's last line from:

```ts
      return { ...base, sections, webcamTimeline };
```

to:

```ts
      return { ...base, sections, webcamTimeline, tabActivitySummary: tabActivity.summary };
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test --workspace=apps/api -- reports.service`
Expected: PASS, all `getCandidateDetail` tests including the 2 new ones

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.service.spec.ts
git commit -m "feat(reports): surface tab activity summary and per-question attribution on candidate detail"
```

---

### Task 3: `ExamsService.getPendingGrading` integration

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts:1-13` (imports), `:79-97` (interfaces),
  `:1130-1167` (`getPendingGrading` body)
- Test: `apps/api/src/exams/exams.service.spec.ts:2246-2303` (existing `getPendingGrading` tests'
  tx mocks, plus new tests)

**Interfaces:**
- Consumes: `computeTabActivity`, `TabActivityEvent`, `TabActivityEventTypeSummary`,
  `QuestionTabActivityEntry`, `TAB_ACTIVITY_EVENT_TYPES` from `../reports/tab-activity` (Task 1);
  `signProctoringEvidence` from `../common/sign-proctoring-evidence` (already exists, not yet
  imported in this file).
- Produces: `PendingGradingRow.tabActivitySummary: TabActivityEventTypeSummary[]`,
  `PendingGradingRow.proctoringAnalysis: { riskLevel: string | null; summary: string | null } |
  null`, `PendingGradingCodeQuestion.tabActivity: QuestionTabActivityEntry[]` — consumed by Task 6
  (`GradingQueuePanel`).

- [ ] **Step 1: Update the two existing tests' tx mocks so they still pass once the new query exists**

In `apps/api/src/exams/exams.service.spec.ts`, both tests in `describe('getPendingGrading', ...)`
build their tx mock as:

```ts
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) }, attempt: { findMany: jest.fn().mockResolvedValue([attempt]) } }),
      );
```

Change both occurrences to add a `proctoringEvent` mock:

```ts
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({
          exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
          attempt: { findMany: jest.fn().mockResolvedValue([attempt]) },
          proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
        }),
      );
```

- [ ] **Step 2: Write the new failing tests**

Add to the `describe('getPendingGrading', ...)` block, after the existing two tests (before its
closing `});`):

```ts
    it('groups background-app detections into tabActivitySummary and carries the AI proctoring narrative', async () => {
      const attempt = {
        id: 'attempt-1',
        invitation: { candidateId: 'cand-1', candidate: { name: 'Ada' } },
        proctoringAnalysis: { riskLevel: 'high', summary: 'Multiple background apps detected.' },
        answers: [
          {
            questionId: 'q-1', answeredAt: new Date('2026-01-01T00:10:00Z'), answerText: 'print(1)',
            codeLanguage: 'python', marksAwarded: null, gradingFeedback: null,
            question: { type: 'code', text: 'x', difficulty: 'medium', starterCode: null, marks: 10 },
          },
        ],
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({
          exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
          attempt: { findMany: jest.fn().mockResolvedValue([attempt]) },
          proctoringEvent: {
            findMany: jest.fn().mockResolvedValue([
              {
                attemptId: 'attempt-1', eventType: 'background_app_detected',
                occurredAt: new Date('2026-01-01T00:01:00Z'),
                metadataJson: JSON.stringify({ toolName: 'WhatsApp' }),
              },
            ]),
          },
        }),
      );

      const result = await service.getPendingGrading(context, 'exam-1');

      expect(result[0].tabActivitySummary).toEqual([
        { eventType: 'background_app_detected', count: 1, toolCounts: { WhatsApp: 1 } },
      ]);
      expect(result[0].proctoringAnalysis).toEqual({ riskLevel: 'high', summary: 'Multiple background apps detected.' });
      expect(result[0].codeQuestions[0].tabActivity).toEqual([
        { eventType: 'background_app_detected', occurredAt: '2026-01-01T00:01:00.000Z', toolName: 'WhatsApp', reasoning: undefined, screenshot: undefined },
      ]);
    });

    it('attributes tab activity using every answer on the attempt, including MCQs that never appear in codeQuestions', async () => {
      const attempt = {
        id: 'attempt-1',
        invitation: { candidateId: 'cand-1', candidate: { name: 'Ada' } },
        proctoringAnalysis: null,
        answers: [
          { questionId: 'mcq-1', answeredAt: new Date('2026-01-01T00:05:00Z'), answerText: null, codeLanguage: null, marksAwarded: null, gradingFeedback: null, question: { type: 'single_mcq', text: 'm', difficulty: 'easy', starterCode: null, marks: 1 } },
          { questionId: 'code-1', answeredAt: new Date('2026-01-01T00:10:00Z'), answerText: 'print(1)', codeLanguage: 'python', marksAwarded: null, gradingFeedback: null, question: { type: 'code', text: 'x', difficulty: 'medium', starterCode: null, marks: 10 } },
        ],
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({
          exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
          attempt: { findMany: jest.fn().mockResolvedValue([attempt]) },
          proctoringEvent: {
            findMany: jest.fn().mockResolvedValue([
              // Occurs right after the MCQ was saved and before the code question -- must attach
              // to mcq-1 (never shown), not code-1, proving MCQs are not filtered out of the
              // timeline before attribution runs.
              { attemptId: 'attempt-1', eventType: 'tab_switch', occurredAt: new Date('2026-01-01T00:06:00Z'), metadataJson: null },
            ]),
          },
        }),
      );

      const result = await service.getPendingGrading(context, 'exam-1');

      expect(result[0].codeQuestions[0].tabActivity).toEqual([]);
      expect(result[0].tabActivitySummary).toEqual([{ eventType: 'tab_switch', count: 1 }]);
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace=apps/api -- exams.service -t getPendingGrading`
Expected: FAIL — `proctoringEvent.findMany` doesn't exist on the current code path yet, and
`result[0].tabActivitySummary` / `.proctoringAnalysis` / `codeQuestions[0].tabActivity` are all
`undefined`.

- [ ] **Step 4: Update the imports and interfaces**

Change line 13 of `apps/api/src/exams/exams.service.ts` from:

```ts
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
```

to:

```ts
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
import { signProctoringEvidence } from '../common/sign-proctoring-evidence';
import { computeTabActivity, TAB_ACTIVITY_EVENT_TYPES, TabActivityEvent, TabActivityEventTypeSummary, QuestionTabActivityEntry } from '../reports/tab-activity';
```

Change the interfaces at lines 79-97 from:

```ts
export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  /** easy | medium | hard, from the question bank -- context for how strictly to mark. */
  difficulty: string;
  starterCode: string | null;
  codeLanguage: string | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  codeQuestions: PendingGradingCodeQuestion[];
}
```

to:

```ts
export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  /** easy | medium | hard, from the question bank -- context for how strictly to mark. */
  difficulty: string;
  starterCode: string | null;
  codeLanguage: string | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
  tabActivity: QuestionTabActivityEntry[];
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  proctoringAnalysis: { riskLevel: string | null; summary: string | null } | null;
  tabActivitySummary: TabActivityEventTypeSummary[];
  codeQuestions: PendingGradingCodeQuestion[];
}
```

- [ ] **Step 5: Rewrite `getPendingGrading`**

Replace the entire method body (lines 1130-1167) with:

```ts
  async getPendingGrading(context: TenantContext, examId: string): Promise<PendingGradingRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const attempts = await tx.attempt.findMany({
        where: { examId, status: 'pending_manual_grade' },
        include: { invitation: { include: { candidate: true } }, answers: { include: { question: true } }, proctoringAnalysis: true },
      });

      const tabActivityRows = await tx.proctoringEvent.findMany({
        where: { attemptId: { in: attempts.map((attempt) => attempt.id) }, eventType: { in: [...TAB_ACTIVITY_EVENT_TYPES] } },
        orderBy: { occurredAt: 'asc' },
      });
      const eventsByAttemptId = new Map<string, typeof tabActivityRows>();
      for (const eventRow of tabActivityRows) {
        const list = eventsByAttemptId.get(eventRow.attemptId) ?? [];
        list.push(eventRow);
        eventsByAttemptId.set(eventRow.attemptId, list);
      }

      return Promise.all(
        attempts.map(async (attempt) => {
          const signedEvents: TabActivityEvent[] = await Promise.all(
            (eventsByAttemptId.get(attempt.id) ?? []).map(async (eventRow) => {
              let parsed: unknown = {};
              if (eventRow.metadataJson) {
                try {
                  parsed = JSON.parse(eventRow.metadataJson);
                } catch {
                  parsed = {};
                }
              }
              const signed = ((await signProctoringEvidence(this.blobStorage, parsed)) ?? {}) as Record<string, unknown>;
              return { eventType: eventRow.eventType, occurredAt: eventRow.occurredAt, metadata: signed };
            }),
          );
          // Every answer, MCQ included -- the attribution timeline needs every save in order,
          // even though codeQuestions below only ever lists the code ones (see Global Constraints).
          const tabActivity = computeTabActivity(
            signedEvents,
            attempt.answers.map((answer) => ({ questionId: answer.questionId, answeredAt: answer.answeredAt })),
          );

          return {
            attemptId: attempt.id,
            candidateId: attempt.invitation.candidateId,
            candidateName: attempt.invitation.candidate.name,
            proctoringAnalysis: attempt.proctoringAnalysis
              ? { riskLevel: attempt.proctoringAnalysis.riskLevel, summary: attempt.proctoringAnalysis.summary }
              : null,
            tabActivitySummary: tabActivity.summary,
            codeQuestions: attempt.answers
              // Code questions the candidate never wrote in are auto-zeroed at settlement and are
              // deliberately NOT listed here -- there is nothing for a human to judge, and showing
              // them meant clicking "Save grade: 0" through a run of empty editors before the
              // Finalize button unlocked. Filtering on answerText rather than marksAwarded matters:
              // a question the recruiter has already graded 0 must stay visible so they can revise it.
              // Predicate mirrors isAttemptedCode() in exam-runtime's attempt-settlement.service.ts.
              .filter((answer) => answer.question.type === 'code' && Boolean(answer.answerText?.trim()))
              .map((answer) => ({
                questionId: answer.questionId,
                questionText: answer.question.text,
                difficulty: answer.question.difficulty,
                starterCode: answer.question.starterCode,
                codeLanguage: answer.codeLanguage,
                answerText: answer.answerText,
                marks: answer.question.marks,
                marksAwarded: answer.marksAwarded,
                gradingFeedback: answer.gradingFeedback,
                tabActivity: tabActivity.byQuestionId.get(answer.questionId) ?? [],
              })),
          };
        }),
      );
    });
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test --workspace=apps/api -- exams.service -t getPendingGrading`
Expected: PASS, all 4 tests

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat(exams): surface tab activity summary and per-question attribution on the grading queue"
```

---

### Task 4: Frontend types

**Files:**
- Modify: `apps/web/lib/types.ts:542-558` (`CandidateDetailQuestion`), `:574-587` (`CandidateDetail`),
  `:666-684` (`PendingGradingCodeQuestion`, `PendingGradingRow`)

**Interfaces:**
- Consumes: none (mirrors the backend shapes from Tasks 2 and 3 by hand, matching the existing
  pattern in this file — there is no shared-types package between apps/api and apps/web).
- Produces: `TabActivityEventTypeSummary`, `QuestionTabActivityEntry` — consumed by Task 5
  (`TabActivity.tsx`) and Tasks 6/7 (panel integrations).

- [ ] **Step 1: Add the two new interfaces**

In `apps/web/lib/types.ts`, immediately before `export interface CandidateDetailQuestion {` (line
542), insert:

```ts
export interface TabActivityEventTypeSummary {
  eventType: string;
  count: number;
  toolCounts?: Record<string, number>;
}

export interface QuestionTabActivityEntry {
  eventType: string;
  occurredAt: string;
  toolName?: string;
  reasoning?: string;
  screenshot?: string;
}

```

- [ ] **Step 2: Add `tabActivity` to `CandidateDetailQuestion`**

Change:

```ts
export interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
  counted: boolean;
  /** Code questions only -- null for every other type. See reports.service.ts. */
  answerText: string | null;
  codeLanguage: string | null;
  gradingFeedback: string | null;
}
```

to:

```ts
export interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
  counted: boolean;
  /** Code questions only -- null for every other type. See reports.service.ts. */
  answerText: string | null;
  codeLanguage: string | null;
  gradingFeedback: string | null;
  /** Estimated from answer-save timing, not an exact link -- see tab-activity.ts. */
  tabActivity: QuestionTabActivityEntry[];
}
```

- [ ] **Step 3: Add `tabActivitySummary` to `CandidateDetail`**

Change:

```ts
export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  integrityAnalysis: IntegritySummary | null;
  sections: CandidateDetailSection[];
  webcamTimeline: WebcamTimelineEntry[];
}
```

to:

```ts
export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  integrityAnalysis: IntegritySummary | null;
  sections: CandidateDetailSection[];
  webcamTimeline: WebcamTimelineEntry[];
  tabActivitySummary: TabActivityEventTypeSummary[];
}
```

- [ ] **Step 4: Add the new fields to `PendingGradingCodeQuestion` and `PendingGradingRow`**

Change:

```ts
export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  /** easy | medium | hard, from the question bank. */
  difficulty: string;
  starterCode: string | null;
  codeLanguage: CodeLanguage | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  codeQuestions: PendingGradingCodeQuestion[];
}
```

to:

```ts
export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  /** easy | medium | hard, from the question bank. */
  difficulty: string;
  starterCode: string | null;
  codeLanguage: CodeLanguage | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
  /** Estimated from answer-save timing, not an exact link -- see tab-activity.ts. */
  tabActivity: QuestionTabActivityEntry[];
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  tabActivitySummary: TabActivityEventTypeSummary[];
  codeQuestions: PendingGradingCodeQuestion[];
}
```

- [ ] **Step 5: Type-check**

Run: `npm run typecheck --workspace=apps/web`
Expected: Errors in `GradingQueuePanel.tsx` / `CandidateReportPanel.tsx` (missing the new required
fields on the objects they build from these types) — these are the exact errors Tasks 6 and 7 fix.
No errors should point at `types.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts
git commit -m "feat(web): add TabActivityEventTypeSummary/QuestionTabActivityEntry frontend types"
```

---

### Task 5: `TabActivitySummaryCard` + `TabActivityBanner` shared components

**Files:**
- Create: `apps/web/components/TabActivity.tsx`
- Test: `apps/web/components/TabActivity.test.tsx`

**Interfaces:**
- Consumes: `TabActivityEventTypeSummary`, `QuestionTabActivityEntry`, `ProctoringAnalysisSummary`
  from `../lib/types` (Task 4); `Modal`, `StatusBadge` from `./ui` (already exist).
- Produces (consumed by Tasks 6 and 7):
  ```ts
  export function hasTabActivityContent(
    summary: TabActivityEventTypeSummary[],
    proctoringAnalysis?: ProctoringAnalysisSummary | null,
  ): boolean;

  export function TabActivitySummaryCard(props: {
    summary: TabActivityEventTypeSummary[];
    proctoringAnalysis?: ProctoringAnalysisSummary | null;
  }): JSX.Element;

  export function TabActivityBanner(props: { entries: QuestionTabActivityEntry[] }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/TabActivity.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hasTabActivityContent, TabActivitySummaryCard, TabActivityBanner } from './TabActivity';

describe('hasTabActivityContent', () => {
  it('is false when there is no summary and no narrative', () => {
    expect(hasTabActivityContent([], null)).toBe(false);
  });

  it('is true when the summary has entries even without a narrative', () => {
    expect(hasTabActivityContent([{ eventType: 'tab_switch', count: 1 }], null)).toBe(true);
  });

  it('is true when there is a narrative even with an empty summary', () => {
    expect(hasTabActivityContent([], { status: 'completed', riskLevel: 'high', summary: 'Suspicious pattern.' })).toBe(true);
  });
});

describe('TabActivitySummaryCard', () => {
  it('renders grouped tool counts and the AI narrative', () => {
    render(
      <TabActivitySummaryCard
        summary={[{ eventType: 'background_app_detected', count: 3, toolCounts: { WhatsApp: 2, Gmail: 1 } }]}
        proctoringAnalysis={{ status: 'completed', riskLevel: 'high', summary: 'Patterns consistent with outside help.' }}
      />,
    );

    expect(screen.getByText('WhatsApp × 2, Gmail × 1')).toBeInTheDocument();
    expect(screen.getByText('Patterns consistent with outside help.')).toBeInTheDocument();
  });

  it('renders a plain count for an event type with no toolCounts', () => {
    render(<TabActivitySummaryCard summary={[{ eventType: 'tab_switch', count: 4 }]} />);

    expect(screen.getByText('Tab switch × 4')).toBeInTheDocument();
  });
});

describe('TabActivityBanner', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<TabActivityBanner entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the estimated-timing disclaimer and expands reasoning/screenshot on click', async () => {
    render(
      <TabActivityBanner
        entries={[
          { eventType: 'background_app_detected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'WhatsApp', reasoning: 'Taskbar icon visible.', screenshot: 'https://example.com/shot.jpg' },
        ]}
      />,
    );

    expect(screen.getByText(/estimated timing/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /WhatsApp/ }));

    expect(screen.getByText('Taskbar icon visible.')).toBeInTheDocument();
    expect(screen.getByAltText('Screen capture')).toHaveAttribute('src', 'https://example.com/shot.jpg');
  });

  it('is not clickable when there is nothing to expand', () => {
    render(<TabActivityBanner entries={[{ eventType: 'tab_switch', occurredAt: '2026-01-01T00:07:00.000Z' }]} />);

    expect(screen.getByRole('button', { name: /Tab switch/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=apps/web -- TabActivity`
Expected: FAIL with `Cannot find module './TabActivity'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/TabActivity.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Modal, StatusBadge } from './ui';
import type { ProctoringAnalysisSummary, QuestionTabActivityEntry, TabActivityEventTypeSummary } from '../lib/types';

const EVENT_TYPE_LABEL: Record<string, string> = {
  background_app_detected: 'Background app detected',
  remote_access_suspected: 'Possible remote access',
  tab_switch: 'Tab switch',
  window_blur: 'Window lost focus',
  screen_share_started: 'Screen share started',
  screen_share_stopped: 'Screen share stopped',
  copy_paste: 'Copy/paste',
  editor_paste: 'Pasted into editor',
};

function describeSummaryEntry(entry: TabActivityEventTypeSummary): string {
  if (entry.toolCounts) {
    return Object.entries(entry.toolCounts)
      .map(([tool, count]) => `${tool} × ${count}`)
      .join(', ');
  }
  const label = EVENT_TYPE_LABEL[entry.eventType] ?? entry.eventType;
  return `${label} × ${entry.count}`;
}

/** Whether there is anything at all to show for an attempt -- the caller uses this to decide
 *  whether to render its own section/heading, so the "no '0 detected' noise" rule lives in one
 *  place instead of being re-derived at every call site. */
export function hasTabActivityContent(
  summary: TabActivityEventTypeSummary[],
  proctoringAnalysis?: ProctoringAnalysisSummary | null,
): boolean {
  return summary.length > 0 || Boolean(proctoringAnalysis?.summary);
}

interface TabActivitySummaryCardProps {
  summary: TabActivityEventTypeSummary[];
  proctoringAnalysis?: ProctoringAnalysisSummary | null;
}

/** Grouped counts of background apps / tab switches / screen-share toggles / out-of-editor pastes
 *  seen during an attempt, plus the AI's own narrative about the same evidence -- that narrative
 *  is already generated (ProctoringAnalysis.summary) but was never rendered anywhere until this
 *  component. Always renders its content once mounted; call hasTabActivityContent first to decide
 *  whether to render this (and any surrounding heading) at all. */
export function TabActivitySummaryCard({ summary, proctoringAnalysis }: TabActivitySummaryCardProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {summary.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.map((entry) => (
            <li key={entry.eventType} className="text-gray-700">
              {describeSummaryEntry(entry)}
            </li>
          ))}
        </ul>
      )}
      {proctoringAnalysis?.summary && <p className="text-xs text-gray-600">{proctoringAnalysis.summary}</p>}
    </div>
  );
}

interface TabActivityBannerProps {
  entries: QuestionTabActivityEntry[];
}

/** Compact banner above a question, one line per attributed event -- collapsed by default, click
 *  to see the AI's reasoning/screenshot when there is one. Placement is inferred from answer-save
 *  timing, not an exact link (see docs/superpowers/specs/2026-08-11-grading-tab-activity-insights-
 *  design.md), so every instance says so. */
export function TabActivityBanner({ entries }: TabActivityBannerProps) {
  const [expanded, setExpanded] = useState<QuestionTabActivityEntry | null>(null);
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      <div className="mb-2 flex flex-col gap-1">
        {entries.map((entry, index) => {
          const label = entry.toolName ?? EVENT_TYPE_LABEL[entry.eventType] ?? entry.eventType;
          const canExpand = Boolean(entry.reasoning || entry.screenshot);
          return (
            <button
              key={index}
              type="button"
              disabled={!canExpand}
              onClick={() => setExpanded(entry)}
              className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left text-xs text-amber-800 disabled:cursor-default"
            >
              <StatusBadge tone="warning">{label}</StatusBadge>
              <span>detected around this question — estimated timing{canExpand ? ', click for detail' : ''}</span>
            </button>
          );
        })}
      </div>
      <Modal open={expanded !== null} title={expanded?.toolName ?? expanded?.eventType ?? ''} onClose={() => setExpanded(null)}>
        {expanded?.reasoning && <p className="mb-3 text-sm text-gray-700">{expanded.reasoning}</p>}
        {expanded?.screenshot && <img src={expanded.screenshot} alt="Screen capture" className="w-full rounded" />}
      </Modal>
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=apps/web -- TabActivity`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/TabActivity.tsx apps/web/components/TabActivity.test.tsx
git commit -m "feat(web): add TabActivitySummaryCard and TabActivityBanner components"
```

---

### Task 6: `GradingQueuePanel` integration

**Files:**
- Modify: `apps/web/components/GradingQueuePanel.tsx:1-7` (imports), `:47-62` (`CodeQuestionGrader`
  render), `:167-197` (`AttemptGrader` render)
- Modify: `apps/web/components/GradingQueuePanel.test.tsx` (fixtures gain the new fields; one new
  test)

**Interfaces:**
- Consumes: `TabActivitySummaryCard`, `TabActivityBanner`, `hasTabActivityContent` from
  `./TabActivity` (Task 5); `row.tabActivitySummary`, `row.proctoringAnalysis`,
  `question.tabActivity` from `PendingGradingRow`/`PendingGradingCodeQuestion` (Tasks 3/4).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Update the test fixtures and write the new failing test**

In `apps/web/components/GradingQueuePanel.test.tsx`, add the new fields to `pendingRow` and
`secondRow` (and their nested `codeQuestions`):

```ts
const pendingRow = {
  attemptId: 'a1',
  candidateId: 'c1',
  candidateName: 'Alice',
  proctoringAnalysis: null,
  tabActivitySummary: [],
  codeQuestions: [
    { questionId: 'q1', questionText: 'Reverse a string', difficulty: 'hard', starterCode: null, codeLanguage: 'python', answerText: 'def reverse(s): return s[::-1]', marks: 10, marksAwarded: null, gradingFeedback: null, tabActivity: [] },
  ],
};
```

```ts
    const secondRow = {
      attemptId: 'a2',
      candidateId: 'c2',
      candidateName: 'Bob',
      proctoringAnalysis: null,
      tabActivitySummary: [],
      codeQuestions: [
        { questionId: 'q2', questionText: 'Sort a list', difficulty: 'easy', starterCode: null, codeLanguage: 'python', answerText: 'sorted(xs)', marks: 10, marksAwarded: 7, gradingFeedback: null, tabActivity: [] },
        { questionId: 'q3', questionText: 'Sum a list', difficulty: 'medium', starterCode: null, codeLanguage: 'python', answerText: 'sum(xs)', marks: 10, marksAwarded: null, gradingFeedback: null, tabActivity: [] },
      ],
    };
```

Add a new test, in the top-level `describe('GradingQueuePanel', ...)` block:

```ts
  it('shows a background-app banner above the question it was attributed to, and expands it on click', async () => {
    const rowWithActivity = {
      ...pendingRow,
      tabActivitySummary: [{ eventType: 'background_app_detected', count: 1, toolCounts: { WhatsApp: 1 } }],
      codeQuestions: [
        {
          ...pendingRow.codeQuestions[0],
          tabActivity: [{ eventType: 'background_app_detected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'WhatsApp', reasoning: 'Taskbar icon visible.', screenshot: 'https://example.com/shot.jpg' }],
        },
      ],
    };
    (usePendingGrading as jest.Mock).mockReturnValue({ data: [rowWithActivity], isLoading: false });
    renderPanel();

    expect(screen.getByText('WhatsApp × 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /WhatsApp/ }));

    expect(screen.getByText('Taskbar icon visible.')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npm test --workspace=apps/web -- GradingQueuePanel`
Expected: FAIL — `screen.getByText('WhatsApp × 1')` not found (nothing renders it yet)

- [ ] **Step 3: Update the component**

Change the import block at the top of `apps/web/components/GradingQueuePanel.tsx` from:

```tsx
import { Button, Card, Input, StatusBadge, useToast, type StatusTone } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { PendingGradingRow, PendingGradingCodeQuestion } from '../lib/types';
```

to:

```tsx
import { Button, Card, Input, StatusBadge, useToast, type StatusTone } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { PendingGradingRow, PendingGradingCodeQuestion } from '../lib/types';
import { TabActivitySummaryCard, TabActivityBanner, hasTabActivityContent } from './TabActivity';
```

In `CodeQuestionGrader`, change the opening of the returned JSX from:

```tsx
  return (
    <Card className="mb-3">
      <div className="mb-2 flex items-start justify-between gap-3">
```

to:

```tsx
  return (
    <Card className="mb-3">
      <TabActivityBanner entries={question.tabActivity} />
      <div className="mb-2 flex items-start justify-between gap-3">
```

In `AttemptGrader`, change:

```tsx
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronRight size={16} className={open ? 'rotate-90 text-gray-500 transition-transform' : 'text-gray-500 transition-transform'} aria-hidden="true" />
          <span className="text-base font-medium">{row.candidateName}</span>
          <span className={allGraded ? 'text-xs text-green-700' : 'text-xs text-gray-500'}>
            {row.codeQuestions.length === 0
              ? 'nothing attempted'
              : `${gradedCount} of ${row.codeQuestions.length} graded`}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {row.codeQuestions.length > 0 && (
            <Button variant="secondary" disabled={reviewingAll} onClick={handleReviewAll}>
              {reviewingAll ? 'Starting…' : `AI review all (${row.codeQuestions.length})`}
            </Button>
          )}
          <Button disabled={!allGraded || finalizeManualGrade.isPending} onClick={handleFinalize}>
            Finalize grade
          </Button>
        </div>
      </div>
```

to:

```tsx
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronRight size={16} className={open ? 'rotate-90 text-gray-500 transition-transform' : 'text-gray-500 transition-transform'} aria-hidden="true" />
          <span className="text-base font-medium">{row.candidateName}</span>
          <span className={allGraded ? 'text-xs text-green-700' : 'text-xs text-gray-500'}>
            {row.codeQuestions.length === 0
              ? 'nothing attempted'
              : `${gradedCount} of ${row.codeQuestions.length} graded`}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {row.codeQuestions.length > 0 && (
            <Button variant="secondary" disabled={reviewingAll} onClick={handleReviewAll}>
              {reviewingAll ? 'Starting…' : `AI review all (${row.codeQuestions.length})`}
            </Button>
          )}
          <Button disabled={!allGraded || finalizeManualGrade.isPending} onClick={handleFinalize}>
            Finalize grade
          </Button>
        </div>
      </div>
      {hasTabActivityContent(row.tabActivitySummary, row.proctoringAnalysis) && (
        <div className="border-t border-gray-200 px-3 py-2">
          <TabActivitySummaryCard summary={row.tabActivitySummary} proctoringAnalysis={row.proctoringAnalysis} />
        </div>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=apps/web -- GradingQueuePanel`
Expected: PASS, all tests including the new one

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/GradingQueuePanel.tsx apps/web/components/GradingQueuePanel.test.tsx
git commit -m "feat(web): show tab activity summary and per-question banners in the grading queue"
```

---

### Task 7: `CandidateReportPanel` integration

**Files:**
- Modify: `apps/web/components/CandidateReportPanel.tsx:1-17` (imports), `:231-233` (insert new
  section between Webcam Timeline and the Modal blocks), `:296-303` (insert banner above question
  text)
- Modify: `apps/web/components/CandidateReportPanel.test.tsx` (one new test; existing tests
  unaffected since they omit `tabActivitySummary`/`tabActivity` from their fixtures and the new
  code reads both with `?? []`, so undefined stays safe)

**Interfaces:**
- Consumes: `TabActivitySummaryCard`, `TabActivityBanner`, `hasTabActivityContent` from
  `./TabActivity` (Task 5); `candidate.tabActivitySummary`, `question.tabActivity` from
  `CandidateDetail`/`CandidateDetailQuestion` (Tasks 2/4).
- Produces: nothing new for later tasks. This is the final task in the plan.

- [ ] **Step 1: Write the new failing test**

Add to `apps/web/components/CandidateReportPanel.test.tsx`, inside the `describe('CandidateReportPanel', ...)`
block. This test needs its own `useCandidateReport` mock (rather than `renderPanel`, which hardcodes
`webcamTimeline: []` and no `tabActivitySummary`) so it can supply the new fields:

```ts
  it('shows a tab-activity summary and a per-question banner when the report has activity', async () => {
    (useCandidateReport as jest.Mock).mockReturnValue({
      data: {
        candidateName: 'Ada Lovelace',
        score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        integrityAnalysis: null,
        webcamTimeline: [],
        tabActivitySummary: [{ eventType: 'background_app_detected', count: 1, toolCounts: { WhatsApp: 1 } }],
        proctoringAnalysis: { status: 'completed', riskLevel: 'high', summary: 'Suspicious pattern noted.' },
        sections: [
          {
            sectionId: 's1', title: 'Coding', score: 10, maxScore: 10, weightPercent: 100, requiredCount: null,
            questions: [
              {
                questionId: 'q1', questionText: 'Reverse a string', type: 'code', marks: 10, negativeMarks: 0,
                options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: true, marksAwarded: 10, counted: true,
                answerText: 'def reverse(s): return s[::-1]', codeLanguage: 'python', gradingFeedback: null,
                tabActivity: [{ eventType: 'background_app_detected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'WhatsApp', reasoning: 'Taskbar icon visible.', screenshot: undefined }],
              },
            ],
          },
        ],
      },
      isLoading: false,
    });

    render(
      <ToastProvider>
        <CandidateReportPanel examId="exam-1" candidateId="cand-1" attemptId="attempt-1" />
      </ToastProvider>,
    );

    expect(screen.getByText('Tabs & Background Apps')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp × 1')).toBeInTheDocument();
    expect(screen.getByText('Suspicious pattern noted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /WhatsApp/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=apps/web -- CandidateReportPanel`
Expected: FAIL — `screen.getByText('Tabs & Background Apps')` not found

- [ ] **Step 3: Update the component**

Change the import block at the top of `apps/web/components/CandidateReportPanel.tsx` from:

```tsx
import { Badge, Button, Card, Modal, StatusBadge, IntegrityBadge, useToast, type StatusTone } from './ui';
import { AuditHistoryLink } from './AuditHistoryLink';
```

to:

```tsx
import { Badge, Button, Card, Modal, StatusBadge, IntegrityBadge, useToast, type StatusTone } from './ui';
import { AuditHistoryLink } from './AuditHistoryLink';
import { TabActivitySummaryCard, TabActivityBanner, hasTabActivityContent } from './TabActivity';
```

Immediately after the Webcam Timeline section's closing `</div>` and before the snapshot `<Modal>`
block, i.e. change:

```tsx
      </div>

      <Modal
        open={selectedSnapshot !== null}
```

to:

```tsx
      </div>

      {hasTabActivityContent(candidate.tabActivitySummary, candidate.proctoringAnalysis) && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Tabs &amp; Background Apps</h2>
          <TabActivitySummaryCard summary={candidate.tabActivitySummary} proctoringAnalysis={candidate.proctoringAnalysis} />
        </div>
      )}

      <Modal
        open={selectedSnapshot !== null}
```

In the per-question breakdown, change:

```tsx
                  <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                    <p className="mb-2 text-sm text-gray-800">
                      {question.questionText}
```

to:

```tsx
                  <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                    <TabActivityBanner entries={question.tabActivity} />
                    <p className="mb-2 text-sm text-gray-800">
                      {question.questionText}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=apps/web -- CandidateReportPanel`
Expected: PASS, all tests including the new one — the pre-existing tests still pass unchanged
because `renderPanel`'s fixture omits `tabActivitySummary`/`tabActivity`, and
`hasTabActivityContent(undefined, undefined)` / `entries={question.tabActivity}` both degrade
safely (`undefined?.length` / `.summary` access via `?.` returns `undefined`, which is falsy).

- [ ] **Step 5: Run the full web test suite and the production build once, to catch anything this plan's task boundaries missed**

Run: `npm test --workspace=apps/web`
Expected: PASS, no regressions

Run: `npm run build --workspace=apps/web`
Expected: builds clean — this is the one authoritative check that the new fields type-check
end-to-end (a green jest run alone does not prove this; jest's ts-jest config and `next build`'s
own tsconfig can disagree).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/CandidateReportPanel.tsx apps/web/components/CandidateReportPanel.test.tsx
git commit -m "feat(web): show tab activity summary and per-question banners on the candidate report"
```
