import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { createUniqueInvitationShortTokenPayload } from "../src/lib/auth/invitation-short-token";
import { createInvitationTokenPayload } from "../src/lib/auth/invitation-token";
import { createInvitationVerificationCodePayload } from "../src/lib/auth/invitation-verification-code";
import { maskEmail } from "../src/lib/security/masking";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const appBaseUrl =
    process.env.APP_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerName = process.env.SEED_OWNER_NAME;
  const ownerTitle = process.env.SEED_OWNER_TITLE ?? "Owner";

  if (!ownerEmail || !ownerName) {
    throw new Error("SEED_OWNER_EMAIL and SEED_OWNER_NAME are required.");
  }

  const activeOwner = await prisma.user.findFirst({
    where: {
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  if (activeOwner) {
    throw new Error("ACTIVE OWNER already exists. Owner invitation reissue is blocked.");
  }

  const { rawToken, tokenHash, expiresAt } = createInvitationTokenPayload();
  const shortToken = await createUniqueInvitationShortTokenPayload();
  const verificationCode = createInvitationVerificationCodePayload();

  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: {
        role: "OWNER",
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        verificationCodeRevokedAt: new Date(),
        shortTokenRevokedAt: new Date(),
      },
    });

    return tx.invitation.create({
      data: {
        email: ownerEmail,
        name: ownerName,
        expectedName: ownerName,
        role: "OWNER",
        title: ownerTitle,
        jobTitle: ownerTitle,
        tokenHash,
        shortTokenHash: shortToken.shortTokenHash,
        shortTokenExpiresAt: shortToken.expiresAt,
        expiresAt,
        verificationCodeHash: verificationCode.codeHash,
        verificationCodeExpiresAt: verificationCode.expiresAt,
        verificationCodeMaxAttempts: verificationCode.maxAttempts,
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      action: "OWNER_INVITATION_REISSUED_WITH_VERIFICATION_CODE",
      targetType: "INVITATION",
      targetId: invitation.id,
      metadata: {
        invitationId: invitation.id,
        targetEmailMasked: maskEmail(ownerEmail),
        role: "OWNER",
        expiresAt: verificationCode.expiresAt,
        status: "ISSUED",
      },
    },
  });

  console.log("========================================");
  console.log("Owner invitation short URL");
  console.log(`${appBaseUrl}/i/${shortToken.rawShortToken}`);
  console.log("Owner invitation URL");
  console.log(`${appBaseUrl}/invitations/accept?token=${rawToken}`);
  console.log("Owner invitation verification code");
  console.log(verificationCode.rawCode);
  console.log("========================================");
  console.log("This verification code is shown only once.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
