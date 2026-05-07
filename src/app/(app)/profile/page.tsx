import Link from "next/link";

import { confirmMyProfile } from "@/app/(app)/profile/actions";
import { getPrisma } from "@/lib/db/prisma";
import { isPrismaSchemaPreparationError } from "@/lib/db/schema-errors";
import { decryptForMasking } from "@/lib/hr/profile-provisioning";
import { maskBankAccount, maskResidentId } from "@/lib/hr/sensitive";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

function formatDate(date?: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "-";
}

function value(value?: string | null) {
  return value && value.length > 0 ? value : "-";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-neutral-950">{children}</dd>
    </div>
  );
}

export default async function ProfilePage() {
  const actor = await requireRouteAccess("/profile");
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    include: {
      team: true,
      profile: true,
      sensitiveProfile: true,
      employmentProfile: true,
      familyMembers: true,
      careerRecords: true,
      educationRecords: true,
      languageSkills: true,
      certificateRecords: true,
      projectSkillRecords: true,
      trainingRecords: true,
    },
  });

  if (!user) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        요청한 정보를 찾을 수 없습니다.
      </section>
    );
  }

  const residentId = decryptForMasking(user.sensitiveProfile?.residentIdEncrypted);
  const bankAccount = decryptForMasking(
    user.sensitiveProfile?.bankAccountEncrypted,
  );
  const profileChangeRequests = await getRecentProfileChangeRequestsSafe(
    actor.id,
    prisma,
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">내 정보</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            인사정보 확인
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            초대 가입 시 등록된 인사정보를 확인하고, 수정 가능한 항목은 직접
            변경할 수 있습니다.
          </p>
        </div>
        <div className="grid gap-2 sm:flex">
          <Link
            href="/profile/calendar"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            외부 캘린더 연동
          </Link>
          <Link
            href="/profile/edit"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            내 정보 수정
          </Link>
        </div>
      </div>

      {!user.profile?.profileCompletedAt ? (
        <form
          action={confirmMyProfile}
          className="rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-medium text-amber-950">
            아직 인사정보 확인이 완료되지 않았습니다.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            내용을 확인한 뒤 확인 완료 버튼을 눌러 주세요. 민감정보 변경은
            관리자 검토 후 반영됩니다.
          </p>
          <button className="mt-3 h-9 rounded-md bg-amber-900 px-3 text-sm font-medium text-white">
            확인 완료
          </button>
        </form>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold">기본 정보</h2>
        <dl className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="이름">{value(user.profile?.legalName ?? user.name)}</Field>
          <Field label="회사 내 이름">{value(user.profile?.displayName)}</Field>
          <Field label="영문 이름">{value(user.profile?.englishName)}</Field>
          <Field label="회사 이메일">{value(user.email)}</Field>
          <Field label="개인 이메일">{value(user.profile?.personalEmail)}</Field>
          <Field label="휴대전화">{value(user.profile?.phoneNumber ?? user.phone)}</Field>
          <Field label="생년월일">{formatDate(user.profile?.birthDate ?? user.birthDate)}</Field>
          <Field label="주소">{value(user.profile?.address)}</Field>
          <Field label="우편번호">{value(user.profile?.postalCode)}</Field>
        </dl>
      </div>

      <div>
        <h2 className="text-lg font-semibold">인사 정보</h2>
        <dl className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="사번">{value(user.profile?.employeeNumber)}</Field>
          <Field label="소속 팀">{value(user.team?.name)}</Field>
          <Field label="직급/직책">
            {value(user.employmentProfile?.jobGrade ?? user.title)}
          </Field>
          <Field label="입사일">{formatDate(user.hireDate)}</Field>
          <Field label="조직">{value(user.employmentProfile?.organizationName)}</Field>
          <Field label="직위">{value(user.employmentProfile?.position)}</Field>
        </dl>
      </div>

      <div>
        <h2 className="text-lg font-semibold">민감정보</h2>
        <p className="mt-1 text-sm text-neutral-600">
          개인정보 보호를 위해 일부 항목은 마스킹되어 표시됩니다. 수정이
          필요한 경우 변경 요청을 제출해 주세요.
        </p>
        <dl className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="주민등록번호/외국인등록번호">
            {residentId ? maskResidentId(residentId) : "-"}
          </Field>
          <Field label="은행">{value(user.sensitiveProfile?.bankName)}</Field>
          <Field label="급여계좌">
            {bankAccount ? maskBankAccount(bankAccount) : "-"}
          </Field>
        </dl>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-lg font-semibold">경력</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {user.careerRecords.length === 0 ? (
              <li className="text-neutral-500">등록된 경력이 없습니다.</li>
            ) : (
              user.careerRecords.map((record) => (
                <li key={record.id}>
                  {record.companyName} {record.job ? `- ${record.job}` : ""}
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-lg font-semibold">학력/자격</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {user.educationRecords.length === 0 &&
            user.certificateRecords.length === 0 ? (
              <li className="text-neutral-500">등록된 학력/자격 정보가 없습니다.</li>
            ) : (
              <>
                {user.educationRecords.map((record) => (
                  <li key={record.id}>{value(record.schoolName)}</li>
                ))}
                {user.certificateRecords.map((record) => (
                  <li key={record.id}>{record.name}</li>
                ))}
              </>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">최근 수정 요청</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {profileChangeRequests.length === 0 ? (
            <li className="text-neutral-500">등록된 수정 요청이 없습니다.</li>
          ) : (
            profileChangeRequests.map((request) => (
              <li key={request.id} className="flex justify-between gap-4">
                <span>
                  {request.section} / {request.status}
                </span>
                <span className="text-neutral-500">
                  {formatDate(request.requestedAt)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
}

async function getRecentProfileChangeRequestsSafe(
  userId: string,
  prisma: ReturnType<typeof getPrisma>,
) {
  try {
    return await prisma.employeeProfileChangeRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      take: 5,
    });
  } catch (error) {
    if (
      isPrismaSchemaPreparationError(error, [
        "EmployeeProfileChangeRequest",
        "employee_profile_change_request",
      ])
    ) {
      return [];
    }

    throw error;
  }
}
