import {
  accountLockedEmail,
  codeEmail,
  countryName,
  describeDevice,
  formatWhen,
  newSignInEmail,
  noticeEmail,
  passwordResetEmail,
  securityChangeEmail,
  text,
} from './account-emails';

const TO = 'priya<x>@kaveri.test';
const EVIL = 'Kaveri <script>alert(1)</script> & "Sons"';
const WHEN = new Date('2026-10-07T10:12:00Z');

// Every email: escaped inputs, one layout, a plain-text part, no images or tracking.
function expectSafe(mail: { html: string; text: string }) {
  expect(mail.html).not.toContain('<script>');
  expect(mail.html).toContain('Kaveri &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Sons&quot;');
  expect(mail.html).toContain('priya&lt;x&gt;@kaveri.test');
  expect(mail.html).not.toMatch(/<img/i);
  expect(mail.html).not.toMatch(/%%\d+%%/);
  expect(mail.html).toMatch(/<html[^>]* lang="en"/);
  expect(mail.html).toContain('Yukthi<span class="yx-x"');
  expect(mail.text).toContain(`Sent to ${TO} · ${EVIL} · YukthiX`);
  expect(mail.text).not.toMatch(/<(p|div|table|span|td)\b/);
}

describe('YukthiX account emails', () => {
  it('the card keeps a 12 px gutter on any screen narrower than 600 px plus the gutters', async () => {
    const { html } = await codeEmail({ to: TO, code: '532112', purpose: 'sign_in', minutes: 5 });
    expect(html).toMatch(/@media only screen and \(max-width: 623px\) \{\s*\.yx-card \{ margin: 0 12px !important; width: auto !important; \}/);
    expect(html).toMatch(/class="yx-card"[^>]*max-width:600px/);
  });

  it('sign-in code: code in the subject, spaced in a box, the company named, no links', async () => {
    const mail = await codeEmail({ to: TO, code: '532112', purpose: 'sign_in', company: EVIL, minutes: 5 });
    expect(mail.subject).toBe('532112 is your YukthiX sign-in code');
    expect(mail.html).toContain('532<span>112</span>');
    expect(mail.html).toContain('Your sign-in code');
    expect(mail.html).toContain('It works once and expires in 5 minutes.');
    expect(mail.html).toContain('YukthiX will never ask you for this code by phone, email or chat.');
    expect(mail.html).not.toMatch(/<a\s/i);
    expect(mail.text).toContain('532112');
    expect(mail.text).toContain(`Enter this code to sign in to ${EVIL}.`);
    expect(mail.text).toContain('It works once and expires in 5 minutes.');
    expect(mail.text).toContain("Didn't try to sign in? You can ignore this email; someone may have typed your address by mistake. Your account is safe.");
    expectSafe(mail);
  });

  it('sign-in code without a company says YukthiX; a text fallback says so', async () => {
    const mail = await codeEmail({ to: 'a@b.test', code: '000111', purpose: 'sign_in', company: null, minutes: 5, insteadOfText: true });
    expect(mail.text).toContain('Enter this code to sign in to YukthiX.');
    expect(mail.text).toContain("We couldn't send this code by text message");
    expect(mail.text).toContain('Sent to a@b.test · YukthiX');
  });

  it('verification codes for the second step and a mobile number', async () => {
    expect((await codeEmail({ to: 'a@b.test', code: '123456', purpose: 'mfa', company: 'Kaveri', minutes: 5 })).subject).toBe('123456 is your YukthiX verification code');
    expect((await codeEmail({ to: 'a@b.test', code: '123456', purpose: 'mobile', company: 'Kaveri', minutes: 5 })).text).toContain('verify your mobile number at Kaveri');
  });

  it('password reset: a button to the link, the expiry, and the reassurance', async () => {
    const link = 'https://app.yukthix.test/yx/reset-password/abc123';
    const mail = await passwordResetEmail({ to: TO, link, company: EVIL, minutes: 15 });
    expect(mail.subject).toBe(`Reset your ${EVIL} password`);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain('Reset password');
    expect(mail.text).toContain(`Reset password: ${link}`);
    expect(mail.text).toContain('expires in 15 minutes');
    expect(mail.text).toContain("Didn't ask for this? Ignore this email; your password stays the same.");
    expectSafe(mail);
  });

  it('new sign-in: device, place, time in the zone, and a "This wasn’t me" button to My security', async () => {
    const mail = await newSignInEmail({
      to: TO,
      company: EVIL,
      facts: { when: WHEN, timeZone: 'Asia/Kolkata', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', country: 'IN', ip: '203.0.113.9' },
    });
    expect(mail.subject).toBe('New sign-in to your YukthiX account');
    expect(mail.text).toContain('Device: Chrome on Windows');
    expect(mail.text).toContain('Place: India (approximate)');
    expect(mail.text).toContain('When: 7 Oct 2026, 3:42 pm IST');
    expect(mail.html).toMatch(/href="[^"]*\/yx\/me\/security"/);
    expect(mail.html).toContain('This wasn’t me');
    expectSafe(mail);
  });

  it('locked: when it unlocks, what to do, and the change-password line', async () => {
    const mail = await accountLockedEmail({ to: TO, company: EVIL, facts: { when: WHEN, timeZone: 'Asia/Kolkata' }, lockedForSeconds: 15 * 60 });
    expect(mail.subject).toBe('Sign-in to your YukthiX account was temporarily locked');
    expect(mail.text).toContain('Unlocks: 7 Oct 2026, 3:57 pm IST');
    expect(mail.text).toContain("If this wasn't you, change your password after you sign in.");
    expectSafe(mail);
  });

  it('security change and admin notices use the same layout', async () => {
    const change = await securityChangeEmail({ to: TO, company: EVIL, subject: 'A recovery code was used on your YukthiX account', what: 'One of your recovery codes was just used.', when: WHEN });
    expect(change.html).toContain('A recovery code was used</h1>');
    expect(change.text).toContain('One of your recovery codes was just used.');
    expectSafe(change);

    const lapsed = await noticeEmail({ to: TO, company: EVIL, subject: 'A verified email domain lapsed', heading: 'A verified domain lapsed', blocks: [text('<b>kaveri.in</b> lapsed.')] });
    expect(lapsed.html).toContain('&lt;b&gt;kaveri.in&lt;/b&gt; lapsed.');
    expectSafe(lapsed);
  });

  it('formats', () => {
    expect(formatWhen(WHEN, 'Not/AZone')).toBe('7 Oct 2026, 3:42 pm IST');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(describeDevice(null)).toBeNull();
    expect(countryName('xx1')).toBeNull();
  });
});
