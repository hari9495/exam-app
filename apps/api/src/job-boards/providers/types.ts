/**
 * Provider abstraction for PAID job-board posting (push), alongside the free XML-feed boards
 * (pull). Each org configures a board with one provider + an encrypted config blob shaped by that
 * provider's configFields -- exactly the SMS-provider pattern. Adapters post over plain `fetch`
 * (no SDK). The whole thing is inert until an org supplies credentials.
 */

export type JobBoardProviderId = 'linkedin' | 'indeed' | 'http';

export interface JobBoardConfigField {
  key: string;
  label: string;
  secret: boolean; // secret fields are never returned by GET; blank-on-PUT keeps the existing value
  required: boolean;
  placeholder?: string;
}

/** The job as handed to an adapter to post. applyUrl is the public apply page for the job. */
export interface JobPostingInput {
  title: string;
  description: string;
  location: string;
  employmentType: string;
  companyName: string;
  applyUrl: string;
  reference: string; // our job id, for the board's external reference field
}

export interface JobBoardAdapter {
  id: JobBoardProviderId;
  label: string; // 'LinkedIn' | 'Indeed' | 'Generic HTTP'
  configFields: JobBoardConfigField[];
  validateConfig(config: Record<string, unknown>): void; // throw BadRequestException on invalid
  /** Post the job; return the board's external post id (used later to close it). Throws on failure. */
  postJob(config: Record<string, unknown>, job: JobPostingInput, fetchImpl?: typeof fetch): Promise<{ externalPostId: string }>;
  /** Remove/close a previously-posted job. A 404/410 (already gone) resolves, not throws. */
  closeJob(config: Record<string, unknown>, externalPostId: string, fetchImpl?: typeof fetch): Promise<void>;
}

export function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** Pull an external id out of a provider's JSON response, trying the common shapes. */
export function extractExternalId(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const o = json as Record<string, unknown>;
  const direct = o.id ?? o.jobId ?? o.postingId ?? o.reference;
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct);
  const elements = o.elements;
  if (Array.isArray(elements) && elements[0] && typeof elements[0] === 'object') {
    const el = elements[0] as Record<string, unknown>;
    const id = el.id ?? el.jobId;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}
