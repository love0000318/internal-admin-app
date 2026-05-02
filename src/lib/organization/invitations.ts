export function buildInvitationUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, "")}/invitations/accept?token=${encodeURIComponent(token)}`;
}

export function buildShortInvitationUrl(baseUrl: string, shortToken: string) {
  return `${baseUrl.replace(/\/$/, "")}/i/${encodeURIComponent(shortToken)}`;
}

export function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}
