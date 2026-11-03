import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { SpeakupService } from '../speakup/speakup.service';
import { caseNumber } from '../speakup/speakup-rules';
import type { SpeakupKind } from '../speakup/dto';
import { addDays, canDecide, conflictWith, fold, isoDay, majority, severityOf, type Folded, type Severity, type Step } from './case-rules';
import type { AddMemberDto, DelayDto, IcReportDto, MoreTimeDecisionDto, NoticeDto, ProposeDto, ReliefDto, ReplyDto, SendBackDto, VoteDto } from './dto';

// HLP-07 My cases, HLP-08 Cases (case team), HLP-09 Ethics desk on the HLP-06 case record (rules:
// docs/yukthix/helpdesk-design-map.md section 4f). Access is membership, not a key: a case shows only to its members who
// have not stepped aside (404 for everyone else, HR, managers and admins included, APX-D §6.3); "My cases" shows a
// reporter or respondent only their own part. Every step is an append-only row; every look and file open is audited.
// Legal days come from the rule sets IN.POSH, IN.POSH.INQUIRY and IN.GRC; company days from the settings registry.

type Case = Prisma.SpeakupCaseGetPayload<object>;
const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
const NOBODY = '00000000-0000-0000-0000-000000000000';
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dayOf = (s: string) => new Date(`${s}T00:00:00Z`);
const TEAM_ROLE: Record<string, string> = { grievance: 'Grievance committee', ethics: 'Ethics officer', ic: 'IC member', escalation: 'Escalation (audit committee)' };
const ADDED_ROLE: Record<string, string> = { officer: 'Case officer', investigator: 'Investigator', chair: 'Audit committee chair' };
const KIND: Record<string, 'grievance' | 'whistleblower' | 'posh'> = { grievance: 'grievance', whistleblower: 'whistleblower', posh: 'posh' };
const STAGES = { posh: ['Filed', 'Notice to respondent', 'Inquiry and hearings', 'IC report', 'Employer action'], other: ['Received', 'Acknowledged', 'Notice and reply', 'Outcome proposed', 'Closed'] };
const POSH_DONE = 'The Internal Committee finished its inquiry and sent its report to the employer.';
const changed = () => new ConflictException({ statusCode: 409, code: 'CASE_CHANGED', message: 'Someone changed this case meanwhile. Reload it and try again.' });

interface Loaded {
  row: Case;
  steps: Step[];
  f: Folded;
  /** Members who have not stepped aside, with their role words. */
  members: Map<string, string>;
  allMembers: string[];
}

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly speakup: SpeakupService,
  ) {}

  private tx<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    const c = companyContext(ctx);
    return this.tenantPrisma.forTenant(c, (tx) => fn(tx, c));
  }

  private async ruleSet(tx: Tx, statute: string, today: string) {
    const rs = await tx.statutoryRuleSet.findFirst({ where: { statute, jurisdiction: 'IN', status: 'published', validFrom: { lte: dayOf(today) }, OR: [{ validTo: null }, { validTo: { gte: dayOf(today) } }] }, orderBy: { validFrom: 'desc' } });
    return rs ? { values: rs.values as Record<string, number>, label: `${statute} ${rs.version}${rs.verify ? ' (verify)' : ''}` } : null;
  }

  private async load(tx: Tx, org: string, row: Case): Promise<Loaded> {
    const steps = (await tx.speakupCaseStep.findMany({ where: { organizationId: org, caseId: row.id }, orderBy: { at: 'asc' } })).map((s) => ({ ...s, data: (s.data ?? {}) as Record<string, unknown> }));
    const f = fold(steps);
    const rows = await tx.speakupCaseMember.findMany({ where: { organizationId: org, caseId: row.id }, orderBy: { addedAt: 'asc' } });
    const members = new Map<string, string>();
    for (const m of rows) if (!f.recused.has(m.userId)) members.set(m.userId, f.added.has(m.userId) ? (ADDED_ROLE[f.added.get(m.userId)!.role] ?? 'Case officer') : (TEAM_ROLE[row.routedTo] ?? 'Case officer'));
    return { row, steps, f, members, allMembers: rows.map((m) => m.userId) };
  }

  /** A case for one of its members (not stepped aside); anyone else gets "Not found". */
  private async memberCase(tx: Tx, c: CompanyContext, id: string): Promise<Loaded> {
    const row = await tx.speakupCase.findFirst({ where: { organizationId: c.organizationId, id } });
    const l = row ? await this.load(tx, c.organizationId, row) : null;
    if (!l || !c.userId || !l.members.has(c.userId)) throw new NotFoundException('Not found.');
    return l;
  }

  private async step(tx: Tx, c: CompanyContext, row: Case, kind: string, data: Record<string, unknown>, expectVersion?: number, caseData: Prisma.SpeakupCaseUpdateManyMutationInput = {}) {
    const n = await tx.speakupCase.updateMany({ where: { id: row.id, organizationId: c.organizationId, ...(expectVersion ? { version: expectVersion } : {}) }, data: { ...caseData, version: { increment: 1 } } });
    if (!n.count) throw changed();
    const st = await tx.speakupCaseStep.create({ data: { organizationId: c.organizationId, caseId: row.id, kind, actorUserId: c.userId!, data: data as Prisma.InputJsonValue } });
    await audit(tx, c, `cases.${kind}`, 'speakup_case', row.id, { stepId: st.id, ...Object.fromEntries(Object.entries(data).filter(([k]) => !['text', 'allegations', 'reasons', 'findings', 'recommendation', 'note', 'reporterSummary'].includes(k))) });
    return st;
  }

  private open(l: Loaded) {
    if (l.f.outcome.status === 'approved' || l.f.ic.status === 'signed' || l.row.status === 'closed') throw new ConflictException('This case is closed.');
  }

  private names(tx: Tx, org: string, ids: (string | null | undefined)[]) {
    const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    return want.length ? tx.user.findMany({ where: { organizationId: org, id: { in: want } }, select: { id: true, name: true, email: true } }).then((us) => new Map(us.map((u) => [u.id, u.name ?? u.email]))) : Promise.resolve(new Map<string, string>());
  }

  private notify(org: string, to: string[], type: 'helpdesk.case.update' | 'helpdesk.case.task', entityId: string, text: string, link: string) {
    return this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'speakup_case', entityId, contextText: text, linkPath: link }, { subject: text, html: `<p>${text.replace(/[<>&"]/g, '')} Open YukthiX to see it.</p>` })
      .catch((e: Error) => this.logger.warn(`case notice: ${e.message}`));
  }

  private ref = (row: Case) => caseNumber(row.kind as SpeakupKind, row.number);

  private stage(row: Case, f: Folded) {
    const posh = row.kind === 'posh';
    const stages = posh ? STAGES.posh : STAGES.other;
    const i = posh
      ? f.ic.status === 'signed' ? 4 : f.ic.status === 'draft' ? 3 : f.notice.status === 'sent' ? 2 : f.notice.status === 'delayed' || f.acknowledgedOn ? 1 : 0
      : f.outcome.status === 'approved' ? 4 : f.outcome.status === 'proposed' ? 3 : f.notice.status !== 'not-sent' ? 2 : f.acknowledgedOn || row.status !== 'received' ? 1 : 0;
    return { stages, index: i, stage: stages[i]! };
  }

  /** The dated steps the case team sees, each from the rule set or company setting it came from. */
  private async dates(tx: Tx, l: Loaded, today: string) {
    const { row, f } = l;
    const posh = row.kind === 'posh' ? await this.ruleSet(tx, 'IN.POSH', today) : null;
    const inq = row.kind === 'posh' ? await this.ruleSet(tx, 'IN.POSH.INQUIRY', today) : null;
    const filed = isoDay(row.filedAt)!;
    const out: { key: string; label: string; due: string | null; doneOn: string | null; note?: string | null }[] = [
      { key: 'ack', label: 'Acknowledge to the reporter', due: iso(row.ackDueOn), doneOn: f.acknowledgedOn },
    ];
    if (row.kind === 'posh' && inq) out.push({ key: 'notice', label: 'Notice to respondent', due: addDays(filed, inq.values.noticeDays), doneOn: f.notice.sentOn, note: f.notice.status === 'delayed' ? `Notice delayed: ${f.notice.delay?.reason}` : null });
    out.push({ key: 'reply', label: 'Respondent reply', due: f.notice.replyBy, doneOn: f.notice.replies[0] ? f.notice.replies[0].at.slice(0, 10) : null, note: f.notice.status === 'delayed' ? `Notice delayed: ${f.notice.delay?.reason}` : 'Starts with the notice' });
    if (row.kind === 'grievance') out.push({ key: 'decide', label: 'Decision by the committee', due: iso(row.decideDueOn), doneOn: f.outcome.approvedAt });
    if (row.kind === 'whistleblower') out.push({ key: 'decide', label: 'Outcome', due: null, doneOn: f.outcome.approvedAt, note: 'No legal date: the company vigil policy' });
    if (row.kind === 'posh') {
      out.push({ key: 'inquiry', label: 'Inquiry complete (IC report signed)', due: iso(row.decideDueOn), doneOn: f.ic.signedOn });
      out.push({ key: 'action', label: 'Employer acts on the report', due: f.ic.signedOn && posh ? addDays(f.ic.signedOn, posh.values.actionDays) : null, doneOn: null, note: 'Starts when the report is signed' });
    }
    const source = [row.ruleSet, inq?.label].filter(Boolean).join(' · ') || 'Company speak-up settings';
    return { dates: out, source, posh, inq };
  }

  private async fileRows(tx: Tx, org: string, ids: string[]) {
    return ids.length ? tx.file.findMany({ where: { organizationId: org, id: { in: [...new Set(ids)] } } }) : [];
  }

  // ------------------------------------------------------------------------------------------ HLP-08 case team

  async list(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const today = todayIst();
      const mine = await tx.speakupCaseMember.findMany({ where: { organizationId: c.organizationId, userId: c.userId ?? NOBODY }, select: { caseId: true } });
      const rows = await tx.speakupCase.findMany({ where: { organizationId: c.organizationId, id: { in: mine.map((m) => m.caseId) } }, orderBy: { filedAt: 'desc' }, take: 500 });
      const loaded = (await Promise.all(rows.map((r) => this.load(tx, c.organizationId, r)))).filter((l) => l.members.has(c.userId!));
      const names = await this.names(tx, c.organizationId, loaded.flatMap((l) => [l.row.reporterUserId, l.allMembers[0]]));
      const locs = await tx.location.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true } });
      return loaded.map(({ row, f, allMembers }) => {
        const next = this.nextFor(row, f);
        return {
          id: row.id,
          ref: this.ref(row),
          kind: KIND[row.kind]!,
          subject: this.subject(row),
          location: locs.find((x) => x.id === row.locationId)?.name ?? '—',
          stage: this.stage(row, f).stage,
          raisedBy: row.identity === 'anonymous' ? null : (names.get(row.reporterUserId!) ?? null),
          anonymous: row.identity === 'anonymous',
          owner: names.get(allMembers[0]!) ?? '—',
          next,
          overdue: Boolean(next?.on && next.on < today && row.status !== 'closed'),
          status: row.status === 'closed' ? 'closed' : f.outcome.status === 'proposed' ? 'action' : 'open',
        };
      });
    });
  }

  private subject(row: Case) {
    const s = row.summary.replace(/\s+/g, ' ').trim();
    return (row.category ? `${row.category}: ` : '') + (s.length > 70 ? `${s.slice(0, 69)}…` : s);
  }

  private nextFor(row: Case, f: Folded): { label: string; on: string | null } | null {
    if (row.status === 'closed') return null;
    if (!f.acknowledgedOn && row.status === 'received') return { label: 'Acknowledge', on: iso(row.ackDueOn) };
    if (f.notice.status === 'sent' && !f.notice.replies.length) return { label: 'Reply due', on: f.notice.replyBy };
    if (f.outcome.status === 'proposed') return { label: 'Second officer approves', on: null };
    return { label: row.kind === 'posh' ? 'Inquiry complete' : 'Decision', on: iso(row.decideDueOn) };
  }

  async detail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      const { row, f, members } = l;
      const today = todayIst();
      const me = c.userId!;
      const { dates, source } = await this.dates(tx, l, today);
      const ic = await tx.speakupTeamMember.findMany({ where: { organizationId: c.organizationId, team: 'ic', removedAt: null }, select: { userId: true, role: true } });
      const presidingId = ic.find((m) => m.role === 'presiding')?.userId ?? null;
      const externals = new Set((await tx.speakupTeamMember.findMany({ where: { organizationId: c.organizationId, role: 'external', removedAt: null }, select: { userId: true } })).map((m) => m.userId));
      const msgs = await tx.speakupMessage.findMany({ where: { organizationId: c.organizationId, caseId: row.id }, orderBy: { sentAt: 'asc' } });
      const evidence = [
        ...row.fileIds.map((fid) => ({ fileId: fid, by: row.identity === 'anonymous' ? null : row.reporterUserId, reporter: true })),
        ...f.fileIds.map((x) => ({ fileId: x.fileId, by: x.by, reporter: false })),
        ...f.notice.replies.flatMap((r) => r.fileIds.map((fid) => ({ fileId: fid, by: f.notice.respondentUserId, reporter: false }))),
      ];
      const fileRows = await this.fileRows(tx, c.organizationId, evidence.map((e) => e.fileId));
      await audit(tx, c, 'cases.case_viewed', 'speakup_case', row.id, { identityShown: Boolean(row.reporterUserId) });
      const logs = await tx.auditLog.findMany({ where: { organizationId: c.organizationId, entityType: 'speakup_case', entityId: row.id, action: { in: ['speakup.case_viewed', 'cases.case_viewed', 'cases.file_opened'] } }, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, action: true, actorName: true, createdAt: true, metadataJson: true } });
      const opens = new Map<string, number>();
      for (const a of logs) if (a.action === 'cases.file_opened') {
        const fid = (JSON.parse(a.metadataJson ?? '{}') as { fileId?: string }).fileId;
        if (fid) opens.set(fid, (opens.get(fid) ?? 0) + 1);
      }
      const allIds = [...l.allMembers, row.reporterUserId, row.respondentUserId, f.notice.respondentUserId, f.outcome.proposedBy, f.outcome.approvedBy, f.ic.signedBy, f.notice.delay?.by, ...f.relief.flatMap((r) => [r.by, r.assigneeUserId]), ...evidence.map((e) => e.by), ...msgs.map((m) => m.authorUserId), ...l.steps.map((s) => s.actorUserId)];
      const names = await this.names(tx, c.organizationId, allIds);
      const nm = (uid: string | null | undefined) => (uid ? (names.get(uid) ?? 'Former user') : '—');
      const people = await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 1000 });
      const posh = row.kind === 'posh';
      const voters = posh ? [...members.keys()] : [];
      const decide = canDecide(row.kind, f, today);
      const st = this.stage(row, f);
      const closed = row.status === 'closed';
      return {
        id: row.id,
        ref: this.ref(row),
        kind: KIND[row.kind]!,
        subject: this.subject(row),
        location: (row.locationId && (await tx.location.findFirst({ where: { organizationId: c.organizationId, id: row.locationId }, select: { name: true } }))?.name) || '—',
        openedOn: isoDay(row.filedAt)!,
        stage: st.stage,
        stages: st.stages,
        stageIndex: st.index,
        status: closed ? 'closed' : f.outcome.status === 'proposed' ? 'action' : 'open',
        version: row.version,
        owner: nm(l.allMembers[0]),
        reporter: row.reporterUserId ? nm(row.reporterUserId) : null,
        anonymous: row.identity === 'anonymous',
        respondent: row.respondentUserId ? nm(row.respondentUserId) : null,
        report: { summary: row.summary, category: row.category, happenedOn: iso(row.happenedOn), involved: row.involved, witnesses: row.witnesses, outside: row.outsideName ? `${row.outsideName}${row.outsideEmployer ? ` (${row.outsideEmployer})` : ''}` : null, retaliationWorry: row.retaliationWorry, late: row.late },
        dates,
        datesSource: source,
        severity: row.kind === 'whistleblower' ? severityOf(f, row.retaliationWorry) : null,
        me: { memberId: me, canWork: !closed, canApprove: !posh && !closed && f.outcome.status === 'proposed' && f.outcome.proposedBy !== me, ic: posh, presiding: posh && presidingId === me, recused: false, canSetSeverity: row.kind === 'whistleblower' && !closed && (await this.ethicsOfficer(tx, c)) },
        canDecide: decide,
        members: l.allMembers.map((uid) => ({
          id: uid,
          name: nm(uid),
          role: members.get(uid) ?? (f.added.has(uid) ? (ADDED_ROLE[f.added.get(uid)!.role] ?? 'Case officer') : (TEAM_ROLE[row.routedTo] ?? 'Case officer')),
          access: f.recused.has(uid) ? 'none' : 'full',
          presiding: posh && uid === presidingId,
          external: externals.has(uid),
          recused: f.recused.get(uid) ?? null,
        })),
        people: people.filter((p) => !l.allMembers.includes(p.id)).map((p) => ({ id: p.id, name: p.name ?? p.email, email: p.email })),
        timeline: l.steps.filter((s) => s.kind !== 'ic_vote').map((s) => ({ id: s.id, at: s.at.toISOString(), who: nm(s.actorUserId), text: STEP_WORDS[s.kind] ?? s.kind })).concat({ id: 'filed', at: row.filedAt.toISOString(), who: row.identity === 'anonymous' ? 'Anonymous reporter' : nm(row.reporterUserId), text: `Filed the report; routed to the ${TEAM_ROLE[row.routedTo]?.toLowerCase() ?? 'case team'}` }).sort((a, b) => a.at.localeCompare(b.at)),
        files: evidence.flatMap((e) => {
          const r = fileRows.find((x) => x.id === e.fileId);
          return r ? [{ id: r.id, name: r.fileName, size: r.size, type: r.mime, scan: r.scanStatus === 'clean' ? 'clean' : r.scanStatus === 'infected' ? 'infected' : 'pending', addedBy: e.reporter && !e.by ? 'Anonymous reporter' : nm(e.by), addedAt: r.createdAt.toISOString(), sha256: r.sha256, opens: opens.get(r.id) ?? 0 }] : [];
        }),
        accessLog: logs.slice(0, 20).map((a) => ({ id: a.id, at: a.createdAt.toISOString(), who: a.actorName ?? 'Someone', what: a.action === 'cases.file_opened' ? `Opened ${fileRows.find((x) => x.id === (JSON.parse(a.metadataJson ?? '{}') as { fileId?: string }).fileId)?.fileName ?? 'a file'}` : 'Opened the case' })),
        messages: msgs.map((m) => ({ id: m.id, at: m.sentAt.toISOString(), from: m.sender === 'reporter' ? 'reporter' : 'team', who: m.sender === 'reporter' ? (row.identity === 'anonymous' ? 'Anonymous reporter' : nm(row.reporterUserId)) : nm(m.authorUserId), text: m.body })),
        notice: {
          status: f.notice.status,
          delay: f.notice.delay ? { ...f.notice.delay, by: nm(f.notice.delay.by) } : null,
          sentOn: f.notice.sentOn,
          replyBy: f.notice.replyBy,
          replySource: await this.replySource(tx, row, today),
          replies: await Promise.all(f.notice.replies.map(async (r) => ({ at: r.at, text: r.text, files: await this.fileViews(tx, c.organizationId, r.fileIds, nm(f.notice.respondentUserId)) }))),
          moreTime: f.notice.moreTime,
        },
        outcome: posh
          ? null
          : { status: f.outcome.status, finding: f.outcome.finding, action: f.outcome.action, reasons: f.outcome.reasons, reporterSummary: f.outcome.reporterSummary, proposedBy: f.outcome.proposedBy ? nm(f.outcome.proposedBy) : null, proposedByMe: f.outcome.proposedBy === me, proposedAt: f.outcome.proposedAt, approvedBy: f.outcome.approvedBy ? nm(f.outcome.approvedBy) : null, approvedAt: f.outcome.approvedAt, sendBackNote: f.outcome.sendBackNote },
        icReport: posh
          ? { status: f.ic.status, finding: f.ic.finding, findings: f.ic.findings, recommendation: f.ic.recommendation, votes: voters.map((uid) => ({ memberId: uid, name: nm(uid), presiding: uid === presidingId, vote: f.ic.votes.get(uid)?.vote ?? null, note: f.ic.votes.get(uid)?.note ?? null, at: f.ic.votes.get(uid)?.at ?? null })), signedBy: f.ic.signedBy ? nm(f.ic.signedBy) : null, signedOn: f.ic.signedOn }
          : null,
        relief: f.relief.map((r) => ({ id: r.id, action: r.action, note: r.note, by: nm(r.by), at: r.at, task: { ref: r.ref, status: r.done ? 'done' : 'open', assignee: nm(r.assigneeUserId) } })),
      };
    });
  }

  private async fileViews(tx: Tx, org: string, ids: string[], by: string) {
    return (await this.fileRows(tx, org, ids)).map((r) => ({ id: r.id, name: r.fileName, size: r.size, type: r.mime, scan: r.scanStatus === 'clean' ? 'clean' : r.scanStatus === 'infected' ? 'infected' : 'pending', addedBy: by, addedAt: r.createdAt.toISOString(), sha256: r.sha256, opens: 0 }));
  }

  /** Where the reply days come from: the POSH rule set, or the company setting. */
  private async replySource(tx: Tx, row: Case, today: string) {
    if (row.kind === 'posh') {
      const inq = await this.ruleSet(tx, 'IN.POSH.INQUIRY', today);
      return inq ? `${inq.label}: ${inq.values.replyDays} days` : 'No POSH rule set in force';
    }
    return 'Company setting: days to reply';
  }

  private async replyDays(tx: Tx, c: CompanyContext, row: Case, today: string): Promise<{ days: number; source: string }> {
    if (row.kind === 'posh') {
      const inq = await this.ruleSet(tx, 'IN.POSH.INQUIRY', today);
      if (!inq) throw new ConflictException({ statusCode: 409, code: 'CASE_NO_RULE_SET', message: 'No POSH rule set is in force, so the reply date cannot be set. Ask your System Admin to check Statutory set-up.' });
      return { days: inq.values.replyDays, source: `${inq.label}: ${inq.values.replyDays} days` };
    }
    const days = Number(await settingFor(tx, c, 'cases.reply_days', ANY_ENTITY)) || 7;
    return { days, source: `Company setting: ${days} days to reply` };
  }

  async message(ctx: TenantContext, id: string, body: string) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      const m = await tx.speakupMessage.create({ data: { organizationId: c.organizationId, caseId: l.row.id, sender: 'team', authorUserId: c.userId!, body } });
      // The first message from the team acknowledges the report.
      if (!l.f.acknowledgedOn) await this.step(tx, c, l.row, 'acknowledged', {}, undefined, l.row.status === 'received' ? { status: 'acknowledged' } : {});
      await audit(tx, c, 'speakup.team_replied', 'speakup_case', l.row.id, { messageId: m.id });
      return { id: m.id, at: m.sentAt.toISOString(), row: l.row };
    });
    if (out.row.reporterUserId) await this.notify(out.row.organizationId, [out.row.reporterUserId], 'helpdesk.case.update', out.row.id, `There is an update on ${this.ref(out.row)}`, '/yx/desk/my-cases');
    else await this.speakup.alertReporter(out.row.alertContactEnc);
    return { id: out.id, at: out.at };
  }

  async sendNotice(ctx: TenantContext, id: string, dto: NoticeDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.f.notice.status === 'sent') throw new ConflictException('The notice was already sent.');
      const respondent = l.row.respondentUserId ?? dto.respondentUserId;
      if (!respondent) throw new BadRequestException('Choose who the notice goes to.');
      if (dto.respondentUserId && l.row.respondentUserId && dto.respondentUserId !== l.row.respondentUserId) throw new BadRequestException('This case already has a respondent.');
      if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: respondent, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company.');
      if (respondent === l.row.reporterUserId) throw new BadRequestException('The person who reported can’t be the respondent.');
      if (l.members.has(respondent) || l.allMembers.includes(respondent)) throw new BadRequestException('A case member can’t be the respondent. Ask them to step aside first.');
      const known = new Set([...l.row.fileIds, ...l.f.fileIds.map((x) => x.fileId)]);
      if ((dto.fileIds ?? []).some((f) => !known.has(f))) throw new BadRequestException('Share only files that are on this case.');
      const today = todayIst();
      const r = await this.replyDays(tx, c, l.row, today);
      const replyBy = addDays(today, r.days);
      await this.step(tx, c, l.row, 'notice_sent', { respondentUserId: respondent, allegations: dto.allegations, fileIds: dto.fileIds ?? [], replyBy, source: r.source }, undefined, { respondentUserId: respondent, status: 'investigation' });
      return { row: l.row, respondent, replyBy };
    });
    await this.notify(out.row.organizationId, [out.respondent], 'helpdesk.case.update', out.row.id, `You have a notice on ${this.ref(out.row)}. Reply by ${out.replyBy}.`, '/yx/desk/my-cases');
    return { replyBy: out.replyBy };
  }

  async delayNotice(ctx: TenantContext, id: string, dto: DelayDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.f.notice.status === 'sent') throw new ConflictException('The notice was already sent.');
      if (dto.reviewOn < todayIst()) throw new BadRequestException('The review date can’t be in the past.');
      await this.step(tx, c, l.row, 'notice_delayed', { reason: dto.reason, reviewOn: dto.reviewOn });
      return { delayed: true };
    });
  }

  async decideMoreTime(ctx: TenantContext, id: string, dto: MoreTimeDecisionDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.f.notice.moreTime?.status !== 'waiting') throw new ConflictException('There is no request for more time to decide.');
      if (dto.grant && (!dto.newDue || dto.newDue <= (l.f.notice.replyBy ?? todayIst()))) throw new BadRequestException('Choose a new reply date after the current one.');
      await this.step(tx, c, l.row, 'more_time_decided', { grant: dto.grant, newDue: dto.grant ? dto.newDue : null });
      return l.row;
    });
    if (out.respondentUserId) await this.notify(out.organizationId, [out.respondentUserId], 'helpdesk.case.update', out.id, `Your request for more time on ${this.ref(out)} was decided`, '/yx/desk/my-cases');
    return { decided: true };
  }

  async propose(ctx: TenantContext, id: string, dto: ProposeDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.row.kind === 'posh') throw new BadRequestException('A POSH case ends with the Internal Committee report, not an outcome.');
      if (l.f.outcome.status === 'proposed') throw new ConflictException('An outcome is already waiting for a second officer.');
      const d = canDecide(l.row.kind, l.f, todayIst());
      if (!d.ok) throw new ConflictException({ statusCode: 409, code: 'CASE_TOO_EARLY', message: d.reason });
      if (dto.finding === 'false-or-malicious' && dto.reasons.length < 50) throw new BadRequestException('“False or malicious” needs fuller reasons (50 letters or more): not proving a complaint is not enough.');
      await this.step(tx, c, l.row, 'proposed', { finding: dto.finding, action: dto.action, reasons: dto.reasons, reporterSummary: dto.reporterSummary }, dto.version);
      return { row: l.row, others: [...l.members.keys()].filter((u) => u !== c.userId) };
    });
    await this.notify(out.row.organizationId, out.others, 'helpdesk.case.update', out.row.id, `An outcome on ${this.ref(out.row)} is waiting for a second officer`, `/yx/desk/cases/${out.row.id}`);
    return { proposed: true };
  }

  async approve(ctx: TenantContext, id: string, version: number) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.f.outcome.status !== 'proposed') throw new ConflictException('There is no outcome waiting for approval.');
      if (l.f.outcome.proposedBy === c.userId) throw new ForbiddenException({ statusCode: 403, code: 'CASE_FOUR_EYES', message: 'You proposed this outcome, so another officer approves it.' });
      await this.step(tx, c, l.row, 'approved', { proposalId: l.f.outcome.proposalId, proposedBy: l.f.outcome.proposedBy }, version, { status: 'closed' });
      return l.row;
    });
    const to = [out.reporterUserId, out.respondentUserId].filter((x): x is string => Boolean(x));
    await this.notify(out.organizationId, to, 'helpdesk.case.update', out.id, `There is an outcome on ${this.ref(out)}`, '/yx/desk/my-cases');
    if (!out.reporterUserId) await this.speakup.alertReporter(out.alertContactEnc);
    return { approved: true };
  }

  async sendBack(ctx: TenantContext, id: string, dto: SendBackDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.f.outcome.status !== 'proposed') throw new ConflictException('There is no outcome waiting for approval.');
      if (l.f.outcome.proposedBy === c.userId) throw new ForbiddenException({ statusCode: 403, code: 'CASE_FOUR_EYES', message: 'You proposed this outcome, so another officer decides on it.' });
      await this.step(tx, c, l.row, 'sent_back', { proposalId: l.f.outcome.proposalId, note: dto.note }, dto.version);
      return { sentBack: true };
    });
  }

  private poshCase(l: Loaded) {
    if (l.row.kind !== 'posh') throw new BadRequestException('Only a POSH case has an Internal Committee report.');
  }

  async saveIcReport(ctx: TenantContext, id: string, dto: IcReportDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      this.poshCase(l);
      const d = canDecide(l.row.kind, l.f, todayIst());
      if (!d.ok) throw new ConflictException({ statusCode: 409, code: 'CASE_TOO_EARLY', message: d.reason });
      if (dto.finding === 'false-or-malicious' && dto.findings.length < 50) throw new BadRequestException('“False or malicious” needs fuller findings (50 letters or more): not proving a complaint is not enough (POSH Act s.14).');
      await this.step(tx, c, l.row, 'ic_draft', { finding: dto.finding, findings: dto.findings, recommendation: dto.recommendation }, dto.version);
      return { saved: true };
    });
  }

  async vote(ctx: TenantContext, id: string, dto: VoteDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      this.poshCase(l);
      if (l.f.ic.status !== 'draft') throw new ConflictException('There is no draft report to agree with yet.');
      if (dto.vote === 'disagree' && (dto.note ?? '').length < 3) throw new BadRequestException('Say why you don’t agree; it stays with the report.');
      if (l.f.ic.votes.has(c.userId!)) throw new ConflictException('You already recorded your view on this draft.');
      await this.step(tx, c, l.row, 'ic_vote', { draftId: l.f.ic.draftId, vote: dto.vote, note: dto.note ?? null });
      return { recorded: true };
    });
  }

  async sign(ctx: TenantContext, id: string, version: number) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      this.poshCase(l);
      const presiding = await tx.speakupTeamMember.findFirst({ where: { organizationId: c.organizationId, team: 'ic', role: 'presiding', removedAt: null, userId: c.userId! }, select: { id: true } });
      if (!presiding) throw new ForbiddenException({ statusCode: 403, code: 'CASE_NOT_PRESIDING', message: 'Only the presiding officer signs the report.' });
      if (l.f.ic.status !== 'draft') throw new ConflictException('There is no draft report to sign.');
      const agree = [...l.members.keys()].filter((u) => l.f.ic.votes.get(u)?.vote === 'agree').length;
      if (!majority(agree, l.members.size)) throw new ConflictException({ statusCode: 409, code: 'CASE_NO_MAJORITY', message: `More than half of the members must agree before you sign. ${agree} of ${l.members.size} agree now.` });
      await this.step(tx, c, l.row, 'ic_signed', { draftId: l.f.ic.draftId, agree, of: l.members.size }, version, { status: 'closed' });
      return l.row;
    });
    const to = [out.reporterUserId, out.respondentUserId].filter((x): x is string => Boolean(x));
    await this.notify(out.organizationId, to, 'helpdesk.case.update', out.id, `There is an update on ${this.ref(out)}`, '/yx/desk/my-cases');
    return { signed: true };
  }

  async relief(ctx: TenantContext, id: string, dto: ReliefDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: dto.assigneeUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company to carry it out.');
      if ([l.row.respondentUserId, l.row.reporterUserId].includes(dto.assigneeUserId)) throw new BadRequestException('A party to the case can’t carry out its relief.');
      const ref = `${this.ref(l.row)}-R${l.f.relief.length + 1}`;
      const st = await this.step(tx, c, l.row, 'relief', { action: dto.action, note: dto.note, assigneeUserId: dto.assigneeUserId, ref });
      return { row: l.row, ref, id: st.id };
    });
    // The HR task: who, what, by when; never the case. Nothing changes in People by itself (founder decision 3).
    await this.notify(out.row.organizationId, [dto.assigneeUserId], 'helpdesk.case.task', out.row.id, `Task ${out.ref}: ${RELIEF_WORDS[dto.action]}. ${dto.note.slice(0, 300)}`, '/yx/desk/my-cases');
    return { taskRef: out.ref };
  }

  async reliefDone(ctx: TenantContext, id: string, reliefId: string) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      const r = l.f.relief.find((x) => x.id === reliefId);
      if (!r) throw new NotFoundException('Not found.');
      if (r.done) throw new ConflictException('This task is already done.');
      await this.step(tx, c, l.row, 'relief_done', { reliefId });
      return { done: true };
    });
  }

  async recuse(ctx: TenantContext, id: string, reason: string) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      if (l.members.size === 1) {
        // The only officer: the case goes to the escalation list (never left with nobody).
        const esc = (await tx.speakupTeamMember.findMany({ where: { organizationId: c.organizationId, team: 'escalation', removedAt: null }, select: { userId: true } })).map((m) => m.userId).filter((u) => u !== c.userId && !l.allMembers.includes(u));
        if (!esc.length) throw new ConflictException({ statusCode: 409, code: 'CASE_LAST_OFFICER', message: 'You are the only officer on this case and the escalation list is empty. Ask your System Admin to fill it, or add another officer first.' });
        await tx.speakupCaseMember.createMany({ data: esc.map((userId) => ({ organizationId: c.organizationId, caseId: l.row.id, userId })) });
      }
      await this.step(tx, c, l.row, 'recused', { reason });
      return { recused: true };
    });
  }

  /** Manager of each user: the current assignment's manager (as a user), else the user's own manager field. */
  private async managers(tx: Tx, org: string): Promise<Map<string, string | null>> {
    const today = dayOf(todayIst());
    const [users, emps, asg] = await Promise.all([
      tx.user.findMany({ where: { organizationId: org }, select: { id: true, managerId: true } }),
      tx.employee.findMany({ where: { organizationId: org, userId: { not: null } }, select: { id: true, userId: true } }),
      tx.employeeAssignment.findMany({ where: { organizationId: org, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, select: { employeeId: true, managerEmployeeId: true } }),
    ]);
    const userOfEmp = new Map(emps.map((e) => [e.id, e.userId!]));
    const m = new Map<string, string | null>(users.map((u) => [u.id, u.managerId]));
    for (const a of asg) {
      const u = userOfEmp.get(a.employeeId);
      const mu = a.managerEmployeeId ? userOfEmp.get(a.managerEmployeeId) : undefined;
      if (u && mu) m.set(u, mu);
    }
    return m;
  }

  async addMember(ctx: TenantContext, id: string, dto: AddMemberDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: dto.personId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company.');
      if (l.allMembers.includes(dto.personId)) throw new ConflictException('This person is already on the case (or stepped aside from it).');
      if (l.row.kind === 'posh') throw new BadRequestException('Only Internal Committee members work on a POSH case; the System Admin changes the committee in Speak-up set-up.');
      const why = conflictWith(dto.personId, [l.row.reporterUserId, l.row.respondentUserId, l.row.aboutUserId], await this.managers(tx, c.organizationId));
      if (why && !dto.overrideReason) {
        const n = await this.names(tx, c.organizationId, [dto.personId]);
        throw new ConflictException({ statusCode: 409, code: 'CASE_CONFLICT', message: `${n.get(dto.personId) ?? 'This person'} ${why}. Add them only with a recorded reason for the override, or choose someone else.` });
      }
      await tx.speakupCaseMember.create({ data: { organizationId: c.organizationId, caseId: l.row.id, userId: dto.personId } });
      await this.step(tx, c, l.row, 'member_added', { userId: dto.personId, role: dto.role, overrideReason: why ? dto.overrideReason : null, conflict: why });
      return l.row;
    });
    await this.notify(out.organizationId, [dto.personId], 'helpdesk.case.update', out.id, `You were added to case ${this.ref(out)}`, `/yx/desk/cases/${out.id}`);
    return { added: true };
  }

  async upload(ctx: TenantContext, id: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a file to attach.');
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      const f = await this.files.storeIn(tx, c, { area: 'cases', name: file.name, data: file.data, allowedMime: FILE_TYPES, maxMb: 10, via: 'staff' });
      await this.step(tx, c, l.row, 'file_added', { fileId: f.id, sha256: f.sha256 });
      void this.files.scan(c.organizationId, f.id).catch(() => undefined);
      return { id: f.id, name: f.fileName, size: f.size, scan: f.scanStatus };
    });
  }

  /** A case file for a member: only clean files open; every open is audited. */
  async file(ctx: TenantContext, id: string, fileId: string) {
    const row = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      const known = [...l.row.fileIds, ...l.f.fileIds.map((x) => x.fileId), ...l.f.notice.replies.flatMap((r) => r.fileIds)];
      if (!known.includes(fileId)) throw new NotFoundException('Not found.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
      await audit(tx, c, 'cases.file_opened', 'speakup_case', l.row.id, { fileId, sha256: f.sha256 });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  // ------------------------------------------------------------------------------------------ HLP-09 ethics desk

  async ethics(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const mine = await tx.speakupCaseMember.findMany({ where: { organizationId: c.organizationId, userId: c.userId ?? NOBODY }, select: { caseId: true } });
      const rows = await tx.speakupCase.findMany({ where: { organizationId: c.organizationId, kind: 'whistleblower', status: { not: 'closed' }, id: { in: mine.map((m) => m.caseId) } }, orderBy: { filedAt: 'desc' }, take: 500 });
      const loaded = (await Promise.all(rows.map((r) => this.load(tx, c.organizationId, r)))).filter((l) => l.members.has(c.userId!));
      const locs = await tx.location.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true } });
      const org = await tx.organization.findFirst({ where: { id: c.organizationId }, select: { name: true } });
      return loaded.map(({ row, f }) => ({
        id: row.id,
        ref: this.ref(row),
        subject: this.subject(row),
        receivedOn: isoDay(row.filedAt)!,
        entity: [org?.name, locs.find((x) => x.id === row.locationId)?.name].filter(Boolean).join(' · ') || '—',
        anonymous: row.identity === 'anonymous',
        severity: severityOf(f, row.retaliationWorry),
        routed: row.routedTo === 'escalation' || Boolean(f.routedToChair),
        stage: this.stage(row, f).stage,
        clock: !f.acknowledgedOn ? { label: 'Acknowledge by', on: iso(row.ackDueOn)! } : null,
        aboutOfficer: Boolean(row.aboutUserId),
      }));
    });
  }

  /** On the company's ethics list today (the escalation list reads, but does not grade, reports). */
  private async ethicsOfficer(tx: Tx, c: CompanyContext) {
    return Boolean(c.userId && (await tx.speakupTeamMember.findFirst({ where: { organizationId: c.organizationId, team: 'ethics', userId: c.userId, removedAt: null }, select: { id: true } })));
  }

  /** Founder answer 35: an ethics officer on the report sets it Serious or Standard; each change is a step with old and new. */
  async setSeverity(ctx: TenantContext, id: string, severity: Severity) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      if (l.row.kind !== 'whistleblower') throw new BadRequestException('Only fraud and ethics reports have a severity.');
      this.open(l);
      if (!(await this.ethicsOfficer(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'CASE_NOT_ETHICS_OFFICER', message: 'Only an ethics officer on this report sets its severity.' });
      const from = severityOf(l.f, l.row.retaliationWorry);
      if (from === severity) throw new ConflictException(`This report is already ${severity === 'serious' ? 'Serious' : 'Standard'}.`);
      await this.step(tx, c, l.row, 'severity_set', { from, to: severity });
      return { severity };
    });
  }

  async routeToChair(ctx: TenantContext, id: string, reason: string) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.memberCase(tx, c, id);
      this.open(l);
      if (l.row.kind !== 'whistleblower') throw new BadRequestException('Only fraud and ethics reports go to the audit committee chair.');
      if (l.row.routedTo === 'escalation' || l.f.routedToChair) throw new ConflictException('This report is already with the chair.');
      const esc = (await tx.speakupTeamMember.findMany({ where: { organizationId: c.organizationId, team: 'escalation', removedAt: null }, select: { userId: true } })).map((m) => m.userId).filter((u) => u !== l.row.aboutUserId && !l.allMembers.includes(u));
      if (!esc.length) throw new ConflictException({ statusCode: 409, code: 'CASE_NO_CHAIR', message: 'Nobody is on the escalation list. Ask your System Admin to add the audit committee chair in Speak-up set-up.' });
      await tx.speakupCaseMember.createMany({ data: esc.map((userId) => ({ organizationId: c.organizationId, caseId: l.row.id, userId })) });
      await this.step(tx, c, l.row, 'routed_to_chair', { reason, userIds: esc });
      for (const u of esc) await this.step(tx, c, l.row, 'member_added', { userId: u, role: 'chair', overrideReason: null });
      return { row: l.row, esc };
    });
    await this.notify(out.row.organizationId, out.esc, 'helpdesk.case.update', out.row.id, `Report ${this.ref(out.row)} was routed to you`, `/yx/desk/cases/${out.row.id}`);
    return { routed: true };
  }

  // ------------------------------------------------------------------------------------------ HLP-07 my cases

  /** Cases where I raised it (named) or I am the respondent and have the notice. Never someone else's part. */
  private async mine(tx: Tx, c: CompanyContext) {
    const me = c.userId ?? NOBODY;
    const rows = await tx.speakupCase.findMany({ where: { organizationId: c.organizationId, OR: [{ reporterUserId: me }, { respondentUserId: me }] }, orderBy: { filedAt: 'desc' }, take: 200 });
    const out: { l: Loaded; role: 'reporter' | 'respondent' }[] = [];
    for (const r of rows) {
      const l = await this.load(tx, c.organizationId, r);
      if (r.reporterUserId === me) out.push({ l, role: 'reporter' });
      else if (l.f.notice.status === 'sent' && l.f.notice.respondentUserId === me) out.push({ l, role: 'respondent' });
    }
    return out;
  }

  private personStage(row: Case, f: Folded) {
    if (row.status === 'closed') return 'Closed';
    if (row.kind === 'posh') return f.notice.status === 'sent' ? 'Inquiry' : 'With the Internal Committee';
    return f.acknowledgedOn || row.status !== 'received' ? 'Being looked into' : 'Received';
  }

  async myList(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const today = todayIst();
      return (await this.mine(tx, c)).map(({ l: { row, f }, role }) => {
        const waiting = role === 'respondent' && row.status !== 'closed' && !f.notice.replies.length && Boolean(f.notice.replyBy && f.notice.replyBy >= today);
        return {
          id: row.id,
          ref: this.ref(row),
          kind: KIND[row.kind]!,
          role,
          stage: this.personStage(row, f),
          status: row.status === 'closed' ? 'closed' : waiting ? 'action' : 'open',
          next: row.status === 'closed' ? null : role === 'respondent' ? (f.notice.replies.length ? null : { label: 'Your reply due', on: f.notice.replyBy }) : row.kind === 'whistleblower' ? null : { label: row.kind === 'posh' ? 'Inquiry complete' : 'Committee decision', on: iso(row.decideDueOn) },
          unread: 0,
        };
      });
    });
  }

  private async mineOne(tx: Tx, c: CompanyContext, id: string) {
    const hit = (await this.mine(tx, c)).find((x) => x.l.row.id === id);
    if (!hit) throw new NotFoundException('Not found.');
    return hit;
  }

  async myDetail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const { l, role } = await this.mineOne(tx, c, id);
      const { row, f } = l;
      const today = todayIst();
      const inq = row.kind === 'posh' ? await this.ruleSet(tx, 'IN.POSH.INQUIRY', today) : null;
      const outcome = row.kind === 'posh' ? (f.ic.status === 'signed' ? POSH_DONE : null) : f.outcome.status === 'approved' ? f.outcome.reporterSummary : null;
      const appealUntil = row.kind === 'posh' && f.ic.signedOn && inq ? addDays(f.ic.signedOn, inq.values.appealDays) : null;
      await audit(tx, c, 'cases.my_case_viewed', 'speakup_case', row.id, { role });
      const base = { id: row.id, ref: this.ref(row), kind: KIND[row.kind]!, stage: this.personStage(row, f), status: row.status === 'closed' ? 'closed' : 'open', openedOn: isoDay(row.filedAt)! };
      if (role === 'reporter') {
        const msgs = await tx.speakupMessage.findMany({ where: { organizationId: c.organizationId, caseId: row.id }, orderBy: { sentAt: 'asc' } });
        return {
          ...base,
          role,
          dates: [
            { key: 'ack', label: 'Acknowledged', due: iso(row.ackDueOn), doneOn: f.acknowledgedOn },
            ...(row.kind === 'whistleblower' ? [] : [{ key: 'decide', label: row.kind === 'posh' ? 'Inquiry complete' : 'Committee decision', due: iso(row.decideDueOn), doneOn: row.kind === 'posh' ? f.ic.signedOn : f.outcome.approvedAt }]),
            ...(appealUntil ? [{ key: 'appeal', label: 'Appeal, if you disagree', due: appealUntil, doneOn: null }] : []),
          ],
          datesSource: [row.ruleSet, inq?.label].filter(Boolean).join(' · ') || 'Company speak-up settings',
          // The team stays "Case team" to the reporter; nothing else of the inquiry is sent.
          messages: msgs.map((m) => ({ id: m.id, at: m.sentAt.toISOString(), from: m.sender === 'reporter' ? 'me' : 'team', who: null, text: m.body })),
          outcome,
          appealUntil,
        };
      }
      const ownReplyFiles = f.notice.replies.flatMap((r) => r.fileIds);
      const files = await this.fileViews(tx, c.organizationId, [...f.notice.fileIds, ...ownReplyFiles], 'Case team');
      const waiting = row.status !== 'closed' && !f.notice.replies.length && Boolean(f.notice.replyBy && f.notice.replyBy >= today);
      return {
        ...base,
        status: row.status === 'closed' ? 'closed' : waiting ? 'action' : 'open',
        role,
        dates: [
          { key: 'notice', label: 'Notice sent to you', due: f.notice.sentOn, doneOn: f.notice.sentOn },
          { key: 'reply', label: 'Your reply', due: f.notice.replyBy, doneOn: f.notice.replies[0]?.at.slice(0, 10) ?? null },
          ...(appealUntil ? [{ key: 'appeal', label: 'Appeal, if you disagree', due: appealUntil, doneOn: null }] : []),
        ],
        datesSource: f.notice.source ?? 'Company setting',
        messages: [],
        notice: {
          sentOn: f.notice.sentOn,
          replyBy: f.notice.firstReplyBy,
          replySource: f.notice.source ?? '',
          allegations: f.notice.allegations ?? '',
          files: files.filter((x) => f.notice.fileIds.includes(x.id)),
          moreTime: f.notice.moreTime,
          askedMoreTime: Boolean(f.notice.moreTime),
          replies: f.notice.replies.map((r) => ({ at: r.at, text: r.text, files: files.filter((x) => r.fileIds.includes(x.id)).map((x) => ({ ...x, addedBy: 'You' })) })),
        },
        outcome,
        appealUntil,
      };
    });
  }

  async myMessage(ctx: TenantContext, id: string, body: string) {
    const out = await this.tx(ctx, async (tx, c) => {
      const { l, role } = await this.mineOne(tx, c, id);
      if (role !== 'reporter') throw new ForbiddenException('Send your answer as a reply to the notice.');
      if (l.row.status === 'closed') throw new ConflictException('This case is closed.');
      const m = await tx.speakupMessage.create({ data: { organizationId: c.organizationId, caseId: l.row.id, sender: 'reporter', body } });
      await audit(tx, c, 'speakup.reporter_replied', 'speakup_case', l.row.id, {});
      return { id: m.id, members: [...l.members.keys()], row: l.row };
    });
    await this.notify(out.row.organizationId, out.members, 'helpdesk.case.update', out.row.id, `The reporter wrote on ${this.ref(out.row)}`, `/yx/desk/cases/${out.row.id}`);
    return { id: out.id };
  }

  private async respondentCase(tx: Tx, c: CompanyContext, id: string) {
    const hit = await this.mineOne(tx, c, id);
    if (hit.role !== 'respondent') throw new NotFoundException('Not found.');
    if (hit.l.row.status === 'closed') throw new ConflictException('This case is closed.');
    return hit.l;
  }

  async myUpload(ctx: TenantContext, id: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a file to attach.');
    return this.tx(ctx, async (tx, c) => {
      await this.respondentCase(tx, c, id);
      const f = await this.files.storeIn(tx, c, { area: 'cases', name: file.name, data: file.data, allowedMime: FILE_TYPES, maxMb: 10, via: 'self' });
      void this.files.scan(c.organizationId, f.id).catch(() => undefined);
      return { id: f.id };
    });
  }

  async reply(ctx: TenantContext, id: string, dto: ReplyDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.respondentCase(tx, c, id);
      const ids = dto.fileIds ?? [];
      if (ids.length) {
        const own = await tx.file.count({ where: { organizationId: c.organizationId, id: { in: ids }, uploadedBy: c.userId!, area: 'cases' } });
        if (own !== new Set(ids).size) throw new BadRequestException('Attach only files you uploaded for this reply.');
      }
      await this.step(tx, c, l.row, 'replied', { text: dto.text, fileIds: ids });
      return { row: l.row, members: [...l.members.keys()] };
    });
    await this.notify(out.row.organizationId, out.members, 'helpdesk.case.update', out.row.id, `The respondent replied on ${this.ref(out.row)}`, `/yx/desk/cases/${out.row.id}`);
    return { replied: true };
  }

  async askMoreTime(ctx: TenantContext, id: string, reason: string) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.respondentCase(tx, c, id);
      if (l.f.notice.moreTime) throw new ConflictException('You already asked for more time on this case.');
      if (l.f.notice.replies.length) throw new ConflictException('You already replied.');
      await this.step(tx, c, l.row, 'more_time_asked', { reason });
      return { row: l.row, members: [...l.members.keys()] };
    });
    await this.notify(out.row.organizationId, out.members, 'helpdesk.case.update', out.row.id, `The respondent asked for more time on ${this.ref(out.row)}`, `/yx/desk/cases/${out.row.id}`);
    return { asked: true };
  }

  /** A file of my case: the papers shared with me in the notice, or my own reply's files. */
  async myFile(ctx: TenantContext, id: string, fileId: string) {
    const row = await this.tx(ctx, async (tx, c) => {
      const { l, role } = await this.mineOne(tx, c, id);
      const ok = role === 'respondent' && [...l.f.notice.fileIds, ...l.f.notice.replies.flatMap((r) => r.fileIds)].includes(fileId);
      if (!ok) throw new NotFoundException('Not found.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
      await audit(tx, c, 'cases.file_opened', 'speakup_case', l.row.id, { fileId, sha256: f.sha256, by: 'respondent' });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }
}

const STEP_WORDS: Record<string, string> = {
  acknowledged: 'Acknowledged the report',
  notice_sent: 'Sent the notice and the papers to the respondent',
  notice_delayed: 'Delayed the notice, with a recorded reason',
  more_time_asked: 'Asked for more time to reply',
  more_time_decided: 'Decided the request for more time',
  replied: 'Replied to the notice',
  proposed: 'Proposed the outcome',
  approved: 'Approved the outcome (second officer)',
  sent_back: 'Sent the outcome back',
  ic_draft: 'Saved the draft Internal Committee report',
  ic_signed: 'Signed the Internal Committee report (presiding officer)',
  relief: 'Recorded interim relief; HR has a task',
  relief_done: 'Marked the HR task done',
  recused: 'Stepped aside from the case',
  member_added: 'Added a member to the case',
  routed_to_chair: 'Routed the report to the audit committee chair',
  file_added: 'Added a file',
  severity_set: 'Changed the severity',
};
const RELIEF_WORDS: Record<string, string> = { transfer: 'transfer', leave: 'leave', reporting: 'stop reporting to the accused', other: 'other relief' };
