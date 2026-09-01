# Workfox Brand Guidelines — Design

**Date:** 2026-08-31
**Status:** Design approved in chat, pending spec review
**Author:** hari (with Claude)
**Depends on:** `docs/superpowers/specs/2026-08-31-ui-v2-login-design.md` (C1 tokens, v2 scaffolding)

---

## 1. Context and goal

The v2 UI rebuild (C1 editorial language, `/v2/login` shipped) needs brand guidelines before
more surfaces are built, so each surface follows rules instead of re-deciding them. The v2
product is renamed: **Workfox** (working name) replaces "Prudent Hire" for everything v2,
**with its own new mark** — PrudentMark and the "Prudent Hire" name remain only in the old,
untouched UI.

Deliverable: **full brand guidelines** — identity + product design system — as **one source
of truth with two renderings**:
1. `/v2/brand` — a living route in the app rendering the real tokens and real ui-v2
   components (cannot drift from code).
2. A polished shareable document (published artifact, updateable at a stable URL) generated
   from the same content, for clients/designers.

## 2. Decisions locked

| Decision | Choice |
|---|---|
| Product name (v2) | **Workfox** — status: working name, may change; defined as a label, never hardcoded prose |
| Company name | Prudent Consulting (legal/footer contexts) |
| Logo (v2) | **New Workfox mark** — working mark designed in this project; PrudentMark retired from all v2 surfaces |
| Scope | Full guidelines: identity (voice, logo, naming) + product design system |
| Format | Both renderings, single content source |
| Visual language | **Workfox Azure — ATS edition** (chosen 2026-09-01, supersedes C1 editorial): based on 21st.dev "Azure Pro" tokens — white / slate-950 ink `#0b1220`, azure `#3b5fe3` primary, slate-100 surfaces, slate-200 hairlines, 6px radii, flat `#0b1220` dark mode with `#3b82f6` primary. Bricolage Grotesque display (job/page titles, eyebrows) + Hanken Grotesk UI/body (General Sans noted as an optional future swap — Fontshare, self-hosted; not adopted now). Craft motifs: data-true funnel meters, score rings, red attention rail on flagged items, mono (IBM Plex Mono) for serials/counts/clocks, drafting-dot board ground, timeline rails. Modern-team chrome: ⌘K search, avatar stacks, activity feeds (visual direction; features only as they exist). |
| White-label rule | The azure primary is the platform **accent slot**; an org's `--org-primary` replaces the slot wholesale on org-branded surfaces — platform and org chroma never coexist. Status/integrity colors stay semantic and are never overridden. |
| C1 editorial | Retired as product direction. The shipped `/v2/login` (C1) gets **retoned to Azure tokens** as part of this project; C1 remains only in git history. |
| 21st.dev | Source of the adopted theme (Azure Pro by @serafimcloud); also sources components for the guideline pages |

## 3. The name as a label (code)

- `apps/web/lib/brand.ts` — single constant module:
  ```ts
  export const BRAND = {
    productName: 'Workfox',        // working name — single point of change
    companyName: 'Prudent Consulting',
    productNameStatus: 'working',  // flips to 'final' when the name is confirmed
  } as const;
  ```
- Every v2 surface renders the name from `BRAND.productName`. No v2 file may contain the
  literal string "Workfox" outside `lib/brand.ts` (enforced by a grep check in verification).
- Follow-up edit inside v2 (allowed — v2 is ours): `/v2/login`'s kicker changes from the
  hardcoded "Prudent" to `BRAND.productName`.
- The old UI keeps "Prudent Hire" / PrudentMark untouched, per the standing constraint.

## 4. The Workfox mark (working logo)

No mark exists; this project creates a **working mark**, statused like the name:
- **Wordmark:** "Workfox" set in Bricolage Grotesque (weight 600, tight tracking) — the
  primary identity in v2 UI.
- **Monogram:** a simple geometric "W" mark (SVG, single color, works at 16px favicon size
  and on dark/light/org-colored grounds) for compact contexts (favicon, sidebar-collapsed,
  watermark).
- Both are components: `components/ui-v2/WorkfoxMark.tsx` (monogram) and wordmark styles;
  color inherited via `currentColor` so they follow tokens and white-label contexts.
- The guidelines' Logo chapter documents: clear space, minimum sizes, on-light/on-dark/on-org
  color behavior, misuse examples — written against the working mark.
- **Open item:** a professionally designed final mark can replace the working mark later;
  because usage is via the `WorkfoxMark` component, replacement is one file.

## 5. The book — chapters (content source)

Guideline content lives as structured data + prose in `apps/web/app/v2/brand/content/`
(one file per chapter), consumed by the living route; the shareable doc renders the same
content. Chapters:

1. **Foundations** — mission, personality, the Workfox Azure philosophy (professional polish,
   detail over decoration, data-true ornament, semantic color discipline). **Naming** section:
   Workfox (product, working name) vs Prudent
   Consulting (company) vs org names; when each appears. White-label stance: on candidate
   surfaces the org speaks; Workfox appears only where the platform speaks (staff login,
   footers, "sent via Workfox" in emails).
2. **Voice & tone** — precise, calm, direct: an invigilator, not a cheerleader. Short
   sentences; no exclamation marks in system copy; state the fact, then the next step. Warm
   register for candidate-facing copy, institutional for staff-facing. Do/don't rewrite
   examples for buttons, errors, empty states, emails.
3. **Logo** — the Workfox wordmark + monogram, per §4.
4. **Color** — brand palette; product tokens (Azure set: white/slate ink/azure primary/slate
   surfaces + flat navy dark set, codified in `v2.css`); status-color semantics (green clear,
   amber review, red flag — never overridden); **the accent-slot white-label rule** (azure is
   the platform slot; org color replaces it wholesale on branded surfaces).
5. **Typography** — Bricolage display scale (job/page titles, eyebrows) + Hanken UI scale
   (labels 12/600, body 13–14, helper 11–12.5); IBM Plex Mono for serials, counts, clocks;
   tabular figures for all data.
6. **Components** — ui-v2 primitives rendered live with usage rules; the 21st.dev intake
   standard: retone to tokens, never drop in raw; no hardcoded brand colors.
7. **Motion & interaction** — the one-fade principle, spring taps, reduced-motion always
   honored, focus visibility rules.
8. **Email & marketing basics** — type/color/voice for transactional email and simple
   marketing pages; "sent via Workfox" attribution rule.

## 6. The two renderings

- **`/v2/brand` (living):** new route in the existing `app/v2/` group, using the `.v2`
  tokens. Chapter nav; token swatches read from the real CSS variables; component examples
  render the real ui-v2 components; do/don't blocks. Internal reference — not linked from
  product nav yet.
- **Shareable doc (artifact):** a self-contained polished page with the same chapters,
  published as an updateable artifact. Regenerated manually when content changes (content
  source in repo is authoritative; the doc states its generated-from commit).

## 7. Out of scope / non-goals

- No change to any old-UI surface (PrudentMark, "Prudent Hire" remain there).
- No final logo design engagement — working mark only.
- No print/social/imagery library (imagery direction gets one page of principles, not assets).
- No enforcement tooling beyond the "Workfox literal" grep check.

## 8. Verification

- `/v2/brand` present in a production build's route list (Next 16 caution — build, not dev).
- Browser smoke light + dark: swatches, wordmark/monogram on all grounds, component examples.
- Grep check: no "Workfox" literal outside `lib/brand.ts`; no PrudentMark import anywhere
  under `app/v2/**` or `components/ui-v2/**`.
- v2 login still renders correctly with the kicker now sourced from `BRAND.productName`.
- Isolated jest runs only (machine constraint), for any logic worth testing (brand constants
  need no test; the mark component gets a render smoke only if it has logic).

## 9. Build order (each its own reviewable chunk)

1. **Azure token codification**: rewrite `app/v2/v2.css` from C1 values to the Workfox Azure
   set (light + flat-navy dark), keeping the same custom-property names where meanings map
   (`--paper`→surface, `--ink`, `--hair`, accent slot); retone the existing ui-v2 primitives
   and `/v2/login` onto them (login layout unchanged, colors/shapes retoned; underlined fields
   become Azure bordered fields).
2. `lib/brand.ts` + `WorkfoxMark` working mark + v2 login kicker switch.
3. Chapter content files (the book's text — the biggest chunk, reviewed as prose).
4. `/v2/brand` living route rendering content + real tokens/components.
5. Shareable artifact doc generated from the same content.
6. Verification pass (production build; both themes; grep checks; login still works retoned).
