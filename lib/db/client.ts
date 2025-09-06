// src/db/client.ts
import { Pool, PoolClient, QueryResult } from 'pg';
export { query, getClient, sql, withTransaction, pool } from '@/lib/db';
const connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL not set');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Neon
  // max: 10, // при желании
});

export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const client: PoolClient = await pool.connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}
