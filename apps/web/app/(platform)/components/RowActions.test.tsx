import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowActions } from './RowActions';

describe('RowActions', () => {
  it('invokes the chosen action', async () => {
    const onSelect = jest.fn();
    render(<RowActions label="Actions for Acme" actions={[{ label: 'Switch into', onSelect }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Switch into' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there are no actions', () => {
    // Permission gating produces empty lists; a menu with nothing in it is a
    // dead control, so callers get "no menu" for free.
    const { container } = render(<RowActions label="Actions for Acme" actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('distinguishes one row\'s menu from another\'s by its label', async () => {
    render(
      <>
        <RowActions label="Actions for Acme" actions={[{ label: 'Edit', onSelect: jest.fn() }]} />
        <RowActions label="Actions for Beta" actions={[{ label: 'Edit', onSelect: jest.fn() }]} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Actions for Acme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Beta' })).toBeInTheDocument();
  });

  it('fires only the action that was chosen', async () => {
    const edit = jest.fn();
    const remove = jest.fn();
    render(
      <RowActions
        label="Actions for Acme"
        actions={[
          { label: 'Edit', onSelect: edit },
          { label: 'Delete', onSelect: remove, danger: true },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });
});
