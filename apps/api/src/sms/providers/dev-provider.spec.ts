import { Logger } from '@nestjs/common';
import { DevSmsSink } from './dev-provider';

describe('DevSmsSink', () => {
  const message = { to: '+919845012345', channel: 'sms' as const, text: '123456 is your YukthiX sign-in code.', sender: null, dltTemplateId: null, providerMsgId: 'dev-1', at: new Date() };
  const saved = { flag: process.env.DEV_SMS_LOG_TEXT, env: process.env.NODE_ENV };
  let log: jest.SpyInstance;
  beforeEach(() => (log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)));
  afterEach(() => {
    log.mockRestore();
    process.env.DEV_SMS_LOG_TEXT = saved.flag;
    process.env.NODE_ENV = saved.env;
    if (saved.flag === undefined) delete process.env.DEV_SMS_LOG_TEXT;
  });

  it('keeps every message; prints its text (the code) only when asked, and never in production', () => {
    const sink = new DevSmsSink();
    delete process.env.DEV_SMS_LOG_TEXT;
    sink.keep(message);
    expect(log).not.toHaveBeenCalled();
    process.env.DEV_SMS_LOG_TEXT = '1';
    sink.keep(message);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456 is your YukthiX sign-in code.'));
    log.mockClear();
    process.env.NODE_ENV = 'production';
    sink.keep(message);
    expect(log).not.toHaveBeenCalled();
    expect(sink.sent).toHaveLength(3);
  });
});
