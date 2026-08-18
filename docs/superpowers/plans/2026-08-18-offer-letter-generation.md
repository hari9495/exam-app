# Offer-Letter Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the pipeline `offer` stage, let a recruiter generate a PDF offer letter from an editable template + terms, email it (branded HTML + PDF attachment) to the candidate, and track accept/decline via a public tokenized page.

**Architecture:** Two new per-org tables (`Offer`, `OfferTemplate`). A pure PDF builder (`pdfkit`) + offer-template renderer. `OffersService` orchestrates create → preview → send (three-phase: read/mint tx → build PDF + blob + email OUTSIDE tx → status/log tx) → withdraw, plus a public accept/decline path reusing the public-applications token pattern. Frontend: an Offers section + create modal on the candidate drawer, a public offer page, and a template editor.

**Tech Stack:** NestJS 11 (apps/api), Next.js 16 (apps/web), Prisma + Azure SQL, `pdfkit` (already installed), Jest, React Query.

## Global Constraints

- **No new dependency.** `pdfkit@^0.15.0` is installed. Model the PDF builder on `apps/api/src/reports/exporters/pdf-exporter.ts` (`new PDFDocument` → collect `doc.on('data')` chunks → resolve `Buffer.concat(chunks)` on `'end'`). Stream a PDF from a controller with `@Res({ passthrough: true }) res: Response` → `res.set({ 'Content-Type': 'application/pdf' })` → `return new StreamableFile(buffer)` (pattern: `reports.controller.ts:58-76`).
- **SMTP send OUTSIDE the tenant tx** (feature-1 lesson): in `sendOffer`, do reads/mint in a short `forTenant` tx, then `buildOfferPdf` + `blob.upload` + `EmailService.send` OUTSIDE any tx, then the status/log write in a second short tx. Never put a network call inside `forTenant`.
- **Reuse:** `EmailService.send` (`apps/api/src/email/email.service.ts:71`, extended here with attachments); `buildCandidateEmailHtml` (`apps/api/src/candidate-emails/candidate-email-render.ts`) for the email shell; `BlobStorageService.upload(path, buffer, contentType)` + `signIfOurs(path, ttlMs)` (`packages/shared`); `AuditService.record`; `TenantPrismaService.forTenant`.
- **Public path pattern** (`apps/api/src/public-applications/`): controller `@Controller('public')` + `@UseGuards(PublicApplicationsThrottlerGuard)` + `@Throttle(STRICT_WALK_IN_THROTTLE)`, NO `JwtAuthGuard`. Service resolves the token via `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, ...)` and throws a **generic** `NotFoundException` (never an oracle).
- **Org-scoped, no Organization FK:** `Offer`/`OfferTemplate` carry a plain `organizationId` column (RLS), matching `CandidateEmail`. RLS predicates for the 2 new tables go in a **separate** migration (ALTER SECURITY POLICY can't share a batch with CREATE TABLE). `CREATE TABLE` migrations need no `EXEC()` wrapping.
- **Permission:** recruiter routes `@RequirePermissions('pipeline:manage')`; public routes unauthenticated + throttled.
- **GDPR:** never send an offer to a candidate with `erasedAt != null`; erase deletes offer PDFs + redacts `Offer` rows.
- `FRONTEND_URL` (default `http://localhost:3000`) → the public offer link `${FRONTEND_URL}/offer/<offerToken>`.
- Tests: api `npx jest --config apps/api/jest.config.js <pattern>`; web `cd apps/web && npx jest <pattern>` (read `apps/web/AGENTS.md` first for the modified Next.js).

---

### Task 1: Schema + migrations (Offer + OfferTemplate + RLS)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260822090000_offers/migration.sql`
- Create: `apps/api/prisma/migrations/20260822090001_offers_rls/migration.sql`

**Interfaces:**
- Produces: models `Offer`, `OfferTemplate`; tables `offers`, `offer_templates`.

- [ ] **Step 1: Add models to `schema.prisma`** (after `CandidateEmail`). No `Organization`/`User` relation (plain columns; P1012-safe). `pipelineEntry` FK cascades.

```prisma
model Offer {
  id              String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String        @map("organization_id") @db.UniqueIdentifier
  pipelineEntryId String        @map("pipeline_entry_id") @db.UniqueIdentifier
  candidateId     String        @map("candidate_id") @db.UniqueIdentifier
  compensation    String        @db.NVarChar(Max)
  startDate       DateTime      @map("start_date")
  expiresAt       DateTime      @map("expires_at")
  status          String        @default("draft")
  offerToken      String?       @unique @map("offer_token")
  pdfPath         String?       @map("pdf_path")
  letterSubject   String        @map("letter_subject") @db.NVarChar(Max)
  letterBody      String        @map("letter_body") @db.NVarChar(Max)
  sentByUserId    String?       @map("sent_by_user_id") @db.UniqueIdentifier
  sentAt          DateTime?     @map("sent_at")
  respondedAt     DateTime?     @map("responded_at")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  pipelineEntry   PipelineEntry @relation(fields: [pipelineEntryId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([organizationId, pipelineEntryId])
  @@index([organizationId, candidateId])
  @@map("offers")
}

model OfferTemplate {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  subject        String   @db.NVarChar(Max)
  body           String   @db.NVarChar(Max)
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([organizationId])
  @@map("offer_templates")
}
```
Add back-relation on `PipelineEntry`: `offers Offer[]`.

- [ ] **Step 2: Schema migration** `20260822090000_offers/migration.sql`:
```sql
-- CreateTable
CREATE TABLE [dbo].[offers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [compensation] NVARCHAR(MAX) NOT NULL,
    [start_date] DATETIME2 NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [offers_status_df] DEFAULT 'draft',
    [offer_token] NVARCHAR(1000),
    [pdf_path] NVARCHAR(1000),
    [letter_subject] NVARCHAR(MAX) NOT NULL,
    [letter_body] NVARCHAR(MAX) NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [sent_at] DATETIME2,
    [responded_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [offers_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [offers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [offers_offer_token_key] UNIQUE NONCLUSTERED ([offer_token])
);

-- CreateTable
CREATE TABLE [dbo].[offer_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [offer_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [offers_organization_id_pipeline_entry_id_idx] ON [dbo].[offers]([organization_id], [pipeline_entry_id]);
CREATE NONCLUSTERED INDEX [offers_organization_id_candidate_id_idx] ON [dbo].[offers]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [offer_templates_organization_id_idx] ON [dbo].[offer_templates]([organization_id]);

-- AddForeignKey
ALTER TABLE [dbo].[offers] ADD CONSTRAINT [offers_pipeline_entry_id_fkey] FOREIGN KEY ([pipeline_entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
```
Note the `created_at` default is `GETUTCDATE()` (repo standard; NOT `CURRENT_TIMESTAMP`).

- [ ] **Step 3: RLS migration** `20260822090001_offers_rls/migration.sql`:
```sql
-- Extend the tenant isolation policy to the two offer tables (same pattern as
-- 20260821090001_candidate_emails_rls). Separate migration: ALTER SECURITY POLICY
-- cannot run in the same batch as CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offers,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offers AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offers AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offer_templates,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offer_templates AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offer_templates AFTER UPDATE;
```

- [ ] **Step 4: Regenerate + validate.** `cd "D:/exam app" && npx prisma generate --schema=apps/api/prisma/schema.prisma` (no P1012 — no Org/User relations), then `npx prisma validate --schema=apps/api/prisma/schema.prisma` → valid. Do NOT run `migrate dev`/`deploy`.

- [ ] **Step 5: Commit** `git add apps/api/prisma && git commit -m "feat(offers): Offer + OfferTemplate schema + RLS migration"`

---

### Task 2: EmailService attachments support

**Files:**
- Modify: `apps/api/src/email/email.service.ts`
- Test: `apps/api/src/email/email.service.spec.ts` (extend, or create if absent)

**Interfaces:**
- Produces: `SendEmailInput` gains `attachments?: { filename: string; content: Buffer }[]`, spread into `sendMail`.

- [ ] **Step 1: Write the failing test** — a `send` with `attachments` passes them through to the transporter's `sendMail`. Mock the transporter (the spec likely already stubs `resolveTransporter`/`getOrBuildTransporter`; follow the existing test setup — read the file first). Assert `sendMail` is called with `attachments: [{ filename: 'offer.pdf', content: <Buffer> }]`.

- [ ] **Step 2: Run — expect FAIL.** `cd "D:/exam app" && npx jest --config apps/api/jest.config.js email.service`

- [ ] **Step 3: Implement.** Extend the interface:
```ts
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  organizationId?: string;
  attachments?: { filename: string; content: Buffer }[];
}
```
In the `sendMail` call (currently `{ from, to, subject, html }`) add `...(input.attachments ? { attachments: input.attachments } : {})`. Nothing else changes (deliverability guard, transporter resolution untouched).

- [ ] **Step 4: Run — expect PASS**, then commit
```bash
git add apps/api/src/email/email.service.ts apps/api/src/email/email.service.spec.ts
git commit -m "feat(offers): EmailService.send accepts attachments"
```

---

### Task 3: Pure offer PDF builder + template renderer + default

**Files:**
- Create: `apps/api/src/offers/offer-pdf.ts`
- Create: `apps/api/src/offers/offer-render.ts`
- Create: `apps/api/src/offers/default-offer-template.ts`
- Test: `apps/api/src/offers/offer-pdf.spec.ts`, `apps/api/src/offers/offer-render.spec.ts`

**Interfaces:**
- Produces:
  - `buildOfferPdf(data: OfferPdfData): Promise<Buffer>` where `OfferPdfData = { orgName: string; letterBody: string; candidateName: string; jobTitle: string; compensation: string; startDate: Date; expiresAt: Date }`
  - `OfferMergeContext = { candidateName; jobTitle; orgName; recruiterName; compensation; startDate: string; offerExpiry: string; offerLink: string }`
  - `renderOfferTemplate(subject: string, body: string, ctx: OfferMergeContext): { subject: string; body: string }`
  - `DEFAULT_OFFER_TEMPLATE: { subject: string; body: string }`

- [ ] **Step 1: Write failing tests.** `offer-render.spec.ts`:
```ts
import { renderOfferTemplate } from './offer-render';
const ctx = { candidateName: 'Asha Rao', jobTitle: 'Backend Engineer', orgName: 'Acme', recruiterName: 'Priya', compensation: '$120,000 / year', startDate: 'January 6, 2026', offerExpiry: 'December 31, 2025', offerLink: 'https://x/offer/tok' };
it('replaces every offer token', () => {
  const r = renderOfferTemplate('Offer for {{jobTitle}}', 'Dear {{candidateName}}, comp {{compensation}}, start {{startDate}}, respond {{offerLink}} by {{offerExpiry}} — {{recruiterName}} at {{orgName}}', ctx);
  expect(r.subject).toBe('Offer for Backend Engineer');
  expect(r.body).toBe('Dear Asha Rao, comp $120,000 / year, start January 6, 2026, respond https://x/offer/tok by December 31, 2025 — Priya at Acme');
});
it('leaves unknown tokens untouched', () => { expect(renderOfferTemplate('{{nope}}', 'x', ctx).subject).toBe('{{nope}}'); });
```
`offer-pdf.spec.ts`:
```ts
import { buildOfferPdf } from './offer-pdf';
it('produces a non-empty PDF buffer starting with the PDF magic bytes', async () => {
  const buf = await buildOfferPdf({ orgName: 'Acme', letterBody: 'We are pleased to offer you the role.', candidateName: 'Asha Rao', jobTitle: 'Backend Engineer', compensation: '$120,000 / year', startDate: new Date('2026-01-06'), expiresAt: new Date('2025-12-31') });
  expect(buf.length).toBeGreaterThan(500);
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-'); // pdfkit output is a real PDF
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
`offer-render.ts` — token regex over the 8 names, unknown passthrough (mirror `candidate-email-render.ts`'s `renderTemplate`). `DEFAULT_OFFER_TEMPLATE` in `default-offer-template.ts`:
```ts
export const DEFAULT_OFFER_TEMPLATE = {
  subject: 'Your offer from {{orgName}} for {{jobTitle}}',
  body: 'Dear {{candidateName}},\n\nWe are delighted to offer you the position of {{jobTitle}} at {{orgName}}.\n\nCompensation: {{compensation}}\nProposed start date: {{startDate}}\n\nPlease review the attached letter and let us know your decision by {{offerExpiry}}: {{offerLink}}\n\nWarm regards,\n{{recruiterName}}',
};
```
`offer-pdf.ts` — model on `exportResultsToPdf`:
```ts
import PDFDocument from 'pdfkit';
export interface OfferPdfData { orgName: string; letterBody: string; candidateName: string; jobTitle: string; compensation: string; startDate: Date; expiresAt: Date; }
export function buildOfferPdf(d: OfferPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text(d.orgName, { align: 'left' });
    doc.moveDown().fontSize(14).text('Offer of Employment', { align: 'left' });
    doc.moveDown().fontSize(11).text(d.letterBody, { align: 'left' });
    doc.moveDown();
    doc.fontSize(11)
      .text(`Position: ${d.jobTitle}`)
      .text(`Compensation: ${d.compensation}`)
      .text(`Proposed start date: ${d.startDate.toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`)
      .text(`This offer expires: ${d.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`);
    doc.moveDown(2).text(`Sincerely,`).text(d.orgName);
    doc.end();
  });
}
```
(Note: `letterBody` is the already-rendered plain text — the PDF prints it verbatim; no HTML in the PDF path.)

- [ ] **Step 4: Run — expect PASS**, then commit
```bash
git add apps/api/src/offers/offer-pdf.ts apps/api/src/offers/offer-render.ts apps/api/src/offers/default-offer-template.ts apps/api/src/offers/offer-pdf.spec.ts apps/api/src/offers/offer-render.spec.ts
git commit -m "feat(offers): pure PDF builder + offer template renderer + default"
```

---

### Task 4: OfferTemplatesService + OffersService.create/preview/list + recruiter controller + module

**Files:**
- Create: `apps/api/src/offers/offer-templates.service.ts`, `apps/api/src/offers/offers.service.ts`, `apps/api/src/offers/offers.controller.ts`, `apps/api/src/offers/offers.module.ts`, `apps/api/src/offers/dto/create-offer.dto.ts`, `apps/api/src/offers/dto/upsert-offer-template.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `OffersModule`)
- Test: `apps/api/src/offers/offer-templates.service.spec.ts`, `apps/api/src/offers/offers.service.spec.ts`, `apps/api/src/offers/offers.controller.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `AuditService`, `BlobStorageService`, `buildOfferPdf`, `renderOfferTemplate`, `DEFAULT_OFFER_TEMPLATE`.
- Produces:
  - `OfferTemplatesService.getWithDefault(context): Promise<{ id: string|null; subject; body }>`, `upsert(context, actorUserId, { subject, body })`.
  - `OffersService.createOffer(context, actorUserId, entryId, dto): Promise<Offer>`, `previewPdf(context, offerId): Promise<Buffer>`, `listForEntry(context, entryId)`, `listForCandidate(context, candidateId)`.
  - `OffersModule` (exports `OffersService`).

- [ ] **Step 1: Write failing tests** (service). `getWithDefault` returns the code default when no row, the saved row when present. `createOffer` persists a `draft` row with terms + rendered subject/body from the template (mock `forTenant`/tx). `previewPdf` loads the draft (org-scoped) and returns a Buffer from `buildOfferPdf`. Controller spec mirrors `pipeline.controller.spec.ts` (401 when guard rejects).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
DTOs: `create-offer.dto.ts` (`compensation: string`, `startDate: ISO string @IsDateString`, `expiresAt: ISO string @IsDateString`, optional `subject?`, `body?`), `upsert-offer-template.dto.ts` (`subject`, `body`).
`OfferTemplatesService.getWithDefault` → org's row via `forTenant`, else `{ id: null, ...DEFAULT_OFFER_TEMPLATE }`. `upsert` → org-scoped upsert, audit `offer_template.saved`.
`OffersService.createOffer` → in `forTenant`: verify entry org-scoped (`pipelineEntry.findFirst({ where: { id: entryId, organizationId } })`, NotFound else); resolve the letter subject/body: `dto.subject/body` if provided, else the org's `OfferTemplate` (getWithDefault); create `offers` row `{ status:'draft', compensation, startDate:new Date(dto.startDate), expiresAt:new Date(dto.expiresAt), letterSubject, letterBody, candidateId: entry.candidateId }`; audit `offer.created`. Return it.
`previewPdf` → load the offer (org-scoped) + entry.candidate.name + job.title + org.name; `renderOfferTemplate(letterSubject, letterBody, ctx)` (offerLink empty for preview) then `buildOfferPdf({...})`; return the Buffer.
Recruiter controller (`@Controller()`, guards + `@RequirePermissions('pipeline:manage')`): `POST /pipeline/entries/:id/offers` → createOffer; `GET /pipeline/entries/:id/offers` → listForEntry; `GET /candidates/:id/offers` → listForCandidate; `GET /offers/:id/pdf` → `previewPdf` streamed via `StreamableFile` (`@Res({passthrough:true})`, `Content-Type: application/pdf`); `GET /offer-template` → getWithDefault; `PUT /offer-template` → upsert.
`offers.module.ts`: `imports: [EmailModule, StorageModule]`, providers `[OffersService, OfferTemplatesService]`, controllers, `exports: [OffersService]`. Mirror `candidate-emails.module.ts`'s provider list for `TenantPrismaService`/`AuditService`. Register in `app.module.ts`.

- [ ] **Step 4: Run — expect PASS**, then `npx tsc -p apps/api/tsconfig.json --noEmit`, then commit
```bash
git add apps/api/src/offers apps/api/src/app.module.ts
git commit -m "feat(offers): templates + create/preview/list service + recruiter controller + module"
```

---

### Task 5: OffersService.sendOffer + withdraw + endpoints + GDPR erase scrub

**Files:**
- Modify: `apps/api/src/offers/offers.service.ts`, `apps/api/src/offers/offers.controller.ts`
- Modify: `apps/api/src/candidates/candidates.service.ts` (erase scrub), `apps/api/src/candidates/candidates.service.spec.ts`
- Test: `apps/api/src/offers/offers.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `EmailService.send` (with attachments), `BlobStorageService.upload`, `buildOfferPdf`, `renderOfferTemplate`, `buildCandidateEmailHtml`.
- Produces: `OffersService.sendOffer(context, actorUserId, offerId): Promise<Offer>`, `withdraw(context, actorUserId, offerId): Promise<Offer>`.

- [ ] **Step 1: Write failing tests.** `sendOffer`: three-phase — (1) short tx loads offer+entry+candidate (guard erased → BadRequest; guard `status==='draft'`), mints `offerToken` (`randomUUID()`); (2) OUTSIDE tx: `buildOfferPdf`, `blob.upload(...)` (assert `emailService.send` and `blob.upload` are NOT called inside a `forTenant` callback — use `invocationCallOrder` to assert send happens between the two `forTenant` calls); `emailService.send` called with `attachments` + the offerLink in the HTML; (3) short tx sets `status:'sent'`, `pdfPath`, `sentAt`, audit `offer.sent`. Erased candidate → no send. `withdraw`: `sent → withdrawn`, audit `offer.withdrawn`. Erase test: `candidateEmail`/`offer` scrub + blob delete for offer PDFs.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `sendOffer`** (mirror `CandidateEmailsService.sendMessage`'s 3-phase structure):
```ts
async sendOffer(context, actorUserId, offerId) {
  const prep = await this.tenantPrisma.forTenant(context, async (tx) => {
    const offer = await tx.offer.findFirst({ where: { id: offerId, organizationId: orgId }, include: { pipelineEntry: { include: { candidate: true, job: true } } } });
    if (!offer) throw new NotFoundException(...);
    if (offer.status !== 'draft') throw new BadRequestException('Offer already sent');
    if (offer.pipelineEntry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');
    const offerToken = randomUUID();
    await tx.offer.update({ where: { id: offerId }, data: { offerToken } });
    const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
    const actorName = actorUserId ? (await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '' : '';
    return { offer, candidate: offer.pipelineEntry.candidate, job: offer.pipelineEntry.job, org, actorName, offerToken };
  });
  // OUTSIDE tx
  const offerLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/offer/${prep.offerToken}`;
  const rendered = renderOfferTemplate(prep.offer.letterSubject, prep.offer.letterBody, { candidateName: prep.candidate.name, jobTitle: prep.job.title, orgName: prep.org?.name ?? '', recruiterName: prep.actorName, compensation: prep.offer.compensation, startDate: prep.offer.startDate.toLocaleDateString('en-US', { dateStyle: 'long' }), offerExpiry: prep.offer.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' }), offerLink });
  const pdf = await buildOfferPdf({ orgName: prep.org?.name ?? '', letterBody: rendered.body, candidateName: prep.candidate.name, jobTitle: prep.job.title, compensation: prep.offer.compensation, startDate: prep.offer.startDate, expiresAt: prep.offer.expiresAt });
  const pdfPath = await this.blobStorage.upload(`offers/${orgId}/${prep.offerToken}.pdf`, pdf, 'application/pdf');
  const logoUrl = prep.org?.logoPath ? await this.blobStorage.signIfOurs(prep.org.logoPath, 90*24*60*60*1000) : null;
  const html = buildCandidateEmailHtml({ logoUrl, orgName: prep.org?.name ?? null, bodyText: `${rendered.body}\n\nRespond to your offer: ${offerLink}` });
  const result = await this.emailService.send({ to: prep.candidate.email, subject: rendered.subject, html, organizationId: orgId, attachments: [{ filename: 'offer-letter.pdf', content: pdf }] });
  // final tx
  return this.tenantPrisma.forTenant(context, async (tx) => {
    const updated = await tx.offer.update({ where: { id: offerId }, data: { status: 'sent', pdfPath, sentAt: new Date(), sentByUserId: actorUserId } });
    await this.audit.record(context, { actorUserId, action: result.success ? 'offer.sent' : 'offer.send_failed', entityType: 'offer', entityId: offerId, metadata: { to: prep.candidate.email } });
    return updated;
  });
}
```
(If `result.success` is false, still persist `status:'sent'` with `pdfPath`? Prefer: on failure leave `status:'draft'` and audit `offer.send_failed`, so the recruiter can retry — decide and test it. Simplest per spec error-handling: on `!result.success`, do NOT flip to `sent`; audit `offer.send_failed`; return the draft. Implement that.)
`withdraw` → org-scoped, `status` must be `sent`, set `withdrawn`, audit.
Controller: `POST /offers/:id/send` → sendOffer; `POST /offers/:id/withdraw` → withdraw.
GDPR erase (`candidates.service.ts` erase(), in the tx): read the candidate's offer `pdfPath`s BEFORE nulling; `tx.offer.updateMany({ where: { candidateId, organizationId }, data: { compensation: 'Redacted', letterBody: 'Redacted', letterSubject: 'Redacted', pdfPath: null } })`; after the tx, delete those blob paths (mirror how the existing erase deletes evidence/resume blobs — read that code). Add a test asserting the offer scrub + blob delete.

- [ ] **Step 4: Run — expect PASS**, whole api suite for touched areas + tsc, then commit
```bash
git add apps/api/src/offers apps/api/src/candidates
git commit -m "feat(offers): sendOffer (PDF+email, outside tx) + withdraw + GDPR scrub"
```

---

### Task 6: Public accept/decline flow

**Files:**
- Create: `apps/api/src/offers/public-offers.controller.ts`
- Modify: `apps/api/src/offers/offers.service.ts` (public methods), `apps/api/src/offers/offers.module.ts` (register public controller)
- Modify: `apps/api/src/public-applications/public-applications.throttler.guard.ts` (add the offer token param to the tracker) — OR reuse as-is; confirm the tracker keys sensibly.
- Test: `apps/api/src/offers/public-offers.controller.spec.ts`, `offers.service.spec.ts` (extend)

**Interfaces:**
- Produces: `OffersService.getPublicOffer(token)`, `respondPublic(token, action: 'accept'|'decline')`. Public routes `GET /public/offers/:token`, `POST /public/offers/:token/respond`.

- [ ] **Step 1: Write failing tests.** `getPublicOffer` → resolve by `offerToken` (LOOKUP_ORG + super-admin bypass); returns terms + a signed pdf URL + status; unknown token → generic NotFound. `respondPublic('accept')` → offer `status==='sent'` and `expiresAt >= now` → set `accepted` + `respondedAt`, audit `offer.accepted` (actor null), and email the `sentByUserId` recruiter OUTSIDE the tx; expired (`expiresAt < now`) → `ConflictException`/generic; already responded (`status !== 'sent'`) → generic conflict; `decline` symmetric.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** `resolveOfferByToken(token)` mirrors `PublicApplicationsService.resolveJob` (`forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, tx => tx.offer.findUnique({ where: { offerToken: token }, ... }))`, generic NotFound). `getPublicOffer` returns `{ jobTitle, orgName, compensation, startDate, expiresAt, status, pdfUrl: signIfOurs(pdfPath) }`. `respondPublic`: resolve; guard `status==='sent'` (else generic 409 "This offer is no longer available"); guard `expiresAt >= new Date()` (else 409 "This offer has expired"); in a short `forTenant` (using the resolved org, super-admin) set `status: action==='accept'?'accepted':'declined'`, `respondedAt: new Date()`; audit (actor null); THEN outside the tx, load the recruiter (`sentByUserId`) email and `emailService.send` a plain notification ("Candidate <name> has <accepted|declined> the offer for <jobTitle>"), `organizationId` = the offer's org. Public controller: `@Controller('public')` + `@UseGuards(PublicApplicationsThrottlerGuard)` + `@Throttle(STRICT_WALK_IN_THROTTLE)`, NO JwtAuthGuard: `GET offers/:token` and `POST offers/:token/respond` (`@Body() { action }` validated to `'accept'|'decline'`). Register the public controller in `OffersModule`. If the throttler guard's `getTracker` doesn't key off the offer token, add the param name (one line) so offer responses get a token-scoped budget.

- [ ] **Step 4: Run — expect PASS** + tsc, then commit
```bash
git add apps/api/src/offers apps/api/src/public-applications
git commit -m "feat(offers): public accept/decline + recruiter notification"
```

---

### Task 7: Frontend — offers on the candidate drawer (list + create modal + withdraw)

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useOffers.ts`
- Create: `apps/web/components/pipeline/CreateOfferModal.tsx`
- Modify: `apps/web/components/pipeline/CandidateDrawer.tsx`
- Test: `apps/web/components/pipeline/CreateOfferModal.test.tsx`, extend `CandidateDrawer.test.tsx`

**Interfaces:**
- Consumes: `POST /pipeline/entries/:id/offers`, `GET /candidates/:id/offers`, `GET /offers/:id/pdf`, `POST /offers/:id/send`, `POST /offers/:id/withdraw`, `GET/PUT /offer-template`.
- Produces: `Offer` web type; `useCandidateOffers(candidateId)`, `useCreateOffer(entryId, candidateId)`, `useSendOffer(candidateId)`, `useWithdrawOffer(candidateId)`, `useOfferTemplate()`.

- [ ] **Step 1: Read `apps/web/AGENTS.md`.** Locate the CandidateDrawer + how feature-1's `useCandidateMessages` hooks call `apiFetch` (mirror for offers).

- [ ] **Step 2: Add web types** — `Offer` (`id, status, compensation, startDate, expiresAt, sentAt, respondedAt, pdfPath` etc.), `OfferTemplate`.

- [ ] **Step 3: Write failing tests** — `CreateOfferModal.test.tsx`: fills compensation/startDate/expiry (template body pre-filled from `useOfferTemplate`), Preview opens the `/offers/:id/pdf` (or a create-then-preview) flow, Send calls create+send. Extend `CandidateDrawer.test.tsx`: Offers section lists offers with status badge; a `sent` offer shows Withdraw calling `useWithdrawOffer`.

- [ ] **Step 4: Implement** hooks (React Query, keys `['candidate-offers', candidateId]` + `['offer-template']`, invalidation on mutations, `apiFetch`+`accessToken` like `useCandidateMessages`), `CreateOfferModal` (terms fields + body textarea from template + Preview button that creates the draft then opens `GET /offers/:id/pdf` in a new tab / fetches the blob, + Send), and the `CandidateDrawer` **Offers** section (list + status badges + Create + Withdraw). Reuse the no-SMTP banner from feature 1. Then `cd apps/web && npx jest CreateOfferModal CandidateDrawer && npx tsc --noEmit`.

- [ ] **Step 5: Commit** `git add apps/web && git commit -m "feat(offers): candidate-drawer offers list + create/preview/send modal"`

---

### Task 8: Frontend — public offer page + offer-template editor

**Files:**
- Create: `apps/web/app/(candidate)/offer/[token]/page.tsx`, `.test.tsx`
- Create/Modify: an offer-template editor — add to `apps/web/app/(recruiter)/message-templates/page.tsx` (a second tab/section) OR a new `apps/web/app/(recruiter)/offer-template/page.tsx`
- Modify: `apps/web/lib/hooks/useOffers.ts` (public fetch + respond; template upsert)

**Interfaces:**
- Consumes: `GET /public/offers/:token`, `POST /public/offers/:token/respond`, `PUT /offer-template`.

- [ ] **Step 1: Write failing tests** — `offer/[token]/page.test.tsx`: renders terms + Download PDF + Accept/Decline; clicking Accept POSTs `{action:'accept'}` and swaps to a confirmation; an `expired`/`withdrawn`/already-`accepted` status renders a clear closed-state message (no buttons). Template editor test: edits subject/body + Save calls `PUT /offer-template`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Clone `apps/web/app/(candidate)/apply/[applyToken]/page.tsx`'s fetch-then-POST shape (`'use client'`, `useParams`, `fetch(${API_BASE}/public/offers/${token})` on mount, reuse `(candidate)/components` `TerminalCard`/`CandidateButton`): render terms + a **Download PDF** link (the `pdfUrl` from the response) + Accept/Decline; on submit `POST .../respond`; handle `status !== 'sent'` and `expiresAt < now` as closed states. Offer-template editor: subject + body textarea with offer-token insert buttons, Save → `PUT /offer-template`; gate `canManage`. Then `cd apps/web && npx jest "offer/\[token\]" offer-template && npx tsc --noEmit`.

- [ ] **Step 4: Commit** `git add apps/web && git commit -m "feat(offers): public offer accept/decline page + template editor"`

---

### Task 9: Whole-feature verification

**Files:** none.

- [ ] **Step 1: Full backend suite + typecheck.** `cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit` (heavy bcrypt/supertest suites may time out only under full concurrency — re-run any failure targeted; exam-runtime untouched).
- [ ] **Step 2: Full web suite + typecheck.** `cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit`
- [ ] **Step 3: Browser smoke (post-deploy).** Create + preview + send an offer for a test candidate (org with SMTP); open the public `/offer/<token>` link; download the PDF; Accept; confirm status flips, the recruiter is emailed, audit rows exist; withdraw a separate offer and confirm the public page blocks it.
- [ ] **Step 4: Proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- `Offer` + `OfferTemplate` tables (no Org FK, entry Cascade, GETUTCDATE, RLS split) → Task 1. ✅
- `EmailService` attachments → Task 2. ✅
- PDF builder (pdfkit) + offer renderer + default → Task 3. ✅
- Templates + create/preview/list + recruiter controller (StreamableFile PDF) + module → Task 4. ✅
- `sendOffer` three-phase (send OUTSIDE tx, PDF→blob, email w/ attachment, status/log/audit) + withdraw + GDPR scrub → Task 5. ✅
- Public getPublicOffer + respondPublic (accept/decline, expiry/responded guards, recruiter-notify) + throttled public controller → Task 6. ✅
- Candidate-drawer offers list + create/preview/send/withdraw → Task 7. ✅
- Public offer page + template editor → Task 8. ✅
- Verification → Task 9. ✅
- Out-of-scope (e-sign, revisions, structured comp, approval, reminders, auto-advance) → not built. ✅

**Placeholder scan:** no TBD/TODO; each code step carries real code. Two decisions made explicit rather than left open: (a) on `!result.success` in `sendOffer`, the offer stays `draft` and audits `offer.send_failed` (Task 5 Step 3); (b) `createOffer` has no hard stage gate (spec).

**Type consistency:** `buildOfferPdf(OfferPdfData)`, `renderOfferTemplate(subject, body, OfferMergeContext)`, `OffersService.sendOffer/createOffer/previewPdf/withdraw/getPublicOffer/respondPublic`, `Offer` status values (`draft|sent|accepted|declined|expired|withdrawn`), `offerToken` (its own token) — used consistently across tasks. `EmailService.send` attachments shape `{ filename, content: Buffer }` matches Task 2 and Task 5.

**SQL Server safety:** both migrations are `CREATE TABLE` (no `ALTER ADD` + same-batch reference) so no `EXEC()` wrapping; `created_at` uses `GETUTCDATE()`; RLS split into its own migration; the only FK (`offers.pipeline_entry_id → pipeline_entries`, Cascade) introduces no multiple-cascade path (candidate→entry→offer is a single chain; offer has no direct candidate FK).
