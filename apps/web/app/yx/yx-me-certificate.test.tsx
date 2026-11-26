import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxCertificatePage from './(app)/me/documents/certificate/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: 'http://api.test' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// T2-F item 78: the bonafide certificate, when the company switched it on, is asked for like the others.
const api = apiFetch as jest.Mock;
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><YxCertificatePage /></ToastProvider></QueryClientProvider>);
const KIND = (letterType: string, name: string) => ({ letterType, name, requiresApproval: false, pending: null });

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/me/documents/certificate');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/me/documents/certificate (T2-F item 78)', () => {
  it('offers the bonafide certificate the company switched on and sends that kind', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return [];
      if (path === '/letters/me/certificates' && init?.method === 'POST') return (posted.push(JSON.parse(String(init.body))), { id: 'l1', title: 'Bonafide certificate: Divya', letterType: 'bonafide_certificate', personId: 'p', referenceNo: 'KF/1', verifyCode: 'X', status: 'issued', renderError: null, issuedAt: '2026-11-27T05:00:00Z', personSigns: false, acceptedAt: null, signature: null, supersededById: null });
      if (path === '/letters/me/certificates') return [KIND('employment_certificate', 'Employment certificate'), KIND('bonafide_certificate', 'Bonafide certificate')];
      return [];
    });
    wrap();
    await userEvent.click(await screen.findByRole('radio', { name: 'Bonafide certificate' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Purpose' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Home loan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate certificate' }));
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ letterType: 'bonafide_certificate' })]));
  });

  it('negative: not switched on, it is not offered', async () => {
    api.mockImplementation(async (path: string) => (path === '/letters/me/certificates' ? [KIND('employment_certificate', 'Employment certificate')] : []));
    wrap();
    expect(await screen.findByRole('radio', { name: 'Employment certificate' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Bonafide certificate' })).toBeNull();
  });
});
