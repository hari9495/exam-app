import type { Prisma } from '@prisma/client';

/**
 * Answer 1972: every column that holds a stored file (a FileStore ref "s3:"/"local:", or a URL in our blob container),
 * so deleting a company drops each one's files. FileStore.drop handles all three kinds and leaves anything that is not
 * ours alone. `via` reaches a table without organization_id through the company table it belongs to.
 * The company-deletion e2e test lists every column whose name looks like a file and fails on one not named here or in
 * NOT_STORED_FILES, so a new file column cannot be missed.
 */
export const STORED_FILE_COLUMNS: readonly { table: string; column: string; via?: string }[] = [
  { table: 'actuarial_census_exports', column: 'file_ref' },
  { table: 'actuarial_valuations', column: 'report_ref' },
  { table: 'agency_submissions', column: 'resume_path' },
  { table: 'audit_archives', column: 'file_ref' },
  { table: 'bias_audits', column: 'report_path' },
  { table: 'candidate_profiles', column: 'resume_path' },
  { table: 'company_exports', column: 'file_ref' },
  { table: 'consultant_certificates', column: 'file_ref' },
  { table: 'consultant_invoices', column: 'file_ref' },
  { table: 'exchange_files', column: 'file_ref' },
  { table: 'files', column: 'storage_ref' },
  { table: 'letter_issues', column: 'signature_ref' },
  { table: 'offers', column: 'pdf_path' },
  { table: 'organizations', column: 'logo_path', via: 'WHERE x.id = $1::uuid' },
  { table: 'organizations', column: 'careers_banner_path', via: 'WHERE x.id = $1::uuid' },
  { table: 'pay_documents', column: 'file_ref' },
  { table: 'pay_documents', column: 'signature_ref' },
  { table: 'questions', column: 'image_url' },
  { table: 'sd_attachments', column: 'blob_key' },
  { table: 'sd_chat_files', column: 'blob_key' },
  { table: 'sd_inbound_emails', column: 'raw_blob_key' },
  { table: 'sd_request_documents', column: 'blob_key' },
  { table: 'sd_request_documents', column: 'signed_blob_key' },
  { table: 'statutory_registers', column: 'file_ref' },
  { table: 'statutory_registers', column: 'signature_ref' },
  { table: 'tax_certificates', column: 'part_a_ref' },
  { table: 'users', column: 'avatar_path' },
  { table: 'visits', column: 'photo_path' },
  // Tables without organization_id: reached through the company's exams and questions.
  { table: 'face_enrolments', column: 'reference_image_path', via: 'JOIN attempts a ON a.id = x.attempt_id JOIN exams e ON e.id = a.exam_id WHERE e.organization_id = $1::uuid' },
  { table: 'results', column: 'certificate_path', via: 'JOIN attempts a ON a.id = x.attempt_id JOIN exams e ON e.id = a.exam_id WHERE e.organization_id = $1::uuid' },
  { table: 'question_options', column: 'image_url', via: 'JOIN questions q ON q.id = x.question_id WHERE q.organization_id = $1::uuid' },
  // Proctoring pictures are URLs inside the event's metadata (snapshot, screenshot).
  { table: 'proctoring_events', column: 'metadata_json', via: 'JOIN attempts a ON a.id = x.attempt_id JOIN exams e ON e.id = a.exam_id WHERE e.organization_id = $1::uuid' },
];

/** Columns whose names look like a file but hold something else (why, in a word or two). */
export const NOT_STORED_FILES: Readonly<Record<string, string>> = {
  'approval_requests.chain_snapshot_json': 'approval chain copy',
  'arrears_worksheets.source_ref': 'record id',
  'asset_assignments.ack_evidence': 'click evidence (time, IP)',
  'assistant_conversations.ticket_ref': 'ticket number',
  'attempts.section_snapshot_json': 'exam sections copy',
  'audit_legal_holds.case_ref': 'case number',
  'automation_webhooks.url': 'web address',
  'bias_audits.summary_url': 'public web address',
  'call_outs.client_ref': 'device id',
  'candidate_profiles.resume_scan': 'virus scan result',
  'channel_consents.evidence': 'consent evidence',
  'channel_links.external_ref': 'chat account id',
  'consent_records.evidence': 'consent evidence',
  'consultant_invoices.payment_ref': 'payment id',
  'consultants.bank_verified_ref': 'bank check id',
  'contract_deployments.photo_file_id': 'a files row (dropped with files)',
  'court_orders.order_ref': 'order number',
  'device_backfills.device_ref': 'device id',
  'device_punch_receipts.client_ref': 'device id',
  'email_branding.show_logo': 'yes/no',
  'equity_exercises.payment_ref': 'payment id',
  'ewa_draws.paid_ref': 'payment id',
  'ewa_draws.recovery_ref': 'record id',
  'expense_advances.paid_ref': 'payment id',
  'expense_lines.origin_ref': 'record id',
  'field_visits.client_ref': 'device id',
  'held_punches.device_ref': 'device id',
  'identity_providers.saml_sso_url': 'web address',
  'interviews.meeting_url': 'meeting link',
  'kiosk_face_enrolments.provider_ref': 'face service id',
  'loans.source_ref': 'record id',
  'location_pings.client_ref': 'device id',
  'offers.esign_evidence': 'signing evidence',
  'one_time_pays.source_ref': 'record id',
  'organizations.ai_base_url': 'web address',
  'organizations.embedding_base_url': 'web address',
  'organizations.hris_target_url': 'web address',
  'organizations.webhook_url': 'web address',
  'overpayment_recoveries.origin_ref': 'record id',
  'pay_documents.signature': 'signature text',
  'payslip_lines.source_ref': 'record id',
  'payslips.snapshot_hash': 'checksum',
  'questions.image_alt': 'picture description',
  'recruiting_costs.source_ref': 'record id',
  'sd_agent_drafts.client_ref': 'device id',
  'sd_desks.attachment_max_mb': 'size limit',
  'sd_desks.attachment_types': 'allowed types',
  'sd_doc_templates.needs_signature': 'yes/no',
  'sd_interactions.call_ref': 'phone call id',
  'sd_request_documents.evidence': 'signing evidence',
  'sd_sla_timers.resumed_at': 'time',
  'signatories.signature_file_id': 'a files row (dropped with files)',
  'signature_requests.evidence': 'signing evidence',
  'special_postings.source_ref': 'record id',
  'statutory_penalty_lines.paid_ref': 'payment id',
  'tax_paid_outside.source_ref': 'record id',
  'trip_bookings.provider_ref': 'booking id',
  'user_notifications.link_path': 'link in the app',
  'users.email_signature': 'email text',
};

/** The catalogue pattern the e2e test uses to find columns that look like files. */
export const FILE_LIKE_COLUMN = '(blob|storage|file_ref|_ref$|_url$|url$|_path$|evidence|snapshot|resume|photo|avatar|logo|attachment|image|pdf|recording|audio|video|signature)';

/** Kept tables' files stay with their records, except the pictures cleared from the kept company and user rows. */
const CLEARED_EVEN_IF_KEPT = new Set(['organizations.logo_path', 'organizations.careers_banner_path', 'users.avatar_path']);

type Tx = Prisma.TransactionClient;

/** The company's stored files: those to drop, and those kept with its statutory records. */
export async function companyStoredFiles(tx: Tx, organizationId: string): Promise<{ drop: string[]; kept: string[] }> {
  const retained = new Set((await tx.$queryRaw<{ t: string }[]>`SELECT DISTINCT table_name AS t FROM company_retained_tables()`).map((r) => r.t));
  const drop = new Set<string>();
  const kept = new Set<string>();
  for (const { table, column, via } of STORED_FILE_COLUMNS) {
    // Names come from the fixed list above, never from input.
    const rows = await tx.$queryRawUnsafe<{ v: string | null }[]>(`SELECT x.${column} AS v FROM ${table} x ${via ?? 'WHERE x.organization_id = $1::uuid'} AND x.${column} IS NOT NULL`, organizationId);
    const values = column === 'metadata_json' ? rows.flatMap((r) => pictures(r.v)) : rows.map((r) => r.v!).filter(Boolean);
    const keep = retained.has(table) && !CLEARED_EVEN_IF_KEPT.has(`${table}.${column}`);
    for (const v of values) (keep ? kept : drop).add(v);
  }
  // A file a kept record still points to is never dropped.
  for (const v of kept) drop.delete(v);
  return { drop: [...drop], kept: [...kept] };
}

function pictures(json: string | null): string[] {
  try {
    const m = JSON.parse(json ?? '') as { snapshot?: unknown; screenshot?: unknown };
    return [m.snapshot, m.screenshot].filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}
