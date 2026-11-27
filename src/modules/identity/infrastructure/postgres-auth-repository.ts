import { Pool } from "pg";

import type {
  AuthRepository,
  AuthSessionRecord,
  PasswordResetRecord,
  UserRole,
  UserRecord,
} from "@/src/modules/identity/domain/auth-types";
import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";

type PostgresUserRow = {
  id: string;
  phone_number: string;
  display_name: string;
  locale: string;
  roles: UserRole[];
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  password_updated_at: string;
  password_hash: string;
};

type PostgresSessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type PostgresPasswordResetRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

declare global {
  var __okkhorAuthPool: Pool | undefined;
  var __okkhorPostgresAuthRepository: AuthRepository | undefined;
}

function mapUserRow(row: PostgresUserRow): UserRecord {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    displayName: row.display_name,
    locale: row.locale,
    roles: row.roles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || undefined,
    passwordUpdatedAt: row.password_updated_at,
    passwordHash: row.password_hash,
  };
}

function mapSessionRow(row: PostgresSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.refresh_token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || undefined,
  };
}

function mapPasswordResetRow(row: PostgresPasswordResetRow): PasswordResetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at || undefined,
  };
}

function getPool() {
  if (!globalThis.__okkhorAuthPool) {
    globalThis.__okkhorAuthPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorAuthPool;
}

function createPostgresAuthRepository(pool: Pool): AuthRepository {
  return {
    async getUserById(id) {
      const result = await pool.query<PostgresUserRow>("SELECT * FROM auth_users WHERE id = $1 LIMIT 1", [id]);

      return result.rows[0] ? mapUserRow(result.rows[0]) : undefined;
    },
    async getUserByPhone(phoneNumber) {
      const result = await pool.query<PostgresUserRow>("SELECT * FROM auth_users WHERE phone_number = $1 LIMIT 1", [phoneNumber]);

      return result.rows[0] ? mapUserRow(result.rows[0]) : undefined;
    },
    async createUser(user) {
      await pool.query(
        `
          INSERT INTO auth_users (
            id,
            phone_number,
            display_name,
            locale,
            roles,
            created_at,
            updated_at,
            last_login_at,
            password_updated_at,
            password_hash
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
        `,
        [
          user.id,
          user.phoneNumber,
          user.displayName,
          user.locale,
          JSON.stringify(user.roles),
          user.createdAt,
          user.updatedAt,
          user.lastLoginAt ?? null,
          user.passwordUpdatedAt,
          user.passwordHash,
        ],
      );
    },
    async updateUser(user) {
      await pool.query(
        `
          UPDATE auth_users
          SET phone_number = $2,
              display_name = $3,
              locale = $4,
              roles = $5::jsonb,
              created_at = $6,
              updated_at = $7,
              last_login_at = $8,
              password_updated_at = $9,
              password_hash = $10
          WHERE id = $1
        `,
        [
          user.id,
          user.phoneNumber,
          user.displayName,
          user.locale,
          JSON.stringify(user.roles),
          user.createdAt,
          user.updatedAt,
          user.lastLoginAt ?? null,
          user.passwordUpdatedAt,
          user.passwordHash,
        ],
      );
    },
    async getSessionById(id) {
      const result = await pool.query<PostgresSessionRow>("SELECT * FROM auth_sessions WHERE id = $1 LIMIT 1", [id]);

      return result.rows[0] ? mapSessionRow(result.rows[0]) : undefined;
    },
    async createSession(session) {
      await pool.query(
        `
          INSERT INTO auth_sessions (
            id,
            user_id,
            refresh_token_hash,
            created_at,
            expires_at,
            revoked_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [session.id, session.userId, session.refreshTokenHash, session.createdAt, session.expiresAt, session.revokedAt ?? null],
      );
    },
    async updateSession(session) {
      await pool.query(
        `
          UPDATE auth_sessions
          SET user_id = $2,
              refresh_token_hash = $3,
              created_at = $4,
              expires_at = $5,
              revoked_at = $6
          WHERE id = $1
        `,
        [session.id, session.userId, session.refreshTokenHash, session.createdAt, session.expiresAt, session.revokedAt ?? null],
      );
    },
    async listSessionsByUserId(userId) {
      const result = await pool.query<PostgresSessionRow>(
        "SELECT * FROM auth_sessions WHERE user_id = $1 ORDER BY created_at ASC",
        [userId],
      );

      return result.rows.map(mapSessionRow);
    },
    async createPasswordReset(record) {
      await pool.query(
        `
          INSERT INTO auth_password_resets (
            id,
            user_id,
            token_hash,
            created_at,
            expires_at,
            used_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [record.id, record.userId, record.tokenHash, record.createdAt, record.expiresAt, record.usedAt ?? null],
      );
    },
    async updatePasswordReset(record) {
      await pool.query(
        `
          UPDATE auth_password_resets
          SET user_id = $2,
              token_hash = $3,
              created_at = $4,
              expires_at = $5,
              used_at = $6
          WHERE id = $1
        `,
        [record.id, record.userId, record.tokenHash, record.createdAt, record.expiresAt, record.usedAt ?? null],
      );
    },
    async getPasswordResetByTokenHash(tokenHash) {
      const result = await pool.query<PostgresPasswordResetRow>(
        "SELECT * FROM auth_password_resets WHERE token_hash = $1 LIMIT 1",
        [tokenHash],
      );

      return result.rows[0] ? mapPasswordResetRow(result.rows[0]) : undefined;
    },
  };
}

export function getPostgresAuthRepository(): AuthRepository {
  if (!globalThis.__okkhorPostgresAuthRepository) {
    globalThis.__okkhorPostgresAuthRepository = createPostgresAuthRepository(getPool());
  }

  return globalThis.__okkhorPostgresAuthRepository;
}
