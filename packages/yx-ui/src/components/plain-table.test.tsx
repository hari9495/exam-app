import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlainTable } from './plain-table';

type Row = { id: string; name: string; was: string; now: string };
const ROWS: Row[] = [
  { id: 'a', name: 'Laptop ready', was: '10 Nov 2026', now: '17 Nov 2026' },
  { id: 'b', name: 'Welcome email', was: '3 Nov 2026', now: '3 Nov 2026' },
];
const COLS = [
  { key: 'name', header: 'Task', rowHeader: true, cell: (r: Row) => r.name },
  { key: 'was', header: 'Was due', date: true, cell: (r: Row) => r.was },
  { key: 'now', header: 'Now due', date: true, changed: (r: Row) => r.now !== r.was, cell: (r: Row) => r.now },
];

describe('PlainTable (kit, Data)', () => {
  it('a named table with column headings, row headings and one row per item, in a focusable sideways-scroll region', () => {
    render(<PlainTable label="Tasks" columns={COLS} rows={ROWS} getRowId={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'Tasks' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Task', 'Was due', 'Now due']);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Laptop ready', 'Welcome email']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const region = screen.getByRole('region', { name: 'Tasks, scrolls sideways on small screens' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('marks only changed cells and date columns; read-only, so nothing in it is a button', () => {
    render(<PlainTable label="Tasks" columns={COLS} rows={ROWS} getRowId={(r) => r.id} />);
    const [, first, second] = screen.getAllByRole('row');
    expect(within(first).getByText('17 Nov 2026')).toHaveAttribute('data-changed', 'true');
    expect(within(second).getAllByText('3 Nov 2026')[1]).not.toHaveAttribute('data-changed');
    expect(within(first).getByText('10 Nov 2026')).toHaveAttribute('data-date', 'true');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('a visible caption names the table instead of the hidden label; no rows still draws the headings', () => {
    render(<PlainTable label="Tasks" caption="Open tasks move" columns={COLS} rows={[]} getRowId={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'Open tasks move' });
    expect(table).not.toHaveAttribute('aria-label');
    expect(within(table).getAllByRole('row')).toHaveLength(1);
  });
});
