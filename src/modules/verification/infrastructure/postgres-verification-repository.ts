import { Pool } from "pg";

import type {
  ScholarVerification,
  VerificationDegree,
  VerificationAffiliation,
  VerificationRepository,
  VerificationStatus,
} from "@/src/modules/verification/domain/verification-types";
import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";

type PostgresVerificationRow = {
  id: string;
  applicant_id: string;
  status: string;
  display_name: string;
  degrees: VerificationDegree[];
  affiliations: VerificationAffiliation[];
  portfolio: string;
  specializations: string[];
  languages: string[];
  review_note: string | null;
  reviewed_by: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

declare global {
  var __okkhorVerificationPool: Pool | undefined;
  var __okkhorPostgresVerificationRepository: VerificationRepository | undefined;
}

function mapVerificationRow(row: PostgresVerificationRow): ScholarVerification {
  return {
    id: row.id,
    applicantId: row.applicant_id,
    status: row.status as VerificationStatus,
    displayName: row.display_name,
    degrees: row.degrees,
    affiliations: row.affiliations,
    portfolio: row.portfolio,
    specializations: row.specializations,
    languages: row.languages,
    reviewNote: row.review_note || undefined,
    reviewedBy: row.reviewed_by || undefined,
    submittedAt: row.submitted_at || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool() {
  if (!globalThis.__okkhorVerificationPool) {
    globalThis.__okkhorVerificationPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorVerificationPool;
}

function createPostgresVerificationRepository(pool: Pool): VerificationRepository {
  return {
    async getByApplicantId(applicantId) {
      const result = await pool.query<PostgresVerificationRow>(
        "SELECT * FROM scholar_verifications WHERE applicant_id = $1 LIMIT 1",
        [applicantId],
      );

      return result.rows[0] ? mapVerificationRow(result.rows[0]) : undefined;
    },
    async getById(id) {
      const result = await pool.query<PostgresVerificationRow>(
        "SELECT * FROM scholar_verifications WHERE id = $1 LIMIT 1",
        [id],
      );

      return result.rows[0] ? mapVerificationRow(result.rows[0]) : undefined;
    },
    async listByStatus(status) {
      const result = status
        ? await pool.query<PostgresVerificationRow>(
            "SELECT * FROM scholar_verifications WHERE status = $1 ORDER BY updated_at DESC, id DESC",
            [status],
          )
        : await pool.query<PostgresVerificationRow>(
            "SELECT * FROM scholar_verifications ORDER BY updated_at DESC, id DESC",
          );

      return result.rows.map(mapVerificationRow);
    },
    async create(verification) {
      await pool.query(
        `
          INSERT INTO scholar_verifications (
            id,
            applicant_id,
            status,
            display_name,
            degrees,
            affiliations,
            portfolio,
            specializations,
            languages,
            review_note,
            reviewed_by,
            submitted_at,
            reviewed_at,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            applicant_id = EXCLUDED.applicant_id,
            status = EXCLUDED.status,
            display_name = EXCLUDED.display_name,
            degrees = EXCLUDED.degrees,
            affiliations = EXCLUDED.affiliations,
            portfolio = EXCLUDED.portfolio,
            specializations = EXCLUDED.specializations,
            languages = EXCLUDED.languages,
            review_note = EXCLUDED.review_note,
            reviewed_by = EXCLUDED.reviewed_by,
            submitted_at = EXCLUDED.submitted_at,
            reviewed_at = EXCLUDED.reviewed_at,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          verification.id,
          verification.applicantId,
          verification.status,
          verification.displayName,
          JSON.stringify(verification.degrees),
          JSON.stringify(verification.affiliations),
          verification.portfolio,
          JSON.stringify(verification.specializations),
          JSON.stringify(verification.languages),
          verification.reviewNote ?? null,
          verification.reviewedBy ?? null,
          verification.submittedAt ?? null,
          verification.reviewedAt ?? null,
          verification.createdAt,
          verification.updatedAt,
        ],
      );
    },
    async updateIfUnchanged(verification, expectedUpdatedAt) {
      const result = await pool.query(
        `
          UPDATE scholar_verifications
          SET applicant_id = $2,
              status = $3,
              display_name = $4,
              degrees = $5::jsonb,
              affiliations = $6::jsonb,
              portfolio = $7,
              specializations = $8::jsonb,
              languages = $9::jsonb,
              review_note = $10,
              reviewed_by = $11,
              submitted_at = $12,
              reviewed_at = $13,
              created_at = $14,
              updated_at = $15
          WHERE id = $1 AND updated_at = $16
        `,
        [
          verification.id,
          verification.applicantId,
          verification.status,
          verification.displayName,
          JSON.stringify(verification.degrees),
          JSON.stringify(verification.affiliations),
          verification.portfolio,
          JSON.stringify(verification.specializations),
          JSON.stringify(verification.languages),
          verification.reviewNote ?? null,
          verification.reviewedBy ?? null,
          verification.submittedAt ?? null,
          verification.reviewedAt ?? null,
          verification.createdAt,
          verification.updatedAt,
          expectedUpdatedAt,
        ],
      );

      return (result.rowCount ?? 0) === 1;
    },
  };
}

export function getPostgresVerificationRepository(): VerificationRepository {
  if (!globalThis.__okkhorPostgresVerificationRepository) {
    globalThis.__okkhorPostgresVerificationRepository = createPostgresVerificationRepository(getPool());
  }

  return globalThis.__okkhorPostgresVerificationRepository;
}
