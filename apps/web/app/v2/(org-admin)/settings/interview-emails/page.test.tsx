import { render, screen, fireEvent } from '@testing-library/react';
import type { InterviewEmailTemplateSlot } from '../../../../../lib/hooks/useInterviewEmailTemplates';
import { useInterviewEmailTemplates, useUpsertInterviewEmailTemplate } from '../../../../../lib/hooks/useInterviewEmailTemplates';
import V2InterviewEmailsSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useInterviewEmailTemplates', () => {
  const actual = jest.requireActual('../../../../../lib/hooks/useInterviewEmailTemplates');
  return {
    ...actual,
    useInterviewEmailTemplates: jest.fn(),
    useUpsertInterviewEmailTemplate: jest.fn(),
  };
});

const SLOTS: InterviewEmailTemplateSlot[] = [
  { eventType: 'invite', subject: 'Come interview', body: 'Hi there.', enabled: true },
  { eventType: 'cancellation', subject: null, body: null, enabled: false },
];

describe('V2InterviewEmailsSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpsertInterviewEmailTemplate as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders a section for every event type, merging fetched values', () => {
    (useInterviewEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2InterviewEmailsSettingsPage />);

    expect(screen.getByText('Candidate invitation')).toBeInTheDocument();
    expect(screen.getByText('Panelist assignment')).toBeInTheDocument();
    expect(screen.getByText('Cancellation (candidate)')).toBeInTheDocument();
    expect(screen.getByLabelText('Candidate invitation subject')).toHaveValue('Come interview');
    expect(screen.getByLabelText('Candidate invitation body')).toHaveValue('Hi there.');
    expect(screen.getByLabelText('Cancellation (candidate) enabled')).not.toBeChecked();
    expect(screen.getByLabelText('Candidate invitation enabled')).toBeChecked();
  });

  it('shows the per-event merge variables', () => {
    (useInterviewEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2InterviewEmailsSettingsPage />);

    // invite carries {{confirmLink}}; cancellation does not.
    expect(screen.getAllByText('{{confirmLink}}').length).toBe(1);
    expect(screen.getAllByText('{{jobTitle}}').length).toBeGreaterThan(1);
  });

  it('editing a body and Save fires the upsert with that eventType + subject/body/enabled', () => {
    (useInterviewEmailTemplates as jest.Mock).mockReturnValue({ data: SLOTS, isLoading: false });

    render(<V2InterviewEmailsSettingsPage />);

    fireEvent.change(screen.getByLabelText('Candidate invitation body'), { target: { value: 'Updated body.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Candidate invitation' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { eventType: 'invite', subject: 'Come interview', body: 'Updated body.', enabled: true },
      expect.anything(),
    );
  });
});
