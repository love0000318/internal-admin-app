import {
  createInvitationToken,
  hashInvitationToken,
} from "@/lib/auth/invitation-token";

export { createInvitationToken };

export function hashToken(token: string, purpose: "invite") {
  if (purpose !== "invite") {
    throw new Error("Unsupported token purpose.");
  }

  return hashInvitationToken(token);
}
