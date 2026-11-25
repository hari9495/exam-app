jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('./auth-context', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('./yx-hiring', () => ({ useApiWrite: () => jest.fn(), useHiring: () => ({}) }));

import { builderState, payBody } from './yx-offers';

// HIR-09 web glue: money goes to the API as whole rupees in text; the page state follows the API's answer.
describe('yx-offers', () => {
  it('sends pay as whole rupees in text, the clawback only with a joining bonus', () => {
    expect(payBody({ templateVersionId: 'tv', annualCtc: 1_600_000.4, variablePay: 150_000, joiningBonus: 0, clawbackMonths: 12, locationId: 'l' })).toEqual({ templateVersionId: 'tv', annualCtc: '1600000', variablePay: '150000', joiningBonus: '0', locationId: 'l' });
    expect(payBody({ templateVersionId: 'tv', annualCtc: 1, variablePay: 0, joiningBonus: 100_000, clawbackMonths: 12, locationId: 'l' })).toMatchObject({ joiningBonus: '100000', clawbackMonths: 12 });
  });

  it('maps the API answer to the screen state: 403 no access, 404 / 400 not found, else error; no application = not found', () => {
    expect(builderState({ isError: true, error: { status: 403 }, data: undefined })).toBe('denied');
    expect(builderState({ isError: true, error: { status: 404 }, data: undefined })).toBe('not-found');
    expect(builderState({ isError: true, error: { status: 400 }, data: undefined })).toBe('not-found');
    expect(builderState({ isError: true, error: { status: 500 }, data: undefined })).toBe('error');
    expect(builderState({ isError: false, error: null, data: undefined })).toBe('loading');
    expect(builderState({ isError: false, error: null, data: {} })).toBe('ready');
    expect(builderState({ isError: false, error: null, data: {} }, false)).toBe('not-found');
  });
});
