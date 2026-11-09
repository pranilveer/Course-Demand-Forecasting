import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AS_OF,
  HISTORY_TERMS,
  SCALES,
  SEED,
  TARGET_TERM,
  type AllocationDecision,
  type Availability,
  type Course,
  type DemandForecast,
  type Faculty,
  type FacultySkill,
  type GroundTruthAnomaly,
  type LifecycleEvent,
  type Prerequisite,
  type Program,
  type RegistrationInterest,
  type Room,
  type ScaleName,
  type Section,
  type Student,
  type StudentPlan,
  type Term,
  type UnmetDemand,
  type WorkloadAssignment,
} from '@yottaflex/shared';
import { config } from '../config.js';
import { connectDb, disconnectDb, dropDb } from '../db.js';
import {
  AllocationDecisionModel,
  AvailabilityModel,
  CourseModel,
  DemandForecastModel,
  FacultyModel,
  FacultySkillModel,
  GroundTruthAnomalyModel,
  LifecycleEventModel,
  PrerequisiteModel,
  ProgramModel,
  RegistrationInterestModel,
  RoomModel,
  SectionModel,
  StudentModel,
  StudentPlanModel,
  TermModel,
  UnmetDemandModel,
  WorkloadAssignmentModel,
} from '../models/index.js';
import {
  buildAllocation,
  persistAllocation,
  prepareAllocation,
} from '../services/allocate.js';
import {
  buildForecasts,
  computeForecastMetrics,
  persistForecasts,
} from '../services/forecast.js';
import { loadCollections } from '../services/collections.js';
import { exportCollections } from '../services/export.js';
import { makeGeneratorConfig } from '../services/generator/config.js';
import { reproduce } from '../services/reproduce.js';
import { writeReports } from '../services/report.js';
import {
  buildInjection,
  persistInjection,
  prepareInjection,
} from '../services/inject.js';
import { buildDataset } from '../services/generator/dataset.js';
import { persistDataset } from '../services/generator/persist.js';
import {
  issueTypeCoverage,
  persistValidationRun,
  runValidation,
} from '../services/validate.js';
import { numberFlag, parseArgs, stringFlag, type ParsedArgs } from './args.js';

function getScale(args: ParsedArgs): ScaleName {
  const raw = stringFlag(args, 'scale', 'starter');
  if (raw !== 'starter' && raw !== 'full') {
    throw new Error(`Invalid --scale "${raw}". Expected one of: ${Object.keys(SCALES).join(', ')}`);
  }
  return raw;
}

async function runPipeline(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const generatorConfig = makeGeneratorConfig(scale, seed);
  const startedAt = Date.now();

  console.log(
    `[pipeline] scale=${scale} seed=${seed} db=${dbName} asOf=${generatorConfig.asOf}`,
  );
  console.log('[pipeline] phases 2-3: generating master and transactional data');

  await connectDb(mongoUri, dbName);
  await dropDb();

  const dataset = buildDataset(generatorConfig, seed);
  const counts = await persistDataset(dataset);

  console.log('[pipeline] persisted collections:', counts);
  console.log(`[pipeline] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

async function runForecast(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const startedAt = Date.now();

  console.log(
    `[forecast] scale=${scale} seed=${seed} db=${dbName} term=${TARGET_TERM} asOf=${AS_OF}`,
  );
  console.log(`[forecast] history terms: ${HISTORY_TERMS.join(', ')}`);

  await connectDb(mongoUri, dbName);

  const courses = await CourseModel.find({})
    .sort({ _id: 1 })
    .lean<Course[]>()
    .exec();
  const interests = await RegistrationInterestModel.find({
    term: { $in: [...HISTORY_TERMS, TARGET_TERM] },
  })
    .sort({ _id: 1 })
    .lean<RegistrationInterest[]>()
    .exec();

  const forecasts = buildForecasts(courses, interests, AS_OF);
  const count = await persistForecasts(forecasts);
  const metrics = computeForecastMetrics(forecasts, interests, AS_OF);

  console.log(`[forecast] persisted ${count} forecast rows`);
  console.log('[forecast] metrics:', {
    term: metrics.term,
    method: metrics.method,
    course_count: metrics.course_count,
    mae: metrics.mae,
    rmse: metrics.rmse,
    mape: metrics.mape,
    bias: metrics.bias,
    naive_mae: metrics.naive_mae,
    improvement_vs_naive: metrics.improvement_vs_naive,
  });
  console.log(
    '[forecast] top demand:',
    [...forecasts]
      .sort((left, right) => right.forecast_enrollment - left.forecast_enrollment)
      .slice(0, 5)
      .map((forecast) => ({
        course_id: forecast.course_id,
        forecast: forecast.forecast_enrollment,
      })),
  );
  console.log(`[forecast] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

async function runAllocate(args: ParsedArgs): Promise<void> {
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const startedAt = Date.now();

  console.log(`[allocate] db=${dbName} term=${TARGET_TERM} asOf=${AS_OF}`);

  await connectDb(mongoUri, dbName);

  const [courses, forecasts, faculty, facultySkills, availabilities, rooms, programs] =
    await Promise.all([
      CourseModel.find({}).sort({ _id: 1 }).lean<Course[]>().exec(),
      DemandForecastModel.find({ term: TARGET_TERM })
        .sort({ _id: 1 })
        .lean<DemandForecast[]>()
        .exec(),
      FacultyModel.find({}).sort({ _id: 1 }).lean<Faculty[]>().exec(),
      FacultySkillModel.find({}).sort({ _id: 1 }).lean<FacultySkill[]>().exec(),
      AvailabilityModel.find({ term: TARGET_TERM })
        .sort({ _id: 1 })
        .lean<Availability[]>()
        .exec(),
      RoomModel.find({}).sort({ _id: 1 }).lean<Room[]>().exec(),
      ProgramModel.find({}).sort({ _id: 1 }).lean<Program[]>().exec(),
    ]);

  const lifecycleEventStart = await prepareAllocation();
  const result = buildAllocation(
    {
      courses,
      forecasts,
      faculty,
      facultySkills,
      availabilities,
      rooms,
      programs,
      asOf: AS_OF,
    },
    lifecycleEventStart,
  );
  const counts = await persistAllocation(result);

  console.log('[allocate] persisted collections:', counts);
  console.log('[allocate] unmet demand:', result.unmetDemands.length);
  console.log(
    '[allocate] unmet by reason:',
    result.unmetDemands.reduce<Record<string, number>>((acc, unmet) => {
      acc[unmet.reason_code] = (acc[unmet.reason_code] ?? 0) + 1;
      return acc;
    }, {}),
  );
  console.log(`[allocate] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

async function runInject(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const startedAt = Date.now();

  console.log(
    `[inject] scale=${scale} seed=${seed} db=${dbName} term=${TARGET_TERM} perType=${SCALES[scale].anomalyPerType}`,
  );

  await connectDb(mongoUri, dbName);
  await prepareInjection();

  const [
    courses,
    forecasts,
    faculty,
    facultySkills,
    availabilities,
    rooms,
    sections,
    workloadAssignments,
    allocationDecisions,
    students,
    studentPlans,
    prerequisites,
    lifecycleEvents,
  ] = await Promise.all([
    CourseModel.find({}).sort({ _id: 1 }).lean<Course[]>().exec(),
    DemandForecastModel.find({ term: TARGET_TERM })
      .sort({ _id: 1 })
      .lean<DemandForecast[]>()
      .exec(),
    FacultyModel.find({}).sort({ _id: 1 }).lean<Faculty[]>().exec(),
    FacultySkillModel.find({}).sort({ _id: 1 }).lean<FacultySkill[]>().exec(),
    AvailabilityModel.find({ term: TARGET_TERM })
      .sort({ _id: 1 })
      .lean<Availability[]>()
      .exec(),
    RoomModel.find({}).sort({ _id: 1 }).lean<Room[]>().exec(),
    SectionModel.find({ term: TARGET_TERM })
      .sort({ _id: 1 })
      .lean<Section[]>()
      .exec(),
    WorkloadAssignmentModel.find({ term: TARGET_TERM })
      .sort({ _id: 1 })
      .lean<WorkloadAssignment[]>()
      .exec(),
    AllocationDecisionModel.find({ term: TARGET_TERM })
      .sort({ _id: 1 })
      .lean<AllocationDecision[]>()
      .exec(),
    StudentModel.find({}).sort({ _id: 1 }).lean<Student[]>().exec(),
    StudentPlanModel.find({}).sort({ _id: 1 }).lean<StudentPlan[]>().exec(),
    PrerequisiteModel.find({}).sort({ _id: 1 }).lean<Prerequisite[]>().exec(),
    LifecycleEventModel.find({}).sort({ _id: 1 }).lean<LifecycleEvent[]>().exec(),
  ]);

  const result = buildInjection({
    courses,
    forecasts,
    faculty,
    facultySkills,
    availabilities,
    rooms,
    sections,
    workloadAssignments,
    allocationDecisions,
    students,
    studentPlans,
    prerequisites,
    lifecycleEvents,
    asOf: AS_OF,
    seed,
    anomalyPerType: SCALES[scale].anomalyPerType,
  });
  const counts = await persistInjection(result);

  console.log('[inject] persisted collections:', counts);
  console.log(
    '[inject] anomalies:',
    result.anomalies.reduce<Record<string, number>>((acc, anomaly) => {
      acc[anomaly.issue_type] = (acc[anomaly.issue_type] ?? 0) + 1;
      return acc;
    }, {}),
  );
  console.log(`[inject] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

function csvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toViolationsCsv(
  violations: Awaited<ReturnType<typeof runValidation>>['violations'],
): string {
  const header = [
    'check_id',
    'severity',
    'collection',
    'entity_id',
    'related_entity_id',
    'message',
    'expected',
    'anomaly_id',
  ];
  const rows = violations.map((item) =>
    [
      item.check_id,
      item.severity,
      item.collection,
      item.entity_id,
      item.related_entity_id,
      item.message,
      item.expected,
      item.anomaly_id,
    ]
      .map(csvValue)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

async function runValidate(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const startedAt = Date.now();

  console.log(
    `[validate] scale=${scale} seed=${seed} db=${dbName} term=${TARGET_TERM} asOf=${AS_OF}`,
  );

  await connectDb(mongoUri, dbName);

  const [
    terms,
    programs,
    courses,
    prerequisites,
    students,
    studentPlans,
    registrationInterests,
    faculty,
    facultySkills,
    availabilities,
    rooms,
    sections,
    workloadAssignments,
    demandForecasts,
    unmetDemands,
    allocationDecisions,
    lifecycleEvents,
    groundTruthAnomalies,
  ] = await Promise.all([
    TermModel.find({}).sort({ _id: 1 }).lean<Term[]>().exec(),
    ProgramModel.find({}).sort({ _id: 1 }).lean<Program[]>().exec(),
    CourseModel.find({}).sort({ _id: 1 }).lean<Course[]>().exec(),
    PrerequisiteModel.find({}).sort({ _id: 1 }).lean<Prerequisite[]>().exec(),
    StudentModel.find({}).sort({ _id: 1 }).lean<Student[]>().exec(),
    StudentPlanModel.find({}).sort({ _id: 1 }).lean<StudentPlan[]>().exec(),
    RegistrationInterestModel.find({})
      .sort({ _id: 1 })
      .lean<RegistrationInterest[]>()
      .exec(),
    FacultyModel.find({}).sort({ _id: 1 }).lean<Faculty[]>().exec(),
    FacultySkillModel.find({}).sort({ _id: 1 }).lean<FacultySkill[]>().exec(),
    AvailabilityModel.find({}).sort({ _id: 1 }).lean<Availability[]>().exec(),
    RoomModel.find({}).sort({ _id: 1 }).lean<Room[]>().exec(),
    SectionModel.find({}).sort({ _id: 1 }).lean<Section[]>().exec(),
    WorkloadAssignmentModel.find({})
      .sort({ _id: 1 })
      .lean<WorkloadAssignment[]>()
      .exec(),
    DemandForecastModel.find({}).sort({ _id: 1 }).lean<DemandForecast[]>().exec(),
    UnmetDemandModel.find({}).sort({ _id: 1 }).lean<UnmetDemand[]>().exec(),
    AllocationDecisionModel.find({})
      .sort({ _id: 1 })
      .lean<AllocationDecision[]>()
      .exec(),
    LifecycleEventModel.find({}).sort({ _id: 1 }).lean<LifecycleEvent[]>().exec(),
    GroundTruthAnomalyModel.find({})
      .sort({ _id: 1 })
      .lean<GroundTruthAnomaly[]>()
      .exec(),
  ]);

  const input = {
    terms,
    programs,
    courses,
    prerequisites,
    students,
    studentPlans,
    registrationInterests,
    faculty,
    facultySkills,
    availabilities,
    rooms,
    sections,
    workloadAssignments,
    demandForecasts,
    unmetDemands,
    allocationDecisions,
    lifecycleEvents,
    groundTruthAnomalies,
    scale,
    seed,
    asOf: AS_OF,
  };
  const output = runValidation(input);
  const runId = await persistValidationRun(input, output);
  const coverage = issueTypeCoverage(groundTruthAnomalies);
  const reportDir = join(process.cwd(), 'reports');
  const summaryPath = join(reportDir, 'validation_summary.json');
  const violationsPath = join(reportDir, 'validation_violations.csv');

  await mkdir(reportDir, { recursive: true });
  await Promise.all([
    writeFile(
      summaryPath,
      JSON.stringify(
        {
          run_id: runId,
          scale,
          seed,
          as_of: AS_OF,
          ...output.summary,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    ),
    writeFile(violationsPath, toViolationsCsv(output.violations), 'utf8'),
  ]);

  console.log(`[validate] run=${runId} status=${output.summary.status}`);
  console.log('[validate] summary:', {
    checks: output.summary.total_checks,
    violations: output.summary.total_violations,
    expected: output.summary.expected_violations,
    unexpected: output.summary.unexpected_violations,
    anomalies_expected: output.summary.anomalies_expected,
    anomalies_detected: output.summary.anomalies_detected,
    anomalies_missed: output.summary.anomalies_missed,
    detection_rate: output.summary.detection_rate,
  });
  console.log('[validate] issue coverage:', coverage);
  for (const check of output.summary.checks) {
    console.log(
      `[validate] ${check.check_id} ${check.status} violations=${check.violations} expected=${check.expected} unexpected=${check.unexpected}`,
    );
  }
  console.log(`[validate] reports: ${summaryPath}, ${violationsPath}`);
  console.log(`[validate] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);

  if (output.summary.status !== 'PASS') {
    process.exitCode = 1;
  }
}

async function runExport(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const outputRoot = stringFlag(
    args,
    'out',
    join(process.cwd(), 'data', scale),
  );
  const checksumPath = stringFlag(
    args,
    'checksums',
    join(process.cwd(), 'reports', 'checksums.sha256'),
  );
  const startedAt = Date.now();

  console.log(`[export] db=${dbName} scale=${scale} seed=${seed} out=${outputRoot}`);

  await connectDb(mongoUri, dbName);
  const collections = await loadCollections();
  const result = await exportCollections(collections, {
    scale,
    seed,
    asOf: AS_OF,
    outputRoot,
    checksumPath,
  });

  console.log('[export] counts:', result.counts);
  console.log(`[export] wrote ${result.files.length} files to ${result.outputRoot}`);
  console.log(`[export] checksums: ${checksumPath}`);
  console.log(`[export] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

async function runReport(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const outputDir = stringFlag(args, 'out', join(process.cwd(), 'reports'));
  const startedAt = Date.now();

  console.log(`[report] db=${dbName} scale=${scale} seed=${seed} out=${outputDir}`);

  await connectDb(mongoUri, dbName);
  const collections = await loadCollections();
  const result = await writeReports(collections, {
    outputDir,
    scale,
    seed,
    asOf: AS_OF,
  });

  console.log('[report] forecast metrics:', {
    mae: result.forecast.mae,
    rmse: result.forecast.rmse,
    mape: result.forecast.mape,
    improvement_vs_naive: result.forecast.improvement_vs_naive,
  });
  console.log('[report] allocation metrics:', {
    demand_met_pct: result.allocation.demand_met_pct,
    section_count: result.allocation.section_count,
    unmet_total: result.allocation.unmet_total,
    skill_match_pct: result.allocation.skill_match_pct,
    explainability_pct: result.allocation.explainability_pct,
  });
  console.log(`[report] wrote ${result.summaryHtml}`);
  console.log(`[report] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

async function runReproduce(args: ParsedArgs): Promise<void> {
  const scale = getScale(args);
  const seed = numberFlag(args, 'seed', SEED);
  const dbName = stringFlag(args, 'db', config.mongoDb);
  const mongoUri = stringFlag(args, 'mongo-uri', config.mongoUri);
  const startedAt = Date.now();

  console.log(
    `[reproduce] scale=${scale} seed=${seed} baseDb=${dbName} mongoUri=${mongoUri}`,
  );

  const report = await reproduce({ scale, seed, mongoUri, baseDb: dbName });

  console.log('[reproduce] match:', report.match);
  console.log('[reproduce] compared files:', report.compared_files);
  console.log('[reproduce] mismatches:', report.mismatches.length);
  console.log('[reproduce] report: reports/reproducibility.json');
  console.log(`[reproduce] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);

  if (!report.match) {
    process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`YottaFlex pipeline CLI

Usage:
  npm run pipeline -- --scale starter|full --seed 20261022 --db yottaflex

Commands:
  pipeline   Generate and persist full dataset (phases 2-3)
  forecast   Compute and persist 2026-Fall demand forecasts
  allocate   Build sections, workloads, decisions, and unmet demand
  inject     Append labelled ground-truth anomalies
  validate   Run validation checks and write reports
  export     Write CSV, JSON, JSONL, SQL, manifest, and checksums
  report     Write metrics JSON and the static HTML quality report
  reproduce  Run the full pipeline twice and compare exported hashes
  help       Show this help
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'pipeline':
      await runPipeline(args);
      break;
    case 'forecast':
      await runForecast(args);
      break;
    case 'allocate':
      await runAllocate(args);
      break;
    case 'inject':
      await runInject(args);
      break;
    case 'validate':
      await runValidate(args);
      break;
    case 'export':
      await runExport(args);
      break;
    case 'report':
      await runReport(args);
      break;
    case 'reproduce':
      await runReproduce(args);
      break;
    case 'help':
    case '--help':
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('[cli] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
