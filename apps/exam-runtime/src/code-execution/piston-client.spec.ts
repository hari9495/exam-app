import { PistonClient } from './piston-client';

describe('PistonClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('executes code for an interpreted language and returns stdout/stderr/exitCode', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        run: { stdout: 'hello\n', stderr: '', code: 0, signal: null },
      }),
    });

    const client = new PistonClient();
    const result = await client.execute({ language: 'python', version: '3.10.0', code: 'print("hello")' });

    expect(result).toEqual({ stdout: 'hello\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/execute'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          language: 'python',
          version: '3.10.0',
          files: [{ content: 'print("hello")' }],
          stdin: '',
          run_timeout: 5000,
        }),
      }),
    );
  });

  it('surfaces a compile-stage failure as compileError for a compiled language', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        compile: { stdout: '', stderr: 'error: expected \';\'', code: 1 },
        run: { stdout: '', stderr: '', code: 0, signal: null },
      }),
    });

    const client = new PistonClient();
    const result = await client.execute({ language: 'cpp', version: '10.2.0', code: 'int main() { return 0 }' });

    expect(result).toEqual({ stdout: '', stderr: '', exitCode: 0, compileError: "error: expected ';'", timedOut: false });
  });

  it('passes stdin through when provided', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ run: { stdout: 'Alice\n', stderr: '', code: 0, signal: null } }) });

    const client = new PistonClient();
    await client.execute({ language: 'python', version: '3.10.0', code: 'print(input())', stdin: 'Alice' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('"stdin":"Alice"') }),
    );
  });

  it('marks the result as timedOut when the run stage was killed by a signal', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ run: { stdout: '', stderr: '', code: null, signal: 'SIGKILL' } }),
    });

    const client = new PistonClient();
    const result = await client.execute({ language: 'python', version: '3.10.0', code: 'while True: pass' });

    expect(result.timedOut).toBe(true);
  });

  it('throws when the Piston request itself fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    const client = new PistonClient();
    await expect(client.execute({ language: 'python', version: '3.10.0', code: 'print(1)' })).rejects.toThrow('Piston request failed with status 502');
  });
});
