import { notFound } from "next/navigation";

import {
  deactivateEmployee,
  updateEmployeeProfile,
} from "@/app/(app)/organization/actions";
import { RoleLabel, UserStatusBadge } from "@/components/ui/status-badge";
import { roleLabel, userStatusLabel } from "@/lib/display/labels";
import {
  dateOnlyFromDate,
  toDateInputValue,
  toDisplayDate,
} from "@/lib/organization/format";
import { calculateTenureDays, formatTenureDays } from "@/lib/organization/tenure";
import { getPrisma } from "@/lib/db/prisma";
import { decryptForMasking } from "@/lib/hr/profile-provisioning";
import { maskBankAccount, maskResidentId } from "@/lib/hr/sensitive";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type EmployeeDetailPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  await requireOwner();
  const { userId } = await params;
  const { error, success } = await searchParams;
  const prisma = getPrisma();
  const [user, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
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
    }),
    prisma.team.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!user) {
    notFound();
  }

  const hireDate = user.hireDate ?? user.profile?.hireDate ?? null;
  const birthDate = user.birthDate ?? user.profile?.birthday ?? null;
  const hireDateOnly = dateOnlyFromDate(hireDate);
  const residentId = decryptForMasking(user.sensitiveProfile?.residentIdEncrypted);
  const bankAccount = decryptForMasking(
    user.sensitiveProfile?.bankAccountEncrypted,
  );

  return (
    <section>
      <p className="text-sm font-medium text-neutral-500">직원 상세</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">{user.name}</h1>
      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "forbidden-change"
            ? "자기 자신 또는 마지막 OWNER 보호 규칙 때문에 변경할 수 없습니다."
            : error === "future-birth-date"
              ? "생일은 미래 날짜로 입력할 수 없습니다."
            : "직원 정보를 저장할 수 없습니다."}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          직원 정보가 저장되었습니다.
        </p>
      ) : null}

      <dl className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm shadow-sm md:grid-cols-3">
        <div>
          <dt className="text-neutral-500">이메일</dt>
          <dd className="mt-1 font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">전화번호</dt>
          <dd className="mt-1 font-medium">{user.phone ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">직급</dt>
          <dd className="mt-1 font-medium">{user.title ?? user.profile?.jobTitle ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">역할</dt>
          <dd className="mt-1 font-medium"><RoleLabel role={user.role} /></dd>
        </div>
        <div>
          <dt className="text-neutral-500">상태</dt>
          <dd className="mt-1 font-medium"><UserStatusBadge status={user.status} /></dd>
        </div>
        <div>
          <dt className="text-neutral-500">소속 팀</dt>
          <dd className="mt-1 font-medium">{user.team?.name ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">입사일</dt>
          <dd className="mt-1 font-medium">{toDisplayDate(hireDate)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">재직일</dt>
          <dd className="mt-1 font-medium">
            {formatTenureDays(calculateTenureDays(hireDateOnly))}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">생일</dt>
          <dd className="mt-1 font-medium">{toDisplayDate(birthDate)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">생성일</dt>
          <dd className="mt-1 font-medium">{toDisplayDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">최근 수정일</dt>
          <dd className="mt-1 font-medium">{toDisplayDate(user.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">인사정보</h2>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-neutral-500">사번</dt>
              <dd className="mt-1 font-medium">{user.profile?.employeeNumber ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">조직</dt>
              <dd className="mt-1 font-medium">
                {user.employmentProfile?.organizationName ?? user.team?.name ?? "-"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">직위</dt>
              <dd className="mt-1 font-medium">{user.employmentProfile?.position ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">직급</dt>
              <dd className="mt-1 font-medium">{user.employmentProfile?.jobGrade ?? user.title ?? "-"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">민감정보</h2>
          <p className="mt-1 text-sm text-neutral-600">
            기본적으로 마스킹되어 표시됩니다. 전체값 조회는 별도 승인 절차로
            분리할 예정입니다.
          </p>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-neutral-500">주민등록번호/외국인등록번호</dt>
              <dd className="mt-1 font-medium">
                {residentId ? maskResidentId(residentId) : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">급여계좌</dt>
              <dd className="mt-1 font-medium">
                {bankAccount ? maskBankAccount(bankAccount) : "-"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">경력/학력/역량 요약</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-neutral-500">가족</dt><dd className="font-medium">{user.familyMembers.length}건</dd></div>
          <div><dt className="text-neutral-500">경력</dt><dd className="font-medium">{user.careerRecords.length}건</dd></div>
          <div><dt className="text-neutral-500">학력</dt><dd className="font-medium">{user.educationRecords.length}건</dd></div>
          <div><dt className="text-neutral-500">자격/교육</dt><dd className="font-medium">{user.certificateRecords.length + user.trainingRecords.length}건</dd></div>
        </dl>
      </section>

      <form
        action={updateEmployeeProfile}
        className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-2"
      >
        <input name="userId" type="hidden" value={user.id} />
        <label className="grid gap-1 text-sm font-medium">
          이름
          <input
            name="name"
            defaultValue={user.name}
            className="h-10 rounded-md border px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          직급
          <input
            name="title"
            defaultValue={user.title ?? user.profile?.jobTitle ?? ""}
            className="h-10 rounded-md border px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          역할
          <select name="role" defaultValue={user.role} className="h-10 rounded-md border px-3 text-sm">
            <option value="OWNER">{roleLabel("OWNER")}</option>
            <option value="LEAD">{roleLabel("LEAD")}</option>
            <option value="MANAGER">{roleLabel("MANAGER")}</option>
            <option value="EXTERNAL_PARTNER">{roleLabel("EXTERNAL_PARTNER")}</option>
          </select>
          <span className="text-xs font-normal text-neutral-500">
            TODO: OWNER 부여는 별도 승인 절차로 분리 예정
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          상태
          <select name="status" defaultValue={user.status} className="h-10 rounded-md border px-3 text-sm">
            <option value="INVITED">{userStatusLabel("INVITED")}</option>
            <option value="ACTIVE">{userStatusLabel("ACTIVE")}</option>
            <option value="SUSPENDED">{userStatusLabel("SUSPENDED")}</option>
            <option value="DEACTIVATED">{userStatusLabel("DEACTIVATED")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          소속 팀
          <select name="teamId" defaultValue={user.teamId ?? ""} className="h-10 rounded-md border px-3 text-sm">
            <option value="">소속 팀 없음</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          입사일
          <input
            name="hireDate"
            type="date"
            defaultValue={toDateInputValue(hireDate)}
            className="h-10 rounded-md border px-3 text-sm"
          />
          <span className="text-xs font-normal text-neutral-500">
            TODO: 미래 입사일 입력 시 경고 정책 추가
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          생일
          <input
            name="birthDate"
            type="date"
            defaultValue={toDateInputValue(birthDate)}
            max={new Date().toISOString().slice(0, 10)}
            className="h-10 rounded-md border px-3 text-sm"
          />
        </label>
        <section className="rounded-lg border border-red-100 bg-red-50 p-4 md:col-span-2">
          <h2 className="text-sm font-semibold text-red-900">고위험 변경 재인증</h2>
          <p className="mt-1 text-sm leading-relaxed text-red-700">
            역할 변경, OWNER 권한 부여/해제, 직원 비활성화는 현재 OWNER의 비밀번호를 다시 입력해야 저장됩니다.
            일반 정보만 수정하는 경우 비워 둘 수 있습니다.
          </p>
          <label className="mt-3 grid gap-1 text-sm font-medium text-red-900">
            현재 비밀번호
            <input
              name="stepUpPassword"
              type="password"
              autoComplete="current-password"
              className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm text-neutral-900"
            />
          </label>
        </section>
        <div className="flex items-end gap-2 md:col-span-2">
          <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            저장
          </button>
          {user.status !== "DEACTIVATED" ? (
            <button
              formAction={deactivateEmployee}
              className="h-10 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700"
            >
              직원 비활성화
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
