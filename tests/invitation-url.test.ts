import { afterEach, describe, expect, it } from "vitest";

import {
  buildInvitationAcceptUrl,
  buildInviteUrl,
  getAppBaseUrl,
} from "@/lib/organization/invitations";

const originalAppBaseUrl = process.env.APP_BASE_URL;
const originalAppUrl = process.env.APP_URL;
const originalNextPublicAppBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL;
const originalVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
  if (originalAppBaseUrl === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = originalAppBaseUrl;
  }

  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }

  if (originalNextPublicAppBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_BASE_URL = originalNextPublicAppBaseUrl;
  }

  if (originalVercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

describe("invitation URL builders", () => {
  it("uses APP_BASE_URL for short invitation links", () => {
    process.env.APP_BASE_URL = "https://interal-admin-app.vercel.app/";

    expect(buildInviteUrl("abc")).toBe(
      "https://interal-admin-app.vercel.app/i/abc",
    );
  });

  it("uses APP_BASE_URL for long invitation accept links", () => {
    process.env.APP_BASE_URL = "https://interal-admin-app.vercel.app/";

    expect(buildInvitationAcceptUrl("raw token")).toBe(
      "https://interal-admin-app.vercel.app/invitations/accept?token=raw%20token",
    );
  });

  it("ignores request origin when APP_BASE_URL is configured", () => {
    process.env.APP_BASE_URL = "https://interal-admin-app.vercel.app";

    expect(
      buildInviteUrl("abc", {
        requestOrigin:
          "https://internal-admin-app-love0000318s-projects.vercel.app",
      }),
    ).toBe("https://interal-admin-app.vercel.app/i/abc");
  });

  it("falls back to request origin only when APP_BASE_URL is missing", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_BASE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.APP_URL = "https://stale-app-url.example";

    expect(
      getAppBaseUrl({
        requestOrigin:
          "https://internal-admin-app-love0000318s-projects.vercel.app/",
      }),
    ).toBe("https://internal-admin-app-love0000318s-projects.vercel.app");
  });

  it("falls back to the production Internal URL when production base URL is missing", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_BASE_URL;
    process.env.VERCEL_ENV = "production";

    expect(getAppBaseUrl()).toBe("https://interal-admin-app.vercel.app");
  });

  it("falls back to the production Internal URL when production base URL is invalid", () => {
    process.env.APP_BASE_URL = "not a url";
    delete process.env.NEXT_PUBLIC_APP_BASE_URL;
    process.env.VERCEL_ENV = "production";

    expect(buildInvitationAcceptUrl("raw token")).toBe(
      "https://interal-admin-app.vercel.app/invitations/accept?token=raw%20token",
    );
  });

  it("uses NEXT_PUBLIC_APP_BASE_URL when APP_BASE_URL is missing", () => {
    delete process.env.APP_BASE_URL;
    process.env.NEXT_PUBLIC_APP_BASE_URL = "https://interal-admin-app.vercel.app/";

    expect(buildInviteUrl("abc")).toBe(
      "https://interal-admin-app.vercel.app/i/abc",
    );
  });
});
