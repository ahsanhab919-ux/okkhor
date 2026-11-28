"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import type {
  ScholarVerification,
  VerificationAffiliation,
  VerificationDegree,
} from "@/src/modules/verification/domain/verification-types";

type VerificationFormProps = {
  application: ScholarVerification | null;
  defaultDisplayName: string;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

const EMPTY_DEGREE: VerificationDegree = { degreeType: "", institution: "", year: "", evidenceUrl: "" };
const EMPTY_AFFILIATION: VerificationAffiliation = { role: "", organization: "", since: "", evidenceUrl: "" };

function splitList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The applicant island. It creates the draft with `POST /api/verification/application`, or
 * saves/submits an existing one with `PATCH /api/verification/application`. The stored
 * `updatedAt` is sent back so the server can reject a stale write with `409`.
 */
export function VerificationForm({ application, defaultDisplayName }: VerificationFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(application?.displayName || defaultDisplayName);
  const [degrees, setDegrees] = useState<VerificationDegree[]>(
    application && application.degrees.length > 0 ? application.degrees : [{ ...EMPTY_DEGREE }],
  );
  const [affiliations, setAffiliations] = useState<VerificationAffiliation[]>(application?.affiliations ?? []);
  const [portfolio, setPortfolio] = useState(application?.portfolio ?? "");
  const [specializations, setSpecializations] = useState((application?.specializations ?? []).join(", "));
  const [languages, setLanguages] = useState((application?.languages ?? []).join(", "));
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function updateDegree(index: number, patch: Partial<VerificationDegree>) {
    setDegrees((current) => current.map((degree, i) => (i === index ? { ...degree, ...patch } : degree)));
  }

  function updateAffiliation(index: number, patch: Partial<VerificationAffiliation>) {
    setAffiliations((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  async function persist(target: "draft" | "submitted") {
    if (busy) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    const payload = {
      displayName,
      degrees: degrees
        .filter((degree) => degree.degreeType || degree.institution || degree.year)
        .map((degree) => ({
          degreeType: degree.degreeType,
          institution: degree.institution,
          year: degree.year,
          evidenceUrl: degree.evidenceUrl?.trim() || undefined,
        })),
      affiliations: affiliations
        .filter((entry) => entry.role || entry.organization || entry.since)
        .map((entry) => ({
          role: entry.role,
          organization: entry.organization,
          since: entry.since,
          evidenceUrl: entry.evidenceUrl?.trim() || undefined,
        })),
      portfolio,
      specializations: splitList(specializations),
      languages: splitList(languages),
      status: target,
      ...(application ? { updatedAt: application.updatedAt } : {}),
    };

    try {
      const response = await fetch("/api/verification/application", {
        method: application ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(body?.error?.message || "The application could not be saved.");
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("The application could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verification-main verification-main--embedded">
      <section className="verification-card">
        <p className="eyebrow eyebrow--blue">{application ? "Update application" : "Step 1 of 4"}</p>
        <h1>Credentials</h1>
        <p className="verification-card__lead">
          Provide verifiable evidence of academic and professional authority. Every profile is reviewed by the
          Okkhor scholarly committee before publication.
        </p>

        {errorMessage ? (
          <p className="session-banner session-banner--error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Identity</h2>
              <p>Confirm how learners should recognize you.</p>
            </div>
          </div>
          <div className="field-grid">
            <label className="field field--full">
              <span>Display name</span>
              <input name="displayName" onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
            </label>
          </div>
        </section>

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Academic Degrees</h2>
              <p>List your highest relevant degree and supporting evidence.</p>
            </div>
            <button
              className="button button--ghost button--small"
              onClick={() => setDegrees((current) => [...current, { ...EMPTY_DEGREE }])}
              type="button"
            >
              Add Another Degree
            </button>
          </div>

          {degrees.map((degree, index) => (
            <div className="field-grid" key={`degree-${index}`}>
              <label className="field">
                <span>Degree Type</span>
                <input
                  name={`degreeType-${index}`}
                  onChange={(event) => updateDegree(index, { degreeType: event.target.value })}
                  value={degree.degreeType}
                />
              </label>
              <label className="field">
                <span>Institution</span>
                <input
                  name={`institution-${index}`}
                  onChange={(event) => updateDegree(index, { institution: event.target.value })}
                  value={degree.institution}
                />
              </label>
              <label className="field">
                <span>Year</span>
                <input
                  name={`year-${index}`}
                  onChange={(event) => updateDegree(index, { year: event.target.value })}
                  value={degree.year}
                />
              </label>
              <label className="field">
                <span>Evidence link</span>
                <input
                  name={`degreeEvidence-${index}`}
                  onChange={(event) => updateDegree(index, { evidenceUrl: event.target.value })}
                  value={degree.evidenceUrl ?? ""}
                />
              </label>
              {degrees.length > 1 ? (
                <button
                  className="button button--ghost button--small"
                  onClick={() => setDegrees((current) => current.filter((_, i) => i !== index))}
                  type="button"
                >
                  Remove degree
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Professional Affiliations</h2>
              <p>Show the roles and institutions that establish present authority.</p>
            </div>
            <button
              className="button button--ghost button--small"
              onClick={() => setAffiliations((current) => [...current, { ...EMPTY_AFFILIATION }])}
              type="button"
            >
              Add Historical Role
            </button>
          </div>

          {affiliations.length === 0 ? (
            <p>No affiliations added yet.</p>
          ) : (
            affiliations.map((entry, index) => (
              <div className="field-grid" key={`affiliation-${index}`}>
                <label className="field">
                  <span>Current Role</span>
                  <input
                    name={`role-${index}`}
                    onChange={(event) => updateAffiliation(index, { role: event.target.value })}
                    value={entry.role}
                  />
                </label>
                <label className="field">
                  <span>Since</span>
                  <input
                    name={`since-${index}`}
                    onChange={(event) => updateAffiliation(index, { since: event.target.value })}
                    value={entry.since}
                  />
                </label>
                <label className="field field--full">
                  <span>Organization</span>
                  <input
                    name={`organization-${index}`}
                    onChange={(event) => updateAffiliation(index, { organization: event.target.value })}
                    value={entry.organization}
                  />
                </label>
                <label className="field">
                  <span>Evidence link</span>
                  <input
                    name={`affiliationEvidence-${index}`}
                    onChange={(event) => updateAffiliation(index, { evidenceUrl: event.target.value })}
                    value={entry.evidenceUrl ?? ""}
                  />
                </label>
                <button
                  className="button button--ghost button--small"
                  onClick={() => setAffiliations((current) => current.filter((_, i) => i !== index))}
                  type="button"
                >
                  Remove role
                </button>
              </div>
            ))
          )}
        </section>

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Research Portfolio</h2>
              <p>Link the work that learners should trust first.</p>
            </div>
          </div>
          <div className="field-grid">
            <label className="field field--full">
              <span>Selected publications or documentary work</span>
              <textarea
                name="portfolio"
                onChange={(event) => setPortfolio(event.target.value)}
                rows={6}
                value={portfolio}
              />
            </label>
          </div>
        </section>

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Specialization</h2>
              <p>Declare research areas, languages, and teaching strength.</p>
            </div>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Research specializations (comma separated)</span>
              <input
                name="specializations"
                onChange={(event) => setSpecializations(event.target.value)}
                value={specializations}
              />
            </label>
            <label className="field">
              <span>Languages (comma separated)</span>
              <input name="languages" onChange={(event) => setLanguages(event.target.value)} value={languages} />
            </label>
          </div>
        </section>

        <div className="verification-actions">
          <button
            className="button button--ghost button--large"
            disabled={busy}
            onClick={() => void persist("draft")}
            type="button"
          >
            {busy ? "Saving..." : "Save Draft"}
          </button>
          <button
            className="button button--primary button--large"
            disabled={busy}
            onClick={() => void persist("submitted")}
            type="button"
          >
            Submit for Review
          </button>
        </div>
      </section>
    </div>
  );
}
