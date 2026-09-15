import { BadRequestException } from '@nestjs/common';
import type { HrisConnector, HrisConfigInput, HrisPersistedConfig, HrisEmployeePayload, HrisRequest } from './types';
import { basicAuth, parseBlob, splitName } from './util';

// Greenhouse Harvest API — create a candidate. Auth is HTTP Basic with the Harvest API key as the
// username (blank password); every POST also requires an `On-Behalf-Of` header naming a Greenhouse
// user id. Docs: https://developers.greenhouse.io/harvest.html#post-add-candidate.
// Built to the documented API; not validated against a live Greenhouse account (inert until keyed).
const GREENHOUSE_CANDIDATES_URL = 'https://harvest.greenhouse.io/v1/candidates';

export const greenhouseConnector: HrisConnector = {
  id: 'greenhouse',
  label: 'Greenhouse',

  prepareConfig(input: HrisConfigInput, existing: HrisPersistedConfig | null): HrisPersistedConfig {
    const prev = parseBlob(existing?.secret ?? null);
    const apiKey = (input.apiKey ?? prev.apiKey ?? '').trim();
    const onBehalfOf = (input.onBehalfOf ?? prev.onBehalfOf ?? '').trim();
    if (!apiKey) throw new BadRequestException('A Greenhouse Harvest API key is required');
    if (!onBehalfOf) throw new BadRequestException('A Greenhouse user id (On-Behalf-Of) is required');
    return { targetUrl: null, secret: JSON.stringify({ apiKey, onBehalfOf }) };
  },

  buildRequest(payload: HrisEmployeePayload, config: HrisPersistedConfig): HrisRequest {
    const { apiKey, onBehalfOf } = parseBlob(config.secret);
    if (!apiKey || !onBehalfOf) throw new BadRequestException('Greenhouse connector is not fully configured');
    const { first, last } = splitName(payload.candidate.name);
    const body = {
      first_name: first,
      last_name: last,
      email_addresses: [{ value: payload.candidate.email, type: 'personal' }],
      phone_numbers: payload.candidate.phone ? [{ value: payload.candidate.phone, type: 'mobile' }] : [],
      applications: [{ job_id: payload.job.id }],
    };
    return {
      url: GREENHOUSE_CANDIDATES_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth(apiKey), 'On-Behalf-Of': onBehalfOf },
      body: JSON.stringify(body),
    };
  },
};
