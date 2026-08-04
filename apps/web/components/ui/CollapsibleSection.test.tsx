import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
  it('shows its title and children when open by default', () => {
    render(
      <CollapsibleSection title="Basic details">
        <input aria-label="Title" />
      </CollapsibleSection>,
    );

    expect(screen.getByText('Basic details')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('hides its children when defaultOpen is false', () => {
    render(
      <CollapsibleSection title="Basic details" defaultOpen={false}>
        <input aria-label="Title" />
      </CollapsibleSection>,
    );

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('toggles content visibility when the header is clicked', async () => {
    render(
      <CollapsibleSection title="Basic details">
        <input aria-label="Title" />
      </CollapsibleSection>,
    );

    const header = screen.getByRole('button', { name: 'Basic details' });
    await userEvent.click(header);
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    await userEvent.click(header);
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('disables the content but keeps the header clickable when locked', async () => {
    render(
      <CollapsibleSection title="Basic details" locked>
        <input aria-label="Title" />
      </CollapsibleSection>,
    );

    expect(screen.getByLabelText('Title')).toBeDisabled();

    const header = screen.getByRole('button', { name: 'Basic details' });
    await userEvent.click(header);
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });
});
