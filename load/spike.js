/**
 * Candidate spike test: simulates N candidates arriving at once, then taking the exam.
 *
 * Phase 1 (the spike): every virtual candidate redeems their invite and starts the
 *   attempt simultaneously. This is the worst moment -- everyone hits the expensive
 *   write path at the same instant.
 * Phase 2 (steady state): each polls /attempt/current on the real 30s cadence and
 *   saves an answer, at the rate the real client does.
 *
 * The exam-runtime under test MUST be started with NODE_ENV=test, otherwise the
 * per-IP throttle (5/60s on redeem) rejects almost the entire spike and you measure
 * the rate limiter instead of the application. NODE_ENV only affects rate-limit-tiers.ts
 * in this app -- nothing else changes.
 *
 *   node load/spike.js --users 250 --base http://localhost:3502/api/v1
 */
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const USERS = Number(arg('users', 100));
const BASE = arg('base', 'http://localhost:3502/api/v1');
const STEADY_SECONDS = Number(arg('steady', 60));

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json'), 'utf8'));
if (fixtures.tokens.length < USERS) {
  console.error(`Only ${fixtures.tokens.length} tokens seeded; need ${USERS}. Re-run seed-load-fixtures.js.`);
  process.exit(1);
}

const samples = []; // { phase, step, ms, status, ok }

async function timed(phase, step, fn) {
  const started = process.hrtime.bigint();
  let status = 0;
  let ok = false;
  let body = '';
  try {
    const res = await fn();
    status = res.status;
    ok = res.ok;
    // The body must be drained or Node keeps the socket busy and later requests queue
    // behind it, showing up as latency the server never actually caused. It is returned
    // to the caller so a step like redeem can read its own token without a second call.
    body = await res.text();
  } catch (error) {
    status = error?.cause?.code ? `ERR_${error.cause.code}` : 'ERR';
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  samples.push({ phase, step, ms, status, ok });
  return { status, ok, body };
}

function post(url, body, token, ip) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Only honoured when TRUST_PROXY=true; harmless otherwise.
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify(body ?? {}),
  });
}

function get(url, token, ip) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip } });
}

function fakeIp(n) {
  return `10.${Math.floor(n / 65536) % 256}.${Math.floor(n / 256) % 256}.${(n % 256) || 1}`;
}

async function candidate(n) {
  const token = fixtures.tokens[n];
  const ip = fakeIp(n);

  const redeem = await timed('spike', 'redeem', () => post(`${BASE}/candidate-auth/redeem`, { token }, null, ip));
  if (!redeem.ok) return { failedAt: 'redeem', status: redeem.status };

  let accessToken;
  try {
    accessToken = JSON.parse(redeem.body).accessToken;
  } catch {
    /* leave undefined */
  }
  if (!accessToken) return { failedAt: 'token', status: 'no-token' };

  const start = await timed('spike', 'start', () => post(`${BASE}/attempt/start`, { consent: true }, accessToken, ip));
  if (!start.ok) return { failedAt: 'start', status: start.status };

  return { accessToken, ip, ok: true };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function report() {
  const byStep = new Map();
  for (const s of samples) {
    const key = `${s.phase}/${s.step}`;
    if (!byStep.has(key)) byStep.set(key, []);
    byStep.get(key).push(s);
  }
  console.log(`\n${'step'.padEnd(18)} ${'n'.padStart(6)} ${'ok'.padStart(6)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'p99'.padStart(9)} ${'max'.padStart(9)}`);
  console.log('-'.repeat(70));
  for (const [key, list] of byStep) {
    const times = list.map((s) => s.ms).sort((a, b) => a - b);
    const ok = list.filter((s) => s.ok).length;
    console.log(
      `${key.padEnd(18)} ${String(list.length).padStart(6)} ${String(ok).padStart(6)} ` +
        `${pct(times, 50).toFixed(0).padStart(7)}ms ${pct(times, 95).toFixed(0).padStart(7)}ms ` +
        `${pct(times, 99).toFixed(0).padStart(8)}ms ${times[times.length - 1].toFixed(0).padStart(8)}ms`,
    );
  }
  const failures = samples.filter((s) => !s.ok);
  if (failures.length) {
    const byStatus = new Map();
    for (const f of failures) byStatus.set(f.status, (byStatus.get(f.status) ?? 0) + 1);
    console.log('\nfailures by status:');
    for (const [status, count] of [...byStatus].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(status).padEnd(12)} ${count}`);
    }
  } else {
    console.log('\nno failures');
  }
}

async function main() {
  console.log(`spike: ${USERS} candidates -> ${BASE}`);
  console.log('phase 1: simultaneous redeem + start\n');

  const spikeStarted = Date.now();
  const results = await Promise.all(Array.from({ length: USERS }, (_, n) => candidate(n)));
  const spikeMs = Date.now() - spikeStarted;

  const live = results.filter((r) => r.ok);
  console.log(`spike done in ${spikeMs}ms -- ${live.length}/${USERS} candidates got into the exam`);

  if (live.length && STEADY_SECONDS > 0) {
    console.log(`\nphase 2: ${live.length} candidates polling for ${STEADY_SECONDS}s at the real 30s cadence\n`);
    const until = Date.now() + STEADY_SECONDS * 1000;
    await Promise.all(
      live.map(async (c) => {
        while (Date.now() < until) {
          await timed('steady', 'poll', () => get(`${BASE}/attempt/current`, c.accessToken, c.ip));
          if (Date.now() >= until) break;
          await timed('steady', 'answer', () =>
            post(`${BASE}/attempt/answer`, { questionId: fixtures.questionIds[0], selectedOptionIds: [] }, c.accessToken, c.ip),
          );
          // Real client polls every 30s; jittered so virtual users do not lock-step
          // into an artificial thundering herd the real system would never see.
          await new Promise((r) => setTimeout(r, 30_000 + Math.random() * 5_000));
        }
      }),
    );
  }

  report();
}

main().catch((error) => {
  console.error(error);
  report();
  process.exit(1);
});
