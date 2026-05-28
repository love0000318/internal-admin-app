type InvitationUrlOptions = {
  requestOrigin?: string | null;
};

export const DEFAULT_PRODUCTION_APP_BASE_URL =
  "https://interal-admin-app.vercel.app";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function getSafeBaseUrl(value: string | null | undefined) {
  const normalized = value ? normalizeBaseUrl(value) : "";

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function getAppBaseUrl(options: InvitationUrlOptions = {}) {
  const configuredBaseUrl =
    getSafeBaseUrl(process.env.APP_BASE_URL) ??
    getSafeBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL);

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (isProductionRuntime()) {
    return DEFAULT_PRODUCTION_APP_BASE_URL;
  }

  const requestOrigin = getSafeBaseUrl(options.requestOrigin);

  if (requestOrigin) {
    return requestOrigin;
  }

  return "http://localhost:3000";
}

export function buildInviteUrl(
  shortToken: string,
  options: InvitationUrlOptions = {},
) {
  return `${getAppBaseUrl(options)}/i/${encodeURIComponent(shortToken)}`;
}

export function buildInvitationAcceptUrl(
  token: string,
  options: InvitationUrlOptions = {},
) {
  return `${getAppBaseUrl(options)}/invitations/accept?token=${encodeURIComponent(token)}`;
}
