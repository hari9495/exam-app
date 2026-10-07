import { ACCOUNT_LOCKED, CODE_FAILED, RECOVERY_CODE_FAILED, TOO_MANY_TRIES, yxAuthMessage, yxProofError } from './yx-auth-messages';

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

describe('YukthiX sign-in words', () => {
  it('the request throttle (a 429 without the lock message): wait a minute', () => {
    expect(yxAuthMessage(httpError(429, 'Too many attempts. Please wait a minute and try again.'), 'x')).toBe(TOO_MANY_TRIES);
    expect(TOO_MANY_TRIES).toBe('Too many tries. Wait a minute and try again.');
  });

  it('the account / IP lock: wait a few minutes', () => {
    expect(yxAuthMessage(httpError(429, 'Too many sign-in attempts. Please wait and try again.'), 'x')).toBe(ACCOUNT_LOCKED);
    expect(ACCOUNT_LOCKED).toBe('Too many tries. Wait a few minutes and try again.');
  });

  it('a wrong password reads the same as an unknown email; other messages pass through', () => {
    expect(yxAuthMessage(httpError(401, 'Invalid credentials'), 'x')).toBe('Wrong email or password. Try again.');
    expect(yxAuthMessage(httpError(400, 'Enter an email address or a mobile number'), 'x')).toBe('Enter an email address or a mobile number');
    expect(yxAuthMessage('not an error', 'Sign-in failed')).toBe('Sign-in failed');
  });

  it('a refused second step in the words for the way used, never saying why', () => {
    const refused = httpError(401, 'That verification did not work. Try again.');
    expect(yxProofError(refused, 'recovery_code').message).toBe(RECOVERY_CODE_FAILED);
    expect(RECOVERY_CODE_FAILED).toBe("That recovery code didn't work. It may already be used — try another one.");
    expect(yxProofError(refused, 'totp').message).toBe(CODE_FAILED);
    expect(yxProofError(refused, 'otp').message).toBe(CODE_FAILED);
    expect(CODE_FAILED).toBe("That code didn't work. Check it and try again.");
    expect(yxProofError(refused, 'passkey').message).toBe('That verification did not work. Try again.');
    expect(yxProofError(httpError(429, 'Too many sign-in attempts. Please wait and try again.'), 'totp').message).toBe(ACCOUNT_LOCKED);
    expect(yxProofError(httpError(429, 'Too Many Requests'), 'recovery_code').message).toBe(TOO_MANY_TRIES);
  });
});
