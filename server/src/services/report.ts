import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  TARGET_TERM,
  type AllocationMetrics,
  type ForecastMetrics,
  type ReproducibilityReport,
  type ScaleName,
} from '@yottaflex/shared';
import type { LoadedCollections } from './collections.js';
import { computeForecastMetrics } from './forecast.js';
import { computeAllocationMetrics } from './metrics.js';

export interface ReportOptions {
  outputDir: string;
  scale: ScaleName;
  seed: number;
  asOf: string;
}

export interface ReportResult {
  summaryHtml: string;
  forecastMetricsPath: string;
  allocationMetricsPath: string;
  dataQualityPath: string;
  forecast: ForecastMetrics;
  allocation: AllocationMetrics;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function table(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
    )
    .join('\n');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function metricCards(items: readonly [string, string][]): string {
  return `<div class="cards">${items
    .map(
      ([label, value]) =>
        `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join('')}</div>`;
}

export async function loadReproducibilityReport(
  reportsDir: string,
): Promise<ReproducibilityReport | null> {
  try {
    const content = await readFile(join(reportsDir, 'reproducibility.json'), 'utf8');
    return JSON.parse(content) as ReproducibilityReport;
  } catch {
    return null;
  }
}

export async function writeReports(
  collections: LoadedCollections,
  options: ReportOptions,
): Promise<ReportResult> {
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const forecast = computeForecastMetrics(
    collections.demandForecasts,
    collections.registrationInterests,
    options.asOf,
  );
  const allocation = computeAllocationMetrics(
    {
      forecasts: collections.demandForecasts,
      sections: collections.sections,
      workloadAssignments: collections.workloadAssignments,
      allocationDecisions: collections.allocationDecisions,
      unmetDemands: collections.unmetDemands,
      faculty: collections.faculty,
      facultySkills: collections.facultySkills,
      rooms: collections.rooms,
    },
    options.asOf,
  );

  const latestValidation =
    collections.validationRuns[collections.validationRuns.length - 1] ?? null;
  const latestPipeline = collections.pipelineRuns[collections.pipelineRuns.length - 1] ?? null;
  const reproducibility = await loadReproducibilityReport(outputDir);
  const anomalies = collections.groundTruthAnomalies;
  const detected = new Set(
    latestValidation?.summary.checks
      .filter((check) => check.violations > 0)
      .map((check) => check.check_id) ?? [],
  );
  const anomalyRows = anomalies.map((anomaly) => [
    anomaly._id,
    anomaly.issue_type,
    anomaly.entity_type,
    anomaly.entity_id,
    anomaly.expected_rule,
    detected.has(anomaly.expected_rule) ? 'Detected' : 'Missed',
  ]);

  const counts = Object.entries({
    terms: collections.terms.length,
    programs: collections.programs.length,
    courses: collections.courses.length,
    prerequisites: collections.prerequisites.length,
    students: collections.students.length,
    studentPlans: collections.studentPlans.length,
    registrationInterests: collections.registrationInterests.length,
    faculty: collections.faculty.length,
    facultySkills: collections.facultySkills.length,
    availabilities: collections.availabilities.length,
    rooms: collections.rooms.length,
    sections: collections.sections.length,
    workloadAssignments: collections.workloadAssignments.length,
    demandForecasts: collections.demandForecasts.length,
    unmetDemands: collections.unmetDemands.length,
    allocationDecisions: collections.allocationDecisions.length,
    lifecycleEvents: collections.lifecycleEvents.length,
    groundTruthAnomalies: collections.groundTruthAnomalies.length,
    validationRuns: collections.validationRuns.length,
    pipelineRuns: collections.pipelineRuns.length,
  });

  const validationStatus = latestValidation?.summary.status ?? 'Not run';
  const checks = latestValidation?.summary.checks ?? [];
  const violations = latestValidation?.violations ?? [];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YottaFlex Data Quality Report</title>
<style>
:root { color-scheme: light; --ink: #17212b; --muted: #5d6b7a; --line: #d9e1e8; --accent: #0f766e; --bg: #f6f8fa; --panel: #ffffff; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: var(--ink); background: var(--bg); line-height: 1.5; }
main { max-width: 1180px; margin: 0 auto; padding: 32px 24px 64px; }
h1 { margin: 0 0 4px; font-size: 32px; }
h2 { margin: 36px 0 12px; font-size: 22px; }
p.meta { margin: 0; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 18px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.card span { display: block; color: var(--muted); font-size: 13px; }
.card strong { display: block; margin-top: 4px; font-size: 24px; }
.pass { color: #047857; }
.fail { color: #b91c1c; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; font-size: 14px; }
th, td { text-align: left; padding: 9px 11px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: #eef3f6; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
tr:last-child td { border-bottom: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 18px; }
.note { background: #ecfdf5; border-left: 4px solid var(--accent); padding: 12px 14px; margin: 12px 0; }
code { background: #eef3f6; padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<main>
<h1>YottaFlex Data Quality Report</h1>
<p class="meta">Scale: ${escapeHtml(options.scale)} · Seed: ${escapeHtml(options.seed)} · As of: ${escapeHtml(options.asOf)} · Target term: ${escapeHtml(TARGET_TERM)}</p>
${metricCards([
  ['Validation gate', validationStatus],
  ['Checks passed', `${checks.filter((check) => check.status === 'PASS').length}/${checks.length}`],
  ['Expected violations', String(latestValidation?.summary.expected_violations ?? 0)],
  ['Unexpected violations', String(latestValidation?.summary.unexpected_violations ?? 0)],
  ['Anomaly detection', `${latestValidation?.summary.detection_rate ?? 0}%`],
  ['Forecast MAE', String(forecast.mae)],
])}
${latestValidation ? `<div class="note"><strong>Validation run ${escapeHtml(latestValidation.run_id)}</strong> finished with <strong class="${latestValidation.status === 'PASS' ? 'pass' : 'fail'}">${escapeHtml(latestValidation.status)}</strong>. ${escapeHtml(latestValidation.summary.anomalies_detected)} of ${escapeHtml(latestValidation.summary.anomalies_expected)} expected anomalies were detected.</div>` : '<div class="note">No validation run is present in this database.</div>'}

<h2>Forecast quality</h2>
${metricCards([
  ['Method', forecast.method],
  ['Courses', String(forecast.course_count)],
  ['MAE', String(forecast.mae)],
  ['RMSE', String(forecast.rmse)],
  ['MAPE', `${forecast.mape}%`],
  ['Improvement vs naive', `${forecast.improvement_vs_naive}%`],
])}
${table(
  ['Course', 'Forecast', 'Actual', 'Naive', 'Error'],
  forecast.per_course.slice(0, 12).map((row) => [
    row.course_id,
    row.forecast,
    row.actual,
    row.naive,
    row.error,
  ]),
)}

<h2>Allocation quality</h2>
${metricCards([
  ['Demand met', `${allocation.demand_met_pct}%`],
  ['Sections', String(allocation.section_count)],
  ['Unmet demand', String(allocation.unmet_total)],
  ['Avg fill rate', `${allocation.avg_fill_rate}%`],
  ['Skill match', `${allocation.skill_match_pct}%`],
  ['Explainability', `${allocation.explainability_pct}%`],
])}
<div class="grid">
<div>${table(
  ['Reason', 'Unmet students'],
  Object.entries(allocation.unmet_by_reason).map(([reason, count]) => [reason, count]),
)}</div>
<div>${table(
  ['Metric', 'Value'],
  [
    ['Forecast total', allocation.forecast_total],
    ['Allocated capacity', allocation.allocated_capacity],
    ['Faculty assigned', allocation.faculty_count],
    ['Avg workload utilization', `${allocation.avg_workload_utilization}%`],
    ['Rooms available', allocation.room_count],
    ['Room utilization', `${allocation.room_utilization_pct}%`],
    ['Decisions', allocation.decision_count],
  ],
)}</div>
</div>

<h2>Validation checks</h2>
${table(
  ['Check', 'Name', 'Status', 'Violations'],
  checks.map((check) => [check.check_id, check.name, check.status, check.violations]),
)}

<h2>Detected violations</h2>
${violations.length === 0 ? '<p>No violations were detected.</p>' : table(
  ['Check', 'Severity', 'Collection', 'Entity', 'Expected', 'Message'],
  violations.map((violation) => [
    violation.check_id,
    violation.severity,
    violation.collection,
    violation.entity_id,
    violation.expected ? 'Yes' : 'No',
    violation.message,
  ]),
)}

<h2>Injected anomaly coverage</h2>
${table(
  ['Anomaly', 'Issue type', 'Entity type', 'Entity', 'Expected rule', 'Coverage'],
  anomalyRows,
)}

<h2>Reproducibility</h2>
${
  reproducibility
    ? metricCards([
        ['Match', reproducibility.match ? 'YES' : 'NO'],
        ['Compared files', String(reproducibility.compared_files)],
        ['Mismatches', String(reproducibility.mismatches.length)],
        ['Run A database', reproducibility.run_a.db],
        ['Run B database', reproducibility.run_b.db],
        ['Generated', reproducibility.generated_at],
      ])
    : '<p>No reproducibility report found. Run <code>npm run reproduce</code> to generate one.</p>'
}

<h2>Collection row counts</h2>
${table(['Collection', 'Rows'], counts)}
${latestPipeline ? `<p class="meta">Latest pipeline run: ${escapeHtml(latestPipeline._id)} · status ${escapeHtml(latestPipeline.status)} · completed ${escapeHtml(latestPipeline.completed_at ?? 'n/a')}</p>` : ''}
</main>
</body>
</html>
`;

  const summaryHtml = join(outputDir, 'summary.html');
  const forecastMetricsPath = join(outputDir, 'forecast_metrics.json');
  const allocationMetricsPath = join(outputDir, 'allocation_metrics.json');
  const dataQualityPath = join(outputDir, 'data_quality.json');

  await writeFile(summaryHtml, html, 'utf8');
  await writeFile(forecastMetricsPath, `${JSON.stringify(forecast, null, 2)}\n`, 'utf8');
  await writeFile(
    allocationMetricsPath,
    `${JSON.stringify(allocation, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    dataQualityPath,
    `${JSON.stringify(
      {
        scale: options.scale,
        seed: options.seed,
        as_of: options.asOf,
        validation: latestValidation?.summary ?? null,
        counts,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return {
    summaryHtml,
    forecastMetricsPath,
    allocationMetricsPath,
    dataQualityPath,
    forecast,
    allocation,
  };
}
