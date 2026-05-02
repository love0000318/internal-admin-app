import { describe, expect, it } from "vitest";

import { redactAuditValue, stringifyRedactedAuditValue } from "@/lib/audit/redact";
import {
  leaveRequestStatusLabel,
  leaveTypeLabel,
  roleLabel,
  userStatusLabel,
} from "@/lib/display/labels";
import { formatDate, formatDateTime, formatLeaveDays } from "@/lib/display/format";
import { formatTenureDays } from "@/lib/organization/tenure";
import { canAccessRoute } from "@/lib/rbac/server-guards";
import type { RbacUser } from "@/lib/rbac/roles";

describe("display helpers", () => {
  it("renders core enum labels in Korean", () => {
    expect(roleLabel("OWNER")).toBe("총괄 관리자");
    expect(roleLabel("LEAD")).toBe("중간 관리자");
    expect(userStatusLabel("ACTIVE")).toBe("활성");
    expect(leaveTypeLabel("HALF_DAY")).toBe("반차");
    expect(leaveRequestStatusLabel("PENDING")).toBe("승인 대기");
  });

  it("formats dates and leave days for UI", () => {
    expect(formatLeaveDays(1.5)).toBe("1.5일");
    expect(formatLeaveDays(2)).toBe("2일");
    expect(formatTenureDays(1)).toBe("1일차");
    expect(formatDate(new Date("2026-05-01T00:00:00.000+09:00"))).toContain(
      "2026",
    );
    expect(formatDateTime(new Date("2026-05-01T09:30:00.000+09:00"))).toContain(
      "2026",
    );
  });
});

describe("audit log display safety", () => {
  it("redacts sensitive metadata fields recursively", () => {
    const redacted = redactAuditValue({
      tokenHash: "secret-token-hash",
      passwordHash: "secret-password-hash",
      nested: {
        sessionToken: "raw-session-token",
        safe: "visible",
      },
    });

    expect(redacted).toEqual({
      tokenHash: "[민감정보 숨김]",
      passwordHash: "[민감정보 숨김]",
      nested: {
        sessionToken: "[민감정보 숨김]",
        safe: "visible",
      },
    });
    expect(stringifyRedactedAuditValue(redacted)).not.toContain("secret");
  });
});

describe("route permissions", () => {
  const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
  const lead: RbacUser = { id: "lead", role: "LEAD", status: "ACTIVE" };
  const manager: RbacUser = {
    id: "manager",
    role: "MANAGER",
    status: "ACTIVE",
  };

  it("keeps final MVP route permission mapping", () => {
    expect(canAccessRoute(owner, "/dashboard")).toBe(true);
    expect(canAccessRoute(manager, "/organization")).toBe(false);
    expect(canAccessRoute(lead, "/admin/leaves/settings")).toBe(false);
    expect(canAccessRoute(owner, "/organization")).toBe(true);
    expect(canAccessRoute(owner, "/admin/audit-logs")).toBe(true);
    expect(canAccessRoute(manager, "/leaves/approvals")).toBe(false);
    expect(canAccessRoute(lead, "/leaves/approvals")).toBe(true);
    expect(canAccessRoute(manager, "/profile")).toBe(true);
    expect(canAccessRoute(owner, "/admin/profile-change-requests")).toBe(true);
  });
});
