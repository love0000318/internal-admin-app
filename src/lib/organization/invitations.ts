type InvitationUrlOptions = {
  requestOrigin?: string | null;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function getAppBaseUrl(options: InvitationUrlOptions = {}) {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (options.requestOrigin) {
    return normalizeBaseUrl(options.requestOrigin);
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
