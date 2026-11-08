import { SCALES, SEED, type ScaleName } from '@yottaflex/shared';
import { config } from '../config.js';
import { connectDb, disconnectDb, dropDb } from '../db.js';
import { makeGeneratorConfig } from '../services/generator/config.js';
import { buildMasterDataset } from '../services/generator/master.js';
import { persistMasterDataset } from '../services/generator/persist.js';
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
  console.log('[pipeline] phase 2: generating master data');

  await connectDb(mongoUri, dbName);
  await dropDb();

  const dataset = buildMasterDataset(generatorConfig, seed);
  const counts = await persistMasterDataset(dataset);

  console.log('[pipeline] persisted collections:', counts);
  console.log(`[pipeline] completed in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

function printHelp(): void {
  console.log(`YottaFlex pipeline CLI

Usage:
  npm run pipeline -- --scale starter|full --seed 20261022 --db yottaflex

Commands:
  pipeline   Generate and persist master data (phase 2)
  help       Show this help
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'pipeline':
      await runPipeline(args);
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
