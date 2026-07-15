const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

async function throwForResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.message ?? `Request failed with status ${response.status}`) as Error & { status?: number };
  error.status = response.status;
  throw error;
}

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let response = await doFetch(path, options, accessToken);

  // Exclude the refresh endpoint itself: the registered unauthorized handler
  // (AuthProvider's silentRefresh) calls this same endpoint, so retrying a
  // failed refresh through the handler would recurse into itself forever.
  if (response.status === 401 && unauthorizedHandler && path !== '/auth/refresh') {
    const freshToken = await unauthorizedHandler();
    if (freshToken) {
      response = await doFetch(path, options, freshToken);
    }
  }

  if (!response.ok) {
    await throwForResponse(response);
  }
  return response.json();
}

export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await doFetch(path, options, accessToken);
  if (!response.ok) {
    await throwForResponse(response);
  }
  const disposition = response.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="([^"]+)"/);
  return { blob: await response.blob(), filename: filenameMatch ? filenameMatch[1] : null };
}
