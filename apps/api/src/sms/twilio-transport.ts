/**
 * One place that talks to Twilio's REST API to send an SMS.
 *
 * Deliberately not the `twilio` npm package -- this is a single POST, and
 * global `fetch` covers it without adding a dependency.
 */

export interface TwilioSendInput {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}

export interface TwilioSendResult {
  ok: boolean;
  status?: number;
}

type FetchLike = typeof fetch;

export async function sendTwilioSms(
  { accountSid, authToken, from, to, body }: TwilioSendInput,
  fetchImpl: FetchLike = fetch,
): Promise<TwilioSendResult> {
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}
