import { EventEmitter } from 'events';
import { createServer } from 'net';
import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { logBullErrors } from '../jobs/redis-connection';

// A mail server that refuses connections (dev .env points SMTP at 1026 where nothing listens) must never stop the API:
// the send fails and is logged, and transport / queue 'error' events are logged instead of thrown.
describe('a refused SMTP connection never crashes the API', () => {
  const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  afterAll(() => Object.assign(process.env, saved));

  it('send() resolves as failed, logs the refusal, and later transport errors are only logged', async () => {
    // A port that was free a moment ago: nothing listens there now.
    const port = await new Promise<number>((done) => {
      const s = createServer().listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => done(p));
      });
    });
    Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_USER: 'u', SMTP_PASS: 'p' });
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new EmailService({} as never, {} as never, {} as never);
    const crashed = jest.fn();
    process.on('uncaughtException', crashed);
    try {
      await expect(service.send({ to: 'someone@example.test', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toEqual({ success: false });
      expect(errors.mock.calls.some(([m]) => String(m).includes('Failed to send email'))).toBe(true);
      const { transporter } = await (service as unknown as { createPlatformTransporter(): Promise<{ transporter: EventEmitter }> }).createPlatformTransporter();
      expect(() => transporter.emit('error', new Error('connect ECONNREFUSED'))).not.toThrow();
      expect(errors.mock.calls.some(([m]) => String(m).includes('SMTP transport error'))).toBe(true);
      await new Promise((r) => setTimeout(r, 50));
      expect(crashed).not.toHaveBeenCalled();
    } finally {
      process.off('uncaughtException', crashed);
      errors.mockRestore();
    }
  });

  it('a queue or worker error event is logged, not thrown', () => {
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const worker = logBullErrors(new EventEmitter(), 'sd-sla');
    expect(() => worker.emit('error', new Error('Connection is closed.'))).not.toThrow();
    expect(errors).toHaveBeenCalledWith('Queue sd-sla: Connection is closed.');
    errors.mockRestore();
  });
});
