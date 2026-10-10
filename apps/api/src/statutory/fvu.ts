import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, posix } from 'path';
import JSZip from 'jszip';
import { etdsStructure } from './etds';

// The government's File Validation Utility (FVU) for TDS returns (founder decision 5f-D1, 10 Oct 2026; M03 §19.8). The
// FVU is Protean's Java tool, fetched from the official page (go-live item 16) and never committed. Before each use its
// ZIP's SHA-256 is checked against the release below, chosen by the return's year (9.5 up to FY 2025-26, 1.2 from TY
// 2026-27); only its .jar and .cer files are unpacked (no paths outside the folder, size caps). It then runs in a
// throw-away container: no network, read-only root, the tool mounted read-only, one scratch folder holding only the
// return (and the challan file it checks against), an unprivileged user, every capability dropped, CPU, memory, process
// and time limits, and a JRE image pinned by digest. Only its result files are read back — the .fvu output and its error
// or statistics reports — strictly, with size caps, as untrusted text. Without that configuration a fake checks the
// file's structure in development and CI and says it is a fake; production refuses.
//
// DECISION NEEDED: how the real FVU runs unattended. Probed on 10 Oct 2026 (FVU 1.2, sandboxed as above): its documented
// interface is the desktop window; com.tin.FVU.FVU.main takes six arguments (input, a result file it overwrites, then a
// string and three numbers) and answers "Incorrect FVU Version of JAR" for every value tried. It also tries to reach
// onlineservices.tin.egov.proteantech.in first (blocked here, and it carries on). We do not decompile it. Options: ask
// Protean for the command-line contract (then set FVU_ARGS), or let the filer run the FVU on their own computer and
// upload the .fvu it makes. Until then production refuses, as above.

export interface FvuOutcome {
  ok: boolean;
  validator: 'fvu' | 'fake';
  version: string | null;
  errors: string[];
  /** The .fvu file the portal takes (only from the real FVU). */
  output: Buffer | null;
}

export class FvuUnavailable extends Error {}

/** The releases we accept, by their published file and SHA-256 (a new release means a new download, hash and review). */
export const FVU_RELEASES = [
  { version: '9.5', zip: 'TDS_STANDALONE_FVU_9.5.zip', sha256: '7b549a29e9682d89acf88ecc0b53732c794a8700a474ee8e52d7c8bd2912ed0c', firstYear: 2010, lastYear: 2025 },
  { version: '1.2', zip: 'TDS_STANDALONE_FVU_1.2.zip', sha256: '21f7a5a45b42cdd2c952aa633a0049d6c81612e87d43d1d02720bd781943c06d', firstYear: 2026, lastYear: 9999 },
] as const;

/** The release for a return's year: the 1961 Act FVU up to FY 2025-26, the 2025 Act one from TY 2026-27. */
export const fvuFor = (taxYear: string) => {
  const y = Number(taxYear.slice(0, 4));
  const r = FVU_RELEASES.find((x) => y >= x.firstYear && y <= x.lastYear);
  if (!r) throw new FvuUnavailable(`No File Validation Utility covers ${taxYear}.`);
  return r;
};

const CAP_ZIP_ENTRY = 20 * 1024 * 1024;
const CAP_FVU_OUTPUT = 50 * 1024 * 1024;
const CAP_REPORT = 2 * 1024 * 1024;

/** Strict reading of an FVU report: tags and control characters gone, at most 200 lines of 500 characters. */
export function reportLines(text: string): string[] {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((l) => l.slice(0, 500));
}

/** Unpacks only the tool's .jar and .cer files, flat, refusing paths that leave the folder and oversized entries. */
export async function unpackTool(zipBytes: Buffer, into: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipBytes);
  const out: string[] = [];
  for (const e of Object.values(zip.files)) {
    if (e.dir) continue;
    const name = posix.basename(e.name.replace(/\\/g, '/'));
    if (!/^[A-Za-z0-9._-]+\.(jar|cer)$/.test(name) || `${e.unsafeOriginalName ?? ''}/${e.name}`.includes('..')) continue;
    const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (size > CAP_ZIP_ENTRY) throw new FvuUnavailable(`The FVU package has an oversized file (${name}).`);
    const bytes = await e.async('nodebuffer');
    if (bytes.length > CAP_ZIP_ENTRY) throw new FvuUnavailable(`The FVU package has an oversized file (${name}).`);
    await writeFile(join(into, name), bytes);
    out.push(name);
  }
  return out;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

@Injectable()
export class FvuRunner {
  private readonly logger = new Logger(FvuRunner.name);

  /**
   * Validates a return file. Configuration: FVU_DIR (the folder holding the downloaded ZIPs), FVU_JRE_IMAGE (a JRE image
   * pinned by digest, name@sha256:...) and FVU_ARGS (the FVU's command-line arguments as a JSON array, with {input},
   * {csi} and {out} for the files in the scratch folder).
   */
  async validate(file: Buffer, taxYear: string, csi: Buffer | null): Promise<FvuOutcome> {
    const dir = process.env.FVU_DIR;
    const image = process.env.FVU_JRE_IMAGE;
    const argsText = process.env.FVU_ARGS;
    if (!dir || !image || !argsText) {
      if (process.env.NODE_ENV === 'production') throw new FvuUnavailable('The File Validation Utility is not set up yet, so a return cannot be validated. Ask YukthiX support (go-live item 16).');
      const errors = etdsStructure(file);
      return { ok: !errors.length, validator: 'fake', version: null, errors, output: null };
    }
    if (!/@sha256:[0-9a-f]{64}$/.test(image)) throw new FvuUnavailable('FVU_JRE_IMAGE must be pinned by digest (name@sha256:...).');
    const args = JSON.parse(argsText) as unknown;
    if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) throw new FvuUnavailable('FVU_ARGS is a JSON array of strings.');
    if (!csi) throw new FvuUnavailable('Upload the challan file (CSI) for this TAN and period from the TIN website first; the FVU checks the challans against it.');
    const release = fvuFor(taxYear);
    const zipBytes = await readFile(join(dir, release.zip));
    if (sha256(zipBytes) !== release.sha256) throw new FvuUnavailable(`The FVU ${release.version} package does not match its published SHA-256, so it is not used.`);
    const tool = await mkdtemp(join(tmpdir(), 'fvu-tool-'));
    const work = await mkdtemp(join(tmpdir(), 'fvu-work-'));
    try {
      const jars = await unpackTool(zipBytes, tool);
      if (!jars.some((j) => j.startsWith('TDS_STANDALONE_FVU_'))) throw new FvuUnavailable('The FVU package has no FVU jar.');
      await mkdir(join(work, 'out'));
      await writeFile(join(work, 'return.txt'), file);
      await writeFile(join(work, 'challans.csi'), csi);
      const filled = (args as string[]).map((a) => a.replace('{input}', '/work/return.txt').replace('{csi}', '/work/challans.csi').replace('{out}', '/work/out'));
      // execFile: no shell. The container sees the tool read-only and the scratch folder only; nothing else of the host.
      await new Promise<void>((resolve, reject) =>
        execFile(
          'docker',
          [
            'run',
            '--rm',
            '--network',
            'none',
            '--read-only',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges',
            '--user',
            '65534:65534',
            '--cpus',
            '1',
            '--memory',
            '1g',
            '--pids-limit',
            '256',
            '--tmpfs',
            '/tmp:rw,size=64m',
            '-v',
            `${tool}:/fvu:ro`,
            '-v',
            `${work}:/work`,
            '-w',
            '/work',
            image,
            'java',
            '-Djava.awt.headless=true',
            '-cp',
            '/fvu/*',
            'com.tin.FVU.FVU',
            ...filled,
          ],
          { timeout: 300_000, maxBuffer: 1024 * 1024 },
          (err) => (err && !('code' in err && typeof err.code === 'number') ? reject(err) : resolve()),
        ),
      );
      const found = (await readdir(join(work, 'out'))).filter((n) => /^[A-Za-z0-9._-]+$/.test(n));
      const fvu = found.find((n) => n.toLowerCase().endsWith('.fvu'));
      if (fvu) {
        if ((await stat(join(work, 'out', fvu))).size > CAP_FVU_OUTPUT) throw new FvuUnavailable('The FVU output is larger than expected.');
        return { ok: true, validator: 'fvu', version: release.version, errors: [], output: await readFile(join(work, 'out', fvu)) };
      }
      const errors: string[] = [];
      for (const n of found.filter((x) => /\.(html|err|txt)$/i.test(x)).slice(0, 5)) {
        if ((await stat(join(work, 'out', n))).size > CAP_REPORT) continue;
        errors.push(...reportLines(await readFile(join(work, 'out', n), 'utf8')));
      }
      return { ok: false, validator: 'fvu', version: release.version, errors: errors.length ? errors.slice(0, 200) : ['The FVU did not accept the file and wrote no report.'], output: null };
    } catch (e) {
      if (e instanceof FvuUnavailable) throw e;
      this.logger.error(`FVU run failed: ${(e as Error).message}`);
      throw new FvuUnavailable('The File Validation Utility could not be run. Try again, or ask YukthiX support.');
    } finally {
      await rm(tool, { recursive: true, force: true });
      await rm(work, { recursive: true, force: true });
    }
  }
}
