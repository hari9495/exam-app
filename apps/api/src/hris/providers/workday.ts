import { BadRequestException } from '@nestjs/common';
import type { HrisConnector, HrisConfigInput, HrisPersistedConfig, HrisEmployeePayload, HrisRequest } from './types';

// Workday — best-effort. Real Workday integrations are per-tenant and typically SOAP (WWS) or a
// customer-specific inbound EIB/Studio/Orchestrate endpoint, none of which can be built generically
// or validated without a real tenant. So this connector posts the structured hire record as JSON,
// with a Bearer token, to a Workday inbound URL the customer provides — matching the common pattern
// of a Workday Studio/Orchestrate REST listener. Treat it as a documented starting point, not a
// certified adapter; a customer with a SOAP-only tenant should use an iPaaS via the generic endpoint.
export const workdayConnector: HrisConnector = {
  id: 'workday',
  label: 'Workday (beta)',

  prepareConfig(input: HrisConfigInput, existing: HrisPersistedConfig | null): HrisPersistedConfig {
    const targetUrl = input.targetUrl !== undefined ? input.targetUrl.trim() || null : (existing?.targetUrl ?? null);
    if (!targetUrl) throw new BadRequestException('A Workday inbound endpoint URL is required');
    // Bearer token stored raw as the secret. Omitted -> keep existing; empty -> clear.
    const secret = input.apiKey === undefined ? (existing?.secret ?? null) : input.apiKey.trim() || null;
    if (!secret) throw new BadRequestException('A Workday API token is required');
    return { targetUrl, secret };
  },

  buildRequest(payload: HrisEmployeePayload, config: HrisPersistedConfig): HrisRequest {
    if (!config.targetUrl) throw new BadRequestException('Workday endpoint URL is not configured');
    if (!config.secret) throw new BadRequestException('Workday connector is not fully configured');
    return {
      url: config.targetUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify(payload),
    };
  },
};
