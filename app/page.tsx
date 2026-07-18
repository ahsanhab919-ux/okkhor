import { getPlatformHighlights, getRuntimeStatus } from "@/src/modules/platform/domain/runtime-status";

export default function HomePage() {
  const status = getRuntimeStatus(new Date("2026-07-18T00:00:00.000Z"));
  const highlights = getPlatformHighlights();

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Journal Club Asia / Okkhor</p>
        <h1>Production-ready repository scaffold</h1>
        <p className="lead">
          This baseline enables install, lint, type-check, test, build, and health verification in CI
          while preserving the project&apos;s modular-monolith direction.
        </p>
        <div className="status-grid">
          <div>
            <span>Status</span>
            <strong>{status.status}</strong>
          </div>
          <div>
            <span>Architecture</span>
            <strong>{status.architecture}</strong>
          </div>
          <div>
            <span>Default Locale</span>
            <strong>{status.defaultLocale}</strong>
          </div>
        </div>
      </section>

      <section className="content-card">
        <h2>Current validation surface</h2>
        <ul>
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
        <p className="footnote">Health endpoint: <code>/api/health</code></p>
      </section>
    </main>
  );
}
