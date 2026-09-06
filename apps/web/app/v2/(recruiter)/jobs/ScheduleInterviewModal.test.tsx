import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useCreateInterview, useSendInterview } from '../../../../lib/hooks/useInterviews';
import { useUsers } from '../../../../lib/hooks/useUsers';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';
import { useBusinessHours } from '../../../../lib/hooks/useBusinessHours';
import { useToast } from '../../../../components/ui';

// The ui-v2 barrel's `export ... from './DataTable'` pulls in @tanstack/react-table (a pure-ESM
// package) which breaks the ts-jest CJS transform. Stub the DataTable submodule so the barrel's
// other real exports (Dialog, TextField, Combobox, Button) still render. This modal only uses
// `dt` and `Cb`; keep Cb functional so any checkbox the modal renders still works.
jest.mock('../../../../components/ui-v2/DataTable', () => ({
  __esModule: true,
  DataTable: () => null,
  DT_FEATURES: {},
  SortHead: () => null,
  Pill: () => null,
  dt: { th: {}, td: {}, toolBtn: {}, iconBtn: {}, primaryBtn: {}, muted: {}, bulkBar: {} },
  Cb: ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  ),
}));

jest.mock('../../../../lib/hooks/useCurrentUser');
jest.mock('../../../../lib/hooks/useInterviews');
jest.mock('../../../../lib/hooks/useUsers');
jest.mock('../../../../lib/hooks/useIntegrations');
jest.mock('../../../../lib/hooks/useBusinessHours');
jest.mock('../../../../components/ui', () => ({
  ...jest.requireActual('../../../../components/ui'),
  useToast: jest.fn(),
}));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseCreateInterview = useCreateInterview as jest.Mock;
const mockUseSendInterview = useSendInterview as jest.Mock;
const mockUseUsers = useUsers as jest.Mock;
const mockUseIntegrations = useIntegrations as jest.Mock;
const mockUseBusinessHours = useBusinessHours as jest.Mock;
const mockUseToast = useToast as jest.Mock;

// Shared safe defaults for the hooks every render touches.
function setCommonDefaults() {
  mockUseCreateInterview.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  mockUseSendInterview.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  mockUseUsers.mockReturnValue({ data: { data: [] } });
  mockUseToast.mockReturnValue({ toast: jest.fn() });
}

const BUSINESS_HOURS = {
  timeZone: 'Asia/Kolkata',
  days: {
    mon: { enabled: true, open: '09:00', close: '18:00' },
    tue: { enabled: true, open: '09:00', close: '18:00' },
    wed: { enabled: true, open: '09:00', close: '18:00' },
    thu: { enabled: true, open: '09:00', close: '18:00' },
    fri: { enabled: true, open: '09:00', close: '18:00' },
    sat: { enabled: false, open: '09:00', close: '18:00' },
    sun: { enabled: false, open: '09:00', close: '18:00' },
  },
};
const HOLIDAYS = [{ date: '2026-01-26', name: 'Republic Day' }];

function renderModal() {
  render(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);
}

function setSlotStart(value: string) {
  const startInput = screen.getByLabelText('Start 1');
  fireEvent.change(startInput, { target: { value } });
}

describe('ScheduleInterviewModal off-hours/holiday warning', () => {
  beforeEach(() => {
    setCommonDefaults();
    mockUseIntegrations.mockReturnValue({ data: { smtpConfigured: true }, isSuccess: true });
    // No stored recruiter timezone -> modal falls back to the browser zone (as before this merge).
    mockUseCurrentUser.mockReturnValue({ data: undefined });
    mockUseBusinessHours.mockReset();
  });

  it('shows "Outside business hours" for a slot set outside configured hours', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isError: false });
    renderModal();
    // Tue 2026-01-27 20:00 IST -- after the 18:00 close.
    setSlotStart('2026-01-27T20:00');
    expect(screen.getByText(/Outside business hours/i)).toBeInTheDocument();
  });

  it('shows "On a holiday: {name}" for a slot set on a configured holiday', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isError: false });
    renderModal();
    // Mon 2026-01-26 10:00 IST -- Republic Day, within hours.
    setSlotStart('2026-01-26T10:00');
    expect(screen.getByText(/On a holiday: Republic Day/i)).toBeInTheDocument();
  });

  it('shows no hint for an in-hours weekday slot', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isError: false });
    renderModal();
    // Tue 2026-01-27 10:00 IST -- within hours, not a holiday.
    setSlotStart('2026-01-27T10:00');
    expect(screen.queryByText(/Outside business hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On a holiday/i)).not.toBeInTheDocument();
  });

  it('shows no hint when business hours are unset (null config)', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: null, holidays: [] }, isError: false });
    renderModal();
    setSlotStart('2026-01-27T20:00');
    expect(screen.queryByText(/Outside business hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On a holiday/i)).not.toBeInTheDocument();
  });

  it('shows no hint when useBusinessHours errors', () => {
    mockUseBusinessHours.mockReturnValue({ data: undefined, isError: true });
    renderModal();
    setSlotStart('2026-01-27T20:00');
    expect(screen.queryByText(/Outside business hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On a holiday/i)).not.toBeInTheDocument();
  });
});

describe('ScheduleInterviewModal timezone default', () => {
  beforeEach(() => {
    setCommonDefaults();
    mockUseIntegrations.mockReturnValue({ data: undefined, isSuccess: false });
    // Safe default so the modal's useBusinessHours() call has a shape to destructure (no warning).
    mockUseBusinessHours.mockReturnValue({ data: undefined, isError: false });
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
