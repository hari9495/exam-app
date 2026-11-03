import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiFetchAnonymous } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxSpeakUpPage from './(app)/desk/speakup/page';
import YxSpeakUpSetupPage from './(app)/desk/speakup-setup/page';
import YxCheckReportPage from './speakup/[org]/check/page';
import YxLayout from './layout';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchAnonymous: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Speak up (HLP-06): the designed screens with `live`; the anonymous report goes without the sign-in.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const anon = apiFetchAnonymous as jest.Mock;
const FORM = { company: 'Kaveri Foods', org: 'kaveri', anonymous: 'all', categories: { grievance: ['Transport'], whistleblower: ['Fraud or theft'] }, locations: [], officers: [], ready: { grievance: true, whistleblower: true, posh: true }, posh: null, ackDays: 2, me: 'Divya' };
const FILED = { id: 'c1', number: 'GRV-0001', kind: 'grievance', routedTo: 'ethics', team: 'the ethics team', late: false, clock: [{ key: 'ack', label: 'Acknowledgement', due: '2026-11-05' }], source: null };
const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });

beforeEach(() => {
  api.mockReset();
  anon.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Speak up (HLP-06 live)', () => {
  it('a named grievance goes with the sign-in', async () => {
    api.mockImplementation(async (path: string) => (path === '/desk/speakup/form' ? FORM : FILED));
    wrap(<YxSpeakUpPage />);
    await userEvent.type(await screen.findByRole('textbox', { name: /What happened/ }), 'The cab skipped my stop three times.');
    await userEvent.click(screen.getByRole('button', { name: 'File report' }));
    expect(await screen.findByText('Grievance GRV-0001 is filed')).toBeInTheDocument();
    const call = api.mock.calls.find(([p]) => p === '/desk/speakup/reports')!;
    expect(call[2]).toBe('tok');
    expect(anon).not.toHaveBeenCalled();
  });

  it('an anonymous report goes through the no-login route and shows the reply code', async () => {
    api.mockResolvedValue(FORM);
    anon.mockResolvedValue({ ...FILED, number: 'GRV-0002', code: 'ABCD-EFGH-JKLM-NPQR' });
    wrap(<YxSpeakUpPage />);
    await userEvent.click(await screen.findByRole('radio', { name: /Anonymously/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /What happened/ }), 'The cab skipped my stop three times.');
    await userEvent.click(screen.getByRole('button', { name: 'File report' }));
    expect(await screen.findByText('ABCD-EFGH-JKLM-NPQR')).toBeInTheDocument();
    expect(anon).toHaveBeenCalledWith('/desk/speakup/public/reports', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(anon.mock.calls[0][1].body)).toMatchObject({ org: 'kaveri', kind: 'grievance' });
    expect(api.mock.calls.some(([p]) => p === '/desk/speakup/reports')).toBe(false);
  });

  it('check my report opens with the code, without the sign-in', async () => {
    (useParams as jest.Mock).mockReturnValue({ org: 'kaveri' });
    anon.mockImplementation(async (path: string) => (path.includes('/company/') ? { company: 'Kaveri Foods' } : { number: 'WB-0001', kind: 'whistleblower', status: 'received', filedAt: '2026-11-03T05:00:00Z', team: 'the ethics team', messages: [] }));
    // Only the YukthiX layout above it: the public page sits outside the signed-in layout.
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><YxLayout><YxCheckReportPage /></YxLayout></QueryClientProvider>);
    await userEvent.type(screen.getByRole('textbox', { name: /Reply code/ }), 'ABCD-EFGH-JKLM-NPQR');
    await userEvent.click(screen.getByRole('button', { name: 'Open my report' }));
    expect(await screen.findByText('Report WB-0001')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('set-up without the key shows no access', async () => {
    api.mockRejectedValue(forbidden);
    wrap(<YxSpeakUpSetupPage />);
    expect(await screen.findByText(/HR does not/)).toBeInTheDocument();
  });
});
