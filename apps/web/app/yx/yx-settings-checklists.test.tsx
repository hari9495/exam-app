import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxChecklistsPage from './(app)/settings/checklists/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// T2-F item 43: a checklist applies to an employment type (and place); saved through the template route.
const api = apiFetch as jest.Mock;
const TEMPLATE = { id: 't1', kind: 'onboarding', name: 'Joining', legalEntityId: null, locationId: null, departmentId: null, employmentTypeId: null, starterKey: 'onboarding_standard', active: true, version: 2, tasks: [{ key: 'pan', title: 'Collect PAN', ownerType: 'hr', ownerUserId: null, ownerGroupId: null, kind: 'tick', config: {}, dueOffsetDays: 0, dependsOn: [], required: false, locked: false }] };
const OPTIONS = { teams: [], catalogItems: [], legalEntities: [], locations: [], departments: [], employmentTypes: [{ value: 'et1', label: 'Apprentice' }] };

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/settings/checklists');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><YxChecklistsPage /></ToastProvider></QueryClientProvider>);

describe('/yx/settings/checklists (T2-F item 43)', () => {
  it('saves the employment type a checklist applies to', async () => {
    const put: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return (put.push(JSON.parse(String(init.body))), TEMPLATE);
      if (path === '/lifecycle/journey-templates') return { templates: [TEMPLATE], starters: [] };
      if (path === '/lifecycle/journey-templates/options') return OPTIONS;
      return [];
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit checklist' }));
    const sheet = screen.getByRole('dialog');
    await userEvent.click(within(sheet).getByRole('combobox', { name: 'Employment type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Apprentice' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save checklist' }));
    await waitFor(() => expect(put).toEqual([expect.objectContaining({ employmentTypeId: 'et1', departmentId: null })]));
  });

  it('negative: a checklist left for any type saves no type', async () => {
    const put: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return (put.push(JSON.parse(String(init.body))), TEMPLATE);
      if (path === '/lifecycle/journey-templates') return { templates: [TEMPLATE], starters: [] };
      if (path === '/lifecycle/journey-templates/options') return OPTIONS;
      return [];
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit checklist' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save checklist' }));
    await waitFor(() => expect(put).toEqual([expect.objectContaining({ employmentTypeId: null })]));
  });
});
