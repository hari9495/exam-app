import { Logger } from '@nestjs/common';
import { Socket, connect } from 'net';

// §14.2 virus scan of every attachment. Production: ClamAV's clamd side container, called over its socket with the
// documented INSTREAM command (SD_CLAMD_HOST / SD_CLAMD_PORT). On a laptop without ClamAV, SD_SCANNER=dev-fake turns on
// a stand-in that only knows the EICAR test file: it is refused in production and logs a warning on every start
// (GO-LIVE-CHECKLIST: "Attachment virus scanning"). With neither, nothing is scanned and every file stays pending, so
// nobody can download it (fail closed).

export type ScanVerdict = { verdict: 'clean' | 'infected'; detail: string } | { verdict: 'error'; detail: string };

export interface Scanner {
  readonly name: string;
  scan(data: Buffer): Promise<ScanVerdict>;
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const CHUNK = 64 * 1024;

/** clamd INSTREAM: "zINSTREAM\0", then <4-byte big-endian length><bytes> chunks, then a zero length; reply "stream: OK". */
export class ClamdScanner implements Scanner {
  readonly name = 'clamd';

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 60_000,
  ) {}

  scan(data: Buffer): Promise<ScanVerdict> {
    return new Promise((resolve) => {
      let reply = '';
      const socket: Socket = connect({ host: this.host, port: this.port });
      const done = (v: ScanVerdict) => {
        socket.destroy();
        resolve(v);
      };
      socket.setTimeout(this.timeoutMs, () => done({ verdict: 'error', detail: 'Scanner timed out' }));
      socket.on('error', (e) => done({ verdict: 'error', detail: `Scanner unreachable: ${e.message}` }));
      socket.on('data', (b) => {
        reply += b.toString('utf8');
        if (reply.includes('\0')) {
          const text = reply.replace(/\0/g, '').trim();
          if (/^stream: OK$/.test(text)) done({ verdict: 'clean', detail: 'No threats found' });
          else if (/FOUND$/.test(text)) done({ verdict: 'infected', detail: text.replace(/^stream:\s*/, '').slice(0, 200) });
          else done({ verdict: 'error', detail: text.slice(0, 200) });
        }
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < data.length; i += CHUNK) {
          const part = data.subarray(i, i + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length);
          socket.write(size);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

/** DEVELOPMENT ONLY. Knows one signature (EICAR) and calls everything else clean. Never in production. */
export class DevFakeScanner implements Scanner {
  readonly name = 'dev-fake (NOT A REAL VIRUS SCANNER)';

  async scan(data: Buffer): Promise<ScanVerdict> {
    return data.includes(EICAR) ? { verdict: 'infected', detail: 'Eicar-Test-Signature (dev fake scanner)' } : { verdict: 'clean', detail: 'dev fake scanner: not really scanned' };
  }
}

export function scannerFromEnv(env = process.env, logger = new Logger('DeskScanner')): Scanner | null {
  if (env.SD_CLAMD_HOST) return new ClamdScanner(env.SD_CLAMD_HOST, Number(env.SD_CLAMD_PORT ?? 3310));
  if (env.SD_SCANNER === 'dev-fake') {
    if (env.NODE_ENV === 'production') throw new Error('SD_SCANNER=dev-fake is for laptops only. Set SD_CLAMD_HOST to a ClamAV clamd service.');
    logger.warn('Attachments use the DEV FAKE virus scanner (EICAR only). Files are NOT really scanned. Never use this outside a laptop.');
    return new DevFakeScanner();
  }
  logger.warn('No virus scanner configured (SD_CLAMD_HOST): every desk attachment stays "being checked" and cannot be downloaded.');
  return null;
}

export const EICAR_TEST_STRING = EICAR;
