import { createHash } from 'crypto';
import { buildSebConfig, computeConfigKey, requestConfigKeyHash } from './seb-config';

describe('seb-config', () => {
  const startUrl = 'https://exam.test/start?token=tok-1';

  it('builds a plist with the start URL, hash headers enabled, and prohibited processes', () => {
    const { plistXml } = buildSebConfig({ startUrl });

    expect(plistXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(plistXml).toContain('<key>startURL</key>');
    expect(plistXml).toContain('<string>https://exam.test/start?token=tok-1</string>');
    expect(plistXml).toContain('<key>sendBrowserExamKey</key>');
    expect(plistXml).toContain('<key>prohibitedProcesses</key>');
    expect(plistXml).toContain('<string>anydesk</string>');
    expect(plistXml).toContain('<string>teamviewer</string>');
  });

  it('escapes XML-special characters in the start URL', () => {
    const { plistXml } = buildSebConfig({ startUrl: 'https://exam.test/start?a=1&b=<x>' });

    expect(plistXml).toContain('<string>https://exam.test/start?a=1&amp;b=&lt;x&gt;</string>');
    expect(plistXml).not.toContain('b=<x>');
  });

  it('computes a stable config key that changes with the start URL', () => {
    const a1 = buildSebConfig({ startUrl });
    const a2 = buildSebConfig({ startUrl });
    const b = buildSebConfig({ startUrl: 'https://exam.test/start?token=tok-2' });

    expect(a1.configKey).toEqual(a2.configKey);
    expect(a1.configKey).toMatch(/^[0-9a-f]{64}$/);
    expect(a1.configKey).not.toEqual(b.configKey);
  });

  it('serializes canonically: keys sorted case-insensitively, no whitespace', () => {
    // Same dictionary, declared in different key orders, must hash identically.
    const keyA = computeConfigKey({ b: 1, A: 'x', c: [true, { z: 1, y: 2 }] });
    const keyB = computeConfigKey({ c: [true, { y: 2, z: 1 }], A: 'x', b: 1 });

    expect(keyA).toEqual(keyB);
  });

  it('requestConfigKeyHash matches SHA256(url + configKey)', () => {
    const configKey = 'ab'.repeat(32);
    const url = 'https://runtime.test/api/v1/attempt/start';

    const expected = createHash('sha256').update(url + configKey, 'utf8').digest('hex');
    expect(requestConfigKeyHash(url, configKey)).toEqual(expected);
  });
});
