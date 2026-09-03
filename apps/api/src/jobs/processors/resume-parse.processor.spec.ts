import { AiNotConfiguredError } from '@exam-platform/shared';
import { ResumeParseProcessor } from './resume-parse.processor';
import { QuotaExceededException } from '../../billing/quota-exceeded.exception';

jest.mock('pdf-parse', () => jest.fn());
import pdfParse from 'pdf-parse';

describe('ResumeParseProcessor', () => {
  let processor: ResumeParseProcessor;
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { downloadToBuffer: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };
  let quota: { assertWithinLimit: jest.Mock };
  const aiProvider = { generateStructured: jest.fn(), ping: jest.fn() };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const profile = { candidateId: 'cand-1', resumePath: 'resumes/cand-1.pdf' };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantPrisma = { forTenant: jest.fn() };
    blobStorage = { downloadToBuffer: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn() };
    quota = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    processor = new ResumeParseProcessor(tenantPrisma as never, blobStorage as never, aiApiKeyResolver as never, quota as never);
  });

  it('parses the résumé and writes parsedSummary/parsedSkills/parsedTitle/parsedYearsExperience with parseStatus=done', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ candidateProfile: { findUnique, update }, aiCreditUsage: { create } }),
    );
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    blobStorage.downloadToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 fake bytes'));
    (pdfParse as unknown as jest.Mock).mockResolvedValue({ text: 'John Doe. Senior Backend Engineer. 6 years experience. Skills: Node.js, SQL.' });
    aiProvider.generateStructured.mockResolvedValue({
      summary: 'Senior backend engineer with 6 years of experience.',
      skills: ['Node.js', 'SQL'],
      title: 'Senior Backend Engineer',
      yearsExperience: 6,
    });

    const result = await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(result).toEqual({ ok: true });
    expect(findUnique).toHaveBeenCalledWith({ where: { candidateId: 'cand-1' } });
    expect(blobStorage.downloadToBuffer).toHaveBeenCalledWith('resumes/cand-1.pdf');
    expect(update).toHaveBeenCalledWith({
      where: { candidateId: 'cand-1' },
      data: {
        parseStatus: 'done',
        parsedSummary: 'Senior backend engineer with 6 years of experience.',
        parsedSkills: JSON.stringify(['Node.js', 'SQL']),
        parsedTitle: 'Senior Backend Engineer',
        parsedYearsExperience: 6,
        parsedAt: expect.any(Date),
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', source: 'resume_parse', credits: 1, sourceId: 'cand-1' },
    });
  });

  it('sets parseStatus=failed and returns without touching blob storage or AI when the profile has no resumePath', async () => {
    const findUnique = jest.fn().mockResolvedValue({ candidateId: 'cand-1', resumePath: null });
    const update = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ candidateProfile: { findUnique, update } }));

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(update).toHaveBeenCalledWith({ where: { candidateId: 'cand-1' }, data: { parseStatus: 'failed' } });
    expect(aiApiKeyResolver.resolve).not.toHaveBeenCalled();
    expect(blobStorage.downloadToBuffer).not.toHaveBeenCalled();
  });

  it('sets parseStatus=unavailable and makes no AI call when the organization has no AI key configured, keeping the résumé stored', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ candidateProfile: { findUnique, update }, aiCreditUsage: { create } }),
    );
    aiApiKeyResolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));

    const result = await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(result).toEqual({ ok: false, status: 'unavailable' });
    expect(update).toHaveBeenCalledWith({ where: { candidateId: 'cand-1' }, data: { parseStatus: 'unavailable' } });
    expect(blobStorage.downloadToBuffer).not.toHaveBeenCalled();
    expect(aiProvider.generateStructured).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('sets parseStatus=failed when pdf-parse throws, leaving the résumé downloadable', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ candidateProfile: { findUnique, update } }));
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    blobStorage.downloadToBuffer.mockResolvedValue(Buffer.from('not a real pdf'));
    (pdfParse as unknown as jest.Mock).mockRejectedValue(new Error('invalid PDF structure'));

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(update).toHaveBeenCalledWith({ where: { candidateId: 'cand-1' }, data: { parseStatus: 'failed' } });
    expect(aiProvider.generateStructured).not.toHaveBeenCalled();
  });

  it('sets parseStatus=failed when the AI call errors', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ candidateProfile: { findUnique, update }, aiCreditUsage: { create } }),
    );
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    blobStorage.downloadToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 fake bytes'));
    (pdfParse as unknown as jest.Mock).mockResolvedValue({ text: 'Some résumé text' });
    aiProvider.generateStructured.mockRejectedValue(new Error('rate limited'));

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(update).toHaveBeenCalledWith({ where: { candidateId: 'cand-1' }, data: { parseStatus: 'failed' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('sets parseStatus=failed when the AI response is malformed (missing summary)', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ candidateProfile: { findUnique, update } }));
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    blobStorage.downloadToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 fake bytes'));
    (pdfParse as unknown as jest.Mock).mockResolvedValue({ text: 'Some résumé text' });
    aiProvider.generateStructured.mockResolvedValue({ skills: ['SQL'] });

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(update).toHaveBeenCalledWith({ where: { candidateId: 'cand-1' }, data: { parseStatus: 'failed' } });
  });

  it('truncates extracted text to 40000 characters before sending it to the AI provider', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ candidateProfile: { findUnique, update }, aiCreditUsage: { create } }),
    );
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    blobStorage.downloadToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 fake bytes'));
    const longText = 'a'.repeat(50000);
    (pdfParse as unknown as jest.Mock).mockResolvedValue({ text: longText });
    aiProvider.generateStructured.mockResolvedValue({ summary: 's', skills: [], title: null, yearsExperience: null });

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    const request = aiProvider.generateStructured.mock.calls[0][0];
    expect(request.prompt.endsWith(longText.slice(0, 40000))).toBe(true);
    expect(request.prompt).not.toContain(longText.slice(0, 40001));
  });

  it('defaults skills to an empty array and title/yearsExperience to null when the AI omits them', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ candidateProfile: { findUnique, update }, aiCreditUsage: { create } }),
    );
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    blobStorage.downloadToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 fake bytes'));
    (pdfParse as unknown as jest.Mock).mockResolvedValue({ text: 'Some résumé text' });
    aiProvider.generateStructured.mockResolvedValue({ summary: 'A short summary.' });

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1');

    expect(update).toHaveBeenCalledWith({
      where: { candidateId: 'cand-1' },
      data: {
        parseStatus: 'done',
        parsedSummary: 'A short summary.',
        parsedSkills: JSON.stringify([]),
        parsedTitle: null,
        parsedYearsExperience: null,
        parsedAt: expect.any(Date),
      },
    });
  });

  it('does not call the AI provider when the AI-credit quota is exceeded', async () => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ candidateProfile: { findUnique, update: jest.fn() } }));
    aiApiKeyResolver.resolve.mockResolvedValue(aiProvider);
    quota.assertWithinLimit.mockRejectedValue(new QuotaExceededException('ai_credits', 50, 50));

    await processor.process({ candidateId: 'cand-1' }, context, 'job-1').catch(() => {});

    expect(blobStorage.downloadToBuffer).not.toHaveBeenCalled();
    expect(aiProvider.generateStructured).not.toHaveBeenCalled();
  });
});
