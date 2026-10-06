import { SmsSendResult, networkFailure, statusFailure } from './providers/types';

/**
 * One place that talks to Twilio's REST API to send an SMS.
 *
 * Deliberately not the `twilio` npm package -- this is a single POST to a fixed host, and
 * global `fetch` covers it without adding a dependency.
 */

export interface TwilioSendInput {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}

export type TwilioSendResult = SmsSendResult;

type FetchLike = typeof fetch;

export const TWILIO_TIMEOUT_MS = 10_000;

export async function sendTwilioSms(
  { accountSid, authToken, from, to, body }: TwilioSendInput,
  fetchImpl: FetchLike = fetch,
): Promise<TwilioSendResult> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
  } catch (error) {
    return networkFailure(error);
  }
  if (!res.ok) return statusFailure(res.status);
  let sid: unknown;
  try {
    sid = ((await res.json()) as { sid?: unknown })?.sid;
  } catch {
    sid = undefined;
  }
  return { ok: true, status: res.status, ...(typeof sid === 'string' ? { providerMsgId: sid } : {}) };
}
