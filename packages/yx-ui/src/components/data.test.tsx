import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './button';
import { DataTable, tableToCsv, type TableColumn } from './table';
import { FilterBar, summarise, type FilterFieldDef } from './filters';
import { TimesheetGrid, checkTimesheet, type TimesheetLine } from './timesheet';
import type { FilterValue } from '../lib/table';

interface Row {
  id: string;
  name: string;
  dept: string;
  ctc: number;
}
const ROWS: Row[] = [
  { id: '1', name: 'Sana Nizami', dept: 'Finance', ctc: 52000 },
  { id: '2', name: 'Arjun Kulkarni', dept: 'Operations', ctc: 64200 },
  { id: '3', name: 'Lakshmi Venkatesan', dept: 'Finance', ctc: 96000 },
];
const COLS: TableColumn<Row>[] = [
  { key: 'name', header: 'Employee', value: (r) => r.name },
  { key: 'dept', header: 'Department', value: (r) => r.dept, groupable: true },
  { key: 'ctc', header: 'Monthly CTC', type: 'money', value: (r) => r.ctc, total: 'sum', editable: 'money' },
];

describe('DataTable', () => {
  it('sorts by header click: ascending, descending, off', async () => {
    const u = userEvent.setup();
    render(<DataTable label="People" columns={COLS} rows={ROWS} getRowId={(r) => r.id} />);
    const head = screen.getByRole('columnheader', { name: /Monthly CTC/ });
    await u.click(within(head).getByRole('button', { name: 'Monthly CTC' }));
    expect(head).toHaveAttribute('aria-sort', 'ascending');
    let cells = screen.getAllByRole('row').slice(1, 4).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(cells).toEqual(['Sana Nizami', 'Arjun Kulkarni', 'Lakshmi Venkatesan']);
    await u.click(within(head).getByRole('button', { name: 'Monthly CTC' }));
    expect(head).toHaveAttribute('aria-sort', 'descending');
    cells = screen.getAllByRole('row').slice(1, 4).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(cells[0]).toBe('Lakshmi Venkatesan');
    await u.click(within(head).getByRole('button', { name: 'Monthly CTC' }));
    expect(head).not.toHaveAttribute('aria-sort');
  });

  it('shows ₹ totals and group subtotals', async () => {
    render(<DataTable label="People" columns={COLS} rows={ROWS} getRowId={(r) => r.id} defaultGroupBy="dept" />);
    expect(screen.getByText('₹2,12,200')).toBeInTheDocument(); // grand total
    expect(screen.getByText('₹1,48,000')).toBeInTheDocument(); // Finance subtotal
    const financeToggle = screen.getByRole('button', { name: /Finance/ });
    expect(financeToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(financeToggle);
    expect(screen.queryByText('Sana Nizami')).toBeNull();
  });

  it('selection shows the bulk bar with bordered actions and a clear button', async () => {
    const u = userEvent.setup();
    function T() {
      const [sel, setSel] = useState<string[]>([]);
      return (
        <DataTable
          label="People"
          columns={COLS}
          rows={ROWS}
          getRowId={(r) => r.id}
          selectable
          selectedIds={sel}
          onSelectedChange={setSel}
          bulkActions={(ids) => <Button size="sm">Send letter to {ids.length}</Button>}
        />
      );
    }
    render(<T />);
    await u.click(screen.getByRole('checkbox', { name: 'Select Sana Nizami' }));
    await u.click(screen.getByRole('checkbox', { name: 'Select Arjun Kulkarni' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send letter to 2' })).toHaveAttribute('data-variant', 'secondary');
    await u.click(screen.getByRole('checkbox', { name: /Select all rows/ }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('row click and keyboard open the row; J/K move; Space selects', async () => {
    const u = userEvent.setup();
    const open = vi.fn();
    const onSel = vi.fn();
    render(<DataTable label="People" columns={COLS} rows={ROWS} getRowId={(r) => r.id} onRowClick={open} selectable selectedIds={[]} onSelectedChange={onSel} />);
    await u.click(screen.getByText('Arjun Kulkarni'));
    expect(open).toHaveBeenLastCalledWith(ROWS[1]);
    const rows = screen.getAllByRole('row').slice(1);
    rows[0].focus();
    await u.keyboard('j');
    expect(rows[1]).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(open).toHaveBeenLastCalledWith(ROWS[1]);
    await u.keyboard(' ');
    expect(onSel).toHaveBeenLastCalledWith(['2']);
  });

  it('inline edit commits on Enter and cancels on Escape', async () => {
    const u = userEvent.setup();
    const edit = vi.fn();
    render(<DataTable label="People" columns={COLS} rows={ROWS} getRowId={(r) => r.id} onCellEdit={edit} />);
    await u.click(screen.getByRole('button', { name: 'Edit Monthly CTC: ₹52,000' }));
    const input = screen.getByRole('textbox', { name: 'Monthly CTC' });
    await u.clear(input);
    await u.type(input, '55000{Enter}');
    expect(edit).toHaveBeenCalledWith(ROWS[0], 'ctc', 55000);
    await u.click(screen.getByRole('button', { name: 'Edit Monthly CTC: ₹64,200' }));
    await u.keyboard('{Escape}');
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('shows the filtered-empty state with Clear filters', async () => {
    const clear = vi.fn();
    render(<DataTable label="People" columns={COLS} rows={[]} getRowId={(r) => r.id} filtered onClearFilters={clear} />);
    expect(screen.getByText('No results for these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalled();
  });

  it('exports visible columns as displayed text', () => {
    const csv = tableToCsv(ROWS.slice(0, 1), COLS);
    expect(csv).toContain('Employee,Department,Monthly CTC');
    expect(csv).toContain('Sana Nizami,Finance,"₹52,000"');
  });
});

const FIELDS: FilterFieldDef[] = [
  { key: 'dept', label: 'Department', type: 'multi', options: [{ value: 'fin', label: 'Finance' }, { value: 'ops', label: 'Operations' }, { value: 'ppl', label: 'People' }] },
  { key: 'ctc', label: 'Monthly CTC', type: 'number', money: true },
];

describe('FilterBar', () => {
  it('summarises chips in plain words', () => {
    expect(summarise(FIELDS[0], { key: 'dept', type: 'multi', values: ['fin'] })).toBe('Finance');
    expect(summarise(FIELDS[0], { key: 'dept', type: 'multi', values: ['fin', 'ops', 'ppl'] })).toBe('3 selected');
    expect(summarise(FIELDS[1], { key: 'ctc', type: 'number', min: 50000, max: null })).toBe('₹50,000 or more');
    expect(summarise(FIELDS[0], { key: 'dept', type: 'multi', values: [] })).toBe('Any');
  });

  it('adds, edits, removes and clears filters', async () => {
    const u = userEvent.setup();
    let latest: FilterValue[] = [];
    function F() {
      const [v, setV] = useState<FilterValue[]>([]);
      latest = v;
      return <FilterBar fields={FIELDS} value={v} onChange={setV} />;
    }
    render(<F />);
    await u.click(screen.getByRole('button', { name: 'Filter' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Department' }));
    await u.click(await screen.findByRole('checkbox', { name: 'Operations' }));
    expect(latest).toEqual([{ key: 'dept', type: 'multi', values: ['ops'] }]);
    expect(screen.getByRole('button', { name: /Department:.*Operations/ })).toBeInTheDocument();
    await u.keyboard('{Escape}');
    await u.click(screen.getByRole('button', { name: 'Remove Department filter' }));
    expect(latest).toEqual([]);
  });

  it('debounces search by 200 ms', async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<FilterBar fields={FIELDS} value={[]} onChange={() => {}} onSearchChange={onSearch} searchPlaceholder="Search people" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search people' }), { target: { value: 'div' } });
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onSearch).toHaveBeenCalledWith('div');
    vi.useRealTimers();
  });
});

describe('TimesheetGrid', () => {
  const projects = [{ id: 'p1', code: 'ACME', name: 'Website', client: 'Acme', billable: true, tasks: [{ id: 't1', name: 'Dev' }] }];
  const days = [8, 8, 8, 8, 8, 0, 0].map((expected) => ({ expected }));
  const line: TimesheetLine = { id: 'l1', projectId: 'p1', taskId: 't1', billable: true, hours: [8, null, null, null, null, null, null] };

  it('checks rows without a project, days over the limit and empty weeks', () => {
    expect(checkTimesheet([{ ...line, projectId: null }]).map((p) => p.message)).toContain('Choose a project for row 1');
    expect(checkTimesheet([{ ...line, hours: [25, null, null, null, null, null, null] }]).map((p) => p.message)[0]).toMatch(/Mon has 25 h/);
    expect(checkTimesheet([{ ...line, hours: Array(7).fill(null) }]).map((p) => p.message)).toContain('Add your hours before submitting the week');
    expect(checkTimesheet([line])).toEqual([]);
  });

  it('keeps a correction line out of the day totals', () => {
    const fix: TimesheetLine = { id: 'c1', projectId: 'p1', taskId: null, billable: false, hours: Array(7).fill(null), correctionFor: '24 Aug – 30 Aug', correctionHours: 20 };
    expect(checkTimesheet([{ ...line, hours: [8, null, null, null, null, null, null] }, fix])).toEqual([]);
    expect(checkTimesheet([fix])).toEqual([]);
  });

  it('parses typed hours and blocks submit with a problem list', async () => {
    const u = userEvent.setup();
    const submit = vi.fn();
    let latest: TimesheetLine[] = [];
    function T() {
      const [lines, setLines] = useState<TimesheetLine[]>([line]);
      latest = lines;
      return <TimesheetGrid weekStart={new Date(2026, 8, 28)} days={days} status="draft" lines={lines} onLinesChange={setLines} projects={projects} onSubmit={submit} layout="grid" />;
    }
    render(<T />);
    const tue = screen.getByRole('textbox', { name: /Website Tue 29 Sep hours/ });
    await u.type(tue, '7:30');
    await u.tab();
    expect(latest[0].hours[1]).toBe(7.5);
    const wed = screen.getByRole('textbox', { name: /Website Wed 30 Sep hours/ });
    await u.type(wed, '30');
    await u.tab();
    await u.click(screen.getByRole('button', { name: 'Submit week' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/Wed has 30 h/)).toBeInTheDocument();
  });

  it('is read-only once submitted', () => {
    render(<TimesheetGrid weekStart={new Date(2026, 8, 28)} days={days} status="submitted" lines={[line]} onLinesChange={() => {}} projects={projects} onSubmit={() => {}} layout="grid" />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit week' })).toBeNull();
    expect(screen.getByText(/Submitted for approval/)).toBeInTheDocument();
  });
});

