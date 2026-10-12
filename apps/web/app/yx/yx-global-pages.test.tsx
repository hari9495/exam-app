import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxCountriesPage from './(app)/settings/countries/page';
import YxTranslationsPage from './(app)/settings/translations/page';
import YxMyLanguagePage from './(app)/me/language/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Lakshmi Venkatesan', email: 'admin@kaverifoods.in' } }) }));

// Batch G1: Settings › Countries, Settings › Translations, Me › Language.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const PERMS_PATH = '/rbac/me/permissions';
const INDIA = { country: 'IN', name: 'India', version: '2026-v1', verify: true, currency: 'INR', fyStartMonth: 4, dataRegion: 'IN', normalWeekHours: '48', languages: ['en', 'hi', 'ta', 'te'], entityIds: [{ key: 'pan', required: true }], registrations: ['IN.PF'] };
const SETUP = { id: 'cs-1', country: 'IN', countryName: 'India', legalEntity: { id: 'le-1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL' }, status: 'done', version: 2, finishedAt: '2026-10-10T09:00:00Z', open: 1, checklist: [{ key: 'reg:IN.PF', label: 'PF registration decided', done: false, href: '/yx/payroll/setup' }] };

const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/settings/countries');
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('G1 pages', () => {
  it('the settings admin gets Countries and Translations in the Organisation menu', async () => {
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: ['org.settings.manage', 'org.structure.view'] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const nav = await screen.findByRole('navigation', { name: 'Menu' });
    await waitFor(() => expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(expect.arrayContaining(['Company rules', 'Countries', 'Translations'])));
  });

  it('Countries lists the guides from the API with their open items', async () => {
    route({ [`GET ${PERMS_PATH}`]: ['org.settings.manage'], 'GET /global/countries': [INDIA], 'GET /global/country-setups': [SETUP], 'GET /org/legal-entities': [], 'GET /org/settings': { registry: {}, overrides: [] } });
    wrap(<YxCountriesPage />);
    expect(await screen.findByText('India · Kaveri Foods Pvt Ltd')).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });

  it('Translations saves one language of one item', async () => {
    const put = jest.fn().mockResolvedValue({});
    route({
      [`GET ${PERMS_PATH}`]: ['org.settings.manage'],
      'GET /global/translations': { subjectType: 'leave_type', companyLanguage: 'en', languages: ['hi', 'ta', 'te'], items: [{ id: 'lt-1', name: 'Sick leave', translations: {} }] },
      'PUT /global/translations': put,
    });
    wrap(<YxTranslationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Translate Sick leave' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Hindi/ }), 'बीमारी अवकाश');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(JSON.parse(put.mock.calls[0][1].body)).toEqual({ subjectType: 'leave_type', subjectId: 'lt-1', language: 'hi', text: 'बीमारी अवकाश' });
  });

  it('Me › Language saves the person’s choice', async () => {
    const put = jest.fn().mockResolvedValue({ language: 'te', chosen: true, companyLanguage: 'en', choices: ['en', 'hi', 'ta', 'te'] });
    route({ 'GET /global/me/language': { language: 'en', chosen: false, companyLanguage: 'en', choices: ['en', 'hi', 'ta', 'te'] }, 'PUT /global/me/language': put });
    wrap(<YxMyLanguagePage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'తెలుగు (Telugu)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(JSON.parse(put.mock.calls[0][1].body)).toEqual({ language: 'te' });
  });
});
