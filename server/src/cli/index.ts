import {
  AS_OF,
  HISTORY_TERMS,
  SCALES,
  SEED,
  TARGET_TERM,
  type Availability,
  type Course,
  type DemandForecast,
  type Faculty,
  type FacultySkill,
  type Program,
  type RegistrationInterest,
  type Room,
  type ScaleName,
} from '@yottaflex/shared';
import { config } from '../config.js';
import { connectDb, disconnectDb, dropDb } from '../db.js';
import {
  AvailabilityModel,
  CourseModel,
  DemandForecastModel,
  FacultyModel,
  FacultySkillModel,
  ProgramModel,
  RegistrationInterestModel,
  RoomModel,
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
import { makeGeneratorConfig } from '../services/generator/config.js';
import { buildDataset } from '../services/generator/dataset.js';
import { persistDataset } from '../services/generator/persist.js';
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

function printHelp(): void {
  console.log(`YottaFlex pipeline CLI

Usage:
  npm run pipeline -- --scale starter|full --seed 20261022 --db yottaflex

Commands:
  pipeline   Generate and persist full dataset (phases 2-3)
  forecast   Compute and persist 2026-Fall demand forecasts
  allocate   Build sections, workloads, decisions, and unmet demand
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
