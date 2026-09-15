import type { HrisConnector } from './types';
import { genericConnector } from './generic';
import { greenhouseConnector } from './greenhouse';
import { leverConnector } from './lever';
import { bamboohrConnector } from './bamboohr';
import { workdayConnector } from './workday';

export * from './types';

// The ATS/HRIS connector registry. `generic` posts the payload verbatim to an org URL; the vendor
// connectors map it to each system's API. Each org picks one by id (Organization.hrisProvider) and
// stores its config in hrisTargetUrl + the encrypted hrisAuthHeaderEncrypted blob.
export const HRIS_CONNECTORS: Record<string, HrisConnector> = {
  generic: genericConnector,
  greenhouse: greenhouseConnector,
  lever: leverConnector,
  bamboohr: bamboohrConnector,
  workday: workdayConnector,
};

export const HRIS_PROVIDER_IDS = Object.keys(HRIS_CONNECTORS);

// Unknown/legacy provider values fall back to the generic connector (which is what every existing
// config already is), so an org is never left un-deliverable by a bad provider string.
export function getHrisConnector(id: string | null | undefined): HrisConnector {
  return (id && HRIS_CONNECTORS[id]) || genericConnector;
}

export function listHrisConnectors(): HrisConnector[] {
  return Object.values(HRIS_CONNECTORS);
}
