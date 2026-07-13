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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  return response.json();
}
