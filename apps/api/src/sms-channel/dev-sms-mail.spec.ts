import { DevSmsMail, assertDevSmsFlags, devSmsAsMail } from './dev-sms-mail';
import { devSmsSink } from '../sms/providers';

describe('DEV_SMS_TO_MAIL (development SMS / WhatsApp into Mailpit)', () => {
  const local = { SMTP_HOST: '127.0.0.1' };

  it('is off unless asked; refuses production (either dev flag) and a mail server off this machine', () => {
    expect(assertDevSmsFlags({ ...local })).toBe(false);
    expect(assertDevSmsFlags({ ...local, DEV_SMS_TO_MAIL: '1', NODE_ENV: 'development' })).toBe(true);
    expect(() => assertDevSmsFlags({ ...local, DEV_SMS_TO_MAIL: '1', NODE_ENV: 'production' })).toThrow(/local development only/);
    expect(() => assertDevSmsFlags({ ...local, DEV_SMS_LOG_TEXT: '1', NODE_ENV: 'production' })).toThrow(/DEV_SMS_LOG_TEXT/);
    expect(() => assertDevSmsFlags({ SMTP_HOST: 'smtp.office365.com', DEV_SMS_TO_MAIL: '1' })).toThrow(/this machine/);
    expect(() => assertDevSmsFlags({ DEV_SMS_TO_MAIL: '1' })).toThrow(/this machine/);
    expect(assertDevSmsFlags({ SMTP_HOST: 'smtp.office365.com', NODE_ENV: 'production' })).toBe(false);
  });

  it('turns a kept message into a mail with the exact text', () => {
    const text = '123456 is your YukthiX sign-in code. <b>';
    expect(devSmsAsMail({ to: '+919845012345', channel: 'sms', text, sender: null, dltTemplateId: null, providerMsgId: 'dev-1', at: new Date() })).toEqual({
      to: '+919845012345@sms.local',
      subject: 'SMS to +91 98450 12345',
      text,
      html: '<pre>123456 is your YukthiX sign-in code. &lt;b&gt;</pre>',
    });
    expect(devSmsAsMail({ to: '+919845012345', channel: 'whatsapp', text, sender: null, dltTemplateId: null, providerMsgId: 'dev-2', at: new Date() }).subject).toBe('WhatsApp to +91 98450 12345');
  });

  it('mirrors the sink into the mail service only when the flag is on', () => {
    const saved = { ...process.env };
    const send = jest.fn().mockResolvedValue({ success: true });
    try {
      Object.assign(process.env, { NODE_ENV: 'test', SMTP_HOST: 'localhost', DEV_SMS_TO_MAIL: '1' });
      new DevSmsMail({ send } as never);
      devSmsSink.keep({ to: '+919845012345', channel: 'sms', text: 'hi', sender: null, dltTemplateId: null, providerMsgId: 'dev-3', at: new Date() });
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: '+919845012345@sms.local', text: 'hi' }));
    } finally {
      devSmsSink.mirror = null;
      process.env = saved;
    }
  });
});
