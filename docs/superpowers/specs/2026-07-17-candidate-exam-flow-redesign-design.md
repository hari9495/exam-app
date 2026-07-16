# Candidate Exam Flow Redesign — Design Spec

## Context & Scope

The candidate exam flow (`apps/web/app/(candidate)/`: start, welcome, exam, submitted, session-ended) is functionally complete but visually undeveloped. It runs on stock Tailwind defaults — no font stack beyond system-ui, a two-color palette (`#1a73e8`/`#fbbc04`) that isn't even used by the candidate surface, no type scale, no elevation/radius system. The candidate-specific "Calm Focus" palette (sage green `#2F6F5E`, off-white `#F4F7F6`) exists in `tailwind.config.ts` but was applied inconsistently, loading/error states are unstyled one-line text, and icons are unicode glyphs (◉/○, ★/☆, ⏱).

Separately, the webcam-proctoring feature (`docs/superpowers/specs/2026-07-16-webcam-proctoring-design.md`) specced a warning/block overlay UI that was never actually built — `useWebcamMonitor` exists as a headless hook (confirmed: not imported anywhere under `apps/web/app`) and fires violations to the backend with zero visual feedback to the candidate. This spec closes that gap as part of the same pass, since designing new proctoring UI and redesigning the screen it sits on top of are the same piece of work.

**In scope**: visual redesign of all 5 candidate routes + the missing webcam warning/block overlays + the submit confirmation/error modal.
**Out of scope**: recruiter console, org-admin console, interview panel (separate future passes, not addressed here). Full mobile-optimized layouts (see Responsive Approach below — desktop stays primary).

## Visual Direction

**"Testing-platform standard"** — utilitarian but professional, closer to HackerRank/Codility than a marketing-site aesthetic: clear status colors, denser information display over generous whitespace, real hierarchy through type weight/size rather than decoration.

**Palette**: keep the existing sage-green identity (`#2F6F5E`) as the single brand accent — it's distinctive and already chosen deliberately. Layer in what's currently missing:

| Token | Value | Use |
|---|---|---|
| `candidate.primary` | `#2F6F5E` | existing — brand accent, primary actions, "answered"/"success" states |
| `candidate.primary-light` | `#F0F7F4` | existing — selected/active backgrounds |
| `candidate.bg` | `#F4F7F6` | existing — page background |
| `candidate.review` / `review-bg` / `review-border` | `#B8860B` / `#FBF3DD` / `#E8D8A8` | existing — repurposed as the shared amber/warning tier (marked-for-review AND mid-timer AND proctoring warnings — one amber, three uses) |
| `candidate.danger` | `#B23B3B` | **new** — error text/icons |
| `candidate.danger-bg` | `#FBEAEA` | **new** — error backgrounds, red timer/block states |
| `candidate.danger-border` | `#F0C9C9` | **new** — error section borders |
| `candidate.border` | `#E4E7E5` | **new** — neutral card/divider borders (currently relies on default gray-200) |
| `candidate.text` / `text-secondary` / `text-tertiary` | `#1A1F1D` / `#57615B` / `#6B7570` / `#9AA5A0` | **new** — a real text-color scale instead of ad hoc gray-900/gray-600/gray-500 |

Reusing the existing amber "review" tokens for the timer's mid-state and the proctoring warning overlay (rather than inventing a fourth color) keeps the palette to three semantic tiers total: green (good/primary), amber (caution), red (danger) — consistent everywhere they appear.

**Typography**: no new font — keep the system-ui stack (fast, no FOUT/licensing, and a testing-platform aesthetic doesn't need a display font). Introduce a real scale instead of arbitrary one-off sizes: 11px (eyebrow/label, uppercase, 700 weight), 12–13px (body/meta), 14px (interactive text — buttons, options), 15–16px (card/section titles), 19px (screen title). This replaces the current mix of `text-sm`/`text-lg`/`text-xl` applied without a consistent scale.

**Icons**: add `lucide-react` (already the de facto standard alongside Tailwind; zero design decisions needed, tree-shakeable). Replaces every unicode glyph currently in the flow:

| Current glyph | Lucide icon | Used in |
|---|---|---|
| ⏱ | `Clock` | timer badge |
| ◉ / ○ | *(stays a custom radio dot, not an icon — see mockup)* | MCQ options |
| ★ / ☆ | `Bookmark` | mark-for-review toggle |
| ▶ | `Play` | Run code button |
| ✓ | `Check` / `CheckCircle2` | success states, submitted screen |
| ✕ | `X` / `XCircle` | error states, denied camera |
| ⚠ | `AlertTriangle` | proctoring warning overlay |
| ⛔ | `ShieldAlert` | proctoring block overlay |
| (camera dot) | `Video` / `VideoOff` | welcome-screen camera preview |
| ◷ | `Clock` (reused) | session-ended, exam-window meta |
| ▤ | `ListChecks` | question-count meta |

**Elevation & shape**: cards use `border` (`candidate.border`) + `shadow-sm`, `rounded-lg` (8px) for cards/sections, `rounded-md` (6–7px) for buttons/inputs, fully-round (`rounded-full`) for pills/badges/timer-bar. Modals/overlays get a stronger `shadow-lg`-equivalent (`0 8px 28px rgba(0,0,0,.18)`) and a dimmed backdrop — `rgba(26,31,29,.4)` for dismissible states, `rgba(26,31,29,.55)` for the non-dismissible block overlay (visually reads as "more locked").

## Responsive Approach

Desktop-first, confirmed with the user: webcam proctoring effectively requires a laptop/desktop camera setup anyway, so desktop is the realistic target. The existing `lg:` breakpoint swap (sidebar navigator ↔ mobile bottom-drawer) is kept structurally as-is — it gets the same token/color/icon updates as everything else, but no dedicated mobile-specific layout work is invested beyond "doesn't visually break."

## Screen-by-Screen Design

All mockups referenced below were built and approved interactively via the brainstorming visual companion; this section is the written record of what was confirmed.

### 1. Exam page — main layout

Top bar: exam name (left) + timer badge (right) only — no progress-completion bar (rejected in favor of keeping the top bar minimal; completion status lives in the sidebar instead). Below the top bar's main row, a **3-stage timer bar** (see below).

Two-column body: question card (flex-1) + a 200px sidebar containing the question-number grid navigator **with an explicit color legend** (previously: four visually-distinct cell states with no legend explaining them). Legend: green solid = answered, amber = marked for review, light gray = not answered. "Review & submit" button anchors the bottom of the sidebar.

MCQ options: bordered rows with a real two-state radio dot (not unicode), selected state = primary-colored border + `primary-light` background fill.

### 2. Timer bar — 3-stage color

A slim (5px) horizontal bar beneath the top bar's title/timer row, depleting left-to-right as time elapses, color-coded by time remaining:

- **Green** (`candidate.primary`) — above 50% time remaining.
- **Amber** (`candidate.review` tier) — 15%–50% remaining.
- **Red** (`candidate.danger` tier) — below 15% remaining.

The timer badge text switches color in lockstep with the bar (amber/red backgrounds matching `review-bg`/`danger-bg`). Thresholds (50% / 15%) and exact colors were confirmed via mockup.

### 3. Webcam proctoring overlays (new — closes the gap where `useWebcamMonitor` fires violations with no UI)

**Warning overlay** (strikes 1–2, dismissible): centered panel over a dimmed/blurred exam page. Amber icon circle (`AlertTriangle`), title naming the specific violation (e.g. "Face not visible"), a strike-dot indicator (n of 3 filled red), explanatory copy, and a "Continue exam" primary button that calls the existing `webcam-resume` endpoint.

**Block overlay** (strike 3, non-dismissible): same panel shape, red icon circle (`ShieldAlert`), stronger backdrop dimming, all 3 strike-dots filled, no action button — instead a "Waiting for proctor · checking every 10s" status pill communicating the client is polling, plus a reassurance line that the timer is paused (not silently burning the candidate's time while blocked).

Both overlays sit on top of the exam page per the existing pause/block state machine from the webcam-proctoring spec — this spec only defines their visual treatment; the state transitions, polling behavior, and endpoints are unchanged from that spec.

### 4. Code question panel

Editor chrome switches from a bare Monaco instance to a dark header bar (language badge + filename) matching Monaco's own default dark theme, so the editor doesn't visually clash with the light candidate UI around it. Below the editor: a toolbar row (stdin input, "Run code" button with `Play` icon, runs-remaining counter — e.g. "27 runs left", surfacing the existing 30-run cap that currently has no visible indicator). Output renders in a structured card: a status badge (green ✓ exit-0 / red ✕ nonzero) plus run duration, then stdout/stderr in monospace with stderr specifically colored red — replacing the current single plain gray box that doesn't visually distinguish stdout from stderr from a timeout message.

### 5. Welcome screen

Adds a real camera-preview treatment tied to the actual proctoring camera check (see Technical Notes — this also fixes a structural gap in the current code) instead of a disconnected `getUserMedia` permission probe: a small live-preview-style box that reads "Camera connected" (green, filled dot) once granted, or flips to a red-tinted section with "Camera access blocked" + a "Retry camera access" button when denied. Instructions and the monitoring disclosure each get their own labeled section (bordered box + uppercase label) instead of being loose paragraphs. Start button stays disabled until camera access is granted.

### 6. Terminal screens (start-loading, start-error, submitted, session-ended)

All four converge on one pattern: centered card, icon circle (spinner/check/x/clock) + title + one line of body copy. No buttons — confirmed with the user these stay intentionally dead-end (there's nowhere useful to route a candidate from an ended/submitted session). This is purely a visual consistency fix; no behavior changes.

### 7. Submit confirmation / submit-error modal

Confirm-submit now shows an answered/marked-for-review/unanswered count breakdown (three small stat tiles) instead of a plain "are you sure?" sentence, so a candidate can see exactly what they're locking in before confirming. Submit-error state reassures that progress is saved server-side and offers a single "Try again" action colored to match the danger tier.

## Technical Notes for Implementation Planning

These are structural findings from the design pass that the implementation plan needs to account for — not fully specified here, since that's writing-plans' job:

- **`useWebcamMonitor` is currently unwired.** It exists (`apps/web/lib/hooks/useWebcamMonitor.ts`) but isn't mounted anywhere under `apps/web/app`. The exam page only mounts `useProctoringMonitor` (browser-event monitor). Building the warning/block overlay UI means actually mounting `useWebcamMonitor` on the exam page and wiring its violation state to the new overlay components — this is functional work, not just visual, even though it's motivated by this design pass.
- **Welcome page's camera check is currently a throwaway probe.** `welcome/page.tsx` (lines 35-44) does its own standalone `getUserMedia({video:true})` check purely to gate the Start button, disconnected from whatever `useWebcamMonitor` needs when the exam page mounts it. The redesigned welcome screen's camera-preview box should become the actual entry point for camera setup — one source of truth — rather than a check-then-discard probe followed by a second, separate camera acquisition on the exam page.
- **New shared components** (per the hybrid build approach — token layer + only genuinely-reused primitives): a `TimerBar` (3-stage color logic driven by remaining-time fraction), a `ProctoringOverlay` pair (warning/block, sharing a base panel layout), a `CodeOutputPanel` (status badge + stdout/stderr rendering), a `TerminalCard` (icon-circle + title + body, used by all 4 terminal screens), and a `SubmitConfirmModal` (stat-tile breakdown). `CandidateButton` and `QuestionNavigator` get updated, not replaced.
- **New dependency**: `lucide-react`.
- **Tailwind config**: extend `candidate.*` tokens with `danger`/`danger-bg`/`danger-border`/`border`/text-color scale (table above). No new font, no new build tooling.

## Testing

- **Frontend unit**: `TimerBar` threshold logic (green/amber/red boundaries at 50%/15%), `TerminalCard` renders correct icon/title/body per screen, `SubmitConfirmModal` stat breakdown reflects actual answered/review/unanswered counts, `CodeOutputPanel` status badge color follows exit code.
- **Frontend unit (webcam wiring)**: `useWebcamMonitor` mounted on the exam page drives the warning overlay at strikes 1-2 and the block overlay at strike 3 (mocked hook state — no real camera in tests, consistent with the existing webcam-proctoring spec's test approach).
- **Playwright**: extend the existing candidate golden-path spec to assert the redesigned screens render their key elements (timer bar present, sidebar legend present, submit modal shows stat breakdown) — visual regression/pixel-level testing is out of scope, this confirms structure and behavior only.
- No backend changes are anticipated by this spec (pure frontend + wiring an existing unused hook), so no backend test changes expected beyond what the webcam-proctoring spec already covers.
