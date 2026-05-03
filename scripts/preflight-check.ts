import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "../src/generated/prisma/client";
import { MockIdentityVerificationProvider } from "../src/lib/auth/identity-verification-provider";
import {
  SECURITY_SECRET_ENV_KEYS,
  validateDistinctSecrets,
  validateSecretLength,
} from "../src/lib/security/env-validation";

type CheckResult = {
  ok: boolean;
  level?: "PASS" | "WARN" | "FAIL";
  name: string;
  detail?: string;
};

const requiredEnv = [
  "DATABASE_URL",
  "APP_BASE_URL",
  "APP_SECRET",
  "SESSION_SECRET",
  "TOKEN_SECRET",
  "INVITATION_TOKEN_SECRET",
  "ENCRYPTION_SECRET",
  "INVITATION_EXPIRES_IN_DAYS",
  "SESSION_EXPIRES_IN_DAYS",
  "SEED_OWNER_EMAIL",
  "SEED_OWNER_NAME",
  "SEED_OWNER_TITLE",
];

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

if (process.env.NODE_ENV === "production") {
  loadEnvFile(".env.production");
}

function pass(name: string, detail?: string): CheckResult {
  return { ok: true, level: "PASS", name, detail };
}

function warn(name: string, detail?: string): CheckResult {
  return { ok: true, level: "WARN", name, detail };
}

function fail(name: string, detail?: string): CheckResult {
  return { ok: false, level: "FAIL", name, detail };
}

function checkRequiredEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  return missing.length === 0
    ? pass("required env")
    : fail("required env", `missing: ${missing.join(", ")}`);
}

function checkSecretLength(name: string, required = true) {
  if (!process.env[name] && !required) {
    return warn(`${name} length`, "not set; fallback secret is used outside production");
  }

  const result = validateSecretLength(name, process.env[name]);
  return result.ok ? pass(`${name} length`) : fail(`${name} length`, result.detail);
}

function checkCronSecret() {
  const value = process.env.CRON_SECRET ?? "";

  if (!value && process.env.NODE_ENV === "production") {
    return fail("CRON_SECRET", "production cron endpoints require CRON_SECRET");
  }

  if (!value) {
    return warn("CRON_SECRET", "not set; cron endpoints should stay disabled");
  }

  return value.length >= 32
    ? pass("CRON_SECRET length")
    : fail("CRON_SECRET length", "use a secret with at least 32 characters");
}

function checkDistinctSecrets() {
  const result = validateDistinctSecrets(
    Object.fromEntries(
      SECURITY_SECRET_ENV_KEYS.map((key) => [key, process.env[key]]),
    ),
  );

  return result.ok
    ? pass("security secrets distinct")
    : fail("security secrets distinct", result.detail);
}

function checkNodeEnv() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  return ["development", "test", "production"].includes(nodeEnv)
    ? pass("NODE_ENV", nodeEnv)
    : fail("NODE_ENV", `${nodeEnv} is not allowed`);
}

function checkPackageScript(scriptName: string) {
  try {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    return packageJson.scripts?.[scriptName]
      ? pass(`package script ${scriptName}`)
      : warn(`package script ${scriptName}`, "not configured");
  } catch {
    return fail("package scripts", "package.json could not be read");
  }
}

function checkPositiveIntegerEnv(name: string, required = true) {
  const value = process.env[name];

  if (!value && !required) {
    return warn(name, "not set");
  }

  const parsed = Number.parseInt(value ?? "", 10);
  return value && Number.isFinite(parsed) && parsed > 0
    ? pass(`${name} value`, value)
    : fail(`${name} value`, "must be a positive integer");
}

function checkProductionUrl() {
  if (process.env.NODE_ENV !== "production") {
    return pass("production APP_BASE_URL", "checked in production");
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  return appBaseUrl.startsWith("https://")
    ? pass("production APP_BASE_URL")
    : fail("production APP_BASE_URL", "production must use https://");
}

function checkPrivateUploadDir() {
  const uploadDir = process.env.PRIVATE_UPLOAD_DIR ?? "private/uploads";
  const normalized = path.normalize(uploadDir).replace(/\\/g, "/");
  const resolved = path.resolve(uploadDir);
  const publicRoot = path.resolve("public");

  if (normalized === "public" || normalized.startsWith("public/")) {
    return fail("private upload dir", "upload dir must not be under public/");
  }

  if (resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`)) {
    return fail("private upload dir", "resolved upload dir must not be under public/");
  }

  if (!existsSync(resolved)) {
    return warn("private upload dir", `${normalized} does not exist yet`);
  }

  return pass("private upload dir", normalized);
}

function checkAttachmentStorage() {
  const storage = process.env.LEAVE_ATTACHMENT_STORAGE ?? "local";

  if (!["local"].includes(storage)) {
    return fail("LEAVE_ATTACHMENT_STORAGE", `${storage} is not supported by this build`);
  }

  if (process.env.NODE_ENV === "production" && storage === "local") {
    return warn("LEAVE_ATTACHMENT_STORAGE", "local storage needs operational backup controls");
  }

  return pass("LEAVE_ATTACHMENT_STORAGE", storage);
}

function checkProductionProviderConfig() {
  if (process.env.NODE_ENV !== "production") {
    return pass("production provider config", "checked in production");
  }

  const provider = process.env.IDENTITY_VERIFICATION_PROVIDER ?? "";
  return provider !== "mock"
    ? pass("production provider config", provider || "manual/empty")
    : fail("production provider config", "mock provider is not allowed in production");
}

function isEnvTrue(name: string) {
  return (process.env[name] ?? "").toLowerCase() === "true";
}

function checkExternalEmailConfig() {
  const enabled = isEnvTrue("EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED");
  const provider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();

  if (!enabled) {
    return warn("external email notifications", "disabled");
  }

  if (!provider) {
    return fail("external email notifications", "EMAIL_PROVIDER is required when enabled");
  }

  if (process.env.NODE_ENV === "production" && provider === "console") {
    return fail(
      "external email notifications",
      "EMAIL_PROVIDER=console is not allowed in production",
    );
  }

  if (provider === "console") {
    return pass("external email notifications", "console provider");
  }

  if (provider !== "resend") {
    return fail("external email notifications", `unsupported EMAIL_PROVIDER=${provider}`);
  }

  const missing = ["RESEND_API_KEY", "EMAIL_FROM"].filter((name) => !process.env[name]);

  return missing.length === 0
    ? pass("external email notifications", "resend provider configured")
    : fail("external email notifications", `missing: ${missing.join(", ")}`);
}

function checkSlackNotificationConfig() {
  const enabled = isEnvTrue("SLACK_NOTIFICATIONS_ENABLED");

  if (!enabled) {
    return warn("Slack notifications", "disabled");
  }

  return process.env.SLACK_WEBHOOK_URL
    ? pass("Slack notifications", "webhook configured")
    : fail("Slack notifications", "SLACK_WEBHOOK_URL is required when enabled");
}

async function checkProductionMockProviderBlocked() {
  if (process.env.NODE_ENV !== "production") {
    return pass("production mock identity flow", "checked in production");
  }

  const provider = new MockIdentityVerificationProvider();

  try {
    await provider.verify({
      name: "preflight",
      phoneNumber: "01000000000",
      verificationToken: "mock-verified",
    });
    return fail("production mock identity flow", "mock provider allowed verification");
  } catch {
    return pass("production mock identity flow");
  }
}

async function checkDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return [
      fail("database connection", "DATABASE_URL is missing"),
      fail("OWNER or pending OWNER invitation", "database unavailable"),
      fail("base LeavePolicy seed", "database unavailable"),
    ];
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;

    const [
      activeOwnerCount,
      pendingOwnerInviteCount,
      policyCount,
      leaveTypeDefinitionCount,
      annualPolicyCount,
      approvalPolicyCount,
      notificationCount,
      jobRunCount,
      leaveLedgerCount,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } }),
      prisma.invitation.count({ where: { role: "OWNER", status: "PENDING" } }),
      prisma.leavePolicy.count({
        where: {
          type: {
            in: ["ANNUAL", "HALF_DAY", "RESERVE_FORCES", "SICK", "BEREAVEMENT"],
          },
        },
      }),
      prisma.leaveTypeDefinition.count(),
      prisma.annualLeavePolicy.count(),
      prisma.approvalPolicy.count(),
      prisma.notification.count(),
      prisma.jobRun.count(),
      prisma.leaveLedger.count(),
    ]);

    return [
      pass("database connection"),
      activeOwnerCount > 0 || pendingOwnerInviteCount > 0
        ? pass("OWNER or pending OWNER invitation")
        : fail("OWNER or pending OWNER invitation", "run seed"),
      policyCount === 5
        ? pass("base LeavePolicy seed")
        : fail("base LeavePolicy seed", `found ${policyCount}/5`),
      leaveTypeDefinitionCount > 0
        ? pass("LeaveTypeDefinition seed", `${leaveTypeDefinitionCount}`)
        : fail("LeaveTypeDefinition seed", "run seed"),
      annualPolicyCount > 0
        ? pass("AnnualLeavePolicy seed", `${annualPolicyCount}`)
        : fail("AnnualLeavePolicy seed", "run seed"),
      approvalPolicyCount > 0
        ? pass("ApprovalPolicy seed", `${approvalPolicyCount}`)
        : fail("ApprovalPolicy seed", "run seed"),
      pass("Notification table access", `${notificationCount}`),
      pass("JobRun table access", `${jobRunCount}`),
      pass("LeaveLedger table access", `${leaveLedgerCount}`),
    ];
  } catch (error) {
    return [
      fail(
        "database connection",
        error instanceof Error ? error.message : "unknown database error",
      ),
      fail("OWNER or pending OWNER invitation", "database unavailable"),
      fail("base LeavePolicy seed", "database unavailable"),
    ];
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const results: CheckResult[] = [
    checkRequiredEnv(),
    checkNodeEnv(),
    checkSecretLength("APP_SECRET"),
    checkSecretLength("SESSION_SECRET"),
    checkSecretLength("TOKEN_SECRET"),
    checkSecretLength("INVITATION_TOKEN_SECRET"),
    checkSecretLength(
      "INVITATION_SHORT_TOKEN_SECRET",
      process.env.NODE_ENV === "production",
    ),
    checkSecretLength(
      "INVITATION_VERIFICATION_CODE_SECRET",
      process.env.NODE_ENV === "production",
    ),
    checkSecretLength("ENCRYPTION_SECRET"),
    checkCronSecret(),
    checkDistinctSecrets(),
    checkPackageScript("jobs:auto-confirm-past-start-leaves"),
    checkPositiveIntegerEnv("INVITATION_EXPIRES_IN_DAYS"),
    checkPositiveIntegerEnv(
      "INVITATION_VERIFICATION_CODE_EXPIRES_IN_DAYS",
      process.env.NODE_ENV === "production",
    ),
    checkPositiveIntegerEnv(
      "INVITATION_VERIFICATION_CODE_MAX_ATTEMPTS",
      process.env.NODE_ENV === "production",
    ),
    checkPositiveIntegerEnv(
      "INVITATION_VERIFICATION_CODE_LENGTH",
      process.env.NODE_ENV === "production",
    ),
    checkPositiveIntegerEnv("SESSION_EXPIRES_IN_DAYS"),
    checkPositiveIntegerEnv(
      "REMEMBER_ME_SESSION_EXPIRES_IN_DAYS",
      process.env.NODE_ENV === "production",
    ),
    checkPositiveIntegerEnv(
      "STEP_UP_EXPIRES_IN_MINUTES",
      process.env.NODE_ENV === "production",
    ),
    checkPositiveIntegerEnv(
      "STEP_UP_MAX_ATTEMPTS",
      process.env.NODE_ENV === "production",
    ),
    checkPositiveIntegerEnv("MAX_LEAVE_ATTACHMENT_SIZE_MB", false),
    checkAttachmentStorage(),
    checkPrivateUploadDir(),
    checkProductionUrl(),
    checkProductionProviderConfig(),
    checkExternalEmailConfig(),
    checkSlackNotificationConfig(),
    await checkProductionMockProviderBlocked(),
    ...(await checkDatabase()),
  ];

  for (const result of results) {
    const mark = result.level ?? (result.ok ? "PASS" : "FAIL");
    const detail = result.detail ? ` - ${result.detail}` : "";
    console.log(`[${mark}] ${result.name}${detail}`);
  }

  const failed = results.filter((result) => !result.ok);

  if (failed.length > 0) {
    console.error(`Preflight failed: ${failed.length} check(s) failed.`);
    process.exit(1);
  }

  console.log("Preflight passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
