import { timingSafeEqual } from 'crypto';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { keyedHash } from '../common/keyed-hash';

// Answer 2781: SCORM 1.2 and 2004 packages, the pure parts (unit-tested in scorm.spec.ts).
// - The SCORM run-time API is scorm-again 3.5.0 (MIT licence, github.com/jcputney/scorm-again; licence and advisories
//   checked 26 Nov 2026: MIT allows commercial SaaS use, `npm audit` lists nothing for it). It runs inside the package's
//   sandboxed frame; our bridge only forwards its commits to the app with postMessage. We never hand-roll the API.
// - The zip is read with JSZip (already used here), every limit checked while unpacking (a header can lie).
// - imsmanifest.xml is read with @xmldom/xmldom; a DOCTYPE or ENTITY is refused before parsing (no entity expansion).

export type ScormVersion = '1.2' | '2004';
interface JSZipStream {
  on(e: 'data', fn: (chunk: Uint8Array) => void): JSZipStream;
  on(e: 'error' | 'end', fn: () => void): JSZipStream;
  pause(): JSZipStream;
  resume(): JSZipStream;
}
export class ScormRefused extends Error {}

export interface ZipLimits {
  maxZipMb: number;
  maxUnzippedMb: number;
  maxFiles: number;
  maxRatio: number;
}
export const DEFAULT_LIMITS: ZipLimits = { maxZipMb: 100, maxUnzippedMb: 250, maxFiles: 2000, maxRatio: 100 };
/** The platform's ceiling on an upload (the company setting chooses up to this). */
export const MAX_ZIP_MB = 200;
const MB = 1024 * 1024;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/** Why a path inside a zip is refused (absolute, "..", a drive letter, backslashes, control characters), or null. */
export function badPath(name: string): string | null {
  if (!name || name.length > 1000) return 'a file name that is empty or too long';
  if (/[\u0000-\u001f\\]/.test(name)) return 'a file name with backslashes or control characters';
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return 'a file with an absolute path';
  if (name.split('/').some((s) => s === '..' || s === '.')) return 'a file that points outside the package (..)';
  return null;
}

export interface Unpacked {
  version: ScormVersion;
  launch: string;
  title: string | null;
  /** Each file in the package, read when asked (so only one is in memory at a time), with every limit checked. */
  files: { path: string; read: () => Promise<Buffer> }[];
}

/**
 * Opens a SCORM zip: refuses zip bombs (size, unzipped size, file count, ratio), path escapes and symlinks, finds and
 * reads imsmanifest.xml, and checks the launch file is in the package. Files are read later, one at a time.
 */
export async function unpackScorm(zipData: Buffer, limits: ZipLimits): Promise<Unpacked> {
  if (zipData.length > limits.maxZipMb * MB) throw new ScormRefused(`The package is over ${limits.maxZipMb} MB.`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipData);
  } catch {
    throw new ScormRefused('This is not a zip file we can open.');
  }
  const entries = Object.values(zip.files);
  const files = entries.filter((f) => !f.dir);
  if (files.length > limits.maxFiles) throw new ScormRefused(`The package has ${files.length} files; up to ${limits.maxFiles} are allowed.`);
  let declared = 0;
  // Files first, then folders (a folder's name says less about what is wrong).
  for (const f of [...files, ...entries.filter((x) => x.dir)]) {
    // JSZip cleans names on load; the name as written in the zip is what we judge.
    const raw = (f as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? f.name;
    const why = badPath(f.dir ? raw.replace(/\/$/, '') : raw);
    if (why) throw new ScormRefused(`The package has ${why}.`);
    if (typeof f.unixPermissions === 'number' && (f.unixPermissions & S_IFMT) === S_IFLNK) throw new ScormRefused('The package has a symbolic link.');
    declared += (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  }
  const maxBytes = Math.min(limits.maxUnzippedMb * MB, limits.maxRatio * zipData.length);
  const tooBig = () => new ScormRefused(limits.maxUnzippedMb * MB <= limits.maxRatio * zipData.length ? `The package unzips to more than ${limits.maxUnzippedMb} MB.` : `The package unzips to more than ${limits.maxRatio} times its size.`);
  if (declared > maxBytes) throw tooBig();
  let total = 0;
  const read = async (f: JSZip.JSZipObject) => {
    const chunks: Buffer[] = [];
    // The real size counts, not the header: stop as soon as the running total passes the limit.
    await new Promise<void>((resolve, reject) => {
      // internalStream is JSZip's public streaming API (missing from its type definitions).
      const stream = (f as unknown as { internalStream(t: 'uint8array'): JSZipStream }).internalStream('uint8array');
      stream
        .on('data', (chunk: Uint8Array) => {
          total += chunk.length;
          if (total > maxBytes) {
            stream.pause();
            reject(tooBig());
          } else chunks.push(Buffer.from(chunk));
        })
        .on('error', () => reject(new ScormRefused('A file in the package is damaged.')))
        .on('end', () => resolve())
        .resume();
    });
    return Buffer.concat(chunks);
  };
  const manifest = zip.files['imsmanifest.xml'];
  if (!manifest || manifest.dir) throw new ScormRefused('There is no imsmanifest.xml at the top of the package. Upload the SCORM zip as your authoring tool exported it.');
  const parsed = parseManifest((await read(manifest)).toString('utf8'));
  const names = new Set(files.map((f) => f.name));
  const launchFile = parsed.launch.split(/[?#]/)[0];
  if (!names.has(launchFile)) throw new ScormRefused(`The launch file ${launchFile} named in imsmanifest.xml is not in the package.`);
  total = 0; // the manifest is read again with the rest
  return { ...parsed, files: files.map((f) => ({ path: f.name, read: () => read(f) })) };
}

const kids = (el: Element, local: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && ((n as Element).localName ?? (n as Element).nodeName) === local);
const all = (el: Element | Document, local: string) => Array.from(el.getElementsByTagName('*')).filter((n) => (n.localName ?? n.nodeName.split(':').pop()) === local);
const attr = (el: Element, local: string) => Array.from(el.attributes).find((a) => (a.localName ?? a.name.split(':').pop())?.toLowerCase() === local.toLowerCase())?.value ?? null;

/** imsmanifest.xml: the SCORM version, the first SCO's launch file (with xml:base) and the course title. */
export function parseManifest(xml: string): { version: ScormVersion; launch: string; title: string | null } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ScormRefused('imsmanifest.xml has a DOCTYPE or ENTITY, which is not allowed.');
  let doc: Document;
  try {
    doc = new DOMParser({
      errorHandler: {
        // Strict: authoring tools write well-formed XML; anything xmldom has to repair is refused.
        warning: (m: string) => {
          throw new Error(m);
        },
        error: (m: string) => {
          throw new Error(m);
        },
        fatalError: (m: string) => {
          throw new Error(m);
        },
      },
    }).parseFromString(xml, 'text/xml') as unknown as Document;
  } catch {
    throw new ScormRefused('imsmanifest.xml is not valid XML.');
  }
  const root = doc.documentElement;
  if (!root || (root.localName ?? root.nodeName) !== 'manifest') throw new ScormRefused('imsmanifest.xml has no manifest.');
  const schema = all(root, 'schemaversion')[0]?.textContent?.trim() ?? '';
  const ns = Array.from(root.attributes).map((a) => a.value).join(' ');
  const version: ScormVersion | null = /^1\.2$/.test(schema) ? '1.2' : /2004|CAM 1\.3/i.test(schema) ? '2004' : /adlcp_rootv1p2/.test(ns) ? '1.2' : /adlcp_v1p3/.test(ns) ? '2004' : null;
  if (!version) throw new ScormRefused('This is not a SCORM 1.2 or SCORM 2004 package.');
  const orgs = all(root, 'organizations')[0];
  const orgList = orgs ? kids(orgs, 'organization') : [];
  const org = orgList.find((o) => attr(o, 'identifier') === (orgs && attr(orgs, 'default'))) ?? orgList[0];
  if (!org) throw new ScormRefused('imsmanifest.xml has no organization to launch.');
  const first = all(org, 'item').find((i) => attr(i, 'identifierref'));
  if (!first) throw new ScormRefused('imsmanifest.xml has no item to launch.');
  const resourcesEl = all(root, 'resources')[0];
  const resource = resourcesEl ? kids(resourcesEl, 'resource').find((r) => attr(r, 'identifier') === attr(first, 'identifierref')) : undefined;
  const href = resource && attr(resource, 'href');
  if (!resource || !href) throw new ScormRefused('imsmanifest.xml does not name the launch file.');
  const launch = `${attr(resourcesEl!, 'base') ?? ''}${attr(resource, 'base') ?? ''}${href}`.replace(/^\.\//, '');
  const why = badPath(launch.split(/[?#]/)[0]);
  if (why || /^[a-z][a-z0-9+.-]*:/i.test(launch)) throw new ScormRefused('The launch file in imsmanifest.xml must be a file inside the package.');
  const title = kids(org, 'title')[0]?.textContent?.trim().slice(0, 200) || null;
  return { version, launch, title };
}

// ---------------------------------------------------------------------------------------------- what we keep

/** A cap on suspend data (the SCORM 2004 size; 1.2 packages often go past 1.2's 4096). */
export const SUSPEND_MAX = 64_000;
const NUM = /^-?\d{1,9}(\.\d{1,7})?$/;
const T12 = /^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/;
const T2004 = /^P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d{1,2})?S)?)?$/;
type Check = (v: string) => boolean;
const oneOf = (...xs: string[]): Check => (v) => xs.includes(v);
const num: Check = (v) => NUM.test(v);
const range = (lo: number, hi: number): Check => (v) => NUM.test(v) && Number(v) >= lo && Number(v) <= hi;
const text = (max: number): Check => (v) => v.length <= max;

/** The only cmi fields stored, per version (status, score, location, suspend data, times); everything else is ignored. */
export const FIELDS: Record<ScormVersion, Record<string, Check>> = {
  '1.2': {
    'cmi.core.lesson_status': oneOf('passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'),
    'cmi.core.score.raw': num,
    'cmi.core.score.min': num,
    'cmi.core.score.max': num,
    'cmi.core.lesson_location': text(255),
    'cmi.suspend_data': text(SUSPEND_MAX),
    'cmi.core.session_time': (v) => T12.test(v),
    'cmi.core.total_time': (v) => T12.test(v),
  },
  '2004': {
    'cmi.completion_status': oneOf('completed', 'incomplete', 'not attempted', 'unknown'),
    'cmi.success_status': oneOf('passed', 'failed', 'unknown'),
    'cmi.score.scaled': range(-1, 1),
    'cmi.score.raw': num,
    'cmi.score.min': num,
    'cmi.score.max': num,
    'cmi.progress_measure': range(0, 1),
    'cmi.location': text(1000),
    'cmi.suspend_data': text(SUSPEND_MAX),
    'cmi.session_time': (v) => T2004.test(v),
    'cmi.total_time': (v) => T2004.test(v),
  },
};

/** The allowed fields of a commit, as text; unknown fields and invalid values are dropped. Oversize suspend data is refused. */
export function cleanCmi(version: ScormVersion, input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const fields = FIELDS[version];
  for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(fields, k) || (typeof raw !== 'string' && typeof raw !== 'number')) continue;
    const v = String(raw);
    if (k === 'cmi.suspend_data' && v.length > SUSPEND_MAX) throw new ScormRefused(`The package's saved progress is over ${SUSPEND_MAX.toLocaleString('en-IN')} characters.`);
    if (v === '' || !fields[k](v)) continue;
    out[k] = v;
  }
  return out;
}

/** The package says it is finished: 1.2 completed or passed; 2004 passed, or completed and not failed. */
export function scormDone(version: ScormVersion, cmi: Record<string, string>): boolean {
  if (version === '1.2') return ['completed', 'passed'].includes(cmi['cmi.core.lesson_status']);
  return cmi['cmi.success_status'] === 'passed' || (cmi['cmi.completion_status'] === 'completed' && cmi['cmi.success_status'] !== 'failed');
}

/** What the player shows: the package's status and score. */
export function scormShown(version: ScormVersion, cmi: Record<string, string>): { status: 'incomplete' | 'completed' | 'failed'; score: string | null } {
  const failed = version === '1.2' ? cmi['cmi.core.lesson_status'] === 'failed' : cmi['cmi.success_status'] === 'failed';
  const p = version === '1.2' ? 'cmi.core.score' : 'cmi.score';
  const scaled = version === '2004' && cmi['cmi.score.scaled'] ? `${Math.round(Number(cmi['cmi.score.scaled']) * 100)}%` : null;
  const raw = cmi[`${p}.raw`] ? `${cmi[`${p}.raw`]}${cmi[`${p}.max`] ? ` of ${cmi[`${p}.max`]}` : ''}` : null;
  return { status: scormDone(version, cmi) ? 'completed' : failed ? 'failed' : 'incomplete', score: scaled ?? raw };
}

/** The values loaded into the run-time when the package starts (resume where the learner left off). */
export function startValues(version: ScormVersion, cmi: Record<string, string>, learner: { id: string; name: string }): Record<string, string> {
  const keep = Object.fromEntries(Object.entries(cmi).filter(([k]) => !k.endsWith('session_time')));
  return version === '1.2'
    ? { ...keep, 'cmi.core.student_id': learner.id, 'cmi.core.student_name': learner.name, 'cmi.core.entry': cmi['cmi.suspend_data'] || cmi['cmi.core.lesson_location'] ? 'resume' : 'ab-initio' }
    : { ...keep, 'cmi.learner_id': learner.id, 'cmi.learner_name': learner.name, 'cmi.entry': cmi['cmi.suspend_data'] || cmi['cmi.location'] ? 'resume' : 'ab-initio' };
}

// ---------------------------------------------------------------------------------------------- the content origin

/** A launch link lives this long; files load from it while the learner works through the package. */
export const TOKEN_HOURS = 3;
export interface ScormToken {
  /** company */ o: string;
  /** item (the package) */ i: string;
  /** enrolment */ e: string;
  /** the app origin that may frame it and receive its messages */ a: string;
  /** expires (ms since epoch) */ x: number;
}
const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function signToken(t: ScormToken, env: NodeJS.ProcessEnv = process.env): string {
  const body = b64(JSON.stringify(t));
  return `${body}.${keyedHash('scorm-content', body, env)}`;
}

/** The token's contents when the signature is ours and it has not expired; otherwise null. */
export function readToken(token: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): ScormToken | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || token.length > 2000) return null;
  const want = Buffer.from(keyedHash('scorm-content', body, env));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ScormToken;
    return typeof t.x === 'number' && t.x > now && [t.o, t.i, t.e, t.a].every((v) => typeof v === 'string' && v) ? t : null;
  } catch {
    return null;
  }
}

/** SCORM_CONTENT_ORIGIN as an origin, or null when unset, invalid or the same as an app origin (fail closed). */
export function contentOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.SCORM_CONTENT_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const o = new URL(raw).origin;
    return o === 'null' || o === (env.WEB_ORIGIN && new URL(env.WEB_ORIGIN).origin) ? null : o;
  } catch {
    return null;
  }
}

/** Headers on every package file: its own origin only, framed by the app only, sandboxed even when opened on its own. */
export function contentHeaders(content: string, app: string, mime: string): Record<string, string> {
  const src = content;
  return {
    'Content-Type': mime,
    'Content-Security-Policy': [
      "default-src 'none'",
      // Authoring tools (Articulate, Captivate, iSpring) write inline scripts and use eval: allowed, but only from here.
      `script-src ${src} 'unsafe-inline' 'unsafe-eval'`,
      `style-src ${src} 'unsafe-inline'`,
      `img-src ${src} data: blob:`,
      `media-src ${src} blob:`,
      `font-src ${src} data:`,
      `connect-src ${src}`,
      `frame-src ${src}`,
      `form-action ${src}`,
      `base-uri ${src}`,
      `frame-ancestors ${app} ${src}`,
      'sandbox allow-scripts allow-forms',
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, max-age=600',
    // Files are fetched from the package's own opaque (sandboxed) origin; no credentials ever.
    'Access-Control-Allow-Origin': '*',
  };
}

const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', xml: 'application/xml', xsd: 'application/xml', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', vtt: 'text/vtt',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', pdf: 'application/pdf', swf: 'application/octet-stream',
};
export const mimeOf = (path: string) => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** The run-time and bridge script tag, first thing in every HTML page of the package (so window.API exists at once). */
export function injectBridge(html: Buffer, scriptPath: string): Buffer {
  const tag = `<script src="${scriptPath}"></script>`;
  const s = html.toString('utf8');
  const head = s.match(/<head[^>]*>/i);
  return Buffer.from(head ? s.replace(head[0], `${head[0]}${tag}`) : `${tag}${s}`);
}

/**
 * The bridge, after the scorm-again run-time: loads what was saved, exposes window.API (1.2) or window.API_1484_11
 * (2004), and sends each commit to the app's origin only (never "*"). It talks to nothing else.
 */
export function bridgeScript(version: ScormVersion, state: { item: string; app: string; cmi: Record<string, string> }): string {
  // Safe inside a script: no '<' (no </script>) and no line separators (U+2028, U+2029).
  const unsafe = new RegExp(`[<${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
  const json = JSON.stringify({ v: version, ...state }).replace(unsafe, (c) => `${String.fromCharCode(92)}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `
;(function () {
  var S = ${json};
  var Api = S.v === '1.2' ? window.Scorm12API : window.Scorm2004API;
  var http = {
    processHttpRequest: function (url, params, immediate, log, listeners) {
      try { window.top.postMessage({ yxScorm: 1, item: S.item, cmi: params, final: !!immediate }, S.app); } catch (e) {}
      if (listeners) listeners('CommitSuccess');
      return { result: 'true', errorCode: 0 };
    },
    updateSettings: function () {}
  };
  var api = new Api({ lmsCommitUrl: 'yx-bridge', dataCommitFormat: 'flattened', httpService: http, autocommit: true, autocommitSeconds: 30, logLevel: 5 });
  api.loadFromFlattenedJSON(S.cmi, '');
  if (S.v === '1.2') window.API = api; else window.API_1484_11 = api;
})();
`;
}
