import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const criticalMessageFiles = [
  "src/app/(app)/leaves/actions.ts",
  "src/lib/leave/auto-confirm.ts",
  "src/lib/leave/birthday-half-day.ts",
  "src/lib/leave/labels.ts",
  "src/lib/external-notifications/templates.ts",
  "src/lib/notifications/leave-notifications.ts",
  "src/lib/organization/invitations.ts",
];

const mojibakePatterns = [
  /�/,
  /[利泥湲諛痍]/,
  /[占筌獄]/,
  /\?[가-힣]/,
];

describe("Korean operational messages", () => {
  it("keeps leave and invitation message sources free of legacy mojibake", () => {
    for (const file of criticalMessageFiles) {
      const source = readFileSync(file, "utf8");

      for (const pattern of mojibakePatterns) {
        expect(source, `${file} contains legacy mojibake`).not.toMatch(pattern);
      }
    }
  });
});
