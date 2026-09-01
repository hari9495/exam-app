# v2 Recruiter Dashboard + Azure App Shell — Design

**Date:** 2026-09-01
**Status:** Design draft, pending user review
**Depends on:** the Azure foundation (`app/v2/v2.css` `.v2` scope, `components/ui-v2/*`), `lib/brand.ts`, the brand guidelines + review checklist.

---

## 1. Goal and scope

Rebuild the **recruiter dashboard** in the v2 Azure language, and with it the **reusable staff app shell** (left sidebar + top bar) that every future staff console screen will sit inside. This is a **reskin**: all data/logic is reused unchanged; only presentation is new. The old `(recruiter)` console is untouched.

**In scope:** a v2 recruiter route group with the Azure shell (auth gate, role-based nav, org branding) and the full dashboard (KPI cards, filter bar, analytics panels, upcoming/attention/activity cards). New v2 primitives the dashboard needs (`Select`, `StatCard`, `Panel`).

**Out of scope:** the other recruiter pages (exams, candidates, etc. — later, each its own screen), the org-admin/panel/platform consoles, any change to the old UI or to the dashboard's data/API.

## 2. Decisions

| Decision | Choice |
|---|---|
| Shell nav | **Left sidebar** (not top-nav). The recruiter nav has 10 items, super-admin 17 — too many for a horizontal bar. The Azure mock's top-nav was illustrative with few items. |
| Sidebar look | Azure **light** sidebar (paper/surface ground, hairline right border), not the old brand-navy. Active item = accent text + accent-tint bg + a 3px accent left rail. Org identity at top; Workfox mark subtle at the foot. |
| Data/logic | **Reused unchanged** — `useDashboardSummary/Trend/Analytics`, `useFlaggedQuestions`, and the `DashboardFilterBar` helpers (`defaultFilterState`, `toAnalyticsFilters`, `isDefaultFilterState`, `describeTimeFilter`) are not UI-coupled; import them directly. No v2 copy of the hooks. |
| Charts | Reuse `Sparkline` (pass Azure color). Re-implement the analytics panels' recharts with an Azure palette in a v2 component (the old `AnalyticsPanels` is class-coupled to `recruiter-*`; we write `components/ui-v2/dashboard/AnalyticsPanels.tsx` fresh, same data reads). |
| White-label | Org color drives the **accent slot** (`--org-primary`): sidebar active state, primary buttons, focus. Status/integrity colors stay semantic. Workfox is the platform mark. |
| Route | `app/v2/(recruiter)/dashboard` → URL `/v2/dashboard` (route group adds the shell without a URL segment). |

## 3. Architecture

```
app/v2/
  (recruiter)/
    layout.tsx        # NEW — Azure shell wiring (auth gate, role→nav, branding vars, Sidebar+TopBar)
    dashboard/
      page.tsx        # NEW — the dashboard (reskin of the old page)
components/ui-v2/
  Sidebar.tsx         # NEW — Azure left sidebar (presentational)
  TopBar.tsx          # NEW — Azure top bar (presentational)
  Select.tsx          # NEW — Azure native-select primitive
  StatCard.tsx        # NEW — KPI card (icon chip, value, %-change badge, sparkline slot)
  Panel.tsx           # NEW — titled content panel (card with header)
  dashboard/
    AnalyticsPanels.tsx  # NEW — Score/Integrity/Throughput/ExamQuality + QuestionHealth, Azure recharts
    DashboardFilterBar.tsx # NEW — filter chrome on v2 Select (imports the OLD helpers, not copies)
```

- `app/v2/(recruiter)/layout.tsx` replicates `app/(recruiter)/layout.tsx`'s wiring: `useAuth` gate (redirect to `/login` if no token; wrong-console redirect via `staffLandingPath`), role→nav (`RECRUITER_NAV_ITEMS` vs `SUPER_ADMIN_FULL_NAV` from `lib/*-nav.ts`, reused), `useOrgBranding` + `useDocumentBranding`, `useCurrentUser`, `--org-primary/--org-on-primary` injected on the shell root, `MotionConfig reducedMotion="user"`. It renders `<Sidebar> + (<TopBar> over <main>)`.
- The v2 root layout (`app/v2/layout.tsx`) already provides `.v2` + tokens; the recruiter group nests inside it.
- **Nav reuse:** the existing `StaffNavItem[]` arrays are reused verbatim; only the rendering (Sidebar) is new.
- **Filter helpers reuse:** `DashboardFilterBar.tsx` (v2) imports `defaultFilterState/toAnalyticsFilters/isDefaultFilterState/describeTimeFilter` from the existing `components/dashboard/DashboardFilterBar.tsx` (they're exported and UI-agnostic) rather than duplicating them — the v2 file is only the Azure chrome.

## 4. The dashboard (sections, all reskinned; data reads identical)

1. **Header** — "Dashboard" title.
2. **Filter bar** — exam / candidate / time-period (relative·month·year·custom), Reset when non-default. On v2 `Select` + native date inputs. State stays local (as today).
3. **KPI row** — 4 `StatCard`s: Total Candidates, Invitations Sent, Attempts In Progress, Pending Grading. Each: icon chip, value, %-change badge (first vs last trend point), `Sparkline`. One `useDashboardTrend` per card (unchanged).
4. **Analysis chips** — shown when filters ≠ default (selected exam/candidate + `describeTimeFilter`).
5. **Analytics panels** — Score, Integrity (donut), Throughput (CSS funnel + timing), Exam Quality (table + most-missed) in a 2×2 grid, gated on analytics load/empty; **Question Health** panel below (uses `useFlaggedQuestions`, filter-independent). Azure recharts palette.
6. **Upcoming exams** card — `summary.upcomingExams`, links to `/v2/exams/:id/edit` (or old route until those screens exist — see §7).
7. **Bottom grid** — "Needs your attention" (pending grading, proctoring flags, stale invitations + quick actions) and "Recent activity" (icon-by-keyword list).

## 5. New v2 primitives

- **`Select`** — a native `<select>` styled to match `.v2-field` (38px, hair border, 6px radius, accent focus). Native = accessible + keyboard-correct. Props: `{ id, label, value, onChange, children }`.
- **`StatCard`** — `{ label, value, icon, deltaPct?, accent?, children? }`; renders icon chip, big value (Bricolage/tabular), delta badge (green/red semantic), and a slot for the sparkline. `Card`-based.
- **`Panel`** — `{ title, actions?, children }`; a `Card` with a header row. Used by every analytics panel + the upcoming/attention/activity cards.

## 6. White-label + theming

Org branding injects `--org-primary/--org-on-primary` on the shell root (as the old layout does). The accent slot (sidebar active rail, primary buttons, focus rings) re-tints to the org color; status/integrity colors never do. Both themes (light + flat-navy dark) via the `.v2` tokens. Sidebar in dark = flat navy surface with hairline separators.

## 7. Cross-route links (interim)

The old dashboard links to `/exams/:id/edit`, `/candidates`, `/exams/new`, `/questions/:id/edit`. Those v2 screens don't exist yet. **Decision:** v2 dashboard links point at the **existing (old) routes** for now (e.g. `/exams/new`), so actions work; they get repointed to `/v2/*` as each screen is rebuilt. Flagged so it's a conscious interim, not a bug.

## 8. Behavior unchanged

Same hooks, same query keys, same filter→analytics bridge, same "keep last summary while refetching" pattern, same role-based nav and auth gate. This is presentation-only.

## 9. Verification (note the data/auth limitation)

- **Production build** discovers `/v2/dashboard`; tsc clean; review-checklist pass.
- **Auth/data caveat:** the shell's auth gate redirects to `/login` without a token, and the panels need the API for real data. So browser verification without a running backend + logged-in recruiter is limited to: the shell chrome renders, and the dashboard's **loading/empty/error states** render. Full live-data verification is deferred to a session with the API up and a recruiter login. The build + tsc + review are the authoritative gates here; the reviewer verifies data reads match the map's contract.
- Both themes checked on whatever renders; old recruiter console + login verified untouched.

## 10. Non-goals

No changes to the old `(recruiter)` console, the dashboard API, or other consoles. No new charts library. No URL-synced filters (kept local, as today) unless requested.

## 11. Build order (→ implementation plan)

1. Azure shell: `Sidebar`, `TopBar` primitives + `app/v2/(recruiter)/layout.tsx` (auth/nav/branding wiring) + a placeholder dashboard page to verify the shell renders + gates.
2. Dashboard primitives: `Select`, `StatCard`, `Panel`.
3. KPI row + filter bar (v2) wired to the reused hooks/helpers.
4. Analytics panels (v2, Azure recharts) + Question Health.
5. Assemble the full dashboard page (upcoming / attention / activity) + interim cross-links.
6. Verification pass.
