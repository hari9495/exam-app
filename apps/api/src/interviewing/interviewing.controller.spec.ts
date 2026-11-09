import { ForbiddenException } from '@nestjs/common';
import { InterviewingController } from './interviewing.controller';

// Answer 345: scorecard templates are company settings, never changed while acting for someone else (the e2e's
// impersonation token is already refused by the key check, so the controller's own check is proved here).
describe('InterviewingController scorecard templates while acting', () => {
  const templates = { save: jest.fn(), archive: jest.fn() };
  const c = new InterviewingController({} as never, templates as never, {} as never);
  const ctx = { organizationId: 'o1', isSuperAdmin: false };
  const body = { name: 'x', scaleMax: 4, passBar: 2, items: [{ label: 'a', weight: 100 }] };
  const id = '00000000-0000-4000-8000-000000000001';

  it.each([{ impersonatorUserId: 'u9' }, { actingSuperAdmin: true }])('refuses create, update and archive (%o)', (u) => {
    const req = { user: { userId: 'u1', ...u } } as never;
    expect(() => c.createTemplate(req, ctx, body)).toThrow(ForbiddenException);
    expect(() => c.updateTemplate(req, ctx, id, body)).toThrow(/acting for someone else/);
    expect(() => c.archiveTemplate(req, ctx, id)).toThrow(/Scorecard templates cannot be changed/);
    expect(templates.save).not.toHaveBeenCalled();
    expect(templates.archive).not.toHaveBeenCalled();
  });

  it('the person themselves goes through', () => {
    const req = { user: { userId: 'u1' } } as never;
    c.createTemplate(req, ctx, body);
    c.archiveTemplate(req, ctx, id);
    expect(templates.save).toHaveBeenCalledWith(ctx, null, body);
    expect(templates.archive).toHaveBeenCalledWith(ctx, id);
  });
});
