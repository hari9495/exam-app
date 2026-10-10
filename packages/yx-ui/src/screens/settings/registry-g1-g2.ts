// Settings map, Group 1 (Organisation, pages 1.1–1.8) and Group 2 (People & Access, pages 2.1–2.11).
// Source: APX-D §3 Settings map + owning docs (P01, P02, P03, P08, P09, P11, P12, P16, P18, P19, P22, M01, M04, M08) and APX-E editor inventory.
// Sample tenant: Kaveri Foods Pvt Ltd. Plain data only.

import type { SettingsGroupDef } from './settings-types';

export const GROUP_1: SettingsGroupDef = {
  id: 1,
  title: 'Organisation',
  summary: 'Your company, legal entities, locations, structure masters, employee records, set-up progress, customisation and company rules.',
  pages: [
    // ───────────────────────────── 1.1 Company & branding
    {
      id: '1.1',
      group: 1,
      title: 'Company & branding',
      summary: 'Company name, logo and colours, your own domain and email sender, and the default language and region for everyone in the company.',
      owner: ['P01'],
      contributes: ['P11', 'P02', 'P04'],
      permission: 'org.settings.manage',
      permissionHolder: 'System Admin',
      scopes: ['Company', 'Legal entity'],
      sections: [
        {
          title: 'Company',
          settings: [
            { key: 'org.company.name', label: 'Company name', kind: 'text', value: 'Kaveri Foods', helper: 'Shown in the app header, emails and the login page.', scope: 'Company', synonyms: ['company name', 'tenant name'] },
            { key: 'org.company.logo', label: 'Logo', kind: 'image', value: 'kaveri-foods-logo.svg', helper: 'SVG or PNG, at least 256 px wide, on a transparent background.', synonyms: ['logo', 'brand'] },
          ],
        },
        {
          title: 'Branding and white-label',
          description: 'White-label is included in the plan (P11 Q7).',
          settings: [
            { key: 'org.brand.primary_colour', label: 'Brand colour', kind: 'colour', value: '#1F6F5C', helper: 'Used for buttons and links. It must be dark enough for white text to stay readable.', starter: false, synonyms: ['colour', 'theme', 'org-primary'] },
            { key: 'org.whitelabel.domain', label: 'Custom domain', kind: 'text', value: 'hr.kaverifoods.in', helper: 'Add this DNS record at your domain provider: CNAME hr → kaverifoods.yukthix.app. Checking can take up to a day.', status: { tone: 'warning', text: 'Waiting for DNS record', action: 'Check now' }, synonyms: ['domain', 'white label', 'URL'] },
            { key: 'org.whitelabel.email_sender', label: 'Email sender', kind: 'text', value: 'Kaveri Foods HR <hr@kaverifoods.in>', helper: 'Emails to employees come from this address.', status: { tone: 'success', text: 'Verified' }, synonyms: ['from address', 'email sender'] },
          ],
        },
        {
          title: 'Language and region',
          settings: [
            { key: 'org.locale.default_language', label: 'Default language for employees', kind: 'select', value: 'English', options: ['English', 'Hindi', 'Tamil', 'Telugu'], helper: 'Each employee can pick their own. If they have not, this language is used, then English.', contributedBy: 'P04', synonyms: ['language', 'locale'] },
            { key: 'org.locale.number_format', label: 'Number format', kind: 'radio', value: 'Indian (12,34,567)', options: ['Indian (12,34,567)', 'International (1,234,567)'], optionLabels: { 'Indian (12,34,567)': '12,34,567', 'International (1,234,567)': '1,234,567' } },
            { key: 'org.locale.date_format', label: 'Date format', kind: 'radio', value: 'dd-mm-yyyy', options: ['dd-mm-yyyy', 'dd MMM yyyy', 'yyyy-mm-dd'], optionLabels: { 'dd-mm-yyyy': '30-09-2026', 'dd MMM yyyy': '30 Sep 2026', 'yyyy-mm-dd': '2026-09-30' } },
            { key: 'org.data_region', label: 'Data region', kind: 'select', value: 'India (IN)', options: ['India (IN)', 'UAE (ME-AE)', 'Saudi Arabia (ME-SA)', 'European Union (EU)', 'United States (US)', 'Singapore (SG)'], locked: 'Chosen at sign-up. All data, files and backups stay in this region.', lockedAction: { label: 'Request a region move', screenId: 'PLT-46' }, synonyms: ['data residency', 'hosting region', 'move region'] },
          ],
        },
      ],
      lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-08-12T15:40', what: 'Changed brand colour from #2E7D32 to #1F6F5C' },
      related: [
        { label: 'Entity data regions', screenId: 'PLT-45' },
        { label: 'Tenant set-up wizard', screenId: 'PLT-09' },
        { label: 'Notification settings', screenId: 'PLT-13' },
      ],
    },

    // ───────────────────────────── 1.2 Legal entities
    {
      id: '1.2',
      group: 1,
      title: 'Legal entities',
      summary: 'The registered employers in your company, which one is the default, and a summary of their statutory registrations.',
      owner: ['P01'],
      permission: 'org.settings.manage',
      permissionHolder: 'System Admin',
      note: 'Your company always has at least one legal entity, and exactly one is the default. Closing or merging an entity moves its people first.',
      sections: [
        {
          title: 'Entities',
          settings: [
            {
              key: 'org.entity.list', label: 'Legal entities', kind: 'list', addLabel: 'Add legal entity',
              columns: ['Entity', 'Short name', 'State', 'PAN', 'TAN', 'GSTIN', 'CIN', 'FY starts', 'Status'],
              rows: [
                ['Kaveri Foods Pvt Ltd', 'KFPL', 'Karnataka', 'On file', 'On file', 'On file', 'On file', 'April', 'Active · default'],
                ['Kaveri Foods Pvt Ltd (Tamil Nadu)', 'KFPL-TN', 'Tamil Nadu', 'On file', 'On file', 'On file', 'Missing', 'April', 'Active'],
              ],
              synonyms: ['company', 'employer', 'PAN', 'GSTIN'],
            },
            { key: 'org.entity.default', label: 'Default entity', kind: 'select', value: 'Kaveri Foods Pvt Ltd', options: ['Kaveri Foods Pvt Ltd', 'Kaveri Foods Pvt Ltd (Tamil Nadu)'], helper: 'Pre-selected for new hires and imports. Screens still show all entities you may see.' },
          ],
        },
        {
          title: 'Statutory registrations',
          description: 'A summary. Registrations and legal options are changed in Statutory set-up.',
          settings: [
            {
              key: 'org.entity.statutory_summary', label: 'Registrations by entity', kind: 'list', readOnlyList: true,
              columns: ['Entity', 'PF', 'ESI', 'PT', 'LWF'],
              rows: [
                ['Kaveri Foods Pvt Ltd', 'Registered', 'Registered', 'Karnataka', 'Karnataka'],
                ['Kaveri Foods Pvt Ltd (Tamil Nadu)', 'Registered', 'Registered', 'Tamil Nadu', 'Tamil Nadu'],
              ],
              synonyms: ['PF code', 'ESIC code', 'professional tax'],
            },
            { key: 'org.entity.statutory_link', label: 'Statutory set-up', kind: 'link', linkScreenId: 'CMP-02', linkLabel: 'Open statutory set-up' },
          ],
        },
        {
          title: 'Close or merge an entity',
          settings: [
            { key: 'org.entity.restructure', label: 'Entity close or merge', kind: 'link', linkScreenId: 'PPL-09', linkLabel: 'Start entity close or merge', helper: 'Moves every open employment to the target entity with one preview and one approval.', synonyms: ['merger', 'demerger', 'restructure'] },
          ],
        },
      ],
      lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-06-03T11:15', what: 'Added legal entity Kaveri Foods Pvt Ltd (Tamil Nadu)' },
      related: [
        { label: 'Statutory set-up', screenId: 'CMP-02' },
        { label: 'Bulk transfer wizard', screenId: 'PPL-09' },
      ],
    },

    // ───────────────────────────── 1.3 Locations
    {
      id: '1.3',
      group: 1,
      title: 'Locations',
      summary: 'Work sites with their state, time zone and holiday calendar, plus the geofence and network ranges used for check-in.',
      owner: ['P01'],
      contributes: ['M02'],
      permission: 'org.settings.manage',
      permissionHolder: 'System Admin or HR Admin',
      scopes: ['Company', 'Legal entity', 'Location'],
      sections: [
        {
          title: 'Sites',
          settings: [
            {
              key: 'org.location.list', label: 'Locations', kind: 'list', addLabel: 'Add location',
              columns: ['Location', 'Legal entity', 'State', 'Time zone', 'Holiday calendar'],
              rows: [
                ['Bengaluru head office', 'Kaveri Foods Pvt Ltd', 'Karnataka', 'IST (UTC+5:30)', 'Karnataka 2026'],
                ['Chennai office', 'Kaveri Foods Pvt Ltd (Tamil Nadu)', 'Tamil Nadu', 'IST (UTC+5:30)', 'Tamil Nadu 2026'],
                ['Hosur plant', 'Kaveri Foods Pvt Ltd (Tamil Nadu)', 'Tamil Nadu', 'IST (UTC+5:30)', 'Hosur plant 2026'],
              ],
              helper: 'State and time zone are required. The state decides professional tax and labour welfare fund.',
              synonyms: ['site', 'office', 'branch', 'plant'],
            },
            { key: 'org.location.holiday_calendars', label: 'Holiday calendars', kind: 'link', linkScreenId: 'TIM-26', linkLabel: 'Open holiday calendars', synonyms: ['holidays'] },
            { key: 'org.location.host_use', label: 'Allow as host location for deputation or client-site posting', kind: 'toggle', value: true, helper: 'While a host location is set, it drives the holiday calendar, PT state and geofence (YX-ORG-21).', synonyms: ['deputation', 'secondment'] },
          ],
        },
        {
          title: 'Geofence',
          description: 'Mobile check-in is checked against these points.',
          settings: [
            {
              key: 'org.location.geofence_points', label: 'Geofence points', kind: 'list', addLabel: 'Add point', rowAction: 'View on map',
              columns: ['Location', 'Point', 'Latitude', 'Longitude', 'Radius'],
              rows: [
                ['Bengaluru head office', 'Main building', '12.9716', '77.5946', '150 m'],
                ['Chennai office', 'Guindy office', '13.0067', '80.2206', '150 m'],
                ['Hosur plant', 'Plant gate', '12.7409', '77.8253', '300 m'],
                ['Hosur plant', 'Warehouse', '12.7442', '77.8301', '200 m'],
              ],
              synonyms: ['geofence', 'GPS', 'radius'],
            },
            { key: 'org.location.geofence_default_radius', label: 'Default radius for new points', kind: 'number', value: 200, unit: 'metres', min: 50, max: 2000, starter: true },
            { key: 'org.location.checkin_mode', label: 'Check-in mode', kind: 'radio', value: 'Restricted', options: ['Restricted', 'Field'], helper: 'Restricted: must be inside the geofence or an allowed network. Field: location recorded, not restricted.', contributedBy: 'M02', scope: 'Company', synonyms: ['field staff', 'check-in'] },
            { key: 'org.location.map_editor', label: 'Map editor', kind: 'link', linkScreenId: 'TIM-31', linkLabel: 'Open locations and geofence map' },
          ],
        },
        {
          title: 'IP and Wi-Fi ranges',
          settings: [
            {
              key: 'org.location.ip_ranges', label: 'Allowed networks for web check-in', kind: 'list', addLabel: 'Add range',
              columns: ['Location', 'Range', 'Label'],
              rows: [
                ['Bengaluru head office', '103.21.58.0/24', 'Office broadband'],
                ['Chennai office', '49.207.44.16/28', 'Office leased line'],
                ['Hosur plant', '10.20.0.0/16', 'Plant Wi-Fi'],
              ],
              synonyms: ['IP restriction', 'Wi-Fi'],
            },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-07-21T10:05', what: 'Added geofence point Warehouse to Hosur plant (200 m)' },
      related: [
        { label: 'Locations and geofence map', screenId: 'TIM-31' },
        { label: 'Holiday calendars', screenId: 'TIM-26' },
      ],
    },

    // ───────────────────────────── 1.4 Structure masters
    {
      id: '1.4',
      group: 1,
      title: 'Structure masters',
      summary: 'Departments, designations, grades with pay ranges, employment types and cost centres. Each can be shared across entities or kept entity-only.',
      owner: ['P01'],
      contributes: ['M06'],
      permission: 'org.settings.manage',
      permissionHolder: 'System Admin or HR Admin',
      scopes: ['Company', 'Legal entity'],
      note: 'A master that is in use can be archived but never deleted (YX-ORG-04).',
      sections: [
        {
          title: 'Departments and designations',
          settings: [
            {
              key: 'org.department.list', label: 'Departments', kind: 'list', addLabel: 'Add department',
              columns: ['Department', 'Parent', 'Head', 'Division', 'Ownership'],
              rows: [
                ['Operations', '—', 'Ramesh Gowda', 'Yes', 'Shared'],
                ['Quality', 'Operations', 'Divya Menon', 'No', 'Shared'],
                ['Engineering', '—', 'Karthik Subramanian', 'No', 'Shared'],
                ['Finance', '—', 'Meera Iyer', 'No', 'Shared'],
                ['People', '—', 'Lakshmi Venkatesan', 'No', 'Shared'],
                ['Sales', '—', 'Vikram Rao', 'Yes', 'Shared'],
              ],
              helper: 'A division is a top-level department that groups others in reports and the org chart.',
              starter: true,
              synonyms: ['department', 'division', 'business unit', 'org tree'],
            },
            {
              key: 'org.designation.list', label: 'Designations', kind: 'list', addLabel: 'Add designation',
              columns: ['Designation', 'Job family', 'Ownership'],
              rows: [
                ['Production Supervisor', 'Operations', 'Kaveri Foods Pvt Ltd (Tamil Nadu) only'],
                ['Quality Analyst', 'Quality', 'Shared'],
                ['Software Engineer', 'Engineering', 'Shared'],
                ['Accounts Executive', 'Finance', 'Shared'],
                ['Area Sales Manager', 'Sales', 'Shared'],
              ],
              synonyms: ['job title', 'designation'],
            },
          ],
        },
        {
          title: 'Grades and pay ranges',
          description: 'Pay ranges have a start date. Salary reviews and offers are checked against them.',
          settings: [
            {
              key: 'org.grade.pay_ranges', label: 'Grades', kind: 'list', addLabel: 'Add grade',
              columns: ['Grade', 'Rank', 'Min', 'Mid', 'Max'],
              rows: [
                ['W1 · Plant worker', '1', '₹1,80,000', '₹2,10,000', '₹2,40,000'],
                ['W2 · Senior plant worker', '2', '₹2,20,000', '₹2,60,000', '₹3,00,000'],
                ['G1 · Associate', '3', '₹2,40,000', '₹3,00,000', '₹3,60,000'],
                ['G2 · Executive', '4', '₹3,60,000', '₹4,80,000', '₹6,00,000'],
                ['G3 · Senior executive', '5', '₹6,00,000', '₹8,00,000', '₹10,00,000'],
                ['M1 · Manager', '6', '₹10,00,000', '₹14,00,000', '₹18,00,000'],
                ['M2 · Senior manager', '7', '₹18,00,000', '₹24,00,000', '₹30,00,000'],
                ['M3 · Head of department', '8', '₹28,00,000', '₹36,00,000', '₹44,00,000'],
                ['M4 · General manager', '9', '₹40,00,000', '₹50,00,000', '₹60,00,000'],
                ['E1–E3 · Leadership', '10–12', '₹55,00,000', '₹80,00,000', '₹1,20,00,000'],
              ],
              dated: { validFrom: '2026-04-01' },
              scope: 'Inherited from Kaveri Foods Pvt Ltd',
              contributedBy: 'M06',
              synonyms: ['grade', 'band', 'pay range', 'salary band'],
            },
          ],
        },
        {
          title: 'Employment types',
          description: 'Each type comes with the PF, ESI and gratuity rules the law sets. You can change one only where the law leaves the choice.',
          settings: [
            {
              key: 'org.employment_type.list', label: 'Employment types', kind: 'list', addLabel: 'Add employment type',
              columns: ['Type', 'Category', 'PF', 'ESI', 'Gratuity', 'Override'],
              rows: [
                ['Permanent', 'Permanent', 'Yes', 'By wage', 'Yes', '—'],
                ['Probationer', 'Probation', 'Yes', 'By wage', 'Yes', '—'],
                ['Fixed-term (plant)', 'Fixed-term', 'Yes', 'By wage', 'Pro-rata after 1 year', '—'],
                ['Graduate apprentice', 'Apprentice', 'No', 'No', 'No', 'Blocked by law'],
                ['Retired re-employed', 'Retired re-employed', 'No EPS', 'By wage', 'Yes', '—'],
              ],
              dated: { validFrom: '2026-04-01' },
              synonyms: ['employment type', 'contract', 'intern', 'apprentice', 'statutory matrix'],
            },
            { key: 'org.employment_type.voluntary_pf', label: 'Allow voluntary PF for employees above the wage ceiling', kind: 'toggle', value: true, helper: 'An override the law allows. Mandatory and excluded cases stay locked.', synonyms: ['voluntary PF'] },
          ],
        },
        {
          title: 'Cost centres',
          settings: [
            {
              key: 'org.cost_centre.list', label: 'Cost centres', kind: 'list', addLabel: 'Add cost centre',
              columns: ['Code', 'Name', 'Legal entity', 'Parent'],
              rows: [
                ['CC-BLR-ENG', 'Engineering Bengaluru', 'Kaveri Foods Pvt Ltd', '—'],
                ['CC-BLR-FIN', 'Finance Bengaluru', 'Kaveri Foods Pvt Ltd', '—'],
                ['CC-HSR-PRD', 'Hosur production', 'Kaveri Foods Pvt Ltd (Tamil Nadu)', '—'],
                ['CC-HSR-QA', 'Hosur quality', 'Kaveri Foods Pvt Ltd (Tamil Nadu)', 'CC-HSR-PRD'],
              ],
              synonyms: ['cost centre', 'cost center'],
            },
            { key: 'org.cost_centre.splits', label: 'Allow cost-centre splits by percentage', kind: 'toggle', value: false, helper: 'Splits must total 100 %.', availability: 'Wave 3', synonyms: ['cost split'] },
            { key: 'org.master.default_ownership', label: 'New masters are', kind: 'radio', value: 'Shared across entities', options: ['Shared across entities', 'Entity-only'], helper: 'A shared master can still be limited to some entities (YX-ORG-15).', synonyms: ['shared', 'entity-only'] },
          ],
        },
      ],
      lastChange: { by: 'Meera Iyer', role: 'Finance Manager', at: '2026-09-02T16:20', what: 'Raised M1 pay range maximum from ₹16,00,000 to ₹18,00,000 from 1 Apr 2026' },
      related: [
        { label: 'Org chart', screenId: 'PPL-02' },
        { label: 'Employee import', screenId: 'PPL-07' },
      ],
    },

    // ───────────────────────────── 1.5 Employee records
    {
      id: '1.5',
      group: 1,
      title: 'Employee records',
      summary: 'How employee codes are made, your own fields on the employee record, and which bank accounts and employments a person may have.',
      owner: ['P01'],
      contributes: ['M01', 'P18'],
      permission: 'org.settings.manage',
      permissionHolder: 'System Admin or HR Admin',
      scopes: ['Company', 'Legal entity'],
      sections: [
        {
          title: 'Employee codes',
          settings: [
            { key: 'org.employee_code.scope', label: 'Codes are unique', kind: 'radio', value: 'Per legal entity', options: ['Per legal entity', 'Across the company'], helper: 'Switching to company-wide is blocked while duplicates exist; you see the clashes to fix first (YX-ORG-16).', starter: true, synonyms: ['employee ID', 'employee number'] },
            {
              key: 'org.employee_code.pattern', label: 'Code pattern', kind: 'list', addLabel: 'Add pattern',
              columns: ['Scope', 'Prefix', 'Running number', 'Next code'],
              rows: [
                ['Kaveri Foods Pvt Ltd', 'KF-', '4 digits', 'KF-0249'],
                ['Kaveri Foods Pvt Ltd (Tamil Nadu)', 'KFTN-', '4 digits', 'KFTN-0035'],
              ],
              helper: 'Imported codes are kept; the sequence continues after the highest.',
              starter: true,
              synonyms: ['code format', 'prefix'],
            },
          ],
        },
        {
          title: 'Custom fields',
          description: 'Fields you add to the employee record. Each says how private it is and whether the employee can edit it.',
          settings: [
            {
              key: 'org.employee.custom_fields', label: 'Custom fields', kind: 'list', addLabel: 'Add custom field',
              columns: ['Field', 'Type', 'Section', 'Sensitivity', 'Employee can edit'],
              rows: [
                ['Blood group', 'Pick-list', 'Personal', 'Personal', 'Yes'],
                ['Food handler medical certificate expiry', 'Date', 'Documents', 'Special', 'No'],
                ['Shoe size (PPE)', 'Number', 'Personal', 'Internal', 'Yes'],
                ['Canteen card number', 'Text', 'Job & assignment', 'Internal', 'No'],
              ],
              synonyms: ['custom field', 'extra field'],
            },
            { key: 'org.employee.custom_objects_link', label: 'Custom objects and layouts', kind: 'link', linkScreenId: 'PLT-22', linkLabel: 'Open custom object builder', contributedBy: 'P18' },
            {
              key: 'org.employee.gender_list', label: 'Gender list', kind: 'list', addLabel: 'Add value',
              columns: ['Value', 'Statutory report category'],
              rows: [['Female', 'Female'], ['Male', 'Male'], ['Transgender', 'Transgender'], ['Non-binary', 'Other'], ['Prefer not to say', 'Not stated']],
              starter: true,
              synonyms: ['gender'],
            },
          ],
        },
        {
          title: 'Employments and bank accounts',
          settings: [
            { key: 'org.employment.concurrent', label: 'Allow concurrent employments', kind: 'toggle', value: false, helper: 'For now, a person has one open employment at a time.', availability: 'Later wave', synonyms: ['dual employment', 'two entities'] },
            { key: 'org.employee.reimbursement_account', label: 'Allow a second bank account for reimbursements', kind: 'toggle', value: true, helper: 'Both accounts are verified, and changing either needs approval.', contributedBy: 'M01', synonyms: ['bank account', 'reimbursement account'] },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-07-08T12:30', what: 'Added custom field Food handler medical certificate expiry (Special)' },
      related: [
        { label: 'Employee workspace', screenId: 'PPL-03' },
        { label: 'Profile change request', screenId: 'PPL-32' },
      ],
    },

    // ───────────────────────────── 1.6 Set-up hub
    {
      id: '1.6',
      group: 1,
      title: 'Set-up hub',
      summary: 'Progress of set-up for every module and the go-live checklist. It reads every settings group and links to the page that fixes each gap.',
      owner: ['P01'],
      contributes: ['APX-E', 'P15'],
      permission: 'org.settings.manage',
      permissionHolder: 'System Admin',
      scopes: ['Company', 'Legal entity'],
      sections: [
        {
          title: 'Module completeness',
          settings: [
            { key: 'org.setup.hub', label: 'Set-up hub', kind: 'link', linkScreenId: 'PLT-08', linkLabel: 'Open set-up hub', synonyms: ['setup', 'go-live', 'readiness'] },
            {
              key: 'org.setup.cards', label: 'Modules', kind: 'list', readOnlyList: true,
              columns: ['Module', 'Stage', 'Ready', 'Signs off'],
              rows: [
                ['Organisation & entities', 'Signed off', '100 %', 'Arjun Kulkarni'],
                ['Roles & admin users', 'Ready', '100 %', 'Arjun Kulkarni'],
                ['Approval policies', 'Setting up', '82 %', 'Lakshmi Venkatesan'],
                ['Payroll · Kaveri Foods Pvt Ltd', 'Parallel run', '94 %', 'Suresh Pillai'],
                ['Lifecycle', 'Setting up', '71 %', 'Lakshmi Venkatesan'],
              ],
              helper: 'Must-fix checks count three times as much as suggestions.',
            },
          ],
        },
        {
          title: 'Go-live',
          settings: [
            { key: 'org.setup.quick_start', label: 'Quick-start lanes', kind: 'link', linkScreenId: 'PLT-39', linkLabel: 'Open quick-start lanes' },
            { key: 'org.setup.health_widget', label: 'Show readiness on the admin home after go-live', kind: 'toggle', value: true, starter: true },
            { key: 'org.setup.review_starters', label: 'Flag starter templates for review before go-live', kind: 'toggle', value: true, helper: 'Starter values marked for review stay as advisory checks until someone confirms them.', starter: true, synonyms: ['starter template'] },
          ],
        },
      ],
      lastChange: { by: 'Suresh Pillai', role: 'Payroll Manager', at: '2026-09-25T17:10', what: 'Moved payroll for Kaveri Foods Pvt Ltd to parallel run' },
      related: [
        { label: 'Set-up hub', screenId: 'PLT-08' },
        { label: 'Tenant set-up wizard', screenId: 'PLT-09' },
      ],
    },

    // ───────────────────────────── 1.7 Customisation
    {
      id: '1.7',
      group: 1,
      title: 'Customisation',
      summary: 'Your own objects, fields, page layouts and request types, how they move from sandbox to production, and how much of the fair-use limits you have used.',
      owner: ['P18'],
      contributes: ['P19'],
      permission: 'customisation.manage',
      permissionHolder: 'System Admin',
      note: 'Every change to objects, fields and layouts is versioned and recorded with before and after values.',
      sections: [
        {
          title: 'Builders',
          settings: [
            { key: 'cust.objects', label: 'Custom objects and fields', kind: 'link', linkScreenId: 'PLT-22', linkLabel: 'Open custom object builder', synonyms: ['custom object', 'custom table'] },
            { key: 'cust.layouts', label: 'Layouts per role', kind: 'link', linkScreenId: 'PLT-23', linkLabel: 'Open form and layout builder', synonyms: ['form builder', 'page layout'] },
            { key: 'cust.request_types', label: 'Custom request types', kind: 'link', linkScreenId: 'PLT-24', linkLabel: 'Open request-type builder', synonyms: ['request type', 'custom form'] },
            { key: 'cust.packages', label: 'Packages and promotion', kind: 'link', linkScreenId: 'PLT-25', linkLabel: 'Open packages and promotion', synonyms: ['sandbox', 'promote'] },
          ],
        },
        {
          title: 'Promotion required',
          description: 'When on, changes reach production only through a reviewed sandbox promotion.',
          settings: [
            { key: 'cust.promotion.objects', label: 'Objects, fields and request types', kind: 'toggle', value: true, starter: true, synonyms: ['promotion required'] },
            { key: 'cust.promotion.layouts', label: 'Layouts and pick-list values', kind: 'toggle', value: false, starter: true, helper: 'When off, System Admins can change these directly in the live app.' },
          ],
        },
        {
          title: 'Starter library',
          settings: [
            {
              key: 'cust.starter_library', label: 'YukthiX starters', kind: 'list', readOnlyList: true,
              columns: ['Starter', 'Kind', 'In use'],
              rows: [
                ['Uniform & PPE issue', 'Object', 'Yes · customised'],
                ['Canteen / transport pass', 'Object', 'Yes'],
                ['Site induction', 'Object', 'Yes'],
                ['Vehicle register', 'Object', 'No'],
                ['Union membership', 'Object', 'No'],
              ],
              helper: 'When a starter gets a new version, you see what changed and choose whether to take it.',
            },
          ],
        },
        {
          title: 'Limits used',
          settings: [
            {
              key: 'cust.limits', label: 'Fair-use limits', kind: 'list', readOnlyList: true,
              columns: ['Limit', 'Used', 'Allowed'],
              rows: [
                ['Custom objects', '6', '50'],
                ['Fields on the largest object', '38', '200'],
                ['Layouts on one record type', '9', '25'],
                ['Custom request types', '7', '50'],
                ['Custom records', '4,820', '18,400 (20 × billable employees)'],
              ],
              helper: 'You get an alert at 80 % and 100 %. Reading and exporting never stop.',
              synonyms: ['limits', 'usage'],
            },
          ],
        },
      ],
      lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-10T14:45', what: 'Promoted package "Plant PPE v3" from sandbox to production' },
      related: [
        { label: 'Custom object records', screenId: 'PLT-26' },
        { label: 'Form and layout builder', screenId: 'PLT-23' },
      ],
    },

    // ───────────────────────────── 1.8 Policies, rules & automations
    {
      id: '1.8',
      group: 1,
      title: 'Policies, rules & automations',
      summary: 'The rule catalogue across modules, lookup tables, validation rules, automations and Workflow Studio, with who approves rule changes and how much of the limits you have used.',
      owner: ['P19'],
      contributes: ['P22'],
      permission: 'policy.rule.manage',
      permissionHolder: 'Module policy owners and System Admin',
      note: 'Changes to rules and workflows touching pay, leave balances, access or visibility always need a second approver. The law always wins: a result below the legal minimum is raised to it.',
      sections: [
        {
          title: 'Rules',
          settings: [
            { key: 'rules.catalogue', label: 'Rule catalogue', kind: 'link', linkScreenId: 'PLT-31', linkLabel: 'Open policies', helper: 'Each module\'s Policies page links here.', synonyms: ['policy', 'rule', 'company policy'] },
            { key: 'rules.builder', label: 'Rule builder', kind: 'link', linkScreenId: 'PLT-32', linkLabel: 'Open rule builder' },
            { key: 'rules.lookup_tables', label: 'Lookup tables', kind: 'link', linkScreenId: 'PLT-34', linkLabel: 'Open lookup tables', synonyms: ['lookup', 'rate table', 'per diem'] },
            { key: 'rules.validation', label: 'Validation rules per record type', kind: 'link', linkScreenId: 'PLT-36', linkLabel: 'Open validation rules', synonyms: ['validation'] },
            { key: 'rules.automations', label: 'Automations', kind: 'link', linkScreenId: 'PLT-35', linkLabel: 'Open automations', synonyms: ['automation', 'trigger'] },
          ],
        },
        {
          title: 'Rule approvals',
          settings: [
            { key: 'rules.second_approver.categories', label: 'Rules needing a second approver', kind: 'multiselect', value: ['Pay', 'Leave balances', 'Access', 'Data visibility'], options: ['Pay', 'Leave balances', 'Access', 'Data visibility', 'Attendance', 'Expenses', 'Performance'], helper: 'Pay, leave balances, access and visibility are always on and can\'t be removed.', synonyms: ['maker checker', 'second approver'] },
            {
              key: 'rules.approvers', label: 'Approvers per module', kind: 'list', addLabel: 'Add approver',
              columns: ['Module', 'Second approver'],
              rows: [
                ['Payroll', 'Meera Iyer (Finance Manager)'],
                ['Leave & attendance', 'Lakshmi Venkatesan (HR Business Partner)'],
                ['Access & visibility', 'Arjun Kulkarni (System Admin)'],
              ],
            },
            { key: 'rules.promotion_required', label: 'Promotion required for rules', kind: 'toggle', value: false, starter: true, helper: 'When on, rules are tested in the sandbox and reach the live app only through a reviewed promotion.' },
          ],
        },
        {
          title: 'Workflow Studio',
          description: 'Multi-step workflows that use the same rules.',
          settings: [
            { key: 'wfs.studio', label: 'Workflow Studio', kind: 'link', linkScreenId: 'PLT-55', linkLabel: 'Open Workflow Studio', contributedBy: 'P22', synonyms: ['workflow', 'no-code'] },
            { key: 'wfs.gallery', label: 'Template gallery', kind: 'link', linkScreenId: 'PLT-56', linkLabel: 'Open template gallery', contributedBy: 'P22' },
            { key: 'wfs.builders', label: 'Who may build and publish', kind: 'multiselect', value: ['System Admin', 'HR Admin'], options: ['System Admin', 'HR Admin', 'Payroll Admin', 'Department head'], contributedBy: 'P22' },
            { key: 'wfs.promotion_required', label: 'Promotion required for workflows', kind: 'toggle', value: false, starter: true, contributedBy: 'P22' },
            { key: 'wfs.ai_build', label: 'Let AI draft workflows', kind: 'toggle', value: false, helper: 'AI drafts a workflow from a description; a person always reviews and publishes it.', contributedBy: 'P22', synonyms: ['AI assistant'] },
            { key: 'wfs.ai_do', label: 'Let AI run approved plans', kind: 'toggle', value: false, helper: 'AI proposes the steps; nothing runs until a person approves the plan.', contributedBy: 'P22' },
            {
              key: 'wfs.approved_endpoints', label: 'Approved endpoints', kind: 'list', addLabel: 'Add endpoint',
              columns: ['Host or connector', 'Used by'],
              rows: [['Accounting software connector', 'Month-end cost journal']],
              helper: 'Workflows can only send data to these. Incoming webhooks must be signed, and incoming email is accepted only from approved senders.',
              contributedBy: 'P22',
              synonyms: ['webhook', 'endpoint', 'inbound email'],
            },
            { key: 'wfs.service_identities', label: 'Service identities', kind: 'link', linkScreenId: 'PLT-61', linkLabel: 'Open script editor', helper: 'A script can never do more than the person who published it.', contributedBy: 'P22', availability: 'Wave 6' },
          ],
        },
        {
          title: 'Emergency stop',
          tone: 'danger',
          description: 'Use only if a workflow is doing harm, for example sending wrong emails or changing records.',
          settings: [
            { key: 'wfs.kill_switch', label: 'Pause all workflows', kind: 'toggle', value: false, helper: 'Every running workflow stops before its next step. You then choose to resume or cancel each held run. You confirm it is you before this saves.', sensitive: true, contributedBy: 'P22', synonyms: ['kill switch', 'stop automations'] },
          ],
        },
        {
          title: 'Limits used',
          settings: [
            {
              key: 'rules.limits', label: 'Fair-use limits', kind: 'list', readOnlyList: true,
              columns: ['Limit', 'Used', 'Allowed'],
              rows: [
                ['Active rules', '142', '500'],
                ['Lookup table rows', '1,260', '10,000'],
                ['Automation runs today', '318', '5,000'],
                ['Workflow runs today', '96', '2,000'],
              ],
              helper: 'You get an alert at 80 % and 100 %. Going past the limit needs a usage add-on.',
            },
          ],
        },
      ],
      lastChange: { by: 'Suresh Pillai', role: 'Payroll Manager', at: '2026-09-18T11:35', what: 'Published rule "Night shift allowance Hosur" v4, approved by Meera Iyer' },
      related: [
        { label: 'Impact preview', screenId: 'PLT-33' },
        { label: 'Run log and failures', screenId: 'PLT-59' },
        { label: 'Jobs & errors', screenId: 'PLT-38' },
      ],
    },
  ],
};

export const GROUP_2: SettingsGroupDef = {
  id: 2,
  title: 'People & Access',
  summary: 'Roles, privacy, security and approvals, the employee lifecycle from onboarding to exit, assets, cases, audit retention and partners.',
  pages: [
    // ───────────────────────────── 2.1 Roles & access
    {
      id: '2.1',
      group: 2,
      title: 'Roles & access',
      summary: 'Role templates and your own roles, what managers can see and approve, and who holds the special permissions.',
      owner: ['P02'],
      contributes: ['P03', 'P09', 'M09'],
      permission: 'access.role.manage',
      permissionHolder: 'System Admin',
      note: 'Saving a role runs a risk check. If you save despite its warnings, it is recorded and other admins are told.',
      sections: [
        {
          title: 'Roles',
          settings: [
            { key: 'access.roles', label: 'Roles, field classes and user access', kind: 'link', linkScreenId: 'PLT-11', linkLabel: 'Open roles & access', synonyms: ['role', 'permission', 'RBAC', 'field class'] },
            {
              key: 'access.role_summary', label: 'Roles in use', kind: 'list', readOnlyList: true, helper: 'Roles are created and changed in Roles & access.',
              columns: ['Role', 'Kind', 'Scope', 'Holders'],
              rows: [
                ['HR Admin', 'Template', 'Company', '3'],
                ['Payroll Admin', 'Template', 'Kaveri Foods Pvt Ltd', '2'],
                ['Payroll Approver', 'Template', 'Kaveri Foods Pvt Ltd', '1'],
                ['Plant HR Executive', 'Custom (from HR Executive)', 'Hosur plant', '2'],
                ['Privacy officer', 'Template', 'Company', '1'],
              ],
            },
          ],
        },
        {
          title: 'Manager access',
          settings: [
            { key: 'access.manager.view_scope', label: 'Managers can view', kind: 'radio', value: 'Whole reporting subtree', options: ['Whole reporting subtree', 'Direct reports only'], optionLabels: { 'Whole reporting subtree': 'Everyone under them', 'Direct reports only': 'Direct reports only' }, starter: true, synonyms: ['manager scope', 'team'] },
            { key: 'access.manager.approve_scope', label: 'Managers can approve for', kind: 'radio', value: 'Direct reports only', options: ['Direct reports only', 'Whole reporting subtree'], optionLabels: { 'Whole reporting subtree': 'Everyone under them', 'Direct reports only': 'Direct reports only' }, starter: true },
            { key: 'access.team_salary.roles', label: 'Roles with team salary view', kind: 'multiselect', value: ['Department head'], options: ['Department head', 'Manager', 'Finance'], helper: 'Off for managers by default. A manager still sees pay inside a salary review they run.', warning: 'People in these roles see the salaries of everyone in their team. Today that is 4 people.', sensitive: true, synonyms: ['team salary', 'salary visibility'] },
          ],
        },
        {
          title: 'Special permissions',
          settings: [
            {
              key: 'access.raise_on_behalf', label: 'Raise on behalf', kind: 'list', addLabel: 'Add holder',
              columns: ['Role', 'Scope', 'Request types'],
              rows: [
                ['HR Admin', 'Company', 'All'],
                ['Manager', 'Team', 'Leave, regularisation'],
                ['Plant HR Executive', 'Hosur plant', 'Leave, regularisation, shift change'],
              ],
              starter: true,
              synonyms: ['proxy', 'on behalf'],
            },
            { key: 'access.roster_manage', label: 'Can manage shifts and rosters', kind: 'multiselect', value: ['HR Admin', 'Plant HR Executive', 'Production Supervisor'], options: ['HR Admin', 'HR Executive', 'Plant HR Executive', 'Production Supervisor', 'Manager'], synonyms: ['roster', 'shift'] },
            { key: 'access.dashboard_build', label: 'Can build dashboards', kind: 'multiselect', value: ['HR Admin', 'Payroll Admin', 'System Admin', 'Department head'], options: ['HR Admin', 'Payroll Admin', 'System Admin', 'Department head', 'Finance', 'Manager'], starter: true, contributedBy: 'P09', synonyms: ['dashboard', 'analytics'] },
            { key: 'access.announcer', label: 'Announcers', kind: 'multiselect', value: ['HR Admin', 'Department head'], options: ['HR Admin', 'Department head', 'Manager', 'System Admin'], helper: 'They can post only to the people their role covers.', contributedBy: 'M09', synonyms: ['announcement', 'post'] },
            { key: 'access.workflow_policy', label: 'Can manage approval policies', kind: 'multiselect', value: ['HR Admin', 'System Admin'], options: ['HR Admin', 'System Admin', 'Payroll Admin'], helper: 'Payroll, bank and statutory policies also need the Payroll Admin role.', contributedBy: 'P03' },
          ],
        },
      ],
      lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-08-27T10:50', what: 'Created custom role Plant HR Executive from HR Executive, scoped to Hosur plant' },
      related: [
        { label: 'Roles & access', screenId: 'PLT-11' },
        { label: 'Dashboard builder', screenId: 'ANL-03' },
      ],
    },

    // ───────────────────────────── 2.2 Directory & privacy
    {
      id: '2.2',
      group: 2,
      title: 'Directory & privacy',
      summary: 'What colleagues see about each other, what employees may hide, transparency about who viewed their data, and the privacy notices you publish.',
      owner: ['P02'],
      contributes: ['P08', 'P09', 'P17'],
      permission: 'privacy.settings.manage',
      permissionHolder: 'System Admin or Privacy officer',
      scopes: ['Company', 'Legal entity'],
      sections: [
        {
          title: 'Directory',
          settings: [
            { key: 'privacy.directory.fields', label: 'Fields in the directory', kind: 'multiselect', value: ['Name', 'Photo', 'Designation', 'Department', 'Location', 'Work email', 'Work phone', 'Manager', 'Birthday (day and month)'], options: ['Name', 'Photo', 'Designation', 'Department', 'Location', 'Work email', 'Work phone', 'Manager', 'Birthday (day and month)', 'Personal phone', 'Languages spoken'], helper: 'Private fields such as salary, bank, ID numbers and medical details can never appear.', starter: true, synonyms: ['directory', 'people search', 'birthday'] },
            { key: 'privacy.directory.self_hide', label: 'Employees can hide their own Personal fields', kind: 'toggle', value: true, synonyms: ['hide birthday', 'opt out'] },
            { key: 'privacy.search.content_types', label: 'Content types in search', kind: 'multiselect', value: ['People', 'Policies', 'Help articles', 'Letters'], options: ['People', 'Policies', 'Help articles', 'Letters', 'Announcements', 'Reports'], contributedBy: 'P17', synonyms: ['search'] },
          ],
        },
        {
          title: 'Transparency and analytics',
          settings: [
            { key: 'privacy.who_accessed', label: 'Show "Who accessed my data" to employees', kind: 'toggle', value: true, helper: 'Turning it off hides the employee view only; every access is still recorded.', contributedBy: 'P08', synonyms: ['who viewed', 'access log'] },
            { key: 'privacy.suppression_threshold', label: 'Hide report groups smaller than', kind: 'number', value: 5, unit: 'people', min: 3, max: 10, helper: 'In reports on private data, groups this small are hidden so no one can work out a single person\'s details.', contributedBy: 'P09', synonyms: ['suppression', 'anonymity', 'minimum group'] },
          ],
        },
        {
          title: 'Home page',
          description: 'What each role sees on their home after signing in.',
          settings: [
            { key: 'home.personalise_roles', label: 'Roles that may personalise their own home', kind: 'multiselect', value: [], options: ['Employee', 'Manager', 'HR', 'Finance'], helper: 'Off for everyone by default: people see the layout you set for their role. When allowed, a person can add, remove and reorder widgets on their own home only. "Needs your action" always stays first.', synonyms: ['edit home', 'customise home', 'dashboard layout', 'widgets'] },
            { key: 'home.pay_on_employee_home', label: 'Show net pay on the employee home', kind: 'toggle', value: false, helper: 'HR decides. When on, the amount stays hidden (₹ ••,•••) until the employee selects Show amount, and hides again on every visit.', synonyms: ['salary on home', 'net pay', 'hide pay'] },
          ],
        },
        {
          title: 'External logins',
          settings: [
            {
              key: 'privacy.external_login.expiry', label: 'When outside sign-ins end', kind: 'list', readOnlyList: true,
              columns: ['Template', 'Sign-in', 'Ends'],
              rows: [
                ['Pre-boarding candidate', 'OTP', 'On joining date'],
                ['Alumni', 'OTP', '7 years after exit'],
                ['External trainer', 'OTP', '7 days after last session'],
                ['POSH IC external member', 'OTP + passkey', 'When appointment ends'],
                ['External case party', 'OTP', 'Case closed + appeal window'],
              ],
              synonyms: ['alumni login', 'guest login', 'external login'],
            },
          ],
        },
        {
          title: 'Privacy notices',
          settings: [
            {
              key: 'privacy.notices', label: 'Published notices', kind: 'list', addLabel: 'Publish new version',
              columns: ['Notice', 'Languages', 'Version', 'Published on'],
              rows: [
                ['Employee privacy notice', 'English, Tamil', 'v3', '14 Jul 2026'],
                ['Candidate privacy notice', 'English', 'v2', '2 Jun 2026'],
                ['Pre-boarding notice', 'English, Tamil', 'v1', '2 Jun 2026'],
              ],
              helper: 'Each notice lists every purpose in plain language. Only the Privacy officer can publish.',
              starter: true,
              synonyms: ['privacy notice', 'DPDP', 'consent'],
            },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-07-14T09:40', what: 'Published employee privacy notice v3 in English and Tamil' },
      related: [
        { label: 'Employee directory', screenId: 'PPL-01' },
        { label: 'My data and who accessed it', screenId: 'PPL-33' },
      ],
    },

    // ───────────────────────────── 2.3 Security
    {
      id: '2.3',
      group: 2,
      title: 'Security',
      summary: 'Sign-in, MFA, single sign-on, sessions, network allow-lists, passwords and YukthiX support access.',
      owner: ['P12'],
      contributes: ['M04', 'P02'],
      permission: 'security.settings.manage',
      permissionHolder: 'System Admin',
      note: 'YukthiX sets minimums: you can make these stricter, never looser. You confirm it is you before saving.',
      sections: [
        {
          title: 'MFA and single sign-on',
          settings: [
            { key: 'security.mfa.everyone', label: 'Require a second sign-in step for everyone', kind: 'toggle', value: false, helper: 'Always required for admins, finance approvers, POSH committee members and the ethics officer.', sensitive: true, synonyms: ['MFA', '2FA', 'two-factor'] },
            { key: 'security.mfa.factors', label: 'Allowed sign-in methods', kind: 'multiselect', value: ['Passkey', 'Authenticator app (TOTP)', 'OTP (fallback)'], options: ['Passkey', 'Authenticator app (TOTP)', 'OTP (fallback)'], optionLabels: { 'Authenticator app (TOTP)': 'Authenticator app', 'OTP (fallback)': 'One-time code by SMS (backup)' }, sensitive: true },
            {
              key: 'security.sso.providers', label: 'SSO identity providers', kind: 'list', addLabel: 'Add identity provider',
              columns: ['Provider', 'Protocol', 'Email domains', 'Just-in-time accounts'],
              rows: [['Corporate identity provider', 'SAML 2.0', 'kaverifoods.in', 'On (not for sensitive roles)']],
              sensitive: true,
              synonyms: ['SSO', 'SAML', 'OIDC', 'single sign-on'],
            },
            { key: 'security.sso.only', label: 'Sign in only through your identity provider', kind: 'toggle', value: false, helper: 'Needs at least 2 emergency admins who can still sign in if the provider is down.', blocked: 'You have 1 emergency admin (Arjun Kulkarni). Add one more in Roles & access before turning this on.', sensitive: true },
            { key: 'security.scim', label: 'Create and remove users automatically from your identity provider', kind: 'toggle', value: false, helper: 'When someone is removed there, they are signed out here within 5 minutes.', availability: 'Wave 3', sensitive: true, synonyms: ['SCIM', 'provisioning'] },
          ],
        },
        {
          title: 'Sessions',
          settings: [
            { key: 'security.desk.idle_timeout', label: 'Sign out on the web after no activity for', kind: 'number', value: 30, unit: 'minutes', min: 5, max: 480, starter: true, synonyms: ['timeout', 'idle'] },
            { key: 'security.desk.session_max', label: 'Longest web session', kind: 'number', value: 12, unit: 'hours', min: 1, max: 12 },
            { key: 'security.mobile.session_days', label: 'Mobile session on a personal device', kind: 'number', value: 30, unit: 'days', min: 1, max: 30, starter: true, contributedBy: 'M04', synonyms: ['stay signed in', 'mobile session'] },
            { key: 'security.mobile.reauth_idle', label: 'Re-authenticate on sensitive screens after idle', kind: 'number', value: 15, unit: 'minutes', min: 1, max: 15, helper: 'Biometric or PIN when opening Pay, documents, bank or ID fields.', contributedBy: 'M04', synonyms: ['re-auth', 'PIN'] },
          ],
        },
        {
          title: 'Network and passwords',
          settings: [
            {
              key: 'security.ip_allow_list', label: 'IP allow-list', kind: 'list', addLabel: 'Add range',
              columns: ['Applies to', 'Range', 'Label'],
              rows: [
                ['Admin console', '103.21.58.0/24', 'Bengaluru head office'],
                ['API keys', '52.66.14.20/32', 'Accounting software server'],
              ],
              helper: 'The mobile app and outside portals aren\'t limited unless you add them.',
              sensitive: true,
              synonyms: ['IP whitelist', 'allow list'],
            },
            { key: 'security.password.min_length', label: 'Minimum password length', kind: 'number', value: 12, unit: 'characters', min: 12, max: 64, helper: 'Breached passwords are always rejected. No forced rotation.', synonyms: ['password policy'] },
          ],
        },
        {
          title: 'YukthiX support access',
          settings: [
            { key: 'security.support.window_default', label: 'Default access window', kind: 'number', value: 24, unit: 'hours', min: 1, max: 72, helper: 'Each session needs your approval. Maximum 72 hours.', contributedBy: 'P02', synonyms: ['support access', 'vendor access'] },
            { key: 'security.support.unmask', label: 'Allow support to see Confidential data unmasked', kind: 'toggle', value: false, contributedBy: 'P02', sensitive: true },
            { key: 'security.support.requests', label: 'Support-access requests', kind: 'link', linkScreenId: 'PLT-17', linkLabel: 'Open support-access requests' },
          ],
        },
      ],
      lastChange: { by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-09-04T18:00', what: 'Added SAML 2.0 identity provider for kaverifoods.in' },
      related: [
        { label: 'Support-access requests', screenId: 'PLT-17' },
        { label: 'Audit log', screenId: 'PLT-16' },
      ],
    },

    // ───────────────────────────── 2.4 Approvals
    {
      id: '2.4',
      group: 2,
      title: 'Approvals',
      summary: 'Approval policies for every request type, reminders and escalation, out-of-app approval, risk levels and automatic delegation.',
      owner: ['P03'],
      contributes: ['P19'],
      permission: 'workflow.policy.manage',
      permissionHolder: 'HR Admin or System Admin',
      note: 'Before a policy is saved, it is tested on sample requests. Each save creates a new version and is recorded. Payroll, bank and statutory policies also need the Payroll Admin role.',
      sections: [
        {
          title: 'Policies per request type',
          settings: [
            { key: 'approval.policy_editor', label: 'Approval policies', kind: 'link', linkScreenId: 'PLT-12', linkLabel: 'Open approval policy editor', helper: 'Who approves what, in which order, how fast, and when a step is skipped.', synonyms: ['approval chain', 'workflow', 'approver'] },
            {
              key: 'approval.policies', label: 'Active policies', kind: 'list', readOnlyList: true, helper: 'Change these in the approval policy editor.',
              columns: ['Request type', 'Approvers', 'Who must approve', 'Time to decide', 'If no decision'],
              rows: [
                ['Leave', 'Manager', 'Any one', '2 days', 'Approved after 3 days'],
                ['Regularisation', 'Manager', 'Any one', '2 days', 'Reminders only'],
                ['Expense claim over ₹25,000', 'Manager → Finance', 'Any one', '3 days', 'Reminders only'],
                ['Payroll run', 'Payroll Admin → Finance Manager', 'All of them', '1 day', 'Never automatic'],
                ['Bank account change', 'HR Admin', 'Any one', '1 day', 'Never automatic'],
              ],
              starter: true,
            },
            { key: 'approval.default_mode', label: 'When a step has several approvers', kind: 'radio', value: 'Any one', options: ['Any one', 'All', 'At least N'], optionLabels: { 'Any one': 'Any one decides', All: 'All must approve', 'At least N': 'A set number must approve' }, starter: true, synonyms: ['any', 'all'] },
          ],
        },
        {
          title: 'Reminders and escalation',
          settings: [
            { key: 'approval.sla.reminders', label: 'Remind the approver at', kind: 'multiselect', value: ['50 % of SLA', '100 % of SLA'], options: ['25 % of SLA', '50 % of SLA', '75 % of SLA', '100 % of SLA'], optionLabels: { '25 % of SLA': 'A quarter of the time', '50 % of SLA': 'Halfway', '75 % of SLA': 'Three quarters of the time', '100 % of SLA': 'When time is up' }, starter: true, synonyms: ['SLA', 'reminder'] },
            { key: 'approval.sla.escalate_to', label: 'Escalate to', kind: 'radio', value: "Approver's manager", options: ["Approver's manager", 'HR Admin', 'Named role'], starter: true, synonyms: ['escalation'] },
            { key: 'approval.auto_action.types', label: 'Low-risk requests that may be decided automatically', kind: 'multiselect', value: ['Leave'], options: ['Leave', 'Regularisation', 'Work from home', 'Shift swap', 'Certificate request'], helper: 'Never for payroll run, bank file, statutory payment, bank or PAN change, role grants and support access.', synonyms: ['auto approve', 'auto reject'] },
          ],
        },
        {
          title: 'Channels, risk and delegation',
          settings: [
            { key: 'approval.out_of_app', label: 'Approve from email or WhatsApp for low-risk types', kind: 'toggle', value: true, helper: 'Signed single-use links that expire in 72 hours. High-risk types always need sign-in.', starter: true, synonyms: ['email approval', 'WhatsApp approval'] },
            {
              key: 'approval.risk_levels', label: 'Risk level per request type', kind: 'list',
              columns: ['Request type', 'Minimum', 'Your level'],
              rows: [
                ['Leave', 'Low', 'Low'],
                ['Expense claim', 'Low', 'Medium'],
                ['Salary advance', 'Medium', 'High'],
                ['Payroll run', 'High', 'High'],
              ],
              lockedColumns: ['Request type', 'Minimum'],
              columnOptions: { 'Your level': ['Low', 'Medium', 'High'] },
              minColumn: { value: 'Your level', min: 'Minimum' },
              helper: 'You can raise a request type\'s risk, never set it below the minimum.',
            },
            { key: 'approval.edit_types', label: 'Approve-with-changes allowed for', kind: 'multiselect', value: ['Expense claim lines', 'Advance amount'], options: ['Expense claim lines', 'Advance amount', 'Overtime hours', 'Travel request'], helper: 'Other types are sent back for the requester to edit.' },
            { key: 'approval.duplicate_auto', label: 'Auto-approve when the same approver appears twice in a row', kind: 'toggle', value: true, helper: 'Never when the person who made a change would also be approving it.', starter: true, synonyms: ['duplicate approver'] },
            { key: 'approval.leave_delegation', label: 'Delegate approvals automatically during approved leave', kind: 'toggle', value: true, helper: 'Goes to the delegate chosen on the leave request, else the approver\'s manager.', synonyms: ['delegation', 'out of office'] },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-09-22T13:25', what: 'Raised Salary advance risk level from Medium to High' },
      related: [
        { label: 'Approvals inbox', screenId: 'PLT-04' },
        { label: 'Delegation', screenId: 'PLT-07' },
      ],
    },

    // ───────────────────────────── 2.5 Onboarding & probation
    {
      id: '2.5',
      group: 2,
      title: 'Onboarding & probation',
      summary: 'Journey templates, what new joiners complete before day one, engagement touchpoints for long pre-boarding, and probation rules.',
      owner: ['M01'],
      permission: 'lifecycle.settings.manage',
      permissionHolder: 'HR Admin',
      scopes: ['Company', 'Legal entity', 'Department', 'Employment type', 'Grade'],
      sections: [
        {
          title: 'Journey templates',
          settings: [
            {
              key: 'onboard.journey_templates', label: 'Onboarding journeys', kind: 'list', addLabel: 'Add journey template',
              columns: ['Template', 'Applies to', 'Tasks', 'Owners'],
              rows: [
                ['Default onboarding', 'Company', '18', 'HR, IT, admin, manager, new hire'],
                ['Plant worker onboarding', 'Hosur plant', '22', 'HR, admin, safety officer, supervisor'],
                ['Engineering onboarding', 'Engineering', '20', 'HR, IT, manager, buddy'],
              ],
              helper: 'Includes statutory tasks: UAN, ESIC IP registration, Form 11, Form 2, appointment letter.',
              starter: true,
              synonyms: ['onboarding checklist', 'journey', 'joining'],
            },
          ],
        },
        {
          title: 'Pre-boarding',
          settings: [
            {
              key: 'onboard.preboarding_items', label: 'Pre-boarding checklist', kind: 'list', addLabel: 'Add item',
              columns: ['Item', 'Required'],
              rows: [
                ['Personal and family details', 'Required'],
                ['Nominations (PF, gratuity, insurance)', 'Required'],
                ['Documents: PAN, Aadhaar, bank proof, photo', 'Required'],
                ['Previous employment and income this year', 'Required'],
                ['E-sign appointment letter, code of conduct, POSH policy', 'Required'],
                ['Tax regime choice', 'Optional'],
              ],
              starter: true,
              synonyms: ['pre-boarding', 'joining documents'],
            },
            {
              key: 'onboard.touchpoints', label: 'Engagement touchpoints', kind: 'list', addLabel: 'Add touchpoint',
              columns: ['Touchpoint', 'When'],
              rows: [
                ['Welcome message from People team', 'On offer acceptance'],
                ['Campus batch newsletter', 'Every 30 days until joining'],
                ['Manager introduction call', '14 days before joining'],
                ['First-day information', '3 days before joining'],
              ],
              helper: 'For long waits before joining, such as campus hires.',
              synonyms: ['campus', 'engagement'],
            },
          ],
        },
        {
          title: 'Probation',
          settings: [
            { key: 'probation.length', label: 'Probation length', kind: 'number', value: 6, unit: 'months', min: 0, max: 12, starter: true, dated: { validFrom: '2026-04-01' }, scope: 'Company', synonyms: ['probation', 'confirmation'] },
            { key: 'probation.review_lead_days', label: 'Send review form before probation ends', kind: 'number', value: 15, unit: 'days', min: 1, max: 60, starter: true, dated: { validFrom: '2026-04-01' } },
            { key: 'probation.max_total', label: 'Maximum total probation with extensions', kind: 'number', value: 12, unit: 'months', min: 1, max: 24, starter: true, dated: { validFrom: '2026-04-01' }, synonyms: ['extend probation'] },
            { key: 'probation.auto_confirm', label: 'Auto-confirm if no decision', kind: 'toggle', value: false, starter: true, helper: 'When off, HR is alerted on the end date and the employee stays on probation until decided.', synonyms: ['auto confirm'] },
            { key: 'probation.auto_confirm_days', label: 'Auto-confirm after', kind: 'number', value: 15, unit: 'days after end date', min: 1, max: 90, showWhen: { key: 'probation.auto_confirm', equals: true } },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-06-29T16:15', what: 'Set probation for Hosur plant to 3 months from 1 Apr 2026 (a Hosur plant override)' },
      related: [
        { label: 'Onboarding board', screenId: 'PPL-11' },
        { label: 'Pre-boarding batches', screenId: 'PPL-14' },
        { label: 'Probation reviews', screenId: 'PPL-16' },
      ],
    },

    // ───────────────────────────── 2.6 Job changes & transfers
    {
      id: '2.6',
      group: 2,
      title: 'Job changes & transfers',
      summary: 'Change types with their letters and approvals, default options for transfers between entities, how mid-period changes are split, and how far back changes may go.',
      owner: ['M01'],
      contributes: ['P01', 'P06'],
      permission: 'lifecycle.settings.manage',
      permissionHolder: 'HR Admin',
      scopes: ['Company', 'Legal entity'],
      sections: [
        {
          title: 'Change types',
          settings: [
            {
              key: 'change.types', label: 'Change types', kind: 'list', addLabel: 'Add change type',
              columns: ['Change type', 'Letter', 'Approval'],
              rows: [
                ['Promotion', 'Promotion letter', 'Manager → HR Admin'],
                ['Transfer (same entity)', 'Transfer letter', 'Manager → HR Admin'],
                ['Inter-entity transfer', 'Transfer letter', 'HR Admin → Payroll Admin'],
                ['Salary revision', 'Revision letter', 'HR Admin → Finance Manager'],
                ['Contract extension', 'Extension letter', 'HR Admin'],
                ['Deputation start / end', 'Deputation letter', 'HR Admin'],
              ],
              starter: true,
              synonyms: ['promotion', 'transfer', 'job change'],
            },
          ],
        },
        {
          title: 'Inter-entity transfer defaults',
          description: 'Applied to every move between legal entities. HR can change them for one transfer.',
          settings: [
            { key: 'transfer.leave', label: 'Leave balance', kind: 'radio', value: 'Carry over', options: ['Carry over', 'Encash at old entity', 'Lapse'], starter: true, contributedBy: 'P01', synonyms: ['transfer leave'] },
            { key: 'transfer.service', label: 'Service continuity', kind: 'radio', value: 'Continue from original joining date', options: ['Continue from original joining date', 'Restart'], starter: true, contributedBy: 'P01', synonyms: ['seniority', 'gratuity service'] },
            { key: 'transfer.code', label: 'Employee code', kind: 'radio', value: 'Keep', options: ['Keep', 'New in target series'], starter: true, contributedBy: 'P01' },
            { key: 'transfer.settlement', label: 'Settlement at old entity', kind: 'radio', value: 'None (amounts move over)', options: ['None (amounts move over)', 'Full F&F'], optionLabels: { 'Full F&F': 'Full and final settlement' }, starter: true, contributedBy: 'P01' },
            { key: 'transfer.structure', label: 'Salary structure', kind: 'radio', value: 'Keep', options: ['Keep', 'Assign new'], starter: true, contributedBy: 'P01' },
          ],
        },
        {
          title: 'Mid-period and past-dated changes',
          settings: [
            { key: 'change.mid_period.method', label: 'When a change starts mid-month', kind: 'radio', value: 'Split into segments', options: ['Split into segments', 'Whole-month cut-off', 'From next month with arrears'], helper: 'Set per change type, and per salary component for pay. Statutory items keep their legal treatment.', starter: true, contributedBy: 'P06', synonyms: ['proration', 'mid month', 'segments'] },
            {
              key: 'change.mid_period.overrides', label: 'Overrides per change type', kind: 'list', addLabel: 'Add override',
              columns: ['Change type', 'Component', 'Method'],
              rows: [
                ['Salary revision', 'Night shift allowance', 'Whole-month cut-off (day 15)'],
                ['Transfer (same entity)', 'All', 'From next month with arrears'],
              ],
              contributedBy: 'P06',
            },
            { key: 'change.retro_limit', label: 'Past-dated changes allowed back to', kind: 'radio', value: 'Start of current financial year', options: ['Start of current financial year', 'Start of previous financial year', 'Current open payroll period only'], helper: 'Anything older needs a System Admin to allow it, with a reason.', starter: true, dated: { validFrom: '2026-04-01' }, contributedBy: 'P06', synonyms: ['retro', 'backdated'] },
          ],
        },
        {
          title: 'Deputation',
          settings: [
            { key: 'deputation.recharge_default', label: 'Cross-entity recharge by default', kind: 'toggle', value: true, synonyms: ['recharge', 'secondment'] },
            { key: 'deputation.recharge_basis', label: 'Recharge basis', kind: 'radio', value: 'Percentage of cost', options: ['Percentage of cost', 'Fixed amount'], showWhen: { key: 'deputation.recharge_default', equals: true } },
            { key: 'deputation.recharge_percent', label: 'Default recharge', kind: 'percent', value: 100, min: 0, max: 100, showWhen: { key: 'deputation.recharge_basis', equals: 'Percentage of cost' } },
            { key: 'deputation.recharge_amount', label: 'Default recharge per month', kind: 'money', value: 25000, showWhen: { key: 'deputation.recharge_basis', equals: 'Fixed amount' } },
          ],
        },
      ],
      lastChange: { by: 'Suresh Pillai', role: 'Payroll Manager', at: '2026-08-05T12:05', what: 'Set night shift allowance to whole-month cut-off at day 15 for salary revisions' },
      related: [
        { label: 'Change action', screenId: 'PPL-04' },
        { label: 'Scheduled changes', screenId: 'PPL-05' },
        { label: 'Transfer continuity checklist', screenId: 'PPL-10' },
      ],
    },

    // ───────────────────────────── 2.7 Exit & lifecycle policies
    {
      id: '2.7',
      group: 2,
      title: 'Exit & lifecycle policies',
      summary: 'Notice periods, early release and buy-out, offboarding and clearance, exit interviews, deprovisioning timing, and company policies for rehire, contract end, retirement, sabbatical, absconding, death in service and open cases.',
      owner: ['M01'],
      permission: 'lifecycle.settings.manage',
      permissionHolder: 'HR Admin',
      scopes: ['Company', 'Legal entity', 'Employment type', 'Grade'],
      note: 'These are your company policies, starting from YukthiX templates. Only the law is enforced; you can always be more generous.',
      sections: [
        {
          title: 'Notice and resignation',
          settings: [
            {
              key: 'exit.notice_periods', label: 'Notice periods', kind: 'list', addLabel: 'Add notice rule',
              columns: ['Grade / type', 'On probation', 'Confirmed'],
              rows: [
                ['W1–W2', '15 days', '30 days'],
                ['G1–G3', '30 days', '60 days'],
                ['M1–M4', '30 days', '90 days'],
                ['E1–E3', '60 days', '90 days'],
                ['Fixed-term (plant)', '15 days', '30 days'],
              ],
              dated: { validFrom: '2026-04-01' },
              starter: true,
              synonyms: ['notice period', 'resignation'],
            },
            { key: 'exit.early_release', label: 'Allow early release with approval', kind: 'toggle', value: true, synonyms: ['early relieving'] },
            { key: 'exit.buyout', label: 'Notice buy-out', kind: 'radio', value: 'Either side', options: ['Either side', 'Employee pays only', 'Not allowed'], helper: 'Any shortfall is settled in the final pay.', synonyms: ['buy out', 'notice pay'] },
            { key: 'exit.fnf_deadline', label: 'Final pay deadline', kind: 'law', value: '2 working days after exit', law: 'Code on Wages, 2019 s.17(2)', synonyms: ['F&F deadline', 'full and final'] },
          ],
        },
        {
          title: 'Offboarding and deprovisioning',
          settings: [
            {
              key: 'exit.offboarding_templates', label: 'Offboarding templates', kind: 'list', addLabel: 'Add template',
              columns: ['Template', 'Applies to', 'Tasks'],
              rows: [
                ['Default offboarding', 'Company', '14'],
                ['Plant worker offboarding', 'Hosur plant', '16'],
              ],
              helper: 'Includes EPFO date of exit, ESIC exit and gratuity Form L.',
              starter: true,
              synonyms: ['exit checklist', 'offboarding'],
            },
            { key: 'exit.clearance_departments', label: 'Clearance departments', kind: 'multiselect', value: ['Manager handover', 'IT', 'Admin & assets', 'Finance', 'People'], options: ['Manager handover', 'IT', 'Admin & assets', 'Finance', 'People', 'Quality', 'Safety'], synonyms: ['clearance', 'no dues'] },
            { key: 'exit.interview_form', label: 'Exit interview form', kind: 'select', value: 'Standard exit survey', options: ['Standard exit survey', 'Short plant exit survey', 'None'], starter: true, synonyms: ['exit interview'] },
            { key: 'exit.deprovision_days', label: 'Remove app access', kind: 'number', value: 30, unit: 'days after exit', min: 0, max: 180, starter: true, synonyms: ['deprovisioning', 'access removal'] },
            { key: 'exit.plan_line_release_days', label: 'Release headcount-plan line after', kind: 'number', value: 30, unit: 'days after exit', min: 0, max: 180, helper: 'Only when no backfill is requested.', synonyms: ['backfill', 'headcount'] },
          ],
        },
        {
          title: 'Company lifecycle policies',
          settings: [
            { key: 'policy.rehire', label: 'Rehire policy', kind: 'select', value: 'Fresh start, same record, code and UAN', options: ['Fresh start, same record, code and UAN', 'Continue service and leave', 'Custom'], helper: 'Probation skipped if the break is under 6 months. HR can override per rehire with a reason.', starter: true, dated: { validFrom: '2026-04-01' }, synonyms: ['rehire', 'boomerang'] },
            { key: 'policy.contract_end.action', label: 'At contract end', kind: 'radio', value: 'Alert and extend', options: ['Auto-exit', 'Alert and extend', 'Convert to permanent'], starter: true, dated: { validFrom: '2026-04-01' }, synonyms: ['fixed-term', 'intern', 'contract end'] },
            { key: 'policy.contract_end.reminders', label: 'Contract-end reminders', kind: 'offsets', value: ['30', '7'], unit: 'days before', starter: true, dated: { validFrom: '2026-04-01' } },
            { key: 'policy.retirement.age', label: 'Retirement age', kind: 'number', value: 58, unit: 'years', min: 50, max: 70, helper: 'Retirement date is the end of the month of reaching this age.', starter: true, dated: { validFrom: '2026-04-01' }, synonyms: ['retirement', 'superannuation'] },
            { key: 'policy.retirement.alerts', label: 'Retirement alerts', kind: 'offsets', value: ['6', '3', '1'], unit: 'months before', starter: true, dated: { validFrom: '2026-04-01' } },
            { key: 'policy.sabbatical.min_service', label: 'Sabbatical: minimum service', kind: 'number', value: 3, unit: 'years', min: 1, max: 20, starter: true, dated: { validFrom: '2026-04-01' }, synonyms: ['sabbatical', 'long leave'] },
            { key: 'policy.sabbatical.max_length', label: 'Sabbatical: longest break', kind: 'number', value: 6, unit: 'months', min: 1, max: 24, starter: true, dated: { validFrom: '2026-04-01' } },
            { key: 'policy.sabbatical.pay', label: 'Sabbatical pay', kind: 'radio', value: 'Unpaid', options: ['Unpaid', 'Half pay', 'Full pay'], starter: true, dated: { validFrom: '2026-04-01' } },
            {
              key: 'policy.absconding', label: 'Absconding steps', kind: 'list', addLabel: 'Add step',
              columns: ['After day', 'What happens', 'Notice sent'],
              rows: [
                ['3', 'Salary on hold', '—'],
                ['7', 'First notice to report back', 'Notice 1'],
                ['14', 'Second notice', 'Notice 2'],
                ['21', 'Treated as having left', 'Exit letter'],
              ],
              helper: 'Notices go by email and registered post. HR can stop or resume at any step.',
              starter: true,
              dated: { validFrom: '2026-04-01' },
              synonyms: ['absconding', 'unauthorised absence'],
            },
            { key: 'policy.death_support', label: 'Death-in-service support', kind: 'multiselect', value: ['Compassionate contact person'], options: ['Ex-gratia payment', 'Salary continuation', 'Insurance claim hand-off', 'Compassionate contact person', 'Education assistance'], helper: 'All of these start off. Dues the law requires are always paid to nominees.', starter: false, dated: { validFrom: '2026-06-01' }, synonyms: ['death', 'bereavement'] },
            { key: 'policy.open_case_hold', label: 'When a case is open at exit, hold', kind: 'multiselect', value: ['Relieving and experience letters', 'F&F'], options: ['Relieving and experience letters', 'F&F'], optionLabels: { 'F&F': 'Final settlement' }, helper: 'HR may release. A hold never delays statutory dues past the legal deadline.', starter: true, dated: { validFrom: '2026-04-01' } },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-09-15T10:30', what: 'Changed notice period for M1–M4 confirmed from 60 to 90 days' },
      related: [
        { label: 'Exit cases', screenId: 'PPL-19' },
        { label: 'Clearance sign-offs', screenId: 'PPL-20' },
        { label: 'Absconding timeline', screenId: 'PPL-24' },
        { label: 'Death-in-service flow', screenId: 'PPL-23' },
      ],
    },

    // ───────────────────────────── 2.8 Assets
    {
      id: '2.8',
      group: 2,
      title: 'Assets',
      summary: 'Asset categories, how employees acknowledge what they receive, and how unreturned assets are recovered at exit.',
      owner: ['M01'],
      permission: 'lifecycle.settings.manage',
      permissionHolder: 'HR Admin or Admin',
      sections: [
        {
          title: 'Categories',
          settings: [
            {
              key: 'asset.categories', label: 'Asset categories', kind: 'list', addLabel: 'Add asset category',
              columns: ['Category', 'Tracked by', 'Default recovery'],
              rows: [
                ['Laptop', 'Serial number', '₹45,000'],
                ['Phone', 'IMEI', '₹15,000'],
                ['SIM', 'Number', '₹500'],
                ['ID / access card', 'Card number', '₹300'],
                ['Safety shoes and PPE kit', 'Tag', '₹2,500'],
                ['Tools', 'Tag', 'Written-down value'],
              ],
              starter: true,
              synonyms: ['asset', 'laptop', 'equipment'],
            },
          ],
        },
        {
          title: 'Issue and return',
          settings: [
            { key: 'asset.ack_method', label: 'Acknowledgement', kind: 'radio', value: 'Click to accept', options: ['Click to accept', 'E-sign', 'None'], synonyms: ['acknowledge asset'] },
            { key: 'asset.recovery_to_fnf', label: 'Add unreturned-asset recovery to F&F', kind: 'toggle', value: true, synonyms: ['recovery'] },
            { key: 'asset.recovery_basis', label: 'Recovery amount', kind: 'radio', value: 'Category default', options: ['Category default', 'Written-down value', 'Decided by HR each time'] },
          ],
        },
      ],
      lastChange: { by: 'Karthik Subramanian', role: 'Engineering Manager', at: '2026-06-18T09:55', what: 'Changed default laptop recovery from ₹40,000 to ₹45,000' },
      related: [{ label: 'Asset register', screenId: 'PPL-25' }],
    },

    // ───────────────────────────── 2.9 Employee relations & cases
    {
      id: '2.9',
      group: 2,
      title: 'Employee relations & cases',
      summary: 'Grievance options, the POSH Internal Committee for each workplace, the misconduct matrix, whistleblower routing and how long cases are kept.',
      owner: ['M08'],
      permission: 'case.settings.manage',
      permissionHolder: 'HR Admin',
      scopes: ['Company', 'Legal entity', 'Location'],
      note: 'Case content is never visible from this page. POSH cases are seen only by the IC members on the case.',
      sections: [
        {
          title: 'Grievances and whistleblowing',
          settings: [
            { key: 'case.grievance.anonymous', label: 'Allow anonymous grievances', kind: 'toggle', value: true, starter: true, synonyms: ['anonymous', 'speak up'] },
            { key: 'case.whistleblower.ethics_officer', label: 'Ethics officer', kind: 'select', value: 'Meera Iyer', options: ['Meera Iyer', 'Lakshmi Venkatesan', 'Karthik Subramanian'], synonyms: ['vigil mechanism', 'ethics'] },
            { key: 'case.whistleblower.committee_categories', label: 'Also route to the audit-committee chair', kind: 'multiselect', value: ['Financial fraud', 'Bribery', 'Food safety falsification'], options: ['Financial fraud', 'Bribery', 'Food safety falsification', 'Data leak', 'Harassment by a director'] },
            { key: 'case.whistleblower.committee_threshold', label: 'Or when the amount involved is over', kind: 'money', value: 500000 },
            { key: 'case.grc', label: 'Grievance Redressal Committee', kind: 'law', value: 'Required at establishments with 20 or more workers', law: 'Industrial Relations Code, 2020 s.4' },
          ],
        },
        {
          title: 'Internal Committee (POSH)',
          settings: [
            {
              key: 'case.ic.members', label: 'IC per workplace', kind: 'list', addLabel: 'Add member',
              columns: ['Workplace', 'Member', 'Role', 'Tenure ends'],
              rows: [
                ['Hosur plant', 'Anitha Raghavan', 'Presiding officer', '31 Mar 2028'],
                ['Hosur plant', 'Selvi Murugan', 'Member', '31 Mar 2028'],
                ['Hosur plant', 'Prakash Nair', 'Member', '31 Mar 2028'],
                ['Hosur plant', 'Dr. Revathi Srinivasan (NGO)', 'External member', '31 Mar 2028'],
                ['Bengaluru head office', 'Lakshmi Venkatesan', 'Presiding officer', '30 Jun 2027'],
              ],
              dated: { validFrom: '2025-04-01' },
              synonyms: ['POSH', 'IC', 'ICC', 'internal committee'],
            },
            { key: 'case.ic.composition', label: 'IC composition', kind: 'law', value: 'Senior woman presiding · at least half women · one external member · tenure up to 3 years', law: 'Sexual Harassment of Women at Workplace Act, 2013 s.4' },
          ],
        },
        {
          title: 'Disciplinary',
          settings: [
            {
              key: 'case.misconduct_matrix', label: 'Misconduct matrix', kind: 'list', addLabel: 'Add misconduct type',
              columns: ['Misconduct', 'Severity', 'Suggested action'],
              rows: [
                ['Late coming (habitual)', 'Minor', 'Written warning'],
                ['Breach of hygiene rules on the line', 'Major', 'Suspension pending inquiry'],
                ['Theft of company property', 'Major', 'Dismissal after inquiry'],
                ['Absence without leave over 8 days', 'Major', 'Show-cause, then inquiry'],
              ],
              starter: true,
              synonyms: ['misconduct', 'disciplinary', 'standing orders'],
            },
            { key: 'case.show_cause_days', label: 'Show-cause reply time', kind: 'number', value: 7, unit: 'days', min: 1, max: 30, starter: true, synonyms: ['show cause'] },
            { key: 'case.warning_expiry', label: 'Warnings expire after', kind: 'number', value: 12, unit: 'months', min: 1, max: 60, helper: 'Expired warnings stay on record.', starter: true, synonyms: ['warning'] },
          ],
        },
        {
          title: 'Retention',
          settings: [
            { key: 'case.retention_years', label: 'Keep closed cases for', kind: 'number', value: 8, unit: 'years', min: 8, max: 20, helper: 'Then archived (encrypted, restricted restore).', synonyms: ['case retention'] },
            { key: 'case.legal_hold', label: 'Allow legal hold on cases', kind: 'toggle', value: true, helper: 'A case on hold is never archived or deleted.', synonyms: ['legal hold'] },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-06-10T15:00', what: 'Reconstituted Hosur plant IC with Dr. Revathi Srinivasan as external member' },
      related: [
        { label: 'Case workspace', screenId: 'HLP-08' },
        { label: 'Ethics desk', screenId: 'HLP-09' },
        { label: 'Speak-up form', screenId: 'HLP-06' },
      ],
    },

    // ───────────────────────────── 2.10 Audit & data retention
    {
      id: '2.10',
      group: 2,
      title: 'Audit & data retention',
      summary: 'How long the audit log and each class of data are kept, and how data-subject requests are handled.',
      owner: ['P02'],
      contributes: ['P08'],
      permission: 'privacy.register.manage',
      permissionHolder: 'Privacy officer',
      note: 'Retention values can\'t go below the legal minimum. A legal hold always overrides deletion.',
      sections: [
        {
          title: 'Audit log',
          settings: [
            { key: 'audit.retention_years', label: 'Keep audit log for', kind: 'number', value: 8, unit: 'years', min: 8, max: 20, legal: { value: 8, statute: 'Companies Act, 2013 s.128(5)' }, helper: 'Last 13 months online; older months archived and searchable on request.', contributedBy: 'P08', synonyms: ['audit trail', 'audit retention'] },
            { key: 'audit.log', label: 'Audit log', kind: 'link', linkScreenId: 'PLT-16', linkLabel: 'Open audit log' },
          ],
        },
        {
          title: 'Retention schedule',
          settings: [
            {
              key: 'retention.schedule', label: 'Retention per data class', kind: 'list',
              lockedColumns: ['Data class', 'Legal minimum'],
              minColumn: { value: 'Your value', min: 'Legal minimum' },
              helper: 'Your value can\'t be shorter than the legal minimum.',
              columns: ['Data class', 'Legal minimum', 'Your value', 'Trigger', 'Action'],
              rows: [
                ['Payroll and statutory', '8 years', '8 years', 'End of financial year', 'Anonymise'],
                ['Employee record', '—', '8 years', 'Exit', 'Anonymise'],
                ['Candidates (not hired)', '—', '1 year', 'Last activity', 'Delete'],
                ['Attendance and punches', '3 years', '3 years', 'End of year', 'Delete'],
                ['Biometric templates', '—', 'Until exit', 'Exit or consent withdrawn', 'Delete'],
                ['Security and processing logs', '1 year', '1 year', 'Log date', 'Delete'],
              ],
              starter: true,
              synonyms: ['retention', 'data deletion', 'DPDP'],
            },
          ],
        },
        {
          title: 'Data-subject requests',
          settings: [
            { key: 'dsar.tracker', label: 'Requests from people about their data', kind: 'link', linkScreenId: 'PLT-27', linkLabel: 'Open data requests', availability: 'Proposed (B12)', synonyms: ['DSAR', 'data request', 'erasure'] },
            { key: 'dsar.sla_days', label: 'Respond to requests within', kind: 'number', value: 30, unit: 'days', min: 1, max: 90, legal: { value: 90, kind: 'max', statute: 'DPDP Rules, 2025 r.14(3)' }, availability: 'Proposed (B12)', synonyms: ['grievance SLA'] },
            { key: 'dsar.roles_breakdown', label: 'Include a per-person roles-and-retention breakdown in access responses', kind: 'toggle', value: true, helper: 'Lists every way we know the person (candidate, employee, former employee…) and when each record is deleted.', availability: 'Proposed (B12)' },
          ],
        },
      ],
      lastChange: { by: 'Lakshmi Venkatesan', role: 'Privacy officer', at: '2026-08-19T11:20', what: 'Changed candidate retention from 2 years to 1 year' },
      related: [
        { label: 'Audit log', screenId: 'PLT-16' },
        { label: 'Data requests', screenId: 'PLT-27' },
      ],
    },

    // ───────────────────────────── 2.11 Partners
    {
      id: '2.11',
      group: 2,
      title: 'Partners',
      summary: 'Accountants and payroll bureaus you work with: what they can reach, which approvals you delegate to them, and ownership of the account.',
      owner: ['P16'],
      permission: 'partner.link.manage',
      permissionHolder: 'System Admin',
      note: 'Partners never see medical, POSH or biometric data. Ending a link removes their access immediately.',
      sections: [
        {
          title: 'Linked partners',
          settings: [
            { key: 'partner.console', label: 'Partners', kind: 'link', linkScreenId: 'PLT-30', linkLabel: 'Open partners', helper: 'Grant editor, access log, end link and ownership transfer.', synonyms: ['CA', 'accountant', 'payroll bureau'] },
            {
              key: 'partner.links', label: 'Linked partners', kind: 'list', addLabel: 'Send a link request',
              columns: ['Partner', 'Relationship', 'Ownership', 'Client contact', 'Grant'],
              rows: [
                ['Iyer & Rao Chartered Accountants', 'Operates payroll', 'Client-owned', 'Meera Iyer', 'Payroll, statutory · both entities'],
                ['Southline Compliance Advisors', 'Advises compliance', 'Client-owned', 'Suresh Pillai', 'Statutory read-only · Kaveri Foods Pvt Ltd (Tamil Nadu)'],
              ],
              synonyms: ['partner', 'grant'],
            },
          ],
        },
        {
          title: 'Money and signing',
          tone: 'danger',
          description: 'These let an outside firm approve pay, release money or sign for you. They must pass the second sign-in step each time, and you confirm it is you before saving.',
          settings: [
            { key: 'partner.delegate.payroll_approval', label: 'Partner may approve payroll', kind: 'toggle', value: false, starter: true, sensitive: true },
            { key: 'partner.delegate.bank_file', label: 'Partner may release salary payments to the bank', kind: 'toggle', value: false, starter: true, sensitive: true },
            { key: 'partner.delegate.filing', label: 'Partner may file PF, ESI and TDS returns', kind: 'toggle', value: true, sensitive: true, synonyms: ['ECR', 'TDS return'] },
            { key: 'partner.delegate.dsc', label: 'Partner may sign with your digital signature', kind: 'toggle', value: false, starter: true, sensitive: true, synonyms: ['digital signature'] },
          ],
        },
        {
          title: 'Ownership and branding',
          settings: [
            { key: 'partner.ownership_transfer', label: 'Ownership transfer notice', kind: 'number', value: 30, unit: 'days', min: 0, max: 30, helper: 'A partner can\'t block you from taking the account back.' },
            { key: 'partner.directory', label: 'Find a verified partner', kind: 'link', linkScreenId: 'PLT-30', linkLabel: 'Open partner directory', helper: 'Only verified partners are listed; ordering never depends on payment.' },
            { key: 'partner.branding_on_login', label: 'Show partner branding on our login page', kind: 'toggle', value: false, helper: 'Needs your consent; no extra charge.' },
          ],
        },
      ],
      lastChange: { by: 'Meera Iyer', role: 'Finance Manager', at: '2026-09-26T17:45', what: 'Delegated statutory filing to Iyer & Rao Chartered Accountants' },
      related: [{ label: 'Partners', screenId: 'PLT-30' }],
    },
  ],
};
