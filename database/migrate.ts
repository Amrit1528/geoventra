/**
 * GEOVENTRA — database migration runner.
 *
 * Applies the SQL files in `database/migrations` in filename order and records
 * every applied file in `geoventra.schema_migrations` together with the SHA-256
 * checksum of its contents.
 *
 * Usage:
 *   tsx database/migrate.ts --database postgresql://localhost:5432/geoventra
 *   tsx database/migrate.ts --target 20261111_create_fuel_tables.sql
 *
 * The runner is safe to re-run: already applied migrations are skipped, and a
 * migration whose checksum changed is reported as a warning instead of failing.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;

const DEFAULT_DATABASE_URL = 'postgresql://geoventra@localhost:5432/geoventra';
const MIGRATIONS_DIRNAME = 'migrations';
const SCHEMA = 'geoventra';
const MIGRATION_TABLE = 'geoventra.schema_migrations';
const ADVISORY_LOCK_KEY = 'geoventra.schema_migrations';

type MigrationStatus = 'applied' | 'skipped' | 'warning' | 'pending';

interface MigrationFile {
  id: string;
  path: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  id: string;
  checksum: string;
}

interface MigrationOptions {
  databaseUrl: string;
  target: string | null;
  migrationsDir: string;
}

/** Parses the command line arguments supported by the runner. */
function parseArgs(argv: string[]): MigrationOptions {
  const options: MigrationOptions = {
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    target: null,
    migrationsDir: resolve(dirname(fileURLToPath(import.meta.url)), MIGRATIONS_DIRNAME),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    switch (arg) {
      case '--database':
      case '-d':
        if (value === undefined) {
          throw new Error('Missing value for --database');
        }
        options.databaseUrl = value;
        index += 1;
        break;
      case '--target':
      case '-t':
        if (value === undefined) {
          throw new Error('Missing value for --target');
        }
        options.target = value;
        index += 1;
        break;
      case '--migrations-dir':
        if (value === undefined) {
          throw new Error('Missing value for --migrations-dir');
        }
        options.migrationsDir = resolve(value);
        index += 1;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }

  return options;
}

/** Prints the usage banner. */
function printUsage(): void {
  process.stdout.write(
    [
      'Usage: tsx database/migrate.ts [options]',
      '',
      'Options:',
      '  -d, --database <url>       PostgreSQL connection string (defaults to DATABASE_URL)',
      '  -t, --target <migration>   Stop after the given migration id has been processed',
      '      --migrations-dir <dir> Directory holding the .sql migration files',
      '  -h, --help                 Show this help',
      '',
    ].join('\n'),
  );
}

/** Loads every migration file, sorted by file name. */
async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory);
  const sqlFiles = entries.filter((entry) => entry.endsWith('.sql')).sort();

  const migrations: MigrationFile[] = [];
  for (const id of sqlFiles) {
    const path = join(directory, id);
    const sql = await readFile(path, 'utf8');
    migrations.push({ id, path, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }

  return migrations;
}

/** Creates the schema and the migration bookkeeping table when they are missing. */
async function ensureBookkeeping(client: pg.Client): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum text NOT NULL,
      CONSTRAINT schema_migrations_pkey PRIMARY KEY (id)
    )
  `);
}

/** Reads the migrations that are already recorded in the database. */
async function readApplied(client: pg.Client): Promise<Map<string, string>> {
  const result = await client.query<{ id: string; checksum: string }>(
    `SELECT id, checksum FROM ${MIGRATION_TABLE}`,
  );
  const applied = new Map<string, string>();
  for (const row of result.rows) {
    applied.set(row.id, row.checksum);
  }
  return applied;
}

/** Removes SQL comments so that comment only chunks can be detected. */
function stripComments(script: string): string {
  let result = '';
  let index = 0;

  while (index < script.length) {
    const char = script[index] ?? '';
    const next = script[index + 1] ?? '';

    if (char === '-' && next === '-') {
      const end = script.indexOf('\n', index);
      index = end === -1 ? script.length : end;
      continue;
    }

    if (char === '/' && next === '*') {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < script.length && depth > 0) {
        if (script[cursor] === '/' && script[cursor + 1] === '*') {
          depth += 1;
          cursor += 2;
          continue;
        }
        if (script[cursor] === '*' && script[cursor + 1] === '/') {
          depth -= 1;
          cursor += 2;
          continue;
        }
        cursor += 1;
      }
      index = cursor;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/**
 * Splits a SQL script into single statements.
 *
 * PostgreSQL parses a multi statement batch before executing any of it, so a
 * statement that depends on an object created by an earlier statement in the
 * same file (for example `CREATE EXTENSION postgis` followed by a table that
 * uses `public.geography`) would fail. Executing the statements one by one
 * mirrors what `psql -f` does and keeps every migration file self contained.
 */
export function splitStatements(script: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;

  const isIdentifierChar = (char: string): boolean => /[A-Za-z0-9_]/.test(char);

  while (index < script.length) {
    const char = script[index] ?? '';
    const next = script[index + 1] ?? '';
    const previous = current[current.length - 1] ?? '';

    if (char === '-' && next === '-') {
      const end = script.indexOf('\n', index);
      const stop = end === -1 ? script.length : end;
      current += script.slice(index, stop);
      index = stop;
      continue;
    }

    if (char === '/' && next === '*') {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < script.length && depth > 0) {
        if (script[cursor] === '/' && script[cursor + 1] === '*') {
          depth += 1;
          cursor += 2;
          continue;
        }
        if (script[cursor] === '*' && script[cursor + 1] === '/') {
          depth -= 1;
          cursor += 2;
          continue;
        }
        cursor += 1;
      }
      current += script.slice(index, cursor);
      index = cursor;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let cursor = index + 1;
      while (cursor < script.length) {
        if (script[cursor] === quote) {
          if (script[cursor + 1] === quote) {
            cursor += 2;
            continue;
          }
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      current += script.slice(index, cursor);
      index = cursor;
      continue;
    }

    if (char === '$' && !isIdentifierChar(previous)) {
      const tagMatch = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(script.slice(index));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = script.indexOf(tag, index + tag.length);
        const stop = end === -1 ? script.length : end + tag.length;
        current += script.slice(index, stop);
        index = stop;
        continue;
      }
    }

    if (char === ';') {
      statements.push(current);
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  statements.push(current);

  return statements
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && stripComments(statement).trim().length > 0);
}

/** Applies a single migration inside a transaction. */
async function applyMigration(client: pg.Client, migration: MigrationFile): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const statement of splitStatements(migration.sql)) {
      await client.query(statement);
    }
    await client.query(
      `INSERT INTO ${MIGRATION_TABLE} (id, checksum) VALUES ($1, $2)`,
      [migration.id, migration.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Prints the summary table of the run. */
function printSummary(rows: Array<{ id: string; status: MigrationStatus; detail: string }>): void {
  const headers = ['Migration', 'Status', 'Detail'];
  const all = [...rows.map((row) => [row.id, row.status, row.detail] as const), headers];
  const widths = headers.map((_, column) =>
    Math.max(...all.map((row) => (row[column] ?? '').length)),
  );

  const line = (cells: ReadonlyArray<string>): string =>
    `  ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd()}`;

  process.stdout.write('\n');
  process.stdout.write(`${line(headers)}\n`);
  process.stdout.write(`${'  ' + widths.map((width) => '-'.repeat(width)).join('  ')}\n`);
  for (const row of rows) {
    process.stdout.write(`${line([row.id, row.status, row.detail])}\n`);
  }
  process.stdout.write('\n');
}

/** Entry point. */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const migrations = await loadMigrations(options.migrationsDir);

  if (migrations.length === 0) {
    process.stdout.write(`No migrations found in ${options.migrationsDir}\n`);
    return;
  }

  const client = new Client({ connectionString: options.databaseUrl });
  client.on('notice', (notice: { message: string }) => {
    process.stdout.write(`NOTICE: ${notice.message}\n`);
  });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [ADVISORY_LOCK_KEY]);
    await ensureBookkeeping(client);
    const applied = await readApplied(client);

    const rows: Array<{ id: string; status: MigrationStatus; detail: string }> = [];
    let reachedTarget = false;

    for (const migration of migrations) {
      if (reachedTarget) {
        rows.push({ id: migration.id, status: 'pending', detail: 'after target' });
        continue;
      }

      const known = applied.get(migration.id);
      if (known !== undefined) {
        if (known === migration.checksum) {
          rows.push({ id: migration.id, status: 'skipped', detail: 'already applied' });
        } else {
          process.stdout.write(
            `WARNING: ${migration.id} was already applied with a different checksum\n` +
              `         recorded: ${known}\n` +
              `         file:     ${migration.checksum}\n` +
              '         skipping, the migration was not re-applied\n',
          );
          rows.push({ id: migration.id, status: 'warning', detail: 'checksum mismatch' });
        }
      } else {
        process.stdout.write(`Applying ${migration.id} ...\n`);
        await applyMigration(client, migration);
        rows.push({ id: migration.id, status: 'applied', detail: 'ok' });
      }

      if (options.target !== null && migration.id === options.target) {
        reachedTarget = true;
      }
    }

    printSummary(rows);

    const failures = rows.filter((row) => row.status === 'warning').length;
    const appliedCount = rows.filter((row) => row.status === 'applied').length;
    process.stdout.write(
      `${appliedCount} applied, ${rows.length - appliedCount - failures} skipped` +
        (failures > 0 ? `, ${failures} checksum warning(s)` : '') +
        '\n',
    );
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [ADVISORY_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});
