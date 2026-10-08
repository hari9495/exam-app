import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskKnowledgePage from './(app)/desk/knowledge/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

const SPACE = { id: 'sp1', deskId: null, slug: 'it-help', name: 'IT help', audience: 'agents', languages: ['en'], status: 'active', version: 1, publicUrl: null, canAuthor: true, canPublish: false, canManage: false, categories: [] };
const ARTICLE = {
  id: 'a1', number: 7, spaceId: 'sp1', categoryId: null, slug: 'vpn', language: 'en', translationOfId: null, audience: 'agents', state: 'draft', title: 'VPN setup', summary: null, bodyHtml: '', seoTitle: null, seoDescription: null,
  publishedVersion: null, publishedAt: null, publishAt: null, expiresAt: null, expiryAction: 'flag', reviewDueOn: null, featured: false, outdated: false, outdatedReason: null, version: 1, updatedAt: '2026-10-08T00:00:00Z',
  space: { id: 'sp1', deskId: null, slug: 'it-help', name: 'IT help', audience: 'agents', languages: ['en'], status: 'active', version: 1 },
  publicUrl: null, renderedHtml: '', owner: null, sourceTicket: null, stats: { views: 0, solved: 0, yes: 0, no: 0 }, health: 50, reviewOverdue: false, following: false, translations: [],
  versions: [{ version: 1, title: 'VPN setup', summary: null, bodyHtml: '<p>Install the client.</p>', note: null, author: 'Me', mine: true, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null, publishedAt: null, createdAt: '2026-10-08T00:00:00Z', state: 'draft' }],
  canAuthor: true, canPublish: false,
};

const api = apiFetch as jest.Mock;
beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('article=a1'));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  api.mockImplementation(async (path: string) => {
    const p = path.split('?')[0];
    if (p === '/rbac/me/permissions') return ['desk.kb.author'];
    if (p === '/desk/kb/spaces') return [SPACE];
    if (p === '/desk/kb/articles/a1') return ARTICLE;
    if (p === '/desk/kb/articles' || p === '/desk/kb/blocks' || p === '/desk/kb/templates' || p === '/desk/desks') return [];
    throw new Error(`unexpected ${path}`);
  });
});

it('opens the article named in ?article= for an author, with no review buttons', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <YxDeskKnowledgePage />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('KB-7 · edit')).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('/desk/kb/articles/a1', {}, 'tok');
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve and publish' })).not.toBeInTheDocument();
});
