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

  it('sits on the paper surface with a rule hairline and no drop-shadow', () => {
    render(
      <CollapsibleSection title="Basic details">
        <input aria-label="Title" />
      </CollapsibleSection>,
    );
    const container = screen.getByRole('button', { name: 'Basic details' }).parentElement as HTMLElement;
    expect(container.className).toContain('border-rule');
    expect(container.className).toContain('bg-paper');
    expect(container.className).not.toContain('shadow');
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

  it('keeps alwaysEditable content interactive even when locked, unlike the regular children', () => {
    render(
      <CollapsibleSection
        title="Scheduling & access"
        locked
        alwaysEditable={<input aria-label="Walk-in toggle" />}
      >
        <input aria-label="Window Opens" />
      </CollapsibleSection>,
    );

    expect(screen.getByLabelText('Window Opens')).toBeDisabled();
    expect(screen.getByLabelText('Walk-in toggle')).toBeEnabled();
  });
});
