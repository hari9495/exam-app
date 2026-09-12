import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsUrl } from '../../common/ssrf';
import { JobBoardAdapter, JobPostingInput, extractExternalId, isBlank } from './types';

// LinkedIn Job Postings API (partner-gated). config: an OAuth access token + the posting company's
// organization URN. Endpoint is overridable so a partner on a different API version/base can point
// it without a code change.
// ponytail: the exact request/response body is LinkedIn's documented shape as of build time and is
// tunable via `endpoint` + when a real partner account is connected; the auth headers + id
// extraction are the stable parts. Inert until an org supplies a token.
const DEFAULT_ENDPOINT = 'https://api.linkedin.com/rest/simpleJobPostings';

export const linkedinProvider: JobBoardAdapter = {
  id: 'linkedin',
  label: 'LinkedIn',
  configFields: [
    { key: 'accessToken', label: 'Access token', secret: true, required: true },
    { key: 'authorUrn', label: 'Company URN', secret: false, required: true, placeholder: 'urn:li:organization:12345' },
    { key: 'endpoint', label: 'API endpoint (optional)', secret: false, required: false, placeholder: DEFAULT_ENDPOINT },
  ],

  validateConfig(config: Record<string, unknown>): void {
    if (isBlank(config.accessToken) || isBlank(config.authorUrn)) {
      throw new BadRequestException('LinkedIn config requires an access token and company URN');
    }
    if (!isBlank(config.endpoint)) assertPublicHttpsUrl(new URL(config.endpoint as string));
  },

  async postJob(config, job: JobPostingInput, fetchImpl = fetch): Promise<{ externalPostId: string }> {
    const endpoint = (config.endpoint as string) || DEFAULT_ENDPOINT;
    assertPublicHttpsUrl(new URL(endpoint));
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken as string}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      redirect: 'manual',
      body: JSON.stringify({
        integrationContext: config.authorUrn,
        companyApplyUrl: job.applyUrl,
        title: job.title,
        description: job.description,
        location: job.location,
        employmentStatus: job.employmentType || undefined,
        externalJobPostingId: job.reference,
      }),
    });
    if (!res.ok) throw new Error(`LinkedIn API ${res.status}`);
    const parsed = await res.json().catch(() => ({}));
    return { externalPostId: extractExternalId(parsed) ?? job.reference };
  },

  async closeJob(config, externalPostId, fetchImpl = fetch): Promise<void> {
    const endpoint = (config.endpoint as string) || DEFAULT_ENDPOINT;
    const url = `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(externalPostId)}`;
    assertPublicHttpsUrl(new URL(url));
    const res = await fetchImpl(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.accessToken as string}`, 'X-Restli-Protocol-Version': '2.0.0' },
      redirect: 'manual',
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`LinkedIn close ${res.status}`);
  },
};
