import { hiringHome } from './yx-home';

describe('hiringHome (recruiter Home)', () => {
  const now = new Date('2026-10-19T06:00:00Z');

  it('turns each hiring row into an action that opens its hiring page', () => {
    const { actions } = hiringHome(
      {
        scorecardsDue: [{ interviewId: 'iv1', candidate: 'Ananya', job: 'Quality Analyst', endedAt: '2026-10-17T08:00:00Z' }],
        offers: [
          { offerId: 'o1', entryId: 'e1', jobId: 'j1', candidate: 'Farhan', job: 'Plant Engineer', status: 'pending_approval', action: 'approve' },
          { offerId: 'o2', entryId: 'e2', jobId: 'j1', candidate: 'Priya', job: 'Plant Engineer', status: 'approved', action: 'send' },
        ],
        waiting: [{ entryId: 'e3', jobId: 'j2', candidate: 'Rohit', job: 'Sales', stage: 'Screened', since: '2026-10-07T06:00:00Z' }],
      },
      now,
    );
    expect(actions.map((a) => [a.title, a.href])).toEqual([
      ['Write your scorecard · Quality Analyst', '/yx/hiring/interviews/iv1'],
      ['Approve the offer · Plant Engineer', '/yx/hiring/jobs/j1?entry=e1'],
      ['Send the offer · Plant Engineer', '/yx/hiring/jobs/j1?entry=e2'],
      ['12 days in Screened · Sales', '/yx/hiring/jobs/j2?entry=e3'],
    ]);
    expect(actions[2].note).toBe('Approved, not sent yet');
  });

  it('keeps jobs and counts out when the API left them out (a panellist)', () => {
    const { view } = hiringHome({ interviewsToday: [], scorecardsDue: [], offers: [] }, now);
    expect(view).toEqual({ interviewsToday: [], interviewsHref: '/yx/hiring/interviews', jobsHref: '/yx/hiring/jobs' });
    expect(hiringHome(undefined, now)).toEqual({ actions: [] });
  });
});
