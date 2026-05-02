export function isCronSecretConfigured() {
  return Boolean(process.env.CRON_SECRET);
}

export function assertCronRequestAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("cron-secret-required");
    }

    throw new Error("cron-disabled");
  }

  const headerSecret =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerSecret !== secret) {
    throw new Error("cron-unauthorized");
  }
}
