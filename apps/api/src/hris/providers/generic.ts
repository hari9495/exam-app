import { BadRequestException } from '@nestjs/common';
import type { HrisConnector, HrisConfigInput, HrisPersistedConfig, HrisEmployeePayload, HrisRequest } from './types';

// The original behaviour: POST the structured hire payload verbatim to an org-supplied URL with an
// org-supplied Authorization header. Backward compatible — the secret is the raw header string.
export const genericConnector: HrisConnector = {
  id: 'generic',
  label: 'Generic endpoint',

  prepareConfig(input: HrisConfigInput, existing: HrisPersistedConfig | null): HrisPersistedConfig {
    const targetUrl = input.targetUrl !== undefined ? input.targetUrl.trim() || null : (existing?.targetUrl ?? null);
    if (!targetUrl) throw new BadRequestException('An HTTPS endpoint URL is required');
    // authHeader: omitted -> keep existing; empty string -> clear; value -> set.
    const secret = input.authHeader === undefined ? (existing?.secret ?? null) : input.authHeader.trim() || null;
    return { targetUrl, secret };
  },

  buildRequest(payload: HrisEmployeePayload, config: HrisPersistedConfig): HrisRequest {
    if (!config.targetUrl) throw new BadRequestException('HRIS target URL is not configured');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.secret) headers['Authorization'] = config.secret;
    return { url: config.targetUrl, method: 'POST', headers, body: JSON.stringify(payload) };
  },
};
