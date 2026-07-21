import { render, screen } from '@testing-library/react';
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
});
