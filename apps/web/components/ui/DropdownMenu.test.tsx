import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './DropdownMenu';

describe('DropdownMenu', () => {
  it('opens and fires the item action on click', async () => {
    const onSelect = jest.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(await screen.findByText('Archive'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
