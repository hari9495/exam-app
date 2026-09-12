import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsUrl } from '../../common/ssrf';
import { JobBoardAdapter, JobPostingInput, extractExternalId, isBlank } from './types';

// Substitutes {{title}} etc. into a template. When the contentType is JSON, each value is escaped
// via JSON.stringify(...).slice(1,-1) so it sits safely inside the JSON-string quotes the template
// author wrote -- same rule as the SMS http-provider.
function substitute(template: string, job: JobPostingInput, isJson: boolean): string {
  const enc = (v: string) => (isJson ? JSON.stringify(v).slice(1, -1) : v);
  return template
    .replace(/\{\{title\}\}/g, enc(job.title))
    .replace(/\{\{description\}\}/g, enc(job.description))
    .replace(/\{\{location\}\}/g, enc(job.location))
    .replace(/\{\{employmentType\}\}/g, enc(job.employmentType))
    .replace(/\{\{companyName\}\}/g, enc(job.companyName))
    .replace(/\{\{applyUrl\}\}/g, enc(job.applyUrl))
    .replace(/\{\{reference\}\}/g, enc(job.reference));
}

export const httpProvider: JobBoardAdapter = {
  id: 'http',
  label: 'Generic HTTP',
  configFields: [
    { key: 'postUrl', label: 'Post URL', secret: false, required: true, placeholder: 'https://board.example.com/jobs' },
    { key: 'closeUrlTemplate', label: 'Close URL template', secret: false, required: false, placeholder: 'https://board.example.com/jobs/{{externalPostId}}' },
    { key: 'method', label: 'HTTP method', secret: false, required: false, placeholder: 'POST' },
    { key: 'authHeader', label: 'Authorization header', secret: true, required: false },
    { key: 'contentType', label: 'Content-Type', secret: false, required: false, placeholder: 'application/json' },
    { key: 'bodyTemplate', label: 'Body template', secret: false, required: true },
  ],

  validateConfig(config: Record<string, unknown>): void {
    if (isBlank(config.postUrl) || isBlank(config.bodyTemplate)) {
      throw new BadRequestException('HTTP board config requires postUrl and bodyTemplate');
    }
    let url: URL;
    try {
      url = new URL(config.postUrl as string);
    } catch {
      throw new BadRequestException('Post URL is not a valid URL');
    }
    assertPublicHttpsUrl(url); // https + public host only (SSRF guard)
    if (!isBlank(config.closeUrlTemplate)) {
      // The template carries {{externalPostId}}, not a valid URL char-set until substituted, so
      // only check the static prefix is https here; the substituted URL is re-checked at close time.
      const probe = (config.closeUrlTemplate as string).replace(/\{\{externalPostId\}\}/g, 'x');
      try {
        assertPublicHttpsUrl(new URL(probe));
      } catch {
        throw new BadRequestException('Close URL template must be a public https URL');
      }
    }
  },

  async postJob(config, job: JobPostingInput, fetchImpl = fetch): Promise<{ externalPostId: string }> {
    const contentType = (config.contentType as string) || 'application/json';
    const isJson = contentType.includes('json');
    const url = config.postUrl as string;
    assertPublicHttpsUrl(new URL(url));
    const headers: Record<string, string> = { 'Content-Type': contentType };
    if (!isBlank(config.authHeader)) headers.Authorization = config.authHeader as string;

    const res = await fetchImpl(url, {
      method: (config.method as string) || 'POST',
      headers,
      body: substitute(config.bodyTemplate as string, job, isJson),
      redirect: 'manual', // never follow a redirect to an internal address
    });
    if (!res.ok) throw new Error(`Job board HTTP ${res.status}`);
    const parsed = await res.json().catch(() => ({}));
    // A board that returns no id still counts as posted -- fall back to our own reference so the
    // membership records a stable handle (close then relies on closeUrlTemplate with that value).
    return { externalPostId: extractExternalId(parsed) ?? job.reference };
  },

  async closeJob(config, externalPostId, fetchImpl = fetch): Promise<void> {
    const template = config.closeUrlTemplate as string | undefined;
    if (isBlank(template)) return; // board has no close endpoint configured -- nothing to do
    const url = template!.replace(/\{\{externalPostId\}\}/g, encodeURIComponent(externalPostId));
    assertPublicHttpsUrl(new URL(url));
    const headers: Record<string, string> = {};
    if (!isBlank(config.authHeader)) headers.Authorization = config.authHeader as string;
    const res = await fetchImpl(url, { method: 'DELETE', headers, redirect: 'manual' });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Job board close HTTP ${res.status}`);
  },
};
