import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsUrl } from '../../common/ssrf';
import { JobBoardAdapter, JobPostingInput, extractExternalId, isBlank } from './types';

// Indeed employer jobs API (partner-gated). config: an API key + the employer id the jobs post
// under. Endpoint overridable per partner/version.
// ponytail: payload is Indeed's documented shape as of build time, tunable via `endpoint` + on real
// onboarding; auth + id extraction are the stable parts. Inert until an org supplies a key.
const DEFAULT_ENDPOINT = 'https://apis.indeed.com/ads/v1/jobs';

export const indeedProvider: JobBoardAdapter = {
  id: 'indeed',
  label: 'Indeed',
  configFields: [
    { key: 'apiKey', label: 'API key', secret: true, required: true },
    { key: 'employerId', label: 'Employer ID', secret: false, required: true },
    { key: 'endpoint', label: 'API endpoint (optional)', secret: false, required: false, placeholder: DEFAULT_ENDPOINT },
  ],

  validateConfig(config: Record<string, unknown>): void {
    if (isBlank(config.apiKey) || isBlank(config.employerId)) {
      throw new BadRequestException('Indeed config requires an API key and employer ID');
    }
    if (!isBlank(config.endpoint)) assertPublicHttpsUrl(new URL(config.endpoint as string));
  },

  async postJob(config, job: JobPostingInput, fetchImpl = fetch): Promise<{ externalPostId: string }> {
    const endpoint = (config.endpoint as string) || DEFAULT_ENDPOINT;
    assertPublicHttpsUrl(new URL(endpoint));
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey as string}`, 'Content-Type': 'application/json' },
      redirect: 'manual',
      body: JSON.stringify({
        employerId: config.employerId,
        title: job.title,
        description: job.description,
        location: job.location,
        jobType: job.employmentType || undefined,
        company: job.companyName,
        applyUrl: job.applyUrl,
        sourceReference: job.reference,
      }),
    });
    if (!res.ok) throw new Error(`Indeed API ${res.status}`);
    const parsed = await res.json().catch(() => ({}));
    return { externalPostId: extractExternalId(parsed) ?? job.reference };
  },

  async closeJob(config, externalPostId, fetchImpl = fetch): Promise<void> {
    const endpoint = (config.endpoint as string) || DEFAULT_ENDPOINT;
    const url = `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(externalPostId)}`;
    assertPublicHttpsUrl(new URL(url));
    const res = await fetchImpl(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.apiKey as string}` },
      redirect: 'manual',
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Indeed close ${res.status}`);
  },
};
