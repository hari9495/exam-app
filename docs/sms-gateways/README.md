# SMS gateways: any provider by configuration

YukthiX sends text messages (one-time codes first, then the notification engine, P04) through
**gateway accounts**. No provider is built in. Any SMS API is connected by configuration, with no
code change. Admins add accounts in **Settings › Notifications › SMS**. YukthiX platform staff
manage the **shared account** in the same place, signed in outside any organisation.

## How a message is routed

1. **Consent (YX-NTF-14).** A one-time code goes by SMS only when the person asked for it by SMS,
   or already has an active opt-in for that number. Asking for a code by SMS records an
   `authentication_only` opt-in in `channel_consents`. Opt-in rows are append-only.
2. **Accounts.** The company's own active accounts are tried by priority (lowest number first).
   After them comes the YukthiX shared account, unless the company switched it off.
3. **Template (YX-NTF-07).** Each account must have an **approved** one-time-code template: the
   DLT-registered text with one `{#var#}` per variable, the variables in order (`code`, `purpose`,
   `minutes`, `app`; `code` exactly once), and the DLT template id (required when the account has a
   DLT entity id). Values longer than 30 characters are cut with "…". An account without one is
   skipped, and the reason is logged.
4. **Monthly cap (YX-NTF-12).** One message is reserved against the company's monthly cap (IST
   month) before it is sent. Over the cap, codes go by email, and every admin gets one email that
   month.
5. **Sending.** Failures are sorted into three kinds:
   - *refused* (4xx, a "not accepted" answer, bad configuration): nothing was sent, so YukthiX
     tries the next account;
   - *not reached* (DNS failure, connection refused, 429, 503): YukthiX tries the same account up
     to 2 more times with backoff, then the next account;
   - *maybe sent* (timeout after the request went out, other 5xx, an answer it can't read):
     **YukthiX stops.** The code is never sent again on any route.
6. **Fallback.** When nothing could be sent, a sign-in code goes to the account's email if the
   company allows email codes. A second-step code or a mobile-number check never falls back.
7. **Log (YX-NTF-10).** Every send is one `notification_deliveries` row: masked number, account,
   provider, message id, attempts, error, billable parts, status. Each send has an idempotency key,
   so a retried job never sends twice. The app never deletes the log.

## Account settings

| Field | Meaning |
|---|---|
| `provider` | `http` (any gateway), `twilio`, or `dev` (local sink, refused in production) |
| `sender` | DLT sender header (6 letters in India) or sender number |
| `dltEntityId` | Your DLT principal entity id. When set, templates must carry a DLT template id |
| `priority` | 0–1000, lower first |
| `config` | Non-secret settings (below). Readable by admins |
| `secrets` | Write-only. They are never returned, logged or audited, and only their names are shown. `authToken` (Twilio), `authHeader`, `callbackSecret`; any other name is an `http` `{secret.name}`. Send `null` to remove one |

### `http` config

| Key | Meaning |
|---|---|
| `url` | `https://` only. The host must resolve to public addresses only: checked when saved, and every connection is pinned to the checked address, so DNS rebinding can't reach internal hosts. Redirects are never followed. The host may not contain a variable |
| `method` | `POST` (default), `PUT` or `GET` (GET sends no body) |
| `contentType` | `application/json` (default), `application/x-www-form-urlencoded`, or any other type (sent as written) |
| `headers` | `{ "name": "template" }`, e.g. `{ "authkey": "{secret.authkey}" }`. Host, Content-Length, Content-Type and similar headers are refused |
| `bodyTemplate` | The request body, with variables |
| `response` | `successPath` + `successValues` (the answer must have one of these values at that path; without them any 2xx counts) and `messageIdPath` (the gateway's message id). Dot paths into the JSON answer, e.g. `data.0.message_id` |
| `callback` | How delivery reports are read (below) |

**Variables:** `{to}` (E.164, e.g. +919845012345), `{to_digits}` (919845012345), `{message}` (the
rendered DLT text), `{sender}`, `{dlt_entity_id}`, `{dlt_template_id}`, `{idempotency_key}`,
`{var1}`…`{var9}` (the template's values, for gateways that take values rather than text),
`{secret.name}`. Each value is encoded for where it lands: percent-encoded in the URL and in form
bodies, JSON-escaped in JSON bodies. A message value can't add a form field, a header line or a
JSON key.

### Delivery reports and opt-outs

Point the gateway's delivery-report (DLR) webhook at the **callback URL** shown on the account:
`<API_ORIGIN>/api/v1/notifications/sms/callbacks/<account id>` (POST, or GET with query
parameters). Set a `callbackSecret` of at least 16 characters (Settings can generate one).

| `callback` key | Meaning |
|---|---|
| `auth` | `token`: the secret in the `X-Callback-Token` header or a `?token=` query parameter (for gateways that only take a URL). `hmac`: HMAC-SHA256 of the raw body with the secret, in `signatureHeader` (default `x-signature`), `signatureEncoding` `hex` (default) or `base64`, an optional `sha256=` prefix is accepted |
| `itemsPath` | Path to the array of events when the gateway batches them |
| `messageIdPath`, `statusPath` | Where the message id and the status are |
| `delivered`, `failed`, `optedOut` | Status values meaning each outcome |
| `addressPath` | Where the phone number is, for STOP / opt-out reports without a message id |

Requests are compared in constant time. A request without the account's secret gets a bare 401.
A report only updates deliveries **that account** sent, inside that account's company. An opt-out
withdraws every active opt-in for that number (YX-NTF-11). A later code the person asks for by SMS
records a new opt-in. Twilio accounts read Twilio's `MessageSid` / `MessageStatus` without a
mapping: add `?token=<callbackSecret>` to the status-callback URL in the Twilio console.

## Example configs

[`examples.json`](examples.json) holds working shapes for **Zoho CPaaS** (the YukthiX shared account: Zoho keeps the approved DLT text as a template, so the request sends only the values via `{var1}`), **MSG91, Gupshup (Enterprise SMS),
Kaleyra, Exotel, Textlocal** and a generic JSON API. `apps/api/src/sms/providers/http-gateways.spec.ts`
validates and renders every one of them. Paste the `config` into a new `http` account, then type
the real values of its `secrets`.

Gateways change their APIs. Before going live, check every field name, status value and the DLR
format against your gateway's current API reference, then press **Send test** (it texts your own
verified number only).

## Local development and tests

- With no shared account configured and `NODE_ENV` not `production`, a built-in **development
  sink** stands in for the shared account. Messages stay in memory (`devSmsSink.sent`), and the
  log shows only the masked number.
- A `dev` account with `config.simulate` set to `rejected`, `unavailable` or `unknown` fails on
  purpose, to try failover.
- `apps/api/test/sms-channel.e2e-spec.ts` runs the whole flow against a local mock HTTP gateway.
  No real provider is called anywhere in the tests.
