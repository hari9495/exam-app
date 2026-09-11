import { sendTwilioSms } from './twilio-transport';

describe('sendTwilioSms', () => {
  const input = {
    accountSid: 'AC123',
    authToken: 'secret-token',
    from: '+15551234567',
    to: '+15559876543',
    body: 'Your interview is confirmed',
  };

  function mockFetch(res: { ok: boolean; status: number }) {
    return jest.fn().mockResolvedValue(res);
  }

  it('POSTs to the correct Twilio Messages URL with Basic auth, form content-type, and the message body', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });

    await sendTwilioSms(input, fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: `Basic ${Buffer.from('AC123:secret-token').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(options.body).toBe(
      new URLSearchParams({ To: input.to, From: input.from, Body: input.body }).toString(),
    );
  });

  it('returns ok:true with status for a 2xx response', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });
    const result = await sendTwilioSms(input, fetchImpl as never);
    expect(result).toEqual({ ok: true, status: 201 });
  });

  it('returns ok:false with status for a 4xx response', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 401 });
    const result = await sendTwilioSms(input, fetchImpl as never);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('returns ok:false with status for a 5xx response', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 500 });
    const result = await sendTwilioSms(input, fetchImpl as never);
    expect(result).toEqual({ ok: false, status: 500 });
  });

  it('returns ok:false when fetch throws (network error)', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const result = await sendTwilioSms(input, fetchImpl as never);
    expect(result).toEqual({ ok: false });
  });
});
