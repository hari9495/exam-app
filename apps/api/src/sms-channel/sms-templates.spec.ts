import { DEV_OTP_TEMPLATE, SmsTemplate, renderTemplate, smsSegments, templateProblem, templateShapeError } from './sms-templates';

// DLT templates (P04 §4.4, APX-A §4.3, YX-NTF-07): only an approved, well-formed template is ever sent.
describe('SMS templates', () => {
  const otp: SmsTemplate = {
    dltTemplateId: '1107169876543210987',
    body: 'Dear user, {#var#} is your {#var#} for YukthiX. Valid for {#var#} minutes. Do not share. -KAVERI',
    variables: ['code', 'purpose', 'minutes'],
    status: 'approved',
  };

  it('renders the registered text, filling each {#var#} in order', () => {
    expect(renderTemplate(otp, { code: '482913', purpose: 'sign-in code', minutes: '5', app: 'YukthiX' })).toEqual({
      text: 'Dear user, 482913 is your sign-in code for YukthiX. Valid for 5 minutes. Do not share. -KAVERI',
      vars: ['482913', 'sign-in code', '5'],
    });
  });

  it('cuts a value longer than the DLT limit of 30 characters with an ellipsis, never refusing it', () => {
    const { vars } = renderTemplate(otp, { code: '482913', purpose: 'a purpose label that is far too long for DLT', minutes: '5', app: 'YukthiX' });
    expect(vars[1]).toHaveLength(30);
    expect(vars[1].endsWith('…')).toBe(true);
  });

  it('an approved, well-formed template has no problem', () => {
    expect(templateProblem(otp, true)).toBeNull();
    expect(templateProblem(DEV_OTP_TEMPLATE, false)).toBeNull();
  });

  it.each([
    ['missing', undefined, 'no approved template'],
    ['pending approval', { ...otp, status: 'pending' }, 'template is pending, not approved'],
    ['rejected', { ...otp, status: 'rejected' }, 'template is rejected, not approved'],
    ['placeholders and variables disagree', { ...otp, variables: ['code', 'purpose'] }, 'template: the text has 3 {#var#} but 2 variables are mapped'],
    ['without the code', { ...otp, variables: ['purpose', 'purpose', 'minutes'] }, 'template: the code must appear exactly once'],
    ['the code twice', { ...otp, variables: ['code', 'code', 'minutes'] }, 'template: the code must appear exactly once'],
    ['an unknown variable', { ...otp, variables: ['code', 'salary', 'minutes'] }, 'template: each variable must be one of code, purpose, minutes, app'],
    ['no DLT template id on a DLT account', { ...otp, dltTemplateId: null }, 'template: the DLT template id is missing'],
    ['a DLT id that is not digits', { ...otp, dltTemplateId: '11071x' }, 'template: the DLT template id is digits only'],
    ['empty text', { ...otp, body: '' }, 'template: the text must be 1 to 1000 characters'],
  ])('refuses a template %s', (_what, template, reason) => {
    expect(templateProblem(template, true)).toBe(reason);
  });

  it('a pending template may be saved (shape only); a DLT id is optional off DLT (e.g. Twilio abroad)', () => {
    expect(templateShapeError({ ...otp, status: 'pending' }, true)).toBeNull();
    expect(templateShapeError({ ...otp, dltTemplateId: null }, false)).toBeNull();
  });

  it('counts billable parts: 160 / 153 for plain text, 70 / 67 for Unicode', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('€'.repeat(80))).toBe(1); // extension characters count twice
    expect(smsSegments('€'.repeat(81))).toBe(2);
    expect(smsSegments('आपका कोड 482913 है')).toBe(1);
    expect(smsSegments('क'.repeat(71))).toBe(2);
  });
});
