import { firstNameOf, buildAssessmentEmailHtml } from './invitations.service';

describe('firstNameOf', () => {
  // The reported case: candidates were being greeted with their full legal name.
  it('greets by first name only when a middle and last name are present', () => {
    expect(firstNameOf('Narendra Bhaskar Gudapati')).toBe('Narendra');
  });

  it('returns a single-word name unchanged', () => {
    expect(firstNameOf('Varma')).toBe('Varma');
  });

  it('handles a first and last name', () => {
    expect(firstNameOf('Bhagya Surekha')).toBe('Bhagya');
  });

  it('ignores stray whitespace rather than returning an empty greeting', () => {
    expect(firstNameOf('   Angelin   Debora  ')).toBe('Angelin');
  });

  // "Surname, First" turns up in bulk CSV uploads. We do NOT reorder it -- guessing wrong
  // greets someone by the wrong name -- but the greeting must not render "Dear Gudapati,,".
  it('strips a trailing comma from a "Surname, First" style name', () => {
    expect(firstNameOf('Gudapati, Narendra')).toBe('Gudapati');
  });

  it('falls back to the whole string rather than producing "Dear ,"', () => {
    expect(firstNameOf('   ')).toBe('');
    expect(firstNameOf('')).toBe('');
  });
});

describe('buildAssessmentEmailHtml greeting', () => {
  function html(candidateName: string) {
    return buildAssessmentEmailHtml({
      candidateName,
      examTitle: 'Backend Round',
      durationMinutes: 60,
      availabilityWindowStart: null,
      startLink: 'https://example.test/start?token=abc',
      logoUrl: null,
      organizationName: 'Acme',
      introHtml: 'You have been invited.',
    });
  }

  it('addresses the candidate by first name in the rendered email', () => {
    expect(html('Narendra Bhaskar Gudapati')).toContain('<p>Dear Narendra,</p>');
    expect(html('Narendra Bhaskar Gudapati')).not.toContain('Bhaskar Gudapati,</p>');
  });

  // Both recruiter invitations and walk-in registrations render through this one function,
  // so the fix reaches both without a second code path.
  it('applies to the walk-in intro too, since the layout is shared', () => {
    const walkIn = buildAssessmentEmailHtml({
      candidateName: 'Bhagya Surekha',
      examTitle: 'Screening',
      durationMinutes: 30,
      availabilityWindowStart: null,
      startLink: 'https://example.test/start?token=xyz',
      logoUrl: null,
      organizationName: 'Acme',
      introHtml: 'Thanks for registering.',
    });
    expect(walkIn).toContain('<p>Dear Bhagya,</p>');
    expect(walkIn).toContain('Thanks for registering.');
  });
});
