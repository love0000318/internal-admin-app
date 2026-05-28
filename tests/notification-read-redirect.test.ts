import { describe, expect, it, vi } from "vitest";

import {
  markNotificationAsRead,
  normalizeNotificationRedirectPath,
} from "@/lib/notifications/notifications";

function prismaMock(notification: {
  id: string;
  linkUrl: string | null;
  metadata?: unknown;
  readAt: Date | null;
} | null) {
  return {
    notification: {
      findFirst: vi.fn(async () => notification),
      updateMany: vi.fn(async () => ({ count: notification?.readAt ? 0 : 1 })),
    },
    annualLeavePromotionNotice: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("notification read and redirect safety", () => {
  it("marks an unread owned notification and returns its safe link", async () => {
    const prisma = prismaMock({
      id: "notification-1",
      linkUrl: "/leaves/approvals/request-1",
      metadata: {
        annualLeavePromotionNoticeId: "annual-notice-1",
      },
      readAt: null,
    });

    const result = await markNotificationAsRead("user-1", "notification-1", prisma as never);

    expect(result.count).toBe(1);
    expect(result.wasUpdated).toBe(true);
    expect(result.notification?.linkUrl).toBe("/leaves/approvals/request-1");
    expect(prisma.notification.updateMany).toHaveBeenCalledOnce();
    expect(prisma.annualLeavePromotionNotice.updateMany).toHaveBeenCalledOnce();
  });

  it("treats already-read owned notifications as successful", async () => {
    const prisma = prismaMock({
      id: "notification-1",
      linkUrl: "/leaves/approvals/request-1",
      readAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const result = await markNotificationAsRead("user-1", "notification-1", prisma as never);

    expect(result.count).toBe(1);
    expect(result.wasUpdated).toBe(false);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("does not mark notifications that do not belong to the user", async () => {
    const prisma = prismaMock(null);

    const result = await markNotificationAsRead("user-1", "notification-1", prisma as never);

    expect(result.count).toBe(0);
    expect(result.notification).toBeNull();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("allows only local redirect paths", () => {
    expect(normalizeNotificationRedirectPath("/leaves/approvals/request-1")).toBe(
      "/leaves/approvals/request-1",
    );
    expect(normalizeNotificationRedirectPath("/admin/jobs/job-1?tab=result")).toBe(
      "/admin/jobs/job-1?tab=result",
    );
    expect(normalizeNotificationRedirectPath("https://example.com")).toBeNull();
    expect(normalizeNotificationRedirectPath("//example.com/path")).toBeNull();
    expect(normalizeNotificationRedirectPath("/\\example.com")).toBeNull();
  });
});
