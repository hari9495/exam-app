// Settings map · Group 5 · Documents & Communication (pages 5.1–5.9) and Group 6 · Hiring & Assessments (pages 6.1–6.5), APX-D §3.
// Sources: P05 Q1–Q8, P04 Q1–Q8, M08 Q1/Q2/Q6, M09 Q1–Q8, M10 Q1–Q8 + E17, P09 Q3, M06 Q1–Q8, M07 Q2–Q8,
// T01 Q2–Q7, T02 Q4–Q7, T03 Q1–Q7, T04 Q1–Q8, T05 Q1–Q9, P23 (policy writer, manager coach, review assistant).
// Plain data only. Sample company: Kaveri Foods Pvt Ltd.
import type { SettingsGroupDef, SettingsPageDef } from './settings-types';

const INHERITED = 'Inherited from Kaveri Foods Pvt Ltd';

/* ======================= GROUP 5 · Documents & Communication ======================= */

/* ---------------- 5.1 Document types ---------------- */
const documentTypes: SettingsPageDef = {
  id: '5.1',
  group: 5,
  title: 'Document types',
  summary:
    'Each document type sets its own sensitivity, whether HR must verify it, expiry reminders and how long it is kept. Every uploaded document takes these from its type.',
  owner: ['P05'],
  permission: 'documents.settings.manage',
  permissionHolder: 'HR admins and System admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Document types',
      description: 'YukthiX starter types plus your own. Sensitivity decides who can see the file: Internal, the employee and all HR; Confidential, the employee and HR admins; Special, the employee and named HR people only.',
      settings: [
        {
          key: 'doc.types',
          label: 'Document types',
          kind: 'list',
          columns: ['Type', 'Sensitivity', 'HR verifies', 'Expiry reminder', 'Kept for'],
          rows: [
            ['PAN card', 'Confidential', 'Yes', '—', 'Exit + 8 years'],
            ['Aadhaar (masked)', 'Special', 'Yes', '—', 'Exit + 8 years'],
            ['Bank proof', 'Confidential', 'Yes', '—', 'Exit + 8 years'],
            ['Education certificate', 'Internal', 'Yes', '—', 'Exit + 8 years'],
            ['Passport', 'Confidential', 'No', '90 days before', 'Exit + 3 years'],
            ['FSSAI food handler certificate', 'Internal', 'Yes', '30 days before', 'Exit + 3 years'],
          ],
          addLabel: 'Add document type',
          helper: 'Set "HR verifies" per type. PAN, Aadhaar, bank proof, education and experience proofs are always verified before payroll, bank payouts or filings.',
          starter: true,
          scope: 'Company',
          synonyms: ['document registry', 'id proof', 'kyc', 'document verification', 'verify pan'],
        },
        { key: 'doc.medical_certificate', label: 'Medical certificate', kind: 'law', value: 'Special · HR verifies · kept with the leave record', law: 'YukthiX rule YX-DOC-18: approvers see only "certificate attached · verified / pending"', synonyms: ['sick note', 'doctor certificate'] },
        { key: 'doc.who_uploads', label: 'Who may upload by default', kind: 'radio', value: 'Employee and HR', options: ['Employee and HR', 'HR only'], helper: 'Each type can override this.', starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Verification',
      settings: [
        { key: 'doc.auto_checks', label: 'Automatic partner checks (PAN verification, bank penny-drop)', kind: 'toggle', value: true, helper: 'A passed check marks the document verified. A failed check goes to HR.', starter: true, scope: INHERITED, synonyms: ['penny drop', 'pan check'] },
        { key: 'doc.unverified_payroll_check', label: 'Flag unverified documents in the payroll pre-run check', kind: 'toggle', value: true, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Expiry',
      settings: [
        { key: 'doc.expiry_reminder_days', label: 'Default expiry reminder', kind: 'number', value: 30, unit: 'days before', min: 1, max: 365, starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant', value: 45 }], helper: 'Hosur plant gets longer, because food handler certificates take longer to renew there.', synonyms: ['expiring documents', 'renewal reminder'] },
        { key: 'doc.expiry_notify', label: 'Notify on expiry', kind: 'multiselect', value: ['Employee', 'HR'], options: ['Employee', 'Manager', 'HR'], starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Retention',
      description: 'A daily job removes documents after their retention period unless a legal hold is set. Every deletion is logged.',
      settings: [
        { key: 'doc.retention.payroll_records', label: 'Payslips, Form 16 and payroll records', kind: 'number', value: 8, unit: 'years', legal: { value: 8, statute: 'Income-tax Act, 2025 (retention of books and records)' }, dated: { validFrom: '2026-04-01' }, scope: 'Company', synonyms: ['record keeping', 'how long we keep payslips'] },
        { key: 'doc.retention.id_copies', label: 'ID and bank copies after exit', kind: 'number', value: 8, unit: 'years after exit', min: 1, max: 10, dated: { validFrom: '2026-04-01' }, scope: INHERITED },
        { key: 'doc.retention.after_expiry', label: 'At the end of retention', kind: 'radio', value: 'Delete the file, keep an anonymised entry', options: ['Delete the file, keep an anonymised entry', 'Delete the file and the entry'], starter: true, scope: INHERITED, synonyms: ['purge', 'data deletion'] },
        { key: 'doc.retention.candidate', label: 'Candidate documents', kind: 'link', linkScreenId: 'HIR-05', linkLabel: 'Set candidate retention in Hiring', helper: 'Candidate data follows the hiring retention in months.' },
        { key: 'doc.legal_hold', label: 'Legal hold stops deletion', kind: 'law', value: 'On', law: 'YukthiX rule: a document under legal hold is never deleted, whatever its retention' },
      ],
    },
  ],
  lastChange: {
    by: 'Lakshmi Venkatesan',
    role: 'HR Business Partner',
    at: '2026-08-11T14:20',
    what: 'Added FSSAI food handler certificate as a verified type with a 30-day expiry reminder',
  },
  related: [
    { label: 'Document verification queue', screenId: 'PPL-27' },
    { label: 'My documents & letters', screenId: 'PPL-30' },
    { label: 'Audit log', screenId: 'PLT-16' },
  ],
  note: 'Retention minimums come from the law. You can keep documents longer, never shorter.',
};

/* ---------------- 5.2 Letters ---------------- */
const letters: SettingsPageDef = {
  id: '5.2',
  group: 5,
  title: 'Letters',
  summary:
    'Letter types, which need approval before issue, which carry a QR code for verification, which employees can get instantly, reference number prefixes, letterheads and templates.',
  owner: ['P05'],
  permission: 'letters.settings.manage',
  permissionHolder: 'HR admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Letter types',
      description: 'The starter library has 90 templates. Your copies are never overwritten by starter updates.',
      settings: [
        {
          key: 'letter.types',
          label: 'Letter types',
          kind: 'list',
          columns: ['Letter type', 'Approval', 'QR verification', 'Self-service', 'Reference prefix'],
          rows: [
            ['Offer letter', 'Required', 'On', 'No', 'KFL/OFR'],
            ['Appointment letter', 'Required', 'On', 'No', 'KFL/APT'],
            ['Relieving letter', 'Required', 'On', 'No', 'KFL/REL'],
            ['Warning / show-cause', 'Required', 'Off', 'No', 'KFL/DSC'],
            ['Salary certificate', 'Instant', 'On', 'Yes', 'KFL/SAL'],
            ['Address proof', 'Instant', 'On', 'Yes', 'KFL/ADR'],
          ],
          addLabel: 'Add letter type',
          helper: 'Approvals follow the approval policy for letters. QR verification is on for every type by default; the public page shows only company, letter type, employee name, issue date and status. Self-service letters are generated instantly with the signatory image and QR code.',
          starter: true,
          scope: 'Company',
          synonyms: ['letter library', 'hr letters', 'letter approval', 'qr code', 'verify letter', 'salary certificate', 'self service letter', 'noc'],
        },
      ],
    },
    {
      title: 'Reference numbers and letterheads',
      settings: [
        { key: 'letter.ref_format', label: 'Reference number format', kind: 'text', value: 'KFL/{type}/{yyyy}/{seq:4}', refPattern: true, helper: '{type} is the letter prefix, {yyyy} the year, {seq:4} a 4-digit running number. No gaps, per legal entity and letter type.', dated: { validFrom: '2026-04-01' }, scope: 'Company', overrides: [{ scope: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', value: 'KFTN/{type}/{yyyy}/{seq:4}' }], synonyms: ['letter number', 'reference prefix'] },
        {
          key: 'letter.letterheads',
          label: 'Letterheads',
          kind: 'list',
          columns: ['Legal entity', 'Letterhead', 'Footer', 'Languages'],
          rows: [
            ['Kaveri Foods Pvt Ltd', 'Bengaluru head office, blue', 'CIN, registered address', 'English, Hindi'],
            ['Kaveri Foods Pvt Ltd (Tamil Nadu)', 'Chennai office, blue', 'CIN, registered address', 'English, Tamil'],
            ['Kaveri Foods Pvt Ltd (Tamil Nadu)', 'Hosur plant', 'Factory licence number', 'English, Tamil'],
          ],
          addLabel: 'Add letterhead',
          synonyms: ['letter head', 'logo on letters'],
        },
        { key: 'letter.pdfa', label: 'Save archival letters as PDF/A', kind: 'toggle', value: true, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Templates',
      settings: [
        { key: 'letter.templates', label: 'Letter templates', kind: 'link', linkScreenId: 'PPL-29', linkLabel: 'Open letter templates', helper: 'Upload your own Word letter with placeholders or use the in-app editor. A sample preview must be viewed before a template goes live.', synonyms: ['word template', 'docx', 'merge fields'] },
        { key: 'letter.missing_fields', label: 'Missing required fields stop generation', kind: 'law', value: 'On', law: 'YukthiX rule YX-DOC-07: no silent blanks; the issuer sees the list of missing fields' },
      ],
    },
  ],
  lastChange: {
    by: 'Lakshmi Venkatesan',
    role: 'HR Business Partner',
    at: '2026-07-22T11:40',
    what: 'Switched off QR verification for warning / show-cause letters',
  },
  related: [
    { label: 'Letter templates', screenId: 'PPL-29' },
    { label: 'Issue letter and issued letters register', screenId: 'PPL-28' },
    { label: 'Approval policy editor', screenId: 'PLT-12' },
  ],
  note: 'Issued letters cannot be edited. A correction issues a new letter that supersedes the old one.',
};

/* ---------------- 5.3 Signatories & e-sign ---------------- */
const signatories: SettingsPageDef = {
  id: '5.3',
  group: 5,
  title: 'Signatories & e-sign',
  summary:
    'Who signs letters for each legal entity, the company digital signature, how employees accept letters, and which letter types use Aadhaar eSign.',
  owner: ['P05'],
  permission: 'letters.signatories.manage',
  permissionHolder: 'HR admins and System admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Authorised signatories',
      settings: [
        {
          key: 'esign.signatories',
          label: 'Authorised signatories',
          kind: 'list',
          columns: ['Name', 'Designation', 'Legal entity', 'Letter types', 'Signature image', 'DSC'],
          rows: [
            ['Ramesh Iyer', 'Director, HR', 'Kaveri Foods Pvt Ltd', 'All letters', 'Uploaded', 'Class 3, valid to Mar 2028'],
            ['Lakshmi Venkatesan', 'HR Business Partner', 'Kaveri Foods Pvt Ltd', 'Certificates, NOC', 'Uploaded', '—'],
            ['S. Meenakshi', 'Plant HR Manager', 'Kaveri Foods Pvt Ltd (Tamil Nadu)', 'All letters', 'Uploaded', 'Class 3, valid to Nov 2027'],
            ['Anand Rao', 'Chief Financial Officer', 'Kaveri Foods Pvt Ltd', 'Form 16', 'Uploaded', 'Class 3, valid to Jan 2028'],
          ],
          addLabel: 'Add signatory',
          sensitive: true,
          synonyms: ['signing authority', 'signature'],
        },
        { key: 'esign.signature_image_use', label: 'Signature images can be used only by permitted issuers', kind: 'law', value: 'On', law: 'YukthiX rule: a signature image is placed only by users allowed to issue that letter type' },
      ],
    },
    {
      title: 'Company digital signature (DSC)',
      settings: [
        { key: 'esign.dsc_types', label: 'Letters signed with the company DSC', kind: 'multiselect', value: ['Relieving', 'Experience', 'Form 16'], options: ['Appointment', 'Relieving', 'Experience', 'Full & final', 'Form 16', 'Salary certificate'], starter: true, scope: 'Company', synonyms: ['dsc', 'digital signature certificate', 'pades'] },
        { key: 'esign.dsc_expiry_reminder', label: 'Remind before a DSC expires', kind: 'number', value: 30, unit: 'days before', min: 7, max: 90, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Employee acceptance and Aadhaar eSign',
      settings: [
        { key: 'esign.accept_method', label: 'Employee acceptance method', kind: 'radio', value: 'Click to accept with OTP', options: ['Click to accept with OTP', 'Aadhaar eSign where enabled, otherwise OTP'], helper: 'OTP evidence (time, IP, device, channel, document hash) is sealed into the PDF.', starter: true, scope: 'Company', synonyms: ['accept offer', 'otp sign', 'click to accept'] },
        { key: 'esign.otp_channel', label: 'OTP sent to', kind: 'radio', value: 'Mobile, email as fallback', options: ['Mobile, email as fallback', 'Email only', 'Mobile only'], starter: true, scope: INHERITED },
        { key: 'esign.aadhaar_types', label: 'Letter types that use Aadhaar eSign', kind: 'multiselect', value: ['Appointment'], options: ['Offer', 'Appointment', 'NDA', 'Training bond', 'Retention bonus agreement'], helper: 'Paid add-on through a licensed eSign provider. Each signature is billed.', availability: 'Aadhaar eSign add-on', scope: 'Company', synonyms: ['aadhaar esign', 'legal signature'] },
        { key: 'esign.aadhaar_law', label: 'Aadhaar eSign validity', kind: 'law', value: 'Electronic signature under the Second Schedule', law: 'Information Technology Act, 2000 s.3A' },
        { key: 'esign.signing_order', label: 'Signing order for two-party letters', kind: 'radio', value: 'Company signs first, then employee accepts', options: ['Company signs first, then employee accepts', 'Employee accepts first, then company signs'], starter: true, scope: INHERITED },
      ],
    },
  ],
  lastChange: {
    by: 'Arjun Kulkarni',
    role: 'System Admin',
    at: '2026-06-18T16:05',
    what: 'Renewed the DSC for S. Meenakshi (Tamil Nadu entity) to Nov 2027',
  },
  related: [
    { label: 'Issued letters register', screenId: 'PPL-28' },
    { label: 'Letter templates', screenId: 'PPL-29' },
  ],
  note: 'Changing a signatory needs re-authentication.',
};

/* ---------------- 5.4 Notifications ---------------- */
const notifications: SettingsPageDef = {
  id: '5.4',
  group: 5,
  title: 'Notifications',
  summary:
    'Which channels are used, what field staff get by default, the email sender, editable email and in-app wording, digests and default quiet hours.',
  owner: ['P04'],
  permission: 'notifications.settings.manage',
  permissionHolder: 'HR admins and System admins',
  scopes: ['Company', 'Legal entity', 'Location', 'Employment type'],
  sections: [
    {
      title: 'Channels and defaults',
      description: 'Employees can change their own channel choices, except for mandatory notifications.',
      settings: [
        { key: 'ntf.channels', label: 'Channels switched on', kind: 'multiselect', value: ['In-app', 'Push', 'Email', 'WhatsApp', 'SMS'], options: ['In-app', 'Push', 'Email', 'WhatsApp', 'SMS', 'Chat app'], scope: 'Company', synonyms: ['notification channel', 'alerts'] },
        { key: 'ntf.field_staff', label: 'Who counts as field staff', kind: 'multiselect', value: ['Hosur plant', 'Employment type: Worker', 'Department: Sales'], options: ['Hosur plant', 'Chennai office', 'Bengaluru head office', 'Employment type: Worker', 'Employment type: Trainee', 'Department: Sales'], helper: 'Field staff get in-app, push and WhatsApp; email is off for them by default.', scope: 'Company', synonyms: ['shop floor', 'blue collar', 'no email'] },
        { key: 'ntf.email_field_staff', label: 'Email for field staff', kind: 'toggle', value: false, starter: true, scope: INHERITED },
        { key: 'ntf.whatsapp_key_events', label: 'Events also sent on WhatsApp', kind: 'multiselect', value: ['Approval requests to managers', 'Request outcomes', 'Payslip ready', 'Check-in reminders'], options: ['Approval requests to managers', 'Request outcomes', 'Payslip ready', 'Check-in reminders', 'Shift changes', 'Announcements'], helper: 'Needs a connected WhatsApp number (WhatsApp & SMS).', starter: true, scope: INHERITED },
        { key: 'ntf.default_language', label: 'Default language for employee messages', kind: 'radio', value: 'English', options: ['English', 'Hindi', 'Tamil', 'Telugu'], helper: 'Each employee can pick their own. Fallback is this default, then English.', scope: 'Company', overrides: [{ scope: 'Hosur plant', value: 'Tamil' }], synonyms: ['language', 'tamil', 'hindi'] },
        { key: 'ntf.external_safe', label: 'No confidential values outside the app', kind: 'law', value: 'On', law: 'YukthiX rule YX-NTF-04: email, WhatsApp, SMS and push say what happened and link into the app', synonyms: ['salary in email', 'privacy'] },
      ],
    },
    {
      title: 'Email sender and wording',
      settings: [
        { key: 'ntf.email_from_name', label: 'Sender name', kind: 'text', value: 'Kaveri Foods HR', scope: 'Company', synonyms: ['from name'] },
        { key: 'ntf.email_from_address', label: 'Sender address', kind: 'text', value: 'hr-notifications@kaverifoods.in', helper: 'Replies go to the reply-to address.', status: { tone: 'success', text: 'Verified' }, scope: 'Company', sensitive: true, synonyms: ['from address', 'email domain'] },
        { key: 'ntf.email_reply_to', label: 'Reply-to address', kind: 'text', value: 'hrhelp@kaverifoods.in', status: { tone: 'success', text: 'Verified' }, scope: 'Company' },
        { key: 'ntf.templates', label: 'Email and in-app wording', kind: 'link', linkScreenId: 'PLT-13', linkLabel: 'Edit notification wording', helper: 'Typed variables, preview, test send and reset to default.', synonyms: ['notification template', 'email text'] },
      ],
    },
    {
      title: 'Digests and quiet hours',
      settings: [
        { key: 'ntf.digest', label: 'Daily digest for managers', kind: 'toggle', value: true, starter: true, scope: INHERITED, synonyms: ['summary email'] },
        { key: 'ntf.digest_time', label: 'Digest time', kind: 'time', value: '08:30', starter: true, scope: INHERITED, showWhen: { key: 'ntf.digest', equals: true } },
        { key: 'ntf.digest_types', label: 'Grouped into the digest', kind: 'multiselect', showWhen: { key: 'ntf.digest', equals: true }, value: ['Pending approvals', 'Team leave today', 'Missing punches'], options: ['Pending approvals', 'Team leave today', 'Missing punches', 'Birthdays and anniversaries', 'Engage activity'], starter: true, scope: INHERITED },
        { key: 'ntf.quiet_start', label: 'Quiet hours start', kind: 'time', value: '21:00', helper: 'In the recipient’s time zone. Push, WhatsApp and SMS are held; in-app is unaffected.', starter: true, scope: 'Company', synonyms: ['do not disturb', 'night'] },
        { key: 'ntf.quiet_end', label: 'Quiet hours end', kind: 'time', value: '08:00', starter: true, scope: 'Company' },
        { key: 'ntf.quiet_bypass', label: 'Urgent types that ignore quiet hours', kind: 'multiselect', value: ['Security alerts', 'Same-day shift changes', 'Shift reminders for night-shift staff'], options: ['Security alerts', 'Same-day shift changes', 'Shift reminders for night-shift staff', 'Approval requests'], starter: true, scope: INHERITED },
      ],
    },
  ],
  lastChange: {
    by: 'Arjun Kulkarni',
    role: 'System Admin',
    at: '2026-06-09T10:30',
    what: 'Set Tamil as the default message language for Hosur plant',
  },
  related: [
    { label: 'Notification settings and template editor', screenId: 'PLT-13' },
    { label: 'Notifications inbox', screenId: 'PLT-03' },
    { label: 'Jobs & errors', screenId: 'PLT-38' },
  ],
};

/* ---------------- 5.5 WhatsApp & SMS ---------------- */
const whatsappSms: SettingsPageDef = {
  id: '5.5',
  group: 5,
  title: 'WhatsApp & SMS',
  summary:
    'Connect your company’s own WhatsApp Business number, track the status of message templates, request new wording, and register SMS templates on DLT.',
  owner: ['P04'],
  permission: 'notifications.channels.manage',
  permissionHolder: 'System admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'WhatsApp connection',
      settings: [
        { key: 'wa.connection', label: 'Company WhatsApp number', kind: 'text', value: '+91 80 4718 2200', status: { tone: 'success', text: 'Connected' }, locked: 'Each company connects its own number. Conversation charges are billed to your own account.', lockedAction: { label: 'Change number', screenId: 'PLT-13' }, scope: 'Company', sensitive: true, synonyms: ['whatsapp business', 'connect whatsapp'] },
        { key: 'wa.display_name', label: 'Display name', kind: 'text', value: 'Kaveri Foods HR', scope: 'Company' },
        { key: 'wa.fallback', label: 'If WhatsApp fails or is not connected', kind: 'radio', value: 'Send by push, then SMS', options: ['Send by push, then SMS', 'Send by push only', 'Send by email'], starter: true, scope: INHERITED },
        { key: 'wa.consent', label: 'Record opt-in before WhatsApp or SMS messages', kind: 'law', value: 'On', law: 'YukthiX rule YX-NTF-14: a per-recipient channel consent is kept and opt-out is honoured at once' },
      ],
    },
    {
      title: 'Message templates',
      description: 'WhatsApp and SMS wording comes from the YukthiX pre-approved library. New wording is requested here and submitted for approval.',
      settings: [
        {
          key: 'wa.templates',
          label: 'Template library status',
          kind: 'list',
          columns: ['Template', 'Languages', 'WhatsApp', 'SMS (DLT)'],
          rows: [
            ['Approval request', 'EN, HI, TA, TE', 'Approved', 'Registered'],
            ['Payslip ready', 'EN, HI, TA, TE', 'Approved', 'Registered'],
            ['Check-in reminder', 'EN, TA', 'Approved', 'Registered'],
            ['Shift change today', 'EN, TA', 'In review', 'Registered'],
            ['Announcement link', 'EN, HI, TA, TE', 'Approved', 'Not used'],
          ],
          synonyms: ['template approval', 'whatsapp template'],
        },
        {
          key: 'wa.wording_requests',
          label: 'New wording requests',
          kind: 'list',
          columns: ['Requested wording', 'Channel', 'Requested by', 'Status'],
          rows: [
            ['Canteen menu change at Hosur plant', 'WhatsApp', 'Fatima Shaikh', 'Submitted'],
            ['Bus route change reminder', 'SMS', 'Fatima Shaikh', 'Draft'],
          ],
          addLabel: 'Request new wording',
        },
        { key: 'wa.template_editor', label: 'Template preview and test send', kind: 'link', linkScreenId: 'PLT-13', linkLabel: 'Preview message templates' },
      ],
    },
    {
      title: 'SMS and DLT',
      settings: [
        { key: 'sms.dlt_required', label: 'SMS templates must be registered on DLT', kind: 'law', value: 'On', law: 'TRAI Telecom Commercial Communications Customer Preference Regulations, 2018 (TCCCPR)', synonyms: ['dlt', 'sms registration', 'trai'] },
        { key: 'sms.dlt_entity_id', label: 'DLT principal entity ID', kind: 'text', value: '1201160000000054321', scope: 'Company', sensitive: true },
        { key: 'sms.sender_id', label: 'SMS sender ID (header)', kind: 'text', value: 'KAVERI', helper: 'Six letters, registered on DLT.', scope: 'Company', synonyms: ['header', 'sender name'] },
        {
          key: 'sms.dlt_templates',
          label: 'DLT templates',
          kind: 'list',
          columns: ['Template', 'DLT template ID', 'Category', 'Status'],
          rows: [
            ['Login OTP', '1207160000000011111', 'Service implicit', 'Active'],
            ['Payslip ready', '1207160000000011112', 'Service implicit', 'Active'],
            ['Check-in reminder', '1207160000000011113', 'Service implicit', 'Active'],
          ],
          addLabel: 'Add DLT template',
        },
        { key: 'sms.spend_cap', label: 'Monthly SMS spending cap', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Set the SMS cap in Usage & caps' },
      ],
    },
  ],
  lastChange: {
    by: 'Arjun Kulkarni',
    role: 'System Admin',
    at: '2026-06-02T12:10',
    what: 'Connected the company WhatsApp number and submitted the template library',
  },
  related: [
    { label: 'Notification settings and template editor', screenId: 'PLT-13' },
    { label: 'Billing, usage & sandbox', screenId: 'PLT-19' },
  ],
  note: 'Until WhatsApp is connected, key events go by push, SMS or email.',
};

/* ---------------- 5.6 Announcements ---------------- */
const announcements: SettingsPageDef = {
  id: '5.6',
  group: 5,
  title: 'Announcements',
  summary: 'Defaults for company announcements: whether acknowledgement is asked for, how often reminders go, and how long they stay pinned on the mobile Home.',
  owner: ['P04'],
  contributes: ['M09'],
  permission: 'announcements.settings.manage',
  permissionHolder: 'HR admins and Internal Communications',
  scopes: ['Company', 'Legal entity', 'Location'],
  sections: [
    {
      title: 'Acknowledgement',
      settings: [
        { key: 'ann.ack_default', label: 'Ask for acknowledgement by default', kind: 'radio', value: 'Off, announcer can switch on', options: ['Off, announcer can switch on', 'On for every announcement'], starter: true, scope: 'Company', synonyms: ['read receipt', 'acknowledge'] },
        { key: 'ann.reminder_every', label: 'Remind people who have not acknowledged every', kind: 'number', value: 2, unit: 'days', min: 1, max: 14, starter: true, scope: INHERITED },
        { key: 'ann.reminder_max', label: 'Stop after', kind: 'number', value: 3, unit: 'reminders', min: 1, max: 10, starter: true, scope: INHERITED },
        { key: 'ann.escalate_manager', label: 'Tell the manager after the last reminder', kind: 'toggle', value: true, scope: 'Company' },
      ],
    },
    {
      title: 'Placement and channels',
      settings: [
        { key: 'ann.pin_home', label: 'Pin new announcements on mobile Home', kind: 'toggle', value: true, starter: true, scope: 'Company', synonyms: ['pinned', 'home screen'] },
        { key: 'ann.pin_days', label: 'Keep pinned for', kind: 'number', value: 7, unit: 'days', min: 1, max: 30, starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant', value: 3 }], helper: 'Shorter at Hosur plant, where notices change often.', showWhen: { key: 'ann.pin_home', equals: true } },
        { key: 'ann.default_channels', label: 'Default channels', kind: 'multiselect', value: ['In-app', 'Push'], options: ['In-app', 'Push', 'Email', 'WhatsApp'], helper: 'WhatsApp sends a short line with a link only.', starter: true, scope: INHERITED },
        { key: 'ann.announcers', label: 'Who can post announcements', kind: 'link', linkScreenId: 'PLT-11', linkLabel: 'Manage the announcer permission in Roles & access', contributedBy: 'M09' },
      ],
    },
  ],
  lastChange: {
    by: 'Fatima Shaikh',
    role: 'Internal Communications',
    at: '2026-07-08T09:45',
    what: 'Shortened pinning to 3 days for Hosur plant',
  },
  related: [
    { label: 'Announcement composer and tracking', screenId: 'ENG-03' },
    { label: 'Feed', screenId: 'ENG-01' },
  ],
};

/* ---------------- 5.7 Policies ---------------- */
const policies: SettingsPageDef = {
  id: '5.7',
  group: 5,
  title: 'Policies',
  summary:
    'How company policies reach people and how acknowledgement works: audiences, click or OTP, optional quiz, re-acknowledgement on new versions, reminders and escalation, and the AI policy writer.',
  owner: ['M08'],
  contributes: ['P23', 'P05'],
  permission: 'policies.settings.manage',
  permissionHolder: 'HR admins',
  scopes: ['Company', 'Legal entity', 'Location', 'Department'],
  sections: [
    {
      title: 'Audiences and acknowledgement',
      settings: [
        {
          key: 'pol.library',
          label: 'Published policies',
          kind: 'list',
          columns: ['Policy', 'Version', 'Audience', 'Method', 'Acknowledged'],
          rows: [
            ['Code of conduct', '3.0', 'Everyone', 'OTP (critical)', '94 %'],
            ['Prevention of sexual harassment', '2.1', 'Everyone', 'OTP (critical)', '97 %'],
            ['Leave policy', '4.2', 'Everyone', 'Click', '88 %'],
            ['Food safety and hygiene', '1.4', 'Hosur plant', 'Click + quiz', '91 %'],
            ['Travel and expenses', '2.0', 'Sales, Management', 'Click', '76 %'],
          ],
          addLabel: 'Add policy',
          synonyms: ['handbook', 'policy library'],
        },
        { key: 'pol.audience_by', label: 'Target audiences by', kind: 'multiselect', value: ['Legal entity', 'Location', 'Department', 'Designation'], options: ['Legal entity', 'Location', 'Department', 'Designation', 'Employment type', 'Grade'], starter: true, scope: 'Company' },
        { key: 'pol.ack_method', label: 'Default acknowledgement method', kind: 'radio', value: 'Click', options: ['Click', 'OTP'], helper: 'Policies marked critical always use OTP (click-to-accept evidence).', starter: true, scope: 'Company', synonyms: ['acknowledge policy', 'otp acknowledgement'] },
        { key: 'pol.quiz', label: 'Allow a quiz after reading', kind: 'toggle', value: true, helper: 'Quizzes run on the assessment engine.', scope: 'Company' },
        { key: 'pol.quiz_pass', label: 'Quiz pass mark', kind: 'percent', value: 70, min: 0, max: 100, starter: true, scope: INHERITED, showWhen: { key: 'pol.quiz', equals: true } },
        { key: 'pol.reack_major', label: 'Ask everyone again on a major version', kind: 'toggle', value: true, helper: 'Minor versions only notify.', starter: true, scope: INHERITED, synonyms: ['re-acknowledge', 'new version'] },
        { key: 'pol.posh_display', label: 'Prevention of sexual harassment policy published to everyone', kind: 'law', value: 'Required', law: 'Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 s.19(b)', synonyms: ['posh policy'] },
      ],
    },
    {
      title: 'Reminders and escalation',
      settings: [
        { key: 'pol.reminder_every', label: 'Remind every', kind: 'number', value: 3, unit: 'days', min: 1, max: 14, starter: true, scope: INHERITED },
        { key: 'pol.escalate_manager_after', label: 'Escalate to the manager after', kind: 'number', value: 7, unit: 'days', min: 1, max: 60, starter: true, scope: INHERITED, atMost: 'pol.escalate_hr_after', synonyms: ['overdue acknowledgement'] },
        { key: 'pol.escalate_hr_after', label: 'Escalate to HR after', kind: 'number', value: 14, unit: 'days', min: 1, max: 90, starter: true, scope: INHERITED },
        { key: 'pol.joiner_due', label: 'Joiners acknowledge within', kind: 'number', value: 7, unit: 'days of joining', min: 1, max: 60, helper: 'Added as onboarding tasks.', scope: 'Company' },
        { key: 'pol.feed_helpdesk_ai', label: 'Published policies answer helpdesk questions', kind: 'toggle', value: true, availability: 'Wave 5', scope: 'Company' },
      ],
    },
    {
      title: 'Policy writer (Write with AI)',
      description: 'Drafts policies from a short questionnaire. HR approves every draft; nothing is published automatically. Not legal advice.',
      settings: [
        { key: 'pol.writer_on', label: 'Policy writer', kind: 'toggle', value: true, availability: 'Wave 5', contributedBy: 'P23', scope: 'Company', synonyms: ['write with ai', 'handbook writer', 'draft policy'] },
        { key: 'pol.writer_law_check', label: 'Drafts are checked against law floors', kind: 'law', value: 'On', law: 'YukthiX rule: values below the legal minimum for a state are flagged before approval', contributedBy: 'P23' },
        { key: 'pol.writer_link', label: 'Questionnaire and drafts', kind: 'link', linkScreenId: 'HLP-14', linkLabel: 'Open Write with AI', helper: 'Industry, states and headcount are answered in the questionnaire.', availability: 'Wave 5', contributedBy: 'P23' },
      ],
    },
  ],
  lastChange: {
    by: 'Lakshmi Venkatesan',
    role: 'HR Business Partner',
    at: '2026-09-02T15:30',
    what: 'Published Code of conduct 3.0 as a major version; everyone asked to acknowledge again',
  },
  related: [
    { label: 'Policy admin', screenId: 'HLP-11' },
    { label: 'Policy library', screenId: 'HLP-10' },
    { label: 'Write with AI', screenId: 'HLP-14' },
  ],
};

/* ---------------- 5.8 Helpdesk ---------------- */
const helpdesk: SettingsPageDef = {
  id: '5.8',
  group: 5,
  title: 'Helpdesk',
  summary:
    'Queues and categories for employee tickets, response times by priority, business hours, sensitive categories, macros, the support email address and the knowledge base.',
  owner: ['M08'],
  permission: 'helpdesk.settings.manage',
  permissionHolder: 'HR admins and helpdesk queue leads',
  scopes: ['Company', 'Legal entity', 'Location'],
  sections: [
    {
      title: 'Queues and categories',
      settings: [
        {
          key: 'hd.queues',
          label: 'Queues',
          kind: 'list',
          columns: ['Queue', 'Lead', 'Agents', 'Business hours'],
          rows: [
            ['HR', 'Lakshmi Venkatesan', '4', 'Office hours'],
            ['Payroll', 'Anand Rao', '3', 'Office hours'],
            ['IT', 'Arjun Kulkarni', '5', 'Office hours'],
            ['Plant admin', 'S. Meenakshi', '2', 'Plant shifts'],
          ],
          addLabel: 'Add queue',
          starter: true,
          synonyms: ['ticket queue', 'support team'],
        },
        {
          key: 'hd.categories',
          label: 'Categories',
          kind: 'list',
          columns: ['Category', 'Queue', 'Default priority', 'Sensitive'],
          rows: [
            ['Payslip query', 'Payroll', 'Normal', 'Yes'],
            ['Leave balance', 'HR', 'Low', 'No'],
            ['Laptop or access', 'IT', 'Normal', 'No'],
            ['Medical or health', 'HR', 'High', 'Yes'],
            ['Canteen and transport', 'Plant admin', 'Low', 'No'],
          ],
          addLabel: 'Add category',
          helper: 'Sensitive categories are seen only by that queue’s agents and kept out of AI suggestions.',
          starter: true,
          synonyms: ['private ticket', 'confidential ticket'],
        },
        { key: 'hd.private_tickets', label: 'Employees can mark a ticket private', kind: 'toggle', value: true, helper: 'Private tickets are seen by the assigned agent and queue lead only.', starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Response times',
      settings: [
        {
          key: 'hd.sla',
          label: 'Response times by priority',
          kind: 'list',
          columns: ['Priority', 'First response', 'Resolution'],
          rows: [
            ['Urgent', '2 business hours', '1 business day'],
            ['High', '4 business hours', '2 business days'],
            ['Normal', '1 business day', '3 business days'],
            ['Low', '2 business days', '5 business days'],
          ],
          starter: true,
          dated: { validFrom: '2026-04-01' },
          synonyms: ['sla', 'turnaround time', 'tat'],
        },
        { key: 'hd.days', label: 'Business days', kind: 'multiselect', value: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant', value: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }], synonyms: ['working hours', 'business hours'] },
        { key: 'hd.hours_from', label: 'Opens at', kind: 'time', value: '09:30', starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant', value: '06:00' }] },
        { key: 'hd.hours_to', label: 'Closes at', kind: 'time', value: '18:30', starter: true, scope: 'Company', after: 'hd.hours_from', overrides: [{ scope: 'Hosur plant', value: '22:00' }] },
        { key: 'hd.auto_close', label: 'Close resolved tickets after', kind: 'number', value: 5, unit: 'days without reply', min: 1, max: 30, starter: true, scope: INHERITED },
        { key: 'hd.csat', label: 'Ask for a rating when a ticket is closed', kind: 'toggle', value: true, scope: 'Company' },
      ],
    },
    {
      title: 'Email, macros and knowledge base',
      settings: [
        { key: 'hd.support_email', label: 'Support email address', kind: 'text', value: 'hrhelp@kaverifoods.in', helper: 'Emails become tickets. The sender is matched to the employee.', scope: 'Company', synonyms: ['email to ticket'] },
        {
          key: 'hd.macros',
          label: 'Macros',
          kind: 'list',
          columns: ['Macro', 'Queue', 'Actions'],
          rows: [
            ['Payslip explained', 'Payroll', 'Reply with payslip guide, set Resolved'],
            ['Password reset done', 'IT', 'Reply, set Resolved'],
            ['Need more details', 'All', 'Reply, set Waiting on employee'],
          ],
          addLabel: 'Add macro',
          synonyms: ['canned response', 'saved reply'],
        },
        { key: 'hd.kb', label: 'Knowledge base', kind: 'link', linkScreenId: 'HLP-04', linkLabel: 'Edit knowledge base articles', synonyms: ['faq', 'articles'] },
        { key: 'hd.ai_assistant', label: 'AI assistant answers first', kind: 'toggle', value: false, availability: 'Wave 5', scope: 'Company' },
      ],
    },
  ],
  lastChange: {
    by: 'Lakshmi Venkatesan',
    role: 'HR Business Partner',
    at: '2026-08-26T17:05',
    what: 'Added Plant admin queue with plant shift hours for Hosur plant',
  },
  related: [
    { label: 'Agent desk', screenId: 'HLP-02' },
    { label: 'Response time dashboard', screenId: 'HLP-05' },
    { label: 'Knowledge base editor', screenId: 'HLP-04' },
  ],
  note: 'Grievance, POSH and whistleblower settings are in Employee relations & cases.',
};

/* ---------------- 5.9 Engage ---------------- */
const engage: SettingsPageDef = {
  id: '5.9',
  group: 5,
  title: 'Engage',
  summary:
    'Spaces and who can post, moderation, survey cadence and anonymity, recognition with badges or points, rewards, celebrations and one-way mirrors to your chat app.',
  owner: ['M09'],
  permission: 'engage.settings.manage',
  permissionHolder: 'HR admins and Internal Communications',
  scopes: ['Company', 'Legal entity', 'Location'],
  sections: [
    {
      title: 'Spaces and moderation',
      settings: [
        {
          key: 'eng.spaces',
          label: 'Spaces',
          kind: 'list',
          columns: ['Space', 'Members', 'Who can post'],
          rows: [
            ['Kaveri Foods (company-wide)', 'Everyone', 'Announcers; others after approval'],
            ['Hosur plant', 'Hosur plant', 'Members'],
            ['Sales South', 'Sales department', 'Members'],
            ['Chennai office', 'Chennai office', 'Members'],
          ],
          addLabel: 'Add space',
          starter: true,
          synonyms: ['feed', 'community', 'channel'],
        },
        { key: 'eng.interest_groups', label: 'Employees can create interest groups', kind: 'radio', value: 'With admin approval', options: ['With admin approval', 'Freely', 'Not allowed'], starter: true, scope: 'Company', synonyms: ['clubs', 'groups'] },
        { key: 'eng.moderation_mode', label: 'Moderation mode', kind: 'radio', value: 'Post-moderation', options: ['Post-moderation', 'Pre-approval'], helper: 'Any single space can be switched to pre-approval.', starter: true, scope: 'Company', synonyms: ['moderate posts'] },
        { key: 'eng.blocked_words', label: 'Extra blocked words', kind: 'textarea', value: '', helper: 'One word or phrase per line. Added to the YukthiX list in English, Hindi, Tamil and Telugu.', scope: 'Company', synonyms: ['profanity filter', 'bad words'] },
        { key: 'eng.ai_check', label: 'AI content check', kind: 'toggle', value: false, scope: 'Company' },
        { key: 'eng.report_threshold', label: 'Hide a post after', kind: 'number', value: 3, unit: 'reports', min: 1, max: 20, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Surveys',
      settings: [
        { key: 'eng.pulse_cadence', label: 'Pulse survey', kind: 'radio', value: 'Monthly', options: ['Monthly', 'Quarterly', 'Off'], helper: 'Five rotating questions.', starter: true, scope: 'Company', synonyms: ['pulse', 'engagement survey'] },
        { key: 'eng.enps_cadence', label: 'eNPS survey', kind: 'radio', value: 'Quarterly', options: ['Quarterly', 'Half-yearly', 'Off'], starter: true, scope: 'Company', synonyms: ['enps'] },
        { key: 'eng.engagement_cadence', label: 'Engagement survey', kind: 'radio', value: 'Yearly', options: ['Yearly', 'Off'], starter: true, scope: 'Company' },
        { key: 'eng.anonymity_default', label: 'Default anonymity for pulse, eNPS and engagement', kind: 'radio', value: 'Anonymous', options: ['Anonymous', 'Confidential (named to HR only)'], helper: 'Onboarding, exit and feedback surveys may be named. The mode is locked after launch.', starter: true, scope: INHERITED },
        { key: 'eng.min_group', label: 'Minimum group size to show results', kind: 'number', value: 5, unit: 'responses', min: 3, max: 20, helper: 'Smaller teams roll up to the parent group.', scope: 'Company' },
        { key: 'eng.action_plan_days', label: 'Managers create an action plan within', kind: 'number', value: 30, unit: 'days', min: 7, max: 90, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Recognition and rewards',
      settings: [
        { key: 'eng.recognition_mode', label: 'Recognition mode', kind: 'radio', value: 'Points', options: ['Badges only', 'Points'], dated: { validFrom: '2026-07-01' }, scope: 'Company', synonyms: ['kudos', 'rewards', 'points'] },
        { key: 'eng.manager_budget', label: 'Manager budget per month', kind: 'number', value: 500, unit: 'points', min: 0, dated: { validFrom: '2026-07-01' }, scope: 'Company', showWhen: { key: 'eng.recognition_mode', equals: 'Points' } },
        { key: 'eng.peer_allowance', label: 'Peer allowance per month', kind: 'number', value: 100, unit: 'points', min: 0, dated: { validFrom: '2026-07-01' }, scope: 'Company', showWhen: { key: 'eng.recognition_mode', equals: 'Points' } },
        { key: 'eng.point_value', label: 'Value of one point', kind: 'money', value: 1, dated: { validFrom: '2026-07-01' }, scope: 'Company', showWhen: { key: 'eng.recognition_mode', equals: 'Points' } },
        { key: 'eng.point_expiry', label: 'Points expire after', kind: 'number', value: 12, unit: 'months', min: 0, max: 36, scope: 'Company', showWhen: { key: 'eng.recognition_mode', equals: 'Points' } },
        { key: 'eng.redeem_approval', label: 'Approval needed for redemptions above', kind: 'money', value: 5000, scope: 'Company', showWhen: { key: 'eng.recognition_mode', equals: 'Points' } },
        {
          key: 'eng.catalogue',
          label: 'Reward catalogue',
          kind: 'list',
          columns: ['Reward', 'Points', 'Paid through'],
          rows: [
            ['Shopping voucher ₹500', '500', 'Voucher partner'],
            ['Movie voucher ₹300', '300', 'Voucher partner'],
            ['Cash in next payroll', 'Any', 'Payroll'],
          ],
          addLabel: 'Add reward',
        },
        { key: 'eng.reward_tax', label: 'Rewards are taxed as perquisites', kind: 'law', value: 'On', law: 'Income-tax Act, 2025 (perquisites), withheld through payroll' },
        { key: 'eng.leaderboard', label: 'Show the recognition leaderboard', kind: 'toggle', value: false, scope: 'Company', synonyms: ['leaderboard'] },
      ],
    },
    {
      title: 'Celebrations and mirrors',
      settings: [
        { key: 'eng.celebrations', label: 'Celebrations shown', kind: 'multiselect', value: ['Birthdays (no year)', 'Work anniversaries', 'New joiners', 'Promotions'], options: ['Birthdays (no year)', 'Work anniversaries', 'New joiners', 'Promotions'], helper: 'Each employee can opt out per type. Promotions show only after the letter is issued.', starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant', value: ['Birthdays (no year)', 'Work anniversaries'] }], synonyms: ['birthday', 'anniversary', 'celebration'] },
        { key: 'eng.mirror_chat', label: 'Mirror announcements and celebrations to a chat app channel', kind: 'toggle', value: false, helper: 'One way: text and a link back only.', scope: 'Company', synonyms: ['chat app', 'mirror'] },
        { key: 'eng.mirror_whatsapp', label: 'Send key announcements on WhatsApp', kind: 'toggle', value: true, scope: 'Company' },
      ],
    },
  ],
  lastChange: {
    by: 'Fatima Shaikh',
    role: 'Internal Communications',
    at: '2026-06-24T13:15',
    what: 'Switched recognition to points from 1 Jul 2026 with a 500-point manager budget',
  },
  related: [
    { label: 'Feed and spaces', screenId: 'ENG-01' },
    { label: 'Survey builder', screenId: 'ENG-04' },
    { label: 'Moderation queue', screenId: 'ENG-11' },
    { label: 'Rewards', screenId: 'ENG-10' },
  ],
};

/* ======================= GROUP 6 · Hiring & Assessments ======================= */

/* ---------------- 6.1 Hiring ---------------- */
const hiring: SettingsPageDef = {
  id: '6.1',
  group: 6,
  title: 'Hiring',
  summary:
    'Pipeline and scorecard templates, headcount-plan approvers, offer rules, hand-off to onboarding, background checks, candidate data retention, AI interview, careers site, referral bonuses and recruiting cost categories.',
  owner: ['M10'],
  contributes: ['P09'],
  permission: 'hiring.settings.manage',
  permissionHolder: 'Talent acquisition leads and HR admins',
  scopes: ['Company', 'Legal entity', 'Department'],
  sections: [
    {
      title: 'Pipelines, scorecards and approvals',
      settings: [
        {
          key: 'hire.pipelines',
          label: 'Pipeline templates',
          kind: 'list',
          columns: ['Template', 'Stages', 'Used for'],
          rows: [
            ['Plant worker', 'Applied, Screening, Trade test, Offer, Joined', 'Hosur plant roles'],
            ['Office staff', 'Applied, Screening, Assessment, Interview, Offer, Joined', 'Bengaluru, Chennai'],
            ['Sales', 'Applied, Phone screen, AI interview, Manager round, Offer, Joined', 'Sales roles'],
          ],
          addLabel: 'Add pipeline template',
          // Founder answer 302: each pipeline's stage targets (days target and limit per stage) are edited here.
          rowAction: 'Stage targets',
          starter: true,
          synonyms: ['stages', 'hiring process', 'stage targets', 'days target'],
        },
        {
          key: 'hire.scorecards',
          label: 'Scorecard templates',
          kind: 'list',
          // Founder answer 345: add, edit and archive here (the scorecard template sheet); weights in whole per cent.
          columns: ['Scorecard', 'Skills rated', 'Scale', 'Pass bar'],
          rows: [
            ['Plant technician', 'Machine safety 50 %, Food hygiene 30 %, Teamwork 20 %', '1–4', '2.5'],
            ['Sales executive', 'Communication 40 %, Negotiation 40 %, Territory knowledge 20 %', '1–4', '3'],
            ['Engineering', 'Problem solving 40 %, Code quality 40 %, Collaboration 20 %', '1–5', '3.5'],
          ],
          addLabel: 'Add scorecard',
          helper: 'The skills a panel rates, each with a weight in per cent (adding up to 100), and the pass bar. A scorecard already used is copied when changed, so past interviews keep theirs.',
          starter: true,
          synonyms: ['interview feedback', 'rating form'],
        },
        // Founder answer 291: a hiring manager's request starts with this recruiter, or none; never the manager themselves.
        // Founder answer 348: only people who hold the recruiter key are offered.
        { key: 'hire.default_recruiter', label: 'Default recruiter for new requisitions', kind: 'select', value: 'None', options: ['None', 'Neha Joshi', 'Arjun Kulkarni'], helper: 'A hiring manager’s request starts with this recruiter. Only people with the recruiter key are listed. None: it waits until recruiting assigns one. It is never the manager themselves.', starter: true, scope: 'Company', synonyms: ['recruiter', 'requisition', 'request a hire'] },
        // Founder answer 341: requisitions and the headcount plan, and the hiring manager's view of it.
        { key: 'hire.headcount_plan', label: 'Requisitions and the headcount plan', kind: 'segment', value: 'advisory', options: ['off', 'advisory', 'required'], optionLabels: { off: 'Not used', advisory: 'Advisory', required: 'Required' }, helper: 'Advisory: a requisition outside the plan needs the extra approver. Required: every requisition takes a place from an approved plan. Not used: the plan is not checked.', starter: true, scope: 'Company', synonyms: ['manpower plan', 'outside plan', 'budget'] },
        // Answer 2427 (retiring /v2): who sees which candidates, and the daily reminders to the hiring team.
        { key: 'hire.record_visibility', label: 'Recruiters see only their own candidates', kind: 'toggle', value: false, helper: 'On: a recruiter sees the candidates assigned to them or their groups, and candidates no one is assigned to. Hiring admins and HR see all. Off: every recruiter sees every candidate.', starter: true, scope: 'Company', synonyms: ['record visibility', 'assigned candidates', 'privacy'] },
        { key: 'hire.reminders', label: 'Send the hiring team daily reminders', kind: 'toggle', value: false, helper: 'Once a day: tests waiting to be marked, invitations not taken, offers about to expire, interviews coming up and feedback still owed. Each person can turn their own emails off in their notification settings.', starter: true, scope: 'Company', synonyms: ['reminders', 'nudges', 'daily digest'] },
        // HIR-27 bulk interview day: slot length and how Auto-assign fills the day (company settings).
        { key: 'hire.interview_day_minutes', label: 'Each interview on an interview day lasts', kind: 'segment', value: '45', options: ['30', '45', '60', '90'], optionLabels: { '30': '30 min', '45': '45 min', '60': '1 hour', '90': '1½ hours' }, helper: 'Used for new interview days; a day keeps the length it was planned with.', starter: true, scope: 'Company', synonyms: ['interview day', 'walk-in', 'drive', 'slot length'] },
        { key: 'hire.interview_day_assign', label: 'Auto-assign on an interview day fills', kind: 'segment', value: 'by_slot', options: ['by_slot', 'by_panel'], optionLabels: { by_slot: 'Earliest slots first', by_panel: 'One panel at a time' }, helper: 'Earliest slots first: every panel starts together and candidates finish sooner. One panel at a time: a panel’s slots fill before the next panel is used.', starter: true, scope: 'Company', synonyms: ['interview day', 'walk-in', 'drive'] },
        { key: 'hire.plan_manager_view', label: 'Hiring managers see their department’s headcount plan', kind: 'toggle', value: true, helper: 'Read-only, their own department only. Off: only HR and hiring admins see the plan.', starter: true, scope: 'Company', synonyms: ['manpower plan', 'manager'] },
        { key: 'hire.plan_approvers', label: 'Headcount plan approvers', kind: 'multiselect', value: ['HR head', 'Finance head'], options: ['HR head', 'Finance head', 'CEO', 'Department head'], starter: true, scope: 'Company', synonyms: ['manpower plan', 'budget approval'] },
        { key: 'hire.outside_plan_approver', label: 'Extra approver for outside-plan or over-budget hiring', kind: 'select', value: 'Chief Financial Officer', options: ['Chief Financial Officer', 'Chief Executive Officer', 'Managing Director', 'HR head'], starter: true, scope: 'Company' },
        { key: 'hire.replacement_link', label: 'Replacement hires use the leaver’s plan line', kind: 'toggle', value: true, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Offers and hand-off',
      settings: [
        { key: 'hire.offer_expiry', label: 'Offer expires after', kind: 'number', value: 7, unit: 'days', min: 1, max: 60, starter: true, scope: 'Company', synonyms: ['offer validity'] },
        { key: 'hire.clawback_months', label: 'Joining bonus clawback if the person leaves within', kind: 'number', value: 12, unit: 'months', min: 0, max: 36, scope: 'Company', synonyms: ['clawback', 'joining bonus recovery'] },
        { key: 'hire.range_check', label: 'Offers outside the grade pay range need extra approval', kind: 'toggle', value: true, starter: true, scope: INHERITED },
        // HIR-09 founder answers 332, 334 and 337 (drawn 11 Nov 2026).
        { key: 'hire.band_approver', label: 'Who approves an offer above the grade pay range', kind: 'select', value: 'HR head', options: ['HR head', 'Hiring manager', 'Meenakshi Sundaram'], helper: 'One extra approval step, after the company’s offer route. A named person must be allowed to see offer pay. The person who sends the offer never approves it.', starter: true, scope: 'Company', synonyms: ['band', 'pay range', 'above range', 'extra approval'] },
        { key: 'hire.clawback_basis', label: 'Joining bonus repaid by someone who leaves within the clawback months', kind: 'radio', value: 'All of it', options: ['All of it', 'The part for the months not served'], helper: 'Recovered in the final settlement. A bonus not paid yet is simply not paid.', starter: true, scope: 'Company', synonyms: ['clawback', 'joining bonus recovery'] },
        { key: 'hire.offer_esign', label: 'Offer letters the candidate signs electronically', kind: 'multiselect', value: [], options: ['Offer letter · Engineering', 'Offer letter · Plant'], helper: 'Signed with a one-time code sent to the candidate’s email. Every other letter is accepted by the link in the email.', starter: true, scope: 'Company', synonyms: ['e-sign', 'esign', 'otp', 'accept offer'] },
        { key: 'hire.offer_template', label: 'Offer letter template', kind: 'link', linkScreenId: 'PPL-29', linkLabel: 'Edit offer letter templates' },
        // Founder answer 341: pay transparency choices for new jobs (where no law decides).
        { key: 'hire.pay_range_show', label: 'Show the pay range on new jobs', kind: 'toggle', value: false, helper: 'On the careers page and job boards. Each job can still change it. Where a law requires it, the range always shows.', starter: true, scope: 'Company', synonyms: ['salary range', 'pay transparency', 'ctc'] },
        { key: 'hire.pay_history_ask', label: 'Ask applicants about their current or past pay', kind: 'toggle', value: false, helper: 'On new jobs. Never asked where the location’s law bans it.', starter: true, scope: 'Company', synonyms: ['salary history', 'current ctc'] },
        { key: 'hire.handoff_mode', label: 'Hand-off to onboarding', kind: 'radio', value: 'Automatic', options: ['Automatic', 'Manual'], helper: 'Automatic creates the pre-boarding employee on acceptance. Manual puts the offer in HR’s Ready to onboard queue.', overrides: [{ scope: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', value: 'Manual' }], synonyms: ['create employee', 'pre-boarding'] },
      ],
    },
    {
      title: 'Background checks and candidate data',
      settings: [
        {
          key: 'hire.bgv_packages',
          label: 'Background check packages',
          kind: 'list',
          columns: ['Package', 'Checks', 'Used for'],
          rows: [
            ['Plant', 'Identity, Address', 'Hosur plant'],
            ['Standard', 'Identity, Address, Education, Employment', 'Office staff'],
            ['Senior', 'Identity, Address, Education, Employment, Criminal, Credit', 'Grade M3 and above'],
          ],
          addLabel: 'Add package',
          availability: 'Background check add-on',
          synonyms: ['bgv', 'background verification'],
        },
        { key: 'hire.bgv_timing', label: 'Start background checks', kind: 'radio', value: 'After offer acceptance', options: ['After offer acceptance', 'Before the offer'], starter: true, scope: 'Company' },
        { key: 'hire.retention_months', label: 'Keep non-hired candidates for', kind: 'number', value: 12, unit: 'months after last activity', min: 6, max: 36, helper: 'A consent-renewal email goes before expiry. Otherwise the candidate is anonymised; funnel counts are kept. The law (DPDP Act, 2023 s.8(7)) says to erase data once its purpose is served; YukthiX caps this at 36 months.', starter: true, scope: 'Company', synonyms: ['candidate retention', 'talent pool', 'gdpr', 'dpdp'] },
        { key: 'hire.renewal_days', label: 'Send consent renewal before expiry', kind: 'number', value: 30, unit: 'days', min: 7, max: 90, starter: true, scope: INHERITED },
        // Founder answer 362 (HIR-10): a background-check discrepancy goes to a second person.
        { key: 'hire.bgv_decider_other_person', label: 'A discrepancy is decided by someone other than who recorded it', kind: 'toggle', value: true, helper: 'Anyone with the background-check key decides “proceed” or “do not proceed”, with a reason. On: never the person who recorded the result. Nothing is withdrawn automatically.', starter: true, scope: 'Company', synonyms: ['bgv', 'discrepancy', 'four eyes', 'background verification'] },
        // Founder answer 341 (HIR-05 answer 272).
        { key: 'hire.rehire_blocks_screening', label: '“Not eligible for rehire” stops an ex-employee at the first stage', kind: 'toggle', value: false, helper: 'On: they cannot move to Screening or later until HR clears the flag with a reason. Off: a banner only tells the recruiter.', starter: true, scope: 'Company', synonyms: ['rehire', 'ex-employee', 'blacklist'] },
        // Careers answer 443 (352): tell an applicant whose résumé file was quarantined.
        { key: 'hire.resume_quarantine_notice', label: 'Tell an applicant when their résumé file is blocked', kind: 'toggle', value: true, helper: 'On: an applicant whose résumé fails the virus check gets an email with a link to their candidate page to upload another file. Off: the file is blocked and nobody is told.', starter: true, scope: 'Company', synonyms: ['virus', 'quarantine', 'resume', 'infected'] },
        { key: 'hire.minors', label: 'Candidates under 18', kind: 'law', value: 'Guardian consent; no AI interview or profiling', law: 'Digital Personal Data Protection Act, 2023 s.9' },
      ],
    },
    {
      title: 'AI interview and careers site',
      settings: [
        { key: 'hire.ai_interview', label: 'AI interview', kind: 'toggle', value: true, helper: 'A person reviews every result. Candidates are never rejected automatically.', scope: 'Company', synonyms: ['video interview', 'async interview'] },
        // Founder answer 341 (HIR-26 rediscovery).
        { key: 'hire.rediscovery_ai', label: 'AI notes on past candidates', kind: 'toggle', value: false, helper: 'A short note on why each past candidate suggested for a requisition may fit. A person decides. Off: plain text search only.', starter: true, scope: 'Company', synonyms: ['rediscovery', 'talent pool', 'past applicants'] },
        { key: 'hire.ai_languages', label: 'AI interview languages', kind: 'multiselect', value: ['English', 'Hindi'], options: ['English', 'Hindi'], starter: true, scope: 'Company' },
        { key: 'hire.brand_colour', label: 'Careers site colour', kind: 'colour', value: '#1F5FA8', scope: 'Company', synonyms: ['careers page', 'branding'] },
        { key: 'hire.careers_heading', label: 'Careers site heading', kind: 'text', value: 'Grow with Kaveri Foods', scope: 'Company' },
        { key: 'hire.not_selected_notice', label: 'Tell candidates when they are not selected', kind: 'toggle', value: true, scope: 'Company' },
      ],
    },
    {
      title: 'Referrals and recruiting costs',
      settings: [
        {
          key: 'hire.referral_rules',
          label: 'Referral bonus rules',
          kind: 'list',
          columns: ['Roles', 'Bonus', 'Paid after', 'Paid through'],
          rows: [
            ['Plant workers', '₹5,000', '3 months', 'Payroll'],
            ['Office staff up to M1', '₹15,000', '6 months', 'Payroll'],
            ['M2 and above', '₹40,000', '6 months', 'Payroll'],
          ],
          addLabel: 'Add referral rule',
          dated: { validFrom: '2026-04-01' },
          synonyms: ['employee referral', 'referral bonus'],
        },
        // Founder answer 341: no referral credit when the person applied on their own shortly before.
        { key: 'hire.referral_self_apply_days', label: 'No referral credit if the person applied themselves within', kind: 'select', value: '90', options: ['0', '30', '60', '90', '180'], optionLabels: { '0': 'Always credit', '30': '30 days', '60': '60 days', '90': '90 days', '180': '180 days' }, starter: true, scope: 'Company', synonyms: ['referral', 'self applied'] },
        { key: 'hire.cost_categories', label: 'Recruiting cost categories', kind: 'multiselect', value: ['Job boards', 'Agency fees', 'Referral bonuses', 'Assessments', 'Campus events', 'Other'], options: ['Job boards', 'Agency fees', 'Referral bonuses', 'Assessments', 'Campus events', 'Other'], helper: 'Used for cost per hire. Recruiter time is not counted.', contributedBy: 'P09', scope: 'Company', synonyms: ['cost per hire'] },
      ],
    },
    {
      // HIR-25 (founder decision 2): off by default; consent from every participant before anything is recorded.
      title: 'Interview notetaker',
      settings: [
        { key: 'hire.notetaker_enabled', label: 'Interview notetaker', kind: 'toggle', value: false, helper: 'Keeps an interview transcript only after every participant consents. Anyone saying no means no recording.', starter: true, scope: 'Company', synonyms: ['recording', 'transcript', 'notetaker', 'consent'] },
        { key: 'hire.notetaker_ai_draft', label: 'AI drafts a scorecard from the transcript', kind: 'toggle', value: false, helper: 'A suggestion only: the interviewer confirms or changes every rating and submits. Uses your company’s AI.', starter: true, scope: 'Company', synonyms: ['ai', 'scorecard', 'draft'] },
        { key: 'hire.notetaker_keep_days', label: 'Keep transcripts and drafts for', kind: 'select', value: '90', options: ['30', '90', '180', '365'], optionLabels: { '30': '30 days', '90': '90 days', '180': '180 days', '365': '1 year' }, helper: 'Then they are deleted. Erasing a candidate deletes them at once.', starter: true, scope: 'Company', synonyms: ['retention', 'transcript'] },
        // HIR-23 (founder decision 2, question 7): NYC Local Law 144; on = a yearly independent bias audit in Hiring › Bias audits.
        { key: 'hire.bias_audit_nyc', label: 'We use an automated tool for jobs in New York City', kind: 'toggle', value: false, helper: 'On: AI notes on past candidates and AI draft scorecards for New York City jobs need an independent bias audit in the last year (Hiring › Bias audits). Without one they are blocked for those jobs.', starter: true, scope: 'Company', synonyms: ['bias audit', 'nyc', 'local law 144', 'aedt'] },
      ],
    },
    {
      // HIR-20 Talent CRM (10 Nov 2026): when campaign messages go, how many a day, and how long a sourced profile waits.
      title: 'Talent CRM',
      settings: [
        { key: 'hire.crm_send_window', label: 'Campaign messages go out', kind: 'select', value: '09-21', options: ['09-21', '10-18', '08-20', '00-24'], optionLabels: { '09-21': '9 am to 9 pm IST', '10-18': '10 am to 6 pm IST', '08-20': '8 am to 8 pm IST', '00-24': 'Any time' }, helper: 'A step that falls due outside these hours waits for the next window.', starter: true, scope: 'Company', synonyms: ['quiet hours', 'campaign', 'sequence', 'nurture'] },
        { key: 'hire.crm_daily_cap', label: 'Most campaign messages a day', kind: 'select', value: '200', options: ['50', '100', '200', '500', '1000'], helper: 'For the whole company, all campaigns together. The rest go the next day.', starter: true, scope: 'Company', synonyms: ['limit', 'campaign', 'cap'] },
        { key: 'hire.sourced_keep_days', label: 'Erase a sourced profile with no consent after', kind: 'select', value: '30', options: ['7', '15', '30'], optionLabels: { '7': '7 days', '15': '15 days', '30': '30 days' }, helper: 'A person added from outside YukthiX gets one consent email; with no yes by then, their details are deleted (DPDP).', starter: true, scope: 'Company', synonyms: ['sourced', 'consent', 'dpdp', 'retention'] },
      ],
    },
    {
      // HIR-13 (founder decision 6): who can apply for internal jobs, and when; the current manager is told, never asked.
      title: 'Internal jobs',
      settings: [
        { key: 'hire.internal_after_probation', label: 'Only people past probation can apply for internal jobs', kind: 'toggle', value: true, helper: 'Off: people still on probation can apply too.', starter: true, scope: 'Company', synonyms: ['internal mobility', 'internal jobs', 'probation'] },
        { key: 'hire.internal_months_in_role', label: 'Time in their current role before applying', kind: 'select', value: '12', options: ['0', '3', '6', '9', '12', '18', '24'], optionLabels: { '0': 'No wait', '3': '3 months', '6': '6 months', '9': '9 months', '12': '12 months', '18': '18 months', '24': '24 months' }, helper: 'Counted from the day their current designation started. People serving notice can never apply.', starter: true, scope: 'Company', synonyms: ['internal mobility', 'tenure', 'time in role'] },
        { key: 'hire.internal_tell_manager', label: 'Tell the current manager', kind: 'segment', value: 'on_apply', options: ['on_apply', 'at_offer'], optionLabels: { on_apply: 'When they apply', at_offer: 'At the offer stage' }, helper: 'The manager is told, never asked. Test results stay with the job’s hiring manager and HR.', starter: true, scope: 'Company', synonyms: ['internal mobility', 'manager', 'notify'] },
      ],
    },
  ],
  lastChange: {
    by: 'Neha Joshi',
    role: 'Talent Acquisition Lead',
    at: '2026-09-10T11:25',
    what: 'Set hand-off to Manual for the Tamil Nadu entity',
  },
  related: [
    { label: 'Headcount plan board', screenId: 'HIR-01' },
    { label: 'Offer builder', screenId: 'HIR-09' },
    { label: 'Background check tracker', screenId: 'HIR-10' },
    { label: 'Recruiting costs', screenId: 'HIR-11' },
  ],
};

/* ---------------- 6.2 Staffing desk ---------------- */
const staffing: SettingsPageDef = {
  id: '6.2',
  group: 6,
  title: 'Staffing desk',
  summary:
    'Defaults for placing contractors with clients: rate cards, invoice numbering per entity and GSTIN, ageing and dunning, bench policy and client-portal response times.',
  owner: ['M10'],
  permission: 'staffing.settings.manage',
  permissionHolder: 'Account managers with finance approval',
  scopes: ['Company', 'Legal entity'],
  sections: [
    // Staffing slice 1: the desk is off until a company that places people with clients turns it on (its own menu group).
    {
      title: 'Staffing desk',
      settings: [
        { key: 'staff.desk_enabled', label: 'Turn on the staffing desk', kind: 'toggle', value: false, helper: 'For a company that places its people with client companies: clients, rate cards and, later, placements and client invoices. Off: the staffing menu and pages stay hidden.', starter: true, scope: 'Company', synonyms: ['staffing', 'contract staffing', 'clients'] },
      ],
    },
    {
      title: 'Rate cards',
      settings: [
        { key: 'staff.rate_backdate', label: 'A rate change may start up to', kind: 'select', value: '0', options: ['0', '7', '30', '90'], optionLabels: { '0': 'Today or later', '7': '7 days back', '30': '30 days back', '90': '90 days back' }, helper: 'Today or later keeps the rate of every day already billed.', starter: true, scope: 'Company', synonyms: ['backdate', 'rate change'] },
        { key: 'staff.ot_multiplier', label: 'Overtime bill multiplier', kind: 'number', value: 1.5, unit: '× hourly rate', min: 1, max: 3, starter: true, scope: 'Company', synonyms: ['rate card', 'overtime billing'] },
        { key: 'staff.holiday_multiplier', label: 'Holiday bill multiplier', kind: 'number', value: 2, unit: '× hourly rate', min: 1, max: 3, starter: true, scope: 'Company' },
        { key: 'staff.rate_cards', label: 'Client rate cards', kind: 'link', linkScreenId: 'HIR-15', linkLabel: 'Open rate cards' },
      ],
    },
    // Staffing slice 2 (HIR-16, HIR-17, HIR-21): submissions, placements and vendors.
    {
      title: 'Submissions and placements',
      settings: [
        { key: 'staff.mask_contact', label: 'Hide phone and email from clients until they shortlist', kind: 'toggle', value: true, helper: 'The submission email names the people; their contact details follow once the client shortlists.', starter: true, scope: 'Company', synonyms: ['mask', 'submission email'] },
        { key: 'staff.ending_soon', label: 'A placement is ending soon within', kind: 'select', value: '30', options: ['15', '30', '45', '60'], optionLabels: { '15': '15 days', '30': '30 days', '45': '45 days', '60': '60 days' }, starter: true, scope: 'Company', synonyms: ['placement end', 'redeploy'] },
        { key: 'staff.statutory_cost', label: 'Statutory cost on own-payroll pay', kind: 'select', value: '0', options: ['0', '5', '10', '13', '15', '20'], optionLabels: { '0': 'None', '5': '5%', '10': '10%', '13': '13%', '15': '15%', '20': '20%' }, helper: 'Employer PF, ESI and similar costs as a share of the pay rate; taken off the margin of own-payroll placements. Starts at 13% when a legal entity has a PF or ESI registration, else none.', starter: true, scope: 'Company', synonyms: ['margin', 'pf', 'esi'] },
      ],
    },
    {
      title: 'Vendors',
      settings: [
        { key: 'staff.vendor_margin', label: 'Target margin for a vendor rate cap', kind: 'select', value: '25', options: ['10', '15', '20', '25', '30', '35', '40'], optionLabels: { '10': '10%', '15': '15%', '20': '20%', '25': '25%', '30': '30%', '35': '35%', '40': '40%' }, helper: 'Sharing a client job suggests the rate cap as the bill rate less this margin.', starter: true, scope: 'Company', synonyms: ['rate cap', 'vendor margin'] },
        { key: 'staff.vendor_ownership', label: 'A vendor holds a candidate it submitted for', kind: 'select', value: '90', options: ['30', '60', '90', '180'], optionLabels: { '30': '30 days', '60': '60 days', '90': '90 days', '180': '180 days' }, helper: 'Per job. A later vendor’s submission of the same person is a duplicate; the vendor is never told who holds them.', starter: true, scope: 'Company', synonyms: ['duplicate', 'ownership'] },
      ],
    },
    {
      title: 'Invoicing',
      settings: [
        {
          key: 'staff.invoice_series',
          label: 'Invoice numbering',
          kind: 'list',
          columns: ['Legal entity', 'GSTIN', 'Series', 'Next number'],
          rows: [
            ['Kaveri Foods Pvt Ltd', '29AABCK1234F1Z5', 'KFL/INV/26-27/', '0087'],
            ['Kaveri Foods Pvt Ltd (Tamil Nadu)', '33AABCK1234F1Z9', 'KFTN/INV/26-27/', '0031'],
          ],
          addLabel: 'Add invoice series',
          dated: { validFrom: '2026-04-01' },
          synonyms: ['gst invoice', 'invoice number'],
        },
        { key: 'staff.invoice_series_law', label: 'One continuous series per GSTIN per financial year', kind: 'law', value: 'On', law: 'CGST Rules, 2017 r.46(b)' },
        { key: 'staff.payment_terms', label: 'Default payment terms', kind: 'number', value: 30, unit: 'days', min: 0, max: 120, starter: true, scope: 'Company' },
        { key: 'staff.einvoice', label: 'E-invoicing (IRN and QR)', kind: 'toggle', value: false, availability: 'E-invoicing partner add-on', scope: 'Legal entity', synonyms: ['irn', 'e-invoice'] },
      ],
    },
    // Staffing answer 522: the accounting export's ledgers (names as in the company's Tally or Zoho Books).
    {
      title: 'Accounting export',
      settings: [
        { key: 'staff.exp_sales', label: 'Sales ledger', kind: 'text', value: 'Sales - Staffing Services', helper: 'The ledger names must match your accounts in Tally or Zoho Books exactly.', starter: true, scope: 'Company', synonyms: ['tally', 'zoho', 'ledger', 'export'] },
        { key: 'staff.exp_split', label: 'GST ledgers', kind: 'segment', value: 'separate', options: ['separate', 'combined'], optionLabels: { separate: 'CGST, SGST and IGST', combined: 'One GST ledger' }, starter: true, scope: 'Company' },
        { key: 'staff.exp_cgst', label: 'CGST ledger', kind: 'text', value: 'Output CGST', starter: true, scope: 'Company' },
        { key: 'staff.exp_sgst', label: 'SGST ledger', kind: 'text', value: 'Output SGST', starter: true, scope: 'Company' },
        { key: 'staff.exp_igst', label: 'IGST ledger', kind: 'text', value: 'Output IGST', starter: true, scope: 'Company' },
        { key: 'staff.exp_gst', label: 'GST ledger (one for all)', kind: 'text', value: 'Output GST', starter: true, scope: 'Company' },
        { key: 'staff.exp_tds', label: 'TDS the client deducts', kind: 'segment', value: 'none', options: ['none', 'expected'], optionLabels: { none: 'Leave out', expected: 'Show the expected TDS' }, helper: 'Expected TDS: the client\'s section rate on the taxable value, to a TDS receivable ledger.', starter: true, scope: 'Company' },
        { key: 'staff.exp_tds_ledger', label: 'TDS receivable ledger', kind: 'text', value: 'TDS Receivable', starter: true, scope: 'Company' },
        { key: 'staff.exp_bank', label: 'Bank ledger (receipts)', kind: 'text', value: 'Bank Account', helper: 'Receipts are exported as receipt vouchers into this ledger, with the client’s TDS.', starter: true, scope: 'Company' },
        { key: 'staff.exp_round', label: 'Round each total', kind: 'segment', value: 'rupee', options: ['rupee', 'none'], optionLabels: { rupee: 'To the rupee', none: 'Keep paise' }, starter: true, scope: 'Company' },
        { key: 'staff.exp_round_ledger', label: 'Round-off ledger', kind: 'text', value: 'Round Off', starter: true, scope: 'Company' },
      ],
    },
    {
      title: 'Collections',
      settings: [
        {
          key: 'staff.ageing',
          label: 'Overdue groups',
          helper: 'How unpaid invoices are grouped in the receivables report.',
          kind: 'list',
          columns: ['Bucket', 'Days overdue'],
          rows: [
            ['Current', '0'],
            ['1–30', '1 to 30'],
            ['31–60', '31 to 60'],
            ['61–90', '61 to 90'],
            ['Over 90', '91 and more'],
          ],
          starter: true,
          synonyms: ['receivables', 'ageing', 'ageing buckets'],
        },
        {
          key: 'staff.dunning',
          label: 'Payment reminders',
          kind: 'list',
          columns: ['Step', 'When', 'To'],
          rows: [
            ['Friendly reminder', '3 days before due', 'Client billing contact'],
            ['First reminder', '7 days overdue', 'Client billing contact'],
            ['Second reminder', '21 days overdue', 'Billing contact and account owner'],
            ['Escalation', '45 days overdue', 'Client finance head, account manager'],
          ],
          addLabel: 'Add step',
          starter: true,
          synonyms: ['payment reminder', 'collections', 'dunning'],
        },
      ],
    },
    {
      title: 'Bench and client portal',
      settings: [
        { key: 'staff.bench_pay', label: 'Bench pay', kind: 'percent', value: 50, min: 0, max: 100, helper: 'Share of fixed pay while between placements.', starter: true, scope: 'Company', synonyms: ['bench policy'] },
        { key: 'staff.bench_days', label: 'Maximum bench days', kind: 'number', value: 30, unit: 'days', min: 0, max: 180, starter: true, scope: 'Company' },
        { key: 'staff.bench_after', label: 'After maximum bench days', kind: 'segment', value: 'Redeploy or exit review', options: ['Redeploy or exit review', 'Unpaid bench'], starter: true, scope: INHERITED },
        {
          key: 'staff.portal_sla',
          label: 'Client portal response times',
          kind: 'list',
          columns: ['Request', 'Response within'],
          rows: [
            ['Timesheet query', '1 business day'],
            ['Invoice dispute', '3 business days'],
            ['Replacement request', '5 business days'],
          ],
          starter: true,
        },
        {
          key: 'staff.portal_tickets',
          label: 'Client portal tickets go to',
          kind: 'select',
          value: 'account_manager',
          options: ['account_manager', 'Client support · Staffing team'],
          optionLabels: { account_manager: "The client's account manager" },
          helper: 'Tickets a client contact raises in the portal are Helpdesk tickets. They go to the account manager on their help desk, or to the Helpdesk team chosen here.',
          starter: true,
          scope: 'Company',
        },
      ],
    },
  ],
  lastChange: {
    by: 'Neha Joshi',
    role: 'Talent Acquisition Lead',
    at: '2026-07-30T16:40',
    what: 'Opened the 2026-27 invoice series for the Tamil Nadu GSTIN',
  },
  related: [
    { label: 'Clients', screenId: 'HIR-14' },
    { label: 'Invoices', screenId: 'HIR-18' },
    { label: 'Receivables & collections', screenId: 'HIR-19' },
    { label: 'Placements and bench', screenId: 'HIR-17' },
  ],
  note: 'Coming soon. The staffing desk isn’t available yet; you can prepare these defaults now and they apply when it opens.',
};

/* ---------------- 6.3 Performance ---------------- */
const performance: SettingsPageDef = {
  id: '6.3',
  group: 6,
  title: 'Performance',
  summary:
    'Goal types, review templates and stages, rating scales, 360° anonymity, calibration, compensation review, PIPs, competencies, 1:1 cadence and the manager assistants.',
  owner: ['M06'],
  contributes: ['P23'],
  permission: 'performance.settings.manage',
  permissionHolder: 'HR admins',
  scopes: ['Company', 'Legal entity', 'Department'],
  sections: [
    {
      title: 'Goals and reviews',
      settings: [
        { key: 'perf.goal_types', label: 'Goal types', kind: 'multiselect', value: ['OKR', 'KPI'], options: ['OKR', 'KPI'], helper: 'Chosen per cycle or department; templates may mix them with weights.', starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant', value: ['KPI'] }], synonyms: ['okr', 'kra', 'kpi'] },
        { key: 'perf.templates', label: 'Review templates', kind: 'link', linkScreenId: 'PRF-04', linkLabel: 'Manage review templates and cycles', synonyms: ['appraisal form'] },
        { key: 'perf.stages', label: 'Default review stages', kind: 'multiselect', value: ['Self', 'Manager', 'Calibration', 'HR release', 'Employee acknowledgement'], options: ['Self', '360°', 'Manager', 'Skip-level', 'Calibration', 'HR release', 'Employee acknowledgement'], starter: true, scope: 'Company', synonyms: ['appraisal stages'] },
        { key: 'perf.scale', label: 'Rating scale', kind: 'radio', value: '1–5', options: ['1–3', '1–4', '1–5', 'Custom'], helper: 'Needs improvement, Partly meets, Meets, Exceeds, Outstanding. Frozen once a cycle launches.', starter: true, scope: 'Company', synonyms: ['rating'] },
        { key: 'perf.half_points', label: 'Allow half points', kind: 'toggle', value: false, starter: true, scope: INHERITED },
        { key: 'perf.protected_leave', label: 'Maternity and long leave are not held against the rating', kind: 'law', value: 'On', law: 'Maternity Benefit Act, 1961 s.12; YukthiX rule YX-PERF-21' },
      ],
    },
    {
      title: '360° and calibration',
      settings: [
        { key: 'perf.360_min', label: 'Minimum 360° reviewers', kind: 'number', value: 3, unit: 'people', min: 1, max: 10, starter: true, scope: 'Company', atMost: 'perf.360_max' },
        { key: 'perf.360_max', label: 'Maximum 360° reviewers', kind: 'number', value: 8, unit: 'people', min: 3, max: 20, starter: true, scope: 'Company' },
        { key: 'perf.360_anonymous', label: 'Anonymous reviewers', kind: 'multiselect', value: ['Peers', 'Direct reports'], options: ['Peers', 'Direct reports', 'Manager'], helper: 'Anonymous feedback shows only with 3 or more responses.', starter: true, scope: 'Company', synonyms: ['360 anonymity'] },
        {
          key: 'perf.calibration_guide',
          label: 'Calibration guide',
          kind: 'list',
          columns: ['Rating', 'Guide share'],
          rows: [
            ['Outstanding', '10 %'],
            ['Exceeds', '20 %'],
            ['Meets', '55 %'],
            ['Partly meets', '10 %'],
            ['Needs improvement', '5 %'],
          ],
          helper: 'A guide only. Enforcing it is coming soon.',
          starter: true,
          synonyms: ['bell curve', 'normalisation'],
        },
        { key: 'perf.enforced_distribution', label: 'Enforce the distribution', kind: 'toggle', value: false, availability: 'Wave 6', scope: 'Company' },
      ],
    },
    {
      title: 'Compensation review and PIP',
      settings: [
        { key: 'perf.comp_matrix', label: 'Increment matrix (rating × compa-ratio)', kind: 'link', linkScreenId: 'PRF-10', linkLabel: 'Edit the comp review matrix', synonyms: ['merit matrix', 'increment'] },
        {
          key: 'perf.comp_budgets',
          label: 'Increment budgets by department',
          kind: 'list',
          columns: ['Department', 'Budget'],
          rows: [
            ['Production (Hosur plant)', '₹1,20,00,000'],
            ['Sales', '₹48,00,000'],
            ['Engineering', '₹36,00,000'],
            ['Corporate functions', '₹30,00,000'],
          ],
          addLabel: 'Add budget',
          dated: { validFrom: '2026-04-01' },
        },
        { key: 'perf.pay_equity_flag', label: 'Flag pay below peers by more than', kind: 'percent', value: 10, min: 0, max: 50, starter: true, scope: 'Company' },
        { key: 'perf.pip_durations', label: 'PIP durations offered', kind: 'multiselect', value: ['30 days', '60 days', '90 days'], options: ['30 days', '60 days', '90 days'], starter: true, scope: 'Company', synonyms: ['pip', 'improvement plan'] },
        { key: 'perf.pip_checkin', label: 'PIP check-in every', kind: 'number', value: 14, unit: 'days', min: 7, max: 30, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Competencies and 1:1s',
      settings: [
        { key: 'perf.competencies', label: 'Competency and skills library', kind: 'link', linkScreenId: 'PRF-14', linkLabel: 'Open the competency framework', synonyms: ['skills library', 'competency'] },
        { key: 'perf.one_on_one', label: 'Default 1:1 cadence', kind: 'radio', value: 'Fortnightly', options: ['Weekly', 'Fortnightly', 'Monthly'], starter: true, scope: 'Company', synonyms: ['one on one'] },
      ],
    },
    {
      title: 'Manager assistants',
      settings: [
        { key: 'perf.coach_frequency', label: 'Manager coach nudges', kind: 'radio', value: 'Weekly', options: ['Weekly', 'Fortnightly', 'Off'], availability: 'Wave 5', contributedBy: 'P23', helper: 'Each manager can opt out.', scope: 'Company', synonyms: ['manager coach', 'nudges'] },
        { key: 'perf.coach_signals', label: 'Coach signal types', kind: 'multiselect', value: ['No feedback in 8 weeks', '1:1 overdue', 'Large unused leave', 'Goals off track', 'Open onboarding tasks'], options: ['No feedback in 8 weeks', '1:1 overdue', 'Large unused leave', 'Overtime streak', 'Goals off track', 'Open onboarding tasks'], helper: 'Never uses health, POSH or disciplinary data.', availability: 'Wave 5', contributedBy: 'P23', scope: 'Company' },
        { key: 'perf.review_assistant', label: 'Review assistant with bias check', kind: 'toggle', value: true, helper: 'Suggestions only; the manager’s text and rating are final.', availability: 'Wave 5', contributedBy: 'P23', scope: 'Company', synonyms: ['help me draft', 'bias check'] },
      ],
    },
  ],
  lastChange: {
    by: 'Karthik Subramanian',
    role: 'Engineering Manager',
    at: '2026-09-15T10:05',
    what: 'Moved default 1:1 cadence for Engineering from monthly to fortnightly',
  },
  related: [
    { label: 'Cycles', screenId: 'PRF-04' },
    { label: 'Calibration board', screenId: 'PRF-09' },
    { label: 'Comp review sheet', screenId: 'PRF-10' },
    { label: 'Manager coach card', screenId: 'PRF-16' },
  ],
};

/* ---------------- 6.4 Learning ---------------- */
const learning: SettingsPageDef = {
  id: '6.4',
  group: 6,
  title: 'Learning',
  summary:
    'How training is assigned and enrolled, budgets per department, training bonds, completion rules, effectiveness checks and external trainer access.',
  owner: ['M07'],
  permission: 'learning.settings.manage',
  permissionHolder: 'L&D managers and HR admins',
  scopes: ['Company', 'Legal entity', 'Location', 'Department'],
  sections: [
    {
      title: 'Assignment and enrolment',
      settings: [
        { key: 'lrn.assignment_rules', label: 'Assignment rules', kind: 'link', linkScreenId: 'LRN-07', linkLabel: 'Edit assignment rules', helper: 'By population, with due dates and recurrence.', synonyms: ['mandatory training', 'auto assign'] },
        { key: 'lrn.self_enrol', label: 'Self-enrolment', kind: 'radio', value: 'Set per course', options: ['Set per course', 'Always needs manager approval', 'No approval'], starter: true, scope: 'Company', synonyms: ['enrol'] },
        { key: 'lrn.decline', label: 'Employees may decline a nomination with a reason', kind: 'toggle', value: true, helper: 'Mandatory courses cannot be declined.', starter: true, scope: INHERITED },
        { key: 'lrn.overdue_escalation', label: 'Escalate overdue training to the manager after', kind: 'number', value: 7, unit: 'days', min: 1, max: 60, starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Budgets and training bonds',
      settings: [
        {
          key: 'lrn.budgets',
          label: 'Training budget per department',
          kind: 'list',
          columns: ['Department', 'Budget 2026-27', 'Used'],
          rows: [
            ['Production (Hosur plant)', '₹18,00,000', '₹6,40,000'],
            ['Quality', '₹6,00,000', '₹2,10,000'],
            ['Sales', '₹9,00,000', '₹4,75,000'],
            ['Engineering', '₹12,00,000', '₹5,30,000'],
          ],
          lockedColumns: ['Used'],
          helper: 'Used is worked out from approved training spend.',
          addLabel: 'Add budget',
          dated: { validFrom: '2026-04-01' },
          synonyms: ['training budget'],
        },
        { key: 'lrn.over_budget', label: 'When a department is over budget', kind: 'radio', value: 'Warn', options: ['Warn', 'Block'], starter: true, scope: 'Company' },
        { key: 'lrn.bond_threshold', label: 'Training bond for courses costing above', kind: 'money', value: 75000, scope: 'Company', synonyms: ['training bond', 'service bond'] },
        { key: 'lrn.bond_months', label: 'Bond period', kind: 'number', value: 12, unit: 'months', min: 1, max: 36, scope: 'Company' },
        { key: 'lrn.bond_recovery', label: 'Recovery if the person leaves early', kind: 'radio', value: 'Pro-rata, after HR confirms', options: ['Pro-rata, after HR confirms', 'Full cost, after HR confirms'], helper: 'Added to full and final settlement. HR can waive with a reason.', starter: true, scope: INHERITED },
        { key: 'lrn.bond_letter', label: 'Bond terms letter', kind: 'link', linkScreenId: 'PPL-29', linkLabel: 'Edit training bond template' },
      ],
    },
    {
      title: 'Completion and effectiveness',
      settings: [
        { key: 'lrn.completion', label: 'Completion needs attendance of at least', kind: 'percent', value: 75, min: 0, max: 100, starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant safety courses', value: 100 }], synonyms: ['attendance threshold'] },
        { key: 'lrn.manager_check', label: 'Ask the manager “applying the skill?” after', kind: 'number', value: 60, unit: 'days', min: 14, max: 180, starter: true, scope: 'Company', synonyms: ['training effectiveness'] },
        { key: 'lrn.pre_post_test', label: 'Offer pre and post tests', kind: 'toggle', value: false, scope: 'Company' },
        { key: 'lrn.trainer_expiry', label: 'External trainer access ends after the last session by', kind: 'number', value: 7, unit: 'days', min: 0, max: 60, starter: true, scope: INHERITED, synonyms: ['trainer login'] },
      ],
    },
  ],
  lastChange: {
    by: 'Priya Nair',
    role: 'L&D Manager',
    at: '2026-08-04T12:50',
    what: 'Raised the training bond threshold from ₹50,000 to ₹75,000',
  },
  related: [
    { label: 'Assignment rules', screenId: 'LRN-07' },
    { label: 'Training needs and budgets', screenId: 'LRN-11' },
    { label: 'Compliance dashboard', screenId: 'LRN-08' },
  ],
};

/* ---------------- 6.5 Assessments ---------------- */
const assessments: SettingsPageDef = {
  id: '6.5',
  group: 6,
  title: 'Assessments',
  summary:
    'Defaults for the question bank, tests, test delivery, proctoring, and results and retention. Each test can change most of them.',
  owner: ['T01', 'T02', 'T03', 'T04', 'T05'],
  permission: 'assessments.settings.manage',
  permissionHolder: 'Test owners and System admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Question bank',
      settings: [
        { key: 'asmt.skills', label: 'Skill taxonomy', kind: 'link', linkScreenId: 'PRF-14', linkLabel: 'Open the company skills library', helper: 'Question tags use the same skills as competencies and scorecards.', synonyms: ['skills', 'taxonomy'] },
        {
          key: 'asmt.review_workflow',
          label: 'Review workflow per collection',
          kind: 'list',
          columns: ['Collection', 'Reviewers', 'Second approver'],
          rows: [
            ['Food safety', '1', 'Yes (certification)'],
            ['Aptitude', '1', 'No'],
            ['Sales scenarios', '1', 'No'],
            ['Java coding', '1', 'Yes (high stakes)'],
          ],
          addLabel: 'Add collection',
          starter: true,
          synonyms: ['question review'],
        },
        { key: 'asmt.languages', label: 'Question languages', kind: 'multiselect', value: ['English', 'Tamil'], options: ['English', 'Hindi', 'Tamil', 'Telugu'], helper: 'Translations need a bilingual human review.', scope: 'Company' },
        {
          key: 'asmt.packs',
          label: 'Library packs',
          kind: 'list',
          columns: ['Pack', 'Source', 'Status'],
          rows: [
            ['Aptitude', 'YukthiX starter', 'Included'],
            ['English', 'YukthiX starter', 'Included'],
            ['Core IT skills', 'YukthiX starter', 'Included'],
            ['Food technology', 'Partner pack', 'Add-on'],
          ],
          addLabel: 'Add library pack',
          synonyms: ['question library', 'content pack'],
        },
        { key: 'asmt.ai_generation', label: 'AI-drafted questions', kind: 'toggle', value: true, helper: 'Always drafts, labelled and reviewed by a person.', scope: 'Company' },
      ],
    },
    {
      title: 'Test defaults',
      settings: [
        { key: 'asmt.timer', label: 'Section timer', kind: 'radio', value: 'Advisory', options: ['Advisory', 'Enforced'], starter: true, scope: 'Company', synonyms: ['timer', 'auto submit'] },
        { key: 'asmt.navigation', label: 'Navigation', kind: 'radio', value: 'Free, with mark for review', options: ['Free, with mark for review', 'Forward only'], helper: 'Adaptive sections are always forward only.', starter: true, scope: 'Company' },
        { key: 'asmt.attempts_hiring', label: 'Attempts for hiring tests', kind: 'number', value: 1, unit: 'attempts', min: 1, max: 5, starter: true, scope: 'Company', synonyms: ['retake'] },
        { key: 'asmt.result_reuse_months', label: 'An earlier result may be used again for', kind: 'select', value: '6 months', options: ['Never', '3 months', '6 months', '12 months'], helper: 'The same test only. The candidate chooses and agrees; a result under review is never used.', starter: true, scope: 'Company', synonyms: ['reuse', 'retake', 'earlier result'] },
        { key: 'asmt.attempts_training', label: 'Attempts for training tests', kind: 'number', value: 3, unit: 'attempts', min: 1, max: 10, starter: true, scope: 'Company' },
        { key: 'asmt.cooldown', label: 'Wait between attempts', kind: 'number', value: 7, unit: 'days', min: 0, max: 90, starter: true, scope: INHERITED },
        { key: 'asmt.exposure_cap', label: 'Show one question to at most', kind: 'percent', value: 30, min: 5, max: 100, unit: '% of candidates', helper: 'Counted over the last 30 days, so questions don’t leak.', starter: true, scope: 'Company', synonyms: ['question leak', 'exposure'] },
        { key: 'asmt.high_stakes', label: 'A test for more people than this needs an approver', kind: 'number', value: 500, unit: 'candidates', min: 50, starter: true, helper: 'Certification tests always need an approver.', scope: 'Company' },
        // AS-6 (PRC-19): marking.
        { key: 'asmt.blind_marking', label: 'Blind marking', kind: 'toggle', value: true, helper: 'Markers do not see who wrote the answer.', starter: true, scope: 'Company', synonyms: ['blind', 'anonymous marking'] },
        { key: 'asmt.second_marker', label: 'A second marker for written answers', kind: 'toggle', value: false, helper: 'Two blind marks; far apart, a third person moderates.', starter: true, scope: 'Company', synonyms: ['double marking', 'moderation'] },
        { key: 'asmt.moderation_gap', label: 'Moderate when two marks differ by more than', kind: 'select', value: '25 %', options: ['10 %', '20 %', '25 %', '33 %', '50 %'], helper: 'A share of the question’s marks.', starter: true, scope: 'Company' },
        // AS-6 part 2 (answer 2272): AI-allowed tests.
        { key: 'asmt.assistant_turns', label: 'Questions to the assistant in an AI-allowed test', kind: 'select', value: '20', options: ['10', '20', '40', '60'], helper: 'Per attempt. Every question and answer is kept for the markers.', starter: true, scope: 'Company', synonyms: ['AI allowed', 'assistant', 'ChatGPT'] },
      ],
    },
    {
      title: 'Delivery defaults',
      settings: [
        { key: 'asmt.delivery_mode', label: 'Scheduling', kind: 'radio', value: 'Window', options: ['Window', 'Slot booking'], starter: true, scope: 'Company', synonyms: ['slots', 'test window'] },
        { key: 'asmt.reschedules', label: 'Reschedules allowed', kind: 'number', value: 2, unit: 'times', min: 0, max: 5, starter: true, scope: 'Company' },
        { key: 'asmt.reschedule_cutoff', label: 'Reschedule until', kind: 'number', value: 24, unit: 'hours before the slot', min: 1, max: 72, starter: true, scope: INHERITED },
        { key: 'asmt.reminders', label: 'Reminders', kind: 'multiselect', value: ['24 hours before', '1 hour before'], options: ['48 hours before', '24 hours before', '1 hour before'], starter: true, scope: INHERITED },
        { key: 'asmt.no_show_grace', label: 'No-show after', kind: 'number', value: 15, unit: 'minutes', min: 5, max: 60, starter: true, scope: INHERITED },
        { key: 'asmt.offline_minutes', label: 'Keep answering offline for up to', kind: 'number', value: 5, unit: 'minutes', min: 0, max: 30, starter: true, scope: 'Company', overrides: [{ scope: 'Hosur plant trade tests', value: 10 }], synonyms: ['internet drop', 'offline'] },
        { key: 'asmt.time_credit_cap', label: 'Automatic time credit cap', kind: 'number', value: 10, unit: 'minutes per attempt', min: 0, max: 30, starter: true, scope: 'Company' },
        { key: 'asmt.device', label: 'Device policy', kind: 'radio', value: 'Desktop only', options: ['Desktop only', 'Any device'], helper: 'Phones and tablets are allowed only for tests without a person watching (unproctored or AI-watched).', starter: true, scope: 'Company' },
        { key: 'asmt.readiness', label: 'Failed readiness checks', kind: 'radio', value: 'Block camera and browser; warn on the rest', options: ['Block camera and browser; warn on the rest', 'Warn on all', 'Block on all'], starter: true, scope: 'Company', synonyms: ['system check'] },
      ],
    },
    {
      title: 'Proctoring',
      settings: [
        { key: 'asmt.proctor_mode', label: 'Default proctoring mode', kind: 'radio', value: 'AI-only', options: ['Open', 'AI-only', 'Record & review', 'Live'], starter: true, scope: 'Company', synonyms: ['proctoring', 'invigilation'] },
        { key: 'asmt.action_matrix', label: 'Action matrix per detection', kind: 'link', linkScreenId: 'PRC-12', linkLabel: 'Edit proctoring actions', helper: 'Off, flag, warn, pause or end, never below the mode’s minimum.' },
        { key: 'asmt.live_ratio', label: 'Live proctor ratio', kind: 'number', value: 12, unit: 'candidates per proctor', min: 8, max: 16, starter: true, scope: 'Company' },
        { key: 'asmt.yx_proctors', label: 'Use YukthiX professional proctors', kind: 'toggle', value: false, availability: 'Professional proctors add-on', scope: 'Company' },
        { key: 'asmt.id_check', label: 'ID check required for', kind: 'multiselect', value: ['Live', 'Certification tests'], options: ['Live', 'Certification tests', 'Record & review', 'AI-only'], starter: true, scope: 'Company', synonyms: ['id verification', 'face match'] },
        { key: 'asmt.room_scan', label: '360° room scan required for', kind: 'multiselect', value: ['Live', 'Certification tests'], options: ['Live', 'Certification tests', 'Record & review'], starter: true, scope: INHERITED },
      ],
    },
    {
      title: 'Results & retention',
      settings: [
        { key: 'asmt.release_elements', label: 'What candidates see by default', kind: 'multiselect', value: ['Status'], options: ['Status', 'Scaled score', 'Band', 'Percentile', 'Skill breakdown', 'Per-question correctness', 'Correct answers', 'Evaluator comments'], helper: 'Set per test. Results under an open incident or appeal are held.', starter: true, scope: 'Company', synonyms: ['result release', 'show score'] },
        { key: 'asmt.appeal_days', label: 'Appeal window', kind: 'number', value: 7, unit: 'days', min: 1, max: 30, starter: true, scope: 'Company' },
        { key: 'asmt.incident_sla', label: 'Incident review time', kind: 'number', value: 3, unit: 'working days', min: 1, max: 15, starter: true, scope: 'Company' },
        { key: 'asmt.retention', label: 'Keep recordings, clips, face data and ID images for', kind: 'number', value: 30, unit: 'days', min: 30, max: 365, helper: 'Shown to candidates before consent. Legal hold keeps evidence for open incidents and appeals. The law (DPDP Act, 2023 s.8(7)) says to erase data once its purpose is served; YukthiX caps this at 365 days.', starter: true, scope: 'Company', synonyms: ['recording retention', 'delete recordings', 'dpdp'] },
        {
          key: 'asmt.consent',
          label: 'Consent texts by candidate location',
          kind: 'list',
          readOnlyList: true,
          helper: 'Maintained and reviewed by YukthiX for each place’s law.',
          columns: ['Jurisdiction', 'Basis', 'Reviewed'],
          rows: [
            ['India', 'DPDP Act 2023 notice and consent', '12 Aug 2026'],
            ['European Union', 'GDPR Art. 9 explicit consent', '12 Aug 2026'],
            ['United States (Illinois)', 'BIPA written release', '12 Aug 2026'],
            ['Other', 'Strictest applicable text', '12 Aug 2026'],
          ],
          synonyms: ['consent', 'privacy notice'],
        },
        {
          key: 'asmt.ats_advance',
          label: 'After a pass, in the hiring pipeline',
          kind: 'list',
          columns: ['Job', 'What happens'],
          rows: [
            ['Production trainee, Hosur plant', 'Moves to the next stage'],
            ['Sales executive', 'Recruiter is asked to move them'],
            ['Software engineer', 'Recruiter is asked to move them'],
          ],
          helper: 'Moved automatically only when no cheating was flagged. Nobody is rejected automatically.',
        },
        { key: 'asmt.bias_response', label: 'When a question seems unfair to one group', kind: 'radio', value: 'Alert and require review', options: ['Alert and require review', 'Suspend the question until cleared'], starter: true, scope: 'Company' },
        // AS-6 (answer 2019): fairness from voluntary answers, shown only for groups at least this large.
        { key: 'asmt.fairness_min_group', label: 'Show a group in fairness checks from', kind: 'select', value: '30', options: ['5', '10', '20', '30', '50', '100'], unit: 'answers', helper: 'Smaller groups are hidden so no one can be picked out.', starter: true, scope: 'Company', synonyms: ['fairness', 'adverse impact', 'bias'] },
      ],
    },
  ],
  lastChange: {
    by: 'Neha Joshi',
    role: 'Talent Acquisition Lead',
    at: '2026-09-24T15:10',
    what: 'Allowed 10 minutes of offline answering for Hosur plant trade tests',
  },
  related: [
    { label: 'Question bank', screenId: 'PRC-01' },
    { label: 'Test builder', screenId: 'PRC-04' },
    { label: 'Proctoring settings', screenId: 'PRC-12' },
    { label: 'Appeals queue', screenId: 'PRC-18' },
  ],
  note: 'Tests keep the defaults that applied when they were published; change a published test from the test builder.',
};

export const GROUP_5: SettingsGroupDef = {
  id: 5,
  title: 'Documents & Communication',
  summary: 'Document types, letters, signatories, notifications, WhatsApp and SMS, announcements, policies, helpdesk and Engage.',
  pages: [documentTypes, letters, signatories, notifications, whatsappSms, announcements, policies, helpdesk, engage],
};

export const GROUP_6: SettingsGroupDef = {
  id: 6,
  title: 'Hiring & Assessments',
  summary: 'Hiring, the staffing desk, performance, learning and assessments.',
  pages: [hiring, staffing, performance, learning, assessments],
};
