import type { HrisEmployeePayload } from '../hris-payload';

export type { HrisEmployeePayload };

// Raw config the org submits (the UpdateHrisConfigDto fields). Each connector reads the subset it
// needs and ignores the rest. Secret fields left undefined mean "keep existing" (see prepareConfig).
export interface HrisConfigInput {
  targetUrl?: string; // generic / workday
  authHeader?: string; // generic (full Authorization header value)
  apiKey?: string; // greenhouse / lever / bamboohr / workday (token)
  subdomain?: string; // bamboohr
  onBehalfOf?: string; // greenhouse (On-Behalf-Of user id)
  performAs?: string; // lever (perform_as user id)
}

// The two persisted columns. `secret` is stored encrypted in Organization.hrisAuthHeaderEncrypted
// (generic: the raw Authorization header; vendors: a JSON credential blob). `targetUrl` goes to
// Organization.hrisTargetUrl (null for fixed-endpoint vendors).
export interface HrisPersistedConfig {
  targetUrl: string | null;
  secret: string | null;
}

// The outbound HTTP request a connector produces. The worker applies the SSRF guard to `url`, then
// fetches — so connectors never make network calls themselves (kept unit-testable + centrally guarded).
export interface HrisRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface HrisConnector {
  id: string;
  label: string;
  // Save time: validate the submitted config for this vendor and return what to persist. `existing`
  // is the org's current persisted config (decrypted) so an unchanged secret field can be kept;
  // it is null when the provider itself changed (no cross-vendor secret reuse). Throws
  // BadRequestException with a user-facing message on invalid/missing required fields.
  prepareConfig(input: HrisConfigInput, existing: HrisPersistedConfig | null): HrisPersistedConfig;
  // Send time: map the hire payload + persisted config into the vendor's API request.
  buildRequest(payload: HrisEmployeePayload, config: HrisPersistedConfig): HrisRequest;
}
