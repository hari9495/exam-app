# Login & Profile Pages Motion & Token Redesign — Design

## Context

This is the final sub-project in this session's staff-portal motion & visual redesign initiative
(Recruiter → Card Grid Sort → Org Admin → Platform Admin → Interview Panel → Login/Profile). Unlike
the five prior sub-projects, the login/profile surfaces (`apps/web/app/login/**`,
`apps/web/app/profile/**`, `apps/web/app/forgot-password/**`, `apps/web/app/reset-password/**`,
`apps/web/components/ProfileForm.tsx`) never received the earlier structural/token redesign pass
that gave the consoles their `recruiter-*`/`status-*` design-token system and `CardGrid` list
treatment. This is not a Table→CardGrid conversion — these are standalone auth forms with no
lists — so the work here is narrower: finish the token migration these pages never got, and add
the same Framer Motion entrance polish already shipped everywhere else.

These pages already have more visual polish than the pre-redesign consoles did: Login, Forgot
Password, and Reset Password already share a split-screen layout (branding-gradient panel + white
form panel, icon-prefixed inputs), and `ProfileForm` already partially uses `recruiter-*` tokens
(`Card`, `text-recruiter-text`, `text-recruiter-text-secondary`). What remains is a mix of leftover
plain-gray classes alongside the token classes, and zero motion anywhere on these five files.

## Goal

Finish the token migration on these five files and add motion, matching the standard already set
by every other console this session — without any structural change (no new components, no new
backend calls, no layout restructuring).

## Scope

**In scope:**
- `apps/web/app/login/page.tsx`
- `apps/web/app/forgot-password/page.tsx`
- `apps/web/app/reset-password/[token]/page.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/components/ProfileForm.tsx`

**Explicitly out of scope:**
- No structural changes — same forms, same fields, same validation, same API calls, same routing.
- No new components, no new backend endpoints.
- No changes to any console layout or any other page.

## Design

### Token migration

Replace remaining plain-gray Tailwind classes with their `recruiter-*` equivalents (confirmed
against `apps/web/tailwind.config.ts`):

| Plain class | Token replacement |
|---|---|
| `text-gray-900` | `text-recruiter-text` |
| `text-gray-600` | `text-recruiter-text-secondary` |
| `text-gray-500` | `text-recruiter-text-tertiary` |
| `text-gray-400` | `text-recruiter-text-tertiary` |
| `hover:text-gray-600` (on a tertiary-colored element) | `hover:text-recruiter-text` |
| `border-gray-200` | `border-recruiter-border` |
| `bg-gray-50` | `bg-recruiter-bg-subtle` |

This touches: the `<h1>` page titles and description paragraphs on all three auth pages; the
password-toggle icon buttons (`Eye`/`EyeOff`) on Login, Reset Password, and `ProfileForm` (three
occurrences of the same `text-gray-400 hover:text-gray-600` pattern); and the Profile page's outer
shell (background, header border, Back link, loading text). Classes already on tokens
(`text-primary`, `text-status-danger`, `bg-status-danger-bg`, `ProfileForm`'s existing
`recruiter-*` usage) are untouched. The branding-gradient panel's `text-white`/`text-white/90`
classes are untouched — that's white-on-brand-color, not a semantic gray token.

### Motion

None of these four pages share a layout file (each is an independent top-level route), so each
page gets its own `<MotionConfig reducedMotion="user">` wrap around its returned JSX — built in
from the start, matching the proactive approach used on the last three consoles.

- **Login**: the form container (`<div className="w-full max-w-sm">`) gets a fade-up entrance
  (`initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`,
  `transition={{ duration: 0.3, ease: 'easeOut' }}`). The SSO link, which already only renders
  conditionally once `ssoEnabled` is confirmed, gets the same fade-up treatment so it doesn't pop
  in abruptly.
- **Forgot Password / Reset Password**: each page's ternary (`submitted`/`success` state vs. the
  form state) has its two branches individually wrapped in the same fade-up `motion.div` — so
  switching from the form to the confirmation message re-triggers the entrance, the same pattern
  already used for the interview panel's AI Insight conditional branches. No `AnimatePresence`,
  no exit transition — consistent with every other conditional-branch treatment this session.
- **Profile**: the two `Card`s inside `ProfileForm` ("My Profile", "Change password") get
  staggered fade-up entrance, delays `0` and `0.05`.

## Error Handling & Fallback

No new error states — all existing `error`/`nameError`/`passwordError` conditional renders and
their `role="alert"` markup are unchanged; motion wraps go around them, not inside their logic.

## Testing

- Existing tests (`login/page.test.tsx`, `forgot-password/page.test.tsx`,
  `reset-password/[token]/page.test.tsx`, `profile/page.test.tsx`) are expected to need no
  changes — token-class swaps and motion wraps have not broken any test anywhere else this
  session, since none of the existing assertions query by color class or DOM nesting depth.
  Verify at implementation time; only touch a test file if a real assertion breaks.
- No new tests required for the motion-only additions, matching this session's established
  precedent (no motion-specific tests anywhere in the codebase).
- Live browser verification pass for all four pages once implemented: Login (with and without
  SSO enabled for a test org), Forgot Password (both states), Reset Password (both states,
  requires a valid or expired token to exercise both branches), and Profile (both cards, name
  update, password change).
