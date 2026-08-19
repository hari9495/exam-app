import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectedAppsSection } from './ConnectedAppsSection';
import { ToastProvider } from '../ui';
import * as useConnectedAppsModule from '../../lib/hooks/useConnectedApps';
import { ConnectedAppRow } from '../../lib/types';

jest.mock('../../lib/hooks/useConnectedApps');

const mocked = useConnectedAppsModule as jest.Mocked<typeof useConnectedAppsModule>;

const SLACK_ROW: ConnectedAppRow = {
  id: 'ca-1',
  type: 'slack',
  label: 'Recruiting Slack',
  events: ['invitation.created', 'attempt.submitted'],
  status: 'active',
  lastDeliveryAt: '2026-08-01T00:00:00.000Z',
  lastError: null,
  urlHint: '****',
};

const TEAMS_ROW: ConnectedAppRow = {
  id: 'ca-2',
  type: 'msteams',
  label: 'Hiring Teams channel',
  events: ['offer.accepted'],
  status: 'disabled',
  lastDeliveryAt: null,
  lastError: 'timeout',
  urlHint: '****',
};

function mutationStub<T>() {
  return { mutate: jest.fn(), isPending: false } as unknown as T;
}

function renderSection() {
  return render(
    <ToastProvider>
      <ConnectedAppsSection />
    </ToastProvider>,
  );
}

describe('ConnectedAppsSection', () => {
  beforeEach(() => {
    mocked.useConnectedApps.mockReturnValue({ data: [SLACK_ROW, TEAMS_ROW] } as unknown as ReturnType<typeof useConnectedAppsModule.useConnectedApps>);
    mocked.useCreateConnectedApp.mockReturnValue(mutationStub<ReturnType<typeof useConnectedAppsModule.useCreateConnectedApp>>());
    mocked.useUpdateConnectedApp.mockReturnValue(mutationStub<ReturnType<typeof useConnectedAppsModule.useUpdateConnectedApp>>());
    mocked.useDeleteConnectedApp.mockReturnValue(mutationStub<ReturnType<typeof useConnectedAppsModule.useDeleteConnectedApp>>());
    mocked.useTestConnectedApp.mockReturnValue(mutationStub<ReturnType<typeof useConnectedAppsModule.useTestConnectedApp>>());
  });

  it('renders both the Slack and Teams rows with their event chips', () => {
    renderSection();

    expect(screen.getByText('Recruiting Slack')).toBeInTheDocument();
    expect(screen.getByText('Hiring Teams channel')).toBeInTheDocument();

    expect(screen.getByText('Candidate invited')).toBeInTheDocument();
    expect(screen.getByText('Candidate finished exam')).toBeInTheDocument();
    expect(screen.getByText('Offer accepted')).toBeInTheDocument();
  });

  it('renders the urlHint for each row', () => {
    renderSection();

    expect(screen.getAllByText('****')).toHaveLength(2);
  });

  it('opens the Add modal with all 8 event checkboxes', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Add connected app' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const expectedLabels = [
      'Candidate invited',
      'Candidate finished exam',
      'Results ready',
      'Integrity flag raised',
      'Interview confirmed',
      'Offer accepted',
      'New applicant',
      'AI fit score ready',
    ];
    for (const label of expectedLabels) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }
  });
});
