import { renderHook, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useColumnVisibility } from './ColumnChooser';
import type { Column } from './Table';

interface Row {
  id: string;
  name: string;
  region: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'region', header: 'Region', render: (r) => r.region },
  // A blank-header layout slot (row actions), same shape used across the app.
  { key: 'actions', header: '', render: () => null },
];

function Harness({ storageKey = 'chooser-test', defaultHidden = [] as string[] }) {
  const { visibleColumns, chooser } = useColumnVisibility('' + storageKey, columns, defaultHidden);
  return (
    <div>
      <p data-testid="visible">{visibleColumns.map((c) => c.key).join(',')}</p>
      {chooser}
    </div>
  );
}

beforeEach(() => localStorage.clear());

describe('useColumnVisibility', () => {
  it('starts with every column visible when nothing is persisted', () => {
    render(<Harness />);
    expect(screen.getByTestId('visible')).toHaveTextContent('name,region,actions');
  });

  it('omits the blank-header column from the chooser menu', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Choose Columns' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Region' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: '' })).not.toBeInTheDocument();
  });

  it('hides a column when toggled off, and persists it under the listview: prefix', async () => {
    render(<Harness storageKey="chooser-persist" />);
    await userEvent.click(screen.getByRole('button', { name: 'Choose Columns' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Region' }));

    expect(screen.getByTestId('visible')).toHaveTextContent('name,actions');
    expect(JSON.parse(localStorage.getItem('listview:chooser-persist:hidden') as string)).toEqual(['region']);
  });

  it('reads a previously persisted hidden set on mount', () => {
    localStorage.setItem('listview:chooser-restore:hidden', JSON.stringify(['name']));
    render(<Harness storageKey="chooser-restore" />);
    expect(screen.getByTestId('visible')).toHaveTextContent('region,actions');
  });

  it('falls back to the default set when the persisted value is malformed', () => {
    localStorage.setItem('listview:chooser-bad:hidden', '{not json');
    render(<Harness storageKey="chooser-bad" defaultHidden={['region']} />);
    expect(screen.getByTestId('visible')).toHaveTextContent('name,actions');
  });

  it('returns visibleColumns directly from the hook without needing the chooser rendered', () => {
    const { result } = renderHook(() => useColumnVisibility('chooser-hookonly', columns));
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['name', 'region', 'actions']);
  });
});
