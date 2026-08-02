import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditActorFilter } from './AuditActorFilter';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';

function renderFilter(props: Partial<React.ComponentProps<typeof AuditActorFilter>> = {}) {
  const onChange = jest.fn();
  render(
    <QueryProvider>
      <AuthProvider>
        <AuditActorFilter actorUserId={undefined} actorLabel={undefined} onChange={onChange} {...props} />
      </AuthProvider>
    </QueryProvider>,
  );
  return { onChange };
}

describe('AuditActorFilter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('searches staff by name/email and picks a result instead of requiring a pasted UUID', async () => {
    global.fetch = jest.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (urlStr.includes('/users') && urlStr.includes('search=priya')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'user-9', email: 'priya@demo-org.test', name: 'Priya Sharma', role: 'recruiter' }], page: 1, pageSize: 10, total: 1, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }), { status: 200 });
    }) as unknown as typeof fetch;

    const { onChange } = renderFilter();

    await userEvent.type(screen.getByLabelText('Actor'), 'priya');

    await waitFor(() => expect(screen.getByText('Priya Sharma')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Priya Sharma'));

    expect(onChange).toHaveBeenCalledWith('user-9', 'Priya Sharma');
  });

  it('shows the picked actor as a clearable chip instead of the search box', async () => {
    global.fetch = jest.fn(async (url) =>
      String(url).endsWith('/auth/refresh')
        ? new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 })
        : new Response(JSON.stringify({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }), { status: 200 }),
    ) as unknown as typeof fetch;

    const { onChange } = renderFilter({ actorUserId: 'user-9', actorLabel: 'Priya Sharma' });

    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.queryByLabelText('Actor')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Clear actor filter'));

    expect(onChange).toHaveBeenCalledWith(undefined, undefined);
  });
});
