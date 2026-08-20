# Integrations 2a — Foundation + Chat (Slack/Teams) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push 8 recruiting lifecycle events into an org's Slack/Teams channels via admin-pasted incoming-webhook URLs, on a thin reusable integration foundation (typed per-org table + single event fan-out + retrying delivery worker + Connected Apps UI) that integration slices 2b–2e will reuse.

**Architecture:** A new `OrgIntegration` + `IntegrationDelivery` pair (RLS, no FK to org). A single `IntegrationEventsService.emit(orgId, type, payload)` fans out to both the existing signed webhook AND any active `OrgIntegration` whose subscribed `events` include the type, enqueuing an `integration-deliveries` BullMQ job per match. A worker (mirroring the webhook worker) decrypts the URL, enforces an SSRF host-allowlist, renders a provider-specific message (pure Slack/Teams formatters), and POSTs it. Config lives on the existing org-admin Integrations page.

**Tech Stack:** NestJS 11 (apps/api, apps/exam-runtime), Next.js 16 (apps/web), Prisma + Azure SQL Server, BullMQ + ioredis, `@exam-platform/shared` (crypto, tenant-prisma), Jest.

## Global Constraints

- **Branch:** `feat/integrations-chat`, isolated worktree at `scratchpad/integrations-impl`, off `origin/main` @ `f09a3570`. Deploy is DEFERRED (do not deploy).
- **SQL Server migrations:** `GETUTCDATE()` for datetime defaults; additive `CREATE TABLE` only; **RLS predicates go in a SEPARATE migration** from the `CREATE TABLE` (ALTER SECURITY POLICY cannot share the create batch); `organization_id` is a plain `UNIQUEIDENTIFIER` column with an RLS predicate — **no FK to `organizations`** (matches `billing_notices`).
- **DI:** Every module whose provider/controller injects `IntegrationEventsService` MUST explicitly import the module that provides it (JobsModule) — never rely on `@Global` alone. `tsc` + mocked unit tests do NOT catch missing runtime DI; only real boot does. (Prod DI-crash lesson.)
- **Transactions:** `IntegrationEventsService.emit` and all `fetch`/queue calls run OUTSIDE any `forTenant` write transaction (5s interactive-tx budget). Call `emit` after the domain write commits.
- **Event catalog (verbatim, 8):** `invitation.created`, `attempt.submitted`, `attempt.settled`, `integrity.flagged`, `interview.confirmed`, `offer.accepted`, `candidate.applied`, `candidate.fit_scored`.
- **Provider types (verbatim):** `slack`, `msteams`.
- **SSRF allowlist (verbatim):** `https`-only; `slack` → host exactly `hooks.slack.com`; `msteams` → host ends with `.webhook.office.com` OR `.logic.azure.com`.
- **Permission:** reuse `org:manage_settings` (the permission already guarding the `integrations/*` endpoints).
- **Secrets:** the incoming-webhook URL is a secret — encrypt with `OrgSecretsCryptoService.encrypt`, store in `targetUrlEncrypted`, NEVER return it to the client (masked `urlHint` only).
- **Worktree shims (do NOT commit):** `apps/api/jest.config.js` `moduleNameMapper` + `apps/api/tsconfig.json` `paths` map `@exam-platform/shared` → the worktree's own `packages/shared/dist`. After editing anything under `packages/shared/src`, rebuild: `npm run build --workspace @exam-platform/shared`. These shim files stay UNCOMMITTED.
- **Jest paths with parens** (e.g. `app/(org-admin)/...`) are regex → run those with `--runTestsByPath`.

---

## File Structure

**packages/shared (canonical catalog, imported by api + web):**
- `packages/shared/src/integrations/event-types.ts` — `INTEGRATION_EVENT_TYPES`, `IntegrationEventType`, `INTEGRATION_EVENT_LABELS`.
- export the above from `packages/shared/src/index.ts`.

**apps/api (all backend logic):**
- `apps/api/src/integrations/webhook-url-allowlist.ts` — pure SSRF host-allowlist (`assertAllowedWebhookUrl`).
- `apps/api/src/integrations/formatting/event-summary.ts` — pure `buildEventSummary`.
- `apps/api/src/integrations/formatting/format-slack.ts` — pure `formatSlackMessage`.
- `apps/api/src/integrations/formatting/format-teams.ts` — pure `formatTeamsMessage`.
- `apps/api/src/jobs/integration-deliveries.queue.ts` — queue token + factory (mirror webhook queue).
- `apps/api/src/jobs/integration-delivery.worker.service.ts` — the delivery worker (mirror webhook worker).
- `apps/api/src/integrations/integration-events.service.ts` — the fan-out service (`emit`, `enqueueTest`).
- `apps/api/src/integrations/connected-apps.service.ts` — CRUD + test + deliveries.
- `apps/api/src/integrations/connected-apps.controller.ts` — `@Controller('organizations/integrations')`.
- `apps/api/src/integrations/dto/*.ts` — create/update DTOs.
- `apps/api/src/integrations/integrations.module.ts` — new module (controller + ConnectedAppsService).
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/jobs/jobs.module.ts`, `apps/api/src/internal/*`, and the 5 API emit sites.

**apps/exam-runtime:** add 2 internal-dispatch calls (attempt.submitted, integrity.flagged).

**apps/web:**
- `apps/web/lib/hooks/useConnectedApps.ts` — hooks (mirror `useIntegrations.ts`).
- `apps/web/components/integrations/ConnectedAppsSection.tsx` — the section + add/edit modal.
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.tsx` (mount the section), `apps/web/lib/types.ts` (row types).

---

### Task 1: Shared event catalog

**Files:**
- Create: `packages/shared/src/integrations/event-types.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/integrations/event-types.spec.ts`

**Interfaces:**
- Produces: `INTEGRATION_EVENT_TYPES: readonly IntegrationEventType[]` (8 entries), `type IntegrationEventType`, `INTEGRATION_EVENT_LABELS: Record<IntegrationEventType,string>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/integrations/event-types.ts consumers rely on this shape.
import { INTEGRATION_EVENT_TYPES, INTEGRATION_EVENT_LABELS } from './event-types';

describe('integration event catalog', () => {
  it('has exactly the 8 catalog events, unique', () => {
    expect(INTEGRATION_EVENT_TYPES).toEqual([
      'invitation.created', 'attempt.submitted', 'attempt.settled', 'integrity.flagged',
      'interview.confirmed', 'offer.accepted', 'candidate.applied', 'candidate.fit_scored',
    ]);
    expect(new Set(INTEGRATION_EVENT_TYPES).size).toBe(8);
  });

  it('has a human label for every event', () => {
    for (const t of INTEGRATION_EVENT_TYPES) {
      expect(typeof INTEGRATION_EVENT_LABELS[t]).toBe('string');
      expect(INTEGRATION_EVENT_LABELS[t].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm run test --workspace @exam-platform/shared -- event-types` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/integrations/event-types.ts
export const INTEGRATION_EVENT_TYPES = [
  'invitation.created',
  'attempt.submitted',
  'attempt.settled',
  'integrity.flagged',
  'interview.confirmed',
  'offer.accepted',
  'candidate.applied',
  'candidate.fit_scored',
] as const;

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];

export const INTEGRATION_EVENT_LABELS: Record<IntegrationEventType, string> = {
  'invitation.created': 'Candidate invited',
  'attempt.submitted': 'Candidate finished exam',
  'attempt.settled': 'Results ready',
  'integrity.flagged': 'Integrity flag raised',
  'interview.confirmed': 'Interview confirmed',
  'offer.accepted': 'Offer accepted',
  'candidate.applied': 'New applicant',
  'candidate.fit_scored': 'AI fit score ready',
};
```

Add to `packages/shared/src/index.ts` (follow the existing export style there):

```ts
export * from './integrations/event-types';
```

- [ ] **Step 4: Run test → PASS**, then rebuild shared so the worktree dist is current:

```bash
npm run test --workspace @exam-platform/shared -- event-types
npm run build --workspace @exam-platform/shared
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/integrations/event-types.ts packages/shared/src/integrations/event-types.spec.ts packages/shared/src/index.ts
git commit -m "feat(integrations): shared 8-event catalog + labels"
```

---

### Task 2: Prisma models + additive table migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260826100000_integrations_tables/migration.sql`
- Test: (schema validity + migration content assertions below)

**Interfaces:**
- Produces: Prisma models `OrgIntegration` (`org_integrations`) and `IntegrationDelivery` (`integration_deliveries`) with the fields in §4 of the spec.

- [ ] **Step 1: Add models to `schema.prisma`** (place near the other tenant models; use the exact `@db`/`@map` forms below):

```prisma
model OrgIntegration {
  id                 String    @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId     String    @map("organization_id") @db.UniqueIdentifier
  type               String
  label              String
  targetUrlEncrypted String    @map("target_url_encrypted") @db.NVarChar(Max)
  events             String    @db.NVarChar(Max)
  status             String    @default("active")
  lastDeliveryAt     DateTime? @map("last_delivery_at")
  lastError          String?   @map("last_error") @db.NVarChar(Max)
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  @@map("org_integrations")
}

model IntegrationDelivery {
  id             String    @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  integrationId  String    @map("integration_id") @db.UniqueIdentifier
  eventType      String    @map("event_type")
  status         String    @default("pending")
  httpStatusCode Int?      @map("http_status_code")
  attemptCount   Int       @default(0) @map("attempt_count")
  errorDetail    String?   @map("error_detail") @db.NVarChar(Max)
  createdAt      DateTime  @default(now()) @map("created_at")
  lastAttemptAt  DateTime? @map("last_attempt_at")

  @@map("integration_deliveries")
}
```

- [ ] **Step 2: Write the migration SQL** (additive, no EXEC-wrap, `newid()`/`GETUTCDATE()` defaults):

```sql
-- apps/api/prisma/migrations/20260826100000_integrations_tables/migration.sql
CREATE TABLE [dbo].[org_integrations] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [org_integrations_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [target_url_encrypted] NVARCHAR(MAX) NOT NULL,
    [events] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [org_integrations_status_df] DEFAULT 'active',
    [last_delivery_at] DATETIME2,
    [last_error] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [org_integrations_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [org_integrations_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[integration_deliveries] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [integration_deliveries_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [integration_id] UNIQUEIDENTIFIER NOT NULL,
    [event_type] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [integration_deliveries_status_df] DEFAULT 'pending',
    [http_status_code] INT,
    [attempt_count] INT NOT NULL CONSTRAINT [integration_deliveries_attempt_count_df] DEFAULT 0,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [integration_deliveries_created_at_df] DEFAULT GETUTCDATE(),
    [last_attempt_at] DATETIME2,
    CONSTRAINT [integration_deliveries_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE INDEX [integration_deliveries_integration_id_idx] ON [dbo].[integration_deliveries]([integration_id]);
```

> Note: `@updatedAt` maps to a non-defaulted `updated_at` — Prisma sets it on write. Prisma's own generated migration will match this; if `prisma migrate dev` produces a slightly different-but-equivalent file, keep the generated one as long as columns/types/PK match.

- [ ] **Step 3: Regenerate client + validate** (placeholder DATABASE_URL is fine for validate):

```bash
cd apps/api && npx prisma generate
DATABASE_URL="sqlserver://placeholder" npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀`.

- [ ] **Step 4: Assert migration content**

```bash
grep -q "CREATE TABLE \[dbo\].\[org_integrations\]" apps/api/prisma/migrations/20260826100000_integrations_tables/migration.sql
grep -q "CREATE TABLE \[dbo\].\[integration_deliveries\]" apps/api/prisma/migrations/20260826100000_integrations_tables/migration.sql
! grep -qi "FOREIGN KEY" apps/api/prisma/migrations/20260826100000_integrations_tables/migration.sql   # no FK to org
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260826100000_integrations_tables
git commit -m "feat(integrations): OrgIntegration + IntegrationDelivery models + tables"
```

---

### Task 3: RLS migration (separate)

**Files:**
- Create: `apps/api/prisma/migrations/20260826100001_integrations_rls/migration.sql`

**Interfaces:** Produces tenant isolation on both new tables via the existing `dbo.TenantAccessPolicy` / `dbo.fn_tenant_access_predicate`.

- [ ] **Step 1: Write the RLS migration** (mirror `20260826090001_billing_phase1_rls`):

```sql
-- apps/api/prisma/migrations/20260826100001_integrations_rls/migration.sql
-- Extend tenant isolation to the integrations tables (separate migration:
-- ALTER SECURITY POLICY cannot share a CREATE TABLE batch).
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_integrations,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_integrations AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_integrations AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.integration_deliveries,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.integration_deliveries AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.integration_deliveries AFTER UPDATE;
```

- [ ] **Step 2: Assert content**

```bash
grep -c "fn_tenant_access_predicate" apps/api/prisma/migrations/20260826100001_integrations_rls/migration.sql   # expect 6
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/migrations/20260826100001_integrations_rls
git commit -m "feat(integrations): RLS predicates on integrations tables"
```

---

### Task 4: SSRF URL allowlist (pure)

**Files:**
- Create: `apps/api/src/integrations/webhook-url-allowlist.ts`
- Test: `apps/api/src/integrations/webhook-url-allowlist.spec.ts`

**Interfaces:**
- Produces: `assertAllowedWebhookUrl(type: 'slack'|'msteams', rawUrl: string): void` (throws `Error` on reject); `isAllowedWebhookUrl(type, rawUrl): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { assertAllowedWebhookUrl, isAllowedWebhookUrl } from './webhook-url-allowlist';

describe('webhook URL allowlist (SSRF guard)', () => {
  it('allows a valid Slack hook', () => {
    expect(isAllowedWebhookUrl('slack', 'https://hooks.slack.com/services/T/B/x')).toBe(true);
  });
  it('allows Teams office.com and logic.azure.com hosts', () => {
    expect(isAllowedWebhookUrl('msteams', 'https://mytenant.webhook.office.com/webhookb2/abc')).toBe(true);
    expect(isAllowedWebhookUrl('msteams', 'https://prod-1.westus.logic.azure.com/workflows/x')).toBe(true);
  });
  it('rejects http (non-TLS)', () => {
    expect(isAllowedWebhookUrl('slack', 'http://hooks.slack.com/x')).toBe(false);
  });
  it('rejects a Slack URL on the wrong host', () => {
    expect(isAllowedWebhookUrl('slack', 'https://evil.example.com/x')).toBe(false);
  });
  it('rejects an internal/SSRF target', () => {
    expect(isAllowedWebhookUrl('msteams', 'https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedWebhookUrl('slack', 'https://localhost/x')).toBe(false);
  });
  it('rejects a lookalike suffix host', () => {
    expect(isAllowedWebhookUrl('msteams', 'https://webhook.office.com.evil.com/x')).toBe(false);
    expect(isAllowedWebhookUrl('slack', 'https://hooks.slack.com.evil.com/x')).toBe(false);
  });
  it('assert throws on reject', () => {
    expect(() => assertAllowedWebhookUrl('slack', 'https://evil.example.com')).toThrow(/not an allowed/i);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// apps/api/src/integrations/webhook-url-allowlist.ts
export type IntegrationType = 'slack' | 'msteams';

export function isAllowedWebhookUrl(type: IntegrationType, rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (type === 'slack') {
    return host === 'hooks.slack.com';
  }
  // msteams: exact-suffix match on a dot boundary (host === suffix-body or ends with '.' + suffix)
  return endsWithHost(host, 'webhook.office.com') || endsWithHost(host, 'logic.azure.com');
}

function endsWithHost(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix);
}

export function assertAllowedWebhookUrl(type: IntegrationType, rawUrl: string): void {
  if (!isAllowedWebhookUrl(type, rawUrl)) {
    throw new Error(`URL is not an allowed ${type} webhook endpoint`);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(integrations): SSRF host allowlist for chat webhook URLs"`

---

### Task 5: Message formatting (pure)

**Files:**
- Create: `apps/api/src/integrations/formatting/event-summary.ts`, `format-slack.ts`, `format-teams.ts`
- Test: `apps/api/src/integrations/formatting/formatting.spec.ts`

**Payload contract (each emit site provides these fields):** every payload includes `subject: string` (who/what — e.g. candidate name) and `linkPath: string` (console-relative path, e.g. `/candidates/123`). Optional, event-dependent: `examTitle`, `score`, `reason`, `slotTime`, `roleTitle`, `source`.

**Interfaces:**
- Produces:
  - `interface EventSummary { title: string; fields: { label: string; value: string }[]; url: string }`
  - `buildEventSummary(eventType: IntegrationEventType, payload: Record<string, unknown>, baseUrl: string): EventSummary`
  - `formatSlackMessage(summary: EventSummary): object` (Slack incoming-webhook body)
  - `formatTeamsMessage(summary: EventSummary): object` (Teams incoming-webhook Adaptive Card body)

- [ ] **Step 1: Write the failing test**

```ts
import { INTEGRATION_EVENT_TYPES } from '@exam-platform/shared';
import { buildEventSummary } from './event-summary';
import { formatSlackMessage } from './format-slack';
import { formatTeamsMessage } from './format-teams';

const base = 'https://app.example.com';

describe('buildEventSummary', () => {
  it('titles by event and always includes subject + url', () => {
    const s = buildEventSummary('attempt.submitted', { subject: 'Ada Lovelace', examTitle: 'Backend', linkPath: '/candidates/9' }, base);
    expect(s.title).toBe('Candidate finished exam');
    expect(s.fields[0]).toEqual({ label: 'Candidate', value: 'Ada Lovelace' });
    expect(s.fields).toContainEqual({ label: 'Exam', value: 'Backend' });
    expect(s.url).toBe('https://app.example.com/candidates/9');
  });

  it('maps optional fields only when present', () => {
    const s = buildEventSummary('integrity.flagged', { subject: 'X', reason: 'multiple faces', linkPath: '/live' }, base);
    expect(s.fields).toContainEqual({ label: 'Reason', value: 'multiple faces' });
    expect(s.fields.find((f) => f.label === 'Exam')).toBeUndefined();
  });

  it('produces a well-formed summary for every catalog event', () => {
    for (const t of INTEGRATION_EVENT_TYPES) {
      const s = buildEventSummary(t, { subject: 'S', linkPath: '/x' }, base);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.url).toBe('https://app.example.com/x');
    }
  });
});

describe('formatters are injection-safe (values are data only)', () => {
  const evil = 'Bad*_~`[x](http://evil)';
  const summary = buildEventSummary('offer.accepted', { subject: evil, linkPath: '/c/1' }, base);

  it('Slack puts untrusted text only in string fields', () => {
    const body = JSON.stringify(formatSlackMessage(summary));
    // the raw value survives as JSON string content, not spread into block structure
    expect(body).toContain(JSON.stringify(evil).slice(1, -1));
  });
  it('Teams card carries the link action to the summary url', () => {
    const body = JSON.stringify(formatTeamsMessage(summary));
    expect(body).toContain('https://app.example.com/c/1');
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// apps/api/src/integrations/formatting/event-summary.ts
import { INTEGRATION_EVENT_LABELS, IntegrationEventType } from '@exam-platform/shared';

export interface EventSummary {
  title: string;
  fields: { label: string; value: string }[];
  url: string;
}

// Optional payload keys -> field label, appended in this order when present.
const OPTIONAL_FIELDS: { key: string; label: string }[] = [
  { key: 'examTitle', label: 'Exam' },
  { key: 'roleTitle', label: 'Role' },
  { key: 'slotTime', label: 'When' },
  { key: 'score', label: 'Score' },
  { key: 'reason', label: 'Reason' },
  { key: 'source', label: 'Source' },
];

export function buildEventSummary(
  eventType: IntegrationEventType,
  payload: Record<string, unknown>,
  baseUrl: string,
): EventSummary {
  const subject = String(payload.subject ?? '');
  const fields: EventSummary['fields'] = [{ label: 'Candidate', value: subject }];
  for (const { key, label } of OPTIONAL_FIELDS) {
    const v = payload[key];
    if (v !== undefined && v !== null && String(v).length > 0) {
      fields.push({ label, value: String(v) });
    }
  }
  const path = String(payload.linkPath ?? '');
  return { title: INTEGRATION_EVENT_LABELS[eventType], fields, url: `${baseUrl}${path}` };
}
```

```ts
// apps/api/src/integrations/formatting/format-slack.ts
import { EventSummary } from './event-summary';

// Slack Incoming Webhook body. Untrusted values live only in `text` string fields.
export function formatSlackMessage(summary: EventSummary): object {
  const fieldLines = summary.fields.map((f) => `*${f.label}:* ${f.value}`).join('\n');
  return {
    text: summary.title,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: summary.title } },
      { type: 'section', text: { type: 'mrkdwn', text: fieldLines } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'View in console' }, url: summary.url },
        ],
      },
    ],
  };
}
```

> Note on Slack mrkdwn: values are placed as plain interpolated text; Slack does not execute `[x](y)`-style markdown links inside `mrkdwn` (it uses `<url|text>`), so pasted markup renders inert. Field labels are the only `*bold*` markers, controlled by us.

```ts
// apps/api/src/integrations/formatting/format-teams.ts
import { EventSummary } from './event-summary';

// Teams incoming-webhook Adaptive Card. Values live only in TextBlock/Fact string fields.
export function formatTeamsMessage(summary: EventSummary): object {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: summary.title, wrap: true },
            {
              type: 'FactSet',
              facts: summary.fields.map((f) => ({ title: f.label, value: f.value })),
            },
          ],
          actions: [{ type: 'Action.OpenUrl', title: 'View in console', url: summary.url }],
        },
      },
    ],
  };
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(integrations): pure event-summary + Slack/Teams formatters"`

---

### Task 6: Delivery queue + worker

**Files:**
- Create: `apps/api/src/jobs/integration-deliveries.queue.ts`, `apps/api/src/jobs/integration-delivery.worker.service.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts`
- Test: `apps/api/src/jobs/integration-delivery.worker.service.spec.ts`

**Interfaces:**
- Consumes: `assertAllowedWebhookUrl` (Task 4); `buildEventSummary`, `formatSlackMessage`, `formatTeamsMessage` (Task 5); `OrgSecretsCryptoService`, `TenantPrismaService`.
- Produces: `INTEGRATION_DELIVERIES_QUEUE` token, `INTEGRATION_DELIVERIES_QUEUE_NAME='integration-deliveries'`, `createIntegrationDeliveriesQueue(connection)`. Job data shape `{ deliveryId: string }`. `IntegrationDeliveryWorkerService`.

- [ ] **Step 1: Queue file**

```ts
// apps/api/src/jobs/integration-deliveries.queue.ts
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const INTEGRATION_DELIVERIES_QUEUE = 'INTEGRATION_DELIVERIES_QUEUE';
export const INTEGRATION_DELIVERIES_QUEUE_NAME = 'integration-deliveries';

export function createIntegrationDeliveriesQueue(connection: Redis): Queue {
  return new Queue(INTEGRATION_DELIVERIES_QUEUE_NAME, { connection });
}
```

- [ ] **Step 2: Write the failing worker test** (extract the deliverable HTTP logic into a testable method `deliver(delivery, integration)` so we don't need a live Redis):

```ts
import { IntegrationDeliveryWorkerService } from './integration-delivery.worker.service';

describe('IntegrationDeliveryWorkerService.deliver', () => {
  const crypto = { decrypt: jest.fn((b: string) => b.replace('enc:', '')) } as any;
  const prisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(txStub)) } as any;
  let txStub: any;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    txStub = { integrationDelivery: { update: jest.fn() }, orgIntegration: { update: jest.fn() } };
    prisma.forTenant = jest.fn(async (_c: unknown, fn: any) => fn(txStub));
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  function svc() { return new IntegrationDeliveryWorkerService({} as any, prisma, crypto); }

  const integration = { id: 'i1', organizationId: 'o1', type: 'slack', targetUrlEncrypted: 'enc:https://hooks.slack.com/services/A/B/c', status: 'active' };
  const delivery = { id: 'd1', organizationId: 'o1', integrationId: 'i1', eventType: 'attempt.submitted', payloadJson: JSON.stringify({ subject: 'Ada', linkPath: '/candidates/9' }) };

  it('POSTs to the decrypted Slack URL and marks delivered', async () => {
    await svc().deliver(delivery as any, integration as any);
    expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack.com/services/A/B/c', expect.objectContaining({ method: 'POST' }));
    expect(txStub.integrationDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'delivered', httpStatusCode: 200 }) }));
    expect(txStub.orgIntegration.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastDeliveryAt: expect.any(Date), lastError: null }) }));
  });

  it('rejects an off-allowlist URL without calling fetch', async () => {
    const bad = { ...integration, targetUrlEncrypted: 'enc:https://evil.example.com/x' };
    await expect(svc().deliver(delivery as any, bad as any)).rejects.toThrow(/not an allowed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on non-2xx so BullMQ retries', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(svc().deliver(delivery as any, integration as any)).rejects.toThrow(/status 500/);
  });
});
```

- [ ] **Step 3: Implement the worker** (mirror `webhook-delivery.worker.service.ts`; store the rendered payload in the `IntegrationDelivery` row so `deliver` needs no re-render dependency at enqueue time — the fan-out writes `payloadJson`-equivalent via the delivery's `eventType` + the emit payload; here we keep the raw emit payload on the job. To keep the row schema minimal we DO NOT add a payload column — instead the fan-out passes the payload through the job and the worker persists only status. The worker re-reads the integration + delivery, and the fan-out has already stored the event payload on the job.)

Concretely, job data is `{ deliveryId }`, and the emit payload is embedded in the delivery via a transient join: the fan-out stores the payload on the job as `{ deliveryId, payload }`. Implement:

```ts
// apps/api/src/jobs/integration-delivery.worker.service.ts
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService, OrgSecretsCryptoService, IntegrationEventType } from '@exam-platform/shared';
import { REDIS_CONNECTION } from './redis-connection';
import { INTEGRATION_DELIVERIES_QUEUE_NAME } from './integration-deliveries.queue';
import { assertAllowedWebhookUrl, IntegrationType } from '../integrations/webhook-url-allowlist';
import { buildEventSummary } from '../integrations/formatting/event-summary';
import { formatSlackMessage } from '../integrations/formatting/format-slack';
import { formatTeamsMessage } from '../integrations/formatting/format-teams';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

export interface IntegrationDeliveryJobData {
  deliveryId: string;
  eventType: IntegrationEventType;
  payload: Record<string, unknown>;
}

interface DeliveryRow { id: string; organizationId: string; integrationId: string; eventType: string }
interface IntegrationRow { id: string; organizationId: string; type: string; targetUrlEncrypted: string; status: string }

@Injectable()
export class IntegrationDeliveryWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(IntegrationDeliveryWorkerService.name);
  private readonly worker: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {
    this.worker = new Worker(INTEGRATION_DELIVERIES_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        const data = job.data as IntegrationDeliveryJobData;
        void this.markFailed(data.deliveryId).catch((e) => this.logger.error('mark failed', e as Error));
      }
    });
  }

  private async handle(job: Job<IntegrationDeliveryJobData>): Promise<void> {
    const { deliveryId, eventType, payload } = job.data;
    const { delivery, integration } = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, async (tx) => {
      const d = await tx.integrationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
      const i = await tx.orgIntegration.findUnique({ where: { id: d.integrationId } });
      return { delivery: d, integration: i };
    });
    if (!integration || integration.status !== 'active') {
      // Config removed/disabled between enqueue and run: mark failed, do not retry.
      await this.markFailed(deliveryId, 'integration missing or disabled');
      return;
    }
    await this.deliver(delivery as DeliveryRow, integration as IntegrationRow, eventType, payload);
  }

  // Extracted for unit tests (no Redis needed).
  async deliver(delivery: DeliveryRow, integration: IntegrationRow, eventType: IntegrationEventType, payload: Record<string, unknown>): Promise<void> {
    const type = integration.type as IntegrationType;
    const url = this.cryptoService.decrypt(integration.targetUrlEncrypted);
    assertAllowedWebhookUrl(type, url); // throws -> caught below -> marked failed, no retry value

    const baseUrl = process.env.APP_BASE_URL ?? '';
    const summary = buildEventSummary(eventType, payload, baseUrl);
    const body = type === 'slack' ? formatSlackMessage(summary) : formatTeamsMessage(summary);

    let response: { ok: boolean; status: number };
    try {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      await this.recordAttempt(delivery, integration, false, undefined, (e as Error).message);
      throw e;
    }
    await this.recordAttempt(delivery, integration, response.ok, response.status, response.ok ? undefined : `status ${response.status}`);
    if (!response.ok) {
      throw new Error(`Chat endpoint responded with status ${response.status}`);
    }
  }

  private async recordAttempt(delivery: DeliveryRow, integration: IntegrationRow, ok: boolean, httpStatusCode: number | undefined, error: string | undefined): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, async (tx) => {
      await tx.integrationDelivery.update({
        where: { id: delivery.id },
        data: { status: ok ? 'delivered' : 'pending', httpStatusCode, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), errorDetail: error ?? null },
      });
      await tx.orgIntegration.update({
        where: { id: integration.id },
        data: ok ? { lastDeliveryAt: new Date(), lastError: null } : { lastError: error ?? 'delivery failed' },
      });
    });
  }

  private async markFailed(deliveryId: string, error?: string): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.integrationDelivery.update({ where: { id: deliveryId }, data: { status: 'failed', errorDetail: error ?? null } }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
```

> The unit test calls `deliver(...)` with a 3-arg shape in Step 2; update the test to pass `eventType` and `payload` to match this signature — the test's `delivery`/`integration` stubs stay, add `'attempt.submitted', { subject:'Ada', linkPath:'/candidates/9' }` as the 3rd/4th args. Keep assertions identical.

- [ ] **Step 4: Register in `jobs.module.ts`** — add imports and providers (do NOT remove existing ones):

```ts
import { INTEGRATION_DELIVERIES_QUEUE, createIntegrationDeliveriesQueue } from './integration-deliveries.queue';
import { IntegrationDeliveryWorkerService } from './integration-delivery.worker.service';
// ...in providers: []
{ provide: INTEGRATION_DELIVERIES_QUEUE, useFactory: createIntegrationDeliveriesQueue, inject: [REDIS_CONNECTION] },
IntegrationDeliveryWorkerService,
```

- [ ] **Step 5: Run worker test → PASS**, then commit.

```bash
npx jest --runTestsByPath src/jobs/integration-delivery.worker.service.spec.ts
git add apps/api/src/jobs/integration-deliveries.queue.ts apps/api/src/jobs/integration-delivery.worker.service.ts apps/api/src/jobs/integration-delivery.worker.service.spec.ts apps/api/src/jobs/jobs.module.ts
git commit -m "feat(integrations): integration-deliveries queue + delivery worker (SSRF-guarded)"
```

---

### Task 7: IntegrationEventsService (fan-out)

**Files:**
- Create: `apps/api/src/integrations/integration-events.service.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts` (provide + export it)
- Test: `apps/api/src/integrations/integration-events.service.spec.ts`

**Interfaces:**
- Consumes: `WebhooksService.enqueue` (existing, JobsModule), `INTEGRATION_DELIVERIES_QUEUE`, `TenantPrismaService`.
- Produces:
  - `emit(organizationId: string, eventType: IntegrationEventType, payload: Record<string, unknown>): Promise<void>`
  - `enqueueTest(organizationId: string, integrationId: string): Promise<void>`

Fan-out logic: (1) call `webhooksService.enqueue(orgId, eventType, payload)` (unchanged behavior); (2) load active `OrgIntegration`s for the org whose parsed `events` JSON includes `eventType`; for each, create an `IntegrationDelivery` row (`status:'pending'`) and add an `integration-deliveries` job `{ deliveryId, eventType, payload }` with `attempts:3, backoff exponential 30s`. All reads/writes via super-admin `forTenant`; **must be called post-commit, never inside a caller's write tx.**

- [ ] **Step 1: Write the failing test**

```ts
import { IntegrationEventsService } from './integration-events.service';

describe('IntegrationEventsService.emit', () => {
  let webhooks: { enqueue: jest.Mock };
  let queue: { add: jest.Mock };
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    webhooks = { enqueue: jest.fn() };
    queue = { add: jest.fn() };
    tx = {
      orgIntegration: { findMany: jest.fn() },
      integrationDelivery: { create: jest.fn(async ({ data }: any) => ({ id: 'del-' + data.integrationId, ...data })) },
    };
    prisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
  });

  const svc = () => new IntegrationEventsService(prisma, webhooks as any, queue as any);

  it('always calls the existing webhook enqueue', async () => {
    tx.orgIntegration.findMany.mockResolvedValue([]);
    await svc().emit('o1', 'attempt.settled', { subject: 'A', linkPath: '/x' });
    expect(webhooks.enqueue).toHaveBeenCalledWith('o1', 'attempt.settled', { subject: 'A', linkPath: '/x' });
  });

  it('enqueues one delivery per active integration subscribed to the event', async () => {
    tx.orgIntegration.findMany.mockResolvedValue([
      { id: 'i1', events: JSON.stringify(['attempt.settled', 'invitation.created']) },
      { id: 'i2', events: JSON.stringify(['invitation.created']) },       // not subscribed
      { id: 'i3', events: JSON.stringify(['attempt.settled']) },
    ]);
    await svc().emit('o1', 'attempt.settled', { subject: 'A', linkPath: '/x' });
    // findMany already filters status:'active'; event-subset filtered in code
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('deliver', expect.objectContaining({ deliveryId: 'del-i1', eventType: 'attempt.settled' }), expect.objectContaining({ attempts: 3 }));
    expect(queue.add).toHaveBeenCalledWith('deliver', expect.objectContaining({ deliveryId: 'del-i3' }), expect.anything());
  });

  it('no active integrations -> no delivery jobs, webhook still fires', async () => {
    tx.orgIntegration.findMany.mockResolvedValue([]);
    await svc().emit('o1', 'candidate.applied', { subject: 'A', linkPath: '/x' });
    expect(queue.add).not.toHaveBeenCalled();
    expect(webhooks.enqueue).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// apps/api/src/integrations/integration-events.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService, IntegrationEventType } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { INTEGRATION_DELIVERIES_QUEUE } from '../jobs/integration-deliveries.queue';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };
const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } as const };

@Injectable()
export class IntegrationEventsService {
  private readonly logger = new Logger(IntegrationEventsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly webhooksService: WebhooksService,
    @Inject(INTEGRATION_DELIVERIES_QUEUE) private readonly queue: Queue,
  ) {}

  // Call POST-COMMIT, outside any forTenant write transaction. Never throws to the caller —
  // a notification failure must not roll back or break the domain operation that triggered it.
  async emit(organizationId: string, eventType: IntegrationEventType, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.webhooksService.enqueue(organizationId, eventType, payload);
    } catch (e) {
      this.logger.error(`webhook enqueue failed for ${eventType}`, e as Error);
    }
    try {
      const integrations = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
        tx.orgIntegration.findMany({ where: { organizationId, status: 'active' }, select: { id: true, events: true } }),
      );
      const matched = integrations.filter((i) => parseEvents(i.events).includes(eventType));
      for (const integration of matched) {
        const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
          tx.integrationDelivery.create({ data: { organizationId, integrationId: integration.id, eventType, status: 'pending' } }),
        );
        await this.queue.add('deliver', { deliveryId: delivery.id, eventType, payload }, JOB_OPTS);
      }
    } catch (e) {
      this.logger.error(`chat fan-out failed for ${eventType}`, e as Error);
    }
  }

  async enqueueTest(organizationId: string, integrationId: string): Promise<void> {
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.integrationDelivery.create({ data: { organizationId, integrationId, eventType: 'attempt.submitted', status: 'pending' } }),
    );
    await this.queue.add('deliver', {
      deliveryId: delivery.id,
      eventType: 'attempt.submitted',
      payload: { subject: 'Test message', examTitle: 'Connection test', linkPath: '/settings/integrations' },
    }, JOB_OPTS);
  }
}

function parseEvents(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Provide + export from `jobs.module.ts`** — add `IntegrationEventsService` to `providers` and to `exports` (so consumer modules importing JobsModule can inject it). It needs `WebhooksService` (already provided in JobsModule) + `INTEGRATION_DELIVERIES_QUEUE` (Task 6) + `TenantPrismaService` (global).

- [ ] **Step 5: Run → PASS, commit.**

```bash
npx jest --runTestsByPath src/integrations/integration-events.service.spec.ts
git add apps/api/src/integrations/integration-events.service.ts apps/api/src/integrations/integration-events.service.spec.ts apps/api/src/jobs/jobs.module.ts
git commit -m "feat(integrations): IntegrationEventsService fan-out (webhook + chat)"
```

---

### Task 8: Broaden the internal endpoint to generic events

**Files:**
- Modify: `apps/api/src/internal/dto/dispatch-webhook.dto.ts`, `apps/api/src/internal/internal.controller.ts`, `apps/api/src/internal/internal.module.ts`, `apps/api/src/internal/internal.controller.spec.ts`

**Interfaces:**
- Consumes: `IntegrationEventsService.emit` (Task 7).
- Produces: the internal `POST /internal/webhooks/dispatch` now accepts `eventType ∈ { attempt.submitted, attempt.settled, integrity.flagged }` and routes through `IntegrationEventsService.emit`.

- [ ] **Step 1: Update the DTO's allowed events**

```ts
// dispatch-webhook.dto.ts — change the @IsIn line to:
@IsIn(['attempt.submitted', 'attempt.settled', 'integrity.flagged'])
eventType!: string;
```

- [ ] **Step 2: Update the controller to emit**

```ts
// internal.controller.ts
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { IntegrationEventType } from '@exam-platform/shared';
// ...
export class InternalController {
  constructor(private readonly integrationEvents: IntegrationEventsService) {}

  @Post('dispatch')
  @HttpCode(204)
  async dispatch(@Body() dto: DispatchWebhookDto): Promise<void> {
    await this.integrationEvents.emit(dto.organizationId, dto.eventType as IntegrationEventType, dto.data);
  }
}
```

- [ ] **Step 3: Update `internal.module.ts`** — import `JobsModule` (provides+exports `IntegrationEventsService`) instead of `WebhooksModule`:

```ts
import { JobsModule } from '../jobs/jobs.module';
@Module({ imports: [JobsModule], controllers: [InternalController] })
export class InternalModule {}
```

- [ ] **Step 4: Update the controller spec** to assert it delegates to `IntegrationEventsService.emit` (replace the `WebhooksService` mock with an `IntegrationEventsService` mock; assert `emit('org-1','attempt.settled',{...})`). Add a case: an unknown eventType is rejected by validation (DTO-level — assert `@IsIn` covers the 3 values by unit-testing the DTO with `class-validator`'s `validateSync`).

- [ ] **Step 5: Run → PASS, commit.**

```bash
npx jest --runTestsByPath src/internal/internal.controller.spec.ts
git commit -am "feat(integrations): route internal dispatch through IntegrationEventsService (3 exam-runtime events)"
```

---

### Task 9: Wire API-side emit points

**Files (modify — each is a small post-commit `emit` call):**
- `apps/api/src/invitations/invitations.service.ts` + `apps/api/src/.../walk-in.service.ts` (`invitation.created` — these already call `webhooksService.enqueue`; replace that call with `integrationEvents.emit(orgId, 'invitation.created', payload)`).
- `apps/api/src/interviews/interviews.service.ts` (`respondPublic` confirm branch → `interview.confirmed`).
- offers accept path (`offer.accepted`).
- walk-in / public apply path (`candidate.applied`).
- `apps/api/src/jobs/processors/candidate-fit.processor.ts` (`candidate.fit_scored` — this processor is inside JobsModule, inject `IntegrationEventsService` directly).
- Each owning module (`InvitationsModule`, `InterviewsModule`, `OffersModule`, walk-in module) must `imports: [JobsModule]` if not already, to inject `IntegrationEventsService`.

**Interfaces:** Consumes `IntegrationEventsService.emit`. Payload contract from Task 5 (`subject`, `linkPath`, plus event-appropriate optional fields).

- [ ] **Step 1: For each site, write/adjust a service unit test** asserting `integrationEvents.emit` is called once, after the domain write, with the right `eventType` and a payload containing `subject` + `linkPath`. Example (interviews confirm):

```ts
it('emits interview.confirmed after a public confirm', async () => {
  // ...arrange respondPublic happy path with an emit mock...
  await service.respondPublic(token, { slotId });
  expect(integrationEvents.emit).toHaveBeenCalledWith(
    orgId, 'interview.confirmed',
    expect.objectContaining({ subject: expect.any(String), linkPath: expect.stringContaining('/interviews/') }),
  );
});
```

- [ ] **Step 2: Run the new assertions → FAIL.**

- [ ] **Step 3: Implement each emit call** — after the relevant write commits (outside `forTenant`). Payloads:
  - `invitation.created`: `{ subject: candidateEmail|candidateName, examTitle, linkPath: '/candidates' }` (keep parity with the data currently passed to `webhooksService.enqueue`; carry over its existing fields and add `subject`/`linkPath`).
  - `interview.confirmed`: `{ subject: candidateName, slotTime: confirmedSlot.startsAt.toISOString(), linkPath: `/interviews/${interview.id}` }`.
  - `offer.accepted`: `{ subject: candidateName, roleTitle: offer.roleTitle ?? undefined, linkPath: `/candidates/${candidateId}` }`.
  - `candidate.applied`: `{ subject: candidateName, source: 'walk-in'|'public', linkPath: `/candidates/${candidate.id}` }`.
  - `candidate.fit_scored`: `{ subject: candidateName, score: String(assessment.overallScore), linkPath: `/candidates/${candidateId}` }`.

- [ ] **Step 4: Add `JobsModule` import to any owning module that lacks it. Run each site's suite → PASS.**

- [ ] **Step 5: Commit** — `git commit -am "feat(integrations): emit the 5 API-side lifecycle events"`

> Reviewer note: verify each `emit` is placed AFTER the domain write's `forTenant` block returns (not inside it) and is not `await`ed inside a transaction callback.

---

### Task 10: Emit the exam-runtime events

**Files:**
- Modify (exam-runtime): the attempt-submit path and the integrity/proctoring-flag path to POST the internal dispatch for `attempt.submitted` and `integrity.flagged` (mirror the existing `attempt.settled` dispatch in `apps/exam-runtime/src/grading/attempt-settlement.service.ts` → `apiInternalClient.dispatchWebhook`).
- Test: exam-runtime unit tests for the two new dispatch calls.

**Interfaces:** Consumes the existing exam-runtime `apiInternalClient.dispatchWebhook(organizationId, eventType, data)` (or equivalently named method used for `attempt.settled`). Sends `data` shaped for the payload contract (`subject`, `linkPath`, optional fields).

- [ ] **Step 1: Locate the existing `attempt.settled` dispatch** and the internal client method signature. Confirm the client posts to `POST /internal/webhooks/dispatch` with `x-internal-secret`.

- [ ] **Step 2: Write failing tests** asserting the submit path dispatches `attempt.submitted` and the integrity-flag path dispatches `integrity.flagged`, each with `{ subject, linkPath, ... }`.

- [ ] **Step 3: Implement the two dispatch calls** post-commit:
  - `attempt.submitted`: on candidate submit, `dispatchWebhook(orgId, 'attempt.submitted', { subject: candidateName, examTitle, linkPath: `/candidates/${candidateId}` })`.
  - `integrity.flagged`: when an integrity/proctoring violation is recorded, `dispatchWebhook(orgId, 'integrity.flagged', { subject: candidateName, examTitle, reason: violationReason, linkPath: `/live` })`. If the flag is created in a hot path/loop, dispatch once per new flag (not per frame) — guard on the same condition that persists a new violation row.

- [ ] **Step 4: Run exam-runtime tests → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(integrations): exam-runtime emits attempt.submitted + integrity.flagged"`

---

### Task 11: Connected Apps API (IntegrationsModule)

**Files:**
- Create: `apps/api/src/integrations/dto/create-connected-app.dto.ts`, `dto/update-connected-app.dto.ts`
- Create: `apps/api/src/integrations/connected-apps.service.ts`, `connected-apps.controller.ts`, `integrations.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `IntegrationsModule`)
- Test: `apps/api/src/integrations/connected-apps.service.spec.ts`, `connected-apps.controller.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `OrgSecretsCryptoService`, `AuditService`, `assertAllowedWebhookUrl` (Task 4), `INTEGRATION_EVENT_TYPES` (Task 1), `IntegrationEventsService.enqueueTest` (Task 7, via JobsModule).
- Produces REST under `@Controller('organizations/integrations')`, guarded `JwtAuthGuard, PermissionsGuard` + `@RequirePermissions('org:manage_settings')`:
  - `GET connected-apps` → `ConnectedAppView[]` (`{ id, type, label, events, status, lastDeliveryAt, lastError, urlHint }`, **no secret**).
  - `POST connected-apps` `{ type, label, targetUrl, events[] }` → view.
  - `PATCH connected-apps/:id` `{ label?, events?, status?, targetUrl? }` → view.
  - `DELETE connected-apps/:id` → `{ ok: true }`.
  - `POST connected-apps/:id/test` → `{ queued: true }`.
  - `GET connected-apps/:id/deliveries` → recent `IntegrationDelivery` rows.

- [ ] **Step 1: DTOs**

```ts
// create-connected-app.dto.ts
import { ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { INTEGRATION_EVENT_TYPES } from '@exam-platform/shared';

export class CreateConnectedAppDto {
  @IsIn(['slack', 'msteams']) type!: 'slack' | 'msteams';
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsString() @MinLength(1) targetUrl!: string;
  @IsArray() @ArrayNotEmpty() @IsIn(INTEGRATION_EVENT_TYPES as unknown as string[], { each: true }) events!: string[];
}
```

```ts
// update-connected-app.dto.ts
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { INTEGRATION_EVENT_TYPES } from '@exam-platform/shared';

export class UpdateConnectedAppDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) label?: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(INTEGRATION_EVENT_TYPES as unknown as string[], { each: true }) events?: string[];
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
  @IsOptional() @IsString() @MinLength(1) targetUrl?: string;
}
```

- [ ] **Step 2: Write failing service tests** (use a `forTenant` stub like Task 6/7):

```ts
it('create encrypts the URL, validates host allowlist, stores events JSON, audits, returns masked view', async () => {
  const view = await service.create(ctx, { type: 'slack', label: '#rec', targetUrl: 'https://hooks.slack.com/services/T/B/xyz', events: ['attempt.settled'] });
  expect(crypto.encrypt).toHaveBeenCalledWith('https://hooks.slack.com/services/T/B/xyz');
  expect(view).not.toHaveProperty('targetUrl');
  expect(view.urlHint).toMatch(/\*\*\*\*/);
  expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'integration.connected' }));
});

it('create rejects an off-allowlist URL before persisting', async () => {
  await expect(service.create(ctx, { type: 'slack', label: 'x', targetUrl: 'https://evil.example.com', events: ['attempt.settled'] }))
    .rejects.toThrow(/not an allowed/i);
  expect(tx.orgIntegration.create).not.toHaveBeenCalled();
});

it('list never returns the encrypted URL', async () => {
  tx.orgIntegration.findMany.mockResolvedValue([{ id: 'i1', type: 'slack', label: '#r', events: '["attempt.settled"]', status: 'active', lastDeliveryAt: null, lastError: null, targetUrlEncrypted: 'enc' }]);
  const rows = await service.list(ctx);
  expect(JSON.stringify(rows)).not.toContain('enc');
  expect(rows[0].events).toEqual(['attempt.settled']);
});
```

- [ ] **Step 3: Implement the service** (all via `forTenant(context, ...)` with the real caller TenantContext; encrypt on create/URL-change; parse `events` JSON for views; `urlHint` = last 4 chars masked):

```ts
// connected-apps.service.ts (core shape)
@Injectable()
export class ConnectedAppsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly audit: AuditService,
    private readonly integrationEvents: IntegrationEventsService,
  ) {}

  async list(context: TenantContext): Promise<ConnectedAppView[]> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgIntegration.findMany({ orderBy: { createdAt: 'desc' } }));
    return rows.map(toView);
  }

  async create(context: TenantContext, dto: CreateConnectedAppDto): Promise<ConnectedAppView> {
    assertAllowedWebhookUrl(dto.type, dto.targetUrl);
    const row = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgIntegration.create({ data: {
        organizationId: context.organizationId!, type: dto.type, label: dto.label,
        targetUrlEncrypted: this.crypto.encrypt(dto.targetUrl), events: JSON.stringify(dto.events), status: 'active',
      } }));
    await this.audit.log({ context, action: 'integration.connected', targetId: row.id });
    return toView(row);
  }

  async update(context: TenantContext, id: string, dto: UpdateConnectedAppDto): Promise<ConnectedAppView> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.events !== undefined) data.events = JSON.stringify(dto.events);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.targetUrl !== undefined) {
      const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.orgIntegration.findUniqueOrThrow({ where: { id } }));
      assertAllowedWebhookUrl(existing.type as 'slack' | 'msteams', dto.targetUrl);
      data.targetUrlEncrypted = this.crypto.encrypt(dto.targetUrl);
    }
    const row = await this.tenantPrisma.forTenant(context, (tx) => tx.orgIntegration.update({ where: { id }, data }));
    await this.audit.log({ context, action: 'integration.updated', targetId: id });
    return toView(row);
  }

  async remove(context: TenantContext, id: string): Promise<{ ok: true }> {
    await this.tenantPrisma.forTenant(context, (tx) => tx.orgIntegration.delete({ where: { id } }));
    await this.audit.log({ context, action: 'integration.removed', targetId: id });
    return { ok: true };
  }

  async test(context: TenantContext, id: string): Promise<{ queued: true }> {
    await this.integrationEvents.enqueueTest(context.organizationId!, id);
    return { queued: true };
  }

  async deliveries(context: TenantContext, id: string): Promise<unknown[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.integrationDelivery.findMany({ where: { integrationId: id }, orderBy: { createdAt: 'desc' }, take: 20 }));
  }
}
```

Provide `toView` (masking) and `ConnectedAppView` in the same file:

```ts
export interface ConnectedAppView {
  id: string; type: string; label: string; events: string[];
  status: string; lastDeliveryAt: Date | null; lastError: string | null; urlHint: string;
}
function toView(row: { id: string; type: string; label: string; events: string; status: string; lastDeliveryAt: Date | null; lastError: string | null }): ConnectedAppView {
  return { id: row.id, type: row.type, label: row.label, events: parseEvents(row.events), status: row.status, lastDeliveryAt: row.lastDeliveryAt, lastError: row.lastError, urlHint: '****' };
}
```

> Match `AuditService.log`'s real signature when implementing — check an existing caller (e.g. the billing/plans service) and mirror its argument shape exactly; the `{ context, action, targetId }` above is indicative, adjust to the real API.

- [ ] **Step 4: Implement the controller** (mirror the existing org-admin controller's guard/decorator usage; resolve the `TenantContext` the same way sibling controllers do — check how `organizations.controller.ts` obtains the current context/user and reuse that mechanism):

```ts
// connected-apps.controller.ts
@Controller('organizations/integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConnectedAppsController {
  constructor(private readonly service: ConnectedAppsService) {}

  @Get('connected-apps') @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() ctx: TenantContext) { return this.service.list(ctx); }

  @Post('connected-apps') @RequirePermissions('org:manage_settings')
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateConnectedAppDto) { return this.service.create(ctx, dto); }

  @Patch('connected-apps/:id') @RequirePermissions('org:manage_settings')
  update(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateConnectedAppDto) { return this.service.update(ctx, id, dto); }

  @Delete('connected-apps/:id') @RequirePermissions('org:manage_settings')
  remove(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) { return this.service.remove(ctx, id); }

  @Post('connected-apps/:id/test') @RequirePermissions('org:manage_settings')
  test(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) { return this.service.test(ctx, id); }

  @Get('connected-apps/:id/deliveries') @RequirePermissions('org:manage_settings')
  deliveries(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) { return this.service.deliveries(ctx, id); }
}
```

> `@CurrentTenant()`/`TenantContext` are indicative — use whatever the existing controllers use to get the tenant context (there is an established decorator; reuse it verbatim).

- [ ] **Step 5: Module + registration**

```ts
// integrations.module.ts
import { Module } from '@nestjs/common';
import { CryptoModule, AuditModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { ConnectedAppsController } from './connected-apps.controller';
import { ConnectedAppsService } from './connected-apps.service';

@Module({
  imports: [CryptoModule, AuditModule, JobsModule], // JobsModule provides IntegrationEventsService (enqueueTest)
  controllers: [ConnectedAppsController],
  providers: [ConnectedAppsService],
})
export class IntegrationsModule {}
```

Register `IntegrationsModule` in `app.module.ts` `imports`.

- [ ] **Step 6: Run service + controller tests → PASS, commit.**

```bash
npx jest --runTestsByPath src/integrations/connected-apps.service.spec.ts src/integrations/connected-apps.controller.spec.ts
git add apps/api/src/integrations apps/api/src/app.module.ts
git commit -m "feat(integrations): Connected Apps CRUD + test + deliveries API"
```

---

### Task 12: Web — hooks + Connected Apps UI

**Files:**
- Create: `apps/web/lib/hooks/useConnectedApps.ts`, `apps/web/components/integrations/ConnectedAppsSection.tsx`
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.tsx`, `apps/web/lib/types.ts`
- Test: `apps/web/lib/hooks/useConnectedApps.test.ts`, `apps/web/components/integrations/ConnectedAppsSection.test.tsx`

**Interfaces:**
- Consumes the Task 11 endpoints. Mirror `useIntegrations.ts` (same `apiFetch` + SWR/React-Query pattern already used there — match it exactly).
- Produces hooks: `useConnectedApps`, `useCreateConnectedApp`, `useUpdateConnectedApp`, `useDeleteConnectedApp`, `useTestConnectedApp`, `useConnectedAppDeliveries`; and `<ConnectedAppsSection />`.

- [ ] **Step 1: Add row types** to `apps/web/lib/types.ts`:

```ts
export interface ConnectedAppRow {
  id: string; type: 'slack' | 'msteams'; label: string; events: string[];
  status: 'active' | 'disabled'; lastDeliveryAt: string | null; lastError: string | null; urlHint: string;
}
export interface ConnectedAppDeliveryRow {
  id: string; eventType: string; status: string; httpStatusCode: number | null; createdAt: string; lastAttemptAt: string | null;
}
```

- [ ] **Step 2: Write failing hook test** (mirror `useIntegrations.test`): assert `useConnectedApps` GETs `/organizations/integrations/connected-apps`, `useCreateConnectedApp` POSTs the body, `useTestConnectedApp` POSTs to `/:id/test`. Use the same test harness the existing hook tests use.

- [ ] **Step 3: Implement `useConnectedApps.ts`** mirroring `useIntegrations.ts` (same imports, same `apiFetch`, same query-key/mutation conventions). Endpoints exactly as Task 11.

- [ ] **Step 4: Implement `ConnectedAppsSection.tsx`** — a `CollapsibleSection` titled "Connected Apps (Slack & Teams)":
  - list rows (type badge, label, event chips, status toggle, last delivery/error, Test/Edit/Remove);
  - Add/Edit modal: `type` select (Slack/Teams), `targetUrl` text input with a per-type "how to get this URL" helper link (Slack: incoming-webhooks docs; Teams: Workflows docs), `label` input, and a checkbox list built from the shared catalog — import `INTEGRATION_EVENT_TYPES` + `INTEGRATION_EVENT_LABELS` from `@exam-platform/shared` (if web cannot resolve the shared package at build, fall back to a local `const` list that mirrors the 8 labels — verify which during implementation);
  - reuse the existing `CollapsibleSection` + design-system inputs/buttons used elsewhere on the page.

- [ ] **Step 5: Mount in `page.tsx`** — add `<ConnectedAppsSection />` alongside the existing SMTP/AI/Public-API/Webhooks sections (no new nav entry).

- [ ] **Step 6: Component test** — render the section with a mocked hook returning one Slack row + one Teams row; assert both labels and their event chips render; open the Add modal and assert the 8 event checkboxes appear. Run with `--runTestsByPath` (route group has parens):

```bash
npx jest --runTestsByPath "app/(org-admin)/settings/integrations/page.test.tsx" components/integrations/ConnectedAppsSection.test.tsx lib/hooks/useConnectedApps.test.ts
```

- [ ] **Step 7: Commit** — `git commit -m "feat(integrations): Connected Apps settings UI + hooks"`

---

### Task 13: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild shared, then typecheck all packages**

```bash
npm run build --workspace @exam-platform/shared
cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ../..
cd apps/exam-runtime && npx tsc --noEmit -p tsconfig.json && cd ../..
cd apps/web && npx tsc --noEmit -p tsconfig.json && cd ../..
```
Expected: all clean, exit 0.

- [ ] **Step 2: Run the touched API suites**

```bash
cd apps/api
npx jest --runTestsByPath \
  src/integrations/webhook-url-allowlist.spec.ts \
  src/integrations/formatting/formatting.spec.ts \
  src/jobs/integration-delivery.worker.service.spec.ts \
  src/integrations/integration-events.service.spec.ts \
  src/internal/internal.controller.spec.ts \
  src/integrations/connected-apps.service.spec.ts \
  src/integrations/connected-apps.controller.spec.ts
```
Expected: all green. (If the box reports mass unrelated failures under load, re-run the specific file isolated — this machine fakes jest failures under load.)

- [ ] **Step 3: Run exam-runtime + web touched suites** (web with `--runTestsByPath` for parens paths). Expected: green.

- [ ] **Step 4: `prisma validate`**

```bash
cd apps/api && DATABASE_URL="sqlserver://placeholder" npx prisma validate
```
Expected: valid 🚀.

- [ ] **Step 5: DI-boot sanity (static)** — grep-confirm every module whose provider/controller injects `IntegrationEventsService` imports `JobsModule`: `InternalModule`, `IntegrationsModule`, and each of the 4 emit-site owning modules touched in Task 9. (This is the check that catches the prod DI crash that `tsc` + mocks miss.)

- [ ] **Step 6: Record completion in the ledger and stop** (no deploy — deferred).

---

## Notes for the executor

- **Deploy is deferred** (like billing). Do NOT deploy at the end; the branch merges to `origin/main` when the user says so, and deploys later with billing.
- **Do not commit** the `apps/api/jest.config.js` / `apps/api/tsconfig.json` `@exam-platform/shared` shims if the worktree already carries them uncommitted — leave them uncommitted.
- **AuditService / tenant-context decorator / hook harness** signatures marked "indicative" above must be reconciled against the real code at implementation time — mirror an existing sibling (billing service for audit; `organizations.controller.ts` for the tenant-context decorator; `useIntegrations.ts` + its test for the web data layer).
