import { auditSentence } from './audit-sentence';

describe('auditSentence (admin B1: plain-sentence activity log)', () => {
  it('builds a sentence from the code shape', () => {
    expect(auditSentence('access.request.approved', 'Priya Nair', {})).toBe('Access request approved by Priya Nair.');
    expect(auditSentence('user_group.updated', 'Priya Nair', null)).toBe('User group changed by Priya Nair.');
  });

  it('names the record from the details and drops noise prefixes', () => {
    expect(auditSentence('ats.candidate.merged', 'Priya Nair', { name: 'Ravi Kumar' })).toBe('Candidate "Ravi Kumar" merged by Priya Nair.');
  });

  it('never shows a masked value as the name', () => {
    expect(auditSentence('employee.updated', 'Priya Nair', { name: '••••' })).toBe('Employee changed by Priya Nair.');
  });

  it('uses the hand-written sentence for security events', () => {
    expect(auditSentence('step_up.used', 'Priya Nair', {})).toBe('Priya Nair confirmed it was them before a sensitive action.');
    expect(auditSentence('user.deactivated', 'Priya Nair', { email: 'ravi@kaveri.in' })).toBe('Priya Nair turned off sign-in for "ravi@kaveri.in".');
  });

  it('says YukthiX for system jobs and copes with a one-word code', () => {
    expect(auditSentence('pay.run.approved', 'YukthiX system', {})).toBe('Pay run approved by YukthiX.');
    expect(auditSentence('lapsed', 'Priya Nair', {})).toBe('Lapsed by Priya Nair.');
  });
});
