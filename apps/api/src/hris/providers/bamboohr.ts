import { BadRequestException } from '@nestjs/common';
import type { HrisConnector, HrisConfigInput, HrisPersistedConfig, HrisEmployeePayload, HrisRequest } from './types';
import { basicAuth, parseBlob, splitName } from './util';

// BambooHR API — add an employee. Auth is HTTP Basic with the API key as the username and any
// non-empty password ('x' by convention). The endpoint is per-tenant, keyed by the company
// subdomain. Docs: https://documentation.bamboohr.com/reference/add-employee-1.
// Built to the documented API; not validated against a live BambooHR account (inert until keyed).
export const bamboohrConnector: HrisConnector = {
  id: 'bamboohr',
  label: 'BambooHR',

  prepareConfig(input: HrisConfigInput, existing: HrisPersistedConfig | null): HrisPersistedConfig {
    const prev = parseBlob(existing?.secret ?? null);
    const apiKey = (input.apiKey ?? prev.apiKey ?? '').trim();
    const subdomain = (input.subdomain ?? prev.subdomain ?? '').trim();
    if (!apiKey) throw new BadRequestException('A BambooHR API key is required');
    if (!subdomain) throw new BadRequestException('A BambooHR company subdomain is required');
    if (!/^[a-z0-9-]+$/i.test(subdomain)) throw new BadRequestException('BambooHR subdomain may contain only letters, digits and hyphens');
    return { targetUrl: null, secret: JSON.stringify({ apiKey, subdomain }) };
  },

  buildRequest(payload: HrisEmployeePayload, config: HrisPersistedConfig): HrisRequest {
    const { apiKey, subdomain } = parseBlob(config.secret);
    if (!apiKey || !subdomain) throw new BadRequestException('BambooHR connector is not fully configured');
    const { first, last } = splitName(payload.candidate.name);
    const body: Record<string, unknown> = {
      firstName: first,
      lastName: last,
      workEmail: payload.candidate.email,
      jobTitle: payload.job.title,
      department: payload.job.department ?? undefined,
      hireDate: payload.offer?.startDate ?? payload.hiredAt.slice(0, 10),
    };
    return {
      url: `https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(subdomain)}/v1/employees`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: basicAuth(apiKey, 'x') },
      body: JSON.stringify(body),
    };
  },
};
