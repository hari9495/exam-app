# Card Grid Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the sort affordance the Exams/Candidates/Question Bank list pages lost when they were converted from `Table` to `CardGrid`, by porting `Table`'s existing client-side sort logic into `CardGrid` as an optional feature.

**Architecture:** `CardGrid` gains an optional `sortOptions` prop (same shape as `Table`'s `Column.sortValue`). When present, it renders a `Select` ("Sort by") + direction-toggle button above the grid and sorts the currently-rendered `items` array before mapping to cards. Each of the three list pages passes its own `sortOptions` array, matching exactly the fields their old `Table` columns used to sort by.

**Tech Stack:** Next.js/React (apps/web), the existing `components/ui/Select` and `lucide-react` icons (`ArrowUp`/`ArrowDown`, already used by `Table`), Jest + Testing Library.

## Global Constraints

- Sort is client-side over the currently-loaded page only (≤20 items, matching `pageSize`), not a server-side sort across all paginated results — this restores `Table`'s original behavior exactly, it does not upgrade it.
- No new backend endpoint, query param, or dependency.
- `CardGrid`'s existing consumers that don't pass `sortOptions` render exactly as before — this is an additive, optional prop.
- Existing page tests (`exams/page.test.tsx`, `candidates/page.test.tsx`, `questions/page.test.tsx`) are expected to need no changes — verify this holds; only touch a test file if a real assertion actually breaks.

---

### Task 1: `CardGrid` sort toolbar

**Files:**
- Modify: `apps/web/components/ui/CardGrid.tsx`
- Modify: `apps/web/components/ui/CardGrid.test.tsx`
- Modify: `apps/web/components/ui/index.ts`

**Interfaces:**
- Produces: `SortOption<T> = { key: string; label: string; sortValue: (item: T) => string | number }`, and `CardGrid`'s new optional prop `sortOptions?: SortOption<T>[]`. Consumed by Tasks 2, 3, 4.

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/components/ui/CardGrid.test.tsx` in full:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardGrid } from './CardGrid';

interface Item {
  id: string;
  name: string;
}

describe('CardGrid', () => {
  it('renders one card per item via renderCard', () => {
    const items: Item[] = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }];
    render(<CardGrid items={items} cardKey={(item) => item.id} renderCard={(item) => <span>{item.name}</span>} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows the empty message when there are no items', () => {
    render(<CardGrid items={[]} cardKey={(item: Item) => item.id} renderCard={(item: Item) => <span>{item.name}</span>} emptyMessage="No results yet." />);

    expect(screen.getByText('No results yet.')).toBeInTheDocument();
  });

  it('falls back to a default empty message when none is provided', () => {
    render(<CardGrid items={[]} cardKey={(item: Item) => item.id} renderCard={(item: Item) => <span>{item.name}</span>} />);

    expect(screen.getByText('No results.')).toBeInTheDocument();
  });

  describe('sorting', () => {
    const items: Item[] = [
      { id: '1', name: 'Charlie' },
      { id: '2', name: 'Alpha' },
      { id: '3', name: 'Bravo' },
    ];
    const sortOptions = [{ key: 'name', label: 'Name', sortValue: (item: Item) => item.name }];

    function renderNames() {
      return screen.getAllByTestId('card-name').map((el) => el.textContent);
    }

    it('renders items in original order when no sort field is selected', () => {
      render(
        <CardGrid
          items={items}
          cardKey={(item) => item.id}
          renderCard={(item) => <span data-testid="card-name">{item.name}</span>}
          sortOptions={sortOptions}
        />,
      );

      expect(renderNames()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    });

    it('sorts items ascending when a sort field is selected', async () => {
      render(
        <CardGrid
          items={items}
          cardKey={(item) => item.id}
          renderCard={(item) => <span data-testid="card-name">{item.name}</span>}
          sortOptions={sortOptions}
        />,
      );

      await userEvent.click(screen.getByRole('combobox', { name: 'Sort by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Name' }));

      expect(renderNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    it('reverses order when the direction toggle is clicked', async () => {
      render(
        <CardGrid
          items={items}
          cardKey={(item) => item.id}
          renderCard={(item) => <span data-testid="card-name">{item.name}</span>}
          sortOptions={sortOptions}
        />,
      );

      await userEvent.click(screen.getByRole('combobox', { name: 'Sort by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Name' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));

      expect(renderNames()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('does not render a sort toolbar when sortOptions is omitted', () => {
      render(<CardGrid items={items} cardKey={(item) => item.id} renderCard={(item) => <span>{item.name}</span>} />);

      expect(screen.queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run (from `apps/web`): `npx jest CardGrid.test`
Expected: the 4 new tests under `describe('sorting', ...)` FAIL — `sortOptions` isn't a recognized prop yet, so no sort toolbar renders and no reordering happens. The 3 pre-existing tests still PASS.

- [ ] **Step 3: Implement the sort toolbar**

Replace `apps/web/components/ui/CardGrid.tsx` in full:

```tsx
'use client';

import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Select } from './Select';

export interface SortOption<T> {
  key: string;
  label: string;
  sortValue: (item: T) => string | number;
}

interface CardGridProps<T> {
  items: T[];
  cardKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
  sortOptions?: SortOption<T>[];
}

const DEFAULT_SORT_KEY = 'default';

export function CardGrid<T>({ items, cardKey, renderCard, emptyMessage = 'No results.', sortOptions }: CardGridProps<T>) {
  const [sortKey, setSortKey] = useState(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-recruiter-text-tertiary">{emptyMessage}</p>;
  }

  const activeSort = sortOptions?.find((option) => option.key === sortKey);
  const sorted = activeSort
    ? [...items].sort((a, b) => {
        const av = activeSort.sortValue(a);
        const bv = activeSort.sortValue(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : items;

  return (
    <div>
      {sortOptions && sortOptions.length > 0 && (
        <div className="mb-3 flex items-end gap-2">
          <Select
            label="Sort by"
            value={sortKey}
            onChange={setSortKey}
            options={[
              { value: DEFAULT_SORT_KEY, label: 'Default order' },
              ...sortOptions.map((option) => ({ value: option.key, label: option.label })),
            ]}
          />
          <button
            type="button"
            aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
            disabled={!activeSort}
            onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
            className="rounded border border-recruiter-border p-2 text-recruiter-text-tertiary transition-colors hover:bg-recruiter-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item, index) => (
          <motion.div
            key={cardKey(item)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04, ease: 'easeOut' }}
            whileHover={{ y: -3 }}
            className="group rounded-2xl border border-recruiter-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            {renderCard(item)}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

(`aria-label` on the direction-toggle button is fixed as `"Sort ascending"`/`"Sort descending"` describing the *current* direction, matching the icon shown — this is why Step 1's third sort test clicks the button once labeled `"Sort ascending"` to flip to descending, exactly the same convention `Table`'s `aria-sort` used.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest CardGrid.test`
Expected: PASS, all 7 tests (3 existing + 4 new) green.

- [ ] **Step 5: Export the new type from the ui barrel**

In `apps/web/components/ui/index.ts`, change:

```typescript
export { CardGrid } from './CardGrid';
```

to:

```typescript
export { CardGrid, type SortOption } from './CardGrid';
```

- [ ] **Step 6: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/ui/CardGrid.tsx apps/web/components/ui/CardGrid.test.tsx apps/web/components/ui/index.ts
git commit -m "feat: add sort toolbar to CardGrid"
```

---

### Task 2: Exams list — wire up sort

**Files:**
- Modify: `apps/web/app/(recruiter)/exams/page.tsx`

**Interfaces:**
- Consumes: `SortOption<T>` and `CardGrid`'s `sortOptions` prop (Task 1).

- [ ] **Step 1: Add the sort options and wire them into `CardGrid`**

In `apps/web/app/(recruiter)/exams/page.tsx`, change the import line:

```typescript
import {
  CardGrid,
  StatusBadge,
  Button,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Pagination,
  type StatusTone,
} from '../../../components/ui';
```

to:

```typescript
import {
  CardGrid,
  StatusBadge,
  Button,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Pagination,
  type StatusTone,
  type SortOption,
} from '../../../components/ui';
```

Add a new module-level constant after `STATUS_LABEL`:

```typescript
const EXAM_SORT_OPTIONS: SortOption<ExamListItem>[] = [
  { key: 'title', label: 'Title', sortValue: (exam) => exam.title },
  { key: 'created', label: 'Created', sortValue: (exam) => exam.createdAt },
];
```

Change the `<CardGrid ... />` call to add `sortOptions`:

```tsx
      <CardGrid
        items={examsResponse?.data ?? []}
        cardKey={(exam) => exam.id}
        renderCard={renderCard}
        emptyMessage="No exams yet."
        sortOptions={EXAM_SORT_OPTIONS}
      />
```

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest exams/page.test`
Expected: PASS, all existing tests green unmodified — the new "Sort by" combobox has a distinct accessible name from anything these tests already query, so no collision. If a test fails, read the failure — it means something in the new toolbar actually broke an existing assertion, not something to work around by editing the test blindly.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(recruiter)/exams/page.tsx"
git commit -m "feat: add sort options to exams card grid"
```

---

### Task 3: Candidates list — wire up sort

**Files:**
- Modify: `apps/web/app/(recruiter)/candidates/page.tsx`

**Interfaces:**
- Consumes: `SortOption<T>` and `CardGrid`'s `sortOptions` prop (Task 1).

- [ ] **Step 1: Add the sort options and wire them into `CardGrid`**

In `apps/web/app/(recruiter)/candidates/page.tsx`, change the import line:

```typescript
import { CardGrid, Checkbox, Select, Button, useToast, Pagination } from '../../../components/ui';
```

to:

```typescript
import { CardGrid, Checkbox, Select, Button, useToast, Pagination, type SortOption } from '../../../components/ui';
```

Add a new module-level constant after the imports, before `export default function CandidatesPage()`:

```typescript
const CANDIDATE_SORT_OPTIONS: SortOption<Candidate>[] = [
  { key: 'name', label: 'Name', sortValue: (candidate) => candidate.name },
  { key: 'added', label: 'Added', sortValue: (candidate) => candidate.createdAt },
];
```

Change the `<CardGrid ... />` call to add `sortOptions`:

```tsx
      <CardGrid
        items={candidatesResponse?.data ?? []}
        cardKey={(candidate) => candidate.id}
        renderCard={renderCard}
        emptyMessage="No candidates yet."
        sortOptions={CANDIDATE_SORT_OPTIONS}
      />
```

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest candidates/page.test`
Expected: PASS unmodified — note this page already has one `Select` (`"Exam to invite to"`); the new `"Sort by"` combobox has a distinct accessible name, so `getByRole('combobox', { name: 'Exam to invite to' })` queries in the existing test remain unambiguous. If a test fails, read the failure before touching the test file.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(recruiter)/candidates/page.tsx"
git commit -m "feat: add sort options to candidates card grid"
```

---

### Task 4: Question Bank list — wire up sort

**Files:**
- Modify: `apps/web/app/(recruiter)/questions/page.tsx`

**Interfaces:**
- Consumes: `SortOption<T>` and `CardGrid`'s `sortOptions` prop (Task 1).

- [ ] **Step 1: Add the sort options and wire them into `CardGrid`**

In `apps/web/app/(recruiter)/questions/page.tsx`, change the import line:

```typescript
import { CardGrid, StatusBadge, Button, Pagination, type StatusTone } from '../../../components/ui';
```

to:

```typescript
import { CardGrid, StatusBadge, Button, Pagination, type StatusTone, type SortOption } from '../../../components/ui';
```

Add a new module-level constant right after `DIFFICULTY_LEVEL` (it reuses that map for the difficulty sort value) and before the `DifficultyDots` function:

```typescript
const QUESTION_SORT_OPTIONS: SortOption<Question>[] = [
  { key: 'text', label: 'Text', sortValue: (q) => q.text },
  { key: 'difficulty', label: 'Difficulty', sortValue: (q) => DIFFICULTY_LEVEL[q.difficulty] },
  { key: 'marks', label: 'Marks', sortValue: (q) => q.marks },
];
```

Change the `<CardGrid ... />` call to add `sortOptions`:

```tsx
      <CardGrid
        items={questions?.data ?? []}
        cardKey={(q) => q.id}
        renderCard={renderCard}
        emptyMessage="No questions yet."
        sortOptions={QUESTION_SORT_OPTIONS}
      />
```

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest questions/page.test`
Expected: PASS unmodified, same reasoning as Tasks 2 and 3.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(recruiter)/questions/page.tsx"
git commit -m "feat: add sort options to question bank card grid"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full apps/web suite**

Run (from `apps/web`): `npx jest`
Expected: all suites pass, including the updated `CardGrid.test.tsx` and the unmodified `exams/page.test.tsx`, `candidates/page.test.tsx`, `questions/page.test.tsx`.

- [ ] **Step 2: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: clean except the same pre-existing unrelated baseline errors this feature has consistently confirmed throughout (`QuestionNavigator.test.tsx`, `forgot-password/login/reset-password` test files) — confirm no new ones in any file this plan touched.

- [ ] **Step 3: Live verification**

1. Start `api` and `web` dev servers, log in as `recruiter@demo-org.test` / `Passw0rd!2026` (org slug `demo-org`).
2. **Exams:** confirm a "Sort by" dropdown with "Default order", "Title", "Created" appears above the card grid; select "Title", confirm cards reorder alphabetically; click the direction toggle, confirm they reverse; select "Default order", confirm original order returns.
3. **Candidates:** confirm "Sort by" with "Default order", "Name", "Added" works the same way, and confirm it doesn't interfere with the existing "Exam to invite to" dropdown or the bulk-select checkboxes.
4. **Question Bank:** confirm "Sort by" with "Default order", "Text", "Difficulty", "Marks" works the same way.
5. Take a screenshot of one page mid-sort as evidence.
