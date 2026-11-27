import { filtersQuery } from './yx-desk';

// HLP-02 list query: the filter bar's values as the API's query string (T2-F 77 adds the satisfaction bands).
describe('filtersQuery', () => {
  it('sends the satisfaction bands as one comma list, and leaves out empty filters', () => {
    expect(filtersQuery({ satisfaction: ['low', 'none'], states: [], search: '' }, { limit: '50' })).toBe('satisfaction=low%2Cnone&limit=50');
    expect(filtersQuery({ satisfaction: undefined })).toBe('');
  });
});
