import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  COLLECTION_NAMES,
  SCHEMA,
  type CollectionName,
  type FieldMeta,
  type FieldType,
  type ScaleName,
} from '@yottaflex/shared';
import type { LoadedCollections } from './collections.js';

export interface ExportOptions {
  scale: ScaleName;
  seed: number;
  asOf: string;
  outputRoot: string;
  checksumPath?: string;
  excludeCollections?: readonly CollectionName[];
}

export interface ExportResult {
  outputRoot: string;
  files: string[];
  hashes: Record<string, string>;
  counts: Record<string, number>;
}

const SQL_TYPES: Record<FieldType, string> = {
  string: 'TEXT',
  integer: 'INTEGER',
  number: 'REAL',
  boolean: 'INTEGER',
  date: 'TEXT',
  datetime: 'TEXT',
  json: 'TEXT',
};

function toPosix(value: string): string {
  return value.split('\\').join('/');
}

function relativePosix(root: string, filePath: string): string {
  return toPosix(relative(root, filePath));
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text: string;
  if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else if (typeof value === 'boolean') {
    text = value ? 'true' : 'false';
  } else {
    text = String(value);
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function collectionCsv(
  metaFields: readonly FieldMeta[],
  rows: readonly Record<string, unknown>[],
): string {
  const header = metaFields.map((field) => csvCell(field.name)).join(',');
  const lines = rows.map((row) =>
    metaFields.map((field) => csvCell(row[field.name])).join(','),
  );
  return `${[header, ...lines].join('\n')}\n`;
}

function collectionJson(rows: readonly Record<string, unknown>[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

function collectionJsonl(rows: readonly Record<string, unknown>[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '');
}

function sqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlLiteral(value: unknown, type: FieldType): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (type === 'boolean') {
    return value ? '1' : '0';
  }
  if (type === 'integer' || type === 'number') {
    return String(value);
  }
  if (type === 'json') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function schemaSql(excluded: ReadonlySet<CollectionName>): string {
  const statements: string[] = [
    '-- YottaFlex deterministic SQLite-compatible schema',
    'PRAGMA foreign_keys = OFF;',
    '',
  ];

  for (const name of COLLECTION_NAMES) {
    if (excluded.has(name)) {
      continue;
    }
    const meta = SCHEMA[name];
    const columns = meta.fields.map((field) => {
      const primary = field.name === meta.primaryKey ? ' PRIMARY KEY' : '';
      const notNull = field.required && !primary ? ' NOT NULL' : '';
      return `  ${sqlIdentifier(field.name)} ${SQL_TYPES[field.type]}${primary}${notNull}`;
    });
    statements.push(`CREATE TABLE IF NOT EXISTS ${sqlIdentifier(name)} (`);
    statements.push(columns.join(',\n'));
    statements.push(');');
    statements.push('');

    for (const index of meta.indexes) {
      const suffix = index.map((field) => field.replace(/[^a-zA-Z0-9_]/g, '_')).join('_');
      statements.push(
        `CREATE INDEX IF NOT EXISTS ${sqlIdentifier(`idx_${name}_${suffix}`)} ON ${sqlIdentifier(name)} (${index
          .map(sqlIdentifier)
          .join(', ')});`,
      );
    }
    for (const index of meta.uniqueIndexes ?? []) {
      const suffix = index.map((field) => field.replace(/[^a-zA-Z0-9_]/g, '_')).join('_');
      statements.push(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${sqlIdentifier(`uidx_${name}_${suffix}`)} ON ${sqlIdentifier(
          name,
        )} (${index.map(sqlIdentifier).join(', ')});`,
      );
    }
    statements.push('');
  }

  return `${statements.join('\n').trimEnd()}\n`;
}

function seedSql(
  collections: LoadedCollections,
  excluded: ReadonlySet<CollectionName>,
): string {
  const statements: string[] = [
    '-- YottaFlex deterministic seed data',
    'BEGIN TRANSACTION;',
    '',
  ];

  for (const name of COLLECTION_NAMES) {
    if (excluded.has(name)) {
      continue;
    }
    const meta = SCHEMA[name];
    const rows = collections[name] as unknown as readonly Record<string, unknown>[];
    if (rows.length === 0) {
      continue;
    }
    const columns = meta.fields.map((field) => sqlIdentifier(field.name)).join(', ');
    statements.push(`-- ${name}: ${rows.length} rows`);
    for (const row of rows) {
      const values = meta.fields
        .map((field) => sqlLiteral(row[field.name], field.type))
        .join(', ');
      statements.push(
        `INSERT INTO ${sqlIdentifier(name)} (${columns}) VALUES (${values});`,
      );
    }
    statements.push('');
  }

  statements.push('COMMIT;');
  return `${statements.join('\n').trimEnd()}\n`;
}

async function writeAndHash(
  filePath: string,
  content: string,
  root: string,
  files: string[],
  hashes: Record<string, string>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  const relativePath = relativePosix(root, filePath);
  files.push(relativePath);
  hashes[relativePath] = sha256(content);
}

export async function exportCollections(
  collections: LoadedCollections,
  options: ExportOptions,
): Promise<ExportResult> {
  const root = resolve(options.outputRoot);
  const files: string[] = [];
  const hashes: Record<string, string> = {};
  const counts: Record<string, number> = {};
  const excluded = new Set<CollectionName>(options.excludeCollections ?? []);

  for (const name of COLLECTION_NAMES) {
    if (excluded.has(name)) {
      continue;
    }
    const rows = collections[name] as unknown as readonly Record<string, unknown>[];
    counts[name] = rows.length;
    const meta = SCHEMA[name];

    await writeAndHash(
      join(root, 'csv', `${name}.csv`),
      collectionCsv(meta.fields, rows),
      root,
      files,
      hashes,
    );
    await writeAndHash(
      join(root, 'json', `${name}.json`),
      collectionJson(rows),
      root,
      files,
      hashes,
    );
    await writeAndHash(
      join(root, 'mongo', `${name}.jsonl`),
      collectionJsonl(rows),
      root,
      files,
      hashes,
    );
  }

  const groundTruth = collections.groundTruthAnomalies as unknown as readonly Record<string, unknown>[];
  const groundTruthMeta = SCHEMA.groundTruthAnomalies;
  await writeAndHash(
    join(root, 'ground_truth', 'ground_truth.csv'),
    collectionCsv(groundTruthMeta.fields, groundTruth),
    root,
    files,
    hashes,
  );
  await writeAndHash(
    join(root, 'ground_truth', 'ground_truth.json'),
    collectionJson(groundTruth),
    root,
    files,
    hashes,
  );

  const schema = schemaSql(excluded);
  const seed = seedSql(collections, excluded);
  await writeAndHash(join(root, 'sql', 'schema.sql'), schema, root, files, hashes);
  await writeAndHash(join(root, 'sql', 'seed.sql'), seed, root, files, hashes);
  await writeAndHash(
    join(root, 'sql', 'database.sql'),
    `${schema}\n${seed}`,
    root,
    files,
    hashes,
  );

  const manifest = {
    scale: options.scale,
    seed: options.seed,
    as_of: options.asOf,
    generated_at: options.asOf,
    counts,
    files: [...files].sort(),
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeAndHash(
    join(root, 'manifest.json'),
    manifestContent,
    root,
    files,
    hashes,
  );

  if (options.checksumPath) {
    const prefix = toPosix(relative(process.cwd(), root));
    const checksumLines = Object.keys(hashes)
      .sort()
      .map(
        (relativePath) =>
          `${hashes[relativePath]}  ${prefix ? `${prefix}/` : ''}${relativePath}`,
      )
      .join('\n');
    const checksumPath = resolve(options.checksumPath);
    await mkdir(dirname(checksumPath), { recursive: true });
    await writeFile(checksumPath, `${checksumLines}\n`, 'utf8');
  }

  return {
    outputRoot: root,
    files: [...files].sort(),
    hashes,
    counts,
  };
}

export function collectionFileNames(): CollectionName[] {
  return [...COLLECTION_NAMES];
}
