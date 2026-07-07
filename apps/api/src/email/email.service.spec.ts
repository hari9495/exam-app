import { Test } from '@nestjs/testing';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({
  createTestAccount: jest.fn(),
  createTransport: jest.fn(),
  getTestMessageUrl: jest.fn(),
}));

import * as nodemailer from 'nodemailer';

describe('EmailService', () => {
  let service: EmailService;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const moduleRef = await Test.createTestingModule({ providers: [EmailService] }).compile();
    service = moduleRef.get(EmailService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends via an Ethereal test account when SMTP_HOST is not configured', async () => {
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: '123' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue('https://ethereal.email/message/123');

    const result = await service.send({ to: 'candidate@test.com', subject: 'Invite', html: '<p>hi</p>' });

    expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@exam-platform.test',
      to: 'candidate@test.com',
      subject: 'Invite',
      html: '<p>hi</p>',
    });
    expect(result).toEqual({ success: true, previewUrl: 'https://ethereal.email/message/123' });
  });

  it('sends via configured SMTP without creating an Ethereal test account when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.real-provider.test';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'real-user';
    process.env.SMTP_PASS = 'real-pass';
    const sendMail = jest.fn().mockResolvedValue({ messageId: '456' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue(false);

    await service.send({ to: 'candidate@test.com', subject: 'Invite', html: '<p>hi</p>' });

    expect(nodemailer.createTestAccount).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.real-provider.test',
      port: 2525,
      auth: { user: 'real-user', pass: 'real-pass' },
    });
  });

  it('returns success: false and does not throw when sendMail fails', async () => {
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP connection refused'));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const result = await service.send({ to: 'candidate@test.com', subject: 'Invite', html: '<p>hi</p>' });

    expect(result).toEqual({ success: false });
  });

  it('reuses the same transporter across multiple sends instead of recreating it', async () => {
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: '789' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue(false);

    await service.send({ to: 'a@test.com', subject: 'One', html: '<p>1</p>' });
    await service.send({ to: 'b@test.com', subject: 'Two', html: '<p>2</p>' });

    expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('retries transporter creation after a rejected attempt instead of reusing the same failed promise', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'success' });

    // First call to createTestAccount rejects (e.g., transient network error)
    (nodemailer.createTestAccount as jest.Mock).mockRejectedValueOnce(
      new Error('Transient network error creating test account'),
    );

    // Second call succeeds
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValueOnce({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });

    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue('https://ethereal.email/message/success');

    // First send fails due to transporter creation error
    const firstResult = await service.send({ to: 'a@test.com', subject: 'First', html: '<p>1</p>' });
    expect(firstResult).toEqual({ success: false });
    expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);

    // Second send should retry transporter creation and succeed
    const secondResult = await service.send({ to: 'b@test.com', subject: 'Second', html: '<p>2</p>' });
    expect(secondResult).toEqual({ success: true, previewUrl: 'https://ethereal.email/message/success' });
    expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(2);
  });
});
