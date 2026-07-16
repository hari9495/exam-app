import { Injectable } from '@nestjs/common';
import { COMPILED_LANGUAGES } from './piston-languages';

export interface PistonExecuteParams {
  language: string;
  version: string;
  code: string;
  stdin?: string;
}

export interface PistonExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  compileError: string | null;
  timedOut: boolean;
}

interface PistonStageResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string | null;
}

interface PistonApiResponse {
  compile?: PistonStageResult;
  run: PistonStageResult;
}

const RUN_TIMEOUT_MS = 5000;

@Injectable()
export class PistonClient {
  private readonly baseUrl = process.env.PISTON_API_URL ?? 'http://localhost:2000';

  async execute(params: PistonExecuteParams): Promise<PistonExecuteResult> {
    const response = await fetch(`${this.baseUrl}/api/v2/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: params.language,
        version: params.version,
        files: [{ content: params.code }],
        stdin: params.stdin ?? '',
        run_timeout: RUN_TIMEOUT_MS,
      }),
    });

    if (!response.ok) {
      const body = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
      throw new Error(`Piston request failed with status ${response.status}${body ? `: ${body}` : ''}`);
    }

    const body = (await response.json()) as PistonApiResponse;

    const compileError =
      COMPILED_LANGUAGES.has(params.language) && body.compile && body.compile.code !== 0 ? body.compile.stderr : null;

    return {
      stdout: body.run.stdout,
      stderr: body.run.stderr,
      exitCode: body.run.code ?? -1,
      compileError,
      timedOut: body.run.signal === 'SIGKILL',
    };
  }
}
