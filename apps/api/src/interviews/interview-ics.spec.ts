import { buildInterviewIcs } from './interview-ics';

describe('buildInterviewIcs', () => {
  const base = {
    uid: 'interview-123@exam-app',
    startsAt: new Date('2026-09-01T14:00:00.000Z'),
    endsAt: new Date('2026-09-01T15:00:00.000Z'),
    summary: 'Interview: Backend Engineer',
    location: 'Room 4, Bldg A, second floor',
    description: 'Panel interview',
  };

  it('builds a VCALENDAR with one VEVENT in UTC basic format, CRLF-joined', () => {
    const ics = buildInterviewIcs(base);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toContain('DTSTART:20260901T140000Z');
    expect(ics).toContain('DTEND:20260901T150000Z');
    expect(ics).toContain(base.summary);
    expect(ics).toContain('\r\n');
  });

  it('escapes commas and newlines in text fields', () => {
    const ics = buildInterviewIcs({
      ...base,
      location: 'Room 4, Bldg A',
      description: 'Line 1\nLine 2',
    });
    expect(ics).toContain('LOCATION:Room 4\\, Bldg A');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2');
  });
});
