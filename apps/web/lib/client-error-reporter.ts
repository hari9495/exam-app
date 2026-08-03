// Reports candidate-side failures to exam-runtime's /attempt/client-error so exam-day
// problems (failed saves, JS crashes) are visible in the admin console instead of dying
// silently in the candidate's browser. Strictly best-effort: reporting must never add a
// second failure on top of the one being reported, so every path here swallows errors.

const EXAM_RUNTIME_API_BASE = process.env.NEXT_PUBLIC_EXAM_RUNTIME_API_BASE ?? 'http://localhost:3002/api/v1';

// One report per distinct kind+message per page load, hard-capped -- a render-loop crash
// or flapping network must not flood the server (or burn the candidate's rate limit).
const MAX_REPORTS_PER_PAGE = 10;
let reportedKeys = new Set<string>();
let reportCount = 0;

export interface ClientErrorReport {
  kind: string;
  message: string;
  detail?: string;
  severity?: 'error' | 'warn';
}

export function reportClientError(accessToken: string | null | undefined, report: ClientErrorReport): void {
  if (!accessToken) return;
  const key = `${report.kind}:${report.message}`;
  if (reportedKeys.has(key) || reportCount >= MAX_REPORTS_PER_PAGE) return;
  reportedKeys.add(key);
  reportCount += 1;
  try {
    void fetch(`${EXAM_RUNTIME_API_BASE}/attempt/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        kind: report.kind.slice(0, 60),
        message: report.message.slice(0, 1000),
        detail: report.detail?.slice(0, 2000),
        severity: report.severity,
      }),
      credentials: 'include',
    }).catch(() => undefined);
  } catch {
    // e.g. no fetch in an ancient browser -- reporting is never worth an error of its own
  }
}

export function resetClientErrorReporter(): void {
  reportedKeys = new Set();
  reportCount = 0;
}
