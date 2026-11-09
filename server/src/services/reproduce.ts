import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ReproducibilityReport,
  ReproducibilityRunResult,
  ScaleName,
} from '@yottaflex/shared';
import { loadCollections } from './collections.js';
import { exportCollections } from './export.js';
import { runFullPipeline } from './pipeline.js';

export interface ReproduceOptions {
  scale: ScaleName;
  seed: number;
  mongoUri: string;
  baseDb: string;
}

function compareHashes(
  left: Record<string, string>,
  right: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys]
    .sort()
    .filter((key) => left[key] !== right[key]);
}

export async function reproduce(
  options: ReproduceOptions,
): Promise<ReproducibilityReport> {
  const dbA = `${options.baseDb}_repro_a`;
  const dbB = `${options.baseDb}_repro_b`;
  const dataRoot = join(process.cwd(), 'data', options.scale, 'repro');

  const pipelineA = await runFullPipeline({
    scale: options.scale,
    seed: options.seed,
    dbName: dbA,
    mongoUri: options.mongoUri,
  });
  const collectionsA = await loadCollections();
  const exportA = await exportCollections(collectionsA, {
    scale: options.scale,
    seed: options.seed,
    asOf: pipelineA.asOf,
    outputRoot: join(dataRoot, 'a'),
    excludeCollections: ['pipelineRuns'],
  });

  const pipelineB = await runFullPipeline({
    scale: options.scale,
    seed: options.seed,
    dbName: dbB,
    mongoUri: options.mongoUri,
  });
  const collectionsB = await loadCollections();
  const exportB = await exportCollections(collectionsB, {
    scale: options.scale,
    seed: options.seed,
    asOf: pipelineB.asOf,
    outputRoot: join(dataRoot, 'b'),
    excludeCollections: ['pipelineRuns'],
  });

  const mismatches = compareHashes(exportA.hashes, exportB.hashes);
  const comparedFiles = new Set([
    ...Object.keys(exportA.hashes),
    ...Object.keys(exportB.hashes),
  ]).size;

  const runA: ReproducibilityRunResult = {
    db: dbA,
    counts: exportA.counts,
    hashes: exportA.hashes,
  };
  const runB: ReproducibilityRunResult = {
    db: dbB,
    counts: exportB.counts,
    hashes: exportB.hashes,
  };

  const report: ReproducibilityReport = {
    scale: options.scale,
    seed: options.seed,
    as_of: pipelineA.asOf,
    match: mismatches.length === 0,
    run_a: runA,
    run_b: runB,
    compared_files: comparedFiles,
    mismatches,
    generated_at: pipelineA.asOf,
  };

  const reportsDir = join(process.cwd(), 'reports');
  await mkdir(reportsDir, { recursive: true });
  await writeFile(
    join(reportsDir, 'reproducibility.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  return report;
}
