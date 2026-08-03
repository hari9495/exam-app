'use client';

import { useEffect } from 'react';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { reportClientError } from '../../../lib/client-error-reporter';

// Mounted once in the candidate layout: reports uncaught JS errors and unhandled promise
// rejections during a candidate session. Renders nothing.
export function ClientErrorListener() {
  const { accessToken } = useCandidateAuth();

  useEffect(() => {
    if (!accessToken) return;
    const onError = (event: ErrorEvent) => {
      reportClientError(accessToken, {
        kind: 'js_error',
        message: event.message || 'Unknown script error',
        detail: event.filename ? `${event.filename}:${event.lineno ?? '?'}` : undefined,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError(accessToken, {
        kind: 'unhandled_rejection',
        message: reason instanceof Error ? reason.message : String(reason ?? 'Unknown rejection'),
        detail: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined,
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [accessToken]);

  return null;
}
