import Link from "next/link";

import {
  createCompanyHoliday,
  deactivateCompanyHoliday,
  updateCompanyHoliday,
} from "@/app/(app)/admin/leaves/actions";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type HolidaysPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function CompanyHolidaysPage({
  searchParams,
}: HolidaysPageProps) {
  await requireOwner();
  const { error, success } = await searchParams;
  const holidays = await getPrisma().companyHoliday.findMany({
    orderBy: [{ isEnabled: "desc" }, { date: "asc" }],
  });

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            회사 휴일 관리
          </h1>
        </div>
        <Link href="/admin/leaves/settings" className="text-sm font-medium underline">
          휴가 정책으로 돌아가기
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          회사 휴일을 저장할 수 없습니다. 날짜 중복과 입력값을 확인해 주세요.
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          회사 휴일이 저장되었습니다.
        </p>
      ) : null}

      <form
        action={createCompanyHoliday}
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-4"
      >
        <input
          name="date"
          type="date"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="name"
          placeholder="휴일명"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <label className="flex h-10 items-center gap-2 text-sm">
          <input name="isPaidHoliday" type="checkbox" defaultChecked />
          유급 휴일
        </label>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          휴일 등록
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">날짜</th>
              <th className="px-4 py-3">휴일명</th>
              <th className="px-4 py-3">유급 여부</th>
              <th className="px-4 py-3">사용 여부</th>
              <th className="px-4 py-3">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {holidays.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                  등록된 회사 휴일이 없습니다.
                </td>
              </tr>
            ) : (
              holidays.map((holiday) => (
                <tr key={holiday.id} className="align-top">
                  <td className="px-4 py-3">{dateToDateOnly(holiday.date)}</td>
                  <td className="px-4 py-3 font-medium">{holiday.name}</td>
                  <td className="px-4 py-3">
                    {holiday.isPaidHoliday ? "유급" : "무급"}
                  </td>
                  <td className="px-4 py-3">
                    {holiday.isEnabled ? "사용" : "비활성"}
                  </td>
                  <td className="px-4 py-3">
                    <form action={updateCompanyHoliday} className="grid min-w-72 gap-2">
                      <input name="holidayId" type="hidden" value={holiday.id} />
                      <input
                        name="date"
                        type="date"
                        defaultValue={dateToDateOnly(holiday.date)}
                        className="h-9 rounded-md border px-2"
                        required
                      />
                      <input
                        name="name"
                        defaultValue={holiday.name}
                        className="h-9 rounded-md border px-2"
                        required
                      />
                      <label className="flex items-center gap-2">
                        <input
                          name="isPaidHoliday"
                          type="checkbox"
                          defaultChecked={holiday.isPaidHoliday}
                        />
                        유급 휴일
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          name="isEnabled"
                          type="checkbox"
                          defaultChecked={holiday.isEnabled}
                        />
                        사용
                      </label>
                      <div className="flex gap-2">
                        <button className="h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                          저장
                        </button>
                        {holiday.isEnabled ? (
                          <button
                            formAction={deactivateCompanyHoliday}
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700"
                          >
                            비활성화
                          </button>
                        ) : null}
                      </div>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
