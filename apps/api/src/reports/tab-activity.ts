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
