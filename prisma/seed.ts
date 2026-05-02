import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { createInvitationTokenPayload } from "../src/lib/auth/invitation-token";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const defaultLeavePolicies = [
  {
    type: "ANNUAL" as const,
    name: "연차",
    description: "일반 연차",
    deductsAnnual: true,
    deductsAnnualBalance: true,
    requiresAttachment: false,
    isEnabled: true,
    approvalRequired: true,
  },
  {
    type: "HALF_DAY" as const,
    name: "반차",
    description: "오전/오후 반차",
    deductsAnnual: true,
    deductsAnnualBalance: true,
    requiresAttachment: false,
    isEnabled: true,
    approvalRequired: true,
    maxDaysPerRequest: 0.5,
    minRequestDays: 0.5,
    maxRequestDays: 0.5,
  },
  {
    type: "RESERVE_FORCES" as const,
    name: "예비군",
    description: "예비군 휴가",
    deductsAnnual: false,
    deductsAnnualBalance: false,
    requiresAttachment: true,
    isEnabled: true,
    approvalRequired: true,
  },
  {
    type: "SICK" as const,
    name: "병가",
    description: "병가",
    deductsAnnual: false,
    deductsAnnualBalance: false,
    requiresAttachment: true,
    isEnabled: true,
    approvalRequired: true,
  },
  {
    type: "BEREAVEMENT" as const,
    name: "경조사",
    description: "경조사 휴가",
    deductsAnnual: false,
    deductsAnnualBalance: false,
    requiresAttachment: true,
    isEnabled: true,
    approvalRequired: true,
  },
];

const defaultLeaveTypeDefinitions = [
  {
    code: "ANNUAL",
    name: "연차",
    description: "법정 유급휴가입니다.",
    category: "ANNUAL" as const,
    isSystemRequired: true,
    isEnabled: true,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY",
    deductsAnnualBalance: true,
    attachmentPolicy: "NOT_REQUIRED" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "HALF_DAY",
    name: "반차",
    description: "오전 또는 오후 단위로 사용하는 연차입니다.",
    category: "ANNUAL" as const,
    isSystemRequired: true,
    isEnabled: true,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "HALF_DAY",
    deductsAnnualBalance: true,
    attachmentPolicy: "NOT_REQUIRED" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "RESERVE_FORCES",
    name: "예비군",
    description: "예비군 훈련 참석을 위한 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: true,
    isEnabled: true,
    isPaid: true,
    paidRate: 1,
    grantMethod: "ON_REQUEST" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY,HALF_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "REQUIRED_BEFORE_REQUEST" as const,
    attachmentDescription: "예비군 훈련 통지서 등 증명자료를 첨부해 주세요.",
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "SICK",
    name: "병가",
    description: "질병 또는 진료를 위한 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: true,
    isEnabled: true,
    isPaid: true,
    paidRate: 1,
    grantMethod: "ON_REQUEST" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY,HALF_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "REQUIRED_AFTER_REQUEST" as const,
    attachmentDescription: "필요 시 진단서 또는 진료 확인서를 제출해 주세요.",
    visibility: "PUBLIC_AS_LEAVE" as const,
  },
  {
    code: "BEREAVEMENT",
    name: "경조사",
    description: "경조사 발생 시 사용하는 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: true,
    isEnabled: true,
    isPaid: true,
    paidRate: 1,
    grantMethod: "ON_REQUEST" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "OPTIONAL" as const,
    attachmentDescription: "필요 시 관련 증빙자료를 제출해 주세요.",
    visibility: "PUBLIC_AS_LEAVE" as const,
  },
  {
    code: "REFRESH",
    name: "리프레시",
    description: "회사 정책에 따라 별도 지급할 수 있는 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: false,
    isEnabled: false,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY,HALF_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "NOT_REQUIRED" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "HEALTH_CHECKUP",
    name: "건강검진",
    description: "건강검진을 위해 별도 운영할 수 있는 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: false,
    isEnabled: false,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY,HALF_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "OPTIONAL" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "BIRTHDAY",
    name: "생일휴가",
    description: "생일 복지로 운영할 수 있는 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: false,
    isEnabled: false,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "USE_ALL_AT_ONCE" as const,
    allowedUnits: "FULL_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "NOT_REQUIRED" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "BIRTHDAY_HALF_DAY",
    name: "생일 반차",
    description: "직원의 생일에 사용할 수 있도록 자동 지급되는 반차입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: true,
    isEnabled: true,
    isPaid: true,
    paidRate: 1,
    grantMethod: "SYSTEM" as const,
    grantAmount: 0.5,
    grantUnit: "DAY" as const,
    usageMode: "USE_ALL_AT_ONCE" as const,
    allowedUnits: "HALF_DAY",
    unusedRemainderHandling: "EXPIRE_REMAINING" as const,
    deductsAnnualBalance: false,
    attachmentPolicy: "NOT_REQUIRED" as const,
    includeHolidayInDeduction: false,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "REWARD",
    name: "포상휴가",
    description: "성과 또는 기여에 따라 지급할 수 있는 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: false,
    isEnabled: false,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY,HALF_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "NOT_REQUIRED" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
  {
    code: "COMPENSATORY",
    name: "대체휴무",
    description: "별도 근무 보상으로 지급할 수 있는 맞춤휴가입니다.",
    category: "CUSTOM" as const,
    isSystemRequired: false,
    isEnabled: false,
    isPaid: true,
    paidRate: 1,
    grantMethod: "MANUAL" as const,
    grantUnit: "DAY" as const,
    usageMode: "SPLIT_ALLOWED" as const,
    allowedUnits: "FULL_DAY,HALF_DAY",
    deductsAnnualBalance: false,
    attachmentPolicy: "NOT_REQUIRED" as const,
    visibility: "PUBLIC_WITH_TYPE" as const,
  },
];

const defaultAnnualLeavePolicy = {
  isEnabled: true,
  grantBasis: "FISCAL_YEAR" as const,
  fiscalYearStartMonth: 1,
  fiscalYearStartDay: 1,
  usageUnit: "HALF_DAY" as const,
  allowAdvanceUse: false,
  approvalOnRequest: true,
  approvalOnCancel: false,
  monthlyLeaveEnabled: true,
  monthlyLeaveAmount: 1,
  monthlyLeaveGrantRule: "MONTHLY_FULL_ATTENDANCE" as const,
  firstFiscalYearGrantRule: "NEEDS_CONFIRMATION" as const,
  annualLeaveEnabled: true,
  baseAnnualDays: 15,
  maxAnnualDays: 25,
  additionalGrantEnabled: true,
  expirationEnabled: true,
  annualExpirationMonths: 12,
  monthlyExpirationMonths: 12,
  carryOverAllowed: false,
  promotionEnabled: true,
  memberReminderEnabled: true,
  managerReminderEnabled: false,
  usePlanReminderDaysBefore: 10,
  annualPromotionMonthsBeforeExpiration: 6,
  monthlyPromotionFirstMonthsBeforeExpiration: 3,
  monthlyPromotionSecondMonthsBeforeExpiration: 1,
  memo: "Current company policy defaults. First fiscal-year grant rule requires final confirmation before production use.",
};

async function seedDefaultLeavePolicies() {
  for (const policy of defaultLeavePolicies) {
    const existingPolicy = await prisma.leavePolicy.findUnique({
      where: { type: policy.type },
    });

    if (!existingPolicy) {
      await prisma.leavePolicy.create({ data: policy });
    }
  }
}

async function seedDefaultLeaveTypeDefinitions() {
  for (const leaveType of defaultLeaveTypeDefinitions) {
    await prisma.leaveTypeDefinition.upsert({
      where: { code: leaveType.code },
      update: {
        isSystemRequired: leaveType.isSystemRequired,
      },
      create: leaveType,
    });
  }
}

async function seedDefaultApprovalPolicies() {
  const defaultPolicy = await prisma.approvalPolicy.upsert({
    where: { code: "DEFAULT_TEAM_LEAD_OR_OWNER" },
    update: {
      name: "기본 휴가 승인 정책",
      description: "담당 리드 또는 OWNER가 휴가 요청을 승인합니다.",
      approvalMode: "SINGLE",
      approverRule: "TEAM_LEAD_OR_OWNER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoApproveIfNoApprover: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
    create: {
      code: "DEFAULT_TEAM_LEAD_OR_OWNER",
      name: "기본 휴가 승인 정책",
      description: "담당 리드 또는 OWNER가 휴가 요청을 승인합니다.",
      appliesTo: "LEAVE_REQUEST",
      approvalMode: "SINGLE",
      approverRule: "TEAM_LEAD_OR_OWNER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoApproveIfNoApprover: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
  });

  await prisma.approvalPolicy.upsert({
    where: { code: "OWNER_ONLY" },
    update: {
      name: "대표 승인",
      description: "OWNER만 휴가 요청을 승인합니다.",
      approvalMode: "SINGLE",
      approverRule: "OWNER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
    create: {
      code: "OWNER_ONLY",
      name: "대표 승인",
      description: "OWNER만 휴가 요청을 승인합니다.",
      appliesTo: "LEAVE_REQUEST",
      approvalMode: "SINGLE",
      approverRule: "OWNER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoApproveIfNoApprover: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
  });

  await prisma.approvalPolicy.upsert({
    where: { code: "AUTO_APPROVE" },
    update: {
      name: "자동 승인",
      description: "요청 생성 즉시 자동 승인합니다.",
      approvalMode: "NONE",
      approverRule: "OWNER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
    create: {
      code: "AUTO_APPROVE",
      name: "자동 승인",
      description: "요청 생성 즉시 자동 승인합니다.",
      appliesTo: "LEAVE_REQUEST",
      approvalMode: "NONE",
      approverRule: "OWNER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoApproveIfNoApprover: true,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
  });

  await prisma.approvalPolicy.upsert({
    where: { code: "CUSTOM_USER_APPROVAL" },
    update: {
      name: "지정 승인자 승인",
      description: "선택한 지정 승인자 또는 OWNER가 승인합니다.",
      approvalMode: "SINGLE",
      approverRule: "CUSTOM_USER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
    create: {
      code: "CUSTOM_USER_APPROVAL",
      name: "지정 승인자 승인",
      description: "선택한 지정 승인자 또는 OWNER가 승인합니다.",
      appliesTo: "LEAVE_REQUEST",
      approvalMode: "SINGLE",
      approverRule: "CUSTOM_USER",
      requireCommentOnReject: true,
      requireCommentOnCancel: true,
      requireAttachmentAcceptedBeforeApproval: false,
      autoApproveIfNoApprover: false,
      autoConfirmWhenStartDatePassed: true,
      autoConfirmTiming: "ON_START_DATE",
      isEnabled: true,
    },
  });

  await prisma.leaveTypeDefinition.updateMany({
    where: {
      code: { in: defaultLeaveTypeDefinitions.map((leaveType) => leaveType.code) },
      approvalPolicyId: null,
    },
    data: { approvalPolicyId: defaultPolicy.id },
  });
}

async function seedDefaultAnnualLeavePolicy() {
  const existingPolicy = await prisma.annualLeavePolicy.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existingPolicy) {
    return;
  }

  await prisma.annualLeavePolicy.create({
    data: defaultAnnualLeavePolicy,
  });
}

async function seedBirthdayLeavePolicy() {
  const birthdayHalfDay = await prisma.leaveTypeDefinition.findUnique({
    where: { code: "BIRTHDAY_HALF_DAY" },
  });

  if (!birthdayHalfDay) {
    return;
  }

  const existingPolicy = await prisma.birthdayLeavePolicy.findFirst({
    where: { leaveTypeId: birthdayHalfDay.id },
  });

  if (existingPolicy) {
    return;
  }

  await prisma.birthdayLeavePolicy.create({
    data: {
      isEnabled: true,
      leaveTypeId: birthdayHalfDay.id,
      grantAmount: 0.5,
      grantUnit: "DAY",
      grantDaysBefore: 1,
      usableDaysFromBirthday: 7,
      adjustGrantDateToPreviousBusinessDay: true,
      notifyEmployee: true,
    },
  });
}

async function main() {
  const appBaseUrl =
    process.env.APP_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerName = process.env.SEED_OWNER_NAME;
  const ownerTitle = process.env.SEED_OWNER_TITLE ?? "대표";

  if (!ownerEmail || !ownerName) {
    throw new Error("SEED_OWNER_EMAIL and SEED_OWNER_NAME are required.");
  }

  await seedDefaultLeavePolicies();
  await seedDefaultLeaveTypeDefinitions();
  await seedDefaultApprovalPolicies();
  await seedDefaultAnnualLeavePolicy();
  await seedBirthdayLeavePolicy();

  const existingOwnerInvite = await prisma.invitation.findFirst({
    where: {
      email: ownerEmail,
      role: "OWNER",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingOwnerInvite) {
    console.log("OWNER invitation already exists. No duplicate was created.");
    console.log(
      "Raw invite tokens are never stored, so the existing token cannot be printed again.",
    );
    console.log("Default leave policies and leave type definitions were checked.");
    return;
  }

  const { rawToken, tokenHash, expiresAt } = createInvitationTokenPayload();

  const invitation = await prisma.invitation.create({
    data: {
      email: ownerEmail,
      name: ownerName,
      expectedName: ownerName,
      role: "OWNER",
      title: ownerTitle,
      jobTitle: ownerTitle,
      tokenHash,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "INVITATION_CREATED",
      targetType: "INVITATION",
      targetId: invitation.id,
      afterJson: {
        seeded: true,
        role: "OWNER",
        email: ownerEmail,
        expectedName: ownerName,
      },
    },
  });

  console.log("========================================");
  console.log("Owner invitation URL");
  console.log(`${appBaseUrl}/invitations/accept?token=${rawToken}`);
  console.log("========================================");
  console.log("이 링크로 접속해 대표 계정을 생성하세요.");
  console.log("가입이 완료되면 이 링크는 다시 사용할 수 없습니다.");
  console.log("초대 token 원문은 지금 한 번만 표시되며 DB에는 hash만 저장됩니다.");
  console.log("기본 휴가 정책과 휴가 유형 정의도 함께 준비되었습니다.");
  console.log("TODO: 실제 이메일 발송 연동은 2차 이후 개발에서 처리합니다.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
