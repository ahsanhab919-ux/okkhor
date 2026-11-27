export function resolveSafeNextPath(nextPath?: string | null, fallback = "/community") {
  const candidate = nextPath?.trim();

  if (!candidate) {
    return fallback;
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/auth")) {
    return fallback;
  }

  return candidate;
}
