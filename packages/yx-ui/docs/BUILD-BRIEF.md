# Builder brief — @yukthix/ui (read fully before writing code)

You are building one family of components for the YukthiX design system package in this folder
(`C:\Users\HariSivaSaiKumarMada\Downloads\YukthiX HR Product Design 1\yukthix-ui`).
Other builders are working in parallel on other families. **Only create or edit the files you are assigned.**

## Read first (15 minutes max)
- `..\YukthiX\brand\DESIGN-SYSTEM.md` — the sections named in your assignment, plus §0 (banned list), §3 (colour meanings), §15 + §15a (button rules), §26 (data states), §34 (writing), §35 (formats), §36 (accessibility).
- `src/styles/tokens.css` — every colour, size, radius, shadow, duration you may use.
- Existing components to REUSE (do not re-implement): `src/components/*.tsx`
  - foundations: Text, Heading, Figure, Icon (Lucide, 1.5 stroke), Kbd, Spinner, VisuallyHidden
  - button: Button (primary | secondary | danger; sizes sm/md/lg; icon; loading; asChild), IconButton (ghost | secondary, label required → tooltip), ButtonGroup, SplitButton, Link
  - menu: Menu, MenuTrigger, MenuContent, MenuItem (icon, destructive, shortcut), MenuCheckboxItem, MenuLabel, MenuSeparator
  - popover: Popover, PopoverTrigger, PopoverAnchor, PopoverContent · tooltip: Tooltip
  - field: Form, FormField, FormSection, FieldRow, ErrorSummary, StickySaveBar, useFieldControl, useUnsavedChangesGuard
  - inputs: TextField, TextArea, PasswordField, NumberField, CurrencyField, MaskedField, TimeField
  - choice: Checkbox, RadioGroup, Switch · select: Select, Combobox, MultiSelect, PersonPicker · date: DatePicker, DateRangePicker · upload: FileUpload
  - display: Badge (neutral|success|warning|danger|info|ai), AiBadge, Tag, Avatar, AvatarGroup, PersonLabel
  - feedback: InlineAlert, EmptyState, ErrorState, NoAccessState, Skeleton, Meter, Pagination
  - drawer: Drawer · filters: FilterBar, SavedViewMenu · table: DataTable · timesheet: TimesheetGrid
  - lib: `lib/format.ts` (formatINR, groupIndian, formatDate, parseDate, formatTime, initials…), `lib/table.ts`, `lib/cx.ts`
- Look at `src/components/table.tsx` + `data.css` + `src/stories/table.stories.tsx` as the quality bar.

## Hard rules (a reviewer will reject work that breaks any)
1. **Tokens only.** In CSS use `var(--yx-…)` semantic/component tokens. No hex, rgb(), hsl(), no primitive tokens (`--yx-azure-500`, `--yx-slate-…` etc.), no px except 0/1px/2px. Chart series colours: `var(--yx-chart-1)`…`var(--yx-chart-8)`. If you truly need a size that has no token, compute it from tokens with calc() (e.g. `calc(var(--yx-space-16) * 4)`). Inline `style` in TSX may use numbers for computed geometry (chart SVG, positions) but never colours — colours come from CSS classes/tokens.
2. **Banned (§0):** gradients, glass/backdrop blur, hover lift/translate/glow, pill-shaped buttons, emoji, sparkle icons (AI = the text `AiBadge` only), decorative animation, centred marketing heroes, vague copy ("Oops!", "Something went wrong"). Motion only with the duration tokens; honour reduced motion.
3. **Buttons (§15, founder rule):** every button with a text label is `Button` primary/secondary/danger — never borderless. One primary per view. Borderless only for icon-only buttons (`IconButton` with `label`). Destructive = danger + confirmation. Verb-first sentence-case labels ("Approve", "Add shift"), never "Submit"/"OK"/"Click here".
4. **Accessibility (WCAG 2.2 AA):** real roles and labels, full keyboard use, visible focus (2 px focus ring token), targets ≥ `--yx-target-min`, no colour-only meaning (always text too), `aria-live` for async changes, drag-and-drop must have a keyboard/menu alternative.
5. **Class names** `yx-<component>__<part>`; variants/states via `data-*` attributes. Components are `forwardRef` where they wrap a native control. Controlled props (`value`/`onChange`, `open`/`onOpenChange`) with sensible uncontrolled defaults. Add `defaultOpen`/`open` for anything that opens, so stories can show the open state.
6. **Formats (§35):** ₹ via formatINR / groupIndian, dates via formatDate (dd MMM yyyy), times 12-hour.
7. **Writing (§34):** plain Indian English, sentence case, "you", errors say what to do, no exclamation marks.
8. **No new npm packages.** Available: react 18, all `@radix-ui/*` already in package.json (dialog, dropdown-menu, popover, tabs, tooltip, checkbox, radio-group, switch, slot, visually-hidden), `cmdk`, `lucide-react`, `react-day-picker`, `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder`. Build drag-and-drop with native pointer/HTML5 events; charts with plain SVG.
9. **Do not edit shared files:** `src/index.ts`, `src/styles/index.css`, `src/styles/tokens.css`, `package.json`, `.storybook/*`, or other builders' files. Your report must list your exports and CSS files so the lead registers them. If you need a new token, define it locally on your component root from existing tokens, and mention it in your report.
10. **Stories:** `src/stories/<your-family>.stories.tsx`, title under the group you are given. Show EVERY variant and state (default, hover/focus via `parameters.pseudo`, empty, loading, error, disabled, open, mobile via `globals: { viewport: { value: 'mobile2', isRotated: false } }`, long text, many items). Realistic Indian HR sample data (fictional people/companies), deterministic (no Math.random / Date.now in render). Stories import CSS automatically only once the lead registers your CSS — so in your stories file add `import '../components/<your>.css';` at the top so they render now.
11. **Tests:** `src/components/<your-family>.test.tsx` (Vitest + Testing Library) for real logic and interactions (keyboard, state changes, validation, calculations). Look at `src/components/data.test.tsx` for style. jsdom has no layout — don't assert pixel sizes.
12. **Before you finish, run and pass** (from the package folder):
    - `npx tsc --noEmit` (fix only errors in your files; if another builder's in-progress file errors, ignore it and say so)
    - `npx vitest run src/components/<your-family>.test.tsx`
    - `node scripts/check-tokens.mjs` — fix every line that names your files.
    Do NOT start Storybook (the lead has it running on port 6006; it hot-reloads your stories).
13. Keep it lean: no speculative props, no abstractions with one use. But every behaviour listed in your assignment must work.
14. **Time box: aim to finish within ~40 minutes.** If something is blocked, finish everything else and state what's missing.

## Report (your final message)
- Files created.
- Exports (exact names) per file, and CSS files to register.
- Stories list (story names).
- Test results (counts) and check-tokens result for your files.
- Anything not done, any token you wanted, any assumption.
