import pg, { type Pool, type PoolClient } from "pg";

export function createPool(connectionString: string): Pool {
  return new pg.Pool({
    connectionString,
    max: 20,
    statement_timeout: 10_000,
  });
}

export async function withTransaction<T>(
  pool: Pool,
  work: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const result = await work(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
