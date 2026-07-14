const EXAM_RUNTIME_API_BASE = process.env.NEXT_PUBLIC_EXAM_RUNTIME_API_BASE ?? 'http://localhost:3002/api/v1';

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setCandidateUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${EXAM_RUNTIME_API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

export async function candidateApiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let response = await doFetch(path, options, accessToken);

  if (response.status === 401 && unauthorizedHandler && path !== '/candidate-auth/refresh') {
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
