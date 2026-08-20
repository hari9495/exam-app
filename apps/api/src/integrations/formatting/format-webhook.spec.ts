import { formatWebhookMessage } from './format-webhook';
import { EventSummary } from './event-summary';

describe('formatWebhookMessage', () => {
  const summary: EventSummary = {
    title: 'Candidate finished exam',
    url: 'https://app.example.com/candidates/9',
    fields: [
      { label: 'Candidate', value: 'Ada Lovelace' },
      { label: 'Exam', value: 'Backend Screen' },
    ],
  };

  it('emits raw structured JSON keyed by field label (Zapier-mappable)', () => {
    expect(formatWebhookMessage('attempt.submitted', summary)).toEqual({
      event: 'attempt.submitted',
      title: 'Candidate finished exam',
      url: 'https://app.example.com/candidates/9',
      data: { Candidate: 'Ada Lovelace', Exam: 'Backend Screen' },
    });
  });

  it('does not escape values (JSON payload, not mrkdwn)', () => {
    const s: EventSummary = { title: 't', url: 'u', fields: [{ label: 'Candidate', value: 'A & <B>' }] };
    expect((formatWebhookMessage('attempt.submitted', s) as any).data.Candidate).toBe('A & <B>');
  });
});
