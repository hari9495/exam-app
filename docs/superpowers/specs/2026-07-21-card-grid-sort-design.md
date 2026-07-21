# Card Grid Sort — Design

## Context

The recruiter console motion redesign (Feature #6598) converted the Exams, Candidates, and
Question Bank list pages from `Table` to the new `CardGrid` component. `Table` had built-in
per-column sorting (click a header to sort the currently-loaded page by that field, click again
to reverse direction — `components/ui/Table.tsx`'s `Column.sortValue` + internal `sortKey`/
`sortDir` state). `CardGrid` has no equivalent, so that sort affordance silently disappeared
when each page was converted. The final whole-branch review flagged this as a product decision
rather than a defect; the user has decided to add it back.

## Goal

Restore the same sorting capability the three list pages had before, adapted to a card layout,
without expanding scope beyond what `Table` already did.

## Scope

**In scope:** `components/ui/CardGrid.tsx`, and the three pages that consume it
(`app/(recruiter)/exams/page.tsx`, `.../candidates/page.tsx`, `.../questions/page.tsx`).

**Explicitly unchanged, matching `Table`'s original behavior exactly:**
- Sort is **client-side over the currently-loaded page only** (≤20 items per the existing
  `pageSize`), not a server-side sort across all paginated results. This was `Table`'s actual
  behavior — restoring it, not upgrading it.
- No new backend endpoint, query param, or dependency.

## Design

`CardGrid` gains one new optional prop:

```typescript
interface SortOption<T> {
  key: string;
  label: string;
  sortValue: (item: T) => string | number;
}

interface CardGridProps<T> {
  items: T[];
  cardKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
  sortOptions?: SortOption<T>[]; // new
}
```

This mirrors `Table`'s `Column.sortValue` shape exactly, so each page's existing sort logic
(which fields, which value extractors) transfers over unchanged — only the `key`/`header` split
becomes `key`/`label` for clarity in a dropdown context, and each page passes an explicit `label`
already used`Table`'s `column.header` text.

When `sortOptions` is provided, `CardGrid` renders a small toolbar above the grid:
- A `Select` (reusing the existing `components/ui/Select` component, `label="Sort by"`) with
  a `"default"` option (label "Default order", the API's original order — the initial/no-sort
  state) plus one option per `SortOption`.
- A direction-toggle icon button (`ArrowUp`/`ArrowDown` from `lucide-react`, same icons `Table`
  already uses) that flips ascending/descending, enabled only when a non-default field is
  selected.

`CardGrid` manages `sortKey`/`sortDir` state internally (same pattern as `Table`) and sorts
`items` with the same comparator `Table` already uses (`av < bv ? -1 : av > bv ? 1 : 0`, flipped
by `sortDir`) before rendering. No sort state is lifted to the parent page — this keeps each
page's integration a single new prop, not new state plumbing.

When `sortOptions` is omitted (not applicable to any current consumer once this ships, but kept
optional for API stability), `CardGrid` renders exactly as it does today — no toolbar.

### Per-page `sortOptions`

Mirroring each page's current `Table` `Column.sortValue` definitions exactly:

- **Exams:** `Title` (`exam.title`), `Created` (`exam.createdAt`)
- **Candidates:** `Name` (`candidate.name`), `Added` (`candidate.createdAt`)
- **Question Bank:** `Text` (`q.text`), `Difficulty` (`q.difficulty`), `Marks` (`q.marks`)

## Error Handling & Fallback

None needed beyond what already exists — sorting an empty `items` array is a no-op (the
existing empty-state branch in `CardGrid` returns before the toolbar/grid render), and a
single-item list sorts trivially.

## Testing

- New unit tests in `CardGrid.test.tsx` for the sort toolbar: selecting a field sorts the
  rendered cards, toggling direction reverses the order, "Default order" restores original
  order.
- Existing page tests (`exams/page.test.tsx`, `candidates/page.test.tsx`,
  `questions/page.test.tsx`) are expected to need no changes — they don't currently assert on
  card ordering, only on content presence (the same text/role-based assertion pattern from the
  earlier card-grid conversion). Verify this holds; only touch a test file if a real assertion
  actually breaks.
