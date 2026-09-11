import { sendTwilioWhatsapp } from './twilio-whatsapp-transport';

describe('sendTwilioWhatsapp', () => {
  const input = { accountSid: 'AC123', authToken: 'secret-token', from: '+15551234567', to: '+15559876543', body: 'Your interview is confirmed' };

  function mockFetch(res: { ok: boolean; status: number }) {
    return jest.fn().mockResolvedValue(res);
  }

  it('POSTs to the Twilio messages endpoint with To/From carrying the whatsapp: prefix', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });

    const result = await sendTwilioWhatsapp(input, fetchImpl as never);

    expect(result).toEqual({ ok: true, status: 201 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(
      new URLSearchParams({ To: `whatsapp:${input.to}`, From: `whatsapp:${input.from}`, Body: input.body }).toString(),
    );
  });

  it('sends Basic auth built from accountSid:authToken', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });

    await sendTwilioWhatsapp(input, fetchImpl as never);

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('AC123:secret-token').toString('base64')}`);
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('returns ok:false for a 500 response', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 500 });
    const result = await sendTwilioWhatsapp(input, fetchImpl as never);
    expect(result).toEqual({ ok: false, status: 500 });
  });

  it('returns ok:false when fetch throws, never lets the error escape', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const result = await sendTwilioWhatsapp(input, fetchImpl as never);
    expect(result).toEqual({ ok: false });
  });
});
