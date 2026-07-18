# Staff Logout Button — Design

## Problem

`POST /auth/logout` (revokes the refresh token, clears the cookie) and the frontend's `useAuth().logout()` (calls that endpoint, clears the in-memory access token and the `organizationSlug` session-storage entry) both already exist and work. Nothing in the UI calls `logout()`. A logged-in staff user (recruiter, org_admin, or panel) currently has no way to end their session except manually clearing cookies/storage.

## Scope

Add a working logout control to all three staff shells: recruiter, org-admin, and panel layouts (`apps/web/app/(recruiter)/layout.tsx`, `apps/web/app/(org-admin)/layout.tsx`, `apps/web/app/(panel)/layout.tsx`).

Recruiter and org-admin already share an identical sidebar-footer pattern from their recent redesigns: a bottom row with an avatar-initials circle, a name line, and a role line. Panel's layout predates that redesign and has no footer or user-identity block at all — just a bare nav list on a plain gray sidebar.

**Panel gets the same footer treatment as part of this work**, not just a bare logout link, so all three consoles look consistent. This mirrors the same avatar/name/role structure already in recruiter and org-admin, including their established `ponytail:`-marked fallback (`useAuth()` has no `userName` field yet, so the name renders a hardcoded per-role fallback — "Recruiter", "Org Admin", "Panel" — rather than widening the auth contract, which is out of scope here).

## Design

**Placement:** A small icon-only button sits inline in the footer row, next to the existing avatar/name block — not a separate full-width row, not a dropdown menu. This keeps the footer's height unchanged and matches the dense, icon-driven language already used throughout the nav (16px lucide icons on every nav item).

**Icon:** `LogOut` from `lucide-react` (already a project dependency, used elsewhere for nav icons), sized 16px to match the nav items.

**Markup:** A plain `<button>` element (not the shared `Button` component — nav items in these layouts already use raw styled elements rather than `Button`, which is a full padded/colored component meant for form actions, not compact nav chrome). Include `aria-label="Log out"` since the icon carries no visible text label (accessibility, and gives Playwright/RTL tests a stable selector that can't collide with anything else on the page).

**Behavior on click:**
```
async function handleLogout() {
  await logout();       // from useAuth() — already handles the API call + local state clearing
  router.push('/login');
}
```
No confirmation dialog. Logging out is safe and reversible (no data loss), so a confirm step is unwarranted friction. `logout()` already swallows its own API-call failure (`.catch(() => undefined)` in `auth-context.tsx`) so this always proceeds to redirect even if the network call fails.

**Destination:** All three roles redirect to `/login` — the same shared staff login page each layout already redirects unauthenticated users to.

## Files touched

- `apps/web/app/(recruiter)/layout.tsx` — add the button to the existing footer
- `apps/web/app/(org-admin)/layout.tsx` — add the button to the existing footer
- `apps/web/app/(panel)/layout.tsx` — add the footer block (new, matching the other two's structure) plus the button
- Existing layout test files (or new ones if none exist yet for panel) — one test per layout asserting the logout button calls `logout` and navigates to `/login`

## Out of scope

- Confirmation dialog
- Dropdown/menu on the identity block
- A profile/account page (tracked separately)
- Widening `useAuth()` to carry a real display name (existing `ponytail:` fallback pattern is reused as-is)
