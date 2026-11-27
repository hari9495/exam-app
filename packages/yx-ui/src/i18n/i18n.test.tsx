import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EN, HI } from './messages';
import { formatDateIn, formatNumberIn, KIT_MESSAGES, overlay, YxI18nProvider } from './index';
import { MyLanguageScreen } from '../screens/global/my-language';
import { MORE_SETTINGS } from '../screens/settings/time-settings-live';

// T2-G 84b (answer 2743): the kit's Hindi words. Guard: every Hindi key exists in English (English is the fallback).
type Tree = { [k: string]: string | Tree };
const keys = (t: Tree, at = ''): string[] => Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keys(v, `${at}${k}.`)));

describe('kit messages', () => {
  it('every Hindi key exists in English, and no Hindi word is empty', () => {
    const en = new Set(keys(EN as unknown as Tree));
    const hi = keys(HI as Tree);
    expect(hi.filter((k) => !en.has(k))).toEqual([]);
    expect(keys(HI as Tree).length).toBeGreaterThan(0);
    const values = (t: Tree): string[] => Object.values(t).flatMap((v) => (typeof v === 'string' ? [v] : values(v)));
    expect(values(HI as Tree).filter((v) => !v.trim())).toEqual([]);
  });

  it('a word missing in Hindi falls back to English', () => {
    const merged = overlay({ a: 'A', b: { c: 'C', d: 'D' } }, { b: { c: 'सी' } });
    expect(merged).toEqual({ a: 'A', b: { c: 'सी', d: 'D' } });
    expect(new Set(keys(KIT_MESSAGES.hi))).toEqual(new Set(keys(EN as unknown as Tree)));
  });

  it('the company switch for Hindi screens sits on Settings 1.1', () => {
    expect(MORE_SETTINGS['1.1']!.settings.map((p) => p.key)).toContain('people.language.hindi_screens');
  });

  it('dates and numbers in Indian style in either language', () => {
    const d = new Date('2026-12-03T06:00:00Z');
    expect(formatDateIn('en', d)).toBe('3 Dec 2026');
    expect(formatDateIn('hi', d)).toMatch(/^3 .+ 2026$/);
    expect(formatNumberIn('en', 1234567)).toBe('12,34,567');
    expect(formatNumberIn('hi', 1234567)).toBe('12,34,567');
  });
});

describe('Me › Language in the reader language', () => {
  const data = { language: 'hi' as const, chosen: true, companyLanguage: 'en' as const, choices: ['en', 'hi'] as ('en' | 'hi')[] };
  it('a Hindi reader sees the page in Hindi', () => {
    render(
      <YxI18nProvider locale="hi">
        <MyLanguageScreen state="ready" data={data} onSave={async () => undefined} />
      </YxI18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'भाषा' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'सहेजें' })).toBeInTheDocument();
    expect(screen.getByText(/अंग्रेज़ी में रहते हैं/)).toBeInTheDocument();
  });
  it('negative: without the provider (English readers, admin pages) it stays English', () => {
    render(<MyLanguageScreen state="ready" data={data} onSave={async () => undefined} />);
    expect(screen.getByRole('heading', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
