import { z } from "zod";

import type {
  LeaveGrantMethod,
  LeaveGrantStatus,
  LeaveGrantUnit,
  LeaveTypeDefinition,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dateOnlyToDate, todayInSeoul } from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";

export const GRANTABLE_LEAVE_METHODS = [
  "MANUAL",
  "RECURRING",
  "ON_TENURE",
] as const;

const grantableLeaveMethods: readonly LeaveGrantMethod[] = GRANTABLE_LEAVE_METHODS;

export type LeaveGrantLike = {
  grantedAmount: number;
  usedAmount: number;
  pendingAmount: number;
};

export function calculateLeaveGrantRemaining(grant: LeaveGrantLike) {
  return grant.grantedAmount - grant.usedAmount - grant.pendingAmount;
}

export function assertLeaveTypeGrantable(
  leaveType: Pick<
    LeaveTypeDefinition,
    "category" | "isEnabled" | "grantMethod" | "code"
  > | null,
) {
  if (!leaveType) {
    throw new Error("휴가 유형을 찾을 수 없습니다.");
  }

  if (leaveType.category !== "CUSTOM") {
    throw new Error("연차는 맞춤휴가 지급 화면에서 지급할 수 없습니다.");
  }

  if (!leaveType.isEnabled) {
    throw new Error("비활성화된 휴가 유형은 지급할 수 없습니다.");
  }

  if (!grantableLeaveMethods.includes(leaveType.grantMethod)) {
    throw new Error("직접 지급할 수 없는 휴가 유형입니다.");
  }
}

export function assertValidGrantAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("지급 수량은 0보다 커야 합니다.");
  }
}

export function assertValidGrantDates({
  effectiveFrom,
  expiresAt,
}: {
  effectiveFrom: DateOnly;
  expiresAt?: DateOnly | null;
}) {
  if (!effectiveFrom) {
    throw new Error("사용 시작일을 입력해 주세요.");
  }

  if (expiresAt && dateOnlyToDate(expiresAt).getTime() < dateOnlyToDate(effectiveFrom).getTime()) {
    throw new Error("만료일은 사용 시작일보다 빠를 수 없습니다.");
  }
}

export function assertGrantRevocable(grant: {
  status: LeaveGrantStatus;
  usedAmount: number;
  pendingAmount: number;
  remainingAmount: number;
}) {
  if (grant.status !== "ACTIVE") {
    throw new Error("활성 상태의 지급 내역만 회수할 수 있습니다.");
  }

  if (grant.usedAmount > 0 || grant.pendingAmount > 0) {
    throw new Error("이미 사용되었거나 승인 대기 중인 휴가가 있어 회수할 수 없습니다.");
  }

  if (grant.remainingAmount <= 0) {
    throw new Error("회수할 수 있는 잔여 수량이 없습니다.");
  }
}

export const leaveGrantFormSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  leaveTypeId: z.string().min(1),
  grantedAmount: z.coerce.number().positive(),
  unit: z.enum(["DAY", "HOUR", "MINUTE"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  reason: z.string().trim().min(1).max(1000),
});

export const revokeLeaveGrantSchema = z.object({
  grantId: z.string().min(1),
  revokeReason: z.string().trim().min(1).max(1000),
});

export async function listGrantableLeaveTypes(prisma: PrismaClient = getPrisma()) {
  return prisma.leaveTypeDefinition.findMany({
    where: {
      category: "CUSTOM",
      isEnabled: true,
      grantMethod: { in: [...GRANTABLE_LEAVE_METHODS] },
    },
    orderBy: { name: "asc" },
  });
}

export async function listUserActiveLeaveGrants(
  userId: string,
  prisma: PrismaClient = getPrisma(),
  today: DateOnly = todayInSeoul(),
) {
  const todayDate = dateOnlyToDate(today);

  return prisma.leaveGrant.findMany({
    where: {
      userId,
      status: "ACTIVE",
      remainingAmount: { gt: 0 },
      effectiveFrom: { lte: todayDate },
      OR: [{ expiresAt: null }, { expiresAt: { gte: todayDate } }],
    },
    include: { leaveType: true },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function listUserExpiredOrRevokedLeaveGrants(
  userId: string,
  prisma: PrismaClient = getPrisma(),
  today: DateOnly = todayInSeoul(),
) {
  const todayDate = dateOnlyToDate(today);

  return prisma.leaveGrant.findMany({
    where: {
      userId,
      OR: [
        { status: { in: ["REVOKED", "EXPIRED"] } },
        { status: "ACTIVE", expiresAt: { lt: todayDate } },
        { status: "ACTIVE", remainingAmount: { lte: 0 } },
      ],
    },
    include: { leaveType: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
}

export function buildLeaveGrantCreateData({
  userId,
  leaveTypeId,
  grantedAmount,
  unit,
  effectiveFrom,
  expiresAt,
  reason,
  grantedByUserId,
  source,
}: {
  userId: string;
  leaveTypeId: string;
  grantedAmount: number;
  unit: LeaveGrantUnit;
  effectiveFrom: DateOnly;
  expiresAt?: DateOnly | null;
  reason: string;
  grantedByUserId: string;
  source: "MANUAL" | "BULK_MANUAL";
}): Prisma.LeaveGrantCreateManyInput {
  return {
    userId,
    leaveTypeId,
    grantedAmount,
    usedAmount: 0,
    pendingAmount: 0,
    remainingAmount: grantedAmount,
    unit,
    status: "ACTIVE",
    effectiveFrom: dateOnlyToDate(effectiveFrom),
    expiresAt: expiresAt ? dateOnlyToDate(expiresAt) : null,
    reason,
    grantedByUserId,
    source,
  };
}
