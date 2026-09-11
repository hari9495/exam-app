import { endpointLabel } from './endpoint-label';

describe('endpointLabel', () => {
  it('joins method + route template', () => {
    expect(endpointLabel('GET', '/public/candidates')).toBe('GET /public/candidates');
  });
  it('uppercases the method and keeps the route template (never the concrete url)', () => {
    expect(endpointLabel('get', '/public/exams/:id')).toBe('GET /public/exams/:id');
  });
  it('falls back to "unknown" when the route path is missing', () => {
    expect(endpointLabel('POST', undefined)).toBe('POST unknown');
  });
});
