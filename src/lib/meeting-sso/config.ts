import { exactOrigin, signingKey } from "./protocol.mjs";

export function meetingConfig() {
  if (process.env.MEETING_SSO_ENABLED !== "true") {
    throw new Error("disabled");
  }

  const clientId = process.env.MEETING_SSO_CLIENT_ID ?? "curinginnos-meeting";
  const secret = process.env.MEETING_SSO_CLIENT_SECRET ?? "";
  if (secret.length < 43 || secret.length > 256) {
    throw new Error("dedicated secret required");
  }

  const rollout = process.env.MEETING_SSO_ROLLOUT ?? "owner-only";
  if (!["owner-only", "pilot", "all-internal"].includes(rollout)) {
    throw new Error("invalid rollout");
  }

  return {
    clientId,
    secret,
    issuer: exactOrigin(process.env.OPS_PUBLIC_ORIGIN ?? ""),
    meeting: exactOrigin(process.env.MEETING_APP_ORIGIN ?? ""),
    keyId: process.env.MEETING_SSO_KEY_ID ?? "meeting-ops-1",
    privateKey: signingKey(process.env.MEETING_SSO_PRIVATE_KEY ?? ""),
    teamMap: JSON.parse(
      process.env.MEETING_SSO_TEAM_MAP_JSON ?? "{}",
    ) as Record<string, string[]>,
    pilotIds: JSON.parse(
      process.env.MEETING_SSO_PILOT_USER_IDS_JSON ?? "[]",
    ) as string[],
    rollout,
  };
}

export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
