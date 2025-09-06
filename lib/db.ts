// lib/db.ts
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

declare global {
  // чтобы HMR в dev не плодил пулы
  // eslint-disable-next-line no-var
  var __mp_pg_pool__: Pool | undefined;
}

const connectionString =
  process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL/NEON_DATABASE_URL is not set');
}

const pool =
  global.__mp_pg_pool__ ||
  new Pool({
    connectionString,
    // Neon почти всегда с SSL; если в строке есть sslmode=require — true,
    // иначе разрешаем самоподписанный
    ssl: /sslmode=require/i.test(connectionString) ? true : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__mp_pg_pool__ = pool;
}

// === ВАЖНО: ограничиваем T ===
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export { pool };

/**
 * Помощник для параметризованных SQL как template literal.
 *
 * const rows = await sql<{ id:number }>`select id from manga where title ilike ${'%naruto%'};`;
 */
export async function sql<T extends QueryResultRow = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<T[]> {
  const text = strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
    ''
  );
  const res = await query<T>(text, values);
  return res.rows;
}

/** Обёртка транзакции */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
