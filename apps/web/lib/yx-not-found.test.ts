import { act, renderHook } from '@testing-library/react';
import { apiFetch } from './api-client';
import { noteNotFound, useNotFoundReference } from './yx-not-found';

jest.mock('./navigate', () => ({ goTo: jest.fn() }));

// Answer 947: the reference of a 404 shows on the page it came on, never on another page.
describe('Not found references', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('a 404 from the API is kept with the current page', async () => {
    window.history.pushState({}, '', '/yx/people/abc');
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ statusCode: 404, message: 'Employee not found', reference: 'NF-7KQ2MP' }), { status: 404 })) as unknown as typeof fetch;
    const { result } = renderHook(() => useNotFoundReference('/yx/people/abc'));
    await act(async () => {
      await expect(apiFetch('/people/employees/abc', {}, 'tok')).rejects.toMatchObject({ status: 404 });
    });
    expect(result.current).toBe('NF-7KQ2MP');
    expect(renderHook(() => useNotFoundReference('/yx/people/other')).result.current).toBeNull();
  });

  it('ignores anything not shaped like a reference, and other statuses', async () => {
    window.history.pushState({}, '', '/yx/time');
    const { result } = renderHook(() => useNotFoundReference('/yx/time'));
    act(() => noteNotFound('<script>'));
    expect(result.current).toBeNull();
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Forbidden', reference: 'NF-AAAAAA' }), { status: 403 })) as unknown as typeof fetch;
    await act(async () => {
      await expect(apiFetch('/x', {}, 'tok')).rejects.toMatchObject({ status: 403 });
    });
    expect(result.current).toBeNull();
  });
});
