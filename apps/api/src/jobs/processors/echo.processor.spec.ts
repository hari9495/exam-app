import { EchoProcessor } from './echo.processor';

describe('EchoProcessor', () => {
  it('returns the input wrapped in an echoed field', async () => {
    const processor = new EchoProcessor();
    const context = { organizationId: 'org-1', isSuperAdmin: false };

    const result = await processor.process({ message: 'hello' }, context);

    expect(result).toEqual({ echoed: { message: 'hello' } });
  });
});
