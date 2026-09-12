import { BadRequestException } from '@nestjs/common';
import { httpProvider } from './http-provider';
import { linkedinProvider } from './linkedin-provider';
import { indeedProvider } from './indeed-provider';
import { getJobBoardProvider, PAID_PROVIDER_IDS, extractExternalId } from './index';
import { JobPostingInput } from './types';

const job: JobPostingInput = {
  title: 'Backend Engineer',
  description: 'Build things',
  location: 'Remote',
  employmentType: 'full_time',
  companyName: 'Acme',
  applyUrl: 'https://app.example.com/apply/tok-1',
  reference: 'job-1',
};

describe('job-board provider registry', () => {
  it('registers the three paid providers', () => {
    expect(PAID_PROVIDER_IDS).toEqual(['linkedin', 'indeed', 'http']);
    expect(getJobBoardProvider('linkedin')).toBe(linkedinProvider);
    expect(getJobBoardProvider('xml_feed')).toBeUndefined(); // the free board has no adapter
  });

  it('extractExternalId handles the common response shapes', () => {
    expect(extractExternalId({ id: 'abc' })).toBe('abc');
    expect(extractExternalId({ jobId: 42 })).toBe('42');
    expect(extractExternalId({ elements: [{ id: 'e1' }] })).toBe('e1');
    expect(extractExternalId({ nope: true })).toBeUndefined();
  });
});

describe('httpProvider', () => {
  it('rejects a non-https / private post url (SSRF guard)', () => {
    expect(() => httpProvider.validateConfig({ postUrl: 'http://x.com', bodyTemplate: '{}' })).toThrow(BadRequestException);
    expect(() => httpProvider.validateConfig({ postUrl: 'https://localhost/x', bodyTemplate: '{}' })).toThrow(BadRequestException);
    expect(() => httpProvider.validateConfig({ postUrl: 'https://boards.example.com', bodyTemplate: '{}' })).not.toThrow();
  });

  it('posts the substituted JSON body and extracts the external id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'ext-9' }), { status: 200 }));
    const config = { postUrl: 'https://boards.example.com/jobs', bodyTemplate: '{"t":"{{title}}","u":"{{applyUrl}}"}', authHeader: 'Bearer k' };
    const out = await httpProvider.postJob(config, job, fetchImpl as any);
    expect(out.externalPostId).toBe('ext-9');
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://boards.example.com/jobs');
    expect(opts.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(opts.body)).toEqual({ t: 'Backend Engineer', u: 'https://app.example.com/apply/tok-1' });
  });

  it('falls back to the job reference when the board returns no id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    const out = await httpProvider.postJob({ postUrl: 'https://b.example.com', bodyTemplate: '{}' }, job, fetchImpl as any);
    expect(out.externalPostId).toBe('job-1');
  });

  it('throws on a non-ok post', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('no', { status: 500 }));
    await expect(httpProvider.postJob({ postUrl: 'https://b.example.com', bodyTemplate: '{}' }, job, fetchImpl as any)).rejects.toThrow();
  });

  it('closeJob substitutes the id and treats 404 as success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(
      httpProvider.closeJob({ postUrl: 'https://b.example.com', bodyTemplate: '{}', closeUrlTemplate: 'https://b.example.com/jobs/{{externalPostId}}' }, 'ext-9', fetchImpl as any),
    ).resolves.toBeUndefined();
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://b.example.com/jobs/ext-9');
  });
});

describe('linkedinProvider', () => {
  it('requires token + company urn', () => {
    expect(() => linkedinProvider.validateConfig({})).toThrow(BadRequestException);
    expect(() => linkedinProvider.validateConfig({ accessToken: 't', authorUrn: 'urn:li:organization:1' })).not.toThrow();
  });

  it('posts with a bearer token and returns the id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'li-1' }), { status: 201 }));
    const out = await linkedinProvider.postJob({ accessToken: 'tok', authorUrn: 'urn:li:organization:1' }, job, fetchImpl as any);
    expect(out.externalPostId).toBe('li-1');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });
});

describe('indeedProvider', () => {
  it('requires api key + employer id', () => {
    expect(() => indeedProvider.validateConfig({ apiKey: 'k' })).toThrow(BadRequestException);
    expect(() => indeedProvider.validateConfig({ apiKey: 'k', employerId: 'e1' })).not.toThrow();
  });

  it('posts and returns the id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ jobId: 'in-1' }), { status: 200 }));
    const out = await indeedProvider.postJob({ apiKey: 'k', employerId: 'e1' }, job, fetchImpl as any);
    expect(out.externalPostId).toBe('in-1');
  });
});
