import { createMyProfileChangeRequest, updateMyBasicProfile } from "@/app/(app)/profile/actions";
import { getPrisma } from "@/lib/db/prisma";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const actor = await requireRouteAccess("/profile/edit");
  const user = await getPrisma().user.findUnique({
    where: { id: actor.id },
    include: { profile: true, sensitiveProfile: true },
  });

  if (!user) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        요청한 정보를 찾을 수 없습니다.
      </section>
    );
  }

  return (
    <section className="max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-neutral-500">내 정보 수정</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          직접 수정 가능한 항목
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          회사 내 이름, 연락처, 주소 등은 직접 수정할 수 있습니다. 주민등록번호,
          급여계좌 등 민감정보는 관리자 확인 후 반영됩니다.
        </p>
      </div>

      <form
        action={updateMyBasicProfile}
        className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-2"
      >
        <label className="grid gap-1 text-sm">
          회사 내 이름
          <input
            name="displayName"
            defaultValue={user.profile?.displayName ?? ""}
            className="h-10 rounded-md border border-neutral-300 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          영문 이름
          <input
            name="englishName"
            defaultValue={user.profile?.englishName ?? ""}
            className="h-10 rounded-md border border-neutral-300 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          개인 이메일
          <input
            name="personalEmail"
            type="email"
            defaultValue={user.profile?.personalEmail ?? ""}
            className="h-10 rounded-md border border-neutral-300 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          휴대전화번호
          <input
            name="phoneNumber"
            defaultValue={user.profile?.phoneNumber ?? user.phone ?? ""}
            className="h-10 rounded-md border border-neutral-300 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          집주소
          <input
            name="address"
            defaultValue={user.profile?.address ?? ""}
            className="h-10 rounded-md border border-neutral-300 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          우편번호
          <input
            name="postalCode"
            defaultValue={user.profile?.postalCode ?? ""}
            className="h-10 rounded-md border border-neutral-300 px-3"
          />
        </label>
        <div className="md:col-span-2">
          <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            저장
          </button>
        </div>
      </form>

      <form
        action={createMyProfileChangeRequest}
        className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold">민감정보 변경 요청</h2>
          <p className="mt-1 text-sm text-neutral-600">
            이 정보는 회사 확인이 필요한 항목입니다. 수정 요청을 제출하면
            관리자가 검토합니다.
          </p>
        </div>
        <label className="grid gap-1 text-sm">
          요청 구분
          <select
            name="section"
            className="h-10 rounded-md border border-neutral-300 px-3"
            required
          >
            <option value="BANK">급여계좌</option>
            <option value="PRIVATE">개인 민감정보</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          주민등록번호/외국인등록번호
          <input name="residentId" className="h-10 rounded-md border border-neutral-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          은행명
          <input name="bankName" className="h-10 rounded-md border border-neutral-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          급여계좌
          <input name="bankAccount" className="h-10 rounded-md border border-neutral-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          예금주
          <input name="bankAccountHolder" className="h-10 rounded-md border border-neutral-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          요청 사유
          <textarea
            name="reason"
            rows={3}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <div className="md:col-span-2">
          <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            변경 요청 제출
          </button>
        </div>
      </form>
    </section>
  );
}
