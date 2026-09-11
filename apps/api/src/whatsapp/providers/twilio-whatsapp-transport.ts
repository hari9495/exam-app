/**
 * One place that talks to Twilio's REST API to send a WhatsApp message.
 *
 * Deliberately not the `twilio` npm package -- this is a single POST, and
 * global `fetch` covers it without adding a dependency. The `whatsapp:`
 * prefix on To/From is what routes the message over WhatsApp instead of SMS.
 */

export interface TwilioWhatsappSendInput {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}

export interface TwilioWhatsappSendResult {
  ok: boolean;
  status?: number;
}

type FetchLike = typeof fetch;

export async function sendTwilioWhatsapp(
  { accountSid, authToken, from, to, body }: TwilioWhatsappSendInput,
  fetchImpl: FetchLike = fetch,
): Promise<TwilioWhatsappSendResult> {
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body }).toString(),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}
