import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useCreateInterview, useSendInterview } from '../../../../lib/hooks/useInterviews';
import { useUsers } from '../../../../lib/hooks/useUsers';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';
import { useToast } from '../../../../components/ui';

// DataTable pulls in @tanstack/react-table, an ESM-only package Jest can't require via the
// ui-v2 barrel; stub it out so importing the barrel for Dialog/TextField/Combobox/Button
// doesn't drag it in. ScheduleInterviewModal only actually uses `dt.toolBtn` and `Cb`.
jest.mock('../../../../components/ui-v2/DataTable', () => ({
  __esModule: true,
  DataTable: () => null,
  DT_FEATURES: {},
  SortHead: () => null,
  Pill: () => null,
  dt: { th: {}, td: {}, toolBtn: {}, iconBtn: {}, primaryBtn: {}, muted: {}, bulkBar: {} },
  Cb: () => null,
}));

jest.mock('../../../../lib/hooks/useCurrentUser');
jest.mock('../../../../lib/hooks/useInterviews');
jest.mock('../../../../lib/hooks/useUsers');
jest.mock('../../../../lib/hooks/useIntegrations');
jest.mock('../../../../components/ui', () => ({
  ...jest.requireActual('../../../../components/ui'),
  useToast: jest.fn(),
}));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseCreateInterview = useCreateInterview as jest.Mock;
const mockUseSendInterview = useSendInterview as jest.Mock;
const mockUseUsers = useUsers as jest.Mock;
const mockUseIntegrations = useIntegrations as jest.Mock;
const mockUseToast = useToast as jest.Mock;

describe('ScheduleInterviewModal timezone default', () => {
  beforeEach(() => {
    mockUseCreateInterview.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockUseSendInterview.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockUseUsers.mockReturnValue({ data: { data: [] } });
    mockUseIntegrations.mockReturnValue({ data: undefined, isSuccess: false });
    mockUseToast.mockReturnValue({ toast: jest.fn() });
  });

  it("defaults the timezone control to the recruiter's stored timeZone", () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'u1', timeZone: 'Asia/Kolkata' } });

    render(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);

    expect(screen.getByText('India (Asia/Kolkata)')).toBeInTheDocument();
  });

  it('falls back to the browser timezone when the recruiter has none stored', () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'u1', timeZone: null } });
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: 'Europe/London' }) }) as unknown as Intl.DateTimeFormat,
    );

    render(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);

    expect(screen.getByText('London (Europe/London)')).toBeInTheDocument();

    jest.restoreAllMocks();
  });

  it('adds the user timezone to the picker options when not in the curated list', () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'u1', timeZone: 'Asia/Tokyo' } });

    render(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);

    expect(screen.getByText('Asia/Tokyo')).toBeInTheDocument();
  });

  it('keeps a manually chosen timezone when the current-user timezone loads late with a different value', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: 'UTC' }) }) as unknown as Intl.DateTimeFormat,
    );
    // No stored timezone yet -- current-user query hasn't resolved, so it seeds from the browser.
    mockUseCurrentUser.mockReturnValue({ data: { id: 'u1', timeZone: null } });

    const { rerender } = render(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);

    // Recruiter manually picks a zone via the Combobox.
    fireEvent.click(screen.getByRole('button', { name: 'UTC' }));
    fireEvent.click(screen.getByText('Eastern (America/New_York)'));
    expect(screen.getByRole('button', { name: 'Eastern (America/New_York)' })).toBeInTheDocument();

    // current-user query resolves late, with a *different* stored timezone.
    mockUseCurrentUser.mockReturnValue({ data: { id: 'u1', timeZone: 'Asia/Kolkata' } });
    rerender(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);

    // The manual choice must survive -- the late user load must not clobber it.
    expect(screen.getByRole('button', { name: 'Eastern (America/New_York)' })).toBeInTheDocument();
    expect(screen.queryByText('India (Asia/Kolkata)')).not.toBeInTheDocument();

    jest.restoreAllMocks();
  });
});
