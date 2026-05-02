-- CreateEnum
CREATE TYPE "EmployeeImportBatchStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmployeePrejoinProfileStatus" AS ENUM ('IMPORTED', 'INVITED', 'CLAIMED', 'IGNORED');

-- CreateEnum
CREATE TYPE "EmployeeProfileSection" AS ENUM ('BASIC', 'PRIVATE', 'BANK', 'FAMILY', 'CAREER', 'EDUCATION', 'LANGUAGE', 'CERTIFICATE', 'PROJECT_SKILL', 'TRAINING', 'CONTRACT', 'COMPENSATION');

-- CreateEnum
CREATE TYPE "ProfileChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_MASTER_IMPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PREJOIN_PROFILE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PREJOIN_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PREJOIN_PROFILE_LINKED_TO_INVITATION';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_CREATED_FROM_IMPORT';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_UPDATED_BY_SELF';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_UPDATED_BY_OWNER';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_CHANGE_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_CHANGE_REQUEST_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_PROFILE_CHANGE_REQUEST_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'SENSITIVE_FIELD_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'SENSITIVE_FIELD_UPDATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'EMPLOYEE_IMPORT_BATCH';
ALTER TYPE "AuditTargetType" ADD VALUE 'EMPLOYEE_PREJOIN_PROFILE';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROFILE_CHANGE_REQUEST';

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "englishName" TEXT,
ADD COLUMN     "lastConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "legalGender" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "nationalityCode" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "phoneCountryCode" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "profileCompletedAt" TIMESTAMP(3),
ADD COLUMN     "residenceCountry" TEXT,
ADD COLUMN     "visaStatus" TEXT;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "employeePrejoinProfileId" TEXT;

-- CreateTable
CREATE TABLE "EmployeeImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedByUserId" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "status" "EmployeeImportBatchStatus" NOT NULL DEFAULT 'PENDING',
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePrejoinProfile" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT,
    "employeeNumber" TEXT,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT,
    "companyEmail" TEXT NOT NULL,
    "personalEmail" TEXT,
    "phoneNumber" TEXT,
    "employmentStatus" TEXT,
    "title" TEXT,
    "position" TEXT,
    "jobGrade" TEXT,
    "roleSuggestion" "Role",
    "teamName" TEXT,
    "teamCode" TEXT,
    "hireDate" DATE,
    "groupHireDate" DATE,
    "birthDate" DATE,
    "englishName" TEXT,
    "legalGender" TEXT,
    "phoneCountryCode" TEXT,
    "nationalityCode" TEXT,
    "residenceCountry" TEXT,
    "visaStatus" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "residentIdEncrypted" TEXT,
    "bankCode" TEXT,
    "bankName" TEXT,
    "bankAccountEncrypted" TEXT,
    "bankAccountHolder" TEXT,
    "swiftCode" TEXT,
    "veteranOrDisabledStatus" TEXT,
    "disabilityGrade" TEXT,
    "sourceStatus" "EmployeePrejoinProfileStatus" NOT NULL DEFAULT 'IMPORTED',
    "linkedUserId" TEXT,
    "linkedInvitationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePrejoinProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSensitiveProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "residentIdEncrypted" TEXT,
    "bankCode" TEXT,
    "bankName" TEXT,
    "bankAccountEncrypted" TEXT,
    "bankAccountHolder" TEXT,
    "swiftCode" TEXT,
    "veteranOrDisabledStatus" TEXT,
    "disabilityGrade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSensitiveProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hireDate" DATE,
    "groupHireDate" DATE,
    "hireType" TEXT,
    "primaryJob" TEXT,
    "additionalJob" TEXT,
    "jobGroup" TEXT,
    "organizationName" TEXT,
    "organizationCode" TEXT,
    "isPrimaryOrganization" BOOLEAN,
    "isOrganizationLeader" BOOLEAN,
    "jobTitle" TEXT,
    "position" TEXT,
    "jobGrade" TEXT,
    "lastPositionChangedAt" DATE,
    "retirementDate" DATE,
    "employmentInsuranceLossReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContractProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractType" TEXT,
    "contractStartDate" DATE,
    "contractEndDate" DATE,
    "probationStartDate" DATE,
    "probationEndDate" DATE,
    "probationPayRate" DOUBLE PRECISION,
    "changeMemo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentContractProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeType" TEXT,
    "wageContractStartDate" DATE,
    "wageContractEndDate" DATE,
    "paymentType" TEXT,
    "contractAmount" DOUBLE PRECISION,
    "inclusiveWageContract" BOOLEAN,
    "inclusiveWageBasis" TEXT,
    "ordinaryHourlyWage" DOUBLE PRECISION,
    "appliedAt" DATE,
    "baseMonthlyPay" DOUBLE PRECISION,
    "baseHourlyPay" DOUBLE PRECISION,
    "fixedOvertimePay" DOUBLE PRECISION,
    "mealAllowance" DOUBLE PRECISION,
    "vehicleAllowance" DOUBLE PRECISION,
    "childcareAllowance" DOUBLE PRECISION,
    "researchAllowance" DOUBLE PRECISION,
    "changeMemo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phoneNumber" TEXT,
    "residentIdEncrypted" TEXT,
    "basicDeduction" BOOLEAN,
    "incomeDeductionRelationCode" TEXT,
    "childTaxCredit" BOOLEAN,
    "healthInsuranceDependent" BOOLEAN,
    "dependentRelationCode" TEXT,
    "veteranOrDisabledStatus" TEXT,
    "disabilityGrade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contractType" TEXT,
    "joinedMonth" TEXT,
    "leftMonth" TEXT,
    "job" TEXT,
    "organization" TEXT,
    "position" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducationRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolType" TEXT,
    "schoolName" TEXT,
    "graduationStatus" TEXT,
    "major" TEXT,
    "entranceMonth" TEXT,
    "graduationMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguageSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanguageSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeOrScore" TEXT,
    "acquiredAt" DATE,
    "issuer" TEXT,
    "validUntil" DATE,
    "certificateNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSkillRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "period" TEXT,
    "project" TEXT,
    "skills" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSkillRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trainingDate" DATE,
    "type" TEXT,
    "institution" TEXT,
    "category" TEXT,
    "totalHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProfileChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "EmployeeProfileSection" NOT NULL,
    "status" "ProfileChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedChanges" JSONB NOT NULL,
    "beforeSnapshot" JSONB,
    "reviewComment" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "EmployeeProfileChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMemberDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phoneNumber" TEXT,
    "residentIdEncrypted" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMemberDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerRecordDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contractType" TEXT,
    "joinedMonth" TEXT,
    "leftMonth" TEXT,
    "job" TEXT,
    "organization" TEXT,
    "position" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerRecordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducationRecordDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "schoolType" TEXT,
    "schoolName" TEXT,
    "graduationStatus" TEXT,
    "major" TEXT,
    "entranceMonth" TEXT,
    "graduationMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EducationRecordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguageSkillDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LanguageSkillDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRecordDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeOrScore" TEXT,
    "acquiredAt" DATE,
    "issuer" TEXT,
    "validUntil" DATE,
    "certificateNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateRecordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSkillRecordDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "period" TEXT,
    "project" TEXT,
    "skills" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSkillRecordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecordDraft" (
    "id" TEXT NOT NULL,
    "prejoinProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trainingDate" DATE,
    "type" TEXT,
    "institution" TEXT,
    "category" TEXT,
    "totalHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeImportBatch_status_idx" ON "EmployeeImportBatch"("status");

-- CreateIndex
CREATE INDEX "EmployeeImportBatch_createdAt_idx" ON "EmployeeImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "EmployeePrejoinProfile_employeeNumber_idx" ON "EmployeePrejoinProfile"("employeeNumber");

-- CreateIndex
CREATE INDEX "EmployeePrejoinProfile_sourceStatus_idx" ON "EmployeePrejoinProfile"("sourceStatus");

-- CreateIndex
CREATE INDEX "EmployeePrejoinProfile_linkedUserId_idx" ON "EmployeePrejoinProfile"("linkedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePrejoinProfile_companyEmail_key" ON "EmployeePrejoinProfile"("companyEmail");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSensitiveProfile_userId_key" ON "EmployeeSensitiveProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentProfile_userId_key" ON "EmploymentProfile"("userId");

-- CreateIndex
CREATE INDEX "EmploymentContractProfile_userId_idx" ON "EmploymentContractProfile"("userId");

-- CreateIndex
CREATE INDEX "CompensationProfile_userId_idx" ON "CompensationProfile"("userId");

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- CreateIndex
CREATE INDEX "CareerRecord_userId_idx" ON "CareerRecord"("userId");

-- CreateIndex
CREATE INDEX "EducationRecord_userId_idx" ON "EducationRecord"("userId");

-- CreateIndex
CREATE INDEX "LanguageSkill_userId_idx" ON "LanguageSkill"("userId");

-- CreateIndex
CREATE INDEX "CertificateRecord_userId_idx" ON "CertificateRecord"("userId");

-- CreateIndex
CREATE INDEX "ProjectSkillRecord_userId_idx" ON "ProjectSkillRecord"("userId");

-- CreateIndex
CREATE INDEX "TrainingRecord_userId_idx" ON "TrainingRecord"("userId");

-- CreateIndex
CREATE INDEX "EmployeeProfileChangeRequest_userId_idx" ON "EmployeeProfileChangeRequest"("userId");

-- CreateIndex
CREATE INDEX "EmployeeProfileChangeRequest_status_idx" ON "EmployeeProfileChangeRequest"("status");

-- CreateIndex
CREATE INDEX "EmployeeProfileChangeRequest_section_idx" ON "EmployeeProfileChangeRequest"("section");

-- CreateIndex
CREATE INDEX "FamilyMemberDraft_prejoinProfileId_idx" ON "FamilyMemberDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "CareerRecordDraft_prejoinProfileId_idx" ON "CareerRecordDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "EducationRecordDraft_prejoinProfileId_idx" ON "EducationRecordDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "LanguageSkillDraft_prejoinProfileId_idx" ON "LanguageSkillDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "CertificateRecordDraft_prejoinProfileId_idx" ON "CertificateRecordDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "ProjectSkillRecordDraft_prejoinProfileId_idx" ON "ProjectSkillRecordDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "TrainingRecordDraft_prejoinProfileId_idx" ON "TrainingRecordDraft"("prejoinProfileId");

-- CreateIndex
CREATE INDEX "EmployeeProfile_employeeNumber_idx" ON "EmployeeProfile"("employeeNumber");

-- CreateIndex
CREATE INDEX "Invitation_employeePrejoinProfileId_idx" ON "Invitation"("employeePrejoinProfileId");

-- AddForeignKey
ALTER TABLE "EmployeeImportBatch" ADD CONSTRAINT "EmployeeImportBatch_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePrejoinProfile" ADD CONSTRAINT "EmployeePrejoinProfile_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "EmployeeImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePrejoinProfile" ADD CONSTRAINT "EmployeePrejoinProfile_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_employeePrejoinProfileId_fkey" FOREIGN KEY ("employeePrejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSensitiveProfile" ADD CONSTRAINT "EmployeeSensitiveProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentProfile" ADD CONSTRAINT "EmploymentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContractProfile" ADD CONSTRAINT "EmploymentContractProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerRecord" ADD CONSTRAINT "CareerRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducationRecord" ADD CONSTRAINT "EducationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanguageSkill" ADD CONSTRAINT "LanguageSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRecord" ADD CONSTRAINT "CertificateRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSkillRecord" ADD CONSTRAINT "ProjectSkillRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfileChangeRequest" ADD CONSTRAINT "EmployeeProfileChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfileChangeRequest" ADD CONSTRAINT "EmployeeProfileChangeRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMemberDraft" ADD CONSTRAINT "FamilyMemberDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerRecordDraft" ADD CONSTRAINT "CareerRecordDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducationRecordDraft" ADD CONSTRAINT "EducationRecordDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanguageSkillDraft" ADD CONSTRAINT "LanguageSkillDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRecordDraft" ADD CONSTRAINT "CertificateRecordDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSkillRecordDraft" ADD CONSTRAINT "ProjectSkillRecordDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecordDraft" ADD CONSTRAINT "TrainingRecordDraft_prejoinProfileId_fkey" FOREIGN KEY ("prejoinProfileId") REFERENCES "EmployeePrejoinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
