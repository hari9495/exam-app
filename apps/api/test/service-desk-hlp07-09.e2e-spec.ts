process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HLP-07 My cases, HLP-08 Cases (case team) and HLP-09 Ethics desk end to end against the real database (forced RLS, the
// app role). Positive and negative: only members see a case (HR, the manager, the System Admin, the respondent and another
// company get 404); the respondent's notice and reply window (company setting; POSH from IN.POSH.INQUIRY), a delayed
// notice with its reason, more time once; no outcome before the reply or its date; two-person approval (four eyes in the
// API and the database); the IC report with members' views, majority and the presiding officer's signature; interim
// relief gives HR a task; conflicts need an override reason; stepping aside; the reporter's limited view; routing to the
// chair; the anonymous reporter's "You have an update" email; files with fingerprints; bad input; append-only steps.
describe('HLP-07/08/09 cases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'manager' | 'divya' | 'resp' | 'eth1' | 'eth2' | 'ic1' | 'ic2' | 'ic3' | 'chair' | 'hrTask';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const call = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/desk${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const detail = async (who: Who, id: string) => (await call(who, 'get', `/cases/${id}`).expect(200)).body;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push(m), { success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `hlp0709-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP0709 Org ${k}`, slug: `hlp0709-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['manager', 'A', 'panel', []],
      ['divya', 'A', 'panel', []],
      ['resp', 'A', 'panel', []],
      ['eth1', 'A', 'panel', []],
      ['eth2', 'A', 'panel', []],
      ['ic1', 'A', 'panel', []],
      ['ic2', 'A', 'panel', []],
      ['ic3', 'A', 'panel', []],
      ['chair', 'A', 'panel', []],
      ['hrTask', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp0709-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp0709-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // The respondent reports to the manager (the conflict check reads the reporting line).
    await inA((tx) => tx.user.update({ where: { id: users.resp }, data: { managerId: users.manager } }));
    const add = (team: string, who: Who, role?: string) => call('adminA', 'post', '/speakup/setup/members').send({ team, userId: users[who], ...(role ? { role } : {}) }).expect(201);
    await add('ethics', 'eth1');
    await add('ethics', 'eth2');
    await add('ic', 'ic1', 'presiding');
    await add('ic', 'ic2');
    await add('ic', 'ic3');
    await add('escalation', 'chair');
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a named ethics concern: only the routed officers see it; HR, the manager, the System Admin, the respondent and another company get 404', async () => {
    ids.eth = (await call('divya', 'post', '/speakup/reports').send({ kind: 'whistleblower', category: 'Bribery or corruption', summary: 'A vendor paid for the purchase manager’s holiday in August.' }).expect(201)).body.id;
    expect((await call('eth1', 'get', '/cases').expect(200)).body).toEqual([expect.objectContaining({ id: ids.eth, ref: 'WB-0001', kind: 'whistleblower', raisedBy: `divya ${run}`, stage: 'Received', status: 'open' })]);
    for (const who of ['hr', 'manager', 'adminA', 'resp', 'adminB'] as Who[]) {
      await call(who, 'get', `/cases/${ids.eth}`).expect(404);
      expect((await call(who, 'get', '/cases').expect(200)).body).toEqual([]);
    }
    await call('eth1', 'get', '/cases/not-a-uuid').expect(400);
    const d = await detail('eth1', ids.eth);
    expect(d).toMatchObject({ reporter: `divya ${run}`, canDecide: { ok: true }, me: { canWork: true, canApprove: false, ic: false }, notice: { status: 'not-sent', replySource: 'Company setting: days to reply' } });
    expect(d.members.map((m: { name: string }) => m.name).sort()).toEqual([`eth1 ${run}`, `eth2 ${run}`]);
    expect(d.accessLog[0]).toMatchObject({ what: 'Opened the case' });
  });

  it('the first team message acknowledges; the reporter sees only status, dates and messages', async () => {
    await call('eth1', 'post', `/cases/${ids.eth}/messages`).send({ body: 'x' }).expect(400);
    await call('eth1', 'post', `/cases/${ids.eth}/messages`).send({ body: 'Thank you. We are looking into it.' }).expect(201);
    expect((await detail('eth1', ids.eth)).stage).toBe('Acknowledged');
    const mine = (await call('divya', 'get', '/my/cases').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ id: ids.eth, role: 'reporter', stage: 'Being looked into' })]);
    const one = (await call('divya', 'get', `/my/cases/${ids.eth}`).expect(200)).body;
    expect(one.messages).toEqual([expect.objectContaining({ from: 'team', who: null, text: 'Thank you. We are looking into it.' })]);
    expect(Object.keys(one).sort()).toEqual(['appealUntil', 'dates', 'datesSource', 'id', 'kind', 'messages', 'openedOn', 'outcome', 'ref', 'role', 'stage', 'status']);
    expect(JSON.stringify(one)).not.toContain(`eth1 ${run}`);
    await call('divya', 'post', `/my/cases/${ids.eth}/messages`).send({ body: 'I have the hotel bill too.' }).expect(201);
    await call('manager', 'get', `/my/cases/${ids.eth}`).expect(404);
  });

  it('notice: bad input refused; the respondent gets the notice and the reply date from the company setting', async () => {
    await call('eth1', 'post', `/cases/${ids.eth}/notice`).send({ allegations: 'short' }).expect(400);
    await call('eth1', 'post', `/cases/${ids.eth}/notice`).send({ allegations: 'You accepted a paid holiday from a vendor in August.' }).expect(400); // nobody chosen
    await call('eth1', 'post', `/cases/${ids.eth}/notice`).send({ respondentUserId: users.divya, allegations: 'You accepted a paid holiday from a vendor in August.' }).expect(400);
    await call('eth1', 'post', `/cases/${ids.eth}/notice`).send({ respondentUserId: users.resp, allegations: 'You accepted a paid holiday from a vendor in August.', fileIds: [randomUUID()] }).expect(400);
    expect((await call('resp', 'get', '/my/cases').expect(200)).body).toEqual([]);
    const r = (await call('eth1', 'post', `/cases/${ids.eth}/notice`).send({ respondentUserId: users.resp, allegations: 'You accepted a paid holiday from a vendor in August.' }).expect(201)).body;
    expect(r.replyBy).toBe(shift(7));
    await call('eth1', 'post', `/cases/${ids.eth}/notice/delay`).send({ reason: 'Too late now', reviewOn: shift(2) }).expect(409);
    expect((await call('resp', 'get', '/my/cases').expect(200)).body).toEqual([expect.objectContaining({ role: 'respondent', status: 'action', next: { label: 'Your reply due', on: shift(7) } })]);
    const mine = (await call('resp', 'get', `/my/cases/${ids.eth}`).expect(200)).body;
    expect(mine).toMatchObject({ role: 'respondent', messages: [], notice: { allegations: 'You accepted a paid holiday from a vendor in August.', replyBy: shift(7), replySource: 'Company setting: 7 days to reply' } });
    expect(JSON.stringify(mine)).not.toContain('I have the hotel bill too.');
    expect(JSON.stringify(mine)).not.toContain(`divya ${run}`);
    await call('resp', 'post', `/my/cases/${ids.eth}/messages`).send({ body: 'Hello there' }).expect(403);
  });

  it('no outcome before the reply; more time once; the reply is append-only', async () => {
    let v = (await detail('eth1', ids.eth)).version;
    expect((await call('eth1', 'post', `/cases/${ids.eth}/outcome`).send({ finding: 'proved', action: 'Written warning', reasons: 'The hotel bill shows the vendor paid it.', reporterSummary: 'We acted on it.', version: v }).expect(409)).body.code).toBe('CASE_TOO_EARLY');
    await call('resp', 'post', `/my/cases/${ids.eth}/more-time`).send({ reason: 'I am travelling until next week.' }).expect(201);
    await call('resp', 'post', `/my/cases/${ids.eth}/more-time`).send({ reason: 'Again please.' }).expect(409);
    await call('eth1', 'post', `/cases/${ids.eth}/more-time`).send({ grant: true, newDue: shift(3) }).expect(400);
    await call('eth1', 'post', `/cases/${ids.eth}/more-time`).send({ grant: true, newDue: shift(10) }).expect(201);
    expect((await call('resp', 'get', `/my/cases/${ids.eth}`).expect(200)).body.notice.moreTime).toMatchObject({ status: 'granted', newDue: shift(10) });
    const up = (await call('resp', 'post', `/my/cases/${ids.eth}/files`).attach('file', pdf, 'tickets.pdf').expect(201)).body;
    const other = (await call('divya', 'post', `/speakup/reports/${ids.eth}/files`).attach('file', pdf, 'bill.pdf').expect(201)).body;
    await call('resp', 'post', `/my/cases/${ids.eth}/reply`).send({ text: 'no' }).expect(400);
    await call('resp', 'post', `/my/cases/${ids.eth}/reply`).send({ text: 'It was a team outing.', fileIds: [other.id] }).expect(400);
    await call('resp', 'post', `/my/cases/${ids.eth}/reply`).send({ text: 'It was a team outing the vendor organised for all buyers.', fileIds: [up.id] }).expect(201);
    const d = await detail('eth1', ids.eth);
    expect(d.notice.replies).toEqual([expect.objectContaining({ text: 'It was a team outing the vendor organised for all buyers.', files: [expect.objectContaining({ name: 'tickets.pdf' })] })]);
    expect(d.canDecide.ok).toBe(true);
    const step = await inA((tx) => tx.speakupCaseStep.findFirstOrThrow({ where: { caseId: ids.eth, kind: 'replied' } }));
    await expect(inA((tx) => tx.speakupCaseStep.update({ where: { id: step.id }, data: { data: { text: 'changed' } } }))).rejects.toThrow(/permission denied/);
    await expect(inA((tx) => tx.speakupCaseStep.delete({ where: { id: step.id } }))).rejects.toThrow(/permission denied/);
    v = d.version;
    ids.v = String(v);
  });

  it('two people: one proposes, a second approves (never the proposer, also in the database); a stale version is 409', async () => {
    const v = Number(ids.v);
    await call('eth1', 'post', `/cases/${ids.eth}/outcome`).send({ finding: 'false-or-malicious', action: 'None', reasons: 'Not proved at all.', reporterSummary: 'Closed.', version: v }).expect(400);
    await call('eth1', 'post', `/cases/${ids.eth}/outcome`).send({ finding: 'proved-in-part', action: 'Written warning', reasons: 'The vendor paid for two buyers; gifts were not declared.', reporterSummary: 'We looked into your concern and took action.', version: v }).expect(201);
    expect((await detail('eth1', ids.eth)).outcome).toMatchObject({ status: 'proposed', proposedByMe: true });
    expect((await call('eth1', 'post', `/cases/${ids.eth}/outcome/approve`).send({ version: v + 1 }).expect(403)).body.code).toBe('CASE_FOUR_EYES');
    const d2 = await detail('eth2', ids.eth);
    expect(d2.me.canApprove).toBe(true);
    await call('eth2', 'post', `/cases/${ids.eth}/outcome/approve`).send({ version: v }).expect(409);
    const p = await inA((tx) => tx.speakupCaseStep.findFirstOrThrow({ where: { caseId: ids.eth, kind: 'proposed' } }));
    await expect(inA((tx) => tx.speakupCaseStep.create({ data: { organizationId: org.A.id, caseId: ids.eth, kind: 'approved', actorUserId: users.eth1, data: { proposalId: p.id, proposedBy: users.eth1 } } }))).rejects.toThrow(/four_eyes/);
    await call('eth2', 'post', `/cases/${ids.eth}/outcome/approve`).send({ version: d2.version }).expect(201);
    expect((await detail('eth1', ids.eth))).toMatchObject({ status: 'closed', stage: 'Closed', outcome: { status: 'approved', approvedBy: `eth2 ${run}` } });
    expect((await call('divya', 'get', `/my/cases/${ids.eth}`).expect(200)).body).toMatchObject({ status: 'closed', outcome: 'We looked into your concern and took action.' });
    await call('eth1', 'post', `/cases/${ids.eth}/messages`).send({ body: 'One more thing' }).expect(409);
  });

  it('POSH: the IC only; a delayed notice keeps its reason; reply days from IN.POSH.INQUIRY; relief gives HR a task', async () => {
    ids.posh = (await call('divya', 'post', '/speakup/reports').send({ kind: 'posh', summary: 'Remarks of a sexual nature in team meetings in October.', happenedOn: shift(-10) }).expect(201)).body.id;
    for (const who of ['eth1', 'hr', 'adminA'] as Who[]) await call(who, 'get', `/cases/${ids.posh}`).expect(404);
    let d = await detail('ic2', ids.posh);
    expect(d).toMatchObject({ kind: 'posh', me: { ic: true, presiding: false }, canDecide: { ok: false }, outcome: null, icReport: { status: 'none' } });
    expect((await call('ic2', 'post', `/cases/${ids.posh}/ic-report`).send({ finding: 'proved', findings: 'The remarks are proved by two witnesses.', recommendation: 'Written warning', version: d.version }).expect(409)).body.code).toBe('CASE_TOO_EARLY');
    await call('ic1', 'post', `/cases/${ids.posh}/notice/delay`).send({ reason: 'ok', reviewOn: shift(3) }).expect(400);
    await call('ic1', 'post', `/cases/${ids.posh}/notice/delay`).send({ reason: 'The complainant asked for a week to move teams first.', reviewOn: shift(-1) }).expect(400);
    await call('ic1', 'post', `/cases/${ids.posh}/notice/delay`).send({ reason: 'The complainant asked for a week to move teams first.', reviewOn: shift(5) }).expect(201);
    d = await detail('ic1', ids.posh);
    expect(d.notice).toMatchObject({ status: 'delayed', delay: { reason: 'The complainant asked for a week to move teams first.', reviewOn: shift(5), by: `ic1 ${run}` } });
    await call('ic1', 'post', `/cases/${ids.posh}/relief`).send({ action: 'promotion', note: 'x', assigneeUserId: users.hrTask }).expect(400);
    const relief = (await call('ic1', 'post', `/cases/${ids.posh}/relief`).send({ action: 'reporting', note: 'The complainant stops reporting to the respondent, as she asked in writing.', assigneeUserId: users.hrTask }).expect(201)).body;
    expect(relief.taskRef).toBe('POSH-0001-R1');
    const task = await inA((tx) => tx.userNotification.findFirst({ where: { recipientUserId: users.hrTask, type: 'helpdesk.case.task' } }));
    expect(task).not.toBeNull();
    expect((await call('hrTask', 'get', `/cases/${ids.posh}`).expect(404)).body).toBeDefined();
    d = await detail('ic1', ids.posh);
    expect(d.relief).toEqual([expect.objectContaining({ action: 'reporting', task: { ref: 'POSH-0001-R1', status: 'open', assignee: `hrTask ${run}` } })]);
    await call('ic1', 'post', `/cases/${ids.posh}/relief/${d.relief[0].id}/done`).expect(201);
    await call('ic1', 'post', `/cases/${ids.posh}/relief/${d.relief[0].id}/done`).expect(409);
    const r = (await call('ic1', 'post', `/cases/${ids.posh}/notice`).send({ respondentUserId: users.resp, allegations: 'Remarks of a sexual nature in team meetings in October.' }).expect(201)).body;
    expect(r.replyBy).toBe(shift(10));
    expect((await detail('ic1', ids.posh)).notice.replySource).toMatch(/IN\.POSH\.INQUIRY 2013-v1 \(verify\): 10 days/);
    await call('ic1', 'post', `/cases/${ids.posh}/members`).send({ personId: users.eth1, role: 'officer' }).expect(400);
  });

  it('POSH report: members record views; only the presiding officer signs, and only with a majority', async () => {
    await call('resp', 'post', `/my/cases/${ids.posh}/reply`).send({ text: 'I deny making these remarks.' }).expect(201);
    let d = await detail('ic2', ids.posh);
    await call('ic2', 'post', `/cases/${ids.posh}/outcome`).send({ finding: 'proved', action: 'x', reasons: 'xxxxxxxxxxxxxxxxxxxxxxx', reporterSummary: 'x x', version: d.version }).expect(400);
    await call('ic2', 'post', `/cases/${ids.posh}/ic-report/vote`).send({ vote: 'agree' }).expect(409);
    await call('ic2', 'post', `/cases/${ids.posh}/ic-report`).send({ finding: 'proved-in-part', findings: 'Two of the three remarks are proved by witnesses.', recommendation: 'Written warning; no contact.', version: d.version }).expect(201);
    await call('ic1', 'post', `/cases/${ids.posh}/ic-report/vote`).send({ vote: 'agree' }).expect(201);
    await call('ic1', 'post', `/cases/${ids.posh}/ic-report/vote`).send({ vote: 'agree' }).expect(409);
    await call('ic3', 'post', `/cases/${ids.posh}/ic-report/vote`).send({ vote: 'disagree' }).expect(400);
    await call('ic3', 'post', `/cases/${ids.posh}/ic-report/vote`).send({ vote: 'disagree', note: 'The third remark is proved too.' }).expect(201);
    d = await detail('ic1', ids.posh);
    expect((await call('ic1', 'post', `/cases/${ids.posh}/ic-report/sign`).send({ version: d.version }).expect(409)).body).toMatchObject({ code: 'CASE_NO_MAJORITY', message: expect.stringContaining('1 of 3') });
    await call('ic2', 'post', `/cases/${ids.posh}/ic-report/vote`).send({ vote: 'agree' }).expect(201);
    d = await detail('ic1', ids.posh);
    expect(d.icReport.votes.filter((x: { vote: string }) => x.vote === 'agree')).toHaveLength(2);
    expect((await call('ic2', 'post', `/cases/${ids.posh}/ic-report/sign`).send({ version: d.version }).expect(403)).body.code).toBe('CASE_NOT_PRESIDING');
    await call('ic1', 'post', `/cases/${ids.posh}/ic-report/sign`).send({ version: d.version }).expect(201);
    d = await detail('ic1', ids.posh);
    expect(d).toMatchObject({ status: 'closed', stage: 'Employer action', icReport: { status: 'signed', signedBy: `ic1 ${run}` } });
    expect(d.dates.find((x: { key: string }) => x.key === 'action').due).toBe(shift(60));
    const mine = (await call('divya', 'get', `/my/cases/${ids.posh}`).expect(200)).body;
    expect(mine).toMatchObject({ outcome: 'The Internal Committee finished its inquiry and sent its report to the employer.', appealUntil: shift(90) });
    expect(JSON.stringify(mine)).not.toContain('Two of the three remarks');
    expect(JSON.stringify(mine)).not.toContain('I deny making these remarks.');
  });

  it('members: a conflict needs a recorded override; stepping aside ends access', async () => {
    ids.g = (await call('divya', 'post', '/speakup/reports').send({ kind: 'grievance', category: 'A manager', summary: 'My shift was changed without notice four times this month.' }).expect(201)).body.id;
    const d = await detail('eth1', ids.g);
    await call('eth1', 'post', `/cases/${ids.g}/notice`).send({ respondentUserId: users.resp, allegations: 'Changing the shift without notice four times this month.' }).expect(201);
    const c = (await call('eth1', 'post', `/cases/${ids.g}/members`).send({ personId: users.manager, role: 'investigator' }).expect(409)).body;
    expect(c).toMatchObject({ code: 'CASE_CONFLICT', message: expect.stringContaining('reporting line') });
    await call('eth1', 'post', `/cases/${ids.g}/members`).send({ personId: users.manager, role: 'boss' }).expect(400);
    await call('eth1', 'post', `/cases/${ids.g}/members`).send({ personId: users.manager, role: 'investigator', overrideReason: 'The only person who knows the shift rota.' }).expect(201);
    expect((await detail('manager', ids.g)).members.find((m: { id: string }) => m.id === users.manager)).toMatchObject({ role: 'Investigator' });
    const step = await inA((tx) => tx.speakupCaseStep.findFirstOrThrow({ where: { caseId: ids.g, kind: 'member_added' } }));
    expect(step.data).toMatchObject({ overrideReason: 'The only person who knows the shift rota.' });
    await call('manager', 'post', `/cases/${ids.g}/recuse`).send({ reason: 'no' }).expect(400);
    await call('manager', 'post', `/cases/${ids.g}/recuse`).send({ reason: 'The respondent reports to me.' }).expect(201);
    await call('manager', 'get', `/cases/${ids.g}`).expect(404);
    expect((await detail('eth1', ids.g)).members.find((m: { id: string }) => m.id === users.manager).recused).toMatchObject({ reason: 'The respondent reports to me.' });
    expect(d.version).toBeGreaterThan(0);
  });

  it('evidence: files keep their fingerprint; opens are logged; only members open them', async () => {
    const f = (await call('eth1', 'post', `/cases/${ids.g}/files`).attach('file', pdf, 'rota.pdf').expect(201)).body;
    await call('eth1', 'post', `/cases/${ids.g}/files`).attach('file', Buffer.from('MZ'), 'rota.pdf').expect(400);
    const d = await detail('eth1', ids.g);
    expect(d.files).toEqual([expect.objectContaining({ id: f.id, name: 'rota.pdf', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })]);
    await call('hr', 'get', `/cases/${ids.g}/files/${f.id}`).expect(404);
    await call('eth1', 'get', `/cases/${ids.g}/files/${randomUUID()}`).expect(404);
  });

  it('ethics desk: an anonymous report with an alert address; route to the chair once, with a reason; the reporter hears only "You have an update"', async () => {
    const filed = (await request(server()).post('/api/v1/desk/speakup/public/reports').send({ org: org.A.slug, kind: 'whistleblower', summary: 'Invoices approved for goods that never arrived.', alertEmail: 'tip@example.test' }).expect(201)).body;
    ids.anon = filed.id;
    await request(server()).post('/api/v1/desk/speakup/public/reports').send({ org: org.A.slug, kind: 'whistleblower', summary: 'Invoices approved for goods that never arrived.', alertEmail: 'not-an-email' }).expect(400);
    const row = await inA((tx) => tx.speakupCase.findFirstOrThrow({ where: { id: ids.anon } }));
    expect(row.alertContactEnc).toBeTruthy();
    expect(row.alertContactEnc).not.toContain('tip@example.test');
    const q = (await call('eth1', 'get', '/ethics/reports').expect(200)).body;
    expect(q).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.anon, anonymous: true, routed: false, aboutOfficer: false, clock: { label: 'Acknowledge by', on: expect.any(String) } })]));
    expect((await call('hr', 'get', '/ethics/reports').expect(200)).body).toEqual([]);
    sent.length = 0;
    await call('eth1', 'post', `/cases/${ids.anon}/messages`).send({ body: 'Can you name the warehouse?' }).expect(201);
    expect(sent).toEqual([expect.objectContaining({ to: 'tip@example.test', subject: 'You have an update' })]);
    expect(JSON.stringify(sent)).not.toContain('warehouse');
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/route`).send({ reason: '' }).expect(400);
    await call('chair', 'get', `/cases/${ids.anon}`).expect(404);
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/route`).send({ reason: 'Payments above ₹10 lakh approved by a senior manager.' }).expect(200);
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/route`).send({ reason: 'Again' }).expect(409);
    expect((await detail('chair', ids.anon)).members.find((m: { id: string }) => m.id === users.chair)).toMatchObject({ role: 'Audit committee chair' });
    expect((await call('eth1', 'get', '/ethics/reports').expect(200)).body.find((r: { id: string }) => r.id === ids.anon).routed).toBe(true);
  });

  it('severity (answer 35): Standard by default; only an ethics officer on the report changes it; each change is a step with old and new', async () => {
    expect((await call('eth1', 'get', '/ethics/reports').expect(200)).body.find((r: { id: string }) => r.id === ids.anon).severity).toBe('standard');
    expect((await detail('eth1', ids.anon))).toMatchObject({ severity: 'standard', me: { canSetSeverity: true } });
    expect((await detail('chair', ids.anon)).me.canSetSeverity).toBe(false);
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/severity`).send({ severity: 'urgent' }).expect(400);
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/severity`).send({}).expect(400);
    expect((await call('chair', 'post', `/ethics/reports/${ids.anon}/severity`).send({ severity: 'serious' }).expect(403)).body.code).toBe('CASE_NOT_ETHICS_OFFICER');
    for (const who of ['hr', 'adminA', 'adminB', 'divya'] as Who[]) await call(who, 'post', `/ethics/reports/${ids.anon}/severity`).send({ severity: 'serious' }).expect(404);
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/severity`).send({ severity: 'standard' }).expect(409);
    await call('eth1', 'post', `/ethics/reports/${ids.anon}/severity`).send({ severity: 'serious' }).expect(200);
    expect((await call('eth2', 'get', '/ethics/reports').expect(200)).body.find((r: { id: string }) => r.id === ids.anon).severity).toBe('serious');
    const st = await inA((tx) => tx.speakupCaseStep.findFirstOrThrow({ where: { caseId: ids.anon, kind: 'severity_set' } }));
    expect(st).toMatchObject({ actorUserId: users.eth1, data: { from: 'standard', to: 'serious' } });
    const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { entityId: ids.anon, action: 'cases.severity_set' } }));
    expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ from: 'standard', to: 'serious' });
    await expect(inA((tx) => tx.speakupCaseStep.create({ data: { organizationId: org.A.id, caseId: ids.anon, kind: 'severity_set', actorUserId: users.eth1, data: { from: 'serious', to: 'serious' } } }))).rejects.toThrow(/severity_check/);
    await expect(inA((tx) => tx.speakupCaseStep.update({ where: { id: st.id }, data: { data: { from: 'standard', to: 'standard' } } }))).rejects.toThrow(/permission denied/);
    await call('eth1', 'post', `/ethics/reports/${ids.g}/severity`).send({ severity: 'serious' }).expect(400);
    await call('eth1', 'post', `/ethics/reports/${ids.eth}/severity`).send({ severity: 'serious' }).expect(409);
    // A report filed by someone who fears retaliation starts Serious.
    const worried = (await call('divya', 'post', '/speakup/reports').send({ kind: 'whistleblower', summary: 'Cash taken from the canteen till every Friday.', retaliationWorry: true }).expect(201)).body.id;
    expect((await call('eth1', 'get', '/ethics/reports').expect(200)).body.find((r: { id: string }) => r.id === worried).severity).toBe('serious');
  });

  it('menu flags (answer 36): Cases for a speak-up list or a case member, the Ethics desk for the ethics or escalation list', async () => {
    const counts = async (who: Who) => (await request(server()).get('/api/v1/workspace/counts').set('Authorization', `Bearer ${token[who]}`).expect(200)).body;
    expect(await counts('eth1')).toMatchObject({ casesOpen: expect.any(Number), ethicsReports: expect.any(Number) });
    expect((await counts('eth1')).ethicsReports).toBeGreaterThanOrEqual(2);
    expect(await counts('chair')).toMatchObject({ casesOpen: expect.any(Number), ethicsReports: expect.any(Number) });
    const ic = await counts('ic2');
    expect(ic.casesOpen).toEqual(expect.any(Number));
    expect(ic.ethicsReports).toBeUndefined();
    for (const who of ['divya', 'resp', 'manager'] as Who[]) {
      const c = await counts(who);
      expect([who, c.casesOpen, c.ethicsReports]).toEqual([who, undefined, undefined]);
    }
    // HR who may open disciplinary cases (answer 34: the HR Admin template, the System Admin) see Cases, not the Ethics desk.
    for (const who of ['hr', 'adminA', 'adminB'] as Who[]) {
      const c = await counts(who);
      expect([who, c.casesOpen, c.ethicsReports]).toEqual([who, 0, undefined]);
    }
  });

  it('another company never sees these cases', async () => {
    for (const id of [ids.eth, ids.posh, ids.g, ids.anon]) await call('adminB', 'get', `/cases/${id}`).expect(404);
    expect((await call('adminB', 'get', '/my/cases').expect(200)).body).toEqual([]);
    expect((await call('adminB', 'get', '/ethics/reports').expect(200)).body).toEqual([]);
  });
});
