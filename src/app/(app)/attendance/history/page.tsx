import { createAttendanceChangeRequestAction } from "@/app/(app)/attendance/history/actions";
import { redirect } from "next/navigation";
import { getMonthDateRange } from "@/lib/attendance/monthly-summary";
import { getPrisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type AttendanceHistoryPageProps = {
  searchParams: Promise<{ year?: string; month?: string; error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "입력값을 확인해 주세요.",
  "month-closed": "이미 마감된 월입니다. 관리자에게 문의해 주세요.",
};

export default async function AttendanceHistoryPage({
  searchParams,
}: AttendanceHistoryPageProps) {
  const actor = await requireUser();
  if (actor.role === "EXTERNAL_PARTNER") {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const now = new Date();
  const year = Number.parseInt(params.year ?? `${now.getUTCFullYear()}`, 10);
  const month = Number.parseInt(params.month ?? `${now.getUTCMonth() + 1}`, 10);
  const { start, end } = getMonthDateRange(year, month);
  const prisma = getPrisma();
  const [records, requests, close] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { userId: actor.id, workDate: { gte: start, lte: end } },
      orderBy: { workDate: "desc" },
    }),
    prisma.attendanceChangeRequest.findMany({
      where: { userId: actor.id, workDate: { gte: start, lte: end } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attendanceMonthlyClose.findUnique({
      where: { year_month: { year, month } },
    }),
  ]);
  const isClosed = close?.status === "CLOSED";

  return (
    <section className="min-w-0">
      <p className="text-sm font-medium text-neutral-500">근태</p>
      <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">
        내 근태 이력
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        월별 근태 기록과 수정 요청 상태를 확인합니다.
      </p>

      {params.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessages[params.error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          수정 요청이 등록되었습니다.
        </p>
      ) : null}

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <input
          name="year"
          type="number"
          defaultValue={year}
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        />
        <input
          name="month"
          type="number"
          min={1}
          max={12}
          defaultValue={month}
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        />
        <button className="min-h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">월 마감 상태</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {year}년 {month}월:{" "}
              {isClosed ? "마감 완료" : close?.status === "REOPENED" ? "재오픈됨" : "마감 전"}
            </p>
          </div>
          {isClosed ? (
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
              수정 요청 비활성화
            </span>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">수정 요청</h2>
        {isClosed ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            이미 마감된 월입니다. 관리자에게 문의해 주세요.
          </p>
        ) : (
          <form action={createAttendanceChangeRequestAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              name="workDate"
              type="date"
              className="h-10 w-full rounded-md border px-3 text-sm"
              required
            />
            <input
              name="requestedCheckInAt"
              type="datetime-local"
              className="h-10 w-full rounded-md border px-3 text-sm"
            />
            <input
              name="requestedCheckOutAt"
              type="datetime-local"
              className="h-10 w-full rounded-md border px-3 text-sm"
            />
            <input
              name="reason"
              placeholder="수정 사유"
              className="h-10 w-full rounded-md border px-3 text-sm"
              required
            />
            <button className="min-h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white sm:col-span-2">
              수정 요청 등록
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-4">
          <h2 className="text-lg font-semibold">근태 기록</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">일자</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">출근</th>
                <th className="px-4 py-3">퇴근</th>
                <th className="px-4 py-3">근무분</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {records.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                    기록이 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3">{record.workDate.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3">{record.status}</td>
                    <td className="px-4 py-3">{formatTime(record.checkInAt)}</td>
                    <td className="px-4 py-3">{formatTime(record.checkOutAt)}</td>
                    <td className="px-4 py-3">{record.workedMinutes ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">수정 요청 내역</h2>
        <ul className="mt-4 divide-y divide-neutral-100 text-sm">
          {requests.length === 0 ? (
            <li className="py-3 text-neutral-500">수정 요청이 없습니다.</li>
          ) : (
            requests.map((request) => (
              <li key={request.id} className="py-3">
                <p className="font-medium">
                  {request.workDate.toISOString().slice(0, 10)} · {request.status}
                </p>
                <p className="mt-1 break-words text-neutral-600">{request.reason ?? "-"}</p>
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
}

function formatTime(value: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
}
