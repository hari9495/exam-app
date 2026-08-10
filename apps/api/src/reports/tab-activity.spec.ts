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
