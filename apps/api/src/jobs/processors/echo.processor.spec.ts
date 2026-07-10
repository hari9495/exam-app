import { EchoProcessor } from './echo.processor';

describe('EchoProcessor', () => {
  it('returns the input wrapped in an echoed field', async () => {
    const processor = new EchoProcessor();

    const result = await processor.process({ message: 'hello' });

    expect(result).toEqual({ echoed: { message: 'hello' } });
  });
});
