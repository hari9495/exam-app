import { render, screen, fireEvent } from '@testing-library/react';
import type { ApprovalEmailTemplateSlot } from '../../../../../lib/hooks/useApprovalEmailTemplates';
import { useApprovalEmailTemplates, useUpsertApprovalEmailTemplate } from '../../../../../lib/hooks/useApprovalEmailTemplates';
import V2ApprovalEmailsSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useApprovalEmailTemplates', () => {
  const actual = jest.requireActual('../../../../../lib/hooks/useApprovalEmailTemplates');
  return {
    ...actual,
    useApprovalEmailTemplates: jest.fn(),
    useUpsertApprovalEmailTemplate: jest.fn(),
  };
});

const SLOTS: ApprovalEmailTemplateSlot[] = [
  { eventType: 'approval.requested', subject: null, body: null, enabled: true },
  { eventType: 'approval.approved', subject: 'Approved!', body: 'Your request was approved.', enabled: true },
  { eventType: 'approval.rejected', subject: null, body: null, enabled: false },
  { eventType: 'approval.cancelled', subject: null, body: null, enabled: true },
];

describe('V2ApprovalEmailsSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpsertApprovalEmailTemplate as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders the four event sections from the fetched list', () => {
    (useApprovalEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2ApprovalEmailsSettingsPage />);

    expect(screen.getByText('Approval requested')).toBeInTheDocument();
    expect(screen.getByText('Approval approved')).toBeInTheDocument();
    expect(screen.getByText('Approval rejected')).toBeInTheDocument();
    expect(screen.getByText('Approval cancelled')).toBeInTheDocument();
    expect(screen.getByLabelText('Approval approved subject')).toHaveValue('Approved!');
    expect(screen.getByLabelText('Approval approved body')).toHaveValue('Your request was approved.');
    expect(screen.getByLabelText('Approval rejected enabled')).not.toBeChecked();
    expect(screen.getByLabelText('Approval requested enabled')).toBeChecked();
  });

  it('lists the available template variables', () => {
    (useApprovalEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2ApprovalEmailsSettingsPage />);

    for (const token of ['{{actorName}}', '{{subjectLabel}}', '{{contextText}}', '{{link}}']) {
      expect(screen.getAllByText(token).length).toBeGreaterThan(0);
    }
  });

  it('editing a section body and Save fires the upsert with that eventType + subject/body/enabled', () => {
    (useApprovalEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2ApprovalEmailsSettingsPage />);

    fireEvent.change(screen.getByLabelText('Approval approved body'), { target: { value: 'Updated body text.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Approval approved' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        eventType: 'approval.approved',
        subject: 'Approved!',
        body: 'Updated body text.',
        enabled: true,
      },
      expect.anything(),
    );
  });

  it('toggling enabled and Save includes the change in the payload', () => {
    (useApprovalEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2ApprovalEmailsSettingsPage />);

    fireEvent.click(screen.getByLabelText('Approval requested enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Approval requested' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'approval.requested', enabled: false }),
      expect.anything(),
    );
  });
});
