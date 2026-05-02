import { basename } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import { encryptSensitiveText } from "../src/lib/hr/sensitive";
import {
  getCell,
  HR_MAIN_SHEET_NAME,
  mapMainEmployeeRow,
  normalizeImportDate,
  normalizeImportNumber,
  normalizeImportPhone,
  normalizeImportString,
  rowEmail,
} from "../src/lib/hr/mapping";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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

type XlsxModule = {
  readFile(path: string): { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json<T>(sheet: unknown, options?: Record<string, unknown>): T[];
  };
};

async function loadXlsx(): Promise<XlsxModule> {
  try {
    const xlsxModule = await import("xlsx");
    return ((xlsxModule as { default?: XlsxModule }).default ??
      xlsxModule) as XlsxModule;
  } catch {
    throw new Error(
      "xlsx package is required. Run `pnpm install` after package.json is updated.",
    );
  }
}

function assertSafeImportPath(path: string) {
  const normalized = path.replace(/\\/g, "/");

  if (!normalized.includes("private/imports/")) {
    throw new Error("Import file must be placed under private/imports.");
  }

  if (normalized.includes("/public/")) {
    throw new Error("Import file must not be placed under public.");
  }
}

function nonEmptyRows(rows: Record<string, unknown>[]) {
  return rows.filter((row) =>
    Object.values(row).some((value) => normalizeImportString(value) !== null),
  );
}

function findMainSheetName(sheetNames: string[]) {
  return (
    sheetNames.find((name) => name === HR_MAIN_SHEET_NAME) ??
    sheetNames.find((name) => name.includes("인사") && name.includes("개인")) ??
    sheetNames.find((name) => name === "HR_MAIN") ??
    null
  );
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error("Usage: pnpm hr:import private/imports/employee-master.xlsx");
  }

  assertSafeImportPath(filePath);

  const xlsx = await loadXlsx();
  const workbook = xlsx.readFile(filePath);
  const mainSheetName = findMainSheetName(workbook.SheetNames);
  const mainSheet = mainSheetName ? workbook.Sheets[mainSheetName] : null;

  if (!mainSheet) {
    throw new Error(`Required sheet not found: ${HR_MAIN_SHEET_NAME}`);
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const mainRows = nonEmptyRows(
    xlsx.utils.sheet_to_json<Record<string, unknown>>(mainSheet, { defval: "" }),
  );
  const batch = await prisma.employeeImportBatch.create({
    data: {
      fileName: basename(filePath),
      totalRows: mainRows.length,
      status: "PENDING",
    },
  });
  let successRows = 0;
  const errors: string[] = [];
  const profileIdsByEmail = new Map<string, string>();

  try {
    for (let index = 0; index < mainRows.length; index += 1) {
      const mapped = mapMainEmployeeRow(mainRows[index]);

      if (!mapped.companyEmail || !mapped.legalName) {
        errors.push(`row ${index + 2}: missing required email or name`);
        continue;
      }

      const profile = await prisma.employeePrejoinProfile.upsert({
        where: { companyEmail: mapped.companyEmail },
        create: {
          importBatchId: batch.id,
          employeeNumber: mapped.employeeNumber,
          legalName: mapped.legalName,
          displayName: mapped.displayName,
          companyEmail: mapped.companyEmail,
          personalEmail: mapped.personalEmail,
          phoneNumber: mapped.phoneNumber,
          employmentStatus: mapped.employmentStatus,
          title: mapped.title,
          position: mapped.position,
          jobGrade: mapped.jobGrade,
          teamName: mapped.teamName,
          teamCode: mapped.teamCode,
          hireDate: mapped.hireDate,
          groupHireDate: mapped.groupHireDate,
          birthDate: mapped.birthDate,
          englishName: mapped.englishName,
          legalGender: mapped.legalGender,
          phoneCountryCode: mapped.phoneCountryCode,
          nationalityCode: mapped.nationalityCode,
          residenceCountry: mapped.residenceCountry,
          visaStatus: mapped.visaStatus,
          address: mapped.address,
          postalCode: mapped.postalCode,
          residentIdEncrypted: encryptSensitiveText(mapped.residentId),
          bankCode: mapped.bankCode,
          bankName: mapped.bankName,
          bankAccountEncrypted: encryptSensitiveText(mapped.bankAccount),
          bankAccountHolder: mapped.bankAccountHolder,
          swiftCode: mapped.swiftCode,
          veteranOrDisabledStatus: mapped.veteranOrDisabledStatus,
          disabilityGrade: mapped.disabilityGrade,
        },
        update: {
          importBatchId: batch.id,
          employeeNumber: mapped.employeeNumber,
          legalName: mapped.legalName,
          displayName: mapped.displayName,
          personalEmail: mapped.personalEmail,
          phoneNumber: mapped.phoneNumber,
          employmentStatus: mapped.employmentStatus,
          title: mapped.title,
          position: mapped.position,
          jobGrade: mapped.jobGrade,
          teamName: mapped.teamName,
          teamCode: mapped.teamCode,
          hireDate: mapped.hireDate,
          groupHireDate: mapped.groupHireDate,
          birthDate: mapped.birthDate,
          englishName: mapped.englishName,
          legalGender: mapped.legalGender,
          phoneCountryCode: mapped.phoneCountryCode,
          nationalityCode: mapped.nationalityCode,
          residenceCountry: mapped.residenceCountry,
          visaStatus: mapped.visaStatus,
          address: mapped.address,
          postalCode: mapped.postalCode,
          residentIdEncrypted: encryptSensitiveText(mapped.residentId),
          bankCode: mapped.bankCode,
          bankName: mapped.bankName,
          bankAccountEncrypted: encryptSensitiveText(mapped.bankAccount),
          bankAccountHolder: mapped.bankAccountHolder,
          swiftCode: mapped.swiftCode,
          veteranOrDisabledStatus: mapped.veteranOrDisabledStatus,
          disabilityGrade: mapped.disabilityGrade,
          sourceStatus: "IMPORTED",
        },
      });

      profileIdsByEmail.set(mapped.companyEmail, profile.id);
      successRows += 1;
    }

    await importChildSheets({ prisma, xlsx, workbook, profileIdsByEmail });

    await prisma.employeeImportBatch.update({
      where: { id: batch.id },
      data: {
        successRows,
        failedRows: errors.length,
        status: errors.length > 0 ? "FAILED" : "COMPLETED",
        errorSummary: errors.slice(0, 20).join("\n") || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "EMPLOYEE_MASTER_IMPORTED",
        targetType: "EMPLOYEE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: {
          importBatchId: batch.id,
          fileName: basename(filePath),
          totalRows: mainRows.length,
          successRows,
          failedRows: errors.length,
        },
      },
    });

    console.log("Employee master import completed.");
    console.log(`Total rows: ${mainRows.length}`);
    console.log(`Success rows: ${successRows}`);
    console.log(`Failed rows: ${errors.length}`);
    console.log(`Prejoin profiles created or updated: ${successRows}`);
    console.log("Sensitive fields encrypted: yes");
  } finally {
    await prisma.$disconnect();
  }
}

async function importChildSheets({
  prisma,
  xlsx,
  workbook,
  profileIdsByEmail,
}: {
  prisma: PrismaClient;
  xlsx: XlsxModule;
  workbook: Awaited<ReturnType<XlsxModule["readFile"]>>;
  profileIdsByEmail: Map<string, string>;
}) {
  const rowsFor = (sheetName: string) =>
    workbook.Sheets[sheetName]
      ? nonEmptyRows(
          xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
            defval: "",
          }),
        )
      : [];

  for (const row of rowsFor("가족")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;
    const name = normalizeImportString(getCell(row, ["가족 이름", "이름"]));

    if (!prejoinProfileId || !name) continue;
    await prisma.familyMemberDraft.create({
      data: {
        prejoinProfileId,
        name,
        relationship: normalizeImportString(getCell(row, ["관계"])),
        phoneNumber: normalizeImportPhone(getCell(row, ["휴대전화번호", "전화번호"])),
        residentIdEncrypted: encryptSensitiveText(
          normalizeImportString(getCell(row, ["주민등록번호"])),
        ),
      },
    });
  }

  for (const row of rowsFor("경력")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;
    const companyName = normalizeImportString(getCell(row, ["회사명"]));

    if (!prejoinProfileId || !companyName) continue;
    await prisma.careerRecordDraft.create({
      data: {
        prejoinProfileId,
        companyName,
        contractType: normalizeImportString(getCell(row, ["계약유형"])),
        joinedMonth: normalizeImportString(getCell(row, ["입사 연월"])),
        leftMonth: normalizeImportString(getCell(row, ["퇴사 연월"])),
        job: normalizeImportString(getCell(row, ["직무"])),
        organization: normalizeImportString(getCell(row, ["조직"])),
        position: normalizeImportString(getCell(row, ["직위"])),
        title: normalizeImportString(getCell(row, ["직책"])),
      },
    });
  }

  for (const row of rowsFor("학력")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;

    if (!prejoinProfileId) continue;
    await prisma.educationRecordDraft.create({
      data: {
        prejoinProfileId,
        schoolType: normalizeImportString(getCell(row, ["학교구분", "학교 구분"])),
        schoolName: normalizeImportString(getCell(row, ["학교명"])),
        graduationStatus: normalizeImportString(getCell(row, ["졸업구분"])),
        major: normalizeImportString(getCell(row, ["전공"])),
        entranceMonth: normalizeImportString(getCell(row, ["입학 연월"])),
        graduationMonth: normalizeImportString(getCell(row, ["졸업 연월"])),
      },
    });
  }

  for (const row of rowsFor("언어")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;
    const language = normalizeImportString(getCell(row, ["언어"]));

    if (!prejoinProfileId || !language) continue;
    await prisma.languageSkillDraft.create({
      data: {
        prejoinProfileId,
        language,
        level: normalizeImportString(getCell(row, ["레벨"])),
      },
    });
  }

  for (const row of rowsFor("자격증")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;
    const name = normalizeImportString(getCell(row, ["이름", "자격증명"]));

    if (!prejoinProfileId || !name) continue;
    await prisma.certificateRecordDraft.create({
      data: {
        prejoinProfileId,
        name,
        gradeOrScore: normalizeImportString(getCell(row, ["등급 또는 점수", "등급"])),
        acquiredAt: normalizeImportDate(getCell(row, ["취득일"])),
        issuer: normalizeImportString(getCell(row, ["발급기관"])),
        validUntil: normalizeImportDate(getCell(row, ["유효기관", "유효기간"])),
        certificateNumber: normalizeImportString(getCell(row, ["발급번호"])),
      },
    });
  }

  for (const row of rowsFor("프로젝트·기술")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;

    if (!prejoinProfileId) continue;
    await prisma.projectSkillRecordDraft.create({
      data: {
        prejoinProfileId,
        title: normalizeImportString(getCell(row, ["제목"])),
        content: normalizeImportString(getCell(row, ["내용"])),
        period: normalizeImportString(getCell(row, ["기간"])),
        project: normalizeImportString(getCell(row, ["프로젝트"])),
        skills: normalizeImportString(getCell(row, ["기술"])),
      },
    });
  }

  for (const row of rowsFor("교육")) {
    const email = rowEmail(row);
    const prejoinProfileId = email ? profileIdsByEmail.get(email) : null;
    const name = normalizeImportString(getCell(row, ["교육 이름", "교육명"]));

    if (!prejoinProfileId || !name) continue;
    await prisma.trainingRecordDraft.create({
      data: {
        prejoinProfileId,
        name,
        trainingDate: normalizeImportDate(getCell(row, ["교육 일자", "교육일자"])),
        type: normalizeImportString(getCell(row, ["유형"])),
        institution: normalizeImportString(getCell(row, ["교육 기관", "교육기관"])),
        category: normalizeImportString(getCell(row, ["교육 구분", "교육구분"])),
        totalHours: normalizeImportNumber(getCell(row, ["총 교육 시간", "총교육시간"])),
      },
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Employee import failed.");
  process.exit(1);
});
