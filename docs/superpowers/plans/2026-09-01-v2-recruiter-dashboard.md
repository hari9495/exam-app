# v2 Recruiter Dashboard (Azure, shadcn, direction A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/v2/dashboard` — the recruiter dashboard in Azure (direction A, "bright console"), inside a reusable Azure app shell (left sidebar + top bar), on the shadcn foundation, reusing all existing dashboard data/logic unchanged.

**Architecture:** A `(recruiter)` route group under `app/v2/` provides the shell (auth gate, role→nav, org-branding vars) via a layout copied from the proven old recruiter layout with the shell swapped. The dashboard is a reskin: the existing `useDashboard*` hooks + `DashboardFilterBar` helpers are imported directly (they are not UI-coupled). New presentational primitives (`Sidebar`, `TopBar`, `Select`, `StatCard`, `Panel`) live in `components/ui-v2/`; analytics panels are ported from the old file and repainted to Azure recharts.

**Tech Stack:** Next.js 16, React 18, TypeScript, the `.v2` Azure scope + shadcn tokens (foundation already committed), recharts + d3 Sparkline (installed), framer-motion, lucide-react, jest+RTL (single-file only).

**Spec:** `docs/superpowers/specs/2026-09-01-v2-recruiter-dashboard-design.md`. Review against `docs/brand/workfox-ui-review-checklist.md`. Data contract: see the exploration map (endpoints, types) referenced in the spec.

## Global Constraints

- **Never modify** old UI: `app/(recruiter)/**`, `app/login/**`, `components/ui/**`, `components/StaffSidebar.tsx`, `components/StaffTopBar.tsx`, `components/dashboard/**`, `components/invigilator.css`. We READ them to port; we do not edit them.
- **Reuse, do not copy, the data layer:** import `useDashboardSummary/useDashboardTrend/useDashboardAnalytics` from `lib/hooks/useDashboard.ts`, `useFlaggedQuestions` from `lib/hooks/useQuestions.ts`, and `defaultFilterState/toAnalyticsFilters/isDefaultFilterState/describeTimeFilter` + `DashboardFilterState` from `components/dashboard/DashboardFilterBar.tsx`. Do not duplicate these.
- **No `npm install`** beyond what's already added; no `git worktree`, `git clean`; no full jest suite (single file `--runInBand`).
- **Next 16:** verify against a **production build**; new routes need a build to register.
- **Accent-slot white-label:** sidebar active state, primary buttons, focus rings use `var(--org-primary)` (injected from branding; default `#3b5fe3`). Status/integrity colors stay semantic.
- **shadcn collision convention:** imported 21st/shadcn classes rename the 3 colliders — `bg-primary`→`bg-vprimary`, `bg-muted`→`bg-vmuted`, `bg-accent`→`bg-vaccent` (and `text-`/`border-` equivalents). `*-foreground`, `card`, `background`, `border`, `ring`, `input`, `secondary`, `popover` are safe as-is.
- **Interim cross-links:** dashboard action links point at existing old routes (`/exams/new`, `/candidates`, `/exams/:id/edit`, `/questions/:id/edit`) until those v2 screens exist.
- **Data/auth caveat:** the shell auth-gate redirects to `/login` without a token and panels need the API. Controller verification covers build + shell chrome + loading/empty states; full live-data check needs a running API + recruiter login.
- All paths relative to `apps/web/`; run commands from `apps/web/`.

---

### Task 1: Azure app shell (Sidebar + TopBar + recruiter layout)

**Files:**
- Create: `components/ui-v2/Sidebar.tsx`
- Create: `components/ui-v2/TopBar.tsx`
- Modify: `components/ui-v2/index.ts` (export both)
- Create: `app/v2/(recruiter)/layout.tsx`
- Create: `app/v2/(recruiter)/dashboard/page.tsx` (placeholder, replaced in Task 5)

**Interfaces:**
- Produces: `Sidebar({ navItems, pathname, orgName, orgLogoUrl?, orgInitial })`, `TopBar({ displayName, initials, roleLabel, avatarUrl?, onLogout })`, and the `/v2/dashboard` route rendering inside the shell.
- Consumes: `StaffNavItem` (reused from `components/StaffSidebar.tsx` export), `WorkfoxMark`, `BRAND`, the reused hooks/nav arrays.

- [ ] **Step 1: Create `components/ui-v2/Sidebar.tsx`:**

```tsx
import Link from 'next/link';
import type { StaffNavItem } from '../StaffSidebar';
import { WorkfoxMark } from './WorkfoxMark';
import { BRAND } from '../../lib/brand';

export function Sidebar({
  navItems, pathname, orgName, orgLogoUrl, orgInitial,
}: {
  navItems: StaffNavItem[]; pathname: string | null;
  orgName: string; orgLogoUrl?: string; orgInitial: string;
}) {
  return (
    <nav
      className="print:hidden"
      style={{
        width: 224, flexShrink: 0, minHeight: '100vh', position: 'sticky', top: 0,
        background: 'var(--paper)', borderRight: '1px solid var(--hair)',
        display: 'flex', flexDirection: 'column', padding: '14px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 16px 14px', borderBottom: '1px solid var(--hair)' }}>
        {orgLogoUrl ? (
          <img src={orgLogoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain' }} />
        ) : (
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 6, background: 'var(--org-primary)', color: 'var(--org-on-primary)', fontWeight: 700, fontSize: 12 }}>{orgInitial}</span>
        )}
        <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 14.5, letterSpacing: '-0.01em' }}>{orgName}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '10px 8px' }}>
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 500,
                textDecoration: 'none',
                color: active ? 'var(--org-primary)' : 'var(--muted)',
                background: active ? 'color-mix(in srgb, var(--org-primary) 8%, transparent)' : 'transparent',
              }}>
              {active && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--org-primary)' }} />}
              {Icon && <Icon size={16} style={{ flexShrink: 0 }} />}
              {item.label}
            </Link>
          );
        })}
      </div>
      <div style={{ marginTop: 'auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)', opacity: 0.6 }}>
        <WorkfoxMark size={16} /> <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{BRAND.productName}</span>
      </div>
    </nav>
  );
}
```

(Note: if `StaffNavItem.icon` is not a component type compatible with `size` prop, render `{item.icon}` as-is instead of `<Icon size=…/>`; confirm the type when implementing by reading `components/StaffSidebar.tsx`.)

- [ ] **Step 2: Create `components/ui-v2/TopBar.tsx`:**

```tsx
import Link from 'next/link';
import { LogOut } from 'lucide-react';

export function TopBar({
  displayName, initials, roleLabel, avatarUrl, onLogout,
}: {
  displayName: string; initials: string; roleLabel: string; avatarUrl?: string; onLogout: () => void;
}) {
  return (
    <header className="print:hidden" style={{ height: 56, flexShrink: 0, background: 'var(--paper)', borderBottom: '1px solid var(--hair)', display: 'flex', alignItems: 'center', padding: '0 20px' }}>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--ink)' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', background: 'var(--org-primary)', color: 'var(--org-on-primary)', fontSize: 11, fontWeight: 700 }}>{initials}</span>
          )}
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel}</span>
          </span>
        </Link>
        <button onClick={onLogout} aria-label="Log out" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--hair)', borderRadius: 6, padding: '6px 11px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
          <LogOut size={14} /> Log out
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Add exports to `components/ui-v2/index.ts`:**

```ts
export { Sidebar } from './Sidebar';
export { TopBar } from './TopBar';
```

- [ ] **Step 4: Create `app/v2/(recruiter)/layout.tsx` by porting the old recruiter layout.**

Read `app/(recruiter)/layout.tsx` and reproduce it verbatim EXCEPT:
1. Import the v2 shell: `import { Sidebar, TopBar } from '../../../components/ui-v2';` (remove the old `StaffSidebar`/`StaffTopBar` imports).
2. Keep all hooks and logic identical: `useAuth`, `useOrgBranding`, `useDocumentBranding`, `useCurrentUser`, the auth gate + `staffLandingPath` wrong-console redirect, role→nav selection (`RECRUITER_NAV_ITEMS` vs `SUPER_ADMIN_FULL_NAV`), role label, display name/initials, org name/initial, `handleLogout`.
3. **Theme vars:** where the old layout builds `themeStyle` with `--color-primary/--color-accent/--color-primary-text`, instead set `['--org-primary']: branding?.primaryColor || '#3b5fe3'` and `['--org-on-primary']: branding?.textColor || '#ffffff'` on the shell root. Wrap the whole shell in a `<div className="v2">` so the Azure scope applies (the `app/v2/layout.tsx` already provides `.v2`, but this route group's own root should also carry it to be safe — apply `className="v2"` on the outer wrapper).
4. Render: `<div className="v2" style={{display:'flex', minHeight:'100vh', ...orgVars}}><Sidebar .../><div style={{display:'flex',flexDirection:'column',flex:1,minWidth:0}}><TopBar .../><main style={{flex:1, padding:'24px 28px', background:'var(--surface)'}}>{children}</main></div></div>` inside `<MotionConfig reducedMotion="user">`.
5. Redirect targets stay as the old ones for now (login `/login`).

- [ ] **Step 5: Create a placeholder `app/v2/(recruiter)/dashboard/page.tsx`:**

```tsx
export default function V2DashboardPlaceholder() {
  return <h1 className="v2-title" style={{ fontSize: 24 }}>Dashboard</h1>;
}
```

- [ ] **Step 6: Verify + commit**

Run `npx tsc --noEmit` (expect clean re: new files). `git status` shows only the created/modified files above (no old-UI edits).
```bash
git add app/v2/"(recruiter)" components/ui-v2/Sidebar.tsx components/ui-v2/TopBar.tsx components/ui-v2/index.ts
git commit -m "feat(ui-v2): Azure app shell (Sidebar, TopBar, recruiter layout) + placeholder dashboard"
```

---

### Task 2: Dashboard primitives (Select, StatCard, Panel)

**Files:**
- Create: `components/ui-v2/Select.tsx`
- Create: `components/ui-v2/StatCard.tsx`
- Create: `components/ui-v2/Panel.tsx`
- Modify: `components/ui-v2/index.ts` (export all three)

**Interfaces:**
- Produces: `Select({ id, label, value, onChange, children })`, `StatCard({ label, value, deltaPct?, deltaLabel?, children? })`, `Panel({ title, actions?, children })`.

- [ ] **Step 1: Create `components/ui-v2/Select.tsx`:**

```tsx
export function Select({
  id, label, value, onChange, children,
}: { id: string; label?: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      {label && <label htmlFor={id} className="v2-label">{label}</label>}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="v2-field" style={{ appearance: 'auto', cursor: 'pointer' }}>
        {children}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/ui-v2/Panel.tsx`:**

```tsx
import type { ReactNode } from 'react';
import { Card } from './Card';

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 13, color: 'var(--ink)', margin: 0 }}>{title}</h3>
        {actions}
      </div>
      {children}
    </Card>
  );
}
```

- [ ] **Step 3: Create `components/ui-v2/StatCard.tsx`** (21st `stats-cards-with-links` pattern, retoned):

```tsx
import type { ReactNode } from 'react';
import { Card } from './Card';

export function StatCard({
  label, value, deltaPct, deltaLabel, children,
}: { label: string; value: string | number; deltaPct?: number | null; deltaLabel?: string; children?: ReactNode }) {
  const positive = (deltaPct ?? 0) >= 0;
  return (
    <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '13px 15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
          {deltaPct != null && (
            <span style={{ fontSize: 12, fontWeight: 600, color: positive ? 'var(--success, #15803d)' : 'var(--danger)' }}>
              {positive ? '+' : ''}{deltaPct}% {deltaLabel}
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
        {children}
      </div>
    </Card>
  );
}
```

(Add `--success: #15803d;` to `.v2` in `v2.css` if not present — used for positive deltas and status.)

- [ ] **Step 4: Export + verify + commit**

Add to `index.ts`: `export { Select } from './Select'; export { StatCard } from './StatCard'; export { Panel } from './Panel';`
Run `npx tsc --noEmit`.
```bash
git add components/ui-v2/Select.tsx components/ui-v2/StatCard.tsx components/ui-v2/Panel.tsx components/ui-v2/index.ts app/v2/v2.css
git commit -m "feat(ui-v2): Select, StatCard, Panel primitives"
```

---

### Task 3: KPI row + filter bar

**Files:**
- Create: `components/ui-v2/dashboard/DashboardFilterBar.tsx`
- Create: `components/ui-v2/dashboard/KpiRow.tsx`

**Interfaces:**
- Consumes: `Select`, `StatCard` (Task 2); `Sparkline` (`components/charts/Sparkline.tsx`, reused with an Azure color `#3b5fe3`); reused hooks `useDashboardTrend`, and the reused helpers/`DashboardFilterState` from the old filter bar.
- Produces: `DashboardFilterBar({ value, onChange, exams, candidates })`, `KpiRow({ summary, range })` (range from filter → trend days).

- [ ] **Step 1:** Create `components/ui-v2/dashboard/DashboardFilterBar.tsx` — the Azure chrome that IMPORTS the helpers from the old bar and renders exam/candidate/time controls on the v2 `Select` + native date inputs. Read the old `components/dashboard/DashboardFilterBar.tsx` for the exact control logic (timeMode switch, reset button via `isDefaultFilterState`) and reproduce the markup with v2 `Select` + `.v2-field` date inputs. Import `defaultFilterState, toAnalyticsFilters, isDefaultFilterState, describeTimeFilter, type DashboardFilterState` from `../../../components/dashboard/DashboardFilterBar` (do not re-implement them).

- [ ] **Step 2:** Create `KpiRow.tsx` — a 4-col grid of `StatCard`s for Total Candidates / Invitations Sent / Attempts In Progress / Pending Grading, each reading `summary.stats.*` and rendering a `Sparkline` from `useDashboardTrend(metric, RANGE_TO_TREND_DAYS[range])`. Port `RANGE_TO_TREND_DAYS`/`TREND_UNIT_LABELS`/`StatCard` delta computation (first vs last trend point) from the old `app/(recruiter)/dashboard/page.tsx` (mapped: `page.tsx:30,38,56-83`). Sparkline gets `color="#3b5fe3"`.

- [ ] **Step 3: Verify + commit** (`npx tsc --noEmit`; commit the two files).

---

### Task 4: Analytics panels (Azure recharts) + Question Health

**Files:**
- Create: `components/ui-v2/dashboard/AnalyticsPanels.tsx`

**Interfaces:**
- Consumes: reused `useFlaggedQuestions`; the `DashboardAnalytics` shape (from `lib/types.ts`); `Panel` (Task 2); recharts.
- Produces: `AnalyticsPanels({ analytics })` (4 panels: Score, Integrity donut, Throughput funnel+timing, Exam Quality table) and `QuestionHealthPanel()` (standalone, uses `useFlaggedQuestions`).

- [ ] **Step 1:** Port `components/dashboard/AnalyticsPanels.tsx` to the v2 file, keeping every data read identical (see the map: `ScorePanel` reads `data.scores`; `IntegrityPanel` `data.integrity`; `ThroughputPanel` `data.funnel`+`data.timing`; `ExamQualityPanel` `data.examQuality`+`data.questionDifficulty`; `QuestionHealthPanel` `useFlaggedQuestions()` with the `miskeyed`/`weak` derivation). Reskin rules:
  - Replace the old local palette `C` with Azure: bars/lines `#3b5fe3`, fail-band/high-concern `#b91c1c`, review `#a16207`, clear `#15803d`, grid/hair `#e2e8f0`, text `#0b1220`/`#64748b`.
  - Wrap each panel in the v2 `Panel` component; drop all `text-recruiter-*`/`bg-recruiter-*` classes for `.v2` tokens or inline styles.
  - Question Health links to `/questions/:id/edit` (interim old route).
  - Keep recharts `ResponsiveContainer`, tooltips (restyle tooltip to `var(--paper)`/`var(--hair)`).

- [ ] **Step 2: Verify + commit** (`npx tsc --noEmit`; commit).

---

### Task 5: Assemble the dashboard page

**Files:**
- Modify: `app/v2/(recruiter)/dashboard/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: reused `useDashboardSummary/useDashboardAnalytics/useExams/useCandidates`; the filter helpers; `KpiRow`, `DashboardFilterBar`, `AnalyticsPanels` + `QuestionHealthPanel`; `Panel`, `Card`.

- [ ] **Step 1:** Port `app/(recruiter)/dashboard/page.tsx` structure to the v2 page (mapped sections): title, filter bar, KPI row, analysis chips (when `!isDefaultFilterState`), analytics panels (load/error/empty gate) + Question Health below, Upcoming exams `Panel`, and the bottom 2-col grid ("Needs your attention" + "Recent activity"). Reuse the exact hooks + the "keep last summary while refetching" pattern (`page.tsx:95-109`). `activityIconFor` ported (`page.tsx:23`). Links interim (`/exams/:id/edit`, `/exams/new`, `/candidates`).

- [ ] **Step 2: Commit** (`git add app/v2/"(recruiter)"/dashboard/page.tsx; commit`).

---

### Task 6: Verification (controller)

- [ ] `npm run build` → success; `/v2/dashboard` in route list; no errors.
- [ ] Browser (controller): the shell renders (light Azure sidebar, active rail, top bar); dashboard shows its **loading/empty** states cleanly without a backend; both themes legible; the sidebar nav highlights Dashboard.
- [ ] Grep gates: no old-UI edits (`git diff --stat main...HEAD -- app/(recruiter) components/ui components/dashboard components/StaffSidebar.tsx components/StaffTopBar.tsx` → empty); product name via `BRAND` only.
- [ ] Review against `docs/brand/workfox-ui-review-checklist.md`.
- [ ] Note: full live-data render deferred to a session with the API + recruiter login.

---

## Self-Review

**Spec coverage:** shell (sidebar/topbar/layout) → Task 1; primitives → Task 2; KPI + filter (reused helpers) → Task 3; analytics panels (ported, Azure) → Task 4; page assembly + secondary cards → Task 5; verification (build, both themes, gates, checklist) → Task 6. Direction A (light sidebar, KPI row, panels + attention rail) realized across Tasks 1/3/5. shadcn base + collision convention in Global Constraints. Data reuse (no hook copies) enforced in constraints + Tasks 3/4/5. White-label accent-slot in Sidebar (Task 1) + primary buttons.

**Placeholder scan:** the two "port from old file X per these rules" tasks (layout, analytics panels) are faithful ports of proven code with explicit change-lists + data reads from the map — not vague placeholders. All genuinely-new primitives have full code.

**Type consistency:** `StaffNavItem` reused from the old sidebar; `Sidebar`/`TopBar`/`Select`/`StatCard`/`Panel` prop shapes defined in Tasks 1–2 and consumed in Tasks 3–5. Hook names match the map (`useDashboardSummary/Trend/Analytics`, `useFlaggedQuestions`, filter helpers). Interim link routes listed once in Global Constraints.
