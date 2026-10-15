import { CONFIDENTIAL_KEYS } from '@exam-platform/shared';
import { CONFIDENTIAL_LABEL } from './access.service';

// The role risk warning (YX-SEC-18) names what a grant opens in plain words, never as permission codes.
describe('CONFIDENTIAL_LABEL', () => {
  it('has plain words for every Confidential key', () => {
    for (const key of CONFIDENTIAL_KEYS) expect(CONFIDENTIAL_LABEL[key]).toMatch(/^[a-z][a-z A-Z]+$/);
  });
});
