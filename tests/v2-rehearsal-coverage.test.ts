import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function exists(relativePath: string) {
  return existsSync(path.join(root, relativePath));
}

describe("v2 rehearsal coverage", () => {
  it("keeps critical v2 operation scripts wired in package.json", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["hr:import"]).toContain("import-employee-master");
    expect(packageJson.scripts["leave:ledger:validate"]).toContain(
      "validate-leave-ledger",
    );
    expect(packageJson.scripts["jobs:birthday-half-day-grants"]).toContain(
      "grant-birthday-half-days",
    );
    expect(packageJson.scripts["jobs:schedule-annual-promotion-notices"]).toContain(
      "schedule-annual-leave-promotion-notices",
    );
    expect(packageJson.scripts["jobs:expire-annual-leaves"]).toContain(
      "expire-annual-leaves",
    );
    expect(packageJson.scripts["jobs:fix-fiscal-year-leave-expirations"]).toContain(
      "fix-fiscal-year-leave-expirations",
    );
    expect(packageJson.scripts.preflight).toContain("preflight-check");
  });

  it("keeps key v2 protected routes present", () => {
    [
      "src/app/(app)/profile/page.tsx",
      "src/app/(app)/admin/profile-change-requests/page.tsx",
      "src/app/(app)/admin/leaves/types/page.tsx",
      "src/app/(app)/admin/leaves/grants/page.tsx",
      "src/app/(app)/admin/leaves/annual-policy/page.tsx",
      "src/app/(app)/admin/leaves/promotions/page.tsx",
      "src/app/(app)/admin/leaves/approval-policies/page.tsx",
      "src/app/(app)/leaves/calendar/page.tsx",
      "src/app/(app)/admin/reports/page.tsx",
      "src/app/(app)/notifications/page.tsx",
      "src/app/(app)/admin/jobs/page.tsx",
      "src/app/api/leave-attachments/[attachmentId]/download/route.ts",
    ].forEach((routePath) => {
      expect(exists(routePath), routePath).toBe(true);
    });
  });

  it("documents the second-phase smoke rehearsal sections", () => {
    const smoke = readFileSync(path.join(root, "docs/smoke-test.md"), "utf8");

    [
      "환경 준비",
      "OWNER 가입과 기본 운영",
      "HR Import와 온보딩",
      "맞춤휴가 지급과 요청",
      "LeaveLedger",
      "연차 정책·촉진·소멸",
      "증명자료",
      "휴가 승인 정책",
      "휴가 캘린더",
      "관리자 리포트와 CSV",
      "알림센터와 Job",
      "보안·권한",
    ].forEach((section) => {
      expect(smoke).toContain(section);
    });
  });
});
