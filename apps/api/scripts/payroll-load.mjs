// PAY-10.08 load test: runs the "Load test" pay group's payroll through the API and times the calculation.
//   1. psql -v n=10000 -f scripts/payroll-load.sql examapp_pay_check   (a seeded check database, never a live one)
//   2. start the API against that database, then: node scripts/payroll-load.mjs [month] [api base]
// Target (M03 §16.5): 10,000 people in one pay group calculate in under 10 minutes on the pilot hardware.
const month = process.argv[2] ?? new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 7);
const API = process.argv[3] ?? 'http://localhost:3801/api/v1';
const login = async (email) => {
  const r = await fetch(`${API}/auth/staff/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationSlug: 'demo-org', email, password: 'Passw0rd!2026' }) });
  return (await r.json()).accessToken;
};
const t = await login('payroll@demo-org.test');
const call = async (method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (r.status >= 400) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};
const group = (await call('GET', '/payroll/pay-groups')).filter((g) => g.name.startsWith('Load test')).pop();
if (!group) throw new Error('No "Load test" pay group: run scripts/payroll-load.sql first.');
// A run already made for this group and month (an earlier attempt) is calculated again.
const run = (await call('GET', `/payroll/runs?month=${month}`)).find((r) => r.payGroupId === group.id && r.status !== 'void') ?? (await call('POST', '/payroll/runs', { payGroupId: group.id, month }));
const ready = await call('GET', `/payroll/runs/${run.id}/readiness`);
console.log(`${ready.people} people; ${ready.checks.filter((c) => c.severity === 'block').length} blocking checks`);
const started = Date.now();
await call('POST', `/payroll/runs/${run.id}/calculate`);
const queued = Date.now();
console.log(`checks, month freeze and attendance copy: ${((queued - started) / 1000).toFixed(0)} s`);
let p;
for (;;) {
  await new Promise((ok) => setTimeout(ok, 5000));
  p = await call('GET', `/payroll/runs/${run.id}/progress`);
  process.stdout.write(`\r${p.ok + p.failed + p.skipped} of ${p.total} in ${Math.round((Date.now() - started) / 1000)} s   `);
  if (p.status !== 'calculating') break;
}
const secs = (Date.now() - started) / 1000;
console.log(`\n${p.status}: ${p.ok} ok, ${p.failed} failed in ${secs.toFixed(0)} s (${(p.total / secs).toFixed(1)} people a second; 10,000 would take about ${((10_000 / (p.total / secs)) / 60).toFixed(1)} minutes)`);
