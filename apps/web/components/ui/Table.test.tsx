import { render, screen, fireEvent } from '@testing-library/react';
import { Table, type Column } from './Table';

interface Row {
  id: string;
  name: string;
  score: number;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (row) => row.name, sortValue: (row) => row.name },
  { key: 'score', header: 'Score', render: (row) => String(row.score), sortValue: (row) => row.score },
];
const rows: Row[] = [
  { id: '1', name: 'Bravo', score: 10 },
  { id: '2', name: 'Alpha', score: 20 },
];

describe('Table', () => {
  it('renders every row and sorts ascending when a sortable header is clicked', () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 rows
    fireEvent.click(screen.getByText('Name'));
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Alpha');
  });

  it('shows the empty message when there are no rows', () => {
    render(<Table columns={columns} rows={[]} rowKey={(row) => row.id} emptyMessage="No candidates yet." />);
    expect(screen.getByText('No candidates yet.')).toBeInTheDocument();
  });

  it('sorts via keyboard and exposes aria-sort on the active sortable header', () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const header = screen.getByText('Name').closest('th')!;

    expect(header).toHaveAttribute('tabIndex', '0');
    expect(header).toHaveAttribute('role', 'button');
    expect(header).toHaveAttribute('aria-sort', 'none');

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('Alpha');
    expect(header).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('Bravo');
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });
});
