import { DashboardAnalytics, DashboardSummary } from '../dashboard/dashboard.service';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`;
}
function num(v: number | null): string {
  return v === null ? '—' : String(v);
}

// A single self-contained HTML digest of the last 7 days for one org.
export function renderDigestHtml(orgName: string, analytics: DashboardAnalytics, summary: DashboardSummary): string {
  const f = analytics.funnel;
  const s = analytics.scores;
  const rows = analytics.examQuality
    .slice(0, 20)
    .map(
      (e) =>
        `<tr><td style="padding:4px 10px;border-bottom:1px solid #eee">${esc(e.examTitle)}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right">${e.candidateCount}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right">${Math.round(e.avgScore)}%</td><td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right">${Math.round(e.passRate)}%</td></tr>`,
    )
    .join('');
  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0b1220;max-width:640px">
      <h2 style="margin:0 0 4px">Weekly hiring digest</h2>
      <p style="margin:0 0 16px;color:#667085">${esc(orgName)} · last 7 days</p>

      <h3 style="margin:16px 0 6px">Funnel</h3>
      <p style="margin:0;color:#344054">Invited ${f.invited} → Started ${f.started} → Submitted ${f.submitted} → Passed ${f.passed}
        <span style="color:#667085">(completion ${pct(f.completionRate)})</span></p>

      <h3 style="margin:16px 0 6px">Scores</h3>
      <p style="margin:0;color:#344054">${s.count} scored · pass rate ${pct(s.passRate)} · avg ${num(s.avg)} · median ${num(s.median)}</p>

      <h3 style="margin:16px 0 6px">Integrity</h3>
      <p style="margin:0;color:#344054">${analytics.integrity.highConcern} high-concern of ${analytics.integrity.submittedAttempts} submitted (${pct(analytics.integrity.highConcernRate)})</p>

      <h3 style="margin:16px 0 6px">Needs attention</h3>
      <p style="margin:0;color:#344054">${summary.stats.pendingGradingCount} attempt(s) awaiting grading · ${summary.attention.staleInvitationCount} stale invitation(s)</p>

      ${rows ? `<h3 style="margin:16px 0 6px">By exam</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr><th style="text-align:left;padding:4px 10px;border-bottom:2px solid #ddd">Exam</th><th style="text-align:right;padding:4px 10px;border-bottom:2px solid #ddd">Candidates</th><th style="text-align:right;padding:4px 10px;border-bottom:2px solid #ddd">Avg</th><th style="text-align:right;padding:4px 10px;border-bottom:2px solid #ddd">Pass</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : ''}

      <p style="margin:20px 0 0;font-size:12px;color:#98a2b3">A per-exam CSV for the week is attached. You're receiving this because an admin added you to the weekly report.</p>
    </div>`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Per-exam breakdown for the week as a CSV string (attached to the digest email).
export function renderDigestCsv(analytics: DashboardAnalytics): string {
  const header = ['Exam', 'Candidates', 'Avg score %', 'Pass rate %', 'Score spread', 'Avg minutes', 'Allotted minutes'];
  const lines = [header.map(csvCell).join(',')];
  for (const e of analytics.examQuality) {
    lines.push(
      [e.examTitle, e.candidateCount, Math.round(e.avgScore), Math.round(e.passRate), e.scoreSpread, e.avgMinutes ?? '', e.allottedMinutes]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}
