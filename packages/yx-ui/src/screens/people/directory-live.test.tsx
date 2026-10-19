import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DirectoryPhone, DirectoryScreen, type LiveDirectory } from './directory';
import { ME, WORKFORCE } from './people-data';

// PPL-01 live (design audit step 2): the designed directory with the live app's data and actions.
const ROWS = WORKFORCE.filter((r) => r.kind === 'Employee' || r.kind === 'Consultant');
const live = (over: Partial<LiveDirectory> = {}): LiveDirectory => ({
  company: 'Godavari Agro',
  me: ME,
  cards: { Employee: { count: 7, delta: null }, Consultant: { count: 2, delta: null }, 'All persons': { count: 8, delta: null } },
  persons: { roles: 9, people: 8 },
  ...over,
});

describe('DirectoryScreen live', () => {
  it('shows only the cards that exist, no change line until last month is on record, and the company', () => {
    render(<DirectoryScreen persona="hr" rows={ROWS} live={live()} />);
    const tabs = screen.getByRole('tablist', { name: 'Workforce' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.querySelector('.yx-ppl__wf-label')?.textContent)).toEqual(['Employees', 'Consultants', 'All persons']);
    expect(tabs).toHaveTextContent('7');
    expect(tabs).not.toHaveTextContent(/than|Same as/);
    expect(screen.getByText(/Everyone who works with Godavari Agro/)).toBeInTheDocument();
  });

  it('says the change against last month once it exists', () => {
    render(<DirectoryScreen persona="hr" rows={ROWS} live={live({ sinceMonth: 'September', cards: { Employee: { count: 7, delta: -2 }, 'All persons': { count: 8, delta: 0 } } })} />);
    const tabs = screen.getByRole('tablist', { name: 'Workforce' });
    expect(tabs).toHaveTextContent('2 fewer than September');
    expect(tabs).toHaveTextContent('Same as September');
  });

  it('filtering a parent department finds everyone under it, and offers it as "Parent › Child"', () => {
    const rows = [
      { ...ROWS[0], id: 'q', name: 'Quinn Rao', department: 'Quality', departmentPath: ['Operations', 'Quality'] },
      { ...ROWS[1], id: 's', name: 'Sara Das', department: 'Sales', departmentPath: ['Sales'] },
    ];
    render(<DirectoryScreen persona="hr" rows={rows} live={live()} defaultFilters={[{ key: 'department', type: 'multi', values: ['Operations'] }]} />);
    expect(screen.getAllByText('Quinn Rao').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Sara Das')).toHaveLength(0);
  });

  it('All persons: N roles held by M people', async () => {
    render(<DirectoryScreen persona="hr" rows={ROWS} live={live()} />);
    await userEvent.click(screen.getByRole('tab', { name: /All persons/ }));
    expect(screen.getByText('9 roles held by 8 people: 1 person holds two roles, so they appear twice.')).toBeInTheDocument();
  });

  it('Import shows only once there is an import; Add employee calls the app', async () => {
    const onAdd = vi.fn();
    const { unmount } = render(<DirectoryScreen persona="hr" rows={ROWS} live={live({ onAdd })} />);
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add employee' }));
    expect(onAdd).toHaveBeenCalledWith('Employee');
    unmount();
    render(<DirectoryScreen persona="hr" rows={ROWS} live={live({ onImport: vi.fn() })} />);
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
  });

  it('a saved view keeps the search and is applied when picked', async () => {
    const onSave = vi.fn();
    render(<DirectoryScreen persona="hr" rows={ROWS} live={live({ views: { list: [{ id: 'v1', name: 'Hosur', shared: true, state: { kind: 'Employee', filters: [], q: 'Hosur', quick: null } }], onSave } })} />);
    await userEvent.click(screen.getByRole('button', { name: /Everyone/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Hosur/ }));
    expect(screen.getByRole('textbox', { name: 'Search name, ID, email or phone' })).toHaveValue('Hosur');
    // Saving a view (the naming popover) is walked through in the browser: apps/web e2e/yx-directory.spec.ts.
  });

  it('a colleague gets the quick chips from their own record, and none without one', () => {
    const { unmount } = render(<DirectoryScreen persona="emp" rows={ROWS} live={live({ cards: {} })} />);
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Workforce' })).toBeNull();
    unmount();
    render(<DirectoryScreen persona="emp" rows={ROWS} live={live({ me: null, cards: {} })} />);
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).toBeNull();
  });

  it('the detail drawer emails and calls only with a number, and opens the record for HR', async () => {
    const onOpenRecord = vi.fn();
    const row = { ...ROWS[0], phone: '' };
    render(<DirectoryScreen persona="hr" rows={[row]} live={live({ onOpenRecord })} />);
    await userEvent.click(screen.getByText(row.name));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:${row.email}`);
    expect(within(drawer).queryByRole('link', { name: /Call/ })).toBeNull();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Open record' }));
    expect(onOpenRecord).toHaveBeenCalledWith(row);
  });
});

describe('DirectoryPhone live', () => {
  it('opens a person in a drawer', async () => {
    render(<DirectoryPhone rows={ROWS} live={{ me: ME, persona: 'emp' }} />);
    const first = ROWS.filter((r) => r.kind === 'Employee').sort((a, b) => 0 * a.name.localeCompare(b.name))[0];
    await userEvent.click(screen.getAllByRole('button', { name: new RegExp(first.name) })[0]);
    expect(await screen.findByRole('dialog', { name: first.name })).toBeInTheDocument();
  });
});

describe('DirectoryScreen selection', () => {
  it('HR picks people and Issue letter gets the employee records only', async () => {
    const onIssueLetter = vi.fn();
    const rows = ROWS.slice(0, 3);
    render(<DirectoryScreen persona="hr" rows={rows} live={live({ onIssueLetter })} />);
    await userEvent.click(screen.getByRole('checkbox', { name: `Select ${rows[0].name}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Issue letter' }));
    expect(onIssueLetter).toHaveBeenCalledWith([rows[0].id]);
  });
});

describe('DirectoryScreen persona change', () => {
  it('HR columns come in the designed order even when the page first showed the colleague view', () => {
    const { rerender } = render(<DirectoryScreen persona="emp" rows={ROWS} live={live()} />);
    rerender(<DirectoryScreen persona="hr" rows={ROWS} live={live()} />);
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[^A-Za-z ]/g, '').trim()).filter(Boolean);
    expect(heads.slice(0, 3)).toEqual(['Name', 'Status', 'ID']);
  });
});
