import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskKnowledgePage from './(app)/desk/knowledge/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Knowledge base: the designed HLP-04 knowledge base editor with `live` (Helpdesk design wiring, round 4).
const SPACE = { id: 'sp1', deskId: null, slug: 'it-help', name: 'IT help', audience: 'agents', languages: ['en'], status: 'active', version: 1, publicUrl: null, canAuthor: true, canPublish: false, canManage: false, categories: [] };
const ARTICLE = {
  id: 'a1', number: 7, spaceId: 'sp1', categoryId: null, slug: 'vpn', language: 'en', translationOfId: null, audience: 'agents', state: 'draft', title: 'VPN setup', summary: null, bodyHtml: '', seoTitle: null, seoDescription: null,
  publishedVersion: null, publishedAt: null, publishAt: null, expiresAt: null, expiryAction: 'flag', reviewDueOn: null, featured: false, outdated: false, outdatedReason: null, keywords: null, assistantUse: true, version: 1, updatedAt: '2026-10-08T00:00:00Z',
  space: { id: 'sp1', deskId: null, slug: 'it-help', name: 'IT help', audience: 'agents', languages: ['en'], status: 'active', version: 1 },
  publicUrl: null, renderedHtml: '', owner: null, sourceTicket: null, stats: { views: 0, solved: 0, yes: 0, no: 0 }, health: 50, reviewOverdue: false, following: false, translations: [],
  versions: [{ version: 1, title: 'VPN setup', summary: null, bodyHtml: '<p>Install the client.</p>', note: null, author: 'Me', mine: true, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null, publishedAt: null, createdAt: '2026-10-08T00:00:00Z', state: 'draft' }],
  canAuthor: true, canPublish: false,
};
const ROW = { id: 'a1', number: 7, spaceId: 'sp1', categoryId: null, title: 'VPN setup', language: 'en', translationOfId: null, state: 'draft', audience: 'agents', featured: false, outdated: false, waitingReview: false, owner: null, reviewDueOn: null, reviewOverdue: false, health: 50, updatedAt: '2026-10-08T00:00:00Z' };

const api = apiFetch as jest.Mock;
const replace = jest.fn();
const calls: string[] = [];
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxDeskKnowledgePage />
      </ToastProvider>
    </QueryClientProvider>,
  );
function route(over: Record<string, (init?: RequestInit) => unknown> = {}) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    const p = path.split('?')[0];
    const key = `${init?.method ?? 'GET'} ${p}`;
    if (key in over) return over[key](init);
    if (p === '/rbac/me/permissions') return ['desk.kb.author', 'desk.kb.view_internal'];
    if (p === '/desk/kb/spaces') return [SPACE];
    if (p === '/desk/kb/articles/a1') return ARTICLE;
    if (p === '/desk/kb/articles') return [ROW];
    if (p === '/desk/kb/blocks' || p === '/desk/kb/templates' || p === '/desk/desks') return [];
    throw new Error(`unexpected ${key}`);
  });
}

beforeEach(() => {
  api.mockReset();
  replace.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Knowledge base (HLP-04 live)', () => {
  it('lists the articles of the first space; a row opens the article', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
    route();
    wrap();
    expect(await screen.findByText('VPN setup')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('GET /desk/kb/articles?') && c.includes('spaceId=sp1'))).toBe(true);
    await userEvent.click(screen.getByText('VPN setup'));
    expect(replace).toHaveBeenCalledWith('/yx/desk/knowledge?article=a1');
  });

  it('opens the article named in ?article= for an author: the HLP-04 editor, Send for review and no Publish', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('article=a1'));
    route();
    wrap();
    expect(await screen.findByRole('heading', { name: 'VPN setup' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/desk/kb/articles/a1', {}, 'tok');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument();
  });

  it('Save draft saves the keywords on the article, then the words as a version', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('article=a1'));
    route({ 'PATCH /desk/kb/articles/a1': () => ({ ok: true }), 'POST /desk/kb/articles/a1/versions': () => ({ version: 1 }) });
    wrap();
    await userEvent.type(await screen.findByRole('textbox', { name: /Also suggest for these words/ }), 'vpn, remote');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST /desk/kb/articles/a1/versions'))).toBe(true));
    const patch = calls.findIndex((c) => c.startsWith('PATCH /desk/kb/articles/a1'));
    expect(calls[patch]).toContain('"keywords":"vpn, remote"');
    expect(patch).toBeLessThan(calls.findIndex((c) => c.startsWith('POST /desk/kb/articles/a1/versions')));
    expect((await screen.findAllByText('Draft saved as version 1.')).length).toBeGreaterThan(0);
  });

  it('someone without a knowledge seat (403) sees the no-access state', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
    route({ 'GET /desk/kb/spaces': () => Promise.reject(Object.assign(new Error('No access.'), { status: 403 })) });
    wrap();
    expect(await screen.findByText(/You don't have access to the knowledge base/)).toBeInTheDocument();
  });
});
