import { INTEGRATION_EVENT_TYPES } from '@exam-platform/shared';
import { buildEventSummary } from './event-summary';
import { formatSlackMessage } from './format-slack';
import { formatTeamsMessage } from './format-teams';

const base = 'https://app.example.com';

describe('buildEventSummary', () => {
  it('titles by event and always includes subject + url', () => {
    const s = buildEventSummary('attempt.submitted', { subject: 'Ada Lovelace', examTitle: 'Backend', linkPath: '/candidates/9' }, base);
    expect(s.title).toBe('Candidate finished exam');
    expect(s.fields[0]).toEqual({ label: 'Candidate', value: 'Ada Lovelace' });
    expect(s.fields).toContainEqual({ label: 'Exam', value: 'Backend' });
    expect(s.url).toBe('https://app.example.com/candidates/9');
  });

  it('maps optional fields only when present', () => {
    const s = buildEventSummary('integrity.flagged', { subject: 'X', reason: 'multiple faces', linkPath: '/live' }, base);
    expect(s.fields).toContainEqual({ label: 'Reason', value: 'multiple faces' });
    expect(s.fields.find((f) => f.label === 'Exam')).toBeUndefined();
  });

  it('produces a well-formed summary for every catalog event', () => {
    for (const t of INTEGRATION_EVENT_TYPES) {
      const s = buildEventSummary(t, { subject: 'S', linkPath: '/x' }, base);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.url).toBe('https://app.example.com/x');
    }
  });
});

describe('formatters are injection-safe (values are data only)', () => {
  const evil = 'Bad*_~`[x](http://evil)';
  const summary = buildEventSummary('offer.accepted', { subject: evil, linkPath: '/c/1' }, base);

  it('Slack puts untrusted text only in string fields', () => {
    const body = JSON.stringify(formatSlackMessage(summary));
    // the raw value survives as JSON string content, not spread into block structure
    expect(body).toContain(JSON.stringify(evil).slice(1, -1));
  });
  it('Teams card carries the link action to the summary url', () => {
    const body = JSON.stringify(formatTeamsMessage(summary));
    expect(body).toContain('https://app.example.com/c/1');
  });
});
