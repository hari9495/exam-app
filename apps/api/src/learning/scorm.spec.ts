import JSZip from 'jszip';
import { DEFAULT_LIMITS, ScormRefused, badPath, bridgeScript, cleanCmi, contentHeaders, contentOrigin, injectBridge, parseManifest, readToken, scormDone, scormShown, signToken, startValues, unpackScorm } from './scorm';

const ENV = { JWT_ACCESS_SECRET: 'test-secret-for-scorm-tokens' } as NodeJS.ProcessEnv;

export const MANIFEST_12 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1"><title>Fire safety</title>
    <item identifier="i1" identifierref="r1"><title>Lesson</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`;
export const MANIFEST_2004 = `<?xml version="1.0"?>
<manifest identifier="m" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="o"><organization identifier="o"><title>Allergens</title>
    <item identifier="a"><title>Part</title><item identifier="b" identifierref="res"><title>SCO</title></item></item></organization></organizations>
  <resources xml:base="content/"><resource identifier="res" type="webcontent" adlcp:scormType="sco" href="start.html?x=1"/></resources>
</manifest>`;

async function zipOf(files: Record<string, string | Buffer>, opts: { unix?: Record<string, number> } = {}) {
  const z = new JSZip();
  for (const [name, data] of Object.entries(files)) z.file(name, data, opts.unix?.[name] ? { unixPermissions: opts.unix[name] } : {});
  return Buffer.from(await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: opts.unix ? 'UNIX' : 'DOS' }));
}
const refused = async (p: Promise<unknown>, msg: RegExp) => {
  await expect(p).rejects.toBeInstanceOf(ScormRefused);
  await expect(p).rejects.toThrow(msg);
};

describe('SCORM manifest (answer 2781)', () => {
  it('reads a 1.2 manifest: version, launch file, title', () => {
    expect(parseManifest(MANIFEST_12)).toEqual({ version: '1.2', launch: 'index.html', title: 'Fire safety' });
  });
  it('reads a 2004 manifest: nested item, xml:base and a query string', () => {
    expect(parseManifest(MANIFEST_2004)).toEqual({ version: '2004', launch: 'content/start.html?x=1', title: 'Allergens' });
  });
  it('refuses broken, entity-bearing, non-SCORM and escaping manifests', () => {
    expect(() => parseManifest('<manifest><unclosed></manifest>')).toThrow(/not valid XML/);
    expect(() => parseManifest(`<?xml version="1.0"?><!DOCTYPE m [<!ENTITY x SYSTEM "file:///etc/passwd">]>${MANIFEST_12.slice(39)}`)).toThrow(/DOCTYPE or ENTITY/);
    expect(() => parseManifest(MANIFEST_12.replace('<schemaversion>1.2</schemaversion>', '').replace('adlcp_rootv1p2', 'other'))).toThrow(/not a SCORM 1.2 or SCORM 2004/);
    expect(() => parseManifest(MANIFEST_12.replace('href="index.html"', 'href="../x.html"'))).toThrow(/inside the package/);
    expect(() => parseManifest(MANIFEST_12.replace('href="index.html"', 'href="https://evil.test/x.html"'))).toThrow(/inside the package/);
    expect(() => parseManifest(MANIFEST_12.replace(/ href="index.html"/, ''))).toThrow(/does not name the launch file/);
  });
});

describe('SCORM zip limits (answer 2781)', () => {
  it('unpacks a good package and reads each file', async () => {
    const out = await unpackScorm(await zipOf({ 'imsmanifest.xml': MANIFEST_12, 'index.html': '<html><head></head></html>', 'js/app.js': 'x=1' }), DEFAULT_LIMITS);
    expect(out.version).toBe('1.2');
    expect(out.files.map((f) => f.path).sort()).toEqual(['imsmanifest.xml', 'index.html', 'js/app.js']);
    expect((await out.files.find((f) => f.path === 'js/app.js')!.read()).toString()).toBe('x=1');
  });
  it('refuses a missing manifest, a missing launch file and a file that is not a zip', async () => {
    await refused(unpackScorm(await zipOf({ 'index.html': 'x' }), DEFAULT_LIMITS), /no imsmanifest.xml/);
    await refused(unpackScorm(await zipOf({ 'imsmanifest.xml': MANIFEST_12 }), DEFAULT_LIMITS), /launch file index.html/);
    await refused(unpackScorm(Buffer.from('not a zip at all'), DEFAULT_LIMITS), /not a zip/);
  });
  it('refuses the compressed size', async () => {
    const z = await zipOf({ 'imsmanifest.xml': MANIFEST_12, 'index.html': 'x' });
    await refused(unpackScorm(z, { ...DEFAULT_LIMITS, maxZipMb: z.length / 1024 / 1024 / 2 }), /over/);
  });
  it('refuses too many files', async () => {
    await refused(unpackScorm(await zipOf({ 'imsmanifest.xml': MANIFEST_12, 'index.html': 'x', 'a.js': '1' }), { ...DEFAULT_LIMITS, maxFiles: 2 }), /3 files; up to 2/);
  });
  it('refuses the unzipped size, also when read (a header can lie)', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 65);
    await refused(unpackScorm(await zipOf({ 'imsmanifest.xml': MANIFEST_12, 'index.html': big }), { ...DEFAULT_LIMITS, maxUnzippedMb: 1, maxRatio: 100_000 }), /more than 1 MB/);
  });
  it('refuses a zip bomb by its ratio', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, 0);
    await refused(unpackScorm(await zipOf({ 'imsmanifest.xml': MANIFEST_12, 'index.html': big }), { ...DEFAULT_LIMITS, maxRatio: 10 }), /10 times its size/);
  });
  it('refuses absolute paths, "..", drive letters, backslashes and symlinks', async () => {
    const base = { 'imsmanifest.xml': MANIFEST_12, 'index.html': 'x' };
    await refused(unpackScorm(await zipOf({ ...base, '../evil.js': 'x' }), DEFAULT_LIMITS), /outside the package/);
    await refused(unpackScorm(await zipOf({ ...base, 'a/../../evil.js': 'x' }), DEFAULT_LIMITS), /outside the package/);
    await refused(unpackScorm(await zipOf({ ...base, '/etc/evil.js': 'x' }), DEFAULT_LIMITS), /absolute path/);
    await refused(unpackScorm(await zipOf({ ...base, 'C:/evil.js': 'x' }), DEFAULT_LIMITS), /absolute path/);
    await refused(unpackScorm(await zipOf({ ...base, 'a\\evil.js': 'x' }), DEFAULT_LIMITS), /backslashes/);
    await refused(unpackScorm(await zipOf({ ...base, link: '/etc/passwd' }, { unix: { link: 0o120777 } }), DEFAULT_LIMITS), /symbolic link/);
    expect(badPath('content/a.html')).toBeNull();
  });
});

describe('SCORM bridge fields (answer 2781)', () => {
  it('keeps only the allowed fields of each version', () => {
    expect(cleanCmi('1.2', { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '85', 'cmi.suspend_data': 'abc', 'cmi.core.student_name': 'Someone else', 'cmi.interactions': {}, 'cmi.comments': 'x', 'cmi.core.session_time': '00:10:00' })).toEqual({
      'cmi.core.lesson_status': 'passed',
      'cmi.core.score.raw': '85',
      'cmi.suspend_data': 'abc',
      'cmi.core.session_time': '00:10:00',
    });
    expect(cleanCmi('2004', { 'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'cmi.location': 'p2', 'cmi.learner_name': 'x', 'cmi.core.lesson_status': 'passed', 'cmi.total_time': 'PT1H2M' })).toEqual({
      'cmi.completion_status': 'completed',
      'cmi.success_status': 'passed',
      'cmi.score.scaled': '0.9',
      'cmi.location': 'p2',
      'cmi.total_time': 'PT1H2M',
    });
  });
  it('drops invalid values and prototype tricks; refuses oversize suspend data', () => {
    expect(cleanCmi('1.2', { 'cmi.core.lesson_status': 'hacked', 'cmi.core.score.raw': 'abc', __proto__: { x: 1 }, constructor: 'x' })).toEqual({});
    expect(cleanCmi('2004', { 'cmi.score.scaled': '2' })).toEqual({});
    expect(cleanCmi('2004', null)).toEqual({});
    expect(() => cleanCmi('1.2', { 'cmi.suspend_data': 'x'.repeat(64_001) })).toThrow(ScormRefused);
  });
  it('done, status and score per version', () => {
    expect(scormDone('1.2', { 'cmi.core.lesson_status': 'passed' })).toBe(true);
    expect(scormDone('1.2', { 'cmi.core.lesson_status': 'failed' })).toBe(false);
    expect(scormDone('2004', { 'cmi.completion_status': 'completed' })).toBe(true);
    expect(scormDone('2004', { 'cmi.completion_status': 'completed', 'cmi.success_status': 'failed' })).toBe(false);
    expect(scormShown('2004', { 'cmi.success_status': 'failed', 'cmi.score.scaled': '0.4' })).toEqual({ status: 'failed', score: '40%' });
    expect(scormShown('1.2', { 'cmi.core.score.raw': '8', 'cmi.core.score.max': '10' })).toEqual({ status: 'incomplete', score: '8 of 10' });
  });
  it('resumes: saved values go back in, entry is resume when there is something to resume', () => {
    expect(startValues('1.2', { 'cmi.suspend_data': 's', 'cmi.core.session_time': '00:01:00' }, { id: 'e1', name: 'Arjun' })).toEqual({ 'cmi.suspend_data': 's', 'cmi.core.student_id': 'e1', 'cmi.core.student_name': 'Arjun', 'cmi.core.entry': 'resume' });
    expect(startValues('2004', {}, { id: 'e1', name: 'Arjun' })['cmi.entry']).toBe('ab-initio');
  });
  it('the bridge posts to the app origin only, never "*"', () => {
    const js = bridgeScript('1.2', { item: 'i1', app: 'https://acme.yukthix.test', cmi: { 'cmi.suspend_data': '</script><script>alert(1)</script>' } });
    expect(js).toContain('postMessage({ yxScorm: 1, item: S.item, cmi: params, final: !!immediate }, S.app)');
    expect(js).not.toContain("'*'");
    expect(js).not.toContain('</script>');
  });
});

describe('SCORM content origin (answer 2781)', () => {
  const t = { o: 'org', i: 'item', e: 'enr', a: 'https://app.test', x: Date.now() + 60_000 };
  it('signed tokens are read back; tampered, unsigned and expired ones are not', () => {
    const tok = signToken(t, ENV);
    expect(readToken(tok, Date.now(), ENV)).toEqual(t);
    expect(readToken(tok, t.x + 1, ENV)).toBeNull();
    const [body, sig] = tok.split('.');
    const other = Buffer.from(JSON.stringify({ ...t, i: 'other' })).toString('base64url');
    expect(readToken(`${other}.${sig}`, Date.now(), ENV)).toBeNull();
    expect(readToken(body, Date.now(), ENV)).toBeNull();
    expect(readToken(`${body}.${sig}`, Date.now(), { JWT_ACCESS_SECRET: 'another' } as NodeJS.ProcessEnv)).toBeNull();
  });
  it('the content origin must be set and differ from the app', () => {
    expect(contentOrigin({} as NodeJS.ProcessEnv)).toBeNull();
    expect(contentOrigin({ SCORM_CONTENT_ORIGIN: 'https://app.test', WEB_ORIGIN: 'https://app.test' } as NodeJS.ProcessEnv)).toBeNull();
    expect(contentOrigin({ SCORM_CONTENT_ORIGIN: 'https://scorm.test/x', WEB_ORIGIN: 'https://app.test' } as NodeJS.ProcessEnv)).toBe('https://scorm.test');
  });
  it('every file has the CSP: own origin only, framed by the app, sandboxed', () => {
    const h = contentHeaders('https://scorm.test', 'https://app.test', 'text/html');
    expect(h['Content-Security-Policy']).toContain("default-src 'none'");
    expect(h['Content-Security-Policy']).toContain("script-src https://scorm.test 'unsafe-inline'");
    expect(h['Content-Security-Policy']).toContain('connect-src https://scorm.test;');
    expect(h['Content-Security-Policy']).toContain('frame-ancestors https://app.test https://scorm.test');
    expect(h['Content-Security-Policy']).toContain('sandbox allow-scripts allow-forms');
    expect(h['Content-Security-Policy']).not.toContain('allow-same-origin');
  });
  it('injects the bridge first in the head, or at the start', () => {
    expect(injectBridge(Buffer.from('<html><head lang="en"><title>x</title></head></html>'), '/s/api.js').toString()).toBe('<html><head lang="en"><script src="/s/api.js"></script><title>x</title></head></html>');
    expect(injectBridge(Buffer.from('<p>x</p>'), '/s/api.js').toString()).toBe('<script src="/s/api.js"></script><p>x</p>');
  });
});
