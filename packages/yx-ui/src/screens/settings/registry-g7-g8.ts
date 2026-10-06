// Settings map · Group 7 · Integrations & Developers (pages 7.1–7.9) and Group 8 · Billing & Account (pages 8.1–8.6), APX-D §3.
// Sources: P10 (AI layer & integration hub), P11 (API-first), P09 (metrics, product analytics §4.10), T04 YX-PROC-20, M10 YX-ATS-32,
// P14 (billing & tenant lifecycle), P15 (sandbox), P20 (growth, status page), P04 Q3 (SMS), P16 Q3 (partner billing), P23 (assistants),
// PRICING-UNIT-ECONOMICS.md (price, minimums, payment rails). Plain data only. Sample company: Kaveri Foods Pvt Ltd (248 employees).
import type { SettingsGroupDef, SettingsPageDef } from './settings-types';

const COMPANY = 'Company';
const KA = 'Kaveri Foods Pvt Ltd';
const TN = 'Kaveri Foods Pvt Ltd (Tamil Nadu)';

/* ================================================================
 * GROUP 7 · INTEGRATIONS & DEVELOPERS
 * ================================================================ */

/* ---------------- 7.1 Integrations ---------------- */
const integrations: SettingsPageDef = {
  id: '7.1',
  group: 7,
  title: 'Integrations',
  summary:
    'See every connection your company uses, who owns it and whether it is healthy. Connect new systems from the catalogue and fix failed runs on the Jobs & errors page.',
  owner: ['P10'],
  contributes: ['P04', 'P15', 'P19'],
  permission: 'integrations.manage',
  permissionHolder: 'System admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Connections',
      description: 'Every connection has an owner, encrypted credentials, a health status and run logs. Failures notify the owner.',
      settings: [
        {
          key: 'integrations.connections',
          label: 'Connections',
          kind: 'list',
          columns: ['Connection', 'Area', 'Owner', 'Health', 'Last run'],
          rows: [
            ['Biometric device (cloud) · Hosur plant', 'Attendance', 'Arjun Kulkarni', 'Healthy', '28 Sep 2026, 5:40 pm'],
            ['Cauvery Co-operative Bank · salary file', 'Payouts', 'Suresh Pillai', 'Healthy', '26 Sep 2026, 11:02 am'],
            ['Accounting software (voucher file)', 'Accounting', 'Meera Iyer', 'Healthy', '27 Sep 2026, 6:15 pm'],
            ['PAN and bank verification partner', 'Verification', 'Lakshmi Venkatesan', '2 failures today', '28 Sep 2026, 4:58 pm'],
            ['Chat app · Kaveri workspace', 'Chat', 'Arjun Kulkarni', 'Healthy', '28 Sep 2026, 5:55 pm'],
            ['Job boards (own accounts)', 'Hiring', 'Neha Joshi', 'Needs sign-in again', '24 Sep 2026, 9:30 am'],
          ],
          addLabel: 'Add connection',
          scope: COMPANY,
          synonyms: ['connector', 'integration', 'sync', 'health'],
        },
        {
          key: 'integrations.catalogue',
          label: 'Integrations catalogue',
          kind: 'link',
          linkScreenId: 'PLT-14',
          linkLabel: 'Open integrations catalogue',
          helper: 'Browse by area, run connect wizards (sign-in, key, agent download, device registration), health cards, run logs and mappings.',
          synonyms: ['connect wizard', 'marketplace', 'apps'],
        },
        {
          key: 'integrations.default_owner',
          label: 'Default owner for new connections',
          kind: 'select',
          value: 'Arjun Kulkarni (System Admin)',
          options: ['Arjun Kulkarni (System Admin)', 'Meera Iyer (Finance Manager)', 'Suresh Pillai (Payroll Manager)', 'Neha Joshi (Talent Acquisition Lead)', 'Lakshmi Venkatesan (HR Business Partner)'],
          helper: 'The person who set up a connection owns it unless you choose someone else.',
          starter: true,
        },
      ],
    },
    {
      title: 'Failures and retries',
      description: 'Failed deliveries, sync jobs, imports, notifications and automations all land on one Jobs & errors page.',
      settings: [
        {
          key: 'integrations.jobs_errors',
          label: 'Jobs & errors',
          kind: 'link',
          linkScreenId: 'PLT-38',
          linkLabel: 'Open jobs & errors',
          helper: '3 open items: 2 verification failures and 1 job-board sign-in. Retry, skip with reason or open the record.',
          synonyms: ['failed jobs', 'errors', 'retry', 'dead letter'],
        },
        { key: 'integrations.retry_attempts', label: 'Automatic retries before a job is marked failed', kind: 'number', value: 5, unit: 'attempts', min: 1, max: 10, helper: 'Retries wait longer each time. Retrying is safe: duplicates are ignored.', starter: true, synonyms: ['retry', 'backoff'] },
        { key: 'integrations.notify_owner', label: 'Tell the connection owner about failures', kind: 'radio', value: 'At once', options: ['At once', 'Daily digest at 9:00 am'], starter: true },
        {
          key: 'integrations.unowned_escalation',
          label: 'Failures without an owner go to the System Admin',
          kind: 'law',
          value: 'Always on',
          law: 'YukthiX rule YX-INT-10: nothing fails silently',
        },
        { key: 'integrations.health_card', label: 'Show the connection health card on the admin home', kind: 'toggle', value: true, starter: true },
      ],
    },
    {
      title: 'Delivery and security',
      settings: [
        {
          key: 'integrations.url_allowlist',
          label: 'Allowed outbound addresses',
          kind: 'list',
          columns: ['Address', 'Used by', 'Added by'],
          rows: [
            ['https://erp.kaverifoods.in', 'Accounting API callbacks', 'Meera Iyer'],
            ['https://hooks.kaverifoods.in', 'Webhooks', 'Arjun Kulkarni'],
            ['sftp://files.cauverybank.example', 'Salary file delivery', 'Suresh Pillai'],
          ],
          addLabel: 'Add address',
          helper: 'Connections can only send data to these addresses.',
          sensitive: true,
          synonyms: ['allow-list', 'whitelist', 'outbound'],
        },
        { key: 'integrations.sftp_delivery', label: 'Deliver generated files by SFTP where the bank supports it', kind: 'toggle', value: true, helper: 'Files are still stored as documents and every download is recorded.' },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-24T10:12', what: 'Made Neha Joshi the owner of the job boards connection' },
  related: [
    { label: 'Integrations catalogue', screenId: 'PLT-14' },
    { label: 'Jobs & errors', screenId: 'PLT-38' },
    { label: 'Audit log', screenId: 'PLT-16' },
  ],
};

/* ---------------- 7.2 Biometric devices ---------------- */
const biometricDevices: SettingsPageDef = {
  id: '7.2',
  group: 7,
  title: 'Biometric devices',
  summary:
    'Register your attendance devices, choose how their punches reach YukthiX (cloud push, on-site sync agent or CSV) and map each device enrolment ID to an employee.',
  owner: ['P10'],
  contributes: ['M02'],
  permission: 'integrations.manage',
  permissionHolder: 'System admins',
  scopes: ['Company', 'Legal entity', 'Location'],
  sections: [
    {
      title: 'Devices',
      settings: [
        {
          key: 'biometric.devices',
          label: 'Devices',
          kind: 'list',
          columns: ['Device', 'Location', 'Route', 'Last punch', 'Status'],
          rows: [
            ['Biometric device (cloud) · Gate 1', 'Hosur plant', 'Cloud push', '28 Sep 2026, 5:58 pm', 'Online'],
            ['Biometric device (cloud) · Canteen', 'Hosur plant', 'Cloud push', '28 Sep 2026, 2:14 pm', 'Online'],
            ['Biometric device (LAN) · Main door', 'Hosur plant', 'Sync agent', '28 Sep 2026, 5:51 pm', 'Online'],
            ['Biometric device (LAN) · Stores', 'Chennai office', 'Sync agent', '27 Sep 2026, 8:03 pm', 'Agent offline 22 h'],
            ['Head office reader', 'Bengaluru head office', 'CSV import', '28 Sep 2026, 9:00 am (file)', 'Manual'],
          ],
          addLabel: 'Register device',
          scope: COMPANY,
          synonyms: ['biometric', 'punch machine', 'attendance device', 'fingerprint'],
        },
        {
          key: 'biometric.default_route',
          label: 'Default route for new devices',
          kind: 'radio',
          value: 'Cloud push',
          options: ['Cloud push', 'On-site sync agent', 'CSV import'],
          helper: 'Cloud push for devices that can send to the internet; the sync agent (a small Windows service) for LAN-only devices; CSV when neither works.',
          starter: true,
          synonyms: ['ADMS', 'sync agent', 'CSV'],
        },
        {
          key: 'biometric.connect_wizard',
          label: 'Device registration and sync agent',
          kind: 'link',
          linkScreenId: 'PLT-14',
          linkLabel: 'Register a device or download the agent',
          helper: 'The wizard gives the device server address, checks the first punch and installs the agent.',
        },
        { key: 'biometric.agent_offline_alert', label: 'Alert the owner when a device or agent is silent for', kind: 'number', value: 12, unit: 'hours', min: 1, max: 72, starter: true },
      ],
    },
    {
      title: 'Enrolment-ID mapping',
      description: 'Each device knows people by the enrolment number typed at the device. Map it to the employee once.',
      settings: [
        {
          key: 'biometric.enrolment_map',
          label: 'Enrolment IDs',
          kind: 'list',
          columns: ['Enrolment ID', 'Employee', 'Device group', 'Mapped on'],
          rows: [
            ['1042', 'KF-0142 · Ramesh Gowda', 'Hosur plant', '12 Jun 2026'],
            ['1043', 'KF-0143 · Kavya Rao', 'Hosur plant', '12 Jun 2026'],
            ['2007', 'KF-0207 · Selvam Murugan', 'Hosur plant', '3 Jul 2026'],
            ['3011', 'KF-0231 · Divya Narayanan', 'Chennai office', '19 Aug 2026'],
          ],
          addLabel: 'Map enrolment ID',
          helper: '231 of 248 employees mapped. 17 office staff do not punch.',
          synonyms: ['enrolment', 'device user ID', 'mapping'],
        },
        { key: 'biometric.match_by_employee_code', label: 'Match automatically when the enrolment ID equals the employee number', kind: 'toggle', value: false, starter: true },
        {
          key: 'biometric.unmapped_punches',
          label: 'Punches from an unmapped enrolment ID',
          kind: 'radio',
          value: 'Hold for mapping and alert the owner',
          options: ['Hold for mapping and alert the owner', 'Drop and log'],
          starter: true,
        },
      ],
    },
    {
      title: 'Punch handling',
      settings: [
        { key: 'biometric.dedupe_window', label: 'Treat repeat punches as one within', kind: 'number', value: 2, unit: 'minutes', min: 0, max: 15, helper: 'Duplicate punches from the device or a re-sent file are ignored.', starter: true, synonyms: ['duplicate punch'] },
        { key: 'biometric.csv_template', label: 'CSV import columns', kind: 'text', value: 'enrolment_id, date, time, device_code, direction', locked: 'A fixed format, used for the CSV route and for back-filling after an outage.', lockedAction: { label: 'Download CSV template', screenId: 'PLT-14' } },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-08-19T15:40', what: 'Registered the Chennai office stores device on the sync agent route' },
  related: [
    { label: 'Integrations catalogue', screenId: 'PLT-14' },
    { label: 'Jobs & errors', screenId: 'PLT-38' },
  ],
  note: 'Face check-in is set in Check-in & devices, not here.',
};

/* ---------------- 7.3 Payouts, banks & accounting ---------------- */
const payoutsBanksAccounting: SettingsPageDef = {
  id: '7.3',
  group: 7,
  title: 'Payouts, banks & accounting',
  summary:
    'Choose the bank file format for each salary account, switch on the payout partner if you use it, and map pay components to ledgers and cost centres for your accounting software.',
  owner: ['P10'],
  contributes: ['M03', 'M10', 'P14'],
  permission: 'integrations.payroll.manage',
  permissionHolder: 'System admins and Finance managers',
  scopes: ['Company', 'Legal entity'],
  note: 'Changes on this page need a second approver.',
  sections: [
    {
      title: 'Bank files',
      settings: [
        {
          key: 'payouts.bank_formats',
          label: 'Salary bank accounts and file formats',
          kind: 'list',
          columns: ['Entity', 'Debit account', 'File format', 'Delivery'],
          rows: [
            [KA, 'Cauvery Co-operative Bank ••••4410', 'Cauvery Co-operative Bank bulk upload', 'SFTP'],
            [TN, 'Cauvery Co-operative Bank ••••7722', 'Cauvery Co-operative Bank bulk upload', 'Download'],
            [KA, 'Deccan Traders Bank ••••0915 (reimbursements)', 'Generic NEFT / RTGS (CSV)', 'Download'],
          ],
          addLabel: 'Add bank account',
          sensitive: true,
          scope: 'Per legal entity',
          synonyms: ['bank file', 'salary upload', 'NEFT', 'RTGS'],
        },
        {
          key: 'payouts.maker_checker',
          label: 'Bank file release needs a second person',
          kind: 'law',
          value: 'Always on',
          law: 'YukthiX rule YX-INT-03: maker and checker must be different people',
          helper: 'The person who generates a bank file cannot release it.',
          synonyms: ['maker checker', 'release'],
        },
      ],
    },
    {
      title: 'Payout partner (add-on)',
      description: 'Pays salaries through one partner and returns paid / failed status per employee to payroll.',
      settings: [
        {
          key: 'payouts.partner_enabled',
          label: 'Pay salaries through the payout partner',
          kind: 'toggle',
          value: false,
          helper: 'Priced per payout. Needs the partner’s business checks, a funding account and a balance check before the first release.',
          availability: 'Wave 3 · add-on',
          starter: true,
          synonyms: ['payout API', 'payout partner', 'disbursement'],
        },
        {
          key: 'payouts.readiness',
          label: 'Payout readiness checklist',
          kind: 'link',
          linkScreenId: 'PLT-54',
          linkLabel: 'Check payout readiness',
          helper: 'Mandate, KYB, funding account and balance status.',
        },
        {
          key: 'payouts.short_balance',
          label: 'When the funding balance is short',
          kind: 'radio',
          value: 'Ask me: pay selected people or wait',
          options: ['Ask me: pay selected people or wait', 'Always wait for full funds'],
          helper: 'Unpaid lines stay open and are never marked paid.',
          starter: true,
        },
      ],
    },
    {
      title: 'Accounting',
      settings: [
        {
          key: 'accounting.target',
          label: 'Send payroll journals to',
          kind: 'radio',
          value: 'Accounting software (voucher file)',
          options: ['Accounting software (voucher file)', 'Accounting software (API posting)', 'Spreadsheet / CSV', 'Accounting API (your own system)'],
          scope: 'Per legal entity',
          synonyms: ['accounting export', 'journal', 'voucher', 'ledger export'],
        },
        {
          key: 'accounting.ledger_map',
          label: 'Ledger and cost-centre mapping',
          kind: 'list',
          columns: ['Pay component', 'Ledger', 'Cost centre', 'Entity'],
          rows: [
            ['Basic salary', 'Salaries and wages', 'By department', 'Both'],
            ['Employer PF', 'Contribution to provident fund', 'By department', 'Both'],
            ['Employer ESI', 'Contribution to ESI', 'Hosur plant', TN],
            ['Professional tax deducted', 'PT payable', 'None', 'Both'],
            ['Net pay', 'Salary payable', 'None', 'Both'],
          ],
          addLabel: 'Map component',
          dated: { validFrom: '2026-04-01' },
          synonyms: ['ledger mapping', 'cost centre', 'GL'],
        },
        {
          key: 'accounting.mapping_screen',
          label: 'Full mapping screen',
          kind: 'link',
          linkScreenId: 'PLT-14',
          linkLabel: 'Open accounting mappings',
          helper: 'All 42 components, split rules and a test journal for last month.',
        },
        {
          key: 'accounting.split_basis',
          label: 'Split shared costs across cost centres by',
          kind: 'select',
          value: 'Cost-centre split on the employee record',
          options: ['Cost-centre split on the employee record', 'Days worked per cost centre', 'Timesheet hours per project', 'No split (primary cost centre)'],
          starter: true,
        },
        {
          key: 'accounting.journal_detail',
          label: 'Journal detail',
          kind: 'radio',
          value: 'Totals by entity and cost centre',
          options: ['Totals by entity and cost centre', 'One line per employee'],
          helper: 'Per-employee lines go only to API keys allowed to see salaries.',
          starter: true,
        },
        { key: 'accounting.api_webhook', label: 'Send the "payroll journal ready" webhook', kind: 'toggle', value: false, helper: 'For the Accounting API: your system fetches the journal and calls "mark posted".', synonyms: ['accounting API', 'journal webhook'] },
        { key: 'accounting.staffing_invoices', label: 'Include staffing invoices and credit notes in the export', kind: 'toggle', value: false, contributedBy: 'M10' },
      ],
    },
  ],
  lastChange: { by: 'Meera Iyer', role: 'Finance Manager', at: '2026-09-02T12:25', what: 'Mapped Employer ESI to the Hosur plant cost centre (approved by Suresh Pillai)' },
  related: [
    { label: 'Integrations catalogue', screenId: 'PLT-14' },
    { label: 'Payout readiness', screenId: 'PLT-54' },
    { label: 'Jobs & errors', screenId: 'PLT-38' },
  ],
};

/* ---------------- 7.4 Verification ---------------- */
const verification: SettingsPageDef = {
  id: '7.4',
  group: 7,
  title: 'Verification',
  summary:
    'Switch automatic PAN and bank-account (penny drop) checks on or off per check type. A passed check marks the document verified; failures go to HR’s verification queue.',
  owner: ['P10'],
  contributes: ['P05', 'M01'],
  permission: 'integrations.manage',
  permissionHolder: 'System admins and HR admins',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Automatic checks',
      description: 'Run through the verification partner. On by default; switch off to verify by hand.',
      settings: [
        { key: 'verify.pan', label: 'PAN verification', kind: 'toggle', value: true, helper: 'Checks the PAN and name against the tax department record.', starter: true, scope: COMPANY, synonyms: ['PAN check', 'PAN verification'] },
        { key: 'verify.penny_drop', label: 'Bank account check (penny drop)', kind: 'toggle', value: true, helper: 'Sends ₹1 to the account and compares the account holder name.', starter: true, scope: COMPANY, synonyms: ['penny drop', 'bank verification', 'account check'] },
        {
          key: 'verify.ekyc',
          label: 'Aadhaar OTP eKYC and document pull at onboarding',
          kind: 'toggle',
          value: false,
          helper: 'Partner add-on, per verification. Upload with in-region reading is always offered as another path.',
          availability: 'Add-on',
          starter: true,
          synonyms: ['eKYC', 'Aadhaar', 'document pull'],
        },
        {
          key: 'verify.aadhaar_consent',
          label: 'Aadhaar eKYC needs the person’s consent and stores only the last 4 digits',
          kind: 'law',
          value: 'Always on',
          law: 'Aadhaar (Targeted Delivery of Financial and Other Subsidies, Benefits and Services) Act, 2016 s.8 and s.29; DPDP Act, 2023 s.6',
        },
      ],
    },
    {
      title: 'Results',
      settings: [
        {
          key: 'verify.name_match',
          label: 'Name match needed to pass',
          kind: 'radio',
          value: 'Close match (initials and spacing ignored)',
          options: ['Exact match', 'Close match (initials and spacing ignored)'],
          helper: 'Anything else goes to the verification queue as a name mismatch.',
          starter: true,
        },
        {
          key: 'verify.queue_owner',
          label: 'Verification queue owner',
          kind: 'select',
          value: 'Lakshmi Venkatesan (HR Business Partner)',
          options: ['Lakshmi Venkatesan (HR Business Partner)', 'Suresh Pillai (Payroll Manager)', 'Arjun Kulkarni (System Admin)'],
        },
        {
          key: 'verify.cost_mode',
          label: 'Per-check cost',
          kind: 'radio',
          value: 'Billed to us per check',
          options: ['Billed to us per check', 'Included in our plan allowance'],
          helper: 'Current price: ₹3 per PAN check, ₹2.50 per penny drop. See Plan & add-ons.',
        },
      ],
    },
  ],
  lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-07-08T11:30', what: 'Changed name matching from exact to close match' },
  related: [
    { label: 'Plan & add-ons', screenId: 'PLT-19' },
    { label: 'Jobs & errors', screenId: 'PLT-38' },
  ],
};

/* ---------------- 7.5 Calendar & chat ---------------- */
const calendarChat: SettingsPageDef = {
  id: '7.5',
  group: 7,
  title: 'Calendar & chat',
  summary:
    'Connect your work calendar and chat app for interviews, out-of-office, approvals and announcements, and choose which read-only tools employees may connect to pre-fill timesheets.',
  owner: ['P10'],
  contributes: ['P04', 'P23', 'M09'],
  permission: 'integrations.manage',
  permissionHolder: 'System admins',
  scopes: ['Company'],
  sections: [
    {
      title: 'Work calendar',
      settings: [
        { key: 'calendar.provider', label: 'Work calendar', kind: 'text', value: 'Kaveri Foods company calendar (kaverifoods.in)', status: { tone: 'success', text: 'Connected' }, locked: 'Used for interview booking and out-of-office. Connected by Arjun Kulkarni on 3 Jun 2026.', lockedAction: { label: 'Change calendar', screenId: 'PLT-14' }, scope: COMPANY, synonyms: ['calendar', 'free busy'] },
        { key: 'calendar.interviews', label: 'Book interviews with free / busy and meeting links', kind: 'toggle', value: true, contributedBy: 'M10' },
        { key: 'calendar.leave_ooo', label: 'Add approved leave as out-of-office', kind: 'toggle', value: true, starter: true, synonyms: ['out of office', 'OOO'] },
      ],
    },
    {
      title: 'Chat app',
      settings: [
        {
          key: 'chat.apps',
          label: 'Chat app connections',
          kind: 'list',
          columns: ['App', 'Workspace', 'Installed by', 'Linked users', 'Status'],
          rows: [
            ['Chat app', 'Kaveri Foods', 'Arjun Kulkarni', '164 of 248', 'Connected'],
            ['Team chat (second app)', 'Kaveri Sales', 'Arjun Kulkarni', '38 of 52', 'Connected'],
          ],
          addLabel: 'Install chat app',
          helper: 'Installed with admin consent. The app acts only for people who linked their account.',
          synonyms: ['chat', 'bot', 'approvals in chat'],
        },
        { key: 'chat.approval_cards', label: 'Send approve / reject cards in chat', kind: 'toggle', value: true, contributedBy: 'P04' },
        { key: 'chat.engage_mirror', label: 'Mirror announcements and celebrations to a chat channel', kind: 'toggle', value: true, helper: 'One way: replies in chat do not come back.', contributedBy: 'M09' },
        { key: 'chat.mirror_channel', label: 'Mirror channel', kind: 'text', value: '#kaveri-announcements', contributedBy: 'M09' },
        {
          key: 'mailbox.sync',
          label: 'Let recruiters and helpdesk agents sync their mailbox',
          kind: 'toggle',
          value: false,
          helper: 'Only threads with a known candidate or ticket are imported. Replies go from the person’s own mailbox.',
          synonyms: ['email sync', 'mailbox'],
        },
      ],
    },
    {
      title: 'Timesheet pre-fill connectors (per employee)',
      description: 'Employees connect and revoke their own read-only access. Titles, times and durations only; tokens are deleted on revoke or exit.',
      settings: [
        { key: 'timesheet_connect.calendar', label: 'Work calendar (read-only)', kind: 'toggle', value: true, contributedBy: 'P23', availability: 'Wave 5', synonyms: ['timesheet pre-fill', 'auto-fill'] },
        { key: 'timesheet_connect.issues', label: 'Issue tracker (read-only)', kind: 'toggle', value: true, helper: 'Issue key, title, project, status and work-log times. Comments and attachments are never read.', contributedBy: 'P23', availability: 'Wave 5' },
        { key: 'timesheet_connect.code', label: 'Code host (read-only)', kind: 'toggle', value: false, helper: 'Repository names, pull-request and commit titles and times. Code is never read.', contributedBy: 'P23', availability: 'Wave 5' },
        {
          key: 'timesheet_connect.raw_items_private',
          label: 'Raw calendar and tool items are visible only to the employee',
          kind: 'law',
          value: 'Always on',
          law: 'DPDP Act, 2023 s.4 (use only for the stated purpose)',
        },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-15T16:20', what: 'Switched off the code host connector for timesheet pre-fill' },
  related: [
    { label: 'Chat app', screenId: 'PLT-29' },
    { label: 'Integrations catalogue', screenId: 'PLT-14' },
    { label: 'My timesheet · pre-fill', screenId: 'TIM-43' },
  ],
};

/* ---------------- 7.6 AI ---------------- */
const ai: SettingsPageDef = {
  id: '7.6',
  group: 7,
  title: 'AI',
  summary:
    'Switch AI features and assistants on or off, choose the managed provider or your own key, and see what data each feature may use and how many credits you have used. AI suggests; a person always decides.',
  owner: ['P10'],
  contributes: ['P23', 'P09', 'M08', 'M06'],
  permission: 'ai.settings.manage',
  permissionHolder: 'System admins',
  scopes: ['Company'],
  sections: [
    {
      title: 'Provider',
      settings: [
        {
          key: 'ai.provider',
          label: 'AI provider',
          kind: 'radio',
          value: 'Managed AI provider',
          options: ['Managed AI provider', 'Your own AI key'],
          helper: 'Managed: YukthiX picks the model per feature and region; use counts against your AI credits.',
          starter: true,
          synonyms: ['AI provider', 'LLM', 'own key', 'BYO key'],
        },
        { key: 'ai.own_key', label: 'Your own AI key', kind: 'text', value: null, helper: 'Stored encrypted. Use counts against your own AI account, not your credits.', sensitive: true, showWhen: { key: 'ai.provider', equals: 'Your own AI key' } },
        {
          key: 'ai.no_training',
          label: 'Providers may not train on your data',
          kind: 'law',
          value: 'Always on',
          law: 'YukthiX rule: providers are listed as sub-processors and contractually barred from training on your data',
        },
        {
          key: 'ai.region',
          label: 'AI processing region',
          kind: 'law',
          value: 'India',
          law: 'DPDP Act, 2023 s.16 (transfer outside India)',
          helper: 'AI calls use providers and endpoints in your data region.',
          synonyms: ['data localisation', 'region'],
        },
        { key: 'ai.governance', label: 'Model cards, eval scores and overrides', kind: 'link', linkScreenId: 'PLT-28', linkLabel: 'Open AI quality & governance', helper: 'Read-only: live model, region, last evaluation and bias-test summary per feature.' },
      ],
    },
    {
      title: 'Features',
      description: 'Each feature is opt-in and every call is recorded.',
      settings: [
        { key: 'ai.feature.receipts', label: 'Receipt reading for claims', kind: 'toggle', value: true, helper: 'Reads date, merchant, amount and GST; the employee confirms before submitting.', availability: 'Wave 5' },
        { key: 'ai.feature.doc_extraction', label: 'Document reading (PAN, certificates)', kind: 'toggle', value: true, helper: 'In-region reading only, never sent to an external AI model.' },
        { key: 'ai.feature.drafting', label: 'Drafting help (letters, announcements, job descriptions, goals)', kind: 'toggle', value: true, starter: true },
        { key: 'ai.feature.review_summaries', label: 'AI review summaries', kind: 'toggle', value: false, helper: 'Sends performance text. Summarises only; never scores.', contributedBy: 'M06', availability: 'Wave 5' },
        { key: 'ai.feature.ask_analytics', label: 'Ask analytics', kind: 'toggle', value: false, helper: 'Answers only from governed metrics, with the asker’s permissions.', contributedBy: 'P09', availability: 'Wave 5' },
        { key: 'ai.feature.helpdesk', label: 'Helpdesk answers from your policies', kind: 'toggle', value: false, helper: 'Cites your documents; when unsure it opens a case for HR.', contributedBy: 'M08', availability: 'Wave 5', synonyms: ['policy Q&A', 'AI helpdesk'] },
        { key: 'ai.feature.ai_interview', label: 'AI interview scoring', kind: 'toggle', value: false, helper: 'Advisory scores only; a person decides. Only the text transcript leaves the region.', contributedBy: 'M10', availability: 'Wave 7' },
        { key: 'ai.feature.anomaly_hints', label: 'Anomaly hints (payroll variance, duplicate claims, unusual overtime)', kind: 'toggle', value: true },
        { key: 'ai.feature.copilots', label: 'Employee and manager copilots in the app and chat', kind: 'toggle', value: false, helper: 'Copilots prepare requests; the person confirms every action.', availability: 'Wave 5' },
        { key: 'ai.agent_actions', label: 'Agent actions log', kind: 'link', linkScreenId: 'PLT-48', linkLabel: 'View agent actions', helper: 'Every AI-proposed action, who confirmed it and undo where allowed.' },
      ],
    },
    {
      title: 'Assistants',
      description: 'Each helper can be switched off for the whole company.',
      settings: [
        { key: 'ai.assistant.payslip_chat', label: 'Payslip chat ("Why is my pay different?")', kind: 'toggle', value: true, helper: 'The rule-based explanation is always on; this adds the chat.', contributedBy: 'P23', availability: 'Wave 5' },
        { key: 'ai.assistant.policy_writer', label: 'Policy writer', kind: 'toggle', value: true, helper: 'Drafts policy text; HR approves before loading. Not legal advice.', contributedBy: 'P23', availability: 'Wave 5' },
        { key: 'ai.assistant.timesheet', label: 'Timesheet AI suggestions', kind: 'toggle', value: true, helper: 'Suggestions only; the employee submits.', contributedBy: 'P23', availability: 'Wave 5' },
        { key: 'ai.assistant.manager_coach', label: 'Manager coach', kind: 'toggle', value: false, helper: 'Weekly nudges from data the manager already sees. Managers can opt out.', contributedBy: 'P23', availability: 'Wave 5' },
        { key: 'ai.assistant.review', label: 'Review assistant with bias check', kind: 'toggle', value: false, helper: 'Needs AI review summaries on. The manager’s text and rating stay final.', contributedBy: 'P23', availability: 'Wave 5' },
      ],
    },
    {
      title: 'Data handling',
      settings: [
        {
          key: 'ai.data.special',
          label: 'Special data never goes to external AI (Aadhaar, health, biometrics, POSH, disciplinary)',
          kind: 'law',
          value: 'Always on',
          law: 'DPDP Act, 2023 s.8(5) (reasonable safeguards)',
          synonyms: ['sensitive data', 'AI privacy'],
        },
        { key: 'ai.data.mask_confidential', label: 'Mask salary, bank and PAN numbers before any AI call', kind: 'toggle', value: true, helper: 'Switch off only for a feature YukthiX has approved for these values.', starter: true, sensitive: true },
        {
          key: 'ai.data.per_feature',
          label: 'What each feature sends',
          kind: 'list',
          columns: ['Feature', 'Data sent', 'Where'],
          rows: [
            ['Receipt reading', 'Receipt image', 'Managed AI provider, India'],
            ['Document reading', 'PAN, certificates', 'In-region reading, never external'],
            ['Drafting help', 'Non-sensitive text', 'Managed AI provider, India'],
            ['Anomaly hints', 'Totals and non-sensitive features', 'Managed AI provider, India'],
          ],
          readOnlyList: true,
        },
        {
          key: 'ai.data.prompt_retention',
          label: 'Prompts containing confidential data are not stored',
          kind: 'law',
          value: 'Always on',
          law: 'DPDP Act, 2023 s.8(7) (erase when the purpose is served)',
        },
      ],
    },
    {
      title: 'Credits',
      settings: [
        { key: 'ai.credits_used', label: 'AI credits used this month', kind: 'usage', value: 4380, max: 12000, unit: 'credits', helper: 'Resets on 1 Oct 2026. More credits in Usage & caps.', synonyms: ['AI credits', 'AI usage'] },
        { key: 'ai.credits_alert', label: 'Alert me when credits used reach', kind: 'percent', value: 80, min: 50, max: 100, starter: true },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-21T14:05', what: 'Switched on the policy writer and timesheet AI assistants' },
  related: [
    { label: 'AI quality & governance', screenId: 'PLT-28' },
    { label: 'Agent actions log', screenId: 'PLT-48' },
    { label: 'Usage & caps', screenId: 'PLT-19' },
  ],
};

/* ---------------- 7.7 Developers ---------------- */
const developers: SettingsPageDef = {
  id: '7.7',
  group: 7,
  title: 'Developers',
  summary:
    'Manage API keys (scopes, field classes, IP allow-list, expiry), connected OAuth apps and webhook endpoints. API access is included in your plan with fair-use limits.',
  owner: ['P11'],
  contributes: ['P02'],
  permission: 'developers.manage',
  permissionHolder: 'System admins and developer admins',
  scopes: ['Company'],
  sections: [
    {
      title: 'API keys',
      description: 'A key can never do more than its owner or grant allows, including which private fields it sees.',
      settings: [
        {
          key: 'dev.api_keys',
          label: 'API keys',
          kind: 'list',
          columns: ['Name', 'Key', 'Scopes', 'Field classes', 'IP allow-list', 'Expires'],
          rows: [
            ['ERP journal sync', 'yx_live_••••7f3a', 'payroll.journals:read', 'Internal, Confidential', '103.21.44.0/24', '31 Mar 2027'],
            ['Canteen headcount', 'yx_live_••••c219', 'attendance:read', 'Internal', '103.21.44.18', '30 Jun 2027'],
            ['Intranet org chart', 'yx_live_••••0b8e', 'employees:read, org:read', 'Internal', 'Any', '31 Dec 2026'],
          ],
          addLabel: 'Create API key',
          sensitive: true,
          synonyms: ['API key', 'token', 'integration key'],
        },
        { key: 'dev.key_default_expiry', label: 'Default expiry for new keys', kind: 'number', value: 365, unit: 'days', min: 30, max: 730, starter: true },
        { key: 'dev.key_rotation_overlap', label: 'Old key keeps working after rotation for', kind: 'number', value: 48, unit: 'hours', min: 0, max: 168, starter: true, synonyms: ['rotate key'] },
        { key: 'dev.require_ip_allowlist', label: 'Require an IP allow-list for keys with Confidential field classes', kind: 'toggle', value: true, sensitive: true },
      ],
    },
    {
      title: 'OAuth apps',
      settings: [
        {
          key: 'dev.oauth_apps',
          label: 'Connected apps',
          kind: 'list',
          columns: ['App', 'Grant type', 'Scopes', 'Connected by', 'Connected on'],
          rows: [
            ['Expense scanner (reviewed partner)', 'Authorization code', 'claims:write, employees:read', 'Meera Iyer', '11 Jul 2026'],
            ['Payroll audit tool (reviewed partner)', 'Client credentials', 'payroll:read', 'Suresh Pillai', '4 Aug 2026'],
          ],
          addLabel: 'Connect app',
          helper: 'Only apps reviewed by YukthiX can be listed. Revoke any time.',
          synonyms: ['OAuth', 'connected apps', 'partner app'],
        },
      ],
    },
    {
      title: 'Webhooks',
      settings: [
        {
          key: 'dev.webhooks',
          label: 'Webhook endpoints',
          kind: 'list',
          columns: ['Endpoint', 'Events', 'Status', 'Last delivery'],
          rows: [
            ['https://hooks.kaverifoods.in/hr', 'employee.*, leave.approved', 'Active', '28 Sep 2026, 5:47 pm · 200'],
            ['https://erp.kaverifoods.in/payroll', 'payroll.journal.ready', 'Active', '26 Sep 2026, 11:05 am · 200'],
            ['https://old-intranet.kaverifoods.in/hook', 'announcement.published', 'Disabled after 24 h of failures', '12 Sep 2026, 3:10 pm · 503'],
          ],
          addLabel: 'Add endpoint',
          helper: 'Signed with HMAC-SHA256 and a timestamp. Retries for 24 hours, then the endpoint is disabled and you are alerted.',
          synonyms: ['webhook', 'events', 'callback'],
        },
        {
          key: 'dev.thin_payloads',
          label: 'Confidential and Special events send IDs and change type only',
          kind: 'law',
          value: 'Always on',
          law: 'DPDP Act, 2023 s.8(5) (reasonable safeguards)',
        },
        { key: 'dev.webhook_alert', label: 'Send webhook failure alerts to', kind: 'text', value: 'it-alerts@kaverifoods.in' },
      ],
    },
    {
      title: 'Console and usage',
      settings: [
        {
          key: 'dev.console',
          label: 'Developer console',
          kind: 'link',
          linkScreenId: 'PLT-15',
          linkLabel: 'Open developer console',
          helper: 'Create and rotate keys, webhook delivery log with replay, test events and usage charts.',
          synonyms: ['delivery log', 'replay', 'test event'],
        },
        { key: 'dev.calls_month', label: 'API calls this month', kind: 'usage', value: 184230, max: 1500000, unit: 'calls', helper: 'Fair-use limit: 50,000 a day, 600 a minute. Limits in Usage & caps.' },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-12T15:32', what: 'Rotated the "ERP journal sync" key' },
  related: [
    { label: 'Developer console', screenId: 'PLT-15' },
    { label: 'Jobs & errors', screenId: 'PLT-38' },
    { label: 'Usage & caps', screenId: 'PLT-19' },
  ],
};

/* ---------------- 7.8 Analytics ---------------- */
const analytics: SettingsPageDef = {
  id: '7.8',
  group: 7,
  title: 'Analytics',
  summary:
    'Decide who counts in attrition, add your own calculated metrics over governed ones, and set defaults for scheduled reports and dashboard deliveries.',
  owner: ['P09'],
  permission: 'analytics.settings.manage',
  permissionHolder: 'HR admins and System admins',
  scopes: ['Company'],
  note: 'Hiding small groups in reports is set in Directory & privacy.',
  sections: [
    {
      title: 'Attrition',
      description: 'Attrition = exits ÷ average headcount, monthly and annualised. Permanent and probation employees count by default.',
      settings: [
        { key: 'analytics.attrition.contractors', label: 'Include contractors in the main attrition figure', kind: 'toggle', value: false, helper: 'Off: contractors are shown as a separate series.', starter: true, synonyms: ['attrition', 'turnover', 'contractors'] },
        { key: 'analytics.attrition.interns', label: 'Include interns in the main attrition figure', kind: 'toggle', value: false, helper: 'Off: interns are shown as a separate series.', starter: true, synonyms: ['interns'] },
        { key: 'analytics.attrition.early_window', label: 'Early attrition means leaving within', kind: 'radio', value: '90 days', options: ['90 days', '180 days'], starter: true },
      ],
    },
    {
      title: 'Calculated metrics',
      settings: [
        {
          key: 'analytics.calc_metrics',
          label: 'Your calculated metrics',
          kind: 'list',
          columns: ['Metric', 'Formula', 'Sensitivity', 'Owner'],
          rows: [
            ['Overtime cost per head', 'Overtime cost ÷ Headcount', 'Confidential', 'Suresh Pillai'],
            ['Plant absenteeism rate', 'Unplanned absence days ÷ Working days', 'Internal', 'Lakshmi Venkatesan'],
            ['Offer acceptance rate', 'Offers accepted ÷ Offers made', 'Internal', 'Neha Joshi'],
          ],
          addLabel: 'Add metric',
          helper: 'Built from governed metrics only. A metric takes the strictest sensitivity of its inputs.',
          synonyms: ['custom metric', 'formula'],
        },
        { key: 'analytics.calc_builder', label: 'Metric catalogue and builder', kind: 'link', linkScreenId: 'ANL-07', linkLabel: 'Open metric builder' },
      ],
    },
    {
      title: 'Scheduled delivery defaults',
      settings: [
        {
          key: 'analytics.schedule.channels',
          label: 'Default channels',
          kind: 'multiselect',
          value: ['Email', 'In-app'],
          options: ['Email', 'In-app', 'Messaging app (link only)'],
          starter: true,
          synonyms: ['scheduled report', 'subscription', 'export'],
        },
        { key: 'analytics.schedule.format', label: 'Default file format', kind: 'radio', value: 'XLSX', options: ['XLSX', 'CSV', 'PDF snapshot'], starter: true },
        {
          key: 'analytics.schedule.attach_rule',
          label: 'Files with Confidential or Special data are sent as a secure sign-in link, not an attachment',
          kind: 'law',
          value: 'Always on',
          law: 'DPDP Act, 2023 s.8(5) (reasonable safeguards)',
        },
        { key: 'analytics.schedule.send_if_data', label: 'Skip sending when the report is empty', kind: 'toggle', value: true, starter: true },
        { key: 'analytics.schedule.send_time', label: 'Default send time', kind: 'time', value: '08:00', starter: true },
        { key: 'analytics.schedules', label: 'Schedules and export log', kind: 'link', linkScreenId: 'ANL-08', linkLabel: 'Open schedules' },
      ],
    },
  ],
  lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-08-27T10:48', what: 'Added the calculated metric "Plant absenteeism rate"' },
  related: [
    { label: 'Metric catalogue', screenId: 'ANL-07' },
    { label: 'Schedules & subscriptions', screenId: 'ANL-08' },
    { label: 'Dashboard builder', screenId: 'ANL-03' },
  ],
};

/* ---------------- 7.9 Deepfake detection ---------------- */
const deepfake: SettingsPageDef = {
  id: '7.9',
  group: 7,
  title: 'Deepfake detection',
  summary:
    'Check interview video and audio for synthetic video, face swap and cloned voice through a specialist partner. Results are review flags only; they never reject a candidate.',
  owner: ['T04'],
  contributes: ['M10', 'P10', 'T05'],
  permission: 'proctoring.settings.manage',
  permissionHolder: 'Talent acquisition leads and System admins',
  scopes: ['Company'],
  note: 'A flag never rejects, warns or ends an interview. It opens a review; the candidate can explain or re-verify.',
  sections: [
    {
      title: 'Where it runs',
      description: 'Only on interview video and audio, never on test recordings.',
      settings: [
        { key: 'deepfake.enabled', label: 'Use deepfake detection', kind: 'toggle', value: false, starter: true, availability: 'Add-on', synonyms: ['deepfake', 'voice clone', 'face swap'] },
        { key: 'deepfake.ai_interview', label: 'AI interview', kind: 'toggle', value: true, showWhen: { key: 'deepfake.enabled', equals: true } },
        { key: 'deepfake.live_interview', label: 'Live interview (built-in video room)', kind: 'toggle', value: true, helper: 'Interviews on outside video tools use the interviewer’s confirmation instead.', showWhen: { key: 'deepfake.enabled', equals: true } },
        {
          key: 'deepfake.partner_region',
          label: 'Partner processing region',
          kind: 'radio',
          value: 'India only',
          options: ['India only', 'India preferred, other regions allowed'],
          helper: 'Only the minimal clip or frames are sent, and the partner keeps nothing after returning the result.',
          starter: true,
        },
      ],
    },
    {
      title: 'Consent',
      settings: [
        {
          key: 'deepfake.consent_required',
          label: 'Candidate consent before any check',
          kind: 'law',
          value: 'Always required',
          law: 'DPDP Act, 2023 s.6 (consent); GDPR Art. 9 for EU candidates',
          helper: 'No consent, no check. A candidate who declines is not flagged.',
        },
        {
          key: 'deepfake.consent_texts',
          label: 'Consent text per jurisdiction',
          kind: 'list',
          columns: ['Jurisdiction', 'Language', 'Version', 'Last updated'],
          rows: [
            ['India', 'English', 'v2', '14 Sep 2026'],
            ['India', 'Kannada', 'v2', '14 Sep 2026'],
            ['India', 'Tamil', 'v2', '16 Sep 2026'],
            ['European Union', 'English', 'v1', '14 Sep 2026'],
          ],
          addLabel: 'Add consent text',
          helper: 'Shown in the interview consent and the candidate privacy notice.',
          synonyms: ['consent text', 'notice'],
        },
      ],
    },
    {
      title: 'Action on a flag',
      settings: [
        {
          key: 'deepfake.flag_action',
          label: 'When a flag is raised',
          kind: 'law',
          value: 'Review only; never auto-reject',
          law: 'YukthiX rule: a person always decides; a flag never rejects a candidate',
          helper: 'The candidate stays in the current stage until a reviewer decides.',
          synonyms: ['auto reject', 'flag'],
        },
        {
          key: 'deepfake.reviewer',
          label: 'Who reviews flags',
          kind: 'select',
          value: 'Neha Joshi (Talent Acquisition Lead)',
          options: ['Neha Joshi (Talent Acquisition Lead)', 'Hiring manager for the job', 'Lakshmi Venkatesan (HR Business Partner)'],
        },
        { key: 'deepfake.review_sla', label: 'Review flags within', kind: 'number', value: 2, unit: 'working days', min: 1, max: 10, starter: true },
        { key: 'deepfake.retention', label: 'Keep check results for', kind: 'number', value: 30, unit: 'days', min: 30, max: 365, helper: 'Counted from the last check. Legal holds keep results longer.', starter: true, synonyms: ['retention'] },
        { key: 'deepfake.partner_outage', label: 'If the partner is unavailable', kind: 'law', value: 'Skip the check and note it for the reviewer', law: 'YukthiX rule YX-INT-11: a partner outage never blocks or fails an interview' },
      ],
    },
  ],
  lastChange: { by: 'Neha Joshi', role: 'Talent Acquisition Lead', at: '2026-09-16T17:22', what: 'Added the Tamil consent text, version 2' },
  related: [
    { label: 'Identity strip', screenId: 'HIR-22' },
    { label: 'Plan & add-ons', screenId: 'PLT-19' },
  ],
};

export const GROUP_7: SettingsGroupDef = {
  id: 7,
  title: 'Integrations & Developers',
  summary: 'Connections to devices, banks, accounting, verification, calendar and chat; AI features; API keys and webhooks; analytics defaults; deepfake detection.',
  pages: [integrations, biometricDevices, payoutsBanksAccounting, verification, calendarChat, ai, developers, analytics, deepfake],
};

/* ================================================================
 * GROUP 8 · BILLING & ACCOUNT
 * ================================================================ */

/* ---------------- 8.1 Plan & add-ons ---------------- */
const planAddons: SettingsPageDef = {
  id: '8.1',
  group: 8,
  title: 'Plan & add-ons',
  summary:
    'See the products you use and switch on add-ons. Each product has one plan at ₹96 per unit a month; add-ons are only partner services with a per-use cost and usage above fair use.',
  owner: ['P14'],
  contributes: ['P10', 'M03', 'M10', 'T04'],
  permission: 'billing.manage',
  permissionHolder: 'System admins and Finance managers',
  scopes: ['Company'],
  note: 'Adding a product or add-on is charged from today; removing one takes effect at the end of the paid period.',
  sections: [
    {
      title: 'Products',
      settings: [
        {
          key: 'plan.products',
          label: 'Products',
          kind: 'list',
          columns: ['Product', 'Unit', 'Price', 'Units this month', 'Status'],
          rows: [
            ['HRMS', 'Employee', '₹96 per employee', '248', 'Live since 1 Jun 2026'],
            ['Hiring (ATS)', 'Recruiter seat', '₹96 per seat (minimum ₹999)', '3', 'Live since 15 Jul 2026'],
            ['Proctoring', 'Attempt started', '₹96 per attempt (minimum ₹999 in a month with attempts)', '0', 'Not switched on'],
          ],
          synonyms: ['plan', 'subscription', 'products'],
        },
        { key: 'plan.switch_on', label: 'Switch on a product', kind: 'link', linkScreenId: 'PLT-40', linkLabel: 'Switch on Proctoring', helper: 'Shows what it adds, the price and the minimum before you confirm.' },
        { key: 'plan.billing_period', label: 'Billing period', kind: 'radio', value: 'Monthly', options: ['Monthly', 'Annual (10 months for 12)'], helper: 'Annual invoices are paid by NEFT / RTGS. Growth is trued up monthly in arrears.' },
        { key: 'plan.bundle_discount', label: 'Bundle discount (2 products)', kind: 'percent', value: 10, locked: 'Applied automatically: 10 % for 2 products, 15 % for 3.' },
        {
          key: 'plan.price_notice',
          label: 'Notice before any list-price change',
          kind: 'law',
          value: '90 days',
          law: 'YukthiX rule: an annual term’s price never changes mid-term',
        },
      ],
    },
    {
      title: 'Add-ons',
      description: 'Connectors are included in the plan. Only the partner’s own charge is an add-on, billed per use.',
      settings: [
        {
          key: 'plan.addons',
          label: 'Add-ons',
          kind: 'list',
          columns: ['Add-on', 'Price', 'Status', 'Used this month'],
          rows: [
            ['PAN and bank verification', '₹3 per PAN check · ₹2.50 per penny drop', 'On', '14 checks · ₹39'],
            ['Partner filing (PF, ESI, PT, TDS)', '₹1,500 per entity a month', 'On', '2 entities · ₹3,000'],
            ['Background verification', 'From ₹650 per check', 'On', '6 checks · ₹4,200'],
            ['Aadhaar eSign', '₹25 per signature', 'On', '31 signatures · ₹775'],
            ['GST e-invoice for staffing', '₹1 per invoice', 'Off', '—'],
            ['YukthiX proctors', '₹180 per proctored hour', 'Off', '—'],
            ['Licensed question packs', '₹12,000 per pack a year', 'Off', '—'],
            ['Deepfake detection', '₹20 per interview beyond fair use', 'Off', '—'],
            ['Priority support', '₹4,999 a month', 'Off', '—'],
            ['Payout partner', '₹4 per payout', 'Coming soon', '—'],
            ['Travel booking', 'Partner fee per booking', 'Coming soon', '—'],
          ],
          readOnlyList: true,
          helper: 'Switch add-ons on or off in billing.',
          synonyms: ['add-on', 'BGV', 'eSign', 'payout API'],
        },
        { key: 'plan.billing_hub', label: 'Plan, add-ons and billable-unit detail', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Open billing', helper: 'Switch add-ons on or off, and download the list of who was counted this month.' },
        { key: 'plan.trial_disabled', label: 'Partner add-ons are off during a trial', kind: 'law', value: 'Always', law: 'YukthiX rule: no live bank files, filings, partner add-ons or bulk SMS in a trial' },
      ],
    },
  ],
  lastChange: { by: 'Meera Iyer', role: 'Finance Manager', at: '2026-07-15T11:00', what: 'Switched on Hiring (ATS) with 3 recruiter seats' },
  related: [
    { label: 'Billing, usage & sandbox', screenId: 'PLT-19' },
    { label: 'Switch on a product', screenId: 'PLT-40' },
  ],
};

/* ---------------- 8.2 Usage & caps ---------------- */
const usageCaps: SettingsPageDef = {
  id: '8.2',
  group: 8,
  title: 'Usage & caps',
  summary:
    'Watch usage against fair use and set caps: SMS quota and overage, AI credits, storage and API limits. Alerts go out at 80 % and 100 %.',
  owner: ['P14'],
  contributes: ['P04', 'P11', 'P10', 'P19', 'P22'],
  permission: 'billing.manage',
  permissionHolder: 'System admins and Finance managers',
  scopes: ['Company'],
  sections: [
    {
      title: 'Usage this month',
      settings: [
        {
          key: 'usage.meters',
          label: 'Usage meters',
          kind: 'list',
          columns: ['Meter', 'Included', 'Used', 'Overage so far'],
          rows: [
            ['SMS', '1,240 (5 per employee)', '910', '₹0'],
            ['AI credits', '12,000', '4,380', '₹0'],
            ['Storage', '50 GB', '31.6 GB', '₹0'],
            ['API calls (daily peak)', '50,000 a day', '9,870', '—'],
            ['Automations and workflow runs', '5,000', '1,412', '—'],
          ],
          readOnlyList: true,
          helper: 'Counted by YukthiX; the usage page shows daily charts.',
          synonyms: ['usage', 'meter', 'fair use'],
        },
        { key: 'usage.charts', label: 'Usage charts', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Open usage charts' },
        { key: 'usage.alert_levels', label: 'Usage alerts at', kind: 'offsets', value: ['100', '80'], unit: '% of the allowance', helper: 'Sent to System admins and the billing contacts.' },
      ],
    },
    {
      title: 'SMS',
      settings: [
        {
          key: 'usage.sms.billing_mode',
          label: 'How SMS is billed',
          kind: 'radio',
          value: 'Included quota, then overage',
          options: ['Included quota, then overage', 'Bill all SMS separately (no quota)'],
          helper: 'SMS one-time passwords count toward the quota.',
          contributedBy: 'P04',
          starter: true,
          synonyms: ['SMS quota', 'SMS overage'],
        },
        { key: 'usage.sms.overage_rate', label: 'Overage price', kind: 'money', value: 0.25, unit: 'per SMS', contributedBy: 'P04' },
        { key: 'usage.sms.cap', label: 'Monthly SMS spending cap', kind: 'money', value: 2000, helper: 'Past the cap, non-essential SMS stop until next month.', contributedBy: 'P04', synonyms: ['SMS cap', 'spending cap'] },
        {
          key: 'usage.sms.statutory_exempt',
          label: 'The cap never blocks statutory or mandatory messages',
          kind: 'law',
          value: 'Always on',
          law: 'YukthiX rule: statutory and mandatory messages always go out, whatever the cap',
        },
      ],
    },
    {
      title: 'AI, storage and API',
      settings: [
        { key: 'usage.ai.topup', label: 'Buy more AI credits automatically when used up', kind: 'toggle', value: false, helper: 'Off: copilots answer with links into the app until next month.', contributedBy: 'P10', synonyms: ['AI credits'] },
        { key: 'usage.ai.topup_block', label: 'Top-up block size', kind: 'number', value: 5000, unit: 'credits', contributedBy: 'P10', showWhen: { key: 'usage.ai.topup', equals: true } },
        { key: 'usage.storage.cap', label: 'Extra storage cap', kind: 'number', value: 20, unit: 'GB', helper: 'Extra storage and extra sandboxes are billed per GB a month.', synonyms: ['storage'] },
        { key: 'usage.api.per_minute', label: 'API calls per minute', kind: 'number', value: 600, unit: 'calls', locked: 'Plan fair-use limit. Higher limits are an add-on.', contributedBy: 'P11', synonyms: ['rate limit', 'API limits'] },
        { key: 'usage.api.per_day', label: 'API calls per day', kind: 'number', value: 50000, unit: 'calls', locked: 'Plan fair-use limit.', contributedBy: 'P11' },
        { key: 'usage.api.webhook_endpoints', label: 'Webhook endpoints', kind: 'number', value: 5, unit: 'endpoints', locked: 'Plan fair-use limit.', contributedBy: 'P11' },
        { key: 'usage.api.higher_limits', label: 'Higher API limits add-on', kind: 'toggle', value: false, contributedBy: 'P11' },
      ],
    },
  ],
  lastChange: { by: 'Meera Iyer', role: 'Finance Manager', at: '2026-09-05T09:40', what: 'Raised the monthly SMS spending cap from ₹1,000 to ₹2,000' },
  related: [
    { label: 'Billing, usage & sandbox', screenId: 'PLT-19' },
    { label: 'Notification settings and usage', screenId: 'PLT-13' },
  ],
};

/* ---------------- 8.3 Invoices & payment ---------------- */
const invoicesPayment: SettingsPageDef = {
  id: '8.3',
  group: 8,
  title: 'Invoices & payment',
  summary:
    'Keep billing contacts and GST details per legal entity, download invoices and choose how you pay. You get one GST invoice per legal entity.',
  owner: ['P14'],
  contributes: ['P16'],
  permission: 'billing.manage',
  permissionHolder: 'System admins and Finance managers',
  scopes: ['Company', 'Legal entity'],
  sections: [
    {
      title: 'Billing details',
      settings: [
        {
          key: 'invoice.contacts',
          label: 'Billing contacts',
          kind: 'list',
          columns: ['Name', 'Email', 'Receives'],
          rows: [
            ['Accounts team', 'accounts@kaverifoods.in', 'Invoices, receipts, price notices'],
            ['Meera Iyer', 'meera.iyer@kaverifoods.in', 'Invoices, payment failures'],
            ['Arjun Kulkarni', 'arjun.kulkarni@kaverifoods.in', 'Price and renewal notices'],
          ],
          addLabel: 'Add contact',
          synonyms: ['billing contact', 'invoice email'],
        },
        {
          key: 'invoice.gst_details',
          label: 'GST details per legal entity',
          kind: 'list',
          columns: ['Entity', 'GSTIN', 'Billing address', 'Place of supply'],
          rows: [
            [KA, '29AABCK1234F1Z5', '42 Richmond Road, Bengaluru 560025', 'Karnataka (29)'],
            [TN, '33AABCK1234F1Z9', '7 SIDCO Estate, Hosur 635126', 'Tamil Nadu (33)'],
          ],
          addLabel: 'Add entity details',
          scope: 'Per legal entity',
          synonyms: ['GSTIN', 'GST', 'tax details'],
        },
        { key: 'invoice.po_number', label: 'Purchase order number on invoices', kind: 'text', value: 'KF/PO/2026-27/0118' },
        {
          key: 'invoice.gst',
          label: 'GST on YukthiX invoices',
          kind: 'law',
          value: '18 % (CGST + SGST or IGST by place of supply)',
          law: 'CGST Act, 2017 s.31 (tax invoice); IGST Act, 2017 s.12 (place of supply)',
          helper: 'Corrections are made only by credit note.',
        },
        { key: 'invoice.consolidated', label: 'Also send one consolidated group statement', kind: 'toggle', value: true, helper: 'In addition to the per-entity invoices, never instead.' },
      ],
    },
    {
      title: 'Invoices',
      settings: [
        {
          key: 'invoice.list',
          label: 'Invoices',
          kind: 'list',
          columns: ['Invoice', 'Month', 'Entity', 'Amount (incl. GST)', 'Status'],
          rows: [
            ['YX/26-27/004812', 'Sep 2026', KA, '₹18,740', 'Due 5 Oct 2026'],
            ['YX/26-27/004813', 'Sep 2026', TN, '₹7,078', 'Due 5 Oct 2026'],
            ['YX/26-27/003977', 'Aug 2026', KA, '₹18,512', 'Paid 4 Sep 2026'],
            ['YX/26-27/003978', 'Aug 2026', TN, '₹6,954', 'Paid 4 Sep 2026'],
          ],
          readOnlyList: true,
          helper: 'Each invoice links to the monthly list of counted units.',
          synonyms: ['invoice', 'bill', 'receipt'],
        },
        { key: 'invoice.all', label: 'All invoices and credit notes', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Open invoices' },
      ],
    },
    {
      title: 'Payment',
      settings: [
        {
          key: 'payment.method',
          label: 'Payment method',
          kind: 'radio',
          value: 'Bank auto-debit (e-NACH)',
          options: ['Bank auto-debit (e-NACH)', 'UPI Autopay (below ₹15,000 a month)', 'NEFT / RTGS', 'Card (list price)'],
          helper: 'Bank auto-debit, UPI Autopay and NEFT get a 2 % bank-rail discount.',
          starter: true,
          sensitive: true,
          synonyms: ['mandate', 'auto-debit', 'payment method'],
        },
        { key: 'payment.mandate', label: 'Auto-debit mandate', kind: 'text', value: 'Cauvery Co-operative Bank ••••4410 · up to ₹50,000 a month', status: { tone: 'success', text: 'Active' }, locked: 'Set up on 3 Jun 2026. Changing it opens a new mandate with your bank.', lockedAction: { label: 'Change mandate', screenId: 'PLT-19' }, sensitive: true },
        { key: 'payment.virtual_account', label: 'Your virtual account for bank transfers', kind: 'text', value: 'YXKAVERI0248 · IFSC shown on invoice', locked: 'Transfers to this account match invoices automatically.' },
        {
          key: 'payment.partner_billing',
          label: 'Billing mode',
          kind: 'radio',
          value: 'Billed directly by YukthiX',
          options: ['Billed directly by YukthiX', 'Billed by our partner'],
          helper: 'Your YukthiX price is never above the published price, whichever mode you use.',
          contributedBy: 'P16',
        },
        { key: 'payment.card_storage', label: 'Card and bank details are held by the payment gateway, never by YukthiX', kind: 'law', value: 'Always on', law: 'YukthiX rule: the payment gateway holds card and bank details; YukthiX never stores them' },
      ],
    },
  ],
  lastChange: { by: 'Meera Iyer', role: 'Finance Manager', at: '2026-06-03T15:15', what: 'Set up bank auto-debit from the Cauvery Co-operative Bank account' },
  related: [
    { label: 'Billing, usage & sandbox', screenId: 'PLT-19' },
    { label: 'Partners', screenId: 'PLT-30' },
  ],
};

/* ---------------- 8.4 Sandbox ---------------- */
const sandbox: SettingsPageDef = {
  id: '8.4',
  group: 8,
  title: 'Sandbox',
  summary:
    'Test configuration and payroll in an isolated copy of your company with masked employee data, then promote reviewed changes to production.',
  owner: ['P15'],
  contributes: ['P11', 'P14'],
  permission: 'sandbox.manage',
  permissionHolder: 'System admins',
  scopes: ['Company'],
  note: 'Sandbox only: nothing here sends notifications, bank files, filings or partner calls. Data never moves from sandbox to production; only reviewed configuration does.',
  sections: [
    {
      title: 'Your sandbox',
      settings: [
        { key: 'sandbox.status', label: 'Sandbox', kind: 'text', value: 'Refreshed 22 Sep 2026 · 248 masked employees', status: { tone: 'success', text: 'Ready' }, locked: 'Refreshing replaces everything in the sandbox.', synonyms: ['sandbox', 'test environment'] },
        {
          key: 'sandbox.clone',
          label: 'Clone configuration and data',
          kind: 'link',
          linkScreenId: 'PLT-19',
          linkLabel: 'Refresh sandbox from production',
          helper: 'Copies configuration and masked employee data. Refreshing replaces everything in the sandbox.',
          synonyms: ['clone', 'refresh'],
        },
        {
          key: 'sandbox.clone_scope',
          label: 'What a refresh copies',
          kind: 'multiselect',
          value: ['Configuration and policies', 'Templates', 'Employees (masked)', 'Last 3 payroll months'],
          options: ['Configuration and policies', 'Templates', 'Employees (masked)', 'Last 3 payroll months', 'Attendance and leave history', 'Hiring pipeline'],
          starter: true,
        },
        {
          key: 'sandbox.masking',
          label: 'Names, IDs and bank details are replaced in the sandbox',
          kind: 'law',
          value: 'Always on',
          law: 'DPDP Act, 2023 s.8(5) (reasonable safeguards)',
        },
        { key: 'sandbox.idle_expiry', label: 'Sandbox expires after idle for', kind: 'number', value: 90, unit: 'days', helper: 'You are reminded 7 days before.', starter: true },
      ],
    },
    {
      title: 'Test payroll',
      settings: [
        { key: 'sandbox.dry_run', label: 'Dry-run payroll', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Run a dry-run payroll', helper: 'Produces payslips and a variance report; no bank file or notifications.', synonyms: ['dry run', 'parallel run', 'test payroll'] },
        { key: 'sandbox.dry_run_period', label: 'Default dry-run month', kind: 'select', value: 'October 2026', options: ['September 2026', 'October 2026', 'November 2026'] },
      ],
    },
    {
      title: 'Promote to production',
      settings: [
        { key: 'sandbox.promote', label: 'Promote changes', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Review and promote changes', helper: 'Pick settings, templates and policies, see the diff and send for approval.', synonyms: ['promote', 'deploy config'] },
        {
          key: 'sandbox.promote_approver',
          label: 'Promotion approver',
          kind: 'select',
          value: 'Suresh Pillai (Payroll Manager)',
          options: ['Suresh Pillai (Payroll Manager)', 'Meera Iyer (Finance Manager)', 'Lakshmi Venkatesan (HR Business Partner)'],
          helper: 'Must be a different person from the one who promotes.',
        },
      ],
    },
    {
      title: 'Sample data',
      settings: [
        { key: 'sandbox.demo_data', label: 'Fill a second sandbox with a sample company', kind: 'toggle', value: false, helper: 'A fictional company with 12 months of attendance, leave and payroll, for training. Extra sandboxes are a storage add-on.', synonyms: ['demo data', 'sample data'] },
        { key: 'sandbox.developer', label: 'Developer sandbox for API testing', kind: 'toggle', value: true, helper: 'Included. Keys created here start with yx_test_.', contributedBy: 'P11' },
      ],
    },
  ],
  lastChange: { by: 'Suresh Pillai', role: 'Payroll Manager', at: '2026-09-22T18:00', what: 'Refreshed the sandbox from production' },
  related: [
    { label: 'Billing, usage & sandbox', screenId: 'PLT-19' },
    { label: 'Set-up hub', screenId: 'PLT-08' },
  ],
};

/* ---------------- 8.5 Data export & closure ---------------- */
const exportClosure: SettingsPageDef = {
  id: '8.5',
  group: 8,
  title: 'Data export & closure',
  summary:
    'Export all your company data at any time, and close your account when you leave. Closure gives 30 days read-only with full export, then certified deletion.',
  owner: ['P14'],
  contributes: ['P12', 'P05'],
  permission: 'tenant.close',
  permissionHolder: 'System admins (with step-up sign-in)',
  scopes: ['Company'],
  note: 'Closure can’t be undone after day 30. To start it, you type the company name to confirm.',
  sections: [
    {
      title: 'Whole-company export',
      settings: [
        { key: 'export.run', label: 'Export all data', kind: 'link', linkScreenId: 'PLT-19', linkLabel: 'Start full export', helper: 'CSV / JSON per entity, a document archive and a manifest. Needs step-up sign-in; every download is audited.', sensitive: true, synonyms: ['export', 'download all data', 'backup'] },
        { key: 'export.formats', label: 'Export formats', kind: 'multiselect', value: ['CSV', 'JSON'], options: ['CSV', 'JSON', 'XLSX'] },
        { key: 'export.employee_pack', label: 'Include a document pack per employee (payslips, Form 16, letters)', kind: 'toggle', value: true, starter: true },
        { key: 'export.audit_log', label: 'Include the audit log', kind: 'toggle', value: true, starter: true },
        { key: 'export.last', label: 'Last full export', kind: 'text', value: '30 Jun 2026 by Arjun Kulkarni · 4.8 GB', status: { tone: 'success', text: 'Complete' }, locked: 'Kept for download for 7 days after each export.' },
      ],
    },
    {
      title: 'What happens at closure',
      settings: [
        { key: 'closure.grace', label: 'Read-only grace with full export', kind: 'number', value: 30, unit: 'days', locked: 'Reminder on day 23. Employees can download their own payslips, Form 16 and letters until the end.' },
        {
          key: 'closure.certified_deletion',
          label: 'Deletion with a deletion certificate',
          kind: 'law',
          value: 'Live data deleted, keys destroyed, backups aged out within 35 days',
          law: 'DPDP Act, 2023 s.8(7) (erasure)',
          synonyms: ['certified deletion', 'erasure'],
        },
        {
          key: 'closure.legal_holds',
          label: 'Legal holds kept after closure',
          kind: 'list',
          columns: ['Hold', 'Records', 'Reason', 'Until'],
          rows: [
            ['Wage dispute, Hosur plant', '3 employees’ payroll and attendance', 'Labour court case', 'Case closed'],
          ],
          readOnlyList: true,
          helper: 'You are told what is held and why.',
        },
        {
          key: 'closure.statutory_records',
          label: 'Keep your own copy of statutory records before closure',
          kind: 'law',
          value: 'Employer duty',
          law: 'Code on Wages, 2019 s.50 (registers); Income-tax Act, 2025 and EPF record rules',
          helper: 'YukthiX deletes on closure; the employer must keep registers for the period the law sets.',
        },
      ],
    },
    {
      title: 'Close account',
      tone: 'danger',
      description: 'Stops the service for everyone in the company. After 30 days read-only, all data is deleted and can’t be recovered. Export first.',
      settings: [
        { key: 'closure.start', label: 'Close account', kind: 'link', linkScreenId: 'PLT-52', linkLabel: 'Start closure', helper: 'Monthly plans end at the end of the paid period. You confirm it is you and type the company name.', sensitive: true, synonyms: ['cancel', 'close account', 'delete company'] },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-06-30T17:45', what: 'Ran a full company export' },
  related: [
    { label: 'Cancellation flow', screenId: 'PLT-52' },
    { label: 'Audit log', screenId: 'PLT-16' },
    { label: 'Data requests', screenId: 'PLT-27' },
  ],
};

/* ---------------- 8.6 Analytics, status & tips ---------------- */
const statusTips: SettingsPageDef = {
  id: '8.6',
  group: 8,
  title: 'Analytics, status & tips',
  summary:
    'Opt out of non-essential product analytics, subscribe to the status page for the products and regions you use, set your payroll-critical window, and mute set-up tips.',
  owner: ['P20'],
  contributes: ['P09', 'P14'],
  permission: 'account.preferences.manage',
  permissionHolder: 'System admins',
  scopes: ['Company'],
  sections: [
    {
      title: 'Product analytics',
      settings: [
        {
          key: 'account.product_analytics',
          label: 'Share non-essential product analytics with YukthiX',
          kind: 'toggle',
          value: true,
          helper: 'Pseudonymous usage events only, never names or HR data. Billing meters, security logs and set-up progress continue either way.',
          contributedBy: 'P09',
          synonyms: ['telemetry', 'usage analytics', 'opt out'],
        },
      ],
    },
    {
      title: 'Status page and maintenance',
      settings: [
        { key: 'status.products', label: 'Status updates for products', kind: 'multiselect', value: ['HRMS', 'Hiring (ATS)'], options: ['HRMS', 'Hiring (ATS)', 'Proctoring'], synonyms: ['status page', 'incident', 'outage'] },
        { key: 'status.regions', label: 'Status updates for regions', kind: 'multiselect', value: ['India'], options: ['India', 'Middle East', 'Europe'] },
        {
          key: 'status.recipients',
          label: 'Status-page subscribers',
          kind: 'list',
          columns: ['Email', 'Receives'],
          rows: [
            ['arjun.kulkarni@kaverifoods.in', 'Incidents and maintenance'],
            ['it-alerts@kaverifoods.in', 'Incidents and maintenance'],
            ['suresh.pillai@kaverifoods.in', 'Incidents only'],
          ],
          addLabel: 'Add subscriber',
          helper: 'Admins always get in-app notices; these addresses also get email.',
        },
        {
          key: 'status.payroll_window_end',
          label: 'No planned maintenance in the last',
          kind: 'number',
          value: 3,
          unit: 'days of each month',
          min: 0,
          max: 10,
          starter: true,
          contributedBy: 'P14',
          synonyms: ['maintenance window', 'payroll days', 'payroll-critical window'],
        },
        {
          key: 'status.payroll_window_start',
          label: 'Or in the first',
          kind: 'number',
          value: 7,
          unit: 'days of each month',
          min: 0,
          max: 10,
          helper: 'Maintenance is also never scheduled on a statutory due date for your entities.',
          starter: true,
          contributedBy: 'P14',
        },
        { key: 'status.maintenance_notice', label: 'Planned maintenance notice', kind: 'law', value: 'At least 72 hours ahead', law: 'YukthiX rule: planned maintenance is announced at least 72 hours ahead' },
        { key: 'status.page', label: 'Public status page', kind: 'link', linkScreenId: 'T9-17', linkLabel: 'View status page' },
      ],
    },
    {
      title: 'Tips and trial',
      settings: [
        { key: 'tips.mute_setup', label: 'Mute set-up tips', kind: 'toggle', value: false, helper: 'Stops set-up suggestions for you. Trial-ending notices are always sent.', synonyms: ['nudges', 'tips', 'mute'] },
        { key: 'tips.mute_trial_nudges', label: 'Mute trial nudges for all admins', kind: 'toggle', value: false, helper: 'Only applies during a trial.' },
      ],
    },
  ],
  lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-28T10:30', what: 'Subscribed it-alerts@kaverifoods.in to the status page' },
  related: [
    { label: 'Status page', screenId: 'T9-17' },
    { label: 'What’s new', screenId: 'PLT-50' },
  ],
};

export const GROUP_8: SettingsGroupDef = {
  id: 8,
  title: 'Billing & Account',
  summary: 'Products and add-ons, usage and caps, invoices and payment, sandbox, data export and closure, and account preferences.',
  pages: [planAddons, usageCaps, invoicesPayment, sandbox, exportClosure, statusTips],
};
