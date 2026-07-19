# Public API Reference

Base URL: `https://<your-domain>/api/v1/public`

## Authentication

Generate an API key from your org-admin console's **Integrations** page (Public API section). The full key is shown exactly once, at generation time — copy it immediately, it cannot be retrieved again. Regenerating a key immediately invalidates the previous one (only one live key exists per organization at a time).

Send it as a bearer token on every request:

```
Authorization: Bearer pk_live_<your key>
```

A missing header, a header that isn't `Bearer <token>`, or a key that doesn't match any organization's current key all return the same `401 Unauthorized` with body `{ "message": "Invalid API key", "statusCode": 401 }` — the API deliberately does not distinguish "malformed" from "well-formed but wrong" to avoid giving an attacker a way to fingerprint valid key formats.

## Rate limits

**60 requests/minute per API key**, not per IP — the limit is keyed by the organization the key resolves to, so it isn't affected by other traffic sharing your egress IP. Exceeding it returns `429 Too Many Requests` with a `Retry-After` header (seconds until you can retry).

## Pagination

Every list endpoint accepts `page` (default `1`) and `pageSize` (default `50`, max `200`) query parameters, and returns:

```json
{ "data": [...], "page": 1, "pageSize": 50, "total": 137 }
```

`page` and `pageSize` must be integers (`page` ≥ 1, `pageSize` between 1 and 200); an out-of-range or non-numeric value returns `400 Bad Request`.

## Endpoints

### `GET /candidates`

Query params: `page`, `pageSize`.

```json
{
  "data": [{ "id": "c1", "name": "Alice Example", "email": "alice@example.com", "createdAt": "2026-07-19T10:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

### `GET /candidates/:id`

```json
{ "id": "c1", "name": "Alice Example", "email": "alice@example.com", "createdAt": "2026-07-19T10:00:00.000Z" }
```

`404` if the candidate doesn't exist or doesn't belong to your organization.

### `GET /exams`

Query params: `page`, `pageSize`. Returns exam metadata only — no question or option content.

```json
{
  "data": [{ "id": "e1", "title": "Backend Screening", "status": "published", "durationMinutes": 60, "passCriteriaPercent": 40, "createdAt": "2026-07-19T10:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

### `GET /exams/:id`

Same shape as one item above. `404` if not found or not yours.

### `GET /invitations`

Query params: `page`, `pageSize`, `examId` (optional), `candidateId` (optional), `status` (optional — `invited` or `revoked`).

```json
{
  "data": [{ "id": "i1", "examId": "e1", "candidateId": "c1", "status": "invited", "invitedAt": "2026-07-19T10:00:00.000Z", "expiresAt": "2026-07-26T10:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

### `GET /exams/:id/results`

Query params: `page`, `pageSize`. One row per invited candidate. Until a candidate's attempt has fully settled, `score`, `maxScore`, `percentage`, `passFail`, and `submittedAt` are `null` and `status` reflects the invitation/attempt's current state (e.g. `invited`, `in_progress`, `submitted`).

```json
{
  "data": [{ "candidateId": "c1", "candidateName": "Alice Example", "status": "submitted", "score": 8, "maxScore": 10, "percentage": 80, "passFail": "pass", "submittedAt": "2026-07-19T11:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

`404` if the exam doesn't exist or doesn't belong to your organization.

## Webhooks

Configure a webhook URL and generate a signing secret from the same org-admin **Integrations** page (Webhooks section). The secret is shown exactly once, at generation time.

### Event types

- `invitation.created` — fires once per candidate when they're successfully invited to an exam (a bulk invite of 5 candidates fires 5 separate deliveries).
- `attempt.settled` — fires when a candidate's attempt is fully graded and the result is final. For exams with auto-graded questions only, this fires immediately on submission. For exams containing manually-graded code questions, this event does not fire until a recruiter finishes the manual grading pass.

### Payload

Each delivery's HTTP body is the event's data object directly — there is no `{ id, type, createdAt, data }` envelope wrapping it. The event type is only available via the `eventType` column in the delivery log (org-admin's Integrations page), not in the body itself.

`invitation.created` body:

```json
{ "id": "i1", "examId": "e1", "candidateId": "c1", "status": "invited" }
```

`attempt.settled` body:

```json
{
  "attemptId": "a1",
  "examId": "e1",
  "candidateId": "c1",
  "status": "submitted",
  "score": 8,
  "maxScore": 10,
  "percentage": 80,
  "passFail": "pass"
}
```

### Verifying the signature

Every delivery includes an `X-Webhook-Signature` header: the hex-encoded HMAC-SHA256 of the **raw request body**, computed with your webhook secret. Verify it before trusting the payload:

```js
const crypto = require('crypto');

function isValidSignature(rawBody, signatureHeader, webhookSecret) {
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

Use the **raw, unparsed** request body — computing the signature over a re-serialized JSON object will not match if key order or whitespace differs from what was actually sent. (In Express, this means reading the raw bytes before any JSON body-parser middleware runs, e.g. via `express.raw()` on the webhook route.)

### Delivery and retries

A delivery is retried up to 3 attempts total, with exponential backoff (starting at 30 seconds), if your endpoint doesn't respond with a 2xx status. After the final failed attempt, the delivery is marked `failed` and no further retries occur — check the delivery log in org-admin (Integrations page) to see recent delivery status (`pending` / `delivered` / `failed`) and HTTP response codes.
