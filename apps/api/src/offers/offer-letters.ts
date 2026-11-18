import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { FilesService } from '../documents/files.service';
import { LettersService } from '../documents/letters/letters.service';
import { buildDocx, docxBlocks, type Block } from '../documents/letters/docx';

type Tx = Prisma.TransactionClient;
const PLATFORM = { organizationId: null, isSuperAdmin: true };

/** Answer 2515: the older offer template's merge fields and the P05 letter fields they became. */
export const TO_LETTER: Readonly<Record<string, string>> = {
  candidateName: 'employee_name',
  jobTitle: 'designation',
  orgName: 'company_name',
  recruiterName: 'signatory_name',
  compensation: 'offer_ctc',
  startDate: 'joining_date',
  offerExpiry: 'offer_expiry',
  offerLink: 'offer_link',
};
const FROM_LETTER: Readonly<Record<string, string>> = { ...Object.fromEntries(Object.entries(TO_LETTER).map(([k, v]) => [v, k])), first_name: 'candidateName', legal_entity: 'orgName' };
const SUBJECT = /^Subject:\s*/;

/** An older offer template's subject and body as letter paragraphs: a bold subject line, then one paragraph per line. */
export function offerTemplateBlocks(subject: string, body: string): Block[] {
  const convert = (s: string) =>
    s
      .replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (m, k: string) => (TO_LETTER[k] ? `\u0000${TO_LETTER[k]}\u0001` : m))
      // Anything else in double braces was plain text to the old renderer; in a letter it would be a field, so the braces go.
      .replace(/\{\{/g, '{')
      .replace(/\}\}/g, '}')
      .replace(/\u0000/g, '{{')
      .replace(/\u0001/g, '}}');
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  return [{ runs: [{ text: `Subject: ${convert(subject.trim())}`, bold: true }] }, { runs: [{ text: '' }] }, ...lines.map((l) => ({ runs: [{ text: convert(l) }] }))];
}

/**
 * A letter's paragraphs as the email subject and body the current offer send uses ({{candidateName}} etc.), until offers
 * are issued as letters (the next step). The "Subject:" line is the subject; mapped fields go back to the offer fields.
 * shortcut: other letter fields and sections are dropped from the email text; remove once offers are issued as P05 letters.
 */
export function offerEmailText(blocks: Block[]): { subject: string; body: string } {
  const back = (s: string) => s.replace(/\{\{\s*([#^/]?)\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_m, mark: string, f: string) => (!mark && FROM_LETTER[f] ? `{{${FROM_LETTER[f]}}}` : ''));
  const lines = blocks.map((b) => b.runs.map((r) => r.text).join(''));
  const at = lines.findIndex((l) => SUBJECT.test(l));
  const subject = at >= 0 ? back(lines[at].replace(SUBJECT, '')).trim() : '';
  const rest = at >= 0 ? [...lines.slice(0, at), ...lines.slice(at + (lines[at + 1] === '' ? 2 : 1))] : lines;
  return { subject: subject || 'Your offer from {{orgName}} for {{jobTitle}}', body: back(rest.join('\n')).trim() };
}

export type OfferLetterChoice = { value: string; label: string; esign: boolean; subject: string; body: string };

/** HIR-09: the company's switched-on 'offer' letter templates for a job's legal entity (its own first, then company-wide). */
export async function offerLetterChoices(tx: Tx, files: FilesService, org: string, legalEntityId: string | null, id?: string): Promise<OfferLetterChoice[]> {
  const rows = await tx.letterTemplate.findMany({
    where: { organizationId: org, letterType: 'offer', status: 'active', language: 'en', ...(id ? { id } : {}), OR: [{ legalEntityId: null }, ...(legalEntityId ? [{ legalEntityId }] : [])] },
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  });
  const out: OfferLetterChoice[] = [];
  for (const t of rows) {
    const file = await tx.file.findFirst({ where: { organizationId: org, id: t.fileId } });
    if (!file) continue;
    out.push({ value: t.id, label: t.name, esign: t.personSigns, ...offerEmailText(docxBlocks(await files.bytes(file))) });
  }
  return out;
}

/** The offer letter HR picked: switched on, of type 'offer', for the job's entity or the whole company. */
export async function offerLetterChoice(tx: Tx, files: FilesService, org: string, legalEntityId: string | null, id: string): Promise<OfferLetterChoice> {
  const [t] = await offerLetterChoices(tx, files, org, legalEntityId, id);
  if (!t) throw new BadRequestException('Choose one of the company’s offer letters. They are in Settings › Letter templates.');
  return t;
}

/**
 * Answer 2515 (founder, 18 Nov 2026): each older offer template becomes a switched-on P05 'offer' letter template, built
 * with the PPL-29 editor's .docx code: same text, merge fields mapped (TO_LETTER), e-sign → "person signs". It was in use,
 * so it is added switched on with its preview counted as seen (question 2522); "needs approval" is off (offers have their own
 * approval route).
 *
 * A one-off command, never at start-up: `npm run offers:to-letters` in apps/api (after `nest build`). Safe to run again:
 * the old row is claimed (letter_template_id null → the new id) in the same transaction, so it moves once.
 */
@Injectable()
export class OfferTemplatesToLetters {
  private readonly logger = new Logger(OfferTemplatesToLetters.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly letters: LettersService,
    private readonly files: FilesService,
  ) {}

  async run(): Promise<{ moved: number; failed: number }> {
    const left = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const rows = await tx.offerTemplate.findMany({ where: { letterTemplateId: null }, select: { id: true, organizationId: true }, orderBy: [{ organizationId: 'asc' }, { name: 'asc' }] });
      // offer_templates has no foreign key to organizations: a deleted company's leftovers have nowhere to go.
      const live = new Set((await tx.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true } })).map((o) => o.id));
      return rows.filter((r) => live.has(r.organizationId));
    });
    let moved = 0;
    let failed = 0;
    for (const o of left) {
      try {
        const out = await this.tenantPrisma.forTenant({ organizationId: o.organizationId, isSuperAdmin: false }, (tx) => this.moveOne(tx, o.organizationId, o.id));
        if (out) {
          moved++;
          await this.files.scan(o.organizationId, out.fileId);
        }
      } catch (e) {
        failed++;
        this.logger.error(`Offer template ${o.id} could not move: ${(e as Error).message}`);
      }
    }
    return { moved, failed };
  }

  private async moveOne(tx: Tx, org: string, id: string) {
    const o = await tx.offerTemplate.findFirst({ where: { id, organizationId: org, letterTemplateId: null } });
    if (!o) return null;
    const buf = buildDocx(offerTemplateBlocks(o.subject, o.body));
    const c = { organizationId: org, isSuperAdmin: false, userId: null };
    const name = o.name.trim().slice(0, 100) || 'Offer letter';
    // HR already switched on a Letters offer template of this name: the moved one waits as a draft for HR to choose.
    const taken = await tx.letterTemplate.count({ where: { organizationId: org, letterType: 'offer', name, legalEntityId: null, language: 'en', status: 'active' } });
    const made = await this.letters.insertTemplate(tx, c, {
      letterType: 'offer',
      name,
      legalEntityId: null,
      requiresApproval: false,
      personSigns: o.esign,
      companyDsc: false,
      onePerPerson: false,
      source: 'editor',
      fileName: 'offer.docx',
      buf,
      fields: this.letters.checkTemplate(buf),
      status: taken ? 'draft' : 'active',
      // The text was already in use as the company's offer letter, so it counts as seen (by the system: no person named).
      previewViewedAt: taken ? undefined : new Date(),
    });
    // The claim: a second run (or a second server) finds it taken and the whole move rolls back.
    const claimed = await tx.offerTemplate.updateMany({ where: { id, organizationId: org, letterTemplateId: null }, data: { letterTemplateId: made.t.id } });
    if (claimed.count !== 1) throw new Error('already moved');
    await AuditService.recordIn(tx, c, { actorUserId: null, action: 'offer_template.moved_to_letters', entityType: 'offer_template', entityId: id, metadata: { letterTemplateId: made.t.id, version: made.t.version, personSigns: o.esign } });
    return { fileId: made.fileId };
  }
}
