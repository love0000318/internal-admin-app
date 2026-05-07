import { afterEach, describe, expect, it } from "vitest";

import {
  buildInvitationAcceptUrl,
  buildInviteUrl,
  getAppBaseUrl,
} from "@/lib/organization/invitations";

const originalAppBaseUrl = process.env.APP_BASE_URL;
const originalAppUrl = process.env.APP_URL;

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
    process.env.APP_URL = "https://stale-app-url.example";

    expect(
      getAppBaseUrl({
        requestOrigin:
          "https://internal-admin-app-love0000318s-projects.vercel.app/",
      }),
    ).toBe("https://internal-admin-app-love0000318s-projects.vercel.app");
  });
});
