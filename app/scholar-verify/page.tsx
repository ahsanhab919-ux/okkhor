import React from "react";
import { verificationSteps } from "@/src/modules/experience/site-content";
import { Icon, StepRail } from "@/src/modules/experience/ui";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export default function ScholarVerifyPage() {
  return (
    <ProtectedWorkspaceShell eyebrow="SCHOLAR VERIFICATION" title="Credentials Review">
      <div className="verification-shell verification-shell--embedded">
        <StepRail steps={verificationSteps} />

        <main className="verification-main verification-main--embedded">
          <section className="verification-card">
          <p className="eyebrow eyebrow--blue">Step 2 of 4</p>
          <h1>Credentials</h1>
          <p className="verification-card__lead">
            Provide verifiable evidence of academic and professional authority. Every profile is reviewed by the
            Okkhor scholarly committee before publication.
          </p>

          <div className="form-section-grid">
            <section className="form-panel">
              <div className="form-panel__header">
                <div>
                  <h2>Academic Degrees</h2>
                  <p>List your highest relevant degree and supporting evidence.</p>
                </div>
                <button className="button button--ghost button--small" type="button">
                  <Icon className="icon-xs" name="plus" />
                  Add Another Degree
                </button>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Degree Type</span>
                  <input defaultValue="PhD in History of Science" name="degreeType" />
                </label>
                <label className="field">
                  <span>Institution</span>
                  <input defaultValue="University of Dhaka" name="institution" />
                </label>
                <label className="field">
                  <span>Year</span>
                  <input defaultValue="2018" name="year" />
                </label>
                <label className="field">
                  <span>Certificate</span>
                  <button className="upload-button" type="button">
                    Upload Proof
                  </button>
                </label>
              </div>
            </section>

            <section className="form-panel">
              <div className="form-panel__header">
                <div>
                  <h2>Professional Affiliations</h2>
                  <p>Show the roles and institutions that establish present authority.</p>
                </div>
                <button className="button button--ghost button--small" type="button">
                  <Icon className="icon-xs" name="plus" />
                  Add Historical Role
                </button>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Current Role</span>
                  <input defaultValue="Associate Professor" name="currentRole" />
                </label>
                <label className="field">
                  <span>Since</span>
                  <input defaultValue="2021" name="since" />
                </label>
                <label className="field field--full">
                  <span>Organization</span>
                  <input defaultValue="Centre for Research Methods and Historiography" name="organization" />
                </label>
              </div>
            </section>
          </div>

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
                  defaultValue="1. Archive Cities of the Bay, 2024 documentary lecture series&#10;2. Trade Networks and Measurement Cultures in South Asia, 2022 journal essay&#10;3. Methods for Bangla-first research pedagogy, 2021 curriculum paper"
                  name="portfolio"
                  rows={6}
                />
              </label>
            </div>
          </section>

          <div className="verification-actions">
            <button className="button button--ghost button--large" type="button">
              Save Draft
            </button>
            <button className="button button--primary button--large" type="button">
              Continue to Specialization
            </button>
          </div>
          </section>
        </main>
      </div>
    </ProtectedWorkspaceShell>
  );
}
