import { renderInterviewTemplate, formatSlot, InterviewMergeContext } from './interview-render';

const ctx: InterviewMergeContext = {
  candidateName: 'Asha Rao',
  jobTitle: 'Backend Engineer',
  orgName: 'Acme',
  recruiterName: 'Priya',
  interviewTimes: 'Tue Sep 1, 10:00 AM ET',
  interviewLocation: 'Room 4',
  panelNames: 'Jane, Bob',
  confirmLink: 'https://x/confirm/tok',
};

describe('renderInterviewTemplate', () => {
  it('replaces all 8 known tokens in subject and body', () => {
    const subject = '{{candidateName}} <> {{jobTitle}} @ {{orgName}}';
    const body =
      'From {{recruiterName}}: {{interviewTimes}} at {{interviewLocation}} with {{panelNames}}. Confirm: {{confirmLink}}';
    const r = renderInterviewTemplate(subject, body, ctx);
    expect(r.subject).toBe('Asha Rao <> Backend Engineer @ Acme');
    expect(r.body).toBe(
      'From Priya: Tue Sep 1, 10:00 AM ET at Room 4 with Jane, Bob. Confirm: https://x/confirm/tok',
    );
  });

  it('leaves unknown tokens untouched (passthrough)', () => {
    expect(renderInterviewTemplate('{{nope}}', 'x', ctx).subject).toBe('{{nope}}');
  });
});

describe('formatSlot', () => {
  it('formats a UTC instant in the given timeZone with a separator and the zone name', () => {
    // 14:00 UTC on 2026-09-01 is 10:00 AM in America/New_York (EDT, UTC-4)
    const startsAt = new Date('2026-09-01T14:00:00.000Z');
    const endsAt = new Date('2026-09-01T15:00:00.000Z');
    const slot = formatSlot(startsAt, endsAt, 'America/New_York');
    expect(slot).toContain('10:00');
    expect(slot).toContain('11:00');
    expect(slot).toContain('America/New_York');
  });
});
