-- PAY-10.08 load test data (run on a seeded check database only, never on a live one):
--   psql -v n=10000 -f scripts/payroll-load.sql examapp_pay_check
-- Clones the demo's Arjun Kulkarni (Kaveri Foods Pvt Ltd) :n times, each with his job, salary breakup and an own bank
-- account, into a new "Load test" pay group. Then scripts/payroll-load.mjs runs that group's payroll through the API and
-- times the calculation (target M03 §16.5: 10,000 people in under 10 minutes on the pilot hardware).
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.is_super_admin', 'on', true);
CREATE TEMP TABLE src AS
SELECT e.organization_id AS org, e.id AS employee_id, em.id AS employment_id, em.legal_entity_id AS entity, em.joined_on,
       (SELECT id FROM employee_assignments a WHERE a.employment_id = em.id AND a.superseded_at IS NULL AND a.valid_from <= current_date ORDER BY valid_from DESC LIMIT 1) AS assignment_id,
       (SELECT id FROM compensations c WHERE c.employment_id = em.id AND c.superseded_at IS NULL AND c.valid_from <= current_date ORDER BY valid_from DESC LIMIT 1) AS compensation_id
FROM employees e JOIN employments em ON em.organization_id = e.organization_id AND em.employee_id = e.id
WHERE e.work_email = 'arjun.kulkarni@kaverifoods.test' AND em.exited_on IS NULL;

CREATE TEMP TABLE clones AS
SELECT g AS n, gen_random_uuid() AS person, gen_random_uuid() AS employee, gen_random_uuid() AS employment, gen_random_uuid() AS change, gen_random_uuid() AS package
FROM generate_series(1, :n) g;

INSERT INTO pay_groups (organization_id, legal_entity_id, name, cut_off_day, pay_day)
SELECT org, entity, 'Load test ' || to_char(now(), 'HH24MISS'), 25, 0 FROM src;
CREATE TEMP TABLE grp AS SELECT id FROM pay_groups WHERE name LIKE 'Load test %' ORDER BY created_at DESC LIMIT 1;

INSERT INTO persons (id, organization_id, given_name, family_name) SELECT c.person, s.org, 'Load', 'Person ' || c.n FROM clones c, src s;
INSERT INTO employees (id, organization_id, given_name, family_name, person_id) SELECT c.employee, s.org, 'Load', 'Person ' || c.n, c.person FROM clones c, src s;
INSERT INTO employments (id, organization_id, employee_id, legal_entity_id, employee_code, code_scope_key, joined_on)
SELECT c.employment, s.org, c.employee, s.entity, 'LT' || to_char(now(), 'HH24MISS') || '-' || lpad(c.n::text, 6, '0'), em.code_scope_key, s.joined_on FROM clones c, src s JOIN employments em ON em.id = s.employment_id;
INSERT INTO employee_changes (id, organization_id, employee_id, employment_id, change_type, effective_date, status, payload, impact, reason, requested_by, requested_at, decided_by, decided_at, applied_at)
SELECT c.change, s.org, c.employee, c.employment, x.change_type, x.effective_date, x.status, x.payload, x.impact, x.reason, x.requested_by, x.requested_at, x.decided_by, x.decided_at, x.applied_at
FROM clones c, src s JOIN LATERAL (SELECT * FROM employee_changes WHERE employee_id = s.employee_id ORDER BY seq LIMIT 1) x ON true;
INSERT INTO employment_status_periods (organization_id, employment_id, valid_from, status, change_id)
SELECT s.org, c.employment, s.joined_on, 'confirmed', c.change FROM clones c, src s;
INSERT INTO employee_assignments (organization_id, legal_entity_id, employee_id, employment_id, valid_from, location_id, department_id, designation_id, employment_type_id, change_id, skill_class)
SELECT s.org, s.entity, c.employee, c.employment, s.joined_on, a.location_id, a.department_id, a.designation_id, a.employment_type_id, c.change, a.skill_class FROM clones c, src s JOIN employee_assignments a ON a.id = s.assignment_id;
INSERT INTO compensations (organization_id, employment_id, valid_from, currency, annual_ctc, change_id)
SELECT s.org, c.employment, s.joined_on, k.currency, k.annual_ctc, c.change FROM clones c, src s JOIN compensations k ON k.id = s.compensation_id;
INSERT INTO compensation_packages (id, organization_id, legal_entity_id, employee_id, employment_id, change_id, template_version_id, entry_mode, pay_basis, annual_ctc, monthly_gross, min_wage_check, code_wage_add_back)
SELECT c.package, s.org, s.entity, c.employee, c.employment, c.change, p.template_version_id, p.entry_mode, p.pay_basis, p.annual_ctc, p.monthly_gross, p.min_wage_check, p.code_wage_add_back
FROM clones c, src s JOIN compensations k ON k.id = s.compensation_id JOIN compensation_packages p ON p.change_id = k.change_id;
INSERT INTO compensation_lines (organization_id, legal_entity_id, employee_id, package_id, component_id, monthly, annual)
SELECT s.org, s.entity, c.employee, c.package, l.component_id, l.monthly, l.annual
FROM clones c, src s JOIN compensations k ON k.id = s.compensation_id JOIN compensation_packages p ON p.change_id = k.change_id JOIN compensation_lines l ON l.package_id = p.id;
INSERT INTO pay_group_members (organization_id, pay_group_id, employment_id, valid_from) SELECT s.org, g.id, c.employment, s.joined_on FROM clones c, src s, grp g;
INSERT INTO employee_bank_accounts (organization_id, employee_id, purpose, holder_name, account_enc, account_hash, account_last4, ifsc, usable_from)
SELECT s.org, c.employee, 'salary', 'Load Person ' || c.n, b.account_enc, encode(sha256(c.employee::text::bytea), 'hex'), right(lpad(c.n::text, 4, '0'), 4), b.ifsc, now() - interval '1 day'
FROM clones c, src s JOIN employee_bank_accounts b ON b.employee_id = s.employee_id AND b.purpose = 'salary' AND b.valid_to IS NULL;
SELECT (SELECT id FROM grp) AS pay_group_id, (SELECT count(*) FROM clones) AS people;
COMMIT;
