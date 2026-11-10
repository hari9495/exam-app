import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';
import { OtpService } from '../auth/otp.service';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { FilesService } from '../documents/files.service';
import { toRupees } from '../staffing/staffing-rules';
import { ContractLabourService, type Upload } from './contract-labour.service';
import { WorkersService } from './workers.service';
import { ComplianceService } from './compliance.service';
import { alertDaysOf, daysBetween, licenceState, type LicenceLike } from './clra-rules';
import type { PackItemDto, PortalWithdrawDto, PortalWorkerDto, RenewalDto } from './clra-dto';

const PORTAL_MINUTES = 60;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ANY_ENTITY = { legalEntityId: '' };
const SKILL: Record<string, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled', highly_skilled: 'Highly skilled' };
/** A gate pass ending within this many days shows in "What is due". */
const GATE_SOON_DAYS = 30;
type Session = { org: string; contactId: string; agencyId: string; c: CompanyContext };

/**
 * Contract labour CL-3 (answers 631, 678; T9-13): the contractor portal. A contact the compliance owner gave access
 * signs in with a one-time code to their email (always "sent": no telling who has access; rate-limited per email and
 * IP), then holds a session token (kept only as its SHA-256 hash, 60 minutes). Every call reads only the contact's own
 * contractor: its licences, work orders, workers, deployments and gate passes; another contractor's record is not found
 * (404) and an ended or expired session is 401. The contact sends a worker for site approval through the same CL-2
 * checks (no override) and uploads a licence renewal, which waits for the compliance owner's verification. Monthly
 * packs and bills come with CL-4, attendance with CL-5.
 */
@Injectable()
export class ContractorPortalService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly otp: OtpService,
    private readonly clra: ContractLabourService,
    private readonly workers: WorkersService,
    private readonly files: FilesService,
    private readonly compliance: ComplianceService,
  ) {}

  private async orgOf(slug: string) {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { slug }, select: { id: true } }));
    if (!o) throw new NotFoundException('No such company.');
    return o.id;
  }

  /** Contacts with access whose contractor still supplies contract labour and is active. */
  private async contacts(tx: Tx, org: string, email: string) {
    const rows = await tx.contractorContact.findMany({ where: { organizationId: org, email: { equals: email, mode: 'insensitive' }, portal: { in: ['invited', 'active'] } }, orderBy: { createdAt: 'asc' } });
    const ok = new Set((await tx.agency.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.agencyId) }, contractLabour: true, active: true }, select: { id: true } })).map((a) => a.id));
    return rows.filter((r) => ok.has(r.agencyId));
  }

  private otpKey = (org: string, email: string) => `contractor-portal-otp:${org}:${tokenHash(email)}`;

  /** Always "sent" (no enumeration); a code goes only to a contact with access. */
  async code(slug: string, email: string, ip: string | null) {
    const org = await this.orgOf(slug);
    const e = email.toLowerCase();
    await this.otp.reserveSend(`contractor-portal:${org}:${e}`, ip);
    const ok = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => (await this.contacts(tx, org, e)).length > 0);
    if (ok) this.otp.deliver('email', e, await this.otp.issue(this.otpKey(org, e), { email: e }), 'sign_in', org, { userId: '' });
    return { sent: true };
  }

  async verify(slug: string, email: string, code: string) {
    const org = await this.orgOf(slug);
    const e = email.toLowerCase();
    const data = await this.otp.check(this.otpKey(org, e), code);
    const wrong = () => new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    if (!data || data.email !== e) throw wrong();
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      // shortcut: a person who is a contact of two contractors signs in to the first; a picker comes if that happens.
      const [contact] = await this.contacts(tx, org, e);
      if (!contact) throw wrong();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + PORTAL_MINUTES * 60_000);
      await tx.contractorPortalSession.create({ data: { organizationId: org, contactId: contact.id, agencyId: contact.agencyId, tokenHash: tokenHash(token), expiresAt } });
      if (contact.portal === 'invited') await tx.contractorContact.update({ where: { id: contact.id }, data: { portal: 'active' } });
      await audit(tx, { organizationId: org, isSuperAdmin: false } as CompanyContext, 'clra.portal.signed_in', 'contractor_contact', contact.id, {});
      return { token, expiresAt };
    });
  }

  /** Every portal call: a live session of a contact who still has access, for an active contractor. */
  private async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, s: Session) => Promise<T>): Promise<T> {
    if (!token) throw new UnauthorizedException('Sign in again.');
    const org = await this.orgOf(slug);
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const s = await tx.contractorPortalSession.findFirst({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null, expiresAt: { gt: new Date() } } });
      if (!s) throw new UnauthorizedException('Sign in again.');
      const contact = await tx.contractorContact.findFirst({ where: { id: s.contactId, organizationId: org, portal: 'active' } });
      const agency = contact && (await tx.agency.findFirst({ where: { id: s.agencyId, organizationId: org, contractLabour: true, active: true }, select: { id: true } }));
      if (!contact || !agency) throw new UnauthorizedException('Sign in again.');
      return fn(tx, { org, contactId: contact.id, agencyId: s.agencyId, c });
    });
  }

  signOut(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (tx) => {
      await tx.contractorPortalSession.updateMany({ where: { tokenHash: tokenHash(token!) }, data: { endedAt: new Date() } });
      return { signedOut: true };
    });
  }

  /** The contractor's own licences per site, work orders, workers, and what is due. */
  me(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (tx, s) => {
      const { org, agencyId } = s;
      const today = todayIst();
      const alertDays = alertDaysOf(await settingFor(tx, s.c, 'clra.licence_alerts', ANY_ENTITY));
      const agency = await tx.agency.findFirstOrThrow({ where: { id: agencyId, organizationId: org }, select: { name: true, work: true } });
      const contact = await tx.contractorContact.findFirstOrThrow({ where: { id: s.contactId, organizationId: org }, select: { name: true, email: true } });
      const company = await tx.organization.findUniqueOrThrow({ where: { id: org }, select: { name: true } });
      const licences = await tx.contractorLicence.findMany({ where: { organizationId: org, agencyId }, orderBy: [{ validTo: 'desc' }, { createdAt: 'desc' }] });
      const deps = await tx.contractDeployment.findMany({ where: { organizationId: org, agencyId, status: { in: ['pending', 'deployed'] } }, orderBy: { fromOn: 'desc' } });
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set([...licences.map((l) => l.locationId), ...deps.map((d) => d.locationId)])] } }, select: { id: true, name: true, archivedAt: true } });
      const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: deps.map((d) => d.personId) } }, select: { id: true, givenName: true, familyName: true } });
      const orders = await tx.contractorWorkOrder.findMany({ where: { organizationId: org, agencyId }, orderBy: { fromOn: 'desc' } });
      const all: LicenceLike[] = licences.map((l) => ({ id: l.id, locationId: l.locationId, states: l.states, validFrom: iso(l.validFrom), validTo: iso(l.validTo), status: l.status as LicenceLike['status'], renewalOfId: l.renewalOfId }));
      const site = (id: string) => locs.find((x) => x.id === id)?.name ?? 'Archived site';
      // One card per licence in use: a verified licence until its verified renewal starts, then the renewal.
      const current = licences.filter(
        (l) =>
          l.status === 'verified' &&
          !licences.some((r) => r.renewalOfId === l.id && r.status === 'verified' && iso(r.validFrom) <= today) &&
          !(l.renewalOfId && iso(l.validFrom) > today && licences.some((p) => p.id === l.renewalOfId && p.status === 'verified')),
      );
      const establishments = current.map((l) => {
        const renewal = licences.filter((r) => r.renewalOfId === l.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        return {
          licenceId: l.id,
          site: { id: l.locationId, name: site(l.locationId) },
          licenceNo: l.licenceNo,
          scope: l.scope,
          issuedBy: l.issuedBy,
          states: l.states,
          maxWorkers: l.maxWorkers,
          deployed: deps.filter((d) => d.locationId === l.locationId).length,
          validFrom: iso(l.validFrom),
          validTo: iso(l.validTo),
          state: licenceState(all.find((x) => x.id === l.id)!, today, alertDays, all),
          renewal: renewal ? { id: renewal.id, licenceNo: renewal.licenceNo, status: renewal.status, validTo: iso(renewal.validTo), rejectReason: renewal.rejectReason } : null,
        };
      });
      const name = (id: string) => {
        const p = persons.find((x) => x.id === id);
        return p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : 'Worker';
      };
      const workers = deps.map((d) => ({
        id: d.id,
        name: name(d.personId),
        idMasked: `XXXX XXXX ${d.idLast4}`,
        site: site(d.locationId),
        skill: SKILL[d.skill] ?? d.skill,
        wage: d.wagePaise !== null ? toRupees(d.wagePaise) : null,
        fromOn: iso(d.fromOn),
        toOn: d.toOn ? iso(d.toOn) : null,
        status: d.status,
        gatePass: d.gatePassNo,
        gateValidTo: d.gateValidTo ? iso(d.gateValidTo) : null,
        uan: d.uan,
        esicIp: d.esicIp,
      }));
      const due: { kind: 'licence' | 'renewal' | 'rejected' | 'gate' | 'approval'; tone: 'danger' | 'warning' | 'info'; text: string }[] = [];
      for (const e of establishments) {
        const left = daysBetween(today, e.validTo);
        if (e.renewal?.status === 'pending') due.push({ kind: 'renewal', tone: 'info', text: `Renewal ${e.renewal.licenceNo} for ${e.site.name} is being checked by ${company.name}.` });
        else if (e.renewal?.status === 'rejected' && (e.state === 'expiring' || e.state === 'expired')) due.push({ kind: 'rejected', tone: 'danger', text: `Renewal ${e.renewal.licenceNo} for ${e.site.name} was not accepted: ${e.renewal.rejectReason}. Upload it again.` });
        else if (e.state === 'expired') due.push({ kind: 'licence', tone: 'danger', text: `Licence ${e.licenceNo} for ${e.site.name} ended on ${e.validTo}. Upload the renewed licence; no worker can be deployed there until it is verified.` });
        else if (e.state === 'expiring') due.push({ kind: 'licence', tone: left <= 30 ? 'danger' : 'warning', text: `Licence ${e.licenceNo} for ${e.site.name} ends in ${left} days (${e.validTo}). Upload the renewed licence.` });
      }
      for (const w of workers) if (w.status === 'deployed' && w.gateValidTo && daysBetween(today, w.gateValidTo) <= GATE_SOON_DAYS) due.push({ kind: 'gate', tone: 'warning', text: `${w.name}'s gate pass ${w.gatePass} ends on ${w.gateValidTo}.` });
      const waiting = workers.filter((w) => w.status === 'pending').length;
      if (waiting) due.push({ kind: 'approval', tone: 'info', text: `${waiting} ${waiting === 1 ? 'worker is' : 'workers are'} waiting for site approval.` });
      return {
        company: company.name,
        contractor: { name: agency.name, work: agency.work ?? '' },
        contact: { name: contact.name, email: contact.email },
        today,
        sites: establishments.filter((e) => e.state !== 'expired').map((e) => e.site).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i),
        establishments,
        workOrders: orders.map((w) => ({ id: w.id, number: w.number, fromOn: iso(w.fromOn), toOn: iso(w.toOn), headcount: w.headcount, active: deps.filter((d) => w.locationIds.includes(d.locationId)).length, sites: w.locationIds.map((id) => site(id)) })),
        workers,
        due,
      };
    });
  }

  private dto(s: Session, d: PortalWorkerDto) {
    return { ...d, contractorId: s.agencyId };
  }

  check(slug: string, token: string | undefined, d: PortalWorkerDto) {
    return this.inPortal(slug, token, (tx, s) => this.workers.checkIn(tx, s.c, this.dto(s, d)));
  }

  /** Send a worker for site approval: the same checks as the compliance owner's, no override. */
  /** Answer 736: withdraw the contractor's own worker waiting for site approval (another contractor's: 404). */
  withdraw(slug: string, token: string | undefined, id: string, d: PortalWithdrawDto) {
    return this.inPortal(slug, token, (tx, s) => this.workers.withdrawIn(tx, s.c, id, s.agencyId, d.reason, s.contactId));
  }

  addWorker(slug: string, token: string | undefined, d: PortalWorkerDto) {
    return this.inPortal(slug, token, async (tx, s) => {
      const r = await this.workers.sendIn(tx, s.c, this.dto(s, d), s.contactId);
      return { id: r.id, checks: r.checks };
    });
  }

  /** Upload a renewal of the contractor's own licence; it waits for the compliance owner's verification. */
  async renew(slug: string, token: string | undefined, licenceId: string, d: RenewalDto, file: Upload) {
    const out = await this.inPortal(slug, token, (tx, s) => this.clra.renewIn(tx, s.c, licenceId, d, file, s.agencyId, s.contactId));
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { id: out.id, status: 'pending' };
  }

  /* ---------------- CL-4: monthly packs, bills, the minimum-wage hint ---------------- */

  packs(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, (tx, s) => this.compliance.portalPacks(tx, s.c, s.agencyId, todayIst()));
  }

  /** One month's pack for a site the contractor owes it for (another site or month: 404). */
  pack(slug: string, token: string | undefined, locationId: string, month: string) {
    return this.inPortal(slug, token, async (tx, s) => {
      const today = todayIst();
      const owed = (await this.compliance.portalPacks(tx, s.c, s.agencyId, today)).some((p) => p.site.id === locationId && p.month === month);
      if (!owed) throw new NotFoundException('No pack is owed for this site and month.');
      const v = await this.compliance.packView(tx, s.c, s.agencyId, locationId, `${month}-01`, today);
      return { ...v, agencyId: undefined, workers: v.workers.map((w) => ({ ...w, paidByUs: undefined, stillShort: undefined })) };
    });
  }

  async upload(slug: string, token: string | undefined, d: PackItemDto, file: Upload) {
    const out = await this.inPortal(slug, token, (tx, s) => this.compliance.upload(tx, s.c, s.agencyId, s.contactId, d, file, todayIst()));
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { id: out.id, state: 'submitted' };
  }

  bills(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, (tx, s) => this.compliance.portalBills(tx, s.c, s.agencyId, todayIst()));
  }

  /** Answer 685: the minimum wage for one of the contractor's sites and a skill. */
  minWage(slug: string, token: string | undefined, locationId: string, skill: string) {
    return this.inPortal(slug, token, async (tx, s) => {
      const has = await tx.contractorLicence.findFirst({ where: { organizationId: s.org, agencyId: s.agencyId, locationId, status: 'verified' }, select: { id: true } });
      if (!has) throw new NotFoundException('Site not found.');
      return this.compliance.hintIn(tx, s.c, locationId, skill, todayIst());
    });
  }
}
