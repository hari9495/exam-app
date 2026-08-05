import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManageWalkInGroupModal } from './ManageWalkInGroupModal';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';
import { WalkInGroup } from '../lib/types';

jest.mock('../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org' }) }));

const GROUP: WalkInGroup = {
  id: 'group-1',
  name: 'Fresher Drive Hackathon',
  createdAt: '2026-08-01T00:00:00.000Z',
  exams: [{ id: 'exam-1', title: 'ServiceNow Fresher Drive Hackathon' }],
};

const ELIGIBLE_EXAMS = [
  { id: 'exam-1', title: 'ServiceNow Fresher Drive Hackathon', walkInGroupId: 'group-1' },
  { id: 'exam-2', title: 'Salesforce Fresher Drive Hackathon', walkInGroupId: null },
  { id: 'exam-3', title: 'Backend Round', walkInGroupId: 'group-2' },
];

const ALL_GROUPS = [
  GROUP,
  { id: 'group-2', name: 'Backend Roles', createdAt: '2026-08-01T00:00:00.000Z', exams: [{ id: 'exam-3', title: 'Backend Round' }] },
];

function renderModal(onClose = jest.fn()) {
  return render(
    <QueryProvider>
      <ToastProvider>
        <ManageWalkInGroupModal group={GROUP} orgSlug="demo-org" onClose={onClose} />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/walk-in-groups/eligible-exams')) {
      return new Response(JSON.stringify(ELIGIBLE_EXAMS), { status: 200 });
    }
    if (urlStr.endsWith('/walk-in-groups')) {
      return new Response(JSON.stringify(ALL_GROUPS), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('ManageWalkInGroupModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('prefills the name field and shows the group-specific share link', async () => {
    mockFetch();
    renderModal();

    expect(screen.getByLabelText('Group name')).toHaveValue('Fresher Drive Hackathon');
    await waitFor(() => {
      expect(screen.getByText(/\/walk-in\/demo-org\?group=group-1/)).toBeInTheDocument();
    });
  });

  it('lists every walk-in-enabled exam, checked for the ones already in this group', async () => {
    mockFetch();
    renderModal();

    expect(await screen.findByLabelText('ServiceNow Fresher Drive Hackathon')).toBeChecked();
    expect(screen.getByLabelText('Salesforce Fresher Drive Hackathon')).not.toBeChecked();
  });

  it('labels an exam already in a different group, so reassigning it is not a surprise', async () => {
    mockFetch();
    renderModal();

    expect(await screen.findByLabelText('Backend Round (currently in "Backend Roles")')).toBeInTheDocument();
  });

  it('renames the group via the Save name button', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/walk-in-groups/group-1') && options?.method === 'PATCH'
        ? new Response(JSON.stringify({ ...GROUP, name: 'Renamed Group' }), { status: 200 })
        : null,
    );
    renderModal();
    await screen.findByLabelText('ServiceNow Fresher Drive Hackathon');

    const nameInput = screen.getByLabelText('Group name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed Group');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith('/walk-in-groups/group-1') && call[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall![1]?.body))).toEqual({ name: 'Renamed Group' });
    });
    expect(await screen.findByText('Group renamed.')).toBeInTheDocument();
  });

  it('saves the full selected exam list via Save members, including a newly checked exam', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/walk-in-groups/group-1/exams') && options?.method === 'PUT'
        ? new Response(JSON.stringify({ ...GROUP, exams: [] }), { status: 200 })
        : null,
    );
    renderModal();
    await screen.findByLabelText('ServiceNow Fresher Drive Hackathon');

    await userEvent.click(screen.getByLabelText('Salesforce Fresher Drive Hackathon'));
    await userEvent.click(screen.getByRole('button', { name: 'Save members' }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith('/walk-in-groups/group-1/exams') && call[1]?.method === 'PUT',
      );
      expect(putCall).toBeDefined();
      expect(JSON.parse(String(putCall![1]?.body)).examIds.sort()).toEqual(['exam-1', 'exam-2']);
    });
    expect(await screen.findByText('Group members updated.')).toBeInTheDocument();
  });
});
