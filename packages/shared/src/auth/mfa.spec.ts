import { SessionAssurance, mfaSatisfied, stepUpSatisfied } from './mfa';

const session = (overrides: Partial<SessionAssurance>): SessionAssurance => ({
  assuranceLevel: 'aal2',
  mfaVerifiedAt: new Date(),
  mfaMethod: 'totp',
  mfaEnrolmentDueAt: new Date(Date.now() - 1000),
  ...overrides,
});

describe('MFA floor helpers (YX-IAM-01/02)', () => {
  it.each(['totp', 'passkey', 'recovery_code'])('a fresh %s proof is a step-up', (mfaMethod) => {
    expect(stepUpSatisfied(session({ mfaMethod }))).toBe(true);
  });

  // Regression: enrolling a first factor, an IdP's own MFA claim and a one-time code all make the
  // session AAL2 but must never open step-up actions (API keys, IdPs, roles, security policy).
  it.each(['enrolment', 'idp', 'otp'])('%s is never a step-up', (mfaMethod) => {
    const s = session({ mfaMethod });
    expect(mfaSatisfied(s)).toBe(true);
    expect(stepUpSatisfied(s)).toBe(false);
  });

  it('an AAL2 session without a recorded method is not a step-up', () => {
    expect(stepUpSatisfied(session({ mfaMethod: null }))).toBe(false);
  });

  it('a proof older than the step-up window is not a step-up', () => {
    expect(stepUpSatisfied(session({ mfaVerifiedAt: new Date(Date.now() - 16 * 60 * 1000) }))).toBe(false);
  });

  it('an AAL1 session is not a step-up, even inside the enrolment grace', () => {
    const s = session({ assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null, mfaEnrolmentDueAt: new Date(Date.now() + 60_000) });
    expect(mfaSatisfied(s)).toBe(true);
    expect(stepUpSatisfied(s)).toBe(false);
  });
});
