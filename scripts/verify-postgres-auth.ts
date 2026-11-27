import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { getPostgresPoolConfig } from "../src/modules/platform/infrastructure/postgres-config";

type TablePrivilegeResult = {
  table_name: string;
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
};

async function verifyConnectivity(pool: Pool) {
  const result = await pool.query<{
    current_database: string;
    current_user: string;
    server_address: string | null;
    server_port: number | null;
    backend_pid: number;
  }>(`
    SELECT
      current_database() AS current_database,
      current_user AS current_user,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      pg_backend_pid() AS backend_pid
  `);

  return result.rows[0];
}

async function verifySchemaPresence(pool: Pool) {
  const result = await pool.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('schema_migrations', 'auth_users', 'auth_sessions', 'auth_password_resets')
      ORDER BY table_name ASC
    `,
  );

  const discoveredTables = new Set(result.rows.map((row) => row.table_name));
  const requiredTables = ["schema_migrations", "auth_password_resets", "auth_sessions", "auth_users"];

  for (const tableName of requiredTables) {
    if (!discoveredTables.has(tableName)) {
      throw new Error(`Required table "${tableName}" was not found. Run "npm run db:migrate" before verification.`);
    }
  }

  return requiredTables;
}

async function verifyPrivileges(pool: Pool) {
  const result = await pool.query<TablePrivilegeResult>(`
    SELECT
      table_name,
      has_table_privilege(current_user, format('public.%I', table_name), 'SELECT') AS can_select,
      has_table_privilege(current_user, format('public.%I', table_name), 'INSERT') AS can_insert,
      has_table_privilege(current_user, format('public.%I', table_name), 'UPDATE') AS can_update,
      has_table_privilege(current_user, format('public.%I', table_name), 'DELETE') AS can_delete
    FROM (
      VALUES
        ('auth_users'),
        ('auth_sessions'),
        ('auth_password_resets'),
        ('schema_migrations')
    ) AS required_tables(table_name)
  `);

  const insufficient = result.rows.filter(
    (row) =>
      !row.can_select ||
      (row.table_name !== "schema_migrations" && (!row.can_insert || !row.can_update || !row.can_delete)),
  );

  if (insufficient.length > 0) {
    throw new Error(`Insufficient table privileges detected for: ${insufficient.map((row) => row.table_name).join(", ")}`);
  }

  return result.rows;
}

async function verifyConnectionReuse(pool: Pool) {
  const firstClient = await pool.connect();
  const firstPidResult = await firstClient.query<{ backend_pid: number }>("SELECT pg_backend_pid() AS backend_pid");
  const firstPid = firstPidResult.rows[0]?.backend_pid;
  firstClient.release();

  const totalAfterFirstRelease = pool.totalCount;

  const secondClient = await pool.connect();
  const secondPidResult = await secondClient.query<{ backend_pid: number }>("SELECT pg_backend_pid() AS backend_pid");
  const secondPid = secondPidResult.rows[0]?.backend_pid;
  secondClient.release();

  return {
    firstPid,
    secondPid,
    poolTotalCount: pool.totalCount,
    reused: firstPid === secondPid && totalAfterFirstRelease >= 1,
  };
}

async function verifyCrudAndTransactions(pool: Pool) {
  const verificationId = `verify-${randomUUID()}`;
  const phoneNumber = `+88019${Date.now().toString().slice(-8)}`;
  const sessionId = `session-${randomUUID()}`;
  const resetId = `reset-${randomUUID()}`;
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  try {
    await pool.query(
      `
        INSERT INTO auth_users (
          id, phone_number, display_name, locale, roles, created_at, updated_at, password_updated_at, password_hash
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
      `,
      [verificationId, phoneNumber, "Verification User", "en-BD", JSON.stringify(["learner"]), now, now, now, "hash"],
    );

    const insertedUser = await pool.query<{ id: string; phone_number: string }>(
      "SELECT id, phone_number FROM auth_users WHERE id = $1",
      [verificationId],
    );

    if (insertedUser.rowCount !== 1) {
      throw new Error("Auth user insert/read verification failed.");
    }

    await pool.query(
      `
        INSERT INTO auth_sessions (
          id, user_id, refresh_token_hash, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [sessionId, verificationId, "refresh-hash", now, later],
    );

    await pool.query(
      `
        INSERT INTO auth_password_resets (
          id, user_id, token_hash, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [resetId, verificationId, "token-hash", now, later],
    );

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("UPDATE auth_users SET display_name = $2, updated_at = $3 WHERE id = $1", [
        verificationId,
        "Verification User Updated",
        later,
      ]);

      const insideTransaction = await client.query<{ display_name: string }>(
        "SELECT display_name FROM auth_users WHERE id = $1",
        [verificationId],
      );

      if (insideTransaction.rows[0]?.display_name !== "Verification User Updated") {
        throw new Error("Transactional update visibility check failed.");
      }

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const afterRollback = await pool.query<{ display_name: string }>("SELECT display_name FROM auth_users WHERE id = $1", [
      verificationId,
    ]);

    if (afterRollback.rows[0]?.display_name !== "Verification User") {
      throw new Error("Transaction rollback verification failed.");
    }
  } finally {
    await pool.query("DELETE FROM auth_password_resets WHERE id = $1", [resetId]);
    await pool.query("DELETE FROM auth_sessions WHERE id = $1", [sessionId]);
    await pool.query("DELETE FROM auth_users WHERE id = $1", [verificationId]);
  }
}

async function main() {
  const pool = new Pool(getPostgresPoolConfig());

  try {
    const connectivity = await verifyConnectivity(pool);
    const tables = await verifySchemaPresence(pool);
    const privileges = await verifyPrivileges(pool);
    const reuse = await verifyConnectionReuse(pool);
    await verifyCrudAndTransactions(pool);

    console.log("PostgreSQL full-link verification passed.");
    console.log(
      JSON.stringify(
        {
          connectivity,
          tables,
          privileges,
          reuse,
          pool: {
            max: pool.options.max,
            idleTimeoutMillis: pool.options.idleTimeoutMillis,
            connectionTimeoutMillis: pool.options.connectionTimeoutMillis,
            maxUses: pool.options.maxUses,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("PostgreSQL full-link verification failed.");
  console.error(error);
  process.exitCode = 1;
});
