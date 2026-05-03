export function isSameOriginRequest(request: Request, appBaseUrl: string) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const expected = new URL(appBaseUrl).origin;

  if (origin) {
    return origin === expected;
  }

  if (referer) {
    return new URL(referer).origin === expected;
  }

  return process.env.NODE_ENV !== "production";
}

export function assertSameOriginRequest(request: Request, appBaseUrl: string) {
  if (!isSameOriginRequest(request, appBaseUrl)) {
    throw new Error("CSRF_BLOCKED");
  }
}
