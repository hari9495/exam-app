# Notification Email Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver existing in-app staff notifications by email too, controlled by a per-user, per-type preference (email default ON).

**Architecture:** Additive channel over the single `NotificationsService.notify()` choke point. After the notification transaction commits, resolve each recipient's per-type email preference and send via the existing `EmailService` (best-effort, never blocks or fails the bell). Preferences are stored sparsely (only opt-OUT rows) in a new tenant-scoped table.

**Tech Stack:** NestJS + Prisma + SQL Server (apps/api); React 18 + React Query + ui-v2 (apps/web); nodemailer via `EmailService`.

**Spec:** `docs/superpowers/specs/2026-09-04-notification-email-channel-design.md`

## Global Constraints

- **Multi-tenant:** every DB access goes through `TenantPrismaService.forTenant(context, tx => …)`. The new table carries `organization_id` and gets a companion `_rls` migration mirroring `user_notifications`.
- **Migrations:** additive only (no destructive DDL, no seed, no backfill). Prisma applies in filename order; use a `2026090512xxxx_…` timestamp AFTER the last existing migration (`20260904090006_…`). The `_rls` migration MUST replicate the exact T-SQL of `apps/api/prisma/migrations/20260826100004_user_notifications_rls/migration.sql`, changing only the table name.
- **Default-ON sparse storage:** no preference row ⇒ email ON. Store a row ONLY when a user opts a type OUT (`emailEnabled=false`); setting it back to ON deletes the row. Effective value = `row?.emailEnabled ?? true`.
- **Email is best-effort:** `EmailService.send` never throws and refuses undeliverable mail. Email sending must run AFTER the tenant transaction commits and must never throw out of `notify()` or affect the created bell rows. Preserve the existing actor-drop (a user is never notified of their own action).
- **Trust boundary:** `actorName` and `contextText` are user-controlled — HTML-escape them in the renderer.
- **Never run `npm install`/`ci`/`update` in a git worktree** (junction disk-fill hazard). Use `npx prisma generate` for client regen; work in the main checkout.
- **Web:** React Query (`useQuery`/`useMutation`) + `apiFetch(path, opts, accessToken)` from `apps/web/lib/api-client`; reuse existing v2 primitives; visual/format only, no behavior change to existing surfaces.
- The web catalog comes from the API response — do NOT duplicate the type catalog in the web app.

---

## File Structure

- Create `apps/api/src/notifications/notification-types.ts` — shared type catalog (single source of truth).
- Create `apps/api/src/notifications/notification-email-render.ts` — pure email renderer.
- Create `apps/api/src/notifications/dto/update-notification-preference.dto.ts` — PATCH body DTO.
- Modify `apps/api/prisma/schema.prisma` — add `UserNotificationPreference` model + `User` relation.
- Create two migrations: `…_user_notification_preferences` (DDL) + `…_user_notification_preferences_rls` (RLS).
- Modify `apps/api/src/notifications/notifications.service.ts` — preference get/set + email delivery in `notify()`.
- Modify `apps/api/src/notifications/notifications.controller.ts` — `GET`/`PATCH /notifications/preferences`.
- Modify `apps/api/src/notifications/notifications.module.ts` — import `EmailModule`.
- Create `apps/web/lib/hooks/useNotificationPreferences.ts` — query + mutation hooks.
- Create `apps/web/components/NotificationEmailPreferences.tsx` — grouped per-type toggles.
- Modify `apps/web/app/profile/page.tsx` — render the preferences section.

---

### Task 1: Data model + migration + RLS

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_user_notification_preferences/migration.sql`
- Create: `apps/api/prisma/migrations/<ts>_user_notification_preferences_rls/migration.sql`

**Interfaces:**
- Produces: Prisma model `UserNotificationPreference` with fields `id, organizationId, userId, type, emailEnabled, createdAt, updatedAt`; unique `(userId, type)`. Prisma accessor `tx.userNotificationPreference`.

- [ ] **Step 1: Add the model to `schema.prisma`** (place near `UserNotification`):

```prisma
model UserNotificationPreference {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  userId         String   @map("user_id") @db.UniqueIdentifier
  type           String
  emailEnabled   Boolean  @map("email_enabled")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([userId, type])
  @@index([organizationId])
  @@map("user_notification_preferences")
}
```

- [ ] **Step 2: Write the DDL migration** `…_user_notification_preferences/migration.sql`:

```sql
CREATE TABLE [dbo].[user_notification_preferences] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_notification_preferences_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [user_id] UNIQUEIDENTIFIER NOT NULL,
  [type] NVARCHAR(1000) NOT NULL,
  [email_enabled] BIT NOT NULL,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [user_notification_preferences_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL
);
CREATE UNIQUE INDEX [user_notification_preferences_user_id_type_key] ON [dbo].[user_notification_preferences]([user_id], [type]);
CREATE INDEX [user_notification_preferences_organization_id_idx] ON [dbo].[user_notification_preferences]([organization_id]);
```
(If `prisma migrate dev --create-only` generates equivalent DDL, use its output verbatim instead of hand-writing.)

- [ ] **Step 3: Write the RLS migration** `…_user_notification_preferences_rls/migration.sql` — open `apps/api/prisma/migrations/20260826100004_user_notifications_rls/migration.sql` and replicate its statements EXACTLY, changing the table name to `user_notification_preferences`. Do not invent the T-SQL.

- [ ] **Step 4: Apply + regenerate.** Run `npx prisma migrate dev` (dev DB) — or `migrate deploy` if the shadow DB is unavailable — then `npx prisma generate`. In the main checkout only.

Run: `cd apps/api && npx prisma migrate dev --name user_notification_preferences`
Expected: both migrations apply; client regenerates with `userNotificationPreference`.

- [ ] **Step 5: Commit** `git add apps/api/prisma && git commit -m "feat(notifications): user_notification_preferences table + rls"`

---

### Task 2: Notification type catalog

**Files:**
- Create: `apps/api/src/notifications/notification-types.ts`
- Test: `apps/api/src/notifications/notification-types.spec.ts`

**Interfaces:**
- Produces: `NotificationTypeDef { type; group; label }`, `NOTIFICATION_TYPES: NotificationTypeDef[]`, `NOTIFICATION_TYPE_BY_KEY: Map<string, NotificationTypeDef>`.

- [ ] **Step 1: Write the failing test** `notification-types.spec.ts`:

```ts
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_BY_KEY } from './notification-types';

describe('notification catalog', () => {
  it('covers every type emitted by notify() call sites', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    for (const k of ['mention', 'assigned', 'approval.requested', 'approval.approved', 'approval.rejected', 'approval.step_skipped']) {
      expect(keys).toContain(k);
    }
  });
  it('has no duplicate types and only valid groups', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of NOTIFICATION_TYPES) expect(['mentions', 'assignments', 'approvals']).toContain(t.group);
  });
  it('indexes by key', () => {
    expect(NOTIFICATION_TYPE_BY_KEY.get('mention')?.group).toBe('mentions');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** (module not found).

- [ ] **Step 3: Implement `notification-types.ts`:**

```ts
export type NotificationGroup = 'mentions' | 'assignments' | 'approvals';
export interface NotificationTypeDef { type: string; group: NotificationGroup; label: string; }

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  { type: 'mention', group: 'mentions', label: 'You are @mentioned in feedback' },
  { type: 'assigned', group: 'assignments', label: 'A candidate is assigned to you' },
  { type: 'approval.requested', group: 'approvals', label: 'A request needs your approval' },
  { type: 'approval.approved', group: 'approvals', label: 'Your submission was approved' },
  { type: 'approval.rejected', group: 'approvals', label: 'Your submission was rejected' },
  { type: 'approval.step_skipped', group: 'approvals', label: 'An approval step was skipped' },
];

export const NOTIFICATION_TYPE_BY_KEY = new Map(NOTIFICATION_TYPES.map((t) => [t.type, t]));
```

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `feat(notifications): notification type catalog`

---

### Task 3: Preference resolution + mutation (service)

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Test: `apps/api/src/notifications/notifications.service.spec.ts` (extend)

**Interfaces:**
- Consumes: T1 model, T2 catalog.
- Produces on `NotificationsService`:
  - `getPreferences(context, userId): Promise<{ type: string; group: string; label: string; emailEnabled: boolean }[]>` — full catalog with effective values.
  - `setPreference(context, userId, type, emailEnabled): Promise<{ success: true }>` — rejects a type not in the catalog; upsert row when `false`, delete row when `true`.
  - `resolveEmailEnabledByType(tx, userId): Promise<Map<string, boolean>>` — reads the user's opt-out rows (used by Task 6). Missing entry ⇒ ON.

- [ ] **Step 1: Write failing tests** (add to the spec): default ON when no rows; a `false` row ⇒ OFF; `setPreference(false)` upserts, `setPreference(true)` deletes; `getPreferences` returns all catalog entries; `setPreference` with an unknown type throws `BadRequestException`.

```ts
it('getPreferences defaults every type to ON when no rows', async () => {
  tx.userNotificationPreference.findMany.mockResolvedValue([]);
  const prefs = await service.getPreferences(ctx, 'u1');
  expect(prefs).toHaveLength(NOTIFICATION_TYPES.length);
  expect(prefs.every((p) => p.emailEnabled)).toBe(true);
});
it('getPreferences reflects an opt-out row', async () => {
  tx.userNotificationPreference.findMany.mockResolvedValue([{ type: 'assigned', emailEnabled: false }]);
  const prefs = await service.getPreferences(ctx, 'u1');
  expect(prefs.find((p) => p.type === 'assigned')?.emailEnabled).toBe(false);
});
it('setPreference(false) upserts, (true) deletes', async () => {
  await service.setPreference(ctx, 'u1', 'assigned', false);
  expect(tx.userNotificationPreference.upsert).toHaveBeenCalled();
  await service.setPreference(ctx, 'u1', 'assigned', true);
  expect(tx.userNotificationPreference.deleteMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', type: 'assigned' }) }),
  );
});
it('setPreference rejects an unknown type', async () => {
  await expect(service.setPreference(ctx, 'u1', 'bogus', false)).rejects.toBeInstanceOf(BadRequestException);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** the three methods on `NotificationsService` (all via `tenantPrisma.forTenant`):

```ts
async getPreferences(context: TenantContext, userId: string) {
  const rows = await this.tenantPrisma.forTenant(context, (tx) =>
    tx.userNotificationPreference.findMany({ where: { userId }, select: { type: true, emailEnabled: true } }),
  );
  const byType = new Map(rows.map((r) => [r.type, r.emailEnabled]));
  return NOTIFICATION_TYPES.map((t) => ({ type: t.type, group: t.group, label: t.label, emailEnabled: byType.get(t.type) ?? true }));
}

async setPreference(context: TenantContext, userId: string, type: string, emailEnabled: boolean) {
  if (!NOTIFICATION_TYPE_BY_KEY.has(type)) throw new BadRequestException('Unknown notification type');
  await this.tenantPrisma.forTenant(context, async (tx) => {
    if (emailEnabled) {
      await tx.userNotificationPreference.deleteMany({ where: { userId, type } });
    } else {
      await tx.userNotificationPreference.upsert({
        where: { userId_type: { userId, type } },
        create: { organizationId: context.organizationId as string, userId, type, emailEnabled: false },
        update: { emailEnabled: false },
      });
    }
  });
  return { success: true as const };
}

// tx-scoped: returns ONLY the user's opt-out rows; caller treats a missing type as ON.
async resolveEmailEnabledByType(tx: any, userId: string): Promise<Map<string, boolean>> {
  const rows = await tx.userNotificationPreference.findMany({ where: { userId }, select: { type: true, emailEnabled: true } });
  return new Map(rows.map((r: { type: string; emailEnabled: boolean }) => [r.type, r.emailEnabled]));
}
```
Add imports: `BadRequestException` from `@nestjs/common`; `NOTIFICATION_TYPES`, `NOTIFICATION_TYPE_BY_KEY` from `./notification-types`.

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `feat(notifications): per-type email preference get/set`

---

### Task 4: Preferences API (controller + DTO)

**Files:**
- Create: `apps/api/src/notifications/dto/update-notification-preference.dto.ts`
- Modify: `apps/api/src/notifications/notifications.controller.ts`
- Test: `apps/api/src/notifications/notifications.controller.spec.ts` (create if absent)

**Interfaces:**
- Consumes: T3.
- Produces: `GET /notifications/preferences`, `PATCH /notifications/preferences`.

- [ ] **Step 1: Write the DTO:**

```ts
import { IsBoolean, IsString } from 'class-validator';
export class UpdateNotificationPreferenceDto {
  @IsString() type!: string;
  @IsBoolean() emailEnabled!: boolean;
}
```

- [ ] **Step 2: Write the failing controller test:** GET delegates to `service.getPreferences(tenant, userId)`; PATCH delegates to `service.setPreference(tenant, userId, dto.type, dto.emailEnabled)`.

- [ ] **Step 3: Add routes to `NotificationsController`:**

```ts
@Get('preferences')
getPreferences(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
  return this.service.getPreferences(tenant, userId);
}

@Patch('preferences')
updatePreference(
  @CurrentTenant() tenant: TenantContext,
  @CurrentUserId() userId: string,
  @Body() dto: UpdateNotificationPreferenceDto,
) {
  return this.service.setPreference(tenant, userId, dto.type, dto.emailEnabled);
}
```
Add imports: `Body`, `Patch` from `@nestjs/common`; the DTO. NOTE: `preferences` is a static segment — declare these BEFORE the existing `@Post(':id/read')` is irrelevant (different verb), but ensure no `@Get(':id')` shadows `@Get('preferences')` (there is none today).

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `feat(notifications): preferences GET/PATCH endpoints`

---

### Task 5: Email renderer (pure)

**Files:**
- Create: `apps/api/src/notifications/notification-email-render.ts`
- Test: `apps/api/src/notifications/notification-email-render.spec.ts`

**Interfaces:**
- Consumes: T2 (`NotificationTypeDef`).
- Produces: `renderNotificationEmail(typeDef, input): { subject: string; html: string }` where `input = { actorName: string | null; contextText: string | null; linkPath: string; appBaseUrl: string }`.

- [ ] **Step 1: Write failing tests:** subject contains the type label; html contains the absolute link (`appBaseUrl + linkPath`) and a "Manage your notification emails" footer; HTML-escapes a hostile `actorName` (e.g. `'<script>'` → not present raw); an unknown/undefined typeDef falls back to a generic subject without throwing.

```ts
it('renders an absolute link and escapes the actor name', () => {
  const def = { type: 'mention', group: 'mentions', label: 'You are @mentioned in feedback' } as const;
  const out = renderNotificationEmail(def, { actorName: '<script>x</script>', contextText: 'Ravi Kumar', linkPath: '/v2/candidates/c1', appBaseUrl: 'https://app.example.com' });
  expect(out.html).toContain('https://app.example.com/v2/candidates/c1');
  expect(out.html).not.toContain('<script>x</script>');
  expect(out.html).toContain('Manage your notification emails');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — a small `escapeHtml` helper + a minimal HTML shell. Locate the base-URL construction used by `apps/api/src/candidate-emails/candidate-email-render.ts` and reuse the SAME env var; pass it in as `appBaseUrl` (do not read env inside this pure function). The manage-prefs footer links to `${appBaseUrl}/profile`. Subject example: `${actorName ?? 'Someone'} — ${typeDef.label}`. Fallback when `typeDef` is falsy: subject `You have a new notification`, generic body.

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `feat(notifications): notification email renderer`

---

### Task 6: Wire email delivery into `notify()`

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts` (import `EmailModule`)
- Test: `apps/api/src/notifications/notifications.service.spec.ts` (extend)

**Interfaces:**
- Consumes: T1, T2, T3 (`resolveEmailEnabledByType`), T5 renderer, `EmailService.send`.

- [ ] **Step 1: Write failing tests:**
  - email is sent only to recipients whose effective pref for `type` is ON and who have a non-empty email;
  - a recipient with a `false` pref row gets a bell row but NO email;
  - `EmailService.send` returning `{success:false}` OR rejecting does NOT throw out of `notify()` and does NOT prevent the bell rows;
  - actor is still excluded from recipients (existing behavior).

```ts
it('emails opted-in recipients after creating bell rows, best-effort', async () => {
  tx.user.findMany.mockResolvedValue([{ id: 'u2', email: 'u2@x.test', name: 'U Two' }]);
  tx.userNotificationPreference.findMany.mockResolvedValue([]); // all ON
  email.send.mockResolvedValue({ success: true });
  await service.notify(ctx, 'u1', ['u2'], 'mention', target);
  expect(tx.userNotification.create).toHaveBeenCalled();
  expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'u2@x.test', organizationId: ctx.organizationId }));
});
it('does not throw when send fails', async () => {
  tx.user.findMany.mockResolvedValue([{ id: 'u2', email: 'u2@x.test', name: 'U Two' }]);
  tx.userNotificationPreference.findMany.mockResolvedValue([]);
  email.send.mockRejectedValue(new Error('smtp down'));
  await expect(service.notify(ctx, 'u1', ['u2'], 'mention', target)).resolves.toBeUndefined();
});
it('skips email for an opted-out recipient', async () => {
  tx.user.findMany.mockResolvedValue([{ id: 'u2', email: 'u2@x.test', name: 'U Two' }]);
  tx.userNotificationPreference.findMany.mockResolvedValue([{ type: 'mention', emailEnabled: false }]);
  await service.notify(ctx, 'u1', ['u2'], 'mention', target);
  expect(email.send).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.**
  - Constructor: inject `EmailService`. Update `notifications.module.ts` to `imports: [EmailModule]` and providers unchanged; ensure `EmailModule` exports `EmailService`.
  - In `notify()`: extend the recipient select to `{ id, email, name }`; within the tenant tx also resolve the actor's `name` and, for each valid recipient, that recipient's opt-out map via `resolveEmailEnabledByType(tx, recipient.id)`. Collect an `outbox: { to, prefMap }[]` list plus the shared `actorName`.
  - AFTER `forTenant` resolves, build and send emails: for each outbox entry with a non-empty `to` whose `prefMap.get(type) ?? true` is true, `renderNotificationEmail(NOTIFICATION_TYPE_BY_KEY.get(type), { actorName, contextText: target.contextText, linkPath: target.linkPath, appBaseUrl })` then `emailService.send({ to, subject, html, organizationId })`. Wrap the whole batch in `Promise.allSettled` and a `try/catch` that only logs — never rethrows.
  - `appBaseUrl`: reuse the same source as the candidate-email renderer (Task 5).
  - Recipient counts here are small (a handful of mentions/approvers, usually one assignee), so a per-recipient `resolveEmailEnabledByType` call is fine — do NOT add a batched query or a new helper; keep Task 3's interface as the single source.

- [ ] **Step 4: Run tests, verify pass.** Also run the existing notifications + approvals + pipeline specs to confirm no regression to the bell/actor-drop behavior.
- [ ] **Step 5: Commit** `feat(notifications): send email on notify(), gated by per-type preference`

---

### Task 7: Web preferences UI

**Files:**
- Create: `apps/web/lib/hooks/useNotificationPreferences.ts`
- Create: `apps/web/components/NotificationEmailPreferences.tsx`
- Modify: `apps/web/app/profile/page.tsx`
- Test: `apps/web/components/NotificationEmailPreferences.test.tsx`

**Interfaces:**
- Consumes: T4 API. Response item shape `{ type: string; group: 'mentions'|'assignments'|'approvals'; label: string; emailEnabled: boolean }`.

- [ ] **Step 1: Write the hooks** (mirror `useOrgPipelineSettings`/`useUpdateOrgPipelineSettings` in `apps/web/lib/hooks/usePipelines.ts`):

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export interface NotificationPreference { type: string; group: 'mentions' | 'assignments' | 'approvals'; label: string; emailEnabled: boolean; }

export function useNotificationPreferences() {
  const { accessToken } = useAuth();
  return useQuery<NotificationPreference[]>({
    queryKey: ['notification-preferences'],
    queryFn: () => apiFetch('/notifications/preferences', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateNotificationPreference() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: string; emailEnabled: boolean }) =>
      apiFetch('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });
}
```

- [ ] **Step 2: Write the failing component test:** renders a toggle per returned preference grouped under Mentions / Assignments / Approvals headings; toggling a row calls the mutation with `{ type, emailEnabled: <new> }`. Mock the hooks.

- [ ] **Step 3: Implement `NotificationEmailPreferences.tsx`** — a card titled "Notification emails"; group the fetched prefs by `group` (labels: Mentions / Assignments / Approvals); render each as a labeled toggle bound to `emailEnabled`, calling `useUpdateNotificationPreference().mutate({ type, emailEnabled: !current })`. Reuse the existing v2 toggle/switch primitive (the one used by the pipelines auto-archive toggle). Loading/empty states minimal.

- [ ] **Step 4: Render it in `apps/web/app/profile/page.tsx`** — inside the existing `<main className="mx-auto max-w-2xl p-8">`, add `<NotificationEmailPreferences />` below `<ProfileForm />`.

- [ ] **Step 5: Run tests + `npx tsc -p apps/web/tsconfig.json --noEmit`** (ignore pre-existing stale `.next/types/validator.ts` errors — filter with `grep -v "\.next/types"`).
- [ ] **Step 6: Commit** `feat(web): notification email preferences on profile page`

---

## Self-review notes

- **Spec coverage:** data model (T1), type catalog (T2), preference resolution + default-ON sparse storage (T3), API (T4), renderer with escaping + absolute links + footer (T5), delivery in `notify()` best-effort after commit (T6), UI on profile (T7). All spec sections mapped.
- **Type consistency:** `getPreferences` return shape (`{type,group,label,emailEnabled}`) matches the web `NotificationPreference` interface and the GET response the spec promises. `resolveEmailEnabledByType` / the batched recipient pref query both key by `type` with missing ⇒ ON.
- **No new dependency**, no seed, no destructive DDL. Folds into the deferred-deploy chain.
- **Deploy:** additive migration + RLS only; requires deliverable SMTP (already true in prod); with no SMTP, sends are refused and the bell is unaffected.
