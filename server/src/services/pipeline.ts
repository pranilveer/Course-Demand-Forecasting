import {
  ID_PREFIXES,
  SCALES,
  makeId,
  type PipelineRun,
  type ScaleName,
} from '@yottaflex/shared';
import { connectDb, dropDb, insertBatched } from '../db.js';
import { PipelineRunModel } from '../models/index.js';
import { buildAllocation, persistAllocation } from './allocate.js';
import { loadCollections } from './collections.js';
import { buildForecasts, persistForecasts } from './forecast.js';
import { buildDataset } from './generator/dataset.js';
import { makeGeneratorConfig } from './generator/config.js';
import { persistDataset } from './generator/persist.js';
import { buildInjection, persistInjection } from './inject.js';
import { persistValidationRun, runValidation } from './validate.js';

export interface FullPipelineOptions {
  scale: ScaleName;
  seed: number;
  dbName: string;
  mongoUri: string;
}

export interface FullPipelineResult {
  scale: ScaleName;
  seed: number;
  asOf: string;
  dbName: string;
  counts: Record<string, number>;
  validationRunId: string;
  validationStatus: string;
  pipelineRunId: string;
}

async function persistPipelineRun(input: {
  scale: ScaleName;
  seed: number;
  asOf: string;
  dbName: string;
  counts: Record<string, number>;
}): Promise<string> {
  const existing = await PipelineRunModel.countDocuments({}).exec();
  const id = makeId(ID_PREFIXES.pipelineRun, existing + 1);
  const run: PipelineRun = {
    _id: id,
    scale: input.scale,
    seed: input.seed,
    as_of: input.asOf,
    db_name: input.dbName,
    status: 'Completed',
    counts: input.counts,
    checksums: {},
    started_at: input.asOf,
    completed_at: input.asOf,
  };
  await insertBatched(PipelineRunModel, [run]);
  return id;
}

export async function updatePipelineRunChecksums(
  pipelineRunId: string,
  checksums: Record<string, string>,
): Promise<void> {
  await PipelineRunModel.updateOne(
    { _id: pipelineRunId },
    { $set: { checksums } },
  ).exec();
}

export async function runFullPipeline(
  options: FullPipelineOptions,
): Promise<FullPipelineResult> {
  const generatorConfig = makeGeneratorConfig(options.scale, options.seed);
  await connectDb(options.mongoUri, options.dbName);
  await dropDb();

  const dataset = buildDataset(generatorConfig, options.seed);
  const counts = await persistDataset(dataset);

  const forecasts = buildForecasts(
    dataset.courses,
    dataset.registrationInterests,
    generatorConfig.asOf,
  );
  counts.demandForecasts = await persistForecasts(forecasts);

  const allocation = buildAllocation(
    {
      courses: dataset.courses,
      forecasts,
      faculty: dataset.faculty,
      facultySkills: dataset.facultySkills,
      availabilities: dataset.availabilities.filter(
        (row) => row.term === '2026-Fall',
      ),
      rooms: dataset.rooms,
      programs: dataset.programs,
      asOf: generatorConfig.asOf,
    },
    dataset.lifecycleEvents.length + 1,
  );
  Object.assign(counts, await persistAllocation(allocation));

  const lifecycleEvents = [
    ...dataset.lifecycleEvents,
    ...allocation.lifecycleEvents,
  ];
  const injection = buildInjection({
    courses: dataset.courses,
    forecasts,
    faculty: dataset.faculty,
    facultySkills: dataset.facultySkills,
    availabilities: dataset.availabilities.filter((row) => row.term === '2026-Fall'),
    rooms: dataset.rooms,
    sections: allocation.sections,
    workloadAssignments: allocation.workloadAssignments,
    allocationDecisions: allocation.allocationDecisions,
    students: dataset.students,
    studentPlans: dataset.studentPlans,
    prerequisites: dataset.prerequisites,
    lifecycleEvents,
    asOf: generatorConfig.asOf,
    seed: options.seed,
    anomalyPerType: SCALES[options.scale].anomalyPerType,
  });
  Object.assign(counts, await persistInjection(injection));

  const persisted = await loadCollections();
  const validationOutput = runValidation({
    ...persisted,
    scale: options.scale,
    seed: options.seed,
    asOf: generatorConfig.asOf,
  });
  const validationRunId = await persistValidationRun(
    {
      ...persisted,
      scale: options.scale,
      seed: options.seed,
      asOf: generatorConfig.asOf,
    },
    validationOutput,
  );

  const finalCollections = await loadCollections();
  const finalCounts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(finalCollections)) {
    finalCounts[name] = rows.length;
  }
  finalCounts.pipelineRuns = (finalCounts.pipelineRuns ?? 0) + 1;

  const pipelineRunId = await persistPipelineRun({
    scale: options.scale,
    seed: options.seed,
    asOf: generatorConfig.asOf,
    dbName: options.dbName,
    counts: finalCounts,
  });

  return {
    scale: options.scale,
    seed: options.seed,
    asOf: generatorConfig.asOf,
    dbName: options.dbName,
    counts: finalCounts,
    validationRunId,
    validationStatus: validationOutput.summary.status,
    pipelineRunId,
  };
}
