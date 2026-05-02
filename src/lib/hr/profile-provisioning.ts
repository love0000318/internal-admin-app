import type { Prisma } from "@/generated/prisma/client";
import { decryptSensitiveText, encryptSensitiveText } from "@/lib/hr/sensitive";

type Tx = Prisma.TransactionClient;

export async function createEmployeeProfilesFromPrejoin({
  tx,
  userId,
  prejoinProfileId,
}: {
  tx: Tx;
  userId: string;
  prejoinProfileId?: string | null;
}) {
  const prejoin = prejoinProfileId
    ? await tx.employeePrejoinProfile.findUnique({
        where: { id: prejoinProfileId },
        include: {
          families: true,
          careers: true,
          educations: true,
          languages: true,
          certificates: true,
          projectSkills: true,
          trainings: true,
        },
      })
    : null;

  if (!prejoin) {
    return;
  }

  await tx.employeeProfile.upsert({
    where: { userId },
    create: {
      userId,
      employeeNumber: prejoin.employeeNumber,
      legalName: prejoin.legalName,
      displayName: prejoin.displayName,
      englishName: prejoin.englishName,
      birthDate: prejoin.birthDate,
      birthday: prejoin.birthDate,
      legalGender: prejoin.legalGender,
      personalEmail: prejoin.personalEmail,
      phoneCountryCode: prejoin.phoneCountryCode,
      phoneNumber: prejoin.phoneNumber,
      nationalityCode: prejoin.nationalityCode,
      residenceCountry: prejoin.residenceCountry,
      visaStatus: prejoin.visaStatus,
      address: prejoin.address,
      postalCode: prejoin.postalCode,
      jobTitle: prejoin.title ?? prejoin.jobGrade,
      hireDate: prejoin.hireDate,
    },
    update: {
      employeeNumber: prejoin.employeeNumber,
      legalName: prejoin.legalName,
      displayName: prejoin.displayName,
      englishName: prejoin.englishName,
      birthDate: prejoin.birthDate,
      birthday: prejoin.birthDate,
      legalGender: prejoin.legalGender,
      personalEmail: prejoin.personalEmail,
      phoneCountryCode: prejoin.phoneCountryCode,
      phoneNumber: prejoin.phoneNumber,
      nationalityCode: prejoin.nationalityCode,
      residenceCountry: prejoin.residenceCountry,
      visaStatus: prejoin.visaStatus,
      address: prejoin.address,
      postalCode: prejoin.postalCode,
      jobTitle: prejoin.title ?? prejoin.jobGrade,
      hireDate: prejoin.hireDate,
    },
  });

  await tx.employeeSensitiveProfile.upsert({
    where: { userId },
    create: {
      userId,
      residentIdEncrypted: prejoin.residentIdEncrypted,
      bankCode: prejoin.bankCode,
      bankName: prejoin.bankName,
      bankAccountEncrypted: prejoin.bankAccountEncrypted,
      bankAccountHolder: prejoin.bankAccountHolder,
      swiftCode: prejoin.swiftCode,
      veteranOrDisabledStatus: prejoin.veteranOrDisabledStatus,
      disabilityGrade: prejoin.disabilityGrade,
    },
    update: {
      residentIdEncrypted: prejoin.residentIdEncrypted,
      bankCode: prejoin.bankCode,
      bankName: prejoin.bankName,
      bankAccountEncrypted: prejoin.bankAccountEncrypted,
      bankAccountHolder: prejoin.bankAccountHolder,
      swiftCode: prejoin.swiftCode,
      veteranOrDisabledStatus: prejoin.veteranOrDisabledStatus,
      disabilityGrade: prejoin.disabilityGrade,
    },
  });

  await tx.employmentProfile.upsert({
    where: { userId },
    create: {
      userId,
      hireDate: prejoin.hireDate,
      groupHireDate: prejoin.groupHireDate,
      organizationName: prejoin.teamName,
      organizationCode: prejoin.teamCode,
      jobTitle: prejoin.title,
      position: prejoin.position,
      jobGrade: prejoin.jobGrade,
    },
    update: {
      hireDate: prejoin.hireDate,
      groupHireDate: prejoin.groupHireDate,
      organizationName: prejoin.teamName,
      organizationCode: prejoin.teamCode,
      jobTitle: prejoin.title,
      position: prejoin.position,
      jobGrade: prejoin.jobGrade,
    },
  });

  if (prejoin.families.length > 0) {
    await tx.familyMember.createMany({
      data: prejoin.families.map((family) => ({
        userId,
        name: family.name,
        relationship: family.relationship,
        phoneNumber: family.phoneNumber,
        residentIdEncrypted: family.residentIdEncrypted,
      })),
    });
  }

  if (prejoin.careers.length > 0) {
    await tx.careerRecord.createMany({
      data: prejoin.careers.map((career) => ({
        userId,
        companyName: career.companyName,
        contractType: career.contractType,
        joinedMonth: career.joinedMonth,
        leftMonth: career.leftMonth,
        job: career.job,
        organization: career.organization,
        position: career.position,
        title: career.title,
      })),
    });
  }

  if (prejoin.educations.length > 0) {
    await tx.educationRecord.createMany({
      data: prejoin.educations.map((education) => ({
        userId,
        schoolType: education.schoolType,
        schoolName: education.schoolName,
        graduationStatus: education.graduationStatus,
        major: education.major,
        entranceMonth: education.entranceMonth,
        graduationMonth: education.graduationMonth,
      })),
    });
  }

  if (prejoin.languages.length > 0) {
    await tx.languageSkill.createMany({
      data: prejoin.languages.map((language) => ({
        userId,
        language: language.language,
        level: language.level,
      })),
    });
  }

  if (prejoin.certificates.length > 0) {
    await tx.certificateRecord.createMany({
      data: prejoin.certificates.map((certificate) => ({
        userId,
        name: certificate.name,
        gradeOrScore: certificate.gradeOrScore,
        acquiredAt: certificate.acquiredAt,
        issuer: certificate.issuer,
        validUntil: certificate.validUntil,
        certificateNumber: certificate.certificateNumber,
      })),
    });
  }

  if (prejoin.projectSkills.length > 0) {
    await tx.projectSkillRecord.createMany({
      data: prejoin.projectSkills.map((project) => ({
        userId,
        title: project.title,
        content: project.content,
        period: project.period,
        project: project.project,
        skills: project.skills,
      })),
    });
  }

  if (prejoin.trainings.length > 0) {
    await tx.trainingRecord.createMany({
      data: prejoin.trainings.map((training) => ({
        userId,
        name: training.name,
        trainingDate: training.trainingDate,
        type: training.type,
        institution: training.institution,
        category: training.category,
        totalHours: training.totalHours,
      })),
    });
  }

  await tx.employeePrejoinProfile.update({
    where: { id: prejoin.id },
    data: {
      sourceStatus: "CLAIMED",
      linkedUserId: userId,
    },
  });
}

export function sensitiveUpdatePayload(input: {
  residentId?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  bankAccountHolder?: string | null;
}) {
  return {
    ...(input.residentId !== undefined
      ? { residentIdEncrypted: encryptSensitiveText(input.residentId) }
      : {}),
    ...(input.bankAccount !== undefined
      ? { bankAccountEncrypted: encryptSensitiveText(input.bankAccount) }
      : {}),
    ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
    ...(input.bankAccountHolder !== undefined
      ? { bankAccountHolder: input.bankAccountHolder }
      : {}),
  };
}

export function decryptForMasking(value: string | null | undefined) {
  try {
    return decryptSensitiveText(value);
  } catch {
    return null;
  }
}
