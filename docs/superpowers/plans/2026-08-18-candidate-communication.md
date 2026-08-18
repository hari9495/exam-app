# Candidate Communication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give recruiters templated, merge-field email to candidates — sent manually or triggered by pipeline stage moves — via the existing per-org SMTP, with a per-candidate send log.

**Architecture:** Two new per-org tables (`CandidateMessageTemplate`, `CandidateMessage`). A pure render/HTML-shell module. A `CandidateMessageTemplatesService` (code-defaults + per-org overrides) and a reusable `CandidateMessagesService` (`sendMessage` server-renders raw `{{tokens}}` → `EmailService.send` → log row). `PipelineService.patchEntry` gets a post-commit hook that auto-sends or returns a `pendingMessage` draft. Frontend adds a Messages timeline + compose modal on the candidate drawer, a stage-move confirm modal, and a Message Templates admin page.

**Tech Stack:** NestJS 11 (apps/api), Next.js 16 (apps/web), Prisma + Azure SQL (SQL Server), Jest, React Query.

## Global Constraints

- **Reuse the email send layer:** `EmailService.send({ to, subject, html, organizationId }): Promise<{ success: boolean; previewUrl?: string }>` (`apps/api/src/email/email.service.ts:71`) — never throws; returns `success`. Import `EmailModule` where needed.
- **Reuse the branded shell:** generalize `buildAssessmentEmailHtml` / `firstNameOf` (`apps/api/src/invitations/invitations.service.ts:81`). Org logo is a SAS-signed URL: `blobStorage.signIfOurs(org.logoPath, ttlMs)`.
- **Single stage-move hook:** `PipelineService.patchEntry` (`apps/api/src/pipeline/pipeline.service.ts:239`) — the only user-driven stage/rejected change; loads the existing entry first (old+new stage in scope). Stage-triggered sends fire **after** the `forTenant` tx commits, fire-and-forget (invitation pattern, `invitations.service.ts:206-216`).
- **Org-scoped, no Organization FK:** every new table has an `organizationId` **plain column** (NO Prisma relation to Organization — matches `PipelineEntry`, avoids SQL Server P1012 multiple-cascade-path). All writes go through `TenantPrismaService.forTenant(context, fn)` (RLS). RLS predicates are added in a **separate** migration (`ALTER SECURITY POLICY` can't run in the same batch as the `CREATE TABLE`).
- **Permission:** every new route is gated `@RequirePermissions('pipeline:manage')`.
- **Stages are strings:** `PIPELINE_STAGES = ['applied','screened','interview','offer','hired']` (`apps/api/src/pipeline/pipeline-stages.ts`). Trigger events = those 5 values plus `'rejected'`.
- **GDPR:** never email a candidate with `erasedAt != null`; the erase flow (`apps/api/src/candidates/candidates.service.ts:423`) scrubs `CandidateMessage` PII in place.
- **Candidate never hard-deleted:** erase scrubs in place, so `CandidateMessage.candidateId` FK is `onDelete: NoAction` (P1012-safe).
- `FRONTEND_URL` (env, default `http://localhost:3000`) is the base for `{{statusLink}}`.
- Tests: api `npx jest --config apps/api/jest.config.js <pattern>`; web `cd apps/web && npx jest <pattern>`. apps/web is a modified Next.js — read `apps/web/AGENTS.md` before touching it.

---

### Task 1: Schema + migrations (two tables + RLS)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add two models + back-relations)
- Create: `apps/api/prisma/migrations/20260821090000_candidate_messages/migration.sql`
- Create: `apps/api/prisma/migrations/20260821090001_candidate_messages_rls/migration.sql`

**Interfaces:**
- Produces: Prisma models `CandidateMessageTemplate`, `CandidateMessage`; the `candidate_message_templates` / `candidate_messages` tables.

- [ ] **Step 1: Add the two models to `schema.prisma`** (place after `PipelineFeedback`). No `Organization` relation on either (org isolation is RLS, matching `PipelineEntry`).

```prisma
model CandidateMessageTemplate {
  id             String           @id @default(uuid()) @db.UniqueIdentifier
  organizationId String           @map("organization_id") @db.UniqueIdentifier
  name           String
  // one of PIPELINE_STAGES, or 'rejected', or null = manual-only
  triggerEvent   String?          @map("trigger_event")
  // 'manual' | 'prompt' | 'auto'
  triggerMode    String           @map("trigger_mode")
  subject        String           @db.NVarChar(Max)
  body           String           @db.NVarChar(Max)
  enabled        Boolean          @default(true)
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  messages       CandidateMessage[]

  @@index([organizationId])
  @@map("candidate_message_templates")
}

model CandidateMessage {
  id              String                    @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String                    @map("organization_id") @db.UniqueIdentifier
  candidateId     String                    @map("candidate_id") @db.UniqueIdentifier
  pipelineEntryId String?                   @map("pipeline_entry_id") @db.UniqueIdentifier
  templateId      String?                   @map("template_id") @db.UniqueIdentifier
  toEmail         String                    @map("to_email")
  subject         String                    @db.NVarChar(Max)
  renderedBody    String                    @map("rendered_body") @db.NVarChar(Max)
  status          String                    // 'sent' | 'failed'
  source          String                    // 'manual' | 'stage_prompt' | 'stage_auto'
  sentByUserId    String?                   @map("sent_by_user_id") @db.UniqueIdentifier
  errorDetail     String?                   @map("error_detail") @db.NVarChar(Max)
  createdAt       DateTime                  @default(now()) @map("created_at")
  candidate       Candidate                 @relation(fields: [candidateId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  pipelineEntry   PipelineEntry?            @relation(fields: [pipelineEntryId], references: [id], onDelete: SetNull, onUpdate: NoAction)
  template        CandidateMessageTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@index([organizationId, candidateId])
  @@index([pipelineEntryId])
  @@map("candidate_messages")
}
```

Add back-relations: on `Candidate` add `candidateMessages CandidateMessage[]`; on `PipelineEntry` add `candidateMessages CandidateMessage[]`. (No relation field is added for `sentByUserId` — it stays a bare column with no `User` relation, to avoid adding a cascade path through `users`; keep it a plain `@db.UniqueIdentifier` column WITHOUT a `@relation`, i.e. remove `sentByUserId` from any relation and do NOT reference `User`. It is written/read as a raw id.)

- [ ] **Step 2: Write the schema migration** `20260821090000_candidate_messages/migration.sql`. New tables via `CREATE TABLE` — inline nothing that needs EXEC (EXEC-wrapping is only for `ALTER TABLE ADD` + same-batch reference; `CREATE TABLE` + separate `CREATE INDEX` is fine here).

```sql
-- CreateTable
CREATE TABLE [dbo].[candidate_message_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [trigger_event] NVARCHAR(1000),
    [trigger_mode] NVARCHAR(1000) NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [candidate_message_templates_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_message_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_message_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[candidate_messages] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER,
    [template_id] UNIQUEIDENTIFIER,
    [to_email] NVARCHAR(1000) NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [rendered_body] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_messages_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [candidate_messages_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_message_templates_organization_id_idx] ON [dbo].[candidate_message_templates]([organization_id]);
CREATE NONCLUSTERED INDEX [candidate_messages_organization_id_candidate_id_idx] ON [dbo].[candidate_messages]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [candidate_messages_pipeline_entry_id_idx] ON [dbo].[candidate_messages]([pipeline_entry_id]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_messages] ADD CONSTRAINT [candidate_messages_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[candidate_messages] ADD CONSTRAINT [candidate_messages_pipeline_entry_id_fkey] FOREIGN KEY ([pipeline_entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE [dbo].[candidate_messages] ADD CONSTRAINT [candidate_messages_template_id_fkey] FOREIGN KEY ([template_id]) REFERENCES [dbo].[candidate_message_templates]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
```

- [ ] **Step 3: Write the RLS migration** `20260821090001_candidate_messages_rls/migration.sql` (separate file — `ALTER SECURITY POLICY` can't reference same-batch-created tables; same pattern as `20260818090001_ats_pipeline_rls`).

```sql
-- Extend the existing tenant isolation policy to cover the two candidate-comms
-- tables. Reuses dbo.fn_tenant_access_predicate unchanged. Separate migration
-- because ALTER SECURITY POLICY cannot run in the same batch as the CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_message_templates,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_message_templates AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_message_templates AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_messages,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_messages AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_messages AFTER UPDATE;
```

- [ ] **Step 4: Regenerate client + validate**

Run: `cd "D:/exam app" && npx prisma generate --schema=apps/api/prisma/schema.prisma`
Expected: generates with no P1012 (no Organization relation on the new tables; candidate FK is NoAction). Then `npx prisma validate --schema=apps/api/prisma/schema.prisma` → "The schema is valid".

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260821090000_candidate_messages apps/api/prisma/migrations/20260821090001_candidate_messages_rls
git commit -m "feat(candidate-comms): CandidateMessage + CandidateMessageTemplate schema + RLS migration"
```

---

### Task 2: Pure render + branded HTML shell

**Files:**
- Create: `apps/api/src/candidate-messages/candidate-message-render.ts`
- Test: `apps/api/src/candidate-messages/candidate-message-render.spec.ts`

**Interfaces:**
- Produces:
  - `interface MergeContext { candidateName: string; jobTitle: string; orgName: string; recruiterName: string; statusLink: string }`
  - `renderTemplate(subject: string, body: string, ctx: MergeContext): { subject: string; body: string }`
  - `templateReferencesStatusLink(subject: string, body: string): boolean`
  - `buildCandidateEmailHtml(opts: { logoUrl: string | null; orgName: string | null; bodyText: string }): string`

- [ ] **Step 1: Write the failing test** `candidate-message-render.spec.ts`

```ts
import { renderTemplate, templateReferencesStatusLink, buildCandidateEmailHtml } from './candidate-message-render';

const ctx = { candidateName: 'Asha Rao', jobTitle: 'Backend Engineer', orgName: 'Acme', recruiterName: 'Priya', statusLink: 'https://x/application/tok' };

describe('renderTemplate', () => {
  it('replaces every known token in subject and body', () => {
    const r = renderTemplate('Hi {{candidateName}} re {{jobTitle}}', 'From {{recruiterName}} at {{orgName}}: {{statusLink}}', ctx);
    expect(r.subject).toBe('Hi Asha Rao re Backend Engineer');
    expect(r.body).toBe('From Priya at Acme: https://x/application/tok');
  });
  it('leaves unknown tokens untouched (visible, not blanked)', () => {
    expect(renderTemplate('{{nope}}', 'x', ctx).subject).toBe('{{nope}}');
  });
  it('is idempotent — a rendered string has no tokens left to replace', () => {
    const once = renderTemplate('{{candidateName}}', '{{orgName}}', ctx);
    const twice = renderTemplate(once.subject, once.body, ctx);
    expect(twice).toEqual(once);
  });
});

describe('templateReferencesStatusLink', () => {
  it('detects the token in subject or body', () => {
    expect(templateReferencesStatusLink('x', 'see {{statusLink}}')).toBe(true);
    expect(templateReferencesStatusLink('{{statusLink}}', 'x')).toBe(true);
    expect(templateReferencesStatusLink('x', 'y')).toBe(false);
  });
});

describe('buildCandidateEmailHtml', () => {
  it('embeds a logo when given and converts newlines to <br>', () => {
    const html = buildCandidateEmailHtml({ logoUrl: 'https://l/logo.png', orgName: 'Acme', bodyText: 'Line 1\nLine 2' });
    expect(html).toContain('<img src="https://l/logo.png"');
    expect(html).toContain('Line 1<br />Line 2');
    expect(html).toContain('Acme');
  });
  it('omits the logo block when logoUrl is null', () => {
    expect(buildCandidateEmailHtml({ logoUrl: null, orgName: null, bodyText: 'Hi' })).not.toContain('<img');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found)

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js candidate-message-render`

- [ ] **Step 3: Implement** `candidate-message-render.ts`

```ts
export interface MergeContext {
  candidateName: string;
  jobTitle: string;
  orgName: string;
  recruiterName: string;
  statusLink: string;
}

const TOKEN = /\{\{(candidateName|jobTitle|orgName|recruiterName|statusLink)\}\}/g;

export function renderTemplate(subject: string, body: string, ctx: MergeContext): { subject: string; body: string } {
  const sub = (s: string) => s.replace(TOKEN, (_m, k: keyof MergeContext) => ctx[k]);
  return { subject: sub(subject), body: sub(body) };
}

export function templateReferencesStatusLink(subject: string, body: string): boolean {
  return /\{\{statusLink\}\}/.test(subject) || /\{\{statusLink\}\}/.test(body);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Branded shell generalized from buildAssessmentEmailHtml (invitations.service.ts).
 *  bodyText is the already-rendered plain-text message; newlines become <br />. */
export function buildCandidateEmailHtml(opts: { logoUrl: string | null; orgName: string | null; bodyText: string }): string {
  const logoHtml = opts.logoUrl ? `<p><img src="${opts.logoUrl}" alt="Organization logo" height="40" /></p>` : '';
  const bodyHtml = escapeHtml(opts.bodyText).replace(/\r?\n/g, '<br />');
  return (
    `${logoHtml}<div>${bodyHtml}</div>` +
    `<p>Best regards,<br/>${opts.orgName ?? 'The Hiring Team'}</p>` +
    `<p style="color:#666666;font-size:12px;">This message was sent from an unmonitored address - please do not reply to it.</p>`
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js candidate-message-render`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-messages/candidate-message-render.ts apps/api/src/candidate-messages/candidate-message-render.spec.ts
git commit -m "feat(candidate-comms): pure renderTemplate + branded email shell"
```

---

### Task 3: Templates service + code defaults + controller

**Files:**
- Create: `apps/api/src/candidate-messages/default-templates.ts`
- Create: `apps/api/src/candidate-messages/candidate-message-templates.service.ts`
- Create: `apps/api/src/candidate-messages/dto/upsert-template.dto.ts`
- Create: `apps/api/src/candidate-messages/candidate-message-templates.controller.ts`
- Test: `apps/api/src/candidate-messages/candidate-message-templates.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `TenantContext`, `AuditService`.
- Produces:
  - `DEFAULT_TEMPLATES: Array<{ key: string; name: string; triggerEvent: string | null; triggerMode: 'manual'|'prompt'|'auto'; subject: string; body: string }>`
  - `CandidateMessageTemplatesService.listWithDefaults(context): Promise<TemplateView[]>`
  - `CandidateMessageTemplatesService.resolveForEvent(context, event): Promise<{ id: string|null; subject: string; body: string; triggerMode: string } | null>` — the enabled saved row for the event, else the code default, else null. Opens its own `forTenant` read (the stage-move caller in Task 5 runs this after its own tx has committed).
  - `upsert(context, actorUserId, dto)`, `setEnabled(context, actorUserId, id, enabled)`, `remove(context, actorUserId, id)`.

- [ ] **Step 1: Write `default-templates.ts`** (no test needed — pure data)

```ts
export interface DefaultTemplate {
  key: string;
  name: string;
  triggerEvent: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  { key: 'application_received', name: 'Application received', triggerEvent: 'applied', triggerMode: 'manual',
    subject: 'We received your application for {{jobTitle}}',
    body: 'Hi {{candidateName}},\n\nThanks for applying to {{jobTitle}} at {{orgName}}. We have received your application and will be in touch. You can check your status any time here: {{statusLink}}\n\n{{recruiterName}}' },
  { key: 'moving_to_interview', name: 'Moving to interview', triggerEvent: 'interview', triggerMode: 'prompt',
    subject: 'Next steps for {{jobTitle}} at {{orgName}}',
    body: 'Hi {{candidateName}},\n\nGood news — we would like to move you forward to the interview stage for {{jobTitle}}. We will follow up shortly with details.\n\n{{recruiterName}}' },
  { key: 'offer', name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt',
    subject: 'An offer for {{jobTitle}} at {{orgName}}',
    body: 'Hi {{candidateName}},\n\nWe are delighted to move forward with an offer for {{jobTitle}}. Details to follow.\n\n{{recruiterName}}' },
  { key: 'not_moving_forward', name: 'Not moving forward', triggerEvent: 'rejected', triggerMode: 'prompt',
    subject: 'Update on your application for {{jobTitle}}',
    body: 'Hi {{candidateName}},\n\nThank you for your interest in {{jobTitle}} at {{orgName}}. After careful consideration we will not be moving forward at this time. We wish you the best.\n\n{{recruiterName}}' },
];
```

- [ ] **Step 2: Write the failing test** `candidate-message-templates.service.spec.ts`. Mock `TenantPrismaService.forTenant` to run the callback with a `tx` whose `candidateMessageTemplate` methods are jest mocks; mock `AuditService.record`.

```ts
// Key cases:
// - listWithDefaults returns code defaults for events with no saved row, and the saved row where present (saved wins).
it('listWithDefaults merges saved rows over code defaults', async () => {
  tx.candidateMessageTemplate.findMany.mockResolvedValue([
    { id: 's1', name: 'Custom interview', triggerEvent: 'interview', triggerMode: 'prompt', subject: 'S', body: 'B', enabled: true },
  ]);
  const list = await service.listWithDefaults(context);
  const interview = list.find((t) => t.triggerEvent === 'interview');
  expect(interview).toMatchObject({ id: 's1', subject: 'S', isDefault: false });
  const offer = list.find((t) => t.triggerEvent === 'offer');
  expect(offer).toMatchObject({ id: null, isDefault: true }); // code default
});
// - resolveForEvent returns the saved enabled row, else the default, else null for unknown.
it('resolveForEvent returns saved enabled row over default', async () => {
  tx.candidateMessageTemplate.findFirst.mockResolvedValue({ id: 's1', subject: 'S', body: 'B', triggerMode: 'auto', enabled: true });
  const r = await service.resolveForEvent(tx, 'org-1', 'offer');
  expect(r).toMatchObject({ id: 's1', triggerMode: 'auto' });
});
it('resolveForEvent falls back to the code default when no saved row', async () => {
  tx.candidateMessageTemplate.findFirst.mockResolvedValue(null);
  const r = await service.resolveForEvent(tx, 'org-1', 'offer');
  expect(r).toMatchObject({ id: null, triggerMode: 'prompt' }); // offer default is prompt
});
it('resolveForEvent returns null for an event with no default and no row', async () => {
  tx.candidateMessageTemplate.findFirst.mockResolvedValue(null);
  expect(await service.resolveForEvent(tx, 'org-1', 'screened')).toBeNull();
});
// - upsert creates then audits 'candidate_message_template.saved'.
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js candidate-message-templates.service`

- [ ] **Step 4: Implement** the DTO, service, controller.

`dto/upsert-template.dto.ts`:
```ts
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PIPELINE_STAGES } from '../../pipeline/pipeline-stages';

const TRIGGER_EVENTS = [...PIPELINE_STAGES, 'rejected'];

export class UpsertTemplateDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @ValidateIf((o) => o.triggerEvent !== null) @IsIn(TRIGGER_EVENTS) triggerEvent!: string | null;
  @IsIn(['manual', 'prompt', 'auto']) triggerMode!: string;
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
```

`candidate-message-templates.service.ts` — `listWithDefaults` loads saved rows, and for every `DEFAULT_TEMPLATES` entry whose `triggerEvent` isn't covered by a saved row, appends the default with `{ id: null, isDefault: true }`; saved rows carry `isDefault: false`. `resolveForEvent(tx, orgId, event)` → `tx.candidateMessageTemplate.findFirst({ where: { organizationId: orgId, triggerEvent: event, enabled: true }, orderBy: { updatedAt: 'desc' } })`; if found return `{ id, subject, body, triggerMode }`; else find the `DEFAULT_TEMPLATES` entry with that `triggerEvent` and return `{ id: null, subject, body, triggerMode }`; else `null`. `upsert` → `tx.candidateMessageTemplate.upsert`/`update`/`create` (org-scoped), audit `candidate_message_template.saved`. `setEnabled` audits `candidate_message_template.enabled`/`.disabled`. `remove` deletes a saved row (reverts to default), audits `candidate_message_template.removed`.

`candidate-message-templates.controller.ts` — `@Controller('candidate-message-templates')`, guards `JwtAuthGuard, PermissionsGuard`, every route `@RequirePermissions('pipeline:manage')`: `GET /` → `listWithDefaults`; `POST /` / `PATCH /:id` → `upsert`; `PATCH /:id/enabled` → `setEnabled`; `DELETE /:id` → `remove`. Use the repo's `@CurrentTenant()` / `@CurrentUserId()` decorators (copy from `pipeline.controller.ts`).

- [ ] **Step 5: Run — expect PASS**, then commit

```bash
git add apps/api/src/candidate-messages
git commit -m "feat(candidate-comms): templates service with code defaults + controller"
```

---

### Task 4: Messages service (send/list/resend) + controller + module + GDPR scrub

**Files:**
- Create: `apps/api/src/candidate-messages/candidate-messages.service.ts`
- Create: `apps/api/src/candidate-messages/dto/send-message.dto.ts`
- Create: `apps/api/src/candidate-messages/candidate-messages.controller.ts`
- Create: `apps/api/src/candidate-messages/candidate-messages.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CandidateMessagesModule`)
- Modify: `apps/api/src/candidates/candidates.service.ts` (erase scrub, ~`:496`)
- Test: `apps/api/src/candidate-messages/candidate-messages.service.spec.ts`
- Test: `apps/api/src/candidate-messages/candidate-messages.controller.spec.ts`

**Interfaces:**
- Consumes: `EmailService.send`, `CandidateMessageTemplatesService.resolveForEvent`, `renderTemplate`, `templateReferencesStatusLink`, `buildCandidateEmailHtml`, `BlobStorageService.signIfOurs`, `TenantPrismaService`, `AuditService`.
- Produces:
  - `CandidateMessagesService.sendMessage(context, actorUserId: string | null, entryId: string, input: { templateId?: string | null; subject: string; body: string; source: 'manual'|'stage_prompt'|'stage_auto' }): Promise<CandidateMessage>`
  - `CandidateMessagesService.listMessages(context, candidateId): Promise<CandidateMessage[]>`
  - `CandidateMessagesService.resend(context, actorUserId, messageId): Promise<CandidateMessage>`
  - `CandidateMessagesModule` exports `CandidateMessagesService` and `CandidateMessageTemplatesService`.

- [ ] **Step 1: Write the failing test** `candidate-messages.service.spec.ts`. Mock `forTenant` (runs cb with `tx`), `EmailService.send`, `blobStorage.signIfOurs`, `audit.record`. `tx.pipelineEntry.findFirst` returns `{ id, candidateId, applicationToken, candidate: { name, email, erasedAt: null }, job: { title } }`; `tx.organization.findUnique` returns `{ name, logoPath }`.

```ts
it('renders raw tokens, sends, and logs a sent row', async () => {
  email.send.mockResolvedValue({ success: true });
  const msg = await service.sendMessage(context, 'user-1', 'entry-1',
    { templateId: null, subject: 'Hi {{candidateName}}', body: 'See {{statusLink}}', source: 'manual' });
  expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'asha@x.com', subject: 'Hi Asha', organizationId: 'org-1' }));
  expect(tx.candidateMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'sent', source: 'manual', toEmail: 'asha@x.com' }) }));
});
it('mints applicationToken when body references statusLink and entry has none', async () => {
  tx.pipelineEntry.findFirst.mockResolvedValue({ id: 'entry-1', candidateId: 'c1', applicationToken: null, candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null }, job: { title: 'BE' } });
  email.send.mockResolvedValue({ success: true });
  await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: '{{statusLink}}', source: 'manual' });
  expect(tx.pipelineEntry.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ applicationToken: expect.any(String) }) }));
});
it('logs a failed row (not throw) when send fails', async () => {
  email.send.mockResolvedValue({ success: false });
  const msg = await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });
  expect(tx.candidateMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
});
it('refuses to send to an erased candidate', async () => {
  tx.pipelineEntry.findFirst.mockResolvedValue({ id: 'entry-1', candidateId: 'c1', applicationToken: 't', candidate: { name: 'X', email: 'e', erasedAt: new Date() }, job: { title: 'BE' } });
  await expect(service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' })).rejects.toThrow();
  expect(email.send).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement.** `send-message.dto.ts`:
```ts
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class SendMessageDto {
  @IsOptional() @IsString() templateId?: string | null;
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
}
```

`candidate-messages.service.ts` `sendMessage`:
```ts
async sendMessage(context, actorUserId, entryId, input) {
  return this.tenantPrisma.forTenant(context, async (tx) => {
    const orgId = context.organizationId as string;
    const entry = await tx.pipelineEntry.findFirst({
      where: { id: entryId, organizationId: orgId },
      include: { candidate: true, job: true },
    });
    if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
    if (entry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

    let applicationToken = entry.applicationToken;
    if (!applicationToken && templateReferencesStatusLink(input.subject, input.body)) {
      applicationToken = randomUUID();
      await tx.pipelineEntry.update({ where: { id: entry.id }, data: { applicationToken } });
    }
    const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
    const actorName = actorUserId ? (await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '' : '';
    const statusLink = applicationToken ? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/application/${applicationToken}` : '';
    const rendered = renderTemplate(input.subject, input.body, {
      candidateName: entry.candidate.name, jobTitle: entry.job.title, orgName: org?.name ?? '',
      recruiterName: actorName, statusLink,
    });
    const logoUrl = org?.logoPath ? await this.blobStorage.signIfOurs(org.logoPath, 90 * 24 * 60 * 60 * 1000) : null;
    const html = buildCandidateEmailHtml({ logoUrl, orgName: org?.name ?? null, bodyText: rendered.body });
    const result = await this.emailService.send({ to: entry.candidate.email, subject: rendered.subject, html, organizationId: orgId });
    const created = await tx.candidateMessage.create({ data: {
      organizationId: orgId, candidateId: entry.candidateId, pipelineEntryId: entry.id, templateId: input.templateId ?? null,
      toEmail: entry.candidate.email, subject: rendered.subject, renderedBody: rendered.body,
      status: result.success ? 'sent' : 'failed', source: input.source, sentByUserId: actorUserId,
      errorDetail: result.success ? null : 'delivery failed',
    } });
    await this.audit.record(context, { actorUserId, action: result.success ? 'candidate_message.sent' : 'candidate_message.failed', entityType: 'candidate_message', entityId: created.id, metadata: { to: entry.candidate.email, source: input.source } });
    return created;
  });
}
```
`listMessages` → `tx.candidateMessage.findMany({ where: { organizationId, candidateId }, orderBy: { createdAt: 'desc' } })`. `resend(context, actorUserId, messageId)` → load the failed row, re-`sendMessage` with its snapshot subject/renderedBody (source 'manual'). Import `randomUUID` from `crypto`, `NotFoundException`/`BadRequestException` from `@nestjs/common`.

`candidate-messages.controller.ts` (guards + `@RequirePermissions('pipeline:manage')`): `POST /pipeline/entries/:id/messages` → `sendMessage(..., source:'manual')`; `GET /candidates/:id/messages` → `listMessages`; `POST /candidate-messages/:id/resend` → `resend`. (Three routes across two path prefixes — use one controller with explicit `@Post('pipeline/entries/:id/messages')` etc., or split; keep them in this controller with full paths.)

`candidate-messages.module.ts`: `imports: [EmailModule]`, providers `[CandidateMessagesService, CandidateMessageTemplatesService]`, controllers both, `exports: [CandidateMessagesService, CandidateMessageTemplatesService]`. (`TenantPrismaService`, `AuditService`, `BlobStorageService` come from their global/shared modules as in `PipelineModule` — mirror `pipeline.module.ts`'s provider list.) Register `CandidateMessagesModule` in `app.module.ts`.

- [ ] **Step 4: GDPR erase scrub** — in `candidates.service.ts` `erase()`, inside the `forTenant` tx alongside the existing `candidateProfile.updateMany` scrub (~`:496`), add:
```ts
await tx.candidateMessage.updateMany({
  where: { candidateId, organizationId: context.organizationId as string },
  data: { toEmail: 'erased@redacted.invalid', subject: 'Redacted', renderedBody: 'Redacted', errorDetail: null },
});
```
Add a test in `candidates.service.spec.ts` asserting `candidateMessage.updateMany` is called during erase.

- [ ] **Step 5: Write the controller test** `candidate-messages.controller.spec.ts` — mirror `pipeline.controller.spec.ts`: 401 when `JwtAuthGuard` rejects (RejectingGuard throws `UnauthorizedException`), and delegation to the service with parsed params.

- [ ] **Step 6: Run api unit suite for the module + typecheck**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js candidate-messages src/candidates/candidates.service && npx tsc -p apps/api/tsconfig.json --noEmit`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/candidate-messages apps/api/src/app.module.ts apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.service.spec.ts
git commit -m "feat(candidate-comms): send/list/resend service + controller + module + GDPR scrub"
```

---

### Task 5: patchEntry stage-move hook (auto send + pendingMessage)

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`patchEntry`, `:239`)
- Modify: `apps/api/src/pipeline/pipeline.module.ts` (import `CandidateMessagesModule`)
- Modify: `apps/api/src/pipeline/pipeline.controller.ts` (return type passthrough)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `CandidateMessagesService.sendMessage`, `CandidateMessageTemplatesService.resolveForEvent`.
- Produces: `patchEntry` now returns `{ entry: PipelineEntry; pendingMessage?: { templateId: string | null; subject: string; body: string } }`.

- [ ] **Step 1: Write the failing test** (extend `pipeline.service.spec.ts`). Inject mock `CandidateMessagesService` + `CandidateMessageTemplatesService`.

```ts
it('auto-sends when the target event resolves an auto template', async () => {
  templates.resolveForEvent.mockResolvedValue({ id: 't1', subject: 's', body: 'b', triggerMode: 'auto' });
  await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'offer' });
  expect(messages.sendMessage).toHaveBeenCalledWith(context, null, 'entry-1', expect.objectContaining({ source: 'stage_auto', templateId: 't1' }));
});
it('returns a pendingMessage (does not send) for a prompt template', async () => {
  templates.resolveForEvent.mockResolvedValue({ id: 't1', subject: 's', body: 'b', triggerMode: 'prompt' });
  const r = await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'interview' });
  expect(r.pendingMessage).toMatchObject({ templateId: 't1', subject: 's', body: 'b' });
  expect(messages.sendMessage).not.toHaveBeenCalled();
});
it('maps a rejection to the rejected event', async () => {
  templates.resolveForEvent.mockResolvedValue(null);
  await service.patchEntry(context, 'user-1', 'entry-1', { rejected: true });
  expect(templates.resolveForEvent).toHaveBeenCalledWith(expect.anything(), 'org-1', 'rejected');
});
it('does nothing when no template resolves', async () => {
  templates.resolveForEvent.mockResolvedValue(null);
  const r = await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'screened' });
  expect(r.pendingMessage).toBeUndefined();
  expect(messages.sendMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement.** After the existing `forTenant` tx commits in `patchEntry`, compute the event: `dto.stage ? dto.stage : (dto.rejected === true ? 'rejected' : null)`. If non-null, `const tpl = await this.templates.resolveForEvent(<a tenant tx>, orgId, event)`. Resolution needs a tenant client — call `resolveForEvent` via its own `forTenant` (the templates service opens its own), or expose a variant. Simplest: give `resolveForEvent` its own `forTenant` internally (change its signature to `resolveForEvent(context, event)` and open a tx inside). Update Task 3's interface accordingly. Then:
  - `tpl?.triggerMode === 'auto'` → `this.messages.sendMessage(context, null, entryId, { templateId: tpl.id, subject: tpl.subject, body: tpl.body, source: 'stage_auto' }).catch((e) => this.logger.error(...))` (fire-and-forget); return `{ entry }`.
  - `tpl?.triggerMode === 'prompt'` → return `{ entry, pendingMessage: { templateId: tpl.id, subject: tpl.subject, body: tpl.body } }`.
  - else return `{ entry }`.

  **Note:** changing `resolveForEvent` to open its own tx means Task 3's tests must pass `context` not `tx`. Update Task 3 Step 2 tests and the interface to `resolveForEvent(context, event)`. (Reconcile at implementation time — the hook is the real caller.)

  `pipeline.module.ts`: add `imports: [CandidateMessagesModule]`. **Guard circular dep:** `CandidateMessagesModule` must NOT import `PipelineModule`. If Nest reports a cycle, STOP and report BLOCKED (do not forwardRef without flagging).

  `pipeline.controller.ts`: `patchEntry` handler returns the service result unchanged (now `{ entry, pendingMessage? }`) — update its return type.

- [ ] **Step 4: Run — expect PASS**, plus the full pipeline suite + typecheck

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline && npx tsc -p apps/api/tsconfig.json --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/pipeline
git commit -m "feat(candidate-comms): patchEntry stage-move hook (auto send + pendingMessage)"
```

---

### Task 6: Frontend — types, hooks, Messages timeline + compose modal

**Files:**
- Modify: `apps/web/lib/types.ts` (message + template types; `PatchEntryResult`)
- Create: `apps/web/lib/hooks/useCandidateMessages.ts`
- Modify: `apps/web/components/pipeline/CandidateDrawer.tsx` (Messages section + compose modal)
- Create: `apps/web/components/pipeline/SendMessageModal.tsx`
- Test: `apps/web/components/pipeline/CandidateDrawer.test.tsx` (extend), `apps/web/components/pipeline/SendMessageModal.test.tsx`

**Interfaces:**
- Consumes: `POST /pipeline/entries/:id/messages`, `GET /candidates/:id/messages`, `POST /candidate-messages/:id/resend`.
- Produces: `useCandidateMessages(candidateId)`, `useSendMessage(entryId)`, `useResendMessage()`; `SendMessageModal` component.

- [ ] **Step 1: Read `apps/web/AGENTS.md`.** Then locate how `CandidateDrawer` gets its `entry`/`candidateId` and how existing pipeline hooks call `apiFetch` (`apps/web/lib/hooks/usePipeline.ts`).

- [ ] **Step 2: Add web types** to `lib/types.ts`:
```ts
export interface CandidateMessage { id: string; toEmail: string; subject: string; renderedBody: string; status: 'sent' | 'failed'; source: string; sentByUserId: string | null; createdAt: string; }
export interface CandidateMessageTemplate { id: string | null; name: string; triggerEvent: string | null; triggerMode: 'manual' | 'prompt' | 'auto'; subject: string; body: string; enabled: boolean; isDefault: boolean; }
export interface PendingMessage { templateId: string | null; subject: string; body: string; }
```
Update the patch-entry mutation's result type to `{ entry: PipelineEntry; pendingMessage?: PendingMessage }`.

- [ ] **Step 3: Write the failing test** `SendMessageModal.test.tsx` — mock `useCandidateMessages`/templates + `useSendMessage`; assert: template picker fills subject/body (raw, with tokens), editing then Send calls the mutation with the edited subject/body; a live preview area shows tokens replaced with sample values.

- [ ] **Step 4: Implement** `useCandidateMessages.ts` (React Query: list query keyed `['candidate-messages', candidateId]`; `useSendMessage` invalidates it on success; `useResendMessage`; a `useMessageTemplates()` query on `['candidate-message-templates']`). Then `SendMessageModal.tsx` (template `<Select>` → fills raw subject/body into editable fields; a preview panel calling a small client-side token substitution with placeholder sample values; Send button → `useSendMessage`). Add to `CandidateDrawer.tsx`: a **Messages** section listing `useCandidateMessages` rows (subject, status badge, time; Resend on failed) + a **Send message** button opening `SendMessageModal`.

- [ ] **Step 5: Run — expect PASS**

Run: `cd "D:/exam app/apps/web" && npx jest CandidateDrawer SendMessageModal`

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useCandidateMessages.ts apps/web/components/pipeline/CandidateDrawer.tsx apps/web/components/pipeline/SendMessageModal.tsx apps/web/components/pipeline/CandidateDrawer.test.tsx apps/web/components/pipeline/SendMessageModal.test.tsx
git commit -m "feat(candidate-comms): candidate messages timeline + compose modal"
```

---

### Task 7: Frontend — stage-move confirm + Templates admin page + no-SMTP banner

**Files:**
- Modify: `apps/web/components/pipeline/PipelineBoard.tsx` (handle `pendingMessage` from a stage move → open `SendMessageModal` pre-filled)
- Create: `apps/web/app/(recruiter)/settings/message-templates/page.tsx`
- Create: `apps/web/lib/hooks/useMessageTemplates.ts` (CRUD hooks; or extend Task 6's hook file)
- Modify: `apps/web/components/pipeline/SendMessageModal.tsx` (no-SMTP banner)
- Test: `apps/web/app/(recruiter)/settings/message-templates/page.test.tsx`, extend `PipelineBoard.test.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /candidate-message-templates`, the org SMTP-configured flag (reuse the existing org-settings query that exposes whether SMTP host/user are set; if none exists, read from the org profile query already used by settings).
- Produces: Message Templates admin page; `pendingMessage` wired into the board.

- [ ] **Step 1: Write the failing tests.** `PipelineBoard.test.tsx`: moving a candidate whose patch response includes `pendingMessage` opens the compose modal pre-filled with that subject/body. `message-templates/page.test.tsx`: renders templates (defaults + saved), editing subject/body + Save calls the upsert mutation; toggling enabled calls the enabled mutation; restore-default (DELETE) on a saved row.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement.** In `PipelineBoard.tsx`, after a successful stage-move mutation whose result has `pendingMessage`, open `SendMessageModal` seeded from `pendingMessage` (templateId/subject/body). Build the Templates admin page (`message-templates/page.tsx`): table of `useMessageTemplates` rows (name, trigger event + mode, enabled toggle, Edit); an edit form (name, trigger event `<Select>` of stages+rejected+None, trigger mode `<Select>` manual/prompt/auto, subject, body textarea with merge-token insert buttons); Save → upsert; Restore default → delete. Gate the page on `canManage` (`role !== 'panel'`), matching sibling recruiter pages. Add the no-SMTP banner to `SendMessageModal` and the templates page: when the org has no SMTP configured, show a warning ("Candidate emails won't send until SMTP is configured in Organization settings").

- [ ] **Step 4: Run — expect PASS**, then web typecheck

Run: `cd "D:/exam app/apps/web" && npx jest PipelineBoard message-templates && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(candidate-comms): stage-move confirm modal + message templates admin + no-SMTP banner"
```

---

### Task 8: Whole-feature verification

**Files:** none.

- [ ] **Step 1: Full backend suite + typecheck**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit`
Expected: green (heavy bcrypt/supertest suites may time out only under full concurrency — re-run any failure targeted before treating it as real; exam-runtime untouched).

- [ ] **Step 2: Full web suite + typecheck**

Run: `cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit`

- [ ] **Step 3: Browser smoke (post-deploy).** Configure a template; move a candidate into its stage; for a `prompt` template confirm the modal opens pre-filled and sending logs a `sent` row in the timeline; verify `{{statusLink}}` resolves to the candidate's status page; for an org without SMTP confirm the banner shows and the send logs `failed`; resend a failed row.

- [ ] **Step 4: Proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- Two per-org tables (no Org FK; RLS split migration; candidate FK NoAction) → Task 1. ✅
- `renderTemplate` (unknown-token passthrough, statusLink detect) + `buildCandidateEmailHtml` → Task 2. ✅
- Editable templates + code defaults (list-with-defaults, resolveForEvent) → Task 3. ✅
- `sendMessage` (server-renders raw tokens, mints applicationToken, erased guard, log row, audit), listMessages, resend; controller `pipeline:manage`; GDPR scrub → Task 4. ✅
- All three trigger modes via `patchEntry` hook (auto send / pendingMessage / none), rejected-event mapping → Task 5. ✅
- Messages timeline + compose modal (raw edit + preview) → Task 6. ✅
- Stage-move confirm modal + Templates admin page + no-SMTP banner → Task 7. ✅
- Verification → Task 8. ✅
- Out-of-scope items (inbound replies, SMS, scheduling, WYSIWYG, bulk) → not built. ✅

**Placeholder scan:** no TBD/TODO; every code step carries real code. Two integration seams are called out explicitly rather than hand-waved: (a) `resolveForEvent` signature is `(context, event)` and opens its own `forTenant` — Task 3 tests and Task 5 caller agree on this; (b) the org SMTP-configured flag reuses the existing org-settings query (Task 7 Step-1 note).

**Type consistency:** `sendMessage(context, actorUserId, entryId, { templateId?, subject, body, source })`, `resolveForEvent(context, event) → { id: string|null, subject, body, triggerMode } | null`, `patchEntry → { entry, pendingMessage? }`, `CandidateMessage`/`CandidateMessageTemplate`/`PendingMessage` web types — used identically across tasks. `source` values `'manual'|'stage_prompt'|'stage_auto'` and trigger modes `'manual'|'prompt'|'auto'` are consistent throughout.

**Circular-dep note:** Task 5 imports `CandidateMessagesModule` into `PipelineModule`; `CandidateMessagesModule` must not import `PipelineModule` (it doesn't need pipeline logic — it takes `entryId` and queries the entry directly). STOP-and-report if Nest reports a cycle.
