import { EchoProcessor } from './echo.processor';

describe('EchoProcessor', () => {
  it('returns the input wrapped in an echoed field', async () => {
    const processor = new EchoProcessor();
    const context = { organizationId: 'org-1', isSuperAdmin: false };

    const result = await processor.process({ message: 'hello' }, context, 'job-1');

    expect(result).toEqual({ echoed: { message: 'hello' } });
  });

  it('receives the id of the job it is processing', async () => {
    const processor = new EchoProcessor();
    const result = await processor.process({ hello: 'world' }, {} as never, 'job-123');
    expect(result).toBeDefined();
  });
});
