import {
  buildSmtpTransportOptions,
  isImplicitTlsPort,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_MAX_CONNECTIONS,
} from './smtp-transport';

describe('isImplicitTlsPort', () => {
  it('is true for 465 and false for the STARTTLS ports', () => {
    // 465 is SMTPS: encrypted from the first byte. 587 and 25 start plaintext
    // and upgrade via STARTTLS, which nodemailer does on its own.
    expect(isImplicitTlsPort(465)).toBe(true);
    expect(isImplicitTlsPort(587)).toBe(false);
    expect(isImplicitTlsPort(25)).toBe(false);
    expect(isImplicitTlsPort(2525)).toBe(false);
  });
});

describe('buildSmtpTransportOptions', () => {
  it('sets secure for port 465, which is what was hanging', () => {
    // Without this the transport opens a plaintext socket to a TLS-only port;
    // the server never greets, nothing errors, and the request hangs until
    // nginx returns a bare 504 after 60s.
    const opts = buildSmtpTransportOptions({ host: 'smtp.office365.com', port: 465, user: 'u', password: 'p' });
    expect(opts.secure).toBe(true);
  });

  it('leaves secure off for 587 so STARTTLS still negotiates as before', () => {
    const opts = buildSmtpTransportOptions({ host: 'smtp.office365.com', port: 587, user: 'u', password: 'p' });
    expect(opts.secure).toBe(false);
  });

  it('always bounds the wait well inside nginx 60s gateway timeout', () => {
    const opts = buildSmtpTransportOptions({ host: 'unreachable.invalid', port: 587, user: 'u', password: 'p' });
    expect(opts.connectionTimeout).toBe(SMTP_CONNECTION_TIMEOUT_MS);
    expect(opts.greetingTimeout).toBe(SMTP_GREETING_TIMEOUT_MS);
    expect(opts.connectionTimeout + opts.greetingTimeout).toBeLessThan(60_000);
  });

  it('passes credentials through when a user is supplied', () => {
    const opts = buildSmtpTransportOptions({ host: 'h', port: 587, user: 'me@x.test', password: 'secret' });
    expect(opts.auth).toEqual({ user: 'me@x.test', pass: 'secret' });
  });

  it('omits auth entirely for an unauthenticated relay', () => {
    // Sending auth:{user:'',pass:''} makes nodemailer attempt AUTH and fail
    // against a relay that does not want it.
    expect(buildSmtpTransportOptions({ host: 'relay.internal', port: 25 })).not.toHaveProperty('auth');
    expect(buildSmtpTransportOptions({ host: 'relay.internal', port: 25, user: '' })).not.toHaveProperty('auth');
    expect(buildSmtpTransportOptions({ host: 'relay.internal', port: 25, user: null })).not.toHaveProperty('auth');
  });

  it('tolerates a missing password alongside a user rather than sending undefined', () => {
    const opts = buildSmtpTransportOptions({ host: 'h', port: 587, user: 'me@x.test', password: null });
    expect(opts.auth).toEqual({ user: 'me@x.test', pass: '' });
  });

  it('pools connections with a bounded concurrency, so a large bulk-invite batch queues instead of opening one connection per email', () => {
    // A 97-recipient bulk invite fired 97 near-simultaneous connections against the
    // same mailbox without this, and Office365 rejected most of them with 432 4.3.2
    // "Concurrent connections limit exceeded".
    const opts = buildSmtpTransportOptions({ host: 'smtp.office365.com', port: 587, user: 'u', password: 'p' });
    expect(opts.pool).toBe(true);
    expect(opts.maxConnections).toBe(SMTP_MAX_CONNECTIONS);
  });
});
