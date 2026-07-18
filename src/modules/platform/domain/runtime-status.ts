export type RuntimeStatus = {
  name: string;
  status: "ok";
  architecture: string;
  defaultLocale: string;
  summary: string;
  timestamp: string;
};

export function getRuntimeStatus(now: Date = new Date()): RuntimeStatus {
  return {
    name: "Okkhor",
    status: "ok",
    architecture: "modular-monolith",
    defaultLocale: "bn-BD",
    summary: "Research comprehension platform scaffold with Next.js App Router and TypeScript.",
    timestamp: now.toISOString(),
  };
}

export function getPlatformHighlights(): string[] {
  return [
    "Next.js App Router baseline for public production hardening",
    "Type-safe CI workflow with lint, tests, type-check, and build validation",
    "Bangla-first product direction aligned with South Asian infrastructure constraints",
  ];
}
