/**
 * GEOVENTRA — PostgreSQL access layer.
 *
 * A thin, typed wrapper over `pg.Pool`. It deliberately avoids an ORM: the fleet platform has
 * a lot of analytical SQL (time-bucketed series, lateral joins) that is clearer written out.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export interface QueryOptions {
  /** Wrap the statement in a transaction that is rolled back on error. */
  transaction?: boolean;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ?? 'postgresql://geoventra@localhost:5432/geoventra';
    const schema = process.env.DATABASE_SCHEMA ?? 'geoventra';

    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      options: `-c search_path=${schema},public`,
    });

    this.pool.on('error', (error) => {
      this.logger.error(`Idle database client error: ${error.message}`);
    });
  }

  /** Run a query and return the rows. */
  async query<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result: QueryResult<T> = await this.pool.query<T>(text, params as unknown[]);
    return result.rows;
  }

  /** Run a query and return the first row, or `null`. */
  async queryOne<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  /** Run a query and return the first row's single scalar value. */
  async queryValue<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const row = await this.queryOne<T>(text, params);
    if (!row) return null;
    const values = Object.values(row);
    return (values[0] ?? null) as T | null;
  }

  /**
   * Run `handler` inside a transaction. The callback receives a client bound to the same pool;
   * any thrown error rolls the transaction back.
   */
  async transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Liveness probe used by the health module. */
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.warn(`Database ping failed: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
