import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { createHash, randomUUID } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { FormDef } from '../rules-engine/forms';
import { AttachmentsService } from './attachments.service';
import { DeskActor, SEAT_REQUIRED, audit, emit, requireDesk, requireSetUp, requireWork } from './desk-access';
import { DeskOrgService } from './desk-org.service';
import { Requester, RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { TicketsService } from './tickets.service';

// SD-2.07 (US-G-045) on the P05 seam: a desk keeps document templates (plain text with {{fields}}); an agent makes a
// document from one inside a request with the request's data. Missing data stops it with a list (YX-DOC-07); fields the
// agent may not see under P02 are not filled (YX-DOC-08). The PDF is stored with its hash and never changes (YX-DOC-09).
// When it needs a signature, the person signs in the app: they type their name and confirm; we store the evidence
// (time, IP, device, sign-in strength, document hash) and seal a signed copy with a completion page (YX-DOC-12). While a
// signature is pending the request cannot be resolved. An outside e-sign provider (Aadhaar eSign, DSC) plugs in as
// another `provider` (go-live line); only 'in_app' exists today.

const FIELD = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?)\s*\}\}/g;
export const DOC_FIELDS: Record<string, string> = {
  requester_name: 'Name of the person who asked',
  for_name: 'Name of the person it is for',
  ticket_number: 'Request number',
  ticket_subject: 'Request subject',
  company_name: 'Company name',
  today: "Today's date",
  designation: 'Designation (HR)',
  department: 'Department (HR)',
  location: 'Location (HR)',
  manager: 'Manager (HR)',
  employee_code: 'Employee code (HR, internal)',
  joined_on: 'Joining date (HR, internal)',
  item_name: 'Ordered item',
};
const PICKER_TYPES = new Set(['person', 'location', 'cost_centre', 'separator', 'formula']);

export function placeholders(body: string): string[] {
  return [...new Set([...body.matchAll(FIELD)].map((m) => m[1]))];
}

/** Every {{field}} must be known (answers: answer.<question key>). Returns the unknown ones. */
export function unknownFields(body: string): string[] {
  return placeholders(body).filter((f) => !(f in DOC_FIELDS) && !/^answer\.[a-z][a-z0-9_]*$/.test(f));
}

/** Fills the template; returns the text and the fields it had no value for. */
export function fill(body: string, values: Record<string, string | null | undefined>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(FIELD, (_m, key: string) => {
    const v = values[key];
    if (v === undefined || v === null || v === '') {
      missing.add(key);
      return '';
    }
    return v;
  });
  return { text, missing: [...missing] };
}

function pdf(title: string, text: string, extra?: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(title);
    doc.moveDown().fontSize(11).text(text);
    extra?.(doc);
    doc.end();
  });
}

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly files: AttachmentsService,
    private readonly org: DeskOrgService,
    private readonly requesters: RequesterService,
  ) {}

  private tx<T>(a: { ctx: DeskActor['ctx'] }, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ templates

  async templates(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.catalog.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      const rows = await tx.sdDocTemplate.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { name: 'asc' } });
      return { fields: Object.entries(DOC_FIELDS).map(([key, label]) => ({ key, label })), templates: rows.map((t) => ({ id: t.id, name: t.name, body: t.body, needsSignature: t.needsSignature, active: t.active, version: t.version })) };
    });
  }

  private checkBody(body: string) {
    const unknown = unknownFields(body);
    if (unknown.length) throw new BadRequestException(`These fields are not known: ${unknown.map((f) => `{{${f}}}`).join(', ')}. Use the fields in the list, or answer.<question key> for an answer on the request.`);
  }

  async saveTemplate(a: DeskActor, id: string | null, dto: { deskId?: string; version?: number; name?: string; body?: string; needsSignature?: boolean; active?: boolean }) {
    if (dto.body !== undefined) this.checkBody(dto.body);
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        if (!id) {
          requireSetUp(a, dto.deskId!, 'desk.catalog.manage');
          await requireDesk(tx, a, dto.deskId!);
          const t = await tx.sdDocTemplate.create({ data: { organizationId: org, deskId: dto.deskId!, name: dto.name!, body: dto.body!, needsSignature: dto.needsSignature ?? true, createdBy: a.userId } });
          await audit(tx, a, 'desk.doc_template.created', 'sd_doc_template', t.id, { deskId: t.deskId, name: t.name });
          return { id: t.id, version: t.version };
        }
        const t = await tx.sdDocTemplate.findFirst({ where: { organizationId: org, id } });
        if (!t) throw new NotFoundException('No such template.');
        requireSetUp(a, t.deskId, 'desk.catalog.manage');
        const res = await tx.sdDocTemplate.updateMany({ where: { id, version: dto.version }, data: { name: dto.name, body: dto.body, needsSignature: dto.needsSignature, active: dto.active, version: { increment: 1 }, updatedAt: new Date() } });
        if (!res.count) throw new ConflictException('Someone changed this template. Reload to see the latest.');
        await audit(tx, a, 'desk.doc_template.saved', 'sd_doc_template', id, { name: dto.name, active: dto.active });
        return { id, version: (dto.version ?? 0) + 1 };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A template with that name exists on this desk.');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------------ making a document

  private async values(tx: Tx, a: DeskActor, t: { id: string; number: string; subject: string; requesterPersonId: string; requestedForPersonId: string | null; organizationId: string }) {
    const org = t.organizationId;
    const names = await this.tickets.personNames(tx, org, [t.requesterPersonId, t.requestedForPersonId]);
    const forId = t.requestedForPersonId ?? t.requesterPersonId;
    const hr = await this.org.hrFacts(tx, a, forId);
    const company = await tx.organization.findUnique({ where: { id: org }, select: { name: true } });
    const v: Record<string, string | null> = {
      requester_name: names.get(t.requesterPersonId)?.name ?? null,
      for_name: names.get(forId)?.name ?? null,
      ticket_number: t.number,
      ticket_subject: t.subject,
      company_name: company?.name ?? null,
      today: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      designation: hr.designation,
      department: hr.department,
      location: hr.location,
      manager: hr.manager,
      // YX-DOC-08: internal HR fields only when the agent's own HR access reaches the person.
      employee_code: hr.internal?.employeeCode ?? null,
      joined_on: hr.internal?.joinedOn ?? null,
      item_name: null,
    };
    const items = await tx.sdRequestItem.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' } });
    for (const ri of items) {
      const ver = await tx.sdCatalogItemVersion.findFirst({ where: { organizationId: org, itemId: ri.itemId, version: ri.itemVersion }, select: { form: true } });
      const item = await tx.sdCatalogItem.findFirst({ where: { organizationId: org, id: ri.itemId }, select: { name: true } });
      v.item_name ??= item?.name ?? null;
      const answers = ri.answers as Record<string, unknown>;
      for (const f of ((ver?.form ?? { sections: [] }) as unknown as FormDef).sections.flatMap((s) => s.fields)) {
        // Sensitive answers and ids from pickers never go into a document.
        if (f.sensitive || PICKER_TYPES.has(f.type) || v[`answer.${f.key}`]) continue;
        const x = answers[f.key];
        if (x === undefined || x === null || x === '') continue;
        const label = (y: unknown) => f.options?.find((o) => o.value === y)?.label ?? String(y);
        v[`answer.${f.key}`] = Array.isArray(x) ? x.map(label).join(', ') : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : label(x);
      }
    }
    return v;
  }

  /** POST /tickets/{id}/documents: make a document from a template of the ticket's desk; ask the person to sign it. */
  async make(a: DeskActor, ticketId: string, dto: { templateId: string; signerPersonId?: string }) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const tpl = await tx.sdDocTemplate.findFirst({ where: { organizationId: org, deskId: t.deskId, id: dto.templateId, active: true } });
      if (!tpl) throw new BadRequestException('Choose a document template of this desk.');
      const signer = tpl.needsSignature ? (dto.signerPersonId ?? t.requestedForPersonId ?? t.requesterPersonId) : null;
      if (signer && ![t.requesterPersonId, t.requestedForPersonId].includes(signer)) throw new BadRequestException('The person who signs is the requester or the person the request is for.');
      const { text, missing } = fill(tpl.body, await this.values(tx, a, t));
      if (missing.length) throw new BadRequestException({ statusCode: 400, code: 'DOCUMENT_DATA_MISSING', message: `The document needs: ${missing.map((m) => DOC_FIELDS[m] ?? m.replace('answer.', 'answer to ')).join(', ')}.`, missing });
      const bytes = await pdf(tpl.name, text);
      const id = randomUUID();
      const blobKey = await this.files.put(`desk/${org}/${t.id}/doc-${id}.pdf`, bytes, 'application/pdf');
      const hash = sha(bytes);
      const doc = await tx.sdRequestDocument.create({ data: { id, organizationId: org, deskId: t.deskId, ticketId: t.id, templateId: tpl.id, templateVersion: tpl.version, title: tpl.name, bodyText: text, blobKey, sha256: hash, signerPersonId: signer, status: signer ? 'pending' : 'issued', createdBy: a.userId } });
      // The person gets it as a reply on the request (with the file), so it reaches them by email and in the app.
      const words = signer ? `<p>Please read and sign <strong>${escape(tpl.name)}</strong>. Open your request in YukthiX to sign it.</p>` : `<p>Here is <strong>${escape(tpl.name)}</strong>.</p>`;
      const m = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'reply', side: 'agent', authorUserId: a.userId, bodyHtml: words, bodyText: words.replace(/<[^>]+>/g, ''), channel: 'agent' } });
      await tx.sdAttachment.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, messageId: m.id, side: 'agent', uploadedByUserId: a.userId, blobKey, fileName: `${tpl.name}.pdf`.slice(0, 255), contentType: 'application/pdf', sizeBytes: bytes.length, sha256: hash, scanStatus: 'clean', scanDetail: 'Made by YukthiX', scannedAt: new Date() } });
      await this.tickets.mailOut.queueReply(org, t.id, m.id);
      await this.tickets.event(tx, t, 'document_made', null, tpl.name, { by: a.userId, reason: signer ? 'Waiting for a signature' : null, requesterVisible: true });
      await emit(tx, org, 'helpdesk.document.created', { ticketId: t.id, deskId: t.deskId, documentId: id, signature: Boolean(signer) });
      await audit(tx, a, 'desk.document.created', 'sd_ticket', t.id, { documentId: id, templateId: tpl.id, templateVersion: tpl.version, sha256: hash, signerPersonId: signer });
      return this.view(doc);
    });
  }

  private view(d: Prisma.SdRequestDocumentGetPayload<object>) {
    return { id: d.id, title: d.title, status: d.status, provider: d.provider, sha256: d.sha256, signedAt: d.signedAt, signedSha256: d.signedSha256, createdAt: d.createdAt, needsMe: false };
  }

  async list(a: DeskActor, ticketId: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      const docs = await tx.sdRequestDocument.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id }, orderBy: { createdAt: 'asc' } });
      const templates = await tx.sdDocTemplate.findMany({ where: { organizationId: a.ctx.organizationId, deskId: t.deskId, active: true }, select: { id: true, name: true, needsSignature: true }, orderBy: { name: 'asc' } });
      // The signing evidence (address, device) is for the desk's agents only, not observers or shared desks.
      return { documents: docs.map((d) => ({ ...this.view(d), evidence: access === 'agent' ? d.evidence : null })), templates };
    });
  }

  async withdraw(a: DeskActor, ticketId: string, docId: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const res = await tx.sdRequestDocument.updateMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: docId, status: 'pending' }, data: { status: 'withdrawn' } });
      if (!res.count) throw new ConflictException('Only a document waiting for a signature can be withdrawn.');
      await this.tickets.event(tx, t, 'document_withdrawn', null, docId, { by: a.userId, requesterVisible: true });
      await audit(tx, a, 'desk.document.withdrawn', 'sd_ticket', t.id, { documentId: docId });
      return { withdrawn: true };
    });
  }

  // ------------------------------------------------------------------------------------------ the person signs

  /** The person's documents on their own request (the signer sees what is waiting for them). */
  async mine(r: Requester, ticketId: string) {
    return this.tx(r, async (tx) => {
      const { t, ids } = await this.requesters.ownTicket(tx, r, ticketId);
      const docs = await tx.sdRequestDocument.findMany({ where: { organizationId: r.ctx.organizationId, ticketId: t.id, status: { not: 'withdrawn' } }, orderBy: { createdAt: 'asc' } });
      return docs.map((d) => ({ ...this.view(d), needsMe: d.status === 'pending' && Boolean(d.signerPersonId && ids.includes(d.signerPersonId)), text: d.bodyText }));
    });
  }

  /** Sign (or decline) in the app. Evidence: typed name, time, IP, device, sign-in strength, hash of the document. */
  async sign(r: Requester, docId: string, dto: { decision: 'sign' | 'decline'; typedName: string; reason?: string }, meta: { ip: string | null; userAgent: string | null; assurance: string | null }) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const org = r.ctx.organizationId;
    const out = await this.tx(r, async (tx) => {
      const d = await tx.sdRequestDocument.findFirst({ where: { organizationId: org, id: docId } });
      if (!d) throw new NotFoundException('No such document.');
      const { t, ids } = await this.requesters.ownTicket(tx, r, d.ticketId);
      if (!d.signerPersonId || !ids.includes(d.signerPersonId)) throw new NotFoundException('No such document.');
      await tx.$queryRaw`SELECT id FROM sd_request_documents WHERE organization_id = ${org}::uuid AND id = ${d.id}::uuid FOR UPDATE`;
      const fresh = await tx.sdRequestDocument.findFirstOrThrow({ where: { id: d.id } });
      if (fresh.status !== 'pending') throw new ConflictException('This document is no longer waiting for a signature.');
      const name = (await this.tickets.personNames(tx, org, [d.signerPersonId])).get(d.signerPersonId)?.name ?? '';
      if (dto.decision === 'decline') {
        if (!dto.reason?.trim()) throw new BadRequestException('Say why you are not signing.');
        await tx.sdRequestDocument.update({ where: { id: d.id }, data: { status: 'declined', evidence: { decision: 'declined', reason: dto.reason.trim().slice(0, 500), at: new Date().toISOString(), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null } } });
        await this.tickets.event(tx, t, 'document_declined', null, d.title, { by: null, byPerson: d.signerPersonId, reason: dto.reason.trim().slice(0, 500), requesterVisible: true });
        await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.document.declined', 'sd_ticket', t.id, { documentId: d.id });
        return { status: 'declined' };
      }
      const typed = dto.typedName.trim().replace(/\s+/g, ' ');
      if (typed.toLocaleLowerCase('en') !== name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')) throw new BadRequestException(`Type your name as it appears on the document: ${name}.`);
      const original = await this.files.get(d.blobKey);
      if (sha(original) !== d.sha256) throw new ConflictException('This document does not match what was made. Ask the desk to make it again.');
      const at = new Date();
      const evidence = { method: 'in_app_typed_name', typedName: typed, signedByUserId: r.userId, signerPersonId: d.signerPersonId, at: at.toISOString(), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null, signInStrength: meta.assurance, documentSha256: d.sha256 };
      // YX-DOC-12: the signed copy carries a completion page listing the signer and the evidence.
      const signed = await pdf(d.title, d.bodyText, (doc) => {
        doc.addPage().fontSize(14).text('Completion certificate');
        doc.moveDown().fontSize(10);
        for (const [k, v] of [['Signed by', name], ['Typed name', typed], ['Signed at (UTC)', at.toISOString()], ['From', meta.ip ?? 'unknown'], ['Device', (meta.userAgent ?? 'unknown').slice(0, 200)], ['Sign-in strength', meta.assurance ?? 'unknown'], ['Document fingerprint (SHA-256)', d.sha256], ['Method', 'Signed in YukthiX by typing the name and confirming']]) doc.text(`${k}: ${v}`);
      });
      const signedHash = sha(signed);
      const signedKey = await this.files.put(`desk/${org}/${t.id}/doc-${d.id}-signed.pdf`, signed, 'application/pdf');
      await tx.sdRequestDocument.update({ where: { id: d.id }, data: { status: 'signed', evidence, signedBlobKey: signedKey, signedSha256: signedHash, signedAt: at } });
      await tx.sdAttachment.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, side: 'requester', uploadedByPersonId: d.signerPersonId, blobKey: signedKey, fileName: `${d.title} (signed).pdf`.slice(0, 255), contentType: 'application/pdf', sizeBytes: signed.length, sha256: signedHash, scanStatus: 'clean', scanDetail: 'Made by YukthiX', scannedAt: at } });
      await this.tickets.event(tx, t, 'document_signed', null, d.title, { by: null, byPerson: d.signerPersonId, requesterVisible: true });
      await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'system', side: 'system', authorPersonId: d.signerPersonId, bodyHtml: textToHtml(`${name} signed ${d.title}.`), bodyText: `${name} signed ${d.title}.`, channel: 'system' } });
      await emit(tx, org, 'helpdesk.document.signed', { ticketId: t.id, deskId: t.deskId, documentId: d.id });
      await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.document.signed', 'sd_ticket', t.id, { documentId: d.id, sha256: d.sha256, signedSha256: signedHash, ip: meta.ip });
      return { status: 'signed', signedSha256: signedHash };
    });
    return out;
  }
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
