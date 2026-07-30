# Platform Admin List View — Design

Rebuild the Platform Admin console around a Salesforce-style list view, and give a
platform admin real actions on an organization: edit, suspend, and delete.

## The problem

The Organizations page is a permanently-expanded create form sitting above a grid of
cards. Three consequences:

1. **The create form owns the top third of the page** for an action performed a few
   times a year.
2. **Cards cannot be scanned or compared.** No sorting, no column alignment. Three
   organizations look fine; thirty will not.
3. **There is nowhere to put actions.** Each card has exactly one button ("Switch
   into") because a card has no room for a second. Everything a platform admin might
   want to do to an organization — edit it, suspend it, see its users — has nowhere to
   live.

The Salesforce reference solves all three with the same move: a **list view**. An action
bar at the top right, a dense sortable table, and a per-row action menu.

## Two findings from the existing code

**`GET /organizations` leaks encrypted secrets to the browser.**
`OrganizationsService.list()` calls `prisma.organization.findMany({ where, orderBy,
skip, take })` with no `select`, and the controller returns the rows verbatim. Every
platform-admin page load therefore sends each organization's
`smtpPasswordEncrypted`, `aiApiKeyEncrypted`, `apiKeyHash`, `webhookSecretEncrypted`
and `samlIdpCertificate` to the client. The values are encrypted or hashed, so this is
not an immediate compromise, but ciphertext and a key hash have no business in a list
response. Fixed by an explicit `select` — done first, independently of the redesign.

**`Organization.status` already exists and nothing reads it.**
The column is declared `String @default("active")` and does not appear in a single
non-test read across `apps/api` or `apps/exam-runtime`. Suspend and delete can both use
it with **no migration**.

## Design decisions

### Fetch every organization; sort and filter in the browser

Expected scale is under ~50 organizations. The frontend requests `pageSize=200` and
does sorting, searching and filtering client-side.

This is not only simpler — it avoids a specific bug. The page currently paginates at 20.
Client-side sorting layered on server-side pagination sorts *only the current page*,
which looks like a broken sort. Fetching everything removes the class of bug entirely.

The API keeps its `page`/`pageSize` parameters (they already exist and cost nothing). If
`total` ever exceeds the rows returned, the metadata line says so rather than silently
truncating — a silent cap that reads as "you are seeing everything" is worse than a
smaller list.

### One `status` column carries all three states

`active` | `suspended` | `deleted`.

Delete is a **soft delete**: it sets `status = 'deleted'`, hides the row, and blocks all
login. Nothing is destroyed. Rationale:

- An organization owns exams, questions, candidates, attempts, answers, results, audit
  logs and stored blobs. A real cascade could run for minutes and half-fail, leaving
  orphans behind an RLS boundary that makes them hard to find.
- Audit logs must survive; deleting the org that owns them destroys the record of the
  deletion itself.
- It gives an undo.

No `deletedAt` column: the audit log already records who deleted what and when, and a
second source of truth for the same fact will drift.

### Primary admin, not all admins

An organization can have several `org_admin` users. The list shows the **first** one by
`createdAt` — in practice the admin created alongside the organization. The row menu's
"View users" is how you see the rest.

`User.name` is nullable and organization creation does not set it (the admin fills it in
when setting their password), so this column is empty for a freshly created org. Render
`—`; the email is its own column and is always present.

**"View users"** navigates to the All Users tab with the organization pre-filled in its
search box — `/all-users?org=<slug>`. It is a link, not a new screen.

### Suspension does not fail an exam in progress

A suspended organization blocks **new** logins and **new** attempt starts. Candidates
already mid-attempt finish normally. Suspension is almost always a billing or
offboarding matter, and failing someone's exam over an invoice is disproportionate.

### Delete is refused while an exam is live

`DELETE /organizations/:id` returns `409` if the organization has any attempt with
status `in_progress`. Suspend first, wait, then delete.

## Columns

| Column | Source | Default visible | Sortable |
|---|---|---|---|
| Name | existing | yes | yes |
| Slug | existing | yes | yes |
| Primary admin | new — first `org_admin` by `createdAt` | yes | yes |
| Admin email | new — same user | yes | yes |
| Region | existing | yes | yes |
| Status | existing column, newly surfaced | yes | yes |
| Users | new — count of `User` in org | yes | yes |
| Exams | new — count of `Exam` in org | no | yes |
| Created | existing | yes | yes |

Hidden columns are toggled through the toolbar gear and the choice persists in
`localStorage`. Per-user server-side column preferences are out of scope.

## API

### `GET /organizations` (changed)

Explicit `select`, plus the primary admin and the two counts:

```ts
{
  id: string;
  name: string;
  slug: string;
  region: string;
  status: 'active' | 'suspended';
  createdAt: Date;
  primaryAdminName: string | null;
  primaryAdminEmail: string | null;
  userCount: number;
  examCount: number;
}
```

`status = 'deleted'` rows are excluded from the response.

**The counts must not be an N+1.** Every tenant-scoped query runs inside
`TenantPrismaService.forTenant()`'s interactive transaction, and the connection pool is
the platform's known concurrency ceiling — a per-organization count would issue 2N
queries against it. Use two `groupBy` calls (one over `User`, one over `Exam`, both
grouped by `organizationId`) and join in memory. Same for the primary admin: one
`findMany` over `User` where `role = 'org_admin'`, ordered by `createdAt`, reduced to
first-per-organization in memory.

### `PATCH /organizations/:id` (new)

Body `{ name?: string; region?: string }`. Slug is immutable — it appears in invitation
URLs and SAML entity IDs, and changing it would break live links.

### `PATCH /organizations/:id/status` (new)

Body `{ status: 'active' | 'suspended' }`. Audited.

### `DELETE /organizations/:id` (new)

Sets `status = 'deleted'`. Returns `409` if any attempt in the organization is
`in_progress`. Audited.

All four require `platform:manage_organizations`, as the existing handlers do.

## Where suspension is enforced

A status badge that does not block anything is decoration. Three places must check it,
and all three are load-bearing:

| Path | File |
|---|---|
| Staff password login | `apps/api/src/auth/auth.service.ts` |
| SSO token exchange | `apps/api/src/auth/auth.service.ts` |
| Candidate invite redemption | `apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts` |

**Refresh-token rotation must check too.** Without it, staff already holding a session
keep working until their token naturally expires, and a suspension appears not to have
taken effect.

Both `suspended` and `deleted` block all four. The candidate-facing message must not
disclose the reason — a candidate should see a neutral "this exam is not available",
not that their prospective employer is suspended.

## Frontend structure

The list-view shell is extracted so all three Platform Admin tabs share it:

| File | Responsibility |
|---|---|
| `apps/web/app/(platform)/components/ListView.tsx` (new) | The shell: object header, action-bar slot, metadata line, search box, column-chooser gear, table. Generic over row type. |
| `apps/web/app/(platform)/components/RowActions.tsx` (new) | The per-row `▾` menu, built on the existing `DropdownMenu`. |
| `apps/web/app/(platform)/organizations/CreateOrganizationModal.tsx` (new) | The current inline form, moved into the existing `Modal` behind the `New` button. Form logic unchanged. |
| `apps/web/app/(platform)/organizations/page.tsx` (modify) | Composes the above; drops `CardGrid` and `Pagination`. |
| `apps/web/app/(platform)/platform-admins/page.tsx` (modify) | Adopts `ListView`. |
| `apps/web/app/(platform)/all-users/page.tsx` (modify) | Adopts `ListView`. |

The existing `Table` component already handles click-to-sort via its `sortValue` prop, so
sorting needs no new code — only `sortValue` on each column.

`ListView` owns search and column visibility. It does **not** own row selection: bulk
actions are out of scope (see below), and building selection with no consumer would be
dead UI.

## Phases

Each phase ships on its own and leaves the console working.

**Phase 0 — the `select` fix.** Stop returning encrypted secrets from
`GET /organizations`. Independent of everything else; do it first.

**Phase 1 — the list view.** `ListView`, `RowActions`, the create modal, and the
Organizations page rebuilt on them. Row menu: Switch into · View users. Frontend only,
no schema or API change beyond Phase 0. Later phases add menu items as their backing
endpoints land.

**Phase 2 — the real columns.** Primary admin, admin email, and the two counts on
`GET /organizations`, using the `groupBy` approach above.

**Phase 3 — edit.** `PATCH /organizations/:id` and the edit modal.

**Phase 4 — suspend / reactivate.** `PATCH /organizations/:id/status`, the four
enforcement points, and the status column made actionable.

**Phase 5 — delete.** `DELETE /organizations/:id`, the live-exam guard, and a
confirmation dialog requiring the operator to type the organization's slug.

**Phase 6 — the other two tabs.** Platform Admins and All Users adopt `ListView`.

## Verification

Unit and component tests per phase, plus these, which are the ones that would otherwise
ship broken:

1. **Sorting sorts everything, not one page.** With more organizations than the old page
   size, sort by Name and confirm the first row is the global first, not the first of a
   page.
2. **The list response carries no secrets.** Assert the `GET /organizations` payload has
   no key matching `/encrypted|hash|certificate|secret/i`. A regression here is invisible
   in the UI.
3. **Counts are not an N+1.** Assert the query count for a list of N organizations is
   constant, not proportional to N.
4. **Suspension blocks all four paths** — password login, SSO exchange, refresh
   rotation, candidate redemption. Test each; three out of four passing is a hole.
5. **A candidate mid-attempt is unaffected by suspension.** Start an attempt, suspend the
   org, confirm the attempt continues and can be submitted.
6. **Delete is refused with a live exam.** Expect `409`, and confirm status is unchanged
   afterwards.
7. **Deleted organizations disappear from the list and block login.**

## Out of scope

- **Saved named list views** (Salesforce's `All Open Leads: Ashley` switcher). Useful at
  thousands of records and several operators; there is one platform admin and under 50
  organizations.
- **Bulk selection and bulk actions.** No bulk action has a real use case here. Add
  checkboxes when there is something to do with them.
- **Inline row editing.** Editing organization configuration by clicking a cell is a
  misclick away from a bad change. Edit goes through a modal.
- **Charts and the equivalent of Intelligence View.**
- **Server-side sorting and filtering.** Revisit past roughly 200 organizations.
- **Hard delete and blob purging.** Soft delete is the deliverable. Physical erasure
  belongs with the existing GDPR erase work, not here.
