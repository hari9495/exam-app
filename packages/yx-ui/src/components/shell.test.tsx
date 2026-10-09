import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  AppShell,
  ScopePicker,
  useKeySequences,
  Breadcrumbs,
  CommandPalette,
  OrgUnitPicker,
  RAIL_ITEMS,
  SideRail,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  orgUnitRows,
  useCommandPaletteShortcut,
  type OrgUnit,
  type PaletteGroup,
} from './shell';

describe('SideRail', () => {
  it('uses a roving tabindex and moves with arrow keys, Home and End', async () => {
    const u = userEvent.setup();
    render(<SideRail items={RAIL_ITEMS.filter((i) => ['home', 'people', 'time', 'settings'].includes(i.id))} activeId="people" />);
    const people = screen.getByRole('button', { name: 'People' });
    expect(people).toHaveAttribute('aria-current', 'page');
    expect(people).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('tabindex', '-1');

    people.focus();
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Time' })).toHaveFocus();
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus(); // pinned bottom, last
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus(); // wraps
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('tabindex', '0');
    await u.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    await u.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Time' })).toHaveFocus();
  });
});

const GROUPS: PaletteGroup[] = [
  { heading: 'Recent', recent: true, items: [{ id: 'r1', label: 'Divya Raghunathan', secondary: 'Viewed today' }] },
  {
    heading: 'People',
    items: [
      { id: 'p1', label: 'Divya Raghunathan', secondary: 'Senior QA Engineer · Engineering', keywords: ['KF-0001'] },
      { id: 'p2', label: 'Arjun Kulkarni', secondary: 'Plant Supervisor · Operations' },
    ],
  },
  { heading: 'Actions', items: [{ id: 'a1', label: 'Apply leave' }, { id: 'a2', label: 'Run payroll' }] },
];

describe('CommandPalette', () => {
  it('filters across groups, hides recent while typing, and shows an empty message', async () => {
    const u = userEvent.setup();
    const onSelect = vi.fn();
    render(<CommandPalette groups={GROUPS} onSelect={onSelect} defaultOpen />);
    expect(screen.getAllByRole('option')).toHaveLength(5);
    const input = screen.getByRole('combobox');
    await u.type(input, 'payroll');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Run payroll']);
    await u.clear(input);
    await u.type(input, 'KF-0001');
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(1); // Recent group hidden once typing
    await u.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says what had no results', async () => {
    const u = userEvent.setup();
    render(<CommandPalette groups={GROUPS} onSelect={() => {}} defaultOpen />);
    await u.type(screen.getByRole('combobox'), 'zzqx');
    expect(screen.getByText(/No results for “zzqx”/)).toBeInTheDocument();
  });

  it('opens and closes with Ctrl+K and Cmd+K through the hook', () => {
    function App() {
      const [open, setOpen] = useState(false);
      useCommandPaletteShortcut(() => setOpen((o) => !o));
      return <CommandPalette groups={GROUPS} onSelect={() => {}} open={open} onOpenChange={setOpen} />;
    }
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Breadcrumbs', () => {
  const crumbs = ['People', 'Engineering', 'QA team', 'Divya Raghunathan', 'Documents', 'Offer letter'].map((label, i) => ({ label, href: `/p/${i}` }));

  it('shows every item when there are 4 or fewer, last one current', () => {
    render(<Breadcrumbs items={crumbs.slice(0, 3)} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('QA team')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/p/0');
  });

  it('collapses the middle into a menu when there are more than 4', async () => {
    const u = userEvent.setup();
    render(<Breadcrumbs items={crumbs} />);
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByText('Offer letter')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Engineering' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Show 3 more pages' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Engineering', 'QA team', 'Divya Raghunathan']);
  });
});

const UNITS: OrgUnit[] = [
  {
    id: 'kf',
    name: 'Kaveri Foods',
    children: [
      { id: 'eng', name: 'Engineering', children: [{ id: 'qa', name: 'Quality assurance' }, { id: 'plat', name: 'Platform' }] },
      { id: 'ops', name: 'Operations', children: [{ id: 'hosur', name: 'Hosur plant', children: [{ id: 'hq', name: 'Quality control' }] }] },
    ],
  },
];

describe('OrgUnitPicker', () => {
  it('orgUnitRows: tree respects expansion; search returns matches flat', () => {
    expect(orgUnitRows(UNITS, new Set(['kf']), '').map((r) => r.id)).toEqual(['kf', 'eng', 'ops']);
    expect(orgUnitRows(UNITS, new Set(['kf', 'ops']), '').map((r) => `${r.id}:${r.depth}`)).toEqual(['kf:0', 'eng:1', 'ops:1', 'hosur:2']);
    expect(orgUnitRows(UNITS, new Set(), 'quality').map((r) => r.id)).toEqual(['qa', 'hq']);
  });

  it('expands with the keyboard and picks with Enter', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<OrgUnitPicker units={UNITS} value={null} onChange={onChange} aria-label="Department" defaultOpen />);
    const input = screen.getByRole('combobox', { name: 'Search org units' });
    input.focus();
    expect(screen.getAllByRole('treeitem')).toHaveLength(3);
    await u.keyboard('{ArrowDown}{ArrowDown}'); // Operations
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('treeitem', { name: /Operations/ }).id);
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: /Operations/ })).toHaveAttribute('aria-expanded', 'true');
    await u.keyboard('{ArrowRight}'); // into Hosur plant
    await u.keyboard('{ArrowLeft}'); // Hosur has children but collapsed → back to parent
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('treeitem', { name: /Operations/ }).id);
    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('treeitem', { name: /Operations/ })).toHaveAttribute('aria-expanded', 'false');
    await u.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('ops');
  });

  it('search shows matching nodes with their path', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<OrgUnitPicker units={UNITS} value={null} onChange={onChange} defaultOpen />);
    await u.type(screen.getByRole('combobox', { name: 'Search org units' }), 'quality');
    const items = screen.getAllByRole('treeitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Kaveri Foods › Operations › Hosur plant');
    await u.click(items[1]);
    expect(onChange).toHaveBeenCalledWith('hq');
  });

  it('shows the chosen unit, then its path, on the trigger', () => {
    render(<OrgUnitPicker units={UNITS} value="qa" onChange={() => {}} aria-label="Department" />);
    expect(screen.getByRole('button', { name: 'Department' })).toHaveTextContent('Quality assuranceKaveri Foods › Engineering');
  });
});

describe('Tabs', () => {
  it('changes tab (controlled, so the value can live in the URL) and shows counts', async () => {
    const u = userEvent.setup();
    const onValueChange = vi.fn();
    function T() {
      const [tab, setTab] = useState('overview');
      return (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            onValueChange(v);
          }}
        >
          <TabsList aria-label="Person">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents" count={4}>
              Documents
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview body</TabsContent>
          <TabsContent value="documents">Documents body</TabsContent>
        </Tabs>
      );
    }
    render(<T />);
    expect(screen.getByRole('tab', { name: 'Documents 4' })).toHaveAttribute('aria-selected', 'false');
    await u.click(screen.getByRole('tab', { name: 'Documents 4' }));
    expect(onValueChange).toHaveBeenCalledWith('documents');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Documents body');
    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('AppShell panel resize', () => {
  const shell = () => render(<AppShell rail={<nav>rail</nav>} panel={<nav>panel</nav>} topBar={<header>bar</header>}>body</AppShell>);
  it('resizes with arrow keys within limits, resets on double-click and remembers the width', () => {
    localStorage.clear();
    shell();
    const handle = screen.getByRole('separator', { name: /resize side panel/i });
    expect(handle).toHaveAttribute('aria-valuenow', '240');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '256');
    fireEvent.keyDown(handle, { key: 'End' });
    expect(handle).toHaveAttribute('aria-valuenow', '420');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '420');
    expect(localStorage.getItem('yx-panel-width')).toBe('420');
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(handle).toHaveAttribute('aria-valuenow', '200');
    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute('aria-valuenow', '240');
  });
  it('dragging nearly shut collapses the panel to the rail', () => {
    localStorage.clear();
    const { container } = shell();
    const handle = screen.getByRole('separator', { name: /resize side panel/i });
    fireEvent.pointerDown(handle, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 150, pointerId: 1 });
    expect(container.querySelector('.yx-shell')).toHaveAttribute('data-panel', 'collapsed');
  });
});

describe('ScopePicker', () => {
  const two = [
    { id: 'a', name: 'Kaveri Foods Pvt Ltd', gstin: '29AAAAA0000A1Z5', state: 'Karnataka' },
    { id: 'b', name: 'Kaveri Foods (Tamil Nadu)', gstin: '33AAAAA0000A1Z5', state: 'Tamil Nadu' },
  ];
  const periods = [{ value: 's', label: 'Sep 2026' }, { value: 'a', label: 'Aug 2026', locked: true }];
  it('shows nothing when there is one entity and no period to choose', () => {
    const { container } = render(<ScopePicker entities={two.slice(0, 1)} entity="a" onEntityChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows only the period for a single-entity company', () => {
    render(<ScopePicker entities={two.slice(0, 1)} entity="a" onEntityChange={() => {}} periods={periods} period="s" />);
    expect(screen.getByRole('button', { name: /Showing Sep 2026\. Change period/ })).toBeInTheDocument();
  });
  it('marks a locked period read only', () => {
    render(<ScopePicker entities={two} entity="b" onEntityChange={() => {}} periods={periods} period="a" />);
    expect(screen.getByRole('button', { name: /Kaveri Foods \(Tamil Nadu\), Aug 2026, locked period, read only/ })).toHaveTextContent('Read only');
  });
});

describe('CommandPalette (founder review 30 Sep 2026)', () => {
  const groups: PaletteGroup[] = [
    { heading: 'Recent', recent: true, items: [{ id: 'r1', label: 'Arjun Mehta', secondary: 'QA' }] },
    { heading: 'People', prefix: '@', items: [{ id: 'p1', label: 'Arjun Mehta', secondary: 'QA' }, { id: 'p2', label: 'Anjali Iyer', secondary: 'Sales' }] },
    { heading: 'Actions', prefix: '>', items: [{ id: 'a1', label: 'Apply leave', shortcut: 'N L' }] },
  ];
  it('shows each result once, clears recent, and keeps the cursor after the typed text', async () => {
    const u = userEvent.setup();
    render(<CommandPalette groups={groups} onSelect={() => {}} defaultOpen defaultSearch="" onClearRecent={() => {}} />);
    expect(screen.getAllByRole('option', { name: /Arjun Mehta/ })).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Clear recent' }));
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: /Arjun Mehta/ })).toHaveLength(1);
  });
  it('offers Search everything and Ask AI when nothing matches', async () => {
    const u = userEvent.setup();
    const all = vi.fn();
    render(<CommandPalette groups={groups} onSelect={() => {}} defaultOpen defaultSearch="zzqx" onSearchAll={all} onAsk={() => {}} />);
    const input = screen.getByRole('combobox');
    expect((input as HTMLInputElement).selectionStart).toBe(4);
    await u.click(screen.getByRole('button', { name: /Search everything for/ }));
    expect(all).toHaveBeenCalledWith('zzqx');
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeInTheDocument();
  });
  it('runs two-key shortcuts outside text fields only', () => {
    const fn = vi.fn();
    function Probe() {
      useKeySequences({ 'N L': fn });
      return <input aria-label="field" />;
    }
    render(<Probe />);
    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: 'l' });
    expect(fn).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), { key: 'n' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), { key: 'l' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
