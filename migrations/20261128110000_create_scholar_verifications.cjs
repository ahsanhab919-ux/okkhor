/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("scholar_verifications", {
    id: { type: "text", primaryKey: true },
    applicant_id: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "draft" },
    display_name: { type: "text", notNull: true },
    degrees: { type: "jsonb", notNull: true, default: "[]" },
    affiliations: { type: "jsonb", notNull: true, default: "[]" },
    portfolio: { type: "text", notNull: true, default: "" },
    specializations: { type: "jsonb", notNull: true, default: "[]" },
    languages: { type: "jsonb", notNull: true, default: "[]" },
    review_note: { type: "text" },
    reviewed_by: { type: "text" },
    submitted_at: { type: "text" },
    reviewed_at: { type: "text" },
    created_at: { type: "text", notNull: true },
    updated_at: { type: "text", notNull: true },
  });

  pgm.createIndex("scholar_verifications", ["applicant_id"], {
    name: "scholar_verifications_applicant_id_idx",
    unique: true,
  });

  pgm.createIndex("scholar_verifications", ["status", "submitted_at"], {
    name: "scholar_verifications_status_submitted_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("scholar_verifications", ["status", "submitted_at"], {
    ifExists: true,
    name: "scholar_verifications_status_submitted_at_idx",
  });

  pgm.dropIndex("scholar_verifications", ["applicant_id"], {
    ifExists: true,
    name: "scholar_verifications_applicant_id_idx",
  });

  pgm.dropTable("scholar_verifications");
};
