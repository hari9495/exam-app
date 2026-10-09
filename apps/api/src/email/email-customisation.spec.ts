import { CompanyLook, EMAIL_TYPES, EmailType, accountLockedEmail, codeEmail, companyWelcomeEmail, fromNameFor, inviteEmail, newSignInEmail, passwordResetEmail, staffInviteEmail, staffPromotionEmail, wordingFor } from './account-emails';
import { checkField, fill } from './email-wording';

// P04 Q5: companies re-word and brand the account emails; the security-critical parts stay locked.
const look = (wording: CompanyLook['wording'], extra: Partial<CompanyLook> = {}): CompanyLook => ({ logoUrl: null, accentColor: null, senderName: null, replyTo: null, wording, ...extra });
const BARE = { subject: 'Hello', heading: 'Hi', intro: '', buttonLabel: 'Go', footer: '' };
const LINK = 'https://app.yukthix.test/yx/reset-password/abc123';
const WHEN = new Date('2026-10-07T10:12:00Z');

describe('company wording rules (email-wording)', () => {
  const allowed = EMAIL_TYPES.password_reset.variables;

  it('accepts plain text and whitelisted {{placeholders}}', () => {
    expect(checkField('intro', 'Hi {{firstName}}, welcome to {{ companyName }}.', allowed, true)).toBeNull();
    expect(fill('intro', 'Hi {{firstName}} at {{companyName}}', allowed, { firstName: 'Asha', companyName: 'Kaveri' })).toBe('Hi Asha at Kaveri');
  });

  it('refuses names outside the type’s whitelist, paths, helpers, blocks, partials and raw output', () => {
    expect(checkField('intro', 'Your code {{code}}', allowed, true)).toMatch(/can't be used/);
    for (const bad of ['{{user.password}}', '{{../companyName}}', '{{@root}}', '{{lookup this "x"}}', '{{#if firstName}}x{{/if}}', '{{> partial}}', '{{{firstName}}}', '{{!-- note --}}', '{{constructor}}', '{{firstName x=1}}']) {
      expect(checkField('intro', bad, allowed, true)).not.toBeNull();
    }
    expect(checkField('intro', 'Hi {{firstName', allowed, true)).toMatch(/not closed/);
  });

  it('refuses markup, links, web and email addresses, hidden characters; subject on one line; lengths capped', () => {
    for (const bad of ['<b>Hi</b>', 'Visit https://evil.test', 'go to www.evil.test', 'see kaveri-hr.com now', 'mail hr@kaveri.test', 'javascript:alert(1) evil.io', 'Hi‮evil']) {
      expect(checkField('intro', bad, allowed, true)).not.toBeNull();
    }
    expect(checkField('subject', 'two\nlines', allowed, true)).toMatch(/one line/);
    expect(checkField('intro', 'para one\n\npara two', allowed, true)).toBeNull();
    expect(checkField('subject', 'x'.repeat(151), allowed, true)).toMatch(/150/);
    expect(checkField('subject', '  ', allowed, true)).toMatch(/Enter/);
    expect(checkField('footer', '', allowed, false)).toBeNull();
  });

  it('a stored text that breaks the rules (or names a removed placeholder) falls back to the YukthiX wording', () => {
    const w = wordingFor('password_reset', { ...BARE, subject: '{{secret}} reset', intro: '<script>x</script>' }, { firstName: 'A', companyName: 'Kaveri', minutes: '15' });
    expect(w.subject).toBe('Reset your Kaveri password');
    expect(w.intro).toBe(EMAIL_TYPES.password_reset.defaults.intro.replace('{{companyName}}', 'Kaveri'));
  });

  it('every YukthiX starter passes its own rules', () => {
    for (const [type, d] of Object.entries(EMAIL_TYPES)) {
      for (const [field, value] of Object.entries(d.defaults)) {
        expect({ type, field, problem: checkField(field as never, value, d.variables, false) }).toEqual({ type, field, problem: null });
      }
    }
  });
});

describe('company look on the account emails', () => {
  it('the button link, expiry, safety line and paste-link stay when the company changes every editable part', async () => {
    const mail = await passwordResetEmail({ to: 'a@b.test', company: 'Kaveri', link: LINK, minutes: 15, look: look({ subject: 'Kaveri reset', heading: 'New password', intro: 'Hi {{firstName}}.', buttonLabel: 'Choose one', footer: 'Kaveri HR' }), firstName: 'Asha Rao' });
    expect(mail.subject).toBe('Kaveri reset');
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html).toContain('Choose one');
    expect(mail.text).toContain('Hi Asha.');
    expect(mail.text).toContain('The link works once and expires in 15 minutes.');
    expect(mail.text).toContain("Didn't ask for this? Ignore this email; your password stays the same.");
    expect(mail.text).toContain(`Button not working? Paste this link into your browser: ${LINK}`);
    expect(mail.text).toContain('Kaveri HR');
    expect(mail.text).toContain('YukthiX will never ask for your password or a sign-in code.');
  });

  it('the code and its safety lines stay on a code email with blank wording', async () => {
    const mail = await codeEmail({ to: 'a@b.test', code: '532112', purpose: 'sign_in', company: 'Kaveri', minutes: 5, look: look({ ...BARE, subject: 'Your code', buttonLabel: '' }) });
    expect(mail.html).toContain('532<span>112</span>');
    expect(mail.text).toContain('It works once and expires in 5 minutes.');
    expect(mail.text).toContain("Didn't try to sign in?");
    expect(mail.text).toContain('YukthiX will never ask you for this code by phone, email or chat.');
  });

  it('the device / IP / time block and the "if it wasn\'t you" lines stay on sign-in alerts', async () => {
    const facts = { when: WHEN, timeZone: 'Asia/Kolkata', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36', ip: '203.0.113.9' };
    const alert = await newSignInEmail({ to: 'a@b.test', company: 'Kaveri', facts, look: look(BARE) });
    expect(alert.text).toContain('When: 7 Oct 2026, 3:42 pm IST');
    expect(alert.text).toContain('Device: Chrome on Windows');
    expect(alert.text).toContain('IP address: 203.0.113.9');
    expect(alert.text).toContain("If it wasn't, open My security");
    expect(alert.html).toMatch(/href="[^"]*\/yx\/me\/security"/);
    const locked = await accountLockedEmail({ to: 'a@b.test', company: 'Kaveri', facts, lockedForSeconds: 900, look: look(BARE) });
    expect(locked.text).toContain("If this wasn't you, change your password after you sign in.");
    expect(locked.text).toContain('Unlocks: 7 Oct 2026, 3:57 pm IST');
  });

  it('variable values are escaped into the HTML, never parsed', async () => {
    const mail = await passwordResetEmail({ to: 'a@b.test', company: 'K <img src=x onerror=alert(1)> {{firstName}}', firstName: '<b>Asha</b>', link: LINK, minutes: 15, look: look({ ...BARE, intro: 'Hi {{firstName}} of {{companyName}}' }) });
    expect(mail.html).toContain('Hi &lt;b&gt;Asha&lt;/b&gt; of K &lt;img src=x onerror=alert(1)&gt; {{firstName}}');
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).not.toContain('<b>Asha');
  });

  it('logo, accent colour on the button, sender name "via YukthiX" and reply-to', async () => {
    const mail = await passwordResetEmail({ to: 'a@b.test', company: 'Kaveri', link: LINK, minutes: 15, look: look(null, { logoUrl: 'https://blob.test/logo.png?sig=1&x=2', accentColor: '#0b6e4f', senderName: 'Kaveri Foods HR', replyTo: 'hr@kaveri.test' }) });
    expect(mail.html).toContain('<img src="https://blob.test/logo.png?sig=1&amp;x=2" alt="Kaveri"');
    expect(mail.html).toContain('#0B6E4F');
    expect(mail.fromName).toBe('Kaveri Foods HR via YukthiX');
    expect(mail.replyTo).toBe('hr@kaveri.test');
    // A bad colour or a non-web logo link is never used.
    const odd = await passwordResetEmail({ to: 'a@b.test', company: 'Kaveri', link: LINK, minutes: 15, look: look(null, { logoUrl: 'javascript:alert(1)', accentColor: 'red;}<x' }) });
    expect(odd.html).not.toContain('javascript:');
    expect(odd.html).not.toContain('red;}');
    expect(odd.html).toContain('#3B5FE3');
  });

  it('the From name always ends "via YukthiX" and carries no address characters', () => {
    expect(fromNameFor('Kaveri', null)).toBe('Kaveri via YukthiX');
    expect(fromNameFor(null, null)).toBe('YukthiX');
    expect(fromNameFor('Kaveri', look(null, { senderName: 'Boss <ceo@evil.test>' }))).toBe('Boss ceoevil.test via YukthiX');
  });

  it('the new-company welcome is YukthiX-owned and plain', async () => {
    const mail = await companyWelcomeEmail({ to: 'sunita@godavari.test', adminName: 'Sunita Rao', company: 'Godavari Agro', link: LINK, hours: 72 });
    expect(mail.subject).toBe('Godavari Agro is ready on YukthiX');
    expect(mail.fromName).toBe('YukthiX');
    expect(mail.text).toContain("Hi Sunita, we've set up Godavari Agro on YukthiX, and you're its first System Admin.");
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.text).not.toMatch(/Examination Platform/);
    expect(mail.text).toContain('The link works once, for 72 hours.');
    expect(mail.text).not.toMatch(/minutes/);
  });

  it('an invitation says its link works for 72 hours; a reset still says 15 minutes', async () => {
    const invite = await inviteEmail({ to: 'a@b.test', company: 'Kaveri', link: LINK, hours: 72 });
    expect(invite.text).toContain('The link works once, for 72 hours. Missed it? Choose Forgot password on the sign-in page.');
    expect(invite.text).not.toMatch(/minutes/);
    const reset = await passwordResetEmail({ to: 'a@b.test', company: 'Kaveri', link: LINK, minutes: 15 });
    expect(reset.text).toContain('The link works once and expires in 15 minutes.');
    // A company's own invite wording may say how long the link works.
    expect(wordingFor('invite', { ...BARE, intro: 'Valid for {{hours}} hours.' }, { hours: '72' }).intro).toBe('Valid for 72 hours.');
  });

  it('YukthiX staff invite and promotion emails are YukthiX-owned, in the account-email layout', async () => {
    const invite = await staffInviteEmail('ravi@yukthix.test', LINK, 72);
    expect(invite.fromName).toBe('YukthiX');
    expect(invite.subject).toBe("You're invited to the YukthiX team");
    expect(invite.html).toContain(`href="${LINK}"`);
    expect(invite.text).toContain('The link works once, for 72 hours.');
    const promoted = await staffPromotionEmail('ravi@yukthix.test');
    expect(promoted.fromName).toBe('YukthiX');
    expect(promoted.text).toContain('platform administrator access');
    for (const m of [invite, promoted]) {
      expect(m.text).not.toMatch(/Examination Platform|unsubscribe/i);
      expect(m.html).toContain('yx-btn'); // the YukthiX account-email layout
    }
  });

  it('every type renders its YukthiX wording with no company look', () => {
    for (const type of Object.keys(EMAIL_TYPES) as EmailType[]) {
      const w = wordingFor(type, null, { firstName: 'Asha', companyName: 'Kaveri', code: '1', minutes: '5', hours: '72', device: 'x', change: 'c', changeShort: 'c' });
      expect(w.subject.length).toBeGreaterThan(0);
      expect(w.heading.length).toBeGreaterThan(0);
    }
  });
});
