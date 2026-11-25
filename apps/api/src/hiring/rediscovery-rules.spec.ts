import { matchPerson, words } from './rediscovery-rules';

const role = { title: 'Senior QA Engineer QA Engineer', text: 'Senior QA Engineer. Selenium and API testing for the payments app.', location: 'Chennai office' };

describe('HIR-26 rediscovery text match', () => {
  it('drops filler words and short words', () => {
    expect([...words('Senior QA Engineer, Line 3')]).toEqual(['engineer']);
  });

  it('a past role and skills in the requisition match, with the reasons shown', () => {
    const m = matchPerson(role, { resumeTitle: 'Test Engineer', skills: 'Selenium, API testing, Excel', pastRoles: [{ title: 'Automation Engineer', location: 'Chennai office' }] });
    expect(m).toEqual({ score: 3 + 4 + 1, reasons: ['Past role: Test Engineer', 'Selenium', 'API testing', 'Chennai office'] });
  });

  it('skills alone are enough; location alone is not', () => {
    expect(matchPerson(role, { resumeTitle: 'Accountant', skills: 'selenium', pastRoles: [] })?.reasons).toEqual(['selenium']);
    expect(matchPerson(role, { resumeTitle: 'Accountant', skills: 'Tally', pastRoles: [{ title: 'Accountant', location: 'Chennai office' }] })).toBeNull();
  });

  it('a skill must appear as a whole word, and odd characters in a skill do not break the match', () => {
    expect(matchPerson(role, { resumeTitle: null, skills: 'Java, C++ (basic', pastRoles: [] })).toBeNull();
    expect(matchPerson({ ...role, text: 'C++ developer' }, { resumeTitle: null, skills: 'C++', pastRoles: [] })?.reasons).toEqual(['C++']);
  });

  it('nothing to match on gives no suggestion', () => {
    expect(matchPerson(role, { resumeTitle: null, skills: null, pastRoles: [] })).toBeNull();
  });
});
