import type {
  IdentityVerificationInput,
  IdentityVerificationProvider,
  IdentityVerificationResult,
} from "@/lib/auth/types";

export class MockIdentityVerificationProvider
  implements IdentityVerificationProvider
{
  async verify(
    input: IdentityVerificationInput,
  ): Promise<IdentityVerificationResult> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock identity verification is disabled in production.");
    }

    if (input.verificationToken !== "mock-verified") {
      throw new Error("Identity verification failed.");
    }

    return {
      verified: true,
      provider: "mock",
      verifiedName: input.name,
      verifiedPhoneNumber: input.phoneNumber,
      providerRef: `mock:${input.phoneNumber}`,
      verifiedAt: new Date(),
    };
  }
}

export function createIdentityVerificationProvider(): IdentityVerificationProvider {
  return new MockIdentityVerificationProvider();
}
