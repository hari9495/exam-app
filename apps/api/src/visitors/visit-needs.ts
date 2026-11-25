import { createHash } from 'crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { noticeVersion } from './visitor-rules';
import { NDA_VALID_DAYS, personKey, policyText } from './walkin-rules';

// Answer 606: what a visitor reads and accepts before entry: the location's notice, and the visitor type's NDA and
// safety induction (the Policies module's published versions). An NDA counts for a year for the same person and company;
// the induction is every visit. Used by the visitor's link (T9-14), the kiosk and the reception desk alike.

export type Doc = { policyId: string; versionId: string; title: string; text: string; sha: string };
export type Needs = { notice: { text: string; version: string }; nda: Doc | null; induction: Doc | null };
export type Accepted = { noticeVersion: string; ndaVersionId?: string | null; inductionVersionId?: string | null };

async function doc(tx: Tx, org: string, policyId: string | null): Promise<Doc | null> {
  if (!policyId) return null;
  const ver = await tx.policyVersion.findFirst({ where: { organizationId: org, policyId, status: 'published' }, orderBy: { number: 'desc' } });
  const pol = await tx.policyDocument.findFirst({ where: { organizationId: org, id: policyId }, select: { title: true } });
  if (!ver || !pol) return null;
  return { policyId, versionId: ver.id, title: pol.title, text: policyText(ver.bodyHtml), sha: ver.bodySha256 ?? createHash('sha256').update(ver.bodyHtml).digest('hex') };
}

export async function visitNeeds(tx: Tx, c: CompanyContext, setting: (key: 'visitors.notice', locationId: string) => Promise<string>, locationId: string, typeId: string | null, mobile: string | null, company: string | null, newVisit = false): Promise<Needs> {
  const text = (await setting('visitors.notice', locationId)).trim();
  // Answer 794: an archived type stays on its old visits; a new visit cannot take it.
  const type = typeId ? await tx.visitorType.findFirst({ where: { organizationId: c.organizationId, id: typeId, ...(newVisit ? { archivedAt: null } : {}) } }) : null;
  if (typeId && !type) throw new NotFoundException('Visitor type not found.');
  let nda = await doc(tx, c.organizationId, type?.ndaPolicyId ?? null);
  if (nda && mobile) {
    const since = new Date(Date.now() - NDA_VALID_DAYS * 86_400_000);
    const signed = await tx.visitAcknowledgement.findFirst({ where: { organizationId: c.organizationId, personKey: personKey(c.organizationId, mobile, company), kind: 'nda', policyId: nda.policyId, acknowledgedAt: { gte: since } }, select: { id: true } });
    if (signed) nda = null;
  }
  return { notice: { text, version: noticeVersion(text) }, nda, induction: await doc(tx, c.organizationId, type?.inductionPolicyId ?? null) };
}

/** Every required text was accepted at the version shown (a policy published meanwhile is read again). */
export function checkAccepted(n: Needs, input: Accepted) {
  if (input.noticeVersion !== n.notice.version) throw new ConflictException('The visitor notice changed. Read it again.');
  if (n.nda && input.ndaVersionId !== n.nda.versionId) throw new ConflictException(`Read and accept ${n.nda.title} first.`);
  if (n.induction && input.inductionVersionId !== n.induction.versionId) throw new ConflictException(`Read and accept ${n.induction.title} first.`);
}

export async function acknowledge(tx: Tx, c: CompanyContext, visitId: string, n: Needs, mobile: string, company: string | null, via: 'link' | 'kiosk' | 'desk') {
  const key = personKey(c.organizationId, mobile, company);
  for (const [kind, d] of [['nda', n.nda], ['induction', n.induction]] as const) {
    if (d) await tx.visitAcknowledgement.create({ data: { organizationId: c.organizationId, visitId, kind, policyId: d.policyId, versionId: d.versionId, bodySha256: d.sha, personKey: key, via } });
  }
}

/** Has this visit's induction (and the NDA, unless still valid) been accepted already (on the link)? */
export async function acceptedFor(tx: Tx, c: CompanyContext, visitId: string, n: Needs) {
  const rows = await tx.visitAcknowledgement.findMany({ where: { organizationId: c.organizationId, visitId }, select: { kind: true, versionId: true } });
  return {
    nda: !n.nda || rows.some((r) => r.kind === 'nda' && r.versionId === n.nda!.versionId),
    induction: !n.induction || rows.some((r) => r.kind === 'induction' && r.versionId === n.induction!.versionId),
  };
}

/** What is still to accept for this visit (what was accepted on the link is not asked again on the same visit). */
export async function outstanding(tx: Tx, c: CompanyContext, visitId: string, n: Needs): Promise<Needs> {
  const done = await acceptedFor(tx, c, visitId, n);
  return { ...n, nda: done.nda ? null : n.nda, induction: done.induction ? null : n.induction };
}

export const needsView = (n: Needs) => {
  const d = (x: Doc | null) => (x ? { title: x.title, text: x.text, versionId: x.versionId } : null);
  return { notice: n.notice, nda: d(n.nda), induction: d(n.induction) };
};
