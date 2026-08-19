import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Building2 } from 'lucide-react';
import { ListView } from './ListView';
import { type Column } from '../../../components/ui';

interface Row {
  id: string;
  name: string;
  region: string;
}

const rows: Row[] = [
  { id: '1', name: 'Acme', region: 'us' },
  { id: '2', name: 'Beta', region: 'eu' },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
  { key: 'region', header: 'Region', render: (r) => r.region, sortValue: (r) => r.region },
];

function renderListView(overrides: Partial<React.ComponentProps<typeof ListView<Row>>> = {}) {
  return render(
    <ListView<Row>
      title="Organizations"
      icon={<Building2 />}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      searchMatch={(r, q) => r.name.toLowerCase().includes(q)}
      storageKey="test-list"
      {...overrides}
    />,
  );
}

// Table marks sortable <th> with role="button", so columnheader queries do not
// match. Scope to the table instead -- also keeps the column chooser's identically
// labelled menu items out of the way.
function inTable() {
  return within(screen.getByRole('table'));
}

// Radix marks the rest of the document aria-hidden while a menu is open, which
// hides the table from role queries. Close the chooser before asserting on columns.
async function closeChooser() {
  await userEvent.keyboard('{Escape}');
}

beforeEach(() => localStorage.clear());

describe('ListView', () => {
  it('shows the title and the item count', () => {
    renderListView();
    expect(screen.getByRole('heading', { name: /Organizations/ })).toBeInTheDocument();
    expect(screen.getByTestId('list-view-meta')).toHaveTextContent('2 items');
  });

  it('filters rows by the search box and updates the count', async () => {
    renderListView();

    await userEvent.type(screen.getByRole('searchbox'), 'acme');

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByTestId('list-view-meta')).toHaveTextContent('1 item');
  });

  it('tells the user when a search matched nothing', async () => {
    renderListView();

    await userEvent.type(screen.getByRole('searchbox'), 'nothing-matches-this');

    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('names the sorted column once the user sorts', async () => {
    renderListView();

    await userEvent.click(screen.getByText('Name'));

    expect(screen.getByTestId('list-view-meta')).toHaveTextContent('Sorted by Name');
  });

  // Assert on the column header, not on any text reading "Region" -- the chooser
  // menu stays open after a toggle (so several columns can be hidden in one go),
  // and its menu item carries the same label.
  it('hides columns listed in defaultHiddenColumns and restores them from the chooser', async () => {
    renderListView({ defaultHiddenColumns: ['region'] });

    expect(inTable().queryByText('Region')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Choose Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Region' }));
    await closeChooser();

    expect(inTable().getByText('Region')).toBeInTheDocument();
  });

  it('persists column visibility across remounts', async () => {
    const { unmount } = renderListView();

    await userEvent.click(screen.getByRole('button', { name: 'Choose Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Region' }));
    await closeChooser();
    expect(inTable().queryByText('Region')).not.toBeInTheDocument();

    unmount();
    renderListView();

    expect(inTable().queryByText('Region')).not.toBeInTheDocument();
  });

  it('keeps the chooser open so several columns can be toggled in one go', async () => {
    renderListView();

    await userEvent.click(screen.getByRole('button', { name: 'Choose Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Region' }));
    // The second click only succeeds if the menu survived the first -- that IS the assertion.
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Name' }));
    await closeChooser();

    expect(inTable().queryByText('Region')).not.toBeInTheDocument();
    expect(inTable().queryByText('Name')).not.toBeInTheDocument();
  });

  it('falls back to the defaults when the stored preference is unreadable', () => {
    // A hand-edited or half-written value must not blank the whole console.
    localStorage.setItem('listview:test-list:hidden', '{not json');

    renderListView();

    expect(inTable().getByText('Name')).toBeInTheDocument();
    expect(inTable().getByText('Region')).toBeInTheDocument();
  });

  it('renders the action bar', () => {
    renderListView({ actions: <button type="button">New</button> });
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('renders caller-supplied filters beside the search box', () => {
    renderListView({ filters: <button type="button">Role: All</button> });
    expect(screen.getByRole('button', { name: 'Role: All' })).toBeInTheDocument();
  });

  it('counts the rows it was given, so a caller-side filter is reflected', () => {
    // Filtering is the caller's job; the count must follow `rows`, not some
    // internal unfiltered copy, or a filtered page would report the wrong total.
    renderListView({ rows: [rows[0]] });
    expect(screen.getByTestId('list-view-meta')).toHaveTextContent('1 item');
  });

  it('warns when the server has more rows than were fetched', () => {
    renderListView({ totalCount: 250 });
    expect(screen.getByTestId('list-view-meta')).toHaveTextContent('showing 2 of 250');
  });

  it('tells a searching user their results are incomplete, not to narrow further', async () => {
    // Narrowing cannot reveal rows that were never fetched. The real risk is the
    // user reading an incomplete result set as complete.
    renderListView({ totalCount: 250 });

    await userEvent.type(screen.getByRole('searchbox'), 'acme');

    const meta = screen.getByTestId('list-view-meta');
    expect(meta).toHaveTextContent('searched only the first 2 of 250');
    expect(meta).toHaveTextContent('there may be more matches');
    expect(meta).not.toHaveTextContent('search to reach the rest');
  });

  it('does not warn when the fetched rows are the whole set', () => {
    renderListView({ totalCount: 2 });
    expect(screen.getByTestId('list-view-meta')).not.toHaveTextContent('showing');
  });

  it('shows an error message instead of the table when isError', () => {
    renderListView({ isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load Organizations.');
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('shows a loading skeleton instead of the table when isLoading', () => {
    const { container } = renderListView({ isLoading: true });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('gives the search box an accessible name without a visible empty label', () => {
    renderListView({ searchPlaceholder: 'Search organizations…' });
    expect(screen.getByRole('searchbox')).toHaveAccessibleName('Search organizations…');
  });
});
