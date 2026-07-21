# Org Admin Console Motion & Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the org-admin console up to the same motion/visual standard as the recruiter console — `CardGrid` on its 3 list-shaped surfaces (Staff Users, Audit Log, Integrations' webhook deliveries), Framer Motion entrance polish on its settings/form pages, and sidebar nav hover transitions — without adding a dashboard, charts, or any backend change.

**Architecture:** Reuses the existing `CardGrid` component (`components/ui/CardGrid.tsx`) as-is for the three list conversions — no changes to `CardGrid` itself. For pages that stay form-shaped (Branding, SSO, Integrations' 4 settings cards, Data Rights), each existing `Card` instance is individually wrapped in a local `motion.div` fade-up entrance, mirroring the pattern already used for the recruiter dashboard's widget cards — `components/ui/Card.tsx` itself is untouched since it's also used by candidate-facing pages (out of scope).

**Tech Stack:** Next.js/React (apps/web), the existing `components/ui/CardGrid` and `framer-motion` (already a dependency), Jest + Testing Library.

## Global Constraints

- No backend changes, no new dependency, no new query params.
- No dashboard/landing page, no Recharts charts — confirmed out of scope for org-admin.
- No sort toolbar on the new card grids in this pass (matches how the recruiter console shipped sort as a separate follow-up after its own card-grid conversion).
- `components/ui/Card.tsx` is not modified — it's shared with candidate-facing pages, which are out of scope. Motion wrapping happens locally in each org-admin page via a `motion.div` around the existing `<Card>` usage.
- Existing page tests are expected to need no changes — verify this holds at each task; only edit a test file if a real assertion actually breaks.

---

### Task 1: Sidebar nav motion polish

**Files:**
- Modify: `apps/web/app/(org-admin)/layout.tsx`

**Interfaces:** none (self-contained styling change).

- [ ] **Step 1: Add a color transition to nav item, profile, and logout links**

In `apps/web/app/(org-admin)/layout.tsx`, the nav item `<Link>` inside `NAV_ITEMS.map(...)` currently has:

```tsx
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
```

Add `transition-colors duration-150` to the base class string:

```tsx
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
```

The profile `<Link>` currently has:

```tsx
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-recruiter-bg-subtle"
```

Change to:

```tsx
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-recruiter-bg-subtle"
```

The logout `<button>` currently has:

```tsx
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
```

Change to:

```tsx
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary transition-colors duration-150 hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
```

- [ ] **Step 2: Run the existing layout test and typecheck**

Run (from `apps/web`): `npx jest org-admin/layout.test`
Expected: PASS, unmodified — pure CSS class additions, no behavior change.

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(org-admin)/layout.tsx"
git commit -m "style: add hover/active transition polish to org-admin sidebar nav"
```

---

### Task 2: Staff Users — card grid

**Files:**
- Modify: `apps/web/app/(org-admin)/users/page.tsx`

**Interfaces:**
- Consumes: `CardGrid` (`components/ui`, already shipped).

- [ ] **Step 1: Replace Table with CardGrid**

In `apps/web/app/(org-admin)/users/page.tsx`, change the import line:

```typescript
import { Table, Input, Select, Button, StatusBadge, useToast, Pagination, type Column, type StatusTone } from '../../../components/ui';
```

to:

```typescript
import { CardGrid, Input, Select, Button, StatusBadge, useToast, Pagination, type StatusTone } from '../../../components/ui';
```

Replace the `const columns: Column<StaffUser>[] = [...]` block (and its closing `];`) with a `renderCard` function:

```tsx
  function renderCard(user: StaffUser) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 truncate font-semibold text-recruiter-text">{user.email}</div>
          <StatusBadge tone={ROLE_TONE[user.role] ?? 'neutral'}>{ROLE_LABEL[user.role] ?? user.role}</StatusBadge>
        </div>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2.5 text-xs text-recruiter-text-tertiary">
          <StatusBadge tone={statusTone(user.status)}>{statusLabel(user.status)}</StatusBadge>
          <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</span>
        </div>
      </div>
    );
  }
```

Replace the final `<Table columns={columns} rows={usersResponse?.data ?? []} rowKey={(user) => user.id} emptyMessage="No staff users yet." />` line with:

```tsx
      <CardGrid items={usersResponse?.data ?? []} cardKey={(user) => user.id} renderCard={renderCard} emptyMessage="No staff users yet." />
```

`ROLE_TONE`, `ROLE_LABEL`, `statusTone`, and `statusLabel` are unchanged — `renderCard` uses all four exactly as the removed `columns` array did.

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest users/page.test`
Expected: PASS, all existing tests green unmodified. If a test fails, read the failure — it means the card markup dropped something a table row used to show (a real regression), not a change to fix by editing the test.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(org-admin)/users/page.tsx"
git commit -m "feat: convert staff users list to card grid"
```

---

### Task 3: Audit Log — card grid

**Files:**
- Modify: `apps/web/app/(org-admin)/audit-log/page.tsx`

**Interfaces:**
- Consumes: `CardGrid` (`components/ui`).

- [ ] **Step 1: Replace Table with CardGrid**

In `apps/web/app/(org-admin)/audit-log/page.tsx`, change the import line:

```typescript
import { Input, Button, Table, StatusBadge, type Column, type StatusTone } from '../../../components/ui';
```

to:

```typescript
import { Input, Button, CardGrid, StatusBadge, type StatusTone } from '../../../components/ui';
```

Replace the `const columns: Column<AuditLogEntry>[] = [...]` block (and its closing `];`) with a `renderCard` function:

```tsx
  function renderCard(entry: AuditLogEntry) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <StatusBadge tone={actionTone(entry.action)}>{entry.action}</StatusBadge>
          <span className="text-xs text-recruiter-text-tertiary">{new Date(entry.createdAt).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2.5 text-xs text-recruiter-text-tertiary">
          <span>{entry.actorEmail ?? 'System'}</span>
          <span>{entry.entityType}</span>
        </div>
      </div>
    );
  }
```

Replace the block that renders the table and "Load more" button:

```tsx
            <Table columns={columns} rows={entries} rowKey={(entry) => entry.id} emptyMessage="No audit events found." />
            {entries.length > 0 && (
              <div className="mt-4">
                <Button variant="secondary" onClick={handleLoadMore} disabled={isLoading}>
                  Load more
                </Button>
              </div>
            )}
```

with:

```tsx
            <CardGrid items={entries} cardKey={(entry) => entry.id} renderCard={renderCard} emptyMessage="No audit events found." />
            {entries.length > 0 && (
              <div className="mt-4">
                <Button variant="secondary" onClick={handleLoadMore} disabled={isLoading}>
                  Load more
                </Button>
              </div>
            )}
```

`actionTone` is unchanged — `renderCard` calls it exactly as the removed `columns` array did. The filter form and the cursor-based `entries` state "Load more" appends to are unchanged.

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest audit-log/page.test`
Expected: PASS unmodified. Same rule as Task 2 — a failure means a real regression, not a reason to edit the test.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(org-admin)/audit-log/page.tsx"
git commit -m "feat: convert audit log to card grid"
```

---

### Task 4: Integrations — motion polish + Recent deliveries card grid

**Files:**
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.tsx`

**Interfaces:**
- Consumes: `CardGrid` (`components/ui`), `motion` (`framer-motion`, already a dependency).

- [ ] **Step 1: Update imports**

In `apps/web/app/(org-admin)/settings/integrations/page.tsx`, change:

```typescript
import { Input, Button, Card, Table, useToast } from '../../../../components/ui';
```

to:

```typescript
import { Input, Button, Card, CardGrid, useToast } from '../../../../components/ui';
```

and add, right after the existing import block (after the `WebhookDeliveryRow` type import):

```typescript
import { motion } from 'framer-motion';
```

- [ ] **Step 2: Add the `renderDeliveryCard` function**

Add this function inside `IntegrationsSettingsPage`, right before the `return` statement:

```tsx
  function renderDeliveryCard(row: WebhookDeliveryRow) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-semibold text-recruiter-text">{row.eventType}</span>
          <span className="text-xs text-recruiter-text-tertiary">{row.status}</span>
        </div>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2 text-xs text-recruiter-text-tertiary">
          <span>HTTP {row.httpStatusCode ?? '—'}</span>
          <span>{new Date(row.createdAt).toLocaleString()}</span>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Wrap each of the 4 settings cards in a fade-up `motion.div` and convert the deliveries table**

Replace the entire `return (...)` block with:

```tsx
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-recruiter-text">Integrations</h1>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Email (SMTP)</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.smtpConfigured
              ? `Configured — ${integrations.smtpHost}:${integrations.smtpPort}${integrations.emailFromAddress ? `, from ${integrations.emailFromAddress}` : ''}`
              : 'Not configured — invites and password resets currently use the platform default.'}
          </p>
          <form onSubmit={handleSmtpSubmit} className="flex flex-col gap-3">
            <Input label="SMTP host" value={smtpHost} onChange={setSmtpHost} required />
            <Input label="SMTP port" type="number" value={smtpPort} onChange={setSmtpPort} required />
            <Input label="SMTP username" value={smtpUser} onChange={setSmtpUser} required />
            <Input label="SMTP password" type="password" value={smtpPassword} onChange={setSmtpPassword} required />
            <Input label="From address (optional)" type="email" value={fromAddress} onChange={setFromAddress} />
            <Button type="submit" loading={updateSmtp.isPending}>
              {integrations?.smtpConfigured ? 'Replace SMTP settings' : 'Save SMTP settings'}
            </Button>
          </form>
          {smtpError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {smtpError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">AI API key</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.aiKeyConfigured
              ? 'Configured — AI features use this organization\'s own Anthropic key.'
              : 'Not configured — AI features currently use the platform default key.'}
          </p>
          <form onSubmit={handleAiKeySubmit} className="flex flex-col gap-3">
            <Input label="AI API key" type="password" value={aiApiKey} onChange={setAiApiKey} required />
            <Button type="submit" loading={updateAiKey.isPending}>
              {integrations?.aiKeyConfigured ? 'Replace AI API key' : 'Save AI API key'}
            </Button>
          </form>
          {aiKeyError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {aiKeyError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Public API</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.apiKeyConfigured
              ? `Active key: ${integrations.apiKeyPrefix}… (created ${new Date(integrations.apiKeyCreatedAt as string).toLocaleDateString()})`
              : 'No API key generated'}
          </p>
          {revealedApiKey && (
            <div className="mb-4 rounded-md bg-status-warning-bg p-3">
              <p className="mb-1 break-all font-mono text-sm text-status-warning">{revealedApiKey}</p>
              <p className="text-xs text-status-warning">Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button loading={generateApiKey.isPending} onClick={handleGenerateApiKey}>
              {integrations?.apiKeyConfigured ? 'Regenerate' : 'Generate'}
            </Button>
            {integrations?.apiKeyConfigured && (
              <Button variant="secondary" loading={revokeApiKey.isPending} onClick={handleRevokeApiKey}>
                Revoke
              </Button>
            )}
          </div>
          {apiKeyError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {apiKeyError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Webhooks</h2>
          <div className="flex flex-col gap-3">
            <Input
              label="Webhook URL"
              value={webhookUrlInput}
              onChange={setWebhookUrlInput}
              placeholder="https://your-ats.example.com/webhooks/exam-platform"
            />
            <Button loading={updateWebhookUrl.isPending} onClick={handleSaveWebhookUrl} className="self-start">
              Save URL
            </Button>
          </div>

          {revealedWebhookSecret && (
            <div className="mt-4 rounded-md bg-status-warning-bg p-3">
              <p className="mb-1 break-all font-mono text-sm text-status-warning">{revealedWebhookSecret}</p>
              <p className="text-xs text-status-warning">Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <Button
            className="mt-3"
            variant="secondary"
            loading={generateWebhookSecret.isPending}
            onClick={handleGenerateWebhookSecret}
          >
            {integrations?.webhookConfigured ? 'Regenerate signing secret' : 'Generate signing secret'}
          </Button>
          {webhookError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {webhookError}
            </p>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold text-recruiter-text">Recent deliveries</h3>
          <CardGrid items={deliveries ?? []} cardKey={(row) => row.id} renderCard={renderDeliveryCard} emptyMessage="No deliveries yet." />
        </Card>
      </motion.div>
    </div>
  );
```

- [ ] **Step 4: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest settings/integrations/page.test`
Expected: PASS unmodified.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(org-admin)/settings/integrations/page.tsx"
git commit -m "feat: add motion polish and card grid to integrations settings"
```

---

### Task 5: Settings/Branding — motion polish

**Files:**
- Modify: `apps/web/app/(org-admin)/settings/branding/page.tsx`

**Interfaces:** none (self-contained styling change).

- [ ] **Step 1: Wrap the page's `Card` in a fade-up `motion.div`**

In `apps/web/app/(org-admin)/settings/branding/page.tsx`, add the import (alongside the existing `components/ui` import):

```typescript
import { motion } from 'framer-motion';
```

Replace the `return (...)` block:

```tsx
  return (
    <Card className="max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-recruiter-text">Branding Settings</h1>
      {!branding && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading current branding…</p>}
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
      <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
        <Input label="Primary color" type="color" value={primaryColor} onChange={setPrimaryColor} />
        <Input label="Accent color" type="color" value={accentColor} onChange={setAccentColor} />
        <Button type="submit" disabled={!branding}>
          Save colors
        </Button>
      </form>
      <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-recruiter-text-secondary">
          Logo (PNG, JPEG, or SVG, max 2MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-md border border-recruiter-border p-1.5 text-sm text-recruiter-text-secondary"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={!branding}>
          Upload logo
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      )}
    </Card>
  );
```

with:

```tsx
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <Card className="max-w-md">
        <h1 className="mb-4 text-xl font-semibold text-recruiter-text">Branding Settings</h1>
        {!branding && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading current branding…</p>}
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
        <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
          <Input label="Primary color" type="color" value={primaryColor} onChange={setPrimaryColor} />
          <Input label="Accent color" type="color" value={accentColor} onChange={setAccentColor} />
          <Button type="submit" disabled={!branding}>
            Save colors
          </Button>
        </form>
        <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-recruiter-text-secondary">
            Logo (PNG, JPEG, or SVG, max 2MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-md border border-recruiter-border p-1.5 text-sm text-recruiter-text-secondary"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!branding}>
            Upload logo
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
    </motion.div>
  );
```

- [ ] **Step 2: Run the existing test suite and typecheck**

Run (from `apps/web`): `npx jest settings/branding/page.test`
Expected: PASS unmodified.

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(org-admin)/settings/branding/page.tsx"
git commit -m "style: add motion entrance to branding settings card"
```

---

### Task 6: Settings/SSO — motion polish

**Files:**
- Modify: `apps/web/app/(org-admin)/settings/sso/page.tsx`

**Interfaces:** none (self-contained styling change).

- [ ] **Step 1: Wrap the page's `Card` in a fade-up `motion.div`**

In `apps/web/app/(org-admin)/settings/sso/page.tsx`, add the import (alongside the existing `components/ui` import):

```typescript
import { motion } from 'framer-motion';
```

Replace the `<Card className="max-w-lg">...</Card>` block:

```tsx
      <Card className="max-w-lg">
        <h2 className="mb-1 text-lg font-semibold text-recruiter-text">SAML configuration</h2>
        <p className="mb-4 text-sm text-recruiter-text-secondary">
          {sso?.samlEnabled ? 'Configured and enabled — staff can log in via SSO.' : 'Not configured — staff use password login only.'}
        </p>

        <div className="mb-4 rounded-md bg-recruiter-bg-subtle p-3">
          <p className="mb-1 text-xs font-semibold text-recruiter-text-secondary">Give this to your IdP admin</p>
          <p className="break-all font-mono text-xs text-recruiter-text">{metadataUrl}</p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <Input label="IdP Entity ID" value={entityId} onChange={setEntityId} required />
          <Input label="IdP SSO URL" value={ssoUrl} onChange={setSsoUrl} required />
          <label className="flex flex-col gap-1 text-sm font-medium text-recruiter-text">
            IdP Certificate
            <textarea
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              required
              rows={6}
              className="rounded border border-recruiter-border p-2 font-mono text-xs"
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </label>
          <Button type="submit" loading={updateSso.isPending}>
            Save IdP settings
          </Button>
        </form>

        <Button
          className="mt-3"
          variant="secondary"
          loading={updateSso.isPending}
          onClick={handleToggleEnabled}
          disabled={!sso?.samlEnabled && (!entityId || !ssoUrl || !certificate)}
        >
          {sso?.samlEnabled ? 'Disable SSO' : 'Enable SSO'}
        </Button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
```

with:

```tsx
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <Card className="max-w-lg">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">SAML configuration</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {sso?.samlEnabled ? 'Configured and enabled — staff can log in via SSO.' : 'Not configured — staff use password login only.'}
          </p>

          <div className="mb-4 rounded-md bg-recruiter-bg-subtle p-3">
            <p className="mb-1 text-xs font-semibold text-recruiter-text-secondary">Give this to your IdP admin</p>
            <p className="break-all font-mono text-xs text-recruiter-text">{metadataUrl}</p>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <Input label="IdP Entity ID" value={entityId} onChange={setEntityId} required />
            <Input label="IdP SSO URL" value={ssoUrl} onChange={setSsoUrl} required />
            <label className="flex flex-col gap-1 text-sm font-medium text-recruiter-text">
              IdP Certificate
              <textarea
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
                required
                rows={6}
                className="rounded border border-recruiter-border p-2 font-mono text-xs"
                placeholder="-----BEGIN CERTIFICATE-----"
              />
            </label>
            <Button type="submit" loading={updateSso.isPending}>
              Save IdP settings
            </Button>
          </form>

          <Button
            className="mt-3"
            variant="secondary"
            loading={updateSso.isPending}
            onClick={handleToggleEnabled}
            disabled={!sso?.samlEnabled && (!entityId || !ssoUrl || !certificate)}
          >
            {sso?.samlEnabled ? 'Disable SSO' : 'Enable SSO'}
          </Button>

          {error && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {error}
            </p>
          )}
        </Card>
      </motion.div>
```

The `<h1>Single Sign-On</h1>` heading above the card, inside the page's outer `<div className="flex flex-col gap-6">` wrapper, is unaffected.

- [ ] **Step 2: Run the existing test suite and typecheck**

Run (from `apps/web`): `npx jest settings/sso/page.test`
Expected: PASS unmodified.

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(org-admin)/settings/sso/page.tsx"
git commit -m "style: add motion entrance to SSO settings card"
```

---

### Task 7: Data Rights — motion polish

**Files:**
- Modify: `apps/web/app/(org-admin)/data-rights/page.tsx`

**Interfaces:** none (self-contained styling change).

- [ ] **Step 1: Wrap each conditionally-rendered `Card` in a fade-up `motion.div`**

In `apps/web/app/(org-admin)/data-rights/page.tsx`, add the import (alongside the existing `components/ui` import):

```typescript
import { motion } from 'framer-motion';
```

Replace the candidate-result block:

```tsx
      {candidate && (
        <Card className="mb-6">
          <p className="font-medium text-recruiter-text">{candidate.name}</p>
          <p className="text-sm text-recruiter-text-secondary">{candidate.email}</p>
          {candidate.phone && <p className="text-sm text-recruiter-text-secondary">{candidate.phone}</p>}
          {candidate.erasedAt ? (
            <p className="mt-2 text-sm text-recruiter-text-tertiary">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleExport}>Export data</Button>
              <Button variant="secondary" onClick={handleOpenConfirm}>
                Erase candidate
              </Button>
            </div>
          )}
        </Card>
      )}
```

with:

```tsx
      {candidate && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
          <Card className="mb-6">
            <p className="font-medium text-recruiter-text">{candidate.name}</p>
            <p className="text-sm text-recruiter-text-secondary">{candidate.email}</p>
            {candidate.phone && <p className="text-sm text-recruiter-text-secondary">{candidate.phone}</p>}
            {candidate.erasedAt ? (
              <p className="mt-2 text-sm text-recruiter-text-tertiary">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button onClick={handleExport}>Export data</Button>
                <Button variant="secondary" onClick={handleOpenConfirm}>
                  Erase candidate
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      )}
```

Replace the export-data block:

```tsx
      {exportData && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-recruiter-text">Export data</h2>
            <Button variant="secondary" onClick={handleDownload}>
              Download JSON
            </Button>
          </div>
          <section className="mb-4">
            <h3 className="font-medium text-recruiter-text">Profile</h3>
            <p className="text-sm text-recruiter-text-secondary">
              {exportData.candidate.name} — {exportData.candidate.email}
            </p>
          </section>
          <section className="mb-4">
            <h3 className="font-medium text-recruiter-text">Invitations ({exportData.invitations.length})</h3>
            <ul className="text-sm text-recruiter-text-secondary">
              {exportData.invitations.map((invitation) => (
                <li key={invitation.id}>
                  {invitation.examTitle} — {invitation.status}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-medium text-recruiter-text">Attempts ({exportData.attempts.length})</h3>
            <ul className="text-sm text-recruiter-text-secondary">
              {exportData.attempts.map((attempt) => (
                <li key={attempt.id}>
                  {attempt.examTitle} —{' '}
                  {attempt.result ? `${attempt.result.score}/${attempt.result.maxScore} (${attempt.result.passFail})` : attempt.status}
                </li>
              ))}
            </ul>
          </section>
        </Card>
      )}
```

with:

```tsx
      {exportData && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-recruiter-text">Export data</h2>
              <Button variant="secondary" onClick={handleDownload}>
                Download JSON
              </Button>
            </div>
            <section className="mb-4">
              <h3 className="font-medium text-recruiter-text">Profile</h3>
              <p className="text-sm text-recruiter-text-secondary">
                {exportData.candidate.name} — {exportData.candidate.email}
              </p>
            </section>
            <section className="mb-4">
              <h3 className="font-medium text-recruiter-text">Invitations ({exportData.invitations.length})</h3>
              <ul className="text-sm text-recruiter-text-secondary">
                {exportData.invitations.map((invitation) => (
                  <li key={invitation.id}>
                    {invitation.examTitle} — {invitation.status}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-medium text-recruiter-text">Attempts ({exportData.attempts.length})</h3>
              <ul className="text-sm text-recruiter-text-secondary">
                {exportData.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    {attempt.examTitle} —{' '}
                    {attempt.result ? `${attempt.result.score}/${attempt.result.maxScore} (${attempt.result.passFail})` : attempt.status}
                  </li>
                ))}
              </ul>
            </section>
          </Card>
        </motion.div>
      )}
```

The `Modal` for erase confirmation is unaffected — modals are already an overlay, not part of the page's static entrance sequence.

- [ ] **Step 2: Run the existing test suite and typecheck**

Run (from `apps/web`): `npx jest data-rights/page.test`
Expected: PASS unmodified.

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(org-admin)/data-rights/page.tsx"
git commit -m "style: add motion entrance to data rights cards"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full apps/web suite**

Run (from `apps/web`): `npx jest`
Expected: all suites pass, including the unmodified `org-admin` test files touched by Tasks 1-7.

- [ ] **Step 2: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: clean except the same pre-existing unrelated baseline errors this project has consistently confirmed throughout (`QuestionNavigator.test.tsx`, `forgot-password/login/reset-password` test files) — confirm no new ones in any file this plan touched.

- [ ] **Step 3: Live verification**

1. Start `api` and `web` dev servers. Log in as an org-admin account for `demo-org` — check the demo seed data or an existing org-admin test file's login fixture for the exact credential if not already known from this session (the recruiter account used elsewhere this session is `recruiter@demo-org.test`; the org-admin account follows the same org and password convention).
2. **Staff Users:** confirm the list renders as cards (email, role badge, status badge, last login), the add-staff-member form and search still work.
3. **Audit Log:** confirm the list renders as cards, filters still work, "Load more" still appends more cards.
4. **Integrations:** confirm the 4 settings cards fade in staggered on load, and the "Recent deliveries" section renders as cards.
5. **Branding, SSO, Data Rights:** confirm each page's card(s) fade in on load; confirm Data Rights' lookup/export/erase flow still works end-to-end.
6. **Sidebar:** hover over nav items and confirm the background color transitions smoothly.
7. Take a screenshot of at least one converted list page and one motion-only settings page as evidence.
