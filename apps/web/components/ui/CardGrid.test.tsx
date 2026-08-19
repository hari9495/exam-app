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

  it('renders cards on a hairline surface, not a soft-shadow card', () => {
    const items: Item[] = [{ id: '1', name: 'Alpha' }];
    render(<CardGrid items={items} cardKey={(item) => item.id} renderCard={(item) => <span>{item.name}</span>} />);
    const card = screen.getByText('Alpha').parentElement as HTMLElement;
    expect(card.className).toContain('border-rule');
    expect(card.className).toContain('bg-paper');
    expect(card.className).not.toContain('shadow');
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

      await userEvent.click(screen.getByRole('combobox', { name: 'Sort By' }));
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

      await userEvent.click(screen.getByRole('combobox', { name: 'Sort By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Name' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));

      expect(renderNames()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('does not render a sort toolbar when sortOptions is omitted', () => {
      render(<CardGrid items={items} cardKey={(item) => item.id} renderCard={(item) => <span>{item.name}</span>} />);

      expect(screen.queryByRole('combobox', { name: 'Sort By' })).not.toBeInTheDocument();
    });
  });
});
