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

  it('a number column is marked right-aligned in its heading and cells; total rows sit in the foot, label spanning the empty columns', () => {
    type Line = { id: string; name: string; note: string; amount: string };
    const lines: Line[] = [{ id: 'a', name: 'Basic', note: 'Fixed', amount: '₹40,000' }];
    render(
      <PlainTable
        label="Pay"
        columns={[
          { key: 'name', header: 'Line', rowHeader: true, cell: (r: Line) => r.name },
          { key: 'note', header: 'How', cell: (r: Line) => r.note },
          { key: 'amount', header: 'Amount', num: true, cell: (r: Line) => r.amount },
        ]}
        rows={lines}
        getRowId={(r) => r.id}
        footer={[{ id: 't', label: 'Total', cells: { amount: '₹40,000' } }]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('data-num', 'true');
    expect(screen.getByRole('columnheader', { name: 'How' })).not.toHaveAttribute('data-num');
    const [, body, foot] = screen.getAllByRole('row');
    expect(within(body).getByText('₹40,000')).toHaveAttribute('data-num', 'true');
    expect(foot.closest('tfoot')).not.toBeNull();
    const total = within(foot).getByRole('rowheader', { name: 'Total' });
    expect(total).toHaveAttribute('colspan', '2');
    expect(within(foot).getByText('₹40,000')).toHaveAttribute('data-num', 'true');
  });

  it('a picked-out row carries its tone and a word read out first, so colour is not the only sign', () => {
    render(<PlainTable label="Tasks" columns={COLS} rows={ROWS} getRowId={(r) => r.id} rowTone={(r) => (r.now !== r.was ? { tone: 'warning', label: 'Moved' } : undefined)} />);
    const [, first, second] = screen.getAllByRole('row');
    expect(first).toHaveAttribute('data-tone', 'warning');
    expect(within(first).getByRole('rowheader')).toHaveTextContent('Moved: Laptop ready');
    expect(second).not.toHaveAttribute('data-tone');
    expect(second).not.toHaveTextContent('Moved');
    expect(document.querySelector('tfoot')).toBeNull();
  });

  it('hidden headings are still column headers for screen readers, only not shown', () => {
    render(<PlainTable label="Tasks" hideHeader columns={COLS} rows={ROWS} getRowId={(r) => r.id} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Task', 'Was due', 'Now due']);
    expect(document.querySelector('thead')).toHaveClass('yx-visually-hidden');
  });
});
