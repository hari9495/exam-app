import { BadRequestException } from '@nestjs/common';
import type { HrisConnector, HrisConfigInput, HrisPersistedConfig, HrisEmployeePayload, HrisRequest } from './types';
import { basicAuth, parseBlob } from './util';

// Lever API — create an opportunity (candidate). Auth is HTTP Basic with the API key as the
// username (blank password); POST /v1/opportunities requires a `perform_as` query param naming a
// Lever user id. Docs: https://hire.lever.co/developer/documentation#create-an-opportunity.
// Built to the documented API; not validated against a live Lever account (inert until keyed).
const LEVER_OPPORTUNITIES_URL = 'https://api.lever.co/v1/opportunities';

export const leverConnector: HrisConnector = {
  id: 'lever',
  label: 'Lever',

  prepareConfig(input: HrisConfigInput, existing: HrisPersistedConfig | null): HrisPersistedConfig {
    const prev = parseBlob(existing?.secret ?? null);
    const apiKey = (input.apiKey ?? prev.apiKey ?? '').trim();
    const performAs = (input.performAs ?? prev.performAs ?? '').trim();
    if (!apiKey) throw new BadRequestException('A Lever API key is required');
    if (!performAs) throw new BadRequestException('A Lever user id (perform as) is required');
    return { targetUrl: null, secret: JSON.stringify({ apiKey, performAs }) };
  },

  buildRequest(payload: HrisEmployeePayload, config: HrisPersistedConfig): HrisRequest {
    const { apiKey, performAs } = parseBlob(config.secret);
    if (!apiKey || !performAs) throw new BadRequestException('Lever connector is not fully configured');
    const body = {
      name: payload.candidate.name,
      emails: [payload.candidate.email],
      phones: payload.candidate.phone ? [{ value: payload.candidate.phone }] : [],
      tags: ['Hired via Workfox', payload.job.title],
    };
    return {
      url: `${LEVER_OPPORTUNITIES_URL}?perform_as=${encodeURIComponent(performAs)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth(apiKey) },
      body: JSON.stringify(body),
    };
  },
};
